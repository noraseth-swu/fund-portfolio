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

        for proj_id in &held_ids {
            match client.get_fund_nav_history(proj_id).await {
                Ok(items) if !items.is_empty() => {
                    Repository::upsert_nav_history(pool, proj_id, &items).await?;
                    updated_count += 1;
                    println!(
                        "[Background Sync] Updated NAV for fund {}: {} records",
                        proj_id,
                        items.len()
                    );
                }
                Ok(_) => {
                    println!(
                        "[Background Sync] No new NAV records returned for {}",
                        proj_id
                    );
                }
                Err(e) => {
                    eprintln!(
                        "[Background Sync Error] Failed to fetch NAV for {}: {}",
                        proj_id, e
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
