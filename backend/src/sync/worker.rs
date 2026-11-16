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

        tracing::info!(
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

            // ค้นหา SEC proj_id จาก fund_aliases ก่อน แล้วค่อยค้นจากฐานข้อมูลกองทุน funds
            let alias_proj_id = sqlx::query_scalar::<_, String>(
                "SELECT proj_id FROM fund_aliases WHERE LOWER(alias) = LOWER(?1) LIMIT 1",
            )
            .bind(held_id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

            let sec_proj_id = if let Some(pid) = alias_proj_id {
                pid
            } else {
                sqlx::query_scalar::<_, String>(
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
                .unwrap_or_else(|| held_id.clone())
            };

            match client.get_fund_nav_history(&sec_proj_id).await {
                Ok(items) if !items.is_empty() => {
                    Repository::upsert_nav_history(pool, &sec_proj_id, &items).await?;
                    if sec_proj_id != *held_id {
                        let _ = Repository::upsert_nav_history(pool, held_id, &items).await;
                    }
                    updated_count += 1;
                    tracing::info!(
                        "[Background Sync] Updated NAV for fund {} (SEC: {}): {} records",
                        held_id,
                        sec_proj_id,
                        items.len()
                    );
                }
                Ok(_) => {
                    tracing::debug!(
                        "[Background Sync] No new NAV records returned for {} (SEC: {})",
                        held_id, sec_proj_id
                    );
                }
                Err(e) => {
                    tracing::error!(
                        "[Background Sync Error] Failed to fetch NAV for {} (SEC: {}): {}",
                        held_id, sec_proj_id, e
                    );
                }
            }
        }

        Ok(updated_count)
    }

    /// ทำการ Sync ราคาหุ้นสหรัฐฯ (US Stocks) และอัตราแลกเปลี่ยน USD/THB จาก Yahoo Finance
    pub async fn sync_stock_prices(
        pool: &DbPool,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let mut tickers: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT ticker FROM stock_transactions WHERE ticker IS NOT NULL AND ticker != ''",
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        if tickers.is_empty() {
            return Ok(0);
        }

        if !tickers.contains(&"THB=X".to_string()) {
            tickers.push("THB=X".to_string());
        }

        tracing::info!(
            "[Yahoo Finance Sync] Updating stock quotes and FX for {} symbols: {:?}",
            tickers.len(),
            tickers
        );

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()?;

        let mut updated_count = 0;

        for sym in &tickers {
            let url1 = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}", sym);
            let url2 = format!("https://query2.finance.yahoo.com/v8/finance/chart/{}", sym);

            let res = match client.get(&url1).send().await {
                Ok(r) if r.status().is_success() => Ok(r),
                _ => client.get(&url2).send().await,
            };

            if let Ok(resp) = res {
                if let Ok(json_data) = resp.json::<serde_json::Value>().await {
                    if let Some(result_arr) = json_data.pointer("/chart/result").and_then(|v| v.as_array()) {
                        if let Some(first_res) = result_arr.first() {
                            if let Some(meta) = first_res.get("meta") {
                                let price_num = meta.get("regularMarketPrice").and_then(|v| v.as_f64());
                                let cur = meta.get("currency").and_then(|v| v.as_str()).unwrap_or("USD");
                                let time_sec = meta.get("regularMarketTime").and_then(|v| v.as_i64());

                                if let Some(p) = price_num {
                                    let quote_date = if let Some(sec) = time_sec {
                                        use chrono::DateTime;
                                        if let Some(dt) = DateTime::from_timestamp(sec, 0) {
                                            dt.format("%Y-%m-%d").to_string()
                                        } else {
                                            chrono::Utc::now().format("%Y-%m-%d").to_string()
                                        }
                                    } else {
                                        chrono::Utc::now().format("%Y-%m-%d").to_string()
                                    };

                                    let price_str = format!("{:.4}", p);
                                    let save_ticker = if sym == "THB=X" { "USDTHB" } else { sym.as_str() };

                                    let _ = sqlx::query(
                                        r#"
                                        INSERT INTO stock_prices (ticker, price, currency, quote_date, updated_at)
                                        VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
                                        ON CONFLICT(ticker) DO UPDATE SET
                                            price = excluded.price,
                                            currency = excluded.currency,
                                            quote_date = excluded.quote_date,
                                            updated_at = CURRENT_TIMESTAMP
                                        "#,
                                    )
                                    .bind(save_ticker)
                                    .bind(&price_str)
                                    .bind(cur)
                                    .bind(&quote_date)
                                    .execute(pool)
                                    .await;

                                    if sym == "THB=X" {
                                        let _ = sqlx::query(
                                            r#"
                                            INSERT INTO stock_prices (ticker, price, currency, quote_date, updated_at)
                                            VALUES ('THB=X', ?1, ?2, ?3, CURRENT_TIMESTAMP)
                                            ON CONFLICT(ticker) DO UPDATE SET
                                                price = excluded.price,
                                                currency = excluded.currency,
                                                quote_date = excluded.quote_date,
                                                updated_at = CURRENT_TIMESTAMP
                                            "#,
                                        )
                                        .bind(&price_str)
                                        .bind(cur)
                                        .bind(&quote_date)
                                        .execute(pool)
                                        .await;
                                    }

                                    updated_count += 1;
                                    tracing::info!(
                                        "[Yahoo Finance Sync] Updated {} quote: {} {} on {}",
                                        save_ticker,
                                        price_str,
                                        cur,
                                        quote_date
                                    );
                                }
                            }
                        }
                    }
                }
            } else {
                tracing::warn!("[Yahoo Finance Sync] Could not fetch quote for {}", sym);
            }
        }

        Ok(updated_count)
    }

    /// สตาร์ท Background Worker ให้ทำงานวนลูปทุก 4 ชั่วโมง
    pub fn start_background_worker(pool: Arc<DbPool>, api_key: String) {
        tokio::spawn(async move {
            tracing::info!("[Background Worker] Started NAV & Stock sync scheduler (every 4 hours).");
            loop {
                // รอ 10 วินาทีหลังสตาร์ทเครื่อง แล้วรันรอบแรก
                sleep(Duration::from_secs(10)).await;

                tracing::info!("[Background Worker] Triggering periodic NAV & Stock sync...");
                if let Err(e) = Self::sync_held_funds(&pool, &api_key).await {
                    tracing::error!("[Background Worker Error - NAV] {}", e);
                }
                if let Err(e) = Self::sync_stock_prices(&pool).await {
                    tracing::error!("[Background Worker Error - Stock] {}", e);
                }

                // หน่วงเวลา 4 ชั่วโมงสำหรับรอบถัดไป
                sleep(Duration::from_secs(4 * 3600)).await;
            }
        });
    }
}
