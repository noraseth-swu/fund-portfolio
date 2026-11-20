use super::AppState;
use super::auth::AuthUser;
use crate::db::repository::Repository;
use crate::domain::{
    CalculationEngine, HoldingPosition, Platform, PlatformSummary, Transaction, TransactionType,
    UserSettings,
};
use crate::sync::SyncService;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashMap;
use std::str::FromStr;
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
/// คำนวณสรุปพอร์ตการลงทุนเฉพาะของ user_id ที่ส่งมากับ Token (รวมทั้งกองทุนรวม หุ้น และ PVD Snapshot)
pub async fn get_portfolio(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let txs = Repository::get_all_transactions(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut nav_map = Repository::get_latest_nav_map(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // โหลดราคาหุ้นและอัตราแลกเปลี่ยนล่าสุดจาก stock_prices ก่อน เพื่อให้ CalculationEngine มีราคาตลาด THB ที่ถูกต้อง
    let mut price_map: HashMap<String, (Decimal, String, String)> = HashMap::new();
    if let Ok(stock_prices_rows) = sqlx::query("SELECT ticker, price, currency, quote_date FROM stock_prices")
        .fetch_all(&state.pool)
        .await
    {
        for row in stock_prices_rows {
            let t: String = row.get("ticker");
            let p_str: String = row.get("price");
            let c: String = row.get("currency");
            let qd: String = row.get("quote_date");
            if let Ok(p) = Decimal::from_str(&p_str) {
                price_map.insert(t, (p, c, qd));
            }
        }
    }

    // หากยังไม่เคยมีราคาหุ้นในตาราง stock_prices ให้ trigger sync ทันที
    if price_map.is_empty() {
        let _ = SyncService::sync_stock_prices(&state.pool).await;
        if let Ok(fresh_rows) = sqlx::query("SELECT ticker, price, currency, quote_date FROM stock_prices")
            .fetch_all(&state.pool)
            .await
        {
            for row in fresh_rows {
                let t: String = row.get("ticker");
                let p_str: String = row.get("price");
                let c: String = row.get("currency");
                let qd: String = row.get("quote_date");
                if let Ok(p) = Decimal::from_str(&p_str) {
                    price_map.insert(t, (p, c, qd));
                }
            }
        }
    }

    let usd_thb_rate = price_map
        .get("USDTHB")
        .or_else(|| price_map.get("THB=X"))
        .map(|(p, _, _)| *p)
        .unwrap_or_else(|| Decimal::from_str("34.00").unwrap());

    // นำราคาหุ้นต่างประเทศที่แปลงเป็น THB แล้วใส่ลงใน nav_map เพื่อให้ CalculationEngine คำนวณมูลค่าหุ้นได้แม่นยำ
    for (ticker, (price_usd, _, qd)) in &price_map {
        let price_thb = *price_usd * usd_thb_rate;
        nav_map.insert(ticker.clone(), (ticker.clone(), None, price_thb, Some(qd.clone())));
        nav_map.insert(format!("{}:{}", ticker, ticker), (ticker.clone(), None, price_thb, Some(qd.clone())));
    }

    // กรองเฉพาะรายการกองทุนรวมเพื่อส่งให้ CalculationEngine (คัดแยกหุ้น tx_stk_ ออก เพื่อป้องกันการคำนวณซ้ำซ้อน)
    let fund_txs: Vec<Transaction> = txs
        .into_iter()
        .filter(|t| !t.id.starts_with("tx_stk_"))
        .collect();

    let mut summary = CalculationEngine::calculate_portfolio(fund_txs, &nav_map);

    // รวมข้อมูลกองทุนสำรองเลี้ยงชีพ (PVD Latest Position Snapshot)
    if let Ok(pvd_positions) = Repository::get_pvd_positions(&state.pool, &auth.user_id).await {
        for pvd in pvd_positions {
            summary.total_cost += pvd.cost;
            summary.market_value += pvd.market_value;
            summary.total_unrealized_pl += pvd.unrealized_pl;

            let entry = summary
                .platforms
                .entry("KBANK_PVD".to_string())
                .or_insert(PlatformSummary {
                    platform: "KBANK_PVD".to_string(),
                    total_cost: Decimal::ZERO,
                    market_value: Decimal::ZERO,
                    unrealized_pl: Decimal::ZERO,
                    unrealized_pl_pct: Decimal::ZERO,
                    realized_pl: Decimal::ZERO,
                    allocation_pct: Decimal::ZERO,
                });
            entry.total_cost += pvd.cost;
            entry.market_value += pvd.market_value;
            entry.unrealized_pl += pvd.unrealized_pl;

            summary.holdings.push(HoldingPosition {
                proj_id: pvd.policy_code.clone(),
                fund_abbr: pvd.policy_code,
                fund_name_th: Some(pvd.policy_name),
                platform: "KBANK_PVD".to_string(),
                total_units: pvd.units,
                avg_cost: if pvd.units > Decimal::ZERO {
                    (pvd.cost / pvd.units).round_dp(4)
                } else {
                    Decimal::ZERO
                },
                total_cost: pvd.cost,
                current_nav: pvd.nav,
                nav_date: Some(pvd.as_of_date),
                asset_type: "PVD".to_string(),
                market_value: pvd.market_value,
                unrealized_pl: pvd.unrealized_pl,
                unrealized_pl_pct: pvd.unrealized_pl_pct,
                realized_pl: Decimal::ZERO,
                total_dividend: Decimal::ZERO,
                currency: None,
                price_foreign: None,
                avg_cost_foreign: None,
                exchange_rate: None,
            });
        }
    }

    // รวมข้อมูลหุ้นต่างประเทศ (US Stocks from stock_transactions)
    if let Ok(stock_rows) = sqlx::query(
        r#"
        SELECT ticker, company_name, platform, trans_type, trans_date, shares, price_usd, total_thb, fee_thb
        FROM stock_transactions
        WHERE user_id = ?1
        ORDER BY trans_date ASC
        "#
    )
    .bind(&auth.user_id)
    .fetch_all(&state.pool)
    .await
    {
        struct StockTracker {
            ticker: String,
            name: String,
            platform: String,
            shares: Decimal,
            cost_thb: Decimal,
            cost_usd: Decimal,
            last_price_usd: Decimal,
            last_date: String,
        }
        let mut trackers: HashMap<String, StockTracker> = HashMap::new();
        for row in stock_rows {
            let ticker: String = row.get("ticker");
            let name: String = row.get("company_name");
            let platform: String = row.get("platform");
            let trans_type: String = row.get("trans_type");
            let trans_date: String = row.get("trans_date");
            let shares: Decimal = Decimal::from_str(&row.get::<String, _>("shares")).unwrap_or(Decimal::ZERO);
            let price_usd: Decimal = Decimal::from_str(&row.get::<String, _>("price_usd")).unwrap_or(Decimal::ZERO);
            let total_thb: Decimal = Decimal::from_str(&row.get::<String, _>("total_thb")).unwrap_or(Decimal::ZERO);
            let fee_thb: Decimal = Decimal::from_str(&row.get::<String, _>("fee_thb")).unwrap_or(Decimal::ZERO);

            let entry = trackers.entry(ticker.clone()).or_insert_with(|| StockTracker {
                ticker: ticker.clone(),
                name: if name.is_empty() { ticker.clone() } else { name },
                platform: platform.clone(),
                shares: Decimal::ZERO,
                cost_thb: Decimal::ZERO,
                cost_usd: Decimal::ZERO,
                last_price_usd: price_usd,
                last_date: trans_date.clone(),
            });

            if trans_type.to_uppercase() == "BUY" {
                entry.shares += shares;
                entry.cost_thb += total_thb + fee_thb;
                entry.cost_usd += shares * price_usd;
            } else if trans_type.to_uppercase() == "SELL" {
                if entry.shares > Decimal::ZERO {
                    let avg_thb = entry.cost_thb / entry.shares;
                    let avg_usd = entry.cost_usd / entry.shares;
                    entry.shares -= shares;
                    entry.cost_thb -= avg_thb * shares;
                    entry.cost_usd -= avg_usd * shares;
                }
            }
            entry.last_price_usd = price_usd;
            entry.last_date = trans_date;
        }

        for (_, st) in trackers {
            if st.shares > Decimal::ZERO {
                // หาราคาปัจจุบัน และวันที่ราคา จาก stock_prices (fallback เป็นราคาในรายการล่าสุด)
                let (current_price_usd, quote_date) = if let Some((p, _, d)) = price_map.get(&st.ticker) {
                    (*p, d.clone())
                } else {
                    (st.last_price_usd, st.last_date.clone())
                };

                // คำนวณราคาปัจจุบันและมูลค่าตลาดเป็นเงินบาท (THB)
                let current_price_thb = current_price_usd * usd_thb_rate;
                let market_val_thb = st.shares * current_price_thb;
                let unrealized_pl_thb = market_val_thb - st.cost_thb;
                let unrealized_pl_pct = if st.cost_thb > Decimal::ZERO {
                    ((unrealized_pl_thb / st.cost_thb) * Decimal::from(100)).round_dp(2)
                } else {
                    Decimal::ZERO
                };

                let avg_cost_usd = if st.shares > Decimal::ZERO {
                    (st.cost_usd / st.shares).round_dp(4)
                } else {
                    Decimal::ZERO
                };

                let avg_cost_thb = if st.shares > Decimal::ZERO {
                    (st.cost_thb / st.shares).round_dp(4)
                } else {
                    Decimal::ZERO
                };

                summary.total_cost += st.cost_thb;
                summary.market_value += market_val_thb;
                summary.total_unrealized_pl += unrealized_pl_thb;

                let entry = summary.platforms.entry(st.platform.clone()).or_insert(PlatformSummary {
                    platform: st.platform.clone(),
                    total_cost: Decimal::ZERO,
                    market_value: Decimal::ZERO,
                    unrealized_pl: Decimal::ZERO,
                    unrealized_pl_pct: Decimal::ZERO,
                    realized_pl: Decimal::ZERO,
                    allocation_pct: Decimal::ZERO,
                });
                entry.total_cost += st.cost_thb;
                entry.market_value += market_val_thb;
                entry.unrealized_pl += unrealized_pl_thb;

                summary.holdings.push(HoldingPosition {
                    proj_id: st.ticker.clone(),
                    fund_abbr: st.ticker.clone(),
                    fund_name_th: Some(format!("หุ้นสหรัฐฯ ({})", st.name)),
                    platform: st.platform,
                    total_units: st.shares.round_dp(4),
                    avg_cost: avg_cost_thb,
                    total_cost: st.cost_thb.round_dp(2),
                    current_nav: current_price_usd.round_dp(4),
                    nav_date: Some(quote_date),
                    asset_type: "STOCK".to_string(),
                    market_value: market_val_thb.round_dp(2),
                    unrealized_pl: unrealized_pl_thb.round_dp(2),
                    unrealized_pl_pct,
                    realized_pl: Decimal::ZERO,
                    total_dividend: Decimal::ZERO,
                    currency: Some("USD".to_string()),
                    price_foreign: Some(current_price_usd.round_dp(4)),
                    avg_cost_foreign: Some(avg_cost_usd),
                    exchange_rate: Some(usd_thb_rate.round_dp(4)),
                });
            }
        }
    }

    // คำนวณสัดส่วน % ภาพรวมใหม่
    if summary.total_cost > Decimal::ZERO {
        summary.total_unrealized_pl_pct = ((summary.total_unrealized_pl / summary.total_cost)
            * Decimal::from(100))
        .round_dp(2);
    }
    if summary.market_value > Decimal::ZERO {
        for plat in summary.platforms.values_mut() {
            plat.allocation_pct =
                ((plat.market_value / summary.market_value) * Decimal::from(100)).round_dp(2);
            if plat.total_cost > Decimal::ZERO {
                plat.unrealized_pl_pct =
                    ((plat.unrealized_pl / plat.total_cost) * Decimal::from(100)).round_dp(2);
            }
        }
    }

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

    let idempotency_key = Transaction::compute_idempotency_key(
        &auth.user_id,
        &payload.platform,
        &payload.proj_id,
        payload.fund_abbr.as_deref(),
        &payload.trans_date,
        &payload.trans_type,
        &payload.units,
        &total_amount,
        payload.note.as_deref(),
    );

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        idempotency_key: Some(idempotency_key),
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

    let inserted = Repository::insert_transaction(&state.pool, &auth.user_id, &tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "success": true,
            "inserted": inserted,
            "transaction": tx
        })),
    ))
}

/// POST /api/transactions/batch
/// บันทึกรายการธุรกรรมหลายรายการพร้อมกัน (นำเข้าจากไฟล์ CSV หรือ Statement พร้อมระบบป้องกันซ้ำ)
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

        let idempotency_key = Transaction::compute_idempotency_key(
            &auth.user_id,
            &payload.platform,
            &payload.proj_id,
            payload.fund_abbr.as_deref(),
            &payload.trans_date,
            &payload.trans_type,
            &payload.units,
            &total_amount,
            payload.note.as_deref(),
        );

        txs.push(Transaction {
            id: Uuid::new_v4().to_string(),
            idempotency_key: Some(idempotency_key),
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

    let (inserted_count, skipped_count) =
        Repository::insert_transactions_batch(&state.pool, &auth.user_id, &txs)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "success": true,
            "inserted_count": inserted_count,
            "skipped_count": skipped_count
        })),
    ))
}

/// PUT /api/transactions/:id
/// แก้ไขรายการธุรกรรม (เฉพาะรายการที่เป็นของ user_id นั้น)
pub async fn update_transaction(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<CreateTransactionPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let total_amount = payload
        .total_amount
        .unwrap_or_else(|| payload.units * payload.unit_price);

    let fee = payload.fee.unwrap_or(Decimal::ZERO);

    let idempotency_key = Transaction::compute_idempotency_key(
        &auth.user_id,
        &payload.platform,
        &payload.proj_id,
        payload.fund_abbr.as_deref(),
        &payload.trans_date,
        &payload.trans_type,
        &payload.units,
        &total_amount,
        payload.note.as_deref(),
    );

    let tx = Transaction {
        id: id.clone(),
        idempotency_key: Some(idempotency_key),
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

    let updated = Repository::update_transaction(&state.pool, &auth.user_id, &id, &tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if updated {
        Ok(Json(serde_json::json!({
            "success": true,
            "message": "Transaction updated",
            "transaction": tx
        })))
    } else {
        Err((StatusCode::NOT_FOUND, "Transaction not found".to_string()))
    }
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

#[derive(Debug, Deserialize)]
pub struct BulkDeletePayload {
    pub ids: Vec<String>,
}

/// POST /api/transactions/bulk-delete
/// ลบรายการธุรกรรมหลายรายการพร้อมกันในคราวเดียว
pub async fn bulk_delete_transactions(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BulkDeletePayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let count = Repository::delete_transactions_bulk(&state.pool, &auth.user_id, &payload.ids)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "deleted_count": count,
        "message": format!("Deleted {} transactions", count)
    })))
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
/// Trigger การดึงราคา NAV ล่าสุดจาก SEC API และราคาหุ้นสหรัฐฯ / อัตราแลกเปลี่ยนจาก Yahoo Finance ทันที
pub async fn trigger_sync(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let count = SyncService::sync_held_funds(&state.pool, &state.api_key)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stock_count = SyncService::sync_stock_prices(&state.pool)
        .await
        .unwrap_or(0);

    let latest_fund_date = sqlx::query_scalar::<_, String>(
        "SELECT MAX(nav_date) FROM fund_nav_history",
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let latest_stock_date = sqlx::query_scalar::<_, String>(
        "SELECT MAX(quote_date) FROM stock_prices",
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let latest_date = match (latest_fund_date, latest_stock_date) {
        (Some(f), Some(s)) => Some(std::cmp::max(f, s)),
        (Some(f), None) => Some(f),
        (None, Some(s)) => Some(s),
        (None, None) => None,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "updated_funds_count": count + stock_count,
        "latest_nav_date": latest_date
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
1. fund_abbr: COMPLETE fund name or ticker. Never truncate. Preserve exact unitholder share class suffixes (e.g. 'SCBS&P500E', 'NDQ(E)', 'SCBNDQ(E)', 'K-FIXEDPLUS-A', 'ES-USTECH').
2. platform: The asset management company (AMC) or distributing broker (e.g. 'SCB' for บลจ. ไทยพาณิชย์ / SCBAM, 'KBANK' for บลจ. กสิกรไทย, 'TTB' for TTB / Eastspring, 'DIME' for Dime!).
   CRITICAL: 'ผู้ดูแลผลประโยชน์ / Fund Supervisor / Custodian' is merely the custodian bank, NOT the platform! For example, if a statement is issued by SCB Asset Management (บลจ. ไทยพาณิชย์), the platform MUST strictly be 'SCB', even if 'ผู้ดูแลผลประโยชน์' is ธนาคารกสิกรไทย (KBank).
3. trans_type: 'BUY', 'SELL', or 'DIVIDEND' (SUBSCRIPTION=BUY, REDEMPTION=SELL, SWITCH IN=BUY, SWITCH OUT=SELL).
4. trans_date: 'YYYY-MM-DD' (convert Buddhist Era 25xx to CE 20xx e.g. 2567->2024).
5. note: Only short transaction ref or empty string.

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
            "responseMimeType": "application/json",
            "thinkingConfig": {
                "thinkingBudget": 0
            }
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
                    let mut platform = row
                        .get(1)
                        .and_then(|v| v.as_str())
                        .unwrap_or("OTHER")
                        .to_string();
                    let fund_abbr = row
                        .get(2)
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();

                    // Sanity check: prevent custodian bank (e.g. KBank as fund supervisor) from overriding SCB/TTB platform
                    let upper_fund = fund_abbr.to_uppercase();
                    if (upper_fund.starts_with("SCB") || upper_fund.starts_with("SP500E") || upper_fund.starts_with("NDQ(")) && platform == "KBANK" {
                        platform = "SCB".to_string();
                    } else if (upper_fund.starts_with("ES-") || upper_fund.starts_with("TMB") || upper_fund.starts_with("TTB")) && platform == "KBANK" {
                        platform = "TTB".to_string();
                    }
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
        let prompt_tokens = u
            .get("promptTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let candidates_tokens = u
            .get("candidatesTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let thoughts_tokens = u
            .get("thoughtsTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let total_tokens = u
            .get("totalTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(prompt_tokens + candidates_tokens + thoughts_tokens);

        serde_json::json!({
            "prompt_tokens": prompt_tokens,
            "candidates_tokens": candidates_tokens,
            "thoughts_tokens": thoughts_tokens,
            "total_tokens": total_tokens,
        })
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "count": parsed.len(),
        "transactions": parsed,
        "usage": usage,
    })))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UserSettingsPayload {
    pub gmail_account: Option<String>,
    pub gmail_app_password: Option<String>,
    pub dob_day: Option<String>,
    pub dob_month: Option<String>,
    pub dob_year_ce: Option<String>,
    pub dob_year_be: Option<String>,
    pub national_id_last5: Option<String>,
    pub custom_pdf_passwords: Option<String>,
    pub auto_sync_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TestEmailPayload {
    pub gmail_account: Option<String>,
    pub gmail_app_password: Option<String>,
}

/// GET /api/settings/profile
pub async fn get_user_settings(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut settings = Repository::get_user_settings(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Mask password in response for security
    if settings.gmail_app_password.is_some() {
        settings.gmail_app_password = Some("********".to_string());
    }

    Ok(Json(settings))
}

/// POST /api/settings/profile
pub async fn update_user_settings(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UserSettingsPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let settings = UserSettings {
        user_id: auth.user_id.clone(),
        gmail_account: payload.gmail_account,
        gmail_app_password: payload.gmail_app_password,
        dob_day: payload.dob_day,
        dob_month: payload.dob_month,
        dob_year_ce: payload.dob_year_ce,
        dob_year_be: payload.dob_year_be,
        national_id_last5: payload.national_id_last5,
        custom_pdf_passwords: payload.custom_pdf_passwords,
        auto_sync_enabled: payload.auto_sync_enabled.unwrap_or(false),
        last_sync_at: None,
    };

    Repository::upsert_user_settings(&state.pool, &settings)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut current = Repository::get_user_settings(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if current.gmail_app_password.is_some() {
        current.gmail_app_password = Some("********".to_string());
    }

    Ok(Json(current))
}

/// POST /api/email/test-connection
pub async fn test_email_connection(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TestEmailPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let settings = Repository::get_user_settings(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let gmail = payload
        .gmail_account
        .or(settings.gmail_account)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "กรุณากรอก Gmail Account".to_string()))?;

    let app_pwd = payload
        .gmail_app_password
        .filter(|p| p != "********" && !p.is_empty())
        .or(settings.gmail_app_password)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "กรุณากรอก Gmail App Password".to_string()))?;

    let output = tokio::process::Command::new("python")
        .args([
            "scripts/email_harvester.py",
            "--action",
            "test",
            "--gmail",
            &gmail,
            "--app-password",
            &app_pwd,
        ])
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to spawn harvester: {e}")))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    if let Ok(json_res) = serde_json::from_str::<serde_json::Value>(stdout_str.trim()) {
        Ok(Json(json_res))
    } else {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        Err((
            StatusCode::BAD_GATEWAY,
            format!("Error running email harvester: {stdout_str} {stderr_str}"),
        ))
    }
}

async fn is_pid_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let out = tokio::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .await;
        if let Ok(o) = out {
            let s = String::from_utf8_lossy(&o.stdout);
            return s.contains(&pid.to_string()) && !s.contains("No tasks");
        }
        false
    }
    #[cfg(not(windows))]
    {
        let out = tokio::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .await;
        if let Ok(o) = out {
            return o.status.success();
        }
        false
    }
}

/// POST /api/email/sync/start
/// สั่งเริ่มการสแกนอีเมลในโหมด Background Process (Async) พร้อมบันทึก PID
pub async fn start_email_sync(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut pid_guard = state.email_sync_pid.lock().await;

    if let Some(pid) = *pid_guard {
        if is_pid_alive(pid).await {
            return Ok(Json(serde_json::json!({
                "already_running": true,
                "message": "การสแกนกำลังทำงานอยู่แล้ว",
                "pid": pid
            })));
        } else {
            *pid_guard = None;
        }
    }

    let settings = Repository::get_user_settings(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let gmail = settings
        .gmail_account
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "ยังไม่ได้ตั้งค่า Gmail Account ใน Settings".to_string()))?;
    let app_pwd = settings
        .gmail_app_password
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "ยังไม่ได้ตั้งค่า Gmail App Password ใน Settings".to_string()))?;

    let dob_day = settings.dob_day.unwrap_or_else(|| "01".to_string());
    let dob_month = settings.dob_month.unwrap_or_else(|| "01".to_string());
    let dob_year_ce = settings.dob_year_ce.unwrap_or_else(|| "1980".to_string());
    let dob_year_be = settings.dob_year_be.unwrap_or_else(|| "2523".to_string());
    let national_id_last5 = settings.national_id_last5.unwrap_or_default();

    let initial_progress = serde_json::json!({
        "is_running": true,
        "completed": false,
        "cancelled": false,
        "user_id": auth.user_id,
        "broker": "STARTING",
        "broker_index": 0,
        "total_brokers": 5,
        "email_index": 0,
        "total_emails": 0,
        "current_subject": "",
        "current_attachment": "",
        "emails_scanned": 0,
        "attachments_found": 0,
        "transactions_inserted": 0,
        "transactions_skipped": 0,
        "tokens_used": { "prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0 },
        "status_text": "กำลังเริ่มต้นระบบและเชื่อมต่อ Gmail...",
        "started_at": chrono::Utc::now().to_rfc3339(),
        "recent_logs": ["กำลังเริ่มต้นกระบวนการสแกนอีเมล..."]
    });
    let _ = tokio::fs::write("sync_progress.json", initial_progress.to_string()).await;

    let child = tokio::process::Command::new("python")
        .args([
            "scripts/email_harvester.py",
            "--action",
            "sync",
            "--user-id",
            &auth.user_id,
            "--gmail",
            &gmail,
            "--app-password",
            &app_pwd,
            "--dob-day",
            &dob_day,
            "--dob-month",
            &dob_month,
            "--dob-year-ce",
            &dob_year_ce,
            "--dob-year-be",
            &dob_year_be,
            "--national-id-last5",
            &national_id_last5,
            "--db-path",
            "portfolio.db",
            "--gemini-api-key",
            &state.gemini_api_key,
            "--max-emails",
            "0",
            "--concurrency",
            "5",
        ])
        .spawn()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to spawn harvester: {e}")))?;

    let pid = child.id().unwrap_or(0);
    *pid_guard = Some(pid);

    Ok(Json(serde_json::json!({
        "started": true,
        "pid": pid,
        "message": "เริ่มการสแกนอีเมลเรียบร้อยแล้ว"
    })))
}

/// GET /api/email/sync/status
/// ตรวจสอบสถานะ ความคืบหน้า และ log ล่าสุดของการสแกนอีเมล
pub async fn get_email_sync_status(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut pid_guard = state.email_sync_pid.lock().await;
    let mut is_running = false;
    if let Some(pid) = *pid_guard {
        if is_pid_alive(pid).await {
            is_running = true;
        } else {
            *pid_guard = None;
        }
    }

    // Dual-Mode Reading: Prioritize fast Binary Envelope (sync_progress.bin), fallback to sync_progress.json
    let mut progress_val = if let Ok(bin_bytes) = tokio::fs::read("sync_progress.bin").await {
        match crate::codec::BinaryEnvelopeCodec::decode_sync_progress(&bin_bytes) {
            Ok(s) => {
                let mut broker: Option<String> = None;
                let mut email_index: Option<u32> = None;
                let mut total_emails = s.total_emails;

                // Extract [BROKER] [curr/total] from status_text if present e.g. "[TTB] [12/167]"
                if let Some(rest) = s.status_text.strip_prefix('[') {
                    if let Some((b_str, after_b)) = rest.split_once(']') {
                        broker = Some(b_str.trim().to_string());
                        if let Some(start_idx) = after_b.find('[') {
                            if let Some(end_idx) = after_b[start_idx..].find(']') {
                                let counts = &after_b[start_idx + 1..start_idx + end_idx];
                                if let Some((curr, tot)) = counts.split_once('/') {
                                    if let Ok(c) = curr.trim().parse::<u32>() {
                                        email_index = Some(c);
                                    }
                                    if let Ok(t) = tot.trim().parse::<u32>() {
                                        total_emails = t;
                                    }
                                }
                            }
                        }
                    }
                }

                let mut val = serde_json::json!({
                    "is_running": s.is_running,
                    "completed": s.completed,
                    "cancelled": s.cancelled,
                    "emails_scanned": s.emails_scanned,
                    "total_emails": total_emails,
                    "attachments_found": s.attachments_found,
                    "new_tx_count": s.new_tx_count,
                    "skipped_tx_count": s.skipped_tx_count,
                    "status_text": s.status_text,
                    "recent_logs": s.recent_logs,
                    "codec": "binary_envelope_v1"
                });
                if let Some(b) = broker {
                    val["broker"] = serde_json::json!(b);
                }
                if let Some(idx) = email_index {
                    val["email_index"] = serde_json::json!(idx);
                }
                val
            }
            Err(e) => {
                tracing::warn!("[BinaryEnvelope] Failed to decode sync_progress.bin ({e}), trying JSON");
                if let Ok(content) = tokio::fs::read_to_string("sync_progress.json").await {
                    serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
                } else {
                    serde_json::json!({})
                }
            }
        }
    } else if let Ok(content) = tokio::fs::read_to_string("sync_progress.json").await {
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({
            "is_running": false,
            "completed": false,
            "status_text": "ยังไม่มีการสแกน"
        })
    };

    if let Some(obj) = progress_val.as_object_mut() {
        if !is_running && obj.get("is_running").and_then(|v| v.as_bool()).unwrap_or(false) {
            obj.insert("is_running".to_string(), serde_json::json!(false));
            if !obj.contains_key("completed") || !obj.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) {
                obj.insert("completed".to_string(), serde_json::json!(true));
            }
        } else if is_running {
            obj.insert("is_running".to_string(), serde_json::json!(true));
        }

        if let Ok(log_content) = tokio::fs::read_to_string("email_sync.log").await {
            let lines: Vec<&str> = log_content.lines().collect();
            let tail_lines: Vec<String> = lines.into_iter().rev().take(15).rev().map(|s| s.to_string()).collect();
            if !tail_lines.is_empty() {
                obj.insert("log_tail".to_string(), serde_json::json!(tail_lines));
            }
        }
    }

    Ok(Json(progress_val))
}

/// POST /api/email/sync/cancel
/// สั่งยกเลิก (Force Kill) กระบวนการสแกนอีเมลที่กำลังทำงานอยู่
pub async fn cancel_email_sync(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut pid_guard = state.email_sync_pid.lock().await;

    if let Some(pid) = *pid_guard {
        tracing::warn!("[!] Cancelling email sync process with PID {}", pid);
        #[cfg(windows)]
        {
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
        }
        #[cfg(not(windows))]
        {
            let _ = tokio::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .await;
        }
        *pid_guard = None;
    }

    let mut progress_val = if let Ok(content) = tokio::fs::read_to_string("sync_progress.json").await {
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if let Some(obj) = progress_val.as_object_mut() {
        obj.insert("is_running".to_string(), serde_json::json!(false));
        obj.insert("completed".to_string(), serde_json::json!(false));
        obj.insert("cancelled".to_string(), serde_json::json!(true));
        obj.insert("status_text".to_string(), serde_json::json!("การสแกนถูกยกเลิกโดยผู้ใช้งาน"));
        if let Some(logs) = obj.get_mut("recent_logs").and_then(|v| v.as_array_mut()) {
            logs.push(serde_json::json!("🛑 การสแกนอีเมลถูกยกเลิกโดยผู้ใช้"));
        }
    }
    let _ = tokio::fs::write("sync_progress.json", progress_val.to_string()).await;

    Ok(Json(serde_json::json!({
        "cancelled": true,
        "message": "ยกเลิกการสแกนอีเมลเรียบร้อยแล้ว"
    })))
}

/// GET /api/email/sync/cache/stats
/// ดึงสถิติจำนวนอีเมลและไฟล์แนบที่เคยประมวลผลแล้วในแคช
pub async fn get_sync_cache_stats(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let stats = Repository::get_sync_cache_stats(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(stats))
}

#[derive(Debug, Deserialize)]
pub struct ResetCachePayload {
    pub broker: Option<String>,
    pub clear_attachments: Option<bool>,
    pub clear_pending: Option<bool>,
}

/// POST /api/email/sync/cache/reset
/// ล้างแคชประวัติการสแกนอีเมล (เพื่อให้ระบบสามารถสแกนอีเมลฉบับเก่าซ้ำใหม่ได้)
pub async fn reset_sync_cache(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetCachePayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = Repository::reset_sync_cache(
        &state.pool,
        &auth.user_id,
        payload.broker.as_deref(),
        payload.clear_attachments.unwrap_or(true),
        payload.clear_pending.unwrap_or(false),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct CacheListQuery {
    pub broker: Option<String>,
    pub limit: Option<i64>,
}

/// GET /api/email/sync/cache/list
/// ดึงรายการอีเมลในแคช
pub async fn list_cached_emails(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Query(query): Query<CacheListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let list = Repository::list_cached_emails(
        &state.pool,
        query.broker.as_deref(),
        query.limit.unwrap_or(100),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(list))
}

/// DELETE /api/email/sync/cache/:message_id
/// ลบอีเมลฉบับเดียวออกจากแคช
pub async fn delete_cached_email(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let deleted = Repository::delete_cached_email(&state.pool, &message_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

/// GET /api/email/sync/brokers
pub async fn get_email_brokers(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let brokers = Repository::get_email_broker_configs(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(brokers))
}

/// PUT /api/email/sync/brokers
pub async fn update_email_brokers(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(brokers): Json<Vec<crate::db::schema::EmailBrokerConfig>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    Repository::update_email_broker_configs(&state.pool, &brokers)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let updated = Repository::get_email_broker_configs(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(updated))
}

/// POST /api/email/sync/brokers/reset
pub async fn reset_email_brokers(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let reset = Repository::reset_email_broker_configs(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(reset))
}

/// POST /api/email/sync
pub async fn sync_email_statements(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let settings = Repository::get_user_settings(&state.pool, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let gmail = settings
        .gmail_account
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "ยังไม่ได้ตั้งค่า Gmail Account ใน Settings".to_string()))?;
    let app_pwd = settings
        .gmail_app_password
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "ยังไม่ได้ตั้งค่า Gmail App Password ใน Settings".to_string()))?;

    let dob_day = settings.dob_day.unwrap_or_else(|| "01".to_string());
    let dob_month = settings.dob_month.unwrap_or_else(|| "01".to_string());
    let dob_year_ce = settings.dob_year_ce.unwrap_or_else(|| "1980".to_string());
    let dob_year_be = settings.dob_year_be.unwrap_or_else(|| "2523".to_string());
    let national_id_last5 = settings.national_id_last5.unwrap_or_default();

    let output = tokio::process::Command::new("python")
        .args([
            "scripts/email_harvester.py",
            "--action",
            "sync",
            "--user-id",
            &auth.user_id,
            "--gmail",
            &gmail,
            "--app-password",
            &app_pwd,
            "--dob-day",
            &dob_day,
            "--dob-month",
            &dob_month,
            "--dob-year-ce",
            &dob_year_ce,
            "--dob-year-be",
            &dob_year_be,
            "--national-id-last5",
            &national_id_last5,
            "--db-path",
            "portfolio.db",
            "--gemini-api-key",
            &state.gemini_api_key,
            "--max-emails",
            "0", // 0 = Full sweep from oldest to newest with Checkpoint & Resume cache!
            "--concurrency",
            "5",
        ])
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to spawn harvester: {e}")))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    if let Ok(json_res) = serde_json::from_str::<serde_json::Value>(stdout_str.trim()) {
        Ok(Json(json_res))
    } else {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        Err((
            StatusCode::BAD_GATEWAY,
            format!("Error running email sync: {stdout_str} {stderr_str}"),
        ))
    }
}

// ==========================================
// Staged Import (Review Before Commit) APIs
// ==========================================

#[derive(Debug, Deserialize)]
pub struct NavByDateQuery {
    pub proj_id: String,
    pub date: String,
    pub fund_abbr: Option<String>,
}

/// GET /api/nav/by-date?proj_id=...&date=YYYY-MM-DD&fund_abbr=...
pub async fn get_nav_by_date(
    Query(params): Query<NavByDateQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut result = Repository::get_nav_by_date(
        &state.pool, 
        &params.proj_id, 
        &params.date, 
        params.fund_abbr.as_deref()
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // If not found in local history, on-demand fetch from SEC API!
    if result.is_none() && !state.api_key.is_empty() {
        let trimmed = params.proj_id.trim();
        let alias_proj_id = sqlx::query_scalar::<_, String>(
            "SELECT proj_id FROM fund_aliases WHERE UPPER(alias) = UPPER(?1) LIMIT 1",
        )
        .bind(trimmed)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        let sec_proj_id = if let Some(pid) = alias_proj_id {
            pid
        } else if let Ok(Some(row)) = sqlx::query(
            "SELECT proj_id FROM funds WHERE UPPER(proj_abbr_name) = UPPER(?1) OR proj_id = ?1 LIMIT 1",
        )
        .bind(trimmed)
        .fetch_optional(&state.pool)
        .await
        {
            row.get::<String, _>("proj_id")
        } else {
            trimmed.to_string()
        };

        let mut sec_client = crate::sec::SecClient::new(state.api_key.clone());
        if let Ok(nav_items) = sec_client.get_fund_nav_history(&sec_proj_id).await {
            if !nav_items.is_empty() {
                let _ = Repository::upsert_nav_history(&state.pool, &sec_proj_id, &nav_items).await;
                if sec_proj_id != trimmed {
                    let _ = Repository::upsert_nav_history(&state.pool, trimmed, &nav_items).await;
                }
                result = Repository::get_nav_by_date(
                    &state.pool, 
                    &params.proj_id, 
                    &params.date, 
                    params.fund_abbr.as_deref()
                ).await.unwrap_or(None);
            }
        }
    }

    match result {
        Some(res) => Ok(Json(res)),
        None => Err((
            StatusCode::NOT_FOUND,
            format!("No NAV found for {} on or before {}", params.proj_id, params.date),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct NavMonthQuery {
    pub proj_id: String,
    pub month: String,
    pub fund_abbr: Option<String>,
}

/// GET /api/nav/month-dates?proj_id=...&month=YYYY-MM&fund_abbr=...
pub async fn get_nav_dates_for_month(
    Query(params): Query<NavMonthQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut result = Repository::get_nav_dates_for_month(
        &state.pool,
        &params.proj_id,
        &params.month,
        params.fund_abbr.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // If no NAV in local database, fetch on-demand from SEC API!
    if result.is_empty() && !state.api_key.is_empty() {
        let trimmed = params.proj_id.trim();
        let alias_proj_id = sqlx::query_scalar::<_, String>(
            "SELECT proj_id FROM fund_aliases WHERE UPPER(alias) = UPPER(?1) LIMIT 1",
        )
        .bind(trimmed)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        let sec_proj_id = if let Some(pid) = alias_proj_id {
            pid
        } else if let Ok(Some(row)) = sqlx::query(
            "SELECT proj_id FROM funds WHERE UPPER(proj_abbr_name) = UPPER(?1) OR proj_id = ?1 LIMIT 1",
        )
        .bind(trimmed)
        .fetch_optional(&state.pool)
        .await
        {
            row.get::<String, _>("proj_id")
        } else {
            trimmed.to_string()
        };

        let mut sec_client = crate::sec::SecClient::new(state.api_key.clone());
        if let Ok(nav_items) = sec_client.get_fund_nav_history(&sec_proj_id).await {
            if !nav_items.is_empty() {
                let _ = Repository::upsert_nav_history(&state.pool, &sec_proj_id, &nav_items).await;
                if sec_proj_id != trimmed {
                    let _ = Repository::upsert_nav_history(&state.pool, trimmed, &nav_items).await;
                }
                if let Ok(fresh) = Repository::get_nav_dates_for_month(
                    &state.pool,
                    &sec_proj_id,
                    &params.month,
                    params.fund_abbr.as_deref(),
                ).await {
                    result = fresh;
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "proj_id": params.proj_id,
        "month": params.month,
        "nav_dates": result
    })))
}

#[derive(Debug, Deserialize)]
pub struct PendingQuery {
    pub status: Option<String>,
}

/// GET /api/transactions/pending?status=PENDING
pub async fn get_pending_transactions(
    auth: AuthUser,
    Query(query): Query<PendingQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let list = Repository::get_pending_transactions(&state.pool, &auth.user_id, query.status.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(list))
}

/// POST /api/transactions/pending (เพิ่มรายการ Pending ด้วยตัวเอง)
pub async fn create_pending_transaction(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::domain::CreatePendingPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let id = Repository::insert_pending_transaction(&state.pool, &auth.user_id, &payload)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id, "status": "created" }))))
}

/// POST /api/transactions/pending/batch (เพิ่มรายการ Pending เป็นชุดจาก Universal Importer หรือ Batch Entry)
pub async fn create_pending_transactions_batch(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(batch): Json<Vec<crate::domain::CreatePendingPayload>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let count = Repository::insert_pending_transactions_batch(&state.pool, &auth.user_id, &batch)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "inserted_count": count, "status": "staged" }))))
}

/// PATCH /api/transactions/pending/:id
pub async fn update_pending_transaction(
    auth: AuthUser,
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(patch): Json<crate::domain::PendingPatch>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let updated = Repository::update_pending_transaction(&state.pool, &id, &auth.user_id, &patch)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if updated {
        Ok(Json(serde_json::json!({ "status": "updated", "id": id })))
    } else {
        Err((StatusCode::NOT_FOUND, "Pending transaction not found".to_string()))
    }
}

/// DELETE /api/transactions/pending/:id
pub async fn delete_pending_transaction(
    auth: AuthUser,
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let deleted = Repository::delete_pending_transaction(&state.pool, &id, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if deleted {
        Ok(Json(serde_json::json!({ "status": "deleted", "id": id })))
    } else {
        Err((StatusCode::NOT_FOUND, "Pending transaction not found".to_string()))
    }
}

/// POST /api/transactions/pending/commit
pub async fn commit_pending_transactions(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::domain::CommitPendingPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let committed = if payload.all.unwrap_or(false) {
        Repository::commit_all_pending(&state.pool, &auth.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else if let Some(ids) = payload.ids {
        Repository::commit_pending_transactions(&state.pool, &ids, &auth.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        0
    };

    Ok(Json(serde_json::json!({ "status": "committed", "count": committed })))
}

#[derive(Debug, Deserialize)]
pub struct BatchDeletePendingPayload {
    pub ids: Vec<String>,
}

/// POST /api/transactions/pending/batch-delete
pub async fn batch_delete_pending(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BatchDeletePendingPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let deleted = Repository::batch_delete_pending(&state.pool, &payload.ids, &auth.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "deleted", "count": deleted })))
}

/// GET /api/debug/sentry-test
pub async fn sentry_test_trigger() -> impl IntoResponse {
    let env_name = std::env::var("SENTRY_ENVIRONMENT")
        .unwrap_or_else(|_| "production".into())
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string();
    let event_id = sentry::capture_message(
        "Manual Sentry Verification Test from Fund Portfolio API",
        sentry::Level::Warning,
    );
    Json(serde_json::json!({
        "status": "ok",
        "message": "Sentry verification event captured successfully",
        "environment": env_name,
        "event_id": event_id.to_string()
    }))
}

/// GET /api/cron/status (ตรวจสอบสถานะ Daily NAV Scheduler Daemon - Slice 33)
pub async fn get_cron_status(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let enabled = std::env::var("DAILY_NAV_SYNC_ENABLED")
        .unwrap_or_else(|_| "true".into())
        .parse::<bool>()
        .unwrap_or(true);

    let target_hour = std::env::var("DAILY_NAV_SYNC_HOUR")
        .unwrap_or_else(|_| "20".into())
        .parse::<u32>()
        .unwrap_or(20);

    let target_minute = std::env::var("DAILY_NAV_SYNC_MINUTE")
        .unwrap_or_else(|_| "30".into())
        .parse::<u32>()
        .unwrap_or(30);

    let now_ict = crate::cron::DailyNavScheduler::now_ict();
    let last_run = Repository::get_last_scheduled_sync_log(&state.pool, crate::cron::DailyNavScheduler::JOB_NAME)
        .await
        .unwrap_or(None);

    Json(serde_json::json!({
        "enabled": enabled,
        "target_time_ict": format!("{:02}:{:02}", target_hour, target_minute),
        "current_time_ict": now_ict.format("%Y-%m-%d %H:%M:%S").to_string(),
        "job_name": crate::cron::DailyNavScheduler::JOB_NAME,
        "last_run": last_run
    }))
}

/// GET /api/nav/backfill/status (ตรวจสอบความคืบหน้าการดึงประวัติราคา NAV ย้อนหลัง - Slice 30)
pub async fn get_nav_backfill_status(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match crate::sync::BackfillService::get_status(&state.pool).await {
        Ok(status) => (StatusCode::OK, Json(serde_json::to_value(status).unwrap_or_default())),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

/// POST /api/nav/backfill/start (สั่งเริ่มหรือกลับมาดึงประวัติราคา NAV ต่อ - Slice 30)
pub async fn start_nav_backfill() -> impl IntoResponse {
    crate::sync::BackfillService::resume();
    Json(serde_json::json!({
        "status": "ok",
        "message": "Historical NAV backfill service resumed"
    }))
}

/// POST /api/nav/backfill/pause (สั่งพักการดึงประวัติราคา NAV ชั่วคราว - Slice 30)
pub async fn pause_nav_backfill() -> impl IntoResponse {
    crate::sync::BackfillService::pause();
    Json(serde_json::json!({
        "status": "ok",
        "message": "Historical NAV backfill service paused"
    }))
}
