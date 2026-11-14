#![allow(dead_code)]
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// โครงสร้าง Response มาตรฐานแบบ Cursor-based Pagination ของ SEC Open API (v2)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecPagedResponse<T> {
    pub message: Option<String>,
    pub page_size: Option<u32>,
    pub next_cursor: Option<String>,
    #[serde(default = "Vec::new")]
    pub items: Vec<T>,
}

/// ข้อมูลบริษัทจัดการกองทุนรวม (บลจ. / AMC) จาก /v2/fund/general-info/amcs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmcInfo {
    pub unique_id: String,
    pub comp_name_th: Option<String>,
    pub comp_name_en: Option<String>,
    pub last_upd_date: Option<String>,
}

/// ข้อมูลทั่วไปและลักษณะของกองทุนรวม จาก /v2/fund/general-info/profiles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FundProfile {
    pub unique_id: Option<String>,
    pub comp_name_th: Option<String>,
    pub comp_name_en: Option<String>,
    pub proj_id: String,
    pub proj_abbr_name: Option<String>,
    pub proj_name_th: Option<String>,
    pub proj_name_en: Option<String>,
    pub fund_status: Option<String>,
    pub fund_class_name: Option<String>,
    pub policy_desc: Option<String>,
}

/// ข้อมูล NAV รายวัน จาก /v2/fund/daily-info/nav
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyNavInfo {
    pub proj_id: String,
    pub unique_id: Option<String>,
    pub fund_class_name: Option<String>,
    pub nav_date: String,
    pub net_asset: Option<Decimal>,
    pub last_val: Option<Decimal>,
    pub sell_price: Option<Decimal>,
    pub buy_price: Option<Decimal>,
    pub last_upd_date: Option<String>,
}
