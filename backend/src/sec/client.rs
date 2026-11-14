#![allow(dead_code)]
use super::models::{AmcInfo, DailyNavInfo, FundProfile, SecPagedResponse};
use reqwest::header::{HeaderMap, HeaderValue};
use serde::de::DeserializeOwned;
use std::time::{Duration, Instant};
use tokio::time::sleep;

pub struct SecClient {
    client: reqwest::Client,
    base_url: String,
    last_request_time: Option<Instant>,
    min_interval: Duration,
}

impl SecClient {
    pub fn new(api_key: String) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(
            "Ocp-Apim-Subscription-Key",
            HeaderValue::from_str(api_key.trim()).expect("Invalid API key header"),
        );
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            base_url: "https://api.sec.or.th".to_string(),
            last_request_time: None,
            // SEC Rule: Delay between requests must be >= 16 ms
            min_interval: Duration::from_millis(16),
        }
    }

    /// หน่วงเวลาเพื่อไม่ให้เกิน Rate Limit และรักษาช่วงเวลา >= 16ms ตามกฎ ก.ล.ต.
    async fn throttle(&mut self) {
        if let Some(last) = self.last_request_time {
            let elapsed = last.elapsed();
            if elapsed < self.min_interval {
                sleep(self.min_interval - elapsed).await;
            }
        }
        self.last_request_time = Some(Instant::now());
    }

    /// เรียก GET request พร้อมระบบ Retry on 429
    pub async fn get_raw(
        &mut self,
        endpoint: &str,
        query: &[(&str, &str)],
    ) -> Result<reqwest::Response, Box<dyn std::error::Error + Send + Sync>> {
        let mut retries = 0;
        let max_retries = 5;

        loop {
            self.throttle().await;

            let url = format!("{}{}", self.base_url, endpoint);
            let mut req = self.client.get(&url);
            if !query.is_empty() {
                req = req.query(query);
            }

            let resp = req.send().await?;

            // ตรวจสอบกรณี Rate Limit เกิน (HTTP Status 429)
            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                retries += 1;
                if retries > max_retries {
                    return Err(format!(
                        "Exceeded max retries on 429 Too Many Requests for endpoint: {}",
                        endpoint
                    )
                    .into());
                }

                let wait_secs = resp
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(2_u64.pow(retries)); // Fallback เป็น exponential backoff 2, 4, 8s

                eprintln!(
                    "[SEC API 429] Rate limited. Waiting for {} seconds before retry #{}...",
                    wait_secs, retries
                );
                sleep(Duration::from_secs(wait_secs)).await;
                continue;
            }

            return Ok(resp);
        }
    }

    /// ดึงข้อมูลหน้าเดียว จัดการกรณีที่ SEC ตอบกลับเป็น Empty/null ได้อย่างปลอดภัย
    pub async fn get_paged_single<T: DeserializeOwned>(
        &mut self,
        endpoint: &str,
        query: &[(&str, &str)],
    ) -> Result<SecPagedResponse<T>, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.get_raw(endpoint, query).await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("SEC API Error {}: {}", status, body).into());
        }

        let body_text = resp.text().await.unwrap_or_default();
        let trimmed = body_text.trim();

        if trimmed.is_empty() || trimmed == "\"\"" || trimmed == "null" {
            return Ok(SecPagedResponse {
                message: Some("no data".to_string()),
                page_size: Some(0),
                next_cursor: None,
                items: Vec::new(),
            });
        }

        let data: SecPagedResponse<T> = serde_json::from_str(trimmed)?;
        Ok(data)
    }

    /// ดึงข้อมูลแบบ Pagination (Cursor-based) วนลูปอ่านทุกหน้าจนกว่า next_cursor จะหมด
    pub async fn get_paged_all<T: DeserializeOwned>(
        &mut self,
        endpoint: &str,
        extra_query: &[(&str, &str)],
        page_size: u32,
    ) -> Result<Vec<T>, Box<dyn std::error::Error + Send + Sync>> {
        let mut all_items = Vec::new();
        let mut cursor: Option<String> = None;
        let page_size_str = page_size.min(100).to_string(); // SEC: สูงสุดไม่เกิน 100

        loop {
            let mut query_params: Vec<(&str, &str)> = vec![("page_size", &page_size_str)];
            query_params.extend_from_slice(extra_query);

            if let Some(ref c) = cursor
                && !c.is_empty()
            {
                query_params.push(("next_cursor", c.as_str()));
            }

            let paged: SecPagedResponse<T> = self.get_paged_single(endpoint, &query_params).await?;
            all_items.extend(paged.items);

            // ตรวจสอบ next_cursor
            match paged.next_cursor {
                Some(ref next) if !next.trim().is_empty() => {
                    cursor = Some(next.clone());
                }
                _ => break, // หมดทุกหน้าแล้ว สิ้นสุดการวนลูป
            }
        }

        Ok(all_items)
    }

    /// ดึงรายชื่อ บลจ. ทั้งหมด (Asset Management Companies) จาก v2
    pub async fn get_amc_list(&mut self) -> Result<Vec<AmcInfo>, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.get_paged_single::<AmcInfo>("/v2/fund/general-info/amcs", &[]).await?;
        Ok(resp.items)
    }

    /// ดึงข้อมูลรายชื่อกองทุน (Fund Profiles) 1 หน้า (100 รายการ) หรือระบุ cursor
    pub async fn get_fund_profiles(&mut self, cursor: Option<&str>) -> Result<SecPagedResponse<FundProfile>, Box<dyn std::error::Error + Send + Sync>> {
        let mut query = vec![("page_size", "100")];
        if let Some(c) = cursor {
            query.push(("next_cursor", c));
        }
        self.get_paged_single::<FundProfile>("/v2/fund/general-info/profiles", &query).await
    }

    /// ดึงข้อมูลประวัติ NAV รายวันสำหรับกองทุนที่ระบุ (proj_id)
    pub async fn get_fund_nav_history(&mut self, proj_id: &str) -> Result<Vec<DailyNavInfo>, Box<dyn std::error::Error + Send + Sync>> {
        let query = [("proj_id", proj_id)];
        let resp = self.get_paged_single::<DailyNavInfo>("/v2/fund/daily-info/nav", &query).await?;
        Ok(resp.items)
    }
}
