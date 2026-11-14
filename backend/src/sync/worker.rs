use crate::db::{DbPool, repository::Repository};
use crate::sec::SecClient;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub struct SyncService;

impl SyncService {
    /// ทำการ Sync ราคา NAV ล่าสุดของกองทุนที่มีการถือครองในพอร์ต
    pub async fn sync_held_funds(
        pool: &DbPool,
        api_key: &str,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        if api_key.is_empty() || api_key == "your_sec_subscription_key_here" {
            return Ok(0);
        }

        let held_ids = Repository::get_unique_held_fund_ids(pool).await?;
        if held_ids.is_empty() {
            return Ok(0);
        }

        println!(
            "[Background Sync] Found {} active funds in portfolio to update NAV...",
            held_ids.len()
        );
        let mut client = SecClient::new(api_key.to_string());
        let mut updated_count = 0;

        for held_id in &held_ids {
            // ทำความสะอาดชื่อเพื่อเพิ่มความแม่นยำในการค้นหา (เช่น ตัด (Accumulation), Fund ออก)
            let clean_name = held_id
                .replace("(Accumulation)", "")
                .replace("Fund", "")
                .trim()
                .to_string();
            let clean_pattern = format!("%{}%", clean_name.to_lowercase());

            // ค้นหา SEC proj_id จากฐานข้อมูลกองทุน (ถ้า held_id เป็นชื่อย่อหรือชื่อเต็ม)
            let sec_proj_id = sqlx::query_scalar::<_, String>(
                r#"
                SELECT proj_id FROM funds 
                WHERE proj_id = ?1 
                   OR LOWER(proj_abbr_name) = LOWER(?1) 
                   OR LOWER(proj_name_en) = LOWER(?1) 
                   OR LOWER(proj_name_th) = LOWER(?1)
                   OR LOWER(proj_name_en) LIKE ?2
                   OR LOWER(proj_abbr_name) LIKE ?2
                ORDER BY 
                    CASE WHEN fund_status = 'Registered' THEN 1 ELSE 2 END,
                    CASE WHEN proj_abbr_name LIKE 'ES-%' THEN 1 ELSE 2 END
                LIMIT 1
                "#,
            )
            .bind(held_id)
            .bind(&clean_pattern)
            .fetch_optional(pool)
            .await
            .unwrap_or(None)
            .unwrap_or_else(|| held_id.clone());

            match client.get_fund_nav_history(&sec_proj_id).await {
                Ok(items) if !items.is_empty() => {
                    Repository::upsert_nav_history(pool, &sec_proj_id, &items).await?;
                    if sec_proj_id != *held_id {
                        let _ = Repository::upsert_nav_history(pool, held_id, &items).await;
                    }
                    updated_count += 1;
                    println!(
                        "[Background Sync] Updated NAV for fund {} (SEC: {}): {} records",
                        held_id,
                        sec_proj_id,
                        items.len()
                    );
                }
                Ok(_) => {
                    println!(
                        "[Background Sync] No new NAV records returned for {} (SEC: {})",
                        held_id, sec_proj_id
                    );
                }
                Err(e) => {
                    eprintln!(
                        "[Background Sync Error] Failed to fetch NAV for {} (SEC: {}): {}",
                        held_id, sec_proj_id, e
                    );
                }
            }
        }

        Ok(updated_count)
    }

    /// สตาร์ท Background Worker ให้ทำงานวนลูปทุก 4 ชั่วโมง
    pub fn start_background_worker(pool: Arc<DbPool>, api_key: String) {
        tokio::spawn(async move {
            println!("[Background Worker] Started NAV sync scheduler (every 4 hours).");
            loop {
                // รอ 10 วินาทีหลังสตาร์ทเครื่อง แล้วรันรอบแรก
                sleep(Duration::from_secs(10)).await;

                println!("[Background Worker] Triggering periodic NAV sync...");
                if let Err(e) = Self::sync_held_funds(&pool, &api_key).await {
                    eprintln!("[Background Worker Error] {}", e);
                }

                // หน่วงเวลา 4 ชั่วโมงสำหรับรอบถัดไป
                sleep(Duration::from_secs(4 * 3600)).await;
            }
        });
    }
}
