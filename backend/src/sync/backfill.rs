use crate::db::{DbPool, repository::Repository};
use crate::sec::SecClient;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;

static IS_RUNNING: AtomicBool = AtomicBool::new(false);
static SHOULD_RUN: AtomicBool = AtomicBool::new(true);

static CURRENT_FUND_INFO: LazyLock<Arc<Mutex<Option<(String, Option<String>)>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(None)));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailedFundSample {
    pub proj_id: String,
    pub proj_abbr_name: Option<String>,
    pub error_log: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackfillStatus {
    pub is_running: bool,
    pub total_funds: i64,
    pub completed_funds: i64,
    pub pending_funds: i64,
    pub failed_funds: i64,
    pub current_proj_id: Option<String>,
    pub current_proj_abbr: Option<String>,
    pub percent_completed: f64,
    pub last_updated_at: Option<String>,
    pub last_error: Option<String>,
    pub failed_samples: Vec<FailedFundSample>,
}

pub struct BackfillService;

impl BackfillService {
    /// เริ่มต้น Background Worker สำหรับทยอยดึงประวัติราคา NAV ย้อนหลังอัตโนมัติ
    pub fn start_background_worker(pool: DbPool, api_key: String) {
        tokio::spawn(async move {
            tracing::info!("[Historical NAV Backfill] Initializing background backfill engine...");

            // รอ 15 วินาทีหลังจากระบบ Boot ให้ระบบอื่นพร้อมก่อน
            sleep(Duration::from_secs(15)).await;

            let mut client = SecClient::new(api_key.clone());

            loop {
                // ตรวจสอบว่าเปิดการทำงานหรือไม่
                if !SHOULD_RUN.load(Ordering::Relaxed) {
                    IS_RUNNING.store(false, Ordering::Relaxed);
                    let mut lock = CURRENT_FUND_INFO.lock().await;
                    *lock = None;
                    sleep(Duration::from_secs(3)).await;
                    continue;
                }

                if api_key.is_empty() || api_key == "your_sec_subscription_key_here" {
                    IS_RUNNING.store(false, Ordering::Relaxed);
                    tracing::warn!("[Historical NAV Backfill] SEC_API_KEY is unset or default. Backfill paused.");
                    sleep(Duration::from_secs(60)).await;
                    continue;
                }

                // ค้นหากองทุนถัดไป: จัดลำดับให้ PENDING มาก่อน FAILED เสมอ เพื่อไม่ให้กองทุนที่ติด Error วนลูปขัดขวางคิวอื่น
                let next_target = sqlx::query_as::<_, (String, Option<String>)>(
                    r#"
                    SELECT proj_id, proj_abbr_name
                    FROM nav_backfill_progress
                    WHERE status IN ('PENDING', 'FAILED')
                    ORDER BY 
                        CASE status WHEN 'PENDING' THEN 0 ELSE 1 END ASC,
                        priority ASC, 
                        updated_at ASC, 
                        proj_id ASC
                    LIMIT 1
                    "#,
                )
                .fetch_optional(&pool)
                .await;

                match next_target {
                    Ok(Some((proj_id, proj_abbr))) => {
                        IS_RUNNING.store(true, Ordering::Relaxed);
                        {
                            let mut lock = CURRENT_FUND_INFO.lock().await;
                            *lock = Some((proj_id.clone(), proj_abbr.clone()));
                        }

                        // อัปเดตสถานะเป็น IN_PROGRESS
                        let _ = sqlx::query(
                            r#"
                            UPDATE nav_backfill_progress
                            SET status = 'IN_PROGRESS', last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                            WHERE proj_id = ?1
                            "#,
                        )
                        .bind(&proj_id)
                        .execute(&pool)
                        .await;

                        tracing::info!(
                            "[Historical NAV Backfill] Fetching historical NAV for {} (abbr: {:?})...",
                            proj_id, proj_abbr
                        );

                        match client.get_fund_nav_history(&proj_id).await {
                            Ok(items) => {
                                let count = items.len() as i64;
                                let min_date = items.first().map(|it| it.nav_date.clone());
                                let max_date = items.last().map(|it| it.nav_date.clone());

                                if !items.is_empty() {
                                    if let Err(e) = Repository::upsert_nav_history(&pool, &proj_id, &items).await {
                                        tracing::error!("[Historical NAV Backfill] Error saving NAV for {}: {}", proj_id, e);
                                    }

                                    // ถ้ามี proj_abbr_name และไม่ตรงกับ proj_id ให้บันทึกคู่ขนานด้วย
                                    if let Some(ref abbr) = proj_abbr {
                                        if abbr != &proj_id {
                                            let _ = Repository::upsert_nav_history(&pool, abbr, &items).await;
                                        }
                                    }
                                }

                                let _ = sqlx::query(
                                    r#"
                                    UPDATE nav_backfill_progress
                                    SET status = 'COMPLETED',
                                        records_count = ?2,
                                        min_nav_date = ?3,
                                        max_nav_date = ?4,
                                        error_log = NULL,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE proj_id = ?1
                                    "#,
                                )
                                .bind(&proj_id)
                                .bind(count)
                                .bind(min_date)
                                .bind(max_date)
                                .execute(&pool)
                                .await;

                                tracing::info!(
                                    "[Historical NAV Backfill] [✓] Successfully backfilled {} records for {} ({:?})",
                                    count, proj_id, proj_abbr
                                );
                            }
                            Err(e) => {
                                let mut err_str = e.to_string();
                                let mut curr_err: Option<&(dyn std::error::Error + 'static)> = e.source();
                                while let Some(src) = curr_err {
                                    err_str.push_str(&format!(" -> {}", src));
                                    curr_err = src.source();
                                }
                                tracing::warn!(
                                    "[Historical NAV Backfill] [!] Failed to backfill for {}: {}",
                                    proj_id, err_str
                                );

                                // ส่งการแจ้งเตือนไปยัง Sentry หากติด Rate Limit 429 หรือ Network/Server Error
                                if err_str.contains("429") || err_str.contains("500") || err_str.contains("502") || err_str.contains("503") || err_str.contains("timeout") {
                                    sentry::with_scope(
                                        |scope| {
                                            scope.set_tag("service", "nav-backfill");
                                            scope.set_tag("proj_id", &proj_id);
                                            if let Some(ref abbr) = proj_abbr {
                                                scope.set_tag("proj_abbr", abbr);
                                            }
                                            scope.set_extra("error_details", err_str.clone().into());
                                        },
                                        || {
                                            sentry::capture_message(
                                                &format!("[NAV Backfill Error] Fund {}: {}", proj_id, err_str),
                                                sentry::Level::Error,
                                            );
                                        },
                                    );
                                }

                                let _ = sqlx::query(
                                    r#"
                                    UPDATE nav_backfill_progress
                                    SET status = 'FAILED', error_log = ?2, updated_at = CURRENT_TIMESTAMP
                                    WHERE proj_id = ?1
                                    "#,
                                )
                                .bind(&proj_id)
                                .bind(&err_str)
                                .execute(&pool)
                                .await;

                                // หากติด 429 Too Many Requests ให้หน่วงเวลานานขึ้นเป็นพิเศษ
                                if err_str.contains("429") {
                                    tracing::warn!("[Historical NAV Backfill] Rate limit encountered. Backing off 15s...");
                                    sleep(Duration::from_secs(15)).await;
                                }
                            }
                        }

                        // Adaptive Pacing: หน่วงเวลา 2.5 วินาทีต่อกองทุน เพื่อปฏิบัติตามเกณฑ์ Rate Limit ของ ก.ล.ต.
                        sleep(Duration::from_millis(2500)).await;
                    }
                    Ok(None) => {
                        // ดึงครบหมดทุกกองทุนแล้ว
                        IS_RUNNING.store(false, Ordering::Relaxed);
                        {
                            let mut lock = CURRENT_FUND_INFO.lock().await;
                            *lock = None;
                        }
                        tracing::info!("[Historical NAV Backfill] All registered funds backfilled successfully! Sleeping for 1 hour...");
                        sleep(Duration::from_secs(3600)).await;
                    }
                    Err(e) => {
                        tracing::error!("[Historical NAV Backfill] Database query error: {}", e);
                        sleep(Duration::from_secs(10)).await;
                    }
                }
            }
        });
    }

    /// ตรวจสอบสถานะความคืบหน้าของการ Backfill
    pub async fn get_status(pool: &DbPool) -> Result<BackfillStatus, Box<dyn std::error::Error + Send + Sync>> {
        let is_running = IS_RUNNING.load(Ordering::Relaxed);

        let total_funds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nav_backfill_progress")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let completed_funds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nav_backfill_progress WHERE status = 'COMPLETED'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let failed_funds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nav_backfill_progress WHERE status = 'FAILED'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let pending_funds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nav_backfill_progress WHERE status IN ('PENDING', 'IN_PROGRESS')")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let last_updated_at: Option<String> = sqlx::query_scalar("SELECT MAX(updated_at) FROM nav_backfill_progress")
            .fetch_one(pool)
            .await
            .unwrap_or(None);

        let percent = if total_funds > 0 {
            (completed_funds as f64 / total_funds as f64) * 100.0
        } else {
            0.0
        };

        let last_error: Option<String> = sqlx::query_scalar(
            "SELECT error_log FROM nav_backfill_progress WHERE status = 'FAILED' AND error_log IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
        )
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        let failed_samples: Vec<FailedFundSample> = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
            "SELECT proj_id, proj_abbr_name, error_log FROM nav_backfill_progress WHERE status = 'FAILED' AND error_log IS NOT NULL ORDER BY updated_at DESC LIMIT 5"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(proj_id, proj_abbr_name, error_log)| FailedFundSample {
            proj_id,
            proj_abbr_name,
            error_log,
        })
        .collect();

        let current_lock = CURRENT_FUND_INFO.lock().await;
        let (current_proj_id, current_proj_abbr) = match &*current_lock {
            Some((pid, abbr)) => (Some(pid.clone()), abbr.clone()),
            None => (None, None),
        };

        Ok(BackfillStatus {
            is_running,
            total_funds,
            completed_funds,
            pending_funds,
            failed_funds,
            current_proj_id,
            current_proj_abbr,
            percent_completed: (percent * 100.0).round() / 100.0,
            last_updated_at,
            last_error,
            failed_samples,
        })
    }

    /// สั่งให้ระบบเริ่มหรือกลับมาทำงานต่อ
    pub fn resume() {
        SHOULD_RUN.store(true, Ordering::Relaxed);
    }

    /// สั่งพักการทำงานชั่วคราว
    pub fn pause() {
        SHOULD_RUN.store(false, Ordering::Relaxed);
        IS_RUNNING.store(false, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn test_backfill_status_with_in_memory_db() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS nav_backfill_progress (
                proj_id TEXT PRIMARY KEY,
                proj_abbr_name TEXT,
                priority INTEGER NOT NULL DEFAULT 2,
                status TEXT NOT NULL DEFAULT 'PENDING',
                records_count INTEGER DEFAULT 0,
                min_nav_date TEXT,
                max_nav_date TEXT,
                last_attempt_at DATETIME,
                error_log TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert test records: 2 COMPLETED, 1 PENDING, 1 FAILED
        sqlx::query("INSERT INTO nav_backfill_progress (proj_id, status, records_count) VALUES ('P1', 'COMPLETED', 100), ('P2', 'COMPLETED', 200), ('P3', 'PENDING', 0), ('P4', 'FAILED', 0)")
            .execute(&pool)
            .await
            .unwrap();

        let status = BackfillService::get_status(&pool).await.unwrap();
        assert_eq!(status.total_funds, 4);
        assert_eq!(status.completed_funds, 2);
        assert_eq!(status.pending_funds, 1);
        assert_eq!(status.failed_funds, 1);
        assert_eq!(status.percent_completed, 50.0);
    }

    #[test]
    fn test_pause_and_resume_controls() {
        BackfillService::pause();
        assert_eq!(SHOULD_RUN.load(Ordering::Relaxed), false);
        assert_eq!(IS_RUNNING.load(Ordering::Relaxed), false);

        BackfillService::resume();
        assert_eq!(SHOULD_RUN.load(Ordering::Relaxed), true);
    }
}
