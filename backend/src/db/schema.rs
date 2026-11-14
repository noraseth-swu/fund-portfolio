use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FundSearchResult {
    pub proj_id: String,
    pub proj_abbr_name: Option<String>,
    pub proj_name_th: Option<String>,
    pub proj_name_en: Option<String>,
    pub last_nav: Option<String>,
    pub last_nav_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerItem {
    pub code: String,
    pub name_th: String,
    pub name_en: String,
    pub category: String,
}
