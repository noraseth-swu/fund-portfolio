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
