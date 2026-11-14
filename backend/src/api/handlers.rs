use super::AppState;
use super::auth::AuthUser;
use crate::db::repository::Repository;
use crate::domain::{CalculationEngine, Platform, Transaction, TransactionType};
use crate::sync::SyncService;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateTransactionPayload {
    pub proj_id: String,
    pub fund_abbr: Option<String>,
    pub platform: String,
    pub trans_type: String,
    pub trans_date: String, // YYYY-MM-DD
    pub units: Decimal,
    pub unit_price: Decimal,
    pub total_amount: Option<Decimal>,
    pub fee: Option<Decimal>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

/// GET /api/health
pub async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "fund-portfolio-api",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// GET /api/brokers
/// ดึง Master Data รายชื่อโบรกเกอร์ ตัวแทนจำหน่าย และ บลจ. จาก SEC
pub async fn get_brokers(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let list = Repository::get_all_brokers(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(list))
}

/// GET /api/portfolio
/// คำนวณสรุปพอร์ตการลงทุนเฉพาะของ user_id ที่ส่งมากับ Token
pub async fn get_portfolio(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let txs = Repository::get_all_transactions(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let nav_map = Repository::get_latest_nav_map(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let summary = CalculationEngine::calculate_portfolio(txs, &nav_map);

    Ok(Json(summary))
}

/// GET /api/transactions
/// ดึงประวัติธุรกรรมเฉพาะของ user_id
pub async fn get_transactions(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let txs = Repository::get_all_transactions(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(txs))
}

/// POST /api/transactions
/// บันทึกรายการ ซื้อ / ขาย / ปันผล ใหม่ ผูกกับ user_id
pub async fn create_transaction(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateTransactionPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let total_amount = payload
        .total_amount
        .unwrap_or_else(|| payload.units * payload.unit_price);

    let fee = payload.fee.unwrap_or(Decimal::ZERO);

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        proj_id: payload.proj_id,
        fund_abbr: payload.fund_abbr,
        platform: Platform::from_str(&payload.platform),
        trans_type: TransactionType::from_str(&payload.trans_type),
        trans_date: payload.trans_date,
        units: payload.units,
        unit_price: payload.unit_price,
        total_amount,
        fee,
        note: payload.note,
    };

    Repository::insert_transaction(&state.pool, &auth.user_id, &tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(tx)))
}

/// POST /api/transactions/batch
/// บันทึกรายการธุรกรรมหลายรายการพร้อมกัน (นำเข้าจากไฟล์ CSV)
pub async fn create_transactions_batch(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payloads): Json<Vec<CreateTransactionPayload>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut txs = Vec::with_capacity(payloads.len());

    for payload in payloads {
        let total_amount = payload
            .total_amount
            .unwrap_or_else(|| payload.units * payload.unit_price);

        let fee = payload.fee.unwrap_or(Decimal::ZERO);

        txs.push(Transaction {
            id: Uuid::new_v4().to_string(),
            proj_id: payload.proj_id,
            fund_abbr: payload.fund_abbr,
            platform: Platform::from_str(&payload.platform),
            trans_type: TransactionType::from_str(&payload.trans_type),
            trans_date: payload.trans_date,
            units: payload.units,
            unit_price: payload.unit_price,
            total_amount,
            fee,
            note: payload.note,
        });
    }

    let count = Repository::insert_transactions_batch(&state.pool, &auth.user_id, &txs)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "success": true,
            "inserted_count": count
        })),
    ))
}

/// DELETE /api/transactions/:id
/// ลบรายการธุรกรรม (เฉพาะรายการที่เป็นของ user_id นั้น)
pub async fn delete_transaction(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let deleted = Repository::delete_transaction(&state.pool, &auth.user_id, &id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if deleted {
        Ok(Json(
            serde_json::json!({ "success": true, "message": "Transaction deleted" }),
        ))
    } else {
        Err((StatusCode::NOT_FOUND, "Transaction not found".to_string()))
    }
}

/// GET /api/funds/search?q=...
/// ค้นหารายชื่อกองทุนจากฐานข้อมูลภายใน (Public/Global catalog)
pub async fn search_funds(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let q = query.q.unwrap_or_default();
    let limit = query.limit.unwrap_or(20);

    let results = Repository::search_funds(&state.pool, &q, limit)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(results))
}

/// POST /api/funds/sync
/// Trigger การดึงราคา NAV ล่าสุดจาก SEC API ทันที
pub async fn trigger_sync(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let count = SyncService::sync_held_funds(&state.pool, &state.api_key)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "updated_funds_count": count
    })))
}

#[derive(Debug, Deserialize)]
pub struct ParseStatementRequest {
    pub pdf_base64: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParsedTransactionItem {
    pub trans_date: String,
    pub platform: String,
    pub fund_abbr: String,
    pub trans_type: String,
    pub units: f64,
    pub unit_price: f64,
    pub fee: f64,
    pub note: Option<String>,
}

/// POST /api/parse/statement
/// วิเคราะห์ไฟล์เอกสาร PDF หรือข้อความ Statement / ใบยืนยันรายการกองทุนรวมด้วย Gemini AI
pub async fn parse_statement(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
    Json(payload): Json<ParseStatementRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if state.gemini_api_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "GEMINI_API_KEY is not configured on the server. Please add it to your backend/.env file.".to_string(),
        ));
    }

    let client = reqwest::Client::new();
    let model =
        std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-3-flash-preview".to_string());
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, state.gemini_api_key
    );

    let system_instructions = r#"Precision financial statement parser for Thai Mutual Funds (KBank, SCBAM, ttb, Dime!, InnovestX, Krungsri, BBLAM, etc.).
Extract all mutual fund transactions (subscription/buy, redemption/sell, dividend, switching).
RULES:
1. fund_abbr: COMPLETE fund name or ticker. Never truncate. Join multi-line table rows completely (e.g. 'TMB EASTSPRING' + 'Asia Active Fund' -> 'TMB EASTSPRING Asia Active Fund').
2. trans_type: 'BUY', 'SELL', or 'DIVIDEND' (SUBSCRIPTION=BUY, REDEMPTION=SELL).
3. trans_date: 'YYYY-MM-DD' (convert Buddhist Era 25xx to CE 20xx e.g. 2567->2024).
4. note: Only short transaction ref or empty string.

OUTPUT FORMAT:
Return a JSON 2D array of rows conforming strictly to:
[
  [trans_date: string, platform: string, fund_abbr: string, trans_type: string, units: number, unit_price: number, fee: number, note: string]
]
Return empty array [] if no transactions found."#;

    let mut parts = Vec::new();

    if let Some(pdf_b64) = payload.pdf_base64
        && !pdf_b64.trim().is_empty()
    {
        parts.push(serde_json::json!({
            "inlineData": {
                "mimeType": "application/pdf",
                "data": pdf_b64.trim()
            }
        }));
    }

    if let Some(t) = payload.text
        && !t.trim().is_empty()
    {
        parts.push(serde_json::json!({
            "text": t.trim()
        }));
    }

    let request_body = serde_json::json!({
        "systemInstruction": {
            "parts": [{
                "text": system_instructions
            }]
        },
        "contents": [{
            "parts": parts
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    });

    let res = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to call Gemini API: {}", e),
            )
        })?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Gemini API error: {}", err_text),
        ));
    }

    let resp_json: serde_json::Value = res.json().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse Gemini response: {}", e),
        )
    })?;

    let candidate_text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "No response generated by Gemini".to_string(),
            )
        })?;

    // Deserialise candidate JSON: First try compact 2D array, then fallback to Vec<ParsedTransactionItem> or { transactions: ... }
    let parsed: Vec<ParsedTransactionItem> = if let Ok(rows) =
        serde_json::from_str::<Vec<Vec<serde_json::Value>>>(candidate_text)
    {
        rows.into_iter()
            .filter_map(|row| {
                if row.len() >= 6 {
                    let date = row
                        .first()
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let platform = row
                        .get(1)
                        .and_then(|v| v.as_str())
                        .unwrap_or("OTHER")
                        .to_string();
                    let fund_abbr = row
                        .get(2)
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let trans_type = row
                        .get(3)
                        .and_then(|v| v.as_str())
                        .unwrap_or("BUY")
                        .to_string();
                    let units = row
                        .get(4)
                        .and_then(|v| {
                            v.as_f64()
                                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                        })
                        .unwrap_or(0.0);
                    let unit_price = row
                        .get(5)
                        .and_then(|v| {
                            v.as_f64()
                                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                        })
                        .unwrap_or(0.0);
                    let fee = row
                        .get(6)
                        .and_then(|v| {
                            v.as_f64()
                                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                        })
                        .unwrap_or(0.0);
                    let note = row.get(7).and_then(|v| v.as_str()).map(|s| s.to_string());

                    if !fund_abbr.trim().is_empty() {
                        Some(ParsedTransactionItem {
                            trans_date: date,
                            platform,
                            fund_abbr,
                            trans_type,
                            units,
                            unit_price,
                            fee,
                            note,
                        })
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect()
    } else if let Ok(items) = serde_json::from_str::<Vec<ParsedTransactionItem>>(candidate_text) {
        items
    } else {
        #[derive(Deserialize)]
        struct Wrapper {
            transactions: Vec<ParsedTransactionItem>,
        }
        if let Ok(wrapper) = serde_json::from_str::<Wrapper>(candidate_text) {
            wrapper.transactions
        } else {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "Failed to parse structured transactions from Gemini output: {}",
                    candidate_text
                ),
            ));
        }
    };

    let usage = resp_json.get("usageMetadata").map(|u| {
        serde_json::json!({
            "prompt_tokens": u.get("promptTokenCount").and_then(|v| v.as_i64()).unwrap_or(0),
            "candidates_tokens": u.get("candidatesTokenCount").and_then(|v| v.as_i64()).unwrap_or(0),
            "total_tokens": u.get("totalTokenCount").and_then(|v| v.as_i64()).unwrap_or(0),
        })
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "count": parsed.len(),
        "transactions": parsed,
        "usage": usage,
    })))
}
