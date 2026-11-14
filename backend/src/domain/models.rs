use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// แพลตฟอร์มหรือช่องทางที่ซื้อกองทุน
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Platform {
    #[serde(rename = "KBANK")]
    KBank,
    #[serde(rename = "TTB")]
    Ttb,
    #[serde(rename = "DIME")]
    Dime,
    #[serde(rename = "SCB")]
    Scb,
    #[serde(rename = "OTHER")]
    Other(String),
}

impl Platform {
    pub fn as_str(&self) -> &str {
        match self {
            Platform::KBank => "KBANK",
            Platform::Ttb => "TTB",
            Platform::Dime => "DIME",
            Platform::Scb => "SCB",
            Platform::Other(s) => s.as_str(),
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "KBANK" | "K-PLUS" | "K-MYFUNDS" => Platform::KBank,
            "TTB" | "TTB TOUCH" | "TTB SMART PORT" => Platform::Ttb,
            "DIME" | "DIME!" => Platform::Dime,
            "SCB" | "SCB EASY" | "INNOVESTX" => Platform::Scb,
            other => Platform::Other(other.to_string()),
        }
    }
}

/// ประเภทของธุรกรรม
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransactionType {
    #[serde(rename = "BUY")]
    Buy,
    #[serde(rename = "SELL")]
    Sell,
    #[serde(rename = "DIVIDEND")]
    Dividend,
}

impl TransactionType {
    pub fn as_str(&self) -> &str {
        match self {
            TransactionType::Buy => "BUY",
            TransactionType::Sell => "SELL",
            TransactionType::Dividend => "DIVIDEND",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "BUY" => TransactionType::Buy,
            "SELL" => TransactionType::Sell,
            "DIVIDEND" | "DIV" => TransactionType::Dividend,
            _ => TransactionType::Buy,
        }
    }
}

/// รายการธุรกรรมการซื้อขายหรือรับเงินปันผล
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub idempotency_key: Option<String>,
    pub proj_id: String,
    pub fund_abbr: Option<String>,
    pub platform: Platform,
    pub trans_type: TransactionType,
    pub trans_date: String,    // YYYY-MM-DD
    pub units: Decimal,        // จำนวนหน่วยลงทุน
    pub unit_price: Decimal,   // NAV ณ วันที่ซื้อขาย
    pub total_amount: Decimal, // มูลค่ารวม (บาท)
    pub fee: Decimal,          // ค่าธรรมเนียม (ถ้ามี)
    pub note: Option<String>,
}

impl Transaction {
    /// คำนวณ Idempotency Key (SHA-256) สำหรับตรวจสอบและป้องกันรายการซ้ำ
    #[allow(clippy::too_many_arguments)]
    pub fn compute_idempotency_key(
        user_id: &str,
        platform: &str,
        proj_id: &str,
        fund_abbr: Option<&str>,
        trans_date: &str,
        trans_type: &str,
        units: &Decimal,
        total_amount: &Decimal,
        note: Option<&str>,
    ) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(user_id.trim().as_bytes());
        hasher.update(b"|");
        hasher.update(platform.trim().to_uppercase().as_bytes());
        hasher.update(b"|");

        let fund_key = fund_abbr
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(proj_id)
            .trim()
            .to_uppercase();
        hasher.update(fund_key.as_bytes());
        hasher.update(b"|");
        hasher.update(trans_date.trim().as_bytes());
        hasher.update(b"|");
        hasher.update(trans_type.trim().to_uppercase().as_bytes());
        hasher.update(b"|");
        hasher.update(format!("{:.4}", units).as_bytes());
        hasher.update(b"|");
        hasher.update(format!("{:.2}", total_amount).as_bytes());

        // ถ้ามีเลขอ้างอิงรายการใน note ให้ร่วมคำนวณด้วย
        if let Some(n) = note {
            let trimmed = n.trim();
            if !trimmed.is_empty() {
                hasher.update(b"|");
                hasher.update(trimmed.as_bytes());
            }
        }

        format!("{:x}", hasher.finalize())
    }
}

/// สถานะการถือครองของแต่ละกองทุน (Holding Position)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoldingPosition {
    pub proj_id: String,
    pub fund_abbr: String,
    pub fund_name_th: Option<String>,
    pub platform: String,           // "KBANK", "DIME", หรือ "ALL"
    pub total_units: Decimal,       // จำนวนหน่วยคงเหลือ
    pub avg_cost: Decimal,          // ต้นทุนเฉลี่ยต่อหน่วย (บาท)
    pub total_cost: Decimal,        // ต้นทุนรวมคงเหลือ (บาท)
    pub current_nav: Decimal,       // ราคา NAV ล่าสุด
    pub nav_date: Option<String>,   // วันที่ของราคา NAV ล่าสุด (YYYY-MM-DD)
    pub asset_type: String,         // "FUND" (กองทุนรวม) หรือ "STOCK" (หุ้น / หุ้นต่างประเทศ)
    pub market_value: Decimal,      // มูลค่าปัจจุบัน (บาท) = total_units * current_nav
    pub unrealized_pl: Decimal,     // กำไร/ขาดทุนที่ยังไม่เกิดขึ้น (บาท) = market_value - total_cost
    pub unrealized_pl_pct: Decimal, // ผลตอบแทน % = (unrealized_pl / total_cost) * 100
    pub realized_pl: Decimal,       // กำไร/ขาดทุนที่เกิดขึ้นแล้วจากการขาย (บาท)
    pub total_dividend: Decimal,    // เงินปันผลสะสมที่ได้รับ (บาท)
}

/// สรุปภาพรวมของแต่ละแพลตฟอร์ม (KBank, ttb, Dime, SCB)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformSummary {
    pub platform: String,
    pub total_cost: Decimal,
    pub market_value: Decimal,
    pub unrealized_pl: Decimal,
    pub unrealized_pl_pct: Decimal,
    pub realized_pl: Decimal,
    pub allocation_pct: Decimal, // สัดส่วน % เทียบกับพอร์ตทั้งหมด
}

/// สรุปภาพรวมพอร์ตทั้งหมด (Portfolio Summary)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioSummary {
    pub total_cost: Decimal,
    pub market_value: Decimal,
    pub total_unrealized_pl: Decimal,
    pub total_unrealized_pl_pct: Decimal,
    pub total_realized_pl: Decimal,
    pub total_dividend: Decimal,
    pub holdings: Vec<HoldingPosition>,
    pub platforms: HashMap<String, PlatformSummary>,
}

/// การตั้งค่าโปรไฟล์ผู้ใช้สำหรับดึงข้อมูลและถอดรหัสเอกสารธนาคารอัตโนมัติ
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserSettings {
    pub user_id: String,
    pub gmail_account: Option<String>,
    pub gmail_app_password: Option<String>,
    pub dob_day: Option<String>,
    pub dob_month: Option<String>,
    pub dob_year_ce: Option<String>,
    pub dob_year_be: Option<String>,
    pub national_id_last5: Option<String>,
    pub custom_pdf_passwords: Option<String>,
    pub auto_sync_enabled: bool,
    pub last_sync_at: Option<String>,
}
