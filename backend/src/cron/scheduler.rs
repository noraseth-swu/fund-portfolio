use crate::db::{DbPool, repository::Repository};
use crate::sync::SyncService;
use chrono::{DateTime, Utc, Duration as ChronoDuration};
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub struct DailyNavScheduler;

impl DailyNavScheduler {
    pub const JOB_NAME: &'static str = "DAILY_NAV_SYNC";

    /// Helper function to calculate current ICT time (UTC+7)
    pub fn now_ict() -> DateTime<Utc> {
        Utc::now() + ChronoDuration::hours(7)
    }

    /// Check if target time matches given hour and minute
    pub fn is_trigger_time(now_ict: DateTime<Utc>, target_hour: u32, target_minute: u32) -> bool {
        let h: u32 = now_ict.format("%H").to_string().parse().unwrap_or(99);
        let m: u32 = now_ict.format("%M").to_string().parse().unwrap_or(99);
        h == target_hour && m == target_minute
    }

    /// Start the daily background scheduler daemon
    pub fn start(pool: Arc<DbPool>, api_key: String) {
        tokio::spawn(async move {
            let enabled = env::var("DAILY_NAV_SYNC_ENABLED")
                .unwrap_or_else(|_| "true".into())
                .parse::<bool>()
                .unwrap_or(true);

            let target_hour = env::var("DAILY_NAV_SYNC_HOUR")
                .unwrap_or_else(|_| "20".into())
                .parse::<u32>()
                .unwrap_or(20);

            let target_minute = env::var("DAILY_NAV_SYNC_MINUTE")
                .unwrap_or_else(|_| "30".into())
                .parse::<u32>()
                .unwrap_or(30);

            tracing::info!(
                "[Daily NAV Scheduler] Initialized (Enabled: {}, Target ICT: {:02}:{:02})",
                enabled,
                target_hour,
                target_minute
            );

            if !enabled {
                return;
            }

            loop {
                // Check every 30 seconds
                sleep(Duration::from_secs(30)).await;

                let ict = Self::now_ict();
                if Self::is_trigger_time(ict, target_hour, target_minute) {
                    let today_prefix = ict.format("%Y-%m-%d").to_string();

                    // Check if already completed today
                    match Repository::has_successful_sync_today(&pool, Self::JOB_NAME, &today_prefix).await {
                        Ok(true) => {
                            tracing::debug!("[Daily NAV Scheduler] Already executed successfully today ({today_prefix}). Skipping.");
                        }
                        Ok(false) => {
                            tracing::info!(
                                "[Daily NAV Scheduler] Triggering automated daily closing NAV & stock sync at {:02}:{:02} ICT...",
                                target_hour, target_minute
                            );

                            let log_id = match Repository::insert_scheduled_sync_log(&pool, Self::JOB_NAME).await {
                                Ok(id) => Some(id),
                                Err(e) => {
                                    tracing::error!("[Daily NAV Scheduler] Failed to insert initial log: {e}");
                                    None
                                }
                            };

                            let sync_result = SyncService::sync_held_funds(&pool, &api_key).await;
                            let _ = SyncService::sync_stock_prices(&pool).await;

                            if let Some(id) = log_id {
                                match sync_result {
                                    Ok(count) => {
                                        let _ = Repository::complete_scheduled_sync_log(
                                            &pool,
                                            id,
                                            "SUCCESS",
                                            count as i64,
                                            None,
                                        )
                                        .await;
                                        tracing::info!(
                                            "[Daily NAV Scheduler] Daily sync completed successfully. Updated {} funds.",
                                            count
                                        );
                                    }
                                    Err(e) => {
                                        let err_msg = e.to_string();
                                        let _ = Repository::complete_scheduled_sync_log(
                                            &pool,
                                            id,
                                            "FAILED",
                                            0,
                                            Some(&err_msg),
                                        )
                                        .await;
                                        tracing::error!("[Daily NAV Scheduler] Sync failed: {err_msg}");

                                        sentry::with_scope(
                                            |scope| {
                                                scope.set_tag("service", "daily-nav-scheduler");
                                                scope.set_extra("target_time", format!("{:02}:{:02} ICT", target_hour, target_minute).into());
                                            },
                                            || {
                                                sentry::capture_message(
                                                    &format!("[Daily NAV Sync Failed] {}", err_msg),
                                                    sentry::Level::Error,
                                                );
                                            },
                                        );
                                    }
                                }
                            }

                            // Sleep 65 seconds so we don't trigger again in the same minute
                            sleep(Duration::from_secs(65)).await;
                        }
                        Err(e) => {
                            tracing::error!("[Daily NAV Scheduler] Error checking today's status: {e}");
                        }
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_is_trigger_time_matches() {
        // 2026-11-18 20:30:00 UTC
        let dt = Utc.with_ymd_and_hms(2026, 11, 18, 20, 30, 0).unwrap();
        assert!(DailyNavScheduler::is_trigger_time(dt, 20, 30));
        assert!(!DailyNavScheduler::is_trigger_time(dt, 20, 31));
        assert!(!DailyNavScheduler::is_trigger_time(dt, 19, 30));
    }

    #[test]
    fn test_now_ict_calculation() {
        let utc = Utc::now();
        let ict = DailyNavScheduler::now_ict();
        let diff = (ict - utc).num_hours();
        assert_eq!(diff, 7, "ICT must be UTC+7");
    }
}
