#![allow(dead_code)]
use super::DbPool;
use crate::domain::{
    FundSuggestion, NavByDateResult, NavMap, PendingPatch, PendingTransaction, Platform,
    PvdPosition, Transaction, TransactionType, UserSettings,
};
use crate::sec::models::{DailyNavInfo, FundProfile};
use rust_decimal::Decimal;
use sqlx::Row;
use std::collections::HashMap;
use std::str::FromStr;

pub struct Repository;

impl Repository {
    /// บันทึกรายชื่อ บลจ. จาก SEC Open API เข้าตาราง brokers
    pub async fn upsert_amc_brokers(
        pool: &DbPool,
        amcs: &[crate::sec::models::AmcInfo],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        for amc in amcs {
            let name_th = amc
                .comp_name_th
                .clone()
                .unwrap_or_else(|| amc.unique_id.clone());
            let name_en = amc
                .comp_name_en
                .clone()
                .unwrap_or_else(|| amc.unique_id.clone());

            sqlx::query(
                r#"
                INSERT INTO brokers (code, name_th, name_en, category)
                VALUES (?1, ?2, ?3, 'AMC')
                ON CONFLICT(code) DO UPDATE SET
                    name_th = excluded.name_th,
                    name_en = excluded.name_en
                "#,
            )
            .bind(&amc.unique_id)
            .bind(&name_th)
            .bind(&name_en)
            .execute(pool)
            .await?;
        }
        Ok(())
    }

    /// ดึงรายชื่อโบรกเกอร์ ตัวแทนขาย และ บลจ. ทั้งหมด เพื่อทำ Dropdown
    pub async fn get_all_brokers(
        pool: &DbPool,
    ) -> Result<Vec<crate::db::schema::BrokerItem>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT code, name_th, name_en, category
            FROM brokers
            ORDER BY 
                CASE WHEN category = 'RETAIL' THEN 1 ELSE 2 END,
                name_th ASC
            "#,
        )
        .fetch_all(pool)
        .await?;

        let mut list = Vec::new();
        for row in rows {
            list.push(crate::db::schema::BrokerItem {
                code: row.get("code"),
                name_th: row.get("name_th"),
                name_en: row.get("name_en"),
                category: row.get("category"),
            });
        }
        Ok(list)
    }

    /// เพิ่มหรืออัปเดตข้อมูลกองทุนลงฐานข้อมูล
    pub async fn upsert_funds(
        pool: &DbPool,
        funds: &[FundProfile],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        for fund in funds {
            sqlx::query(
                r#"
                INSERT INTO funds (
                    proj_id, unique_id, proj_abbr_name, proj_name_th, 
                    proj_name_en, fund_status, fund_class_name, policy_desc
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(proj_id) DO UPDATE SET
                    unique_id = excluded.unique_id,
                    proj_abbr_name = excluded.proj_abbr_name,
                    proj_name_th = excluded.proj_name_th,
                    proj_name_en = excluded.proj_name_en,
                    fund_status = excluded.fund_status,
                    fund_class_name = excluded.fund_class_name,
                    policy_desc = excluded.policy_desc,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&fund.proj_id)
            .bind(&fund.unique_id)
            .bind(&fund.proj_abbr_name)
            .bind(&fund.proj_name_th)
            .bind(&fund.proj_name_en)
            .bind(&fund.fund_status)
            .bind(&fund.fund_class_name)
            .bind(&fund.policy_desc)
            .execute(pool)
            .await?;
        }
        Ok(())
    }

    /// บันทึกประวัติราคา NAV รายวัน (ใช้ Database Transaction เพื่อประสิทธิภาพสูงสุด)
    pub async fn upsert_nav_history(
        pool: &DbPool,
        proj_id: &str,
        nav_items: &[DailyNavInfo],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if nav_items.is_empty() {
            return Ok(());
        }

        let mut tx = pool.begin().await?;

        for item in nav_items {
            let last_val_str = item.last_val.map(|v| v.to_string()).unwrap_or_default();
            let buy_price_str = item.buy_price.map(|v| v.to_string());
            let sell_price_str = item.sell_price.map(|v| v.to_string());

            let fund_class_name = item.fund_class_name.as_deref().unwrap_or("");
            sqlx::query(
                r#"
                INSERT INTO fund_nav_history (
                    proj_id, nav_date, nav, buy_price, sell_price, fund_class_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(proj_id, nav_date, fund_class_name) DO UPDATE SET
                    nav = excluded.nav,
                    buy_price = excluded.buy_price,
                    sell_price = excluded.sell_price,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(proj_id)
            .bind(&item.nav_date)
            .bind(&last_val_str)
            .bind(&buy_price_str)
            .bind(&sell_price_str)
            .bind(fund_class_name)
            .execute(&mut *tx)
            .await?;
        }

        // อัปเดตราคาล่าสุดลงในตาราง funds เพียงครั้งเดียวด้วยรายการที่มีราคาล่าสุด
        if let Some(last_item) = nav_items.iter().rev().find(|it| it.last_val.is_some())
            && let Some(val) = last_item.last_val
        {
            sqlx::query(
                r#"
                UPDATE funds 
                SET last_nav = ?1, last_nav_date = ?2, updated_at = CURRENT_TIMESTAMP
                WHERE proj_id = ?3 AND (last_nav_date IS NULL OR last_nav_date <= ?2)
                "#,
            )
            .bind(val.to_string())
            .bind(&last_item.nav_date)
            .bind(proj_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// ดึงราคา NAV ล่าสุดของทุกกองทุน เพื่อใช้คำนวณพอร์ต (สำหรับ user_id)
    /// Return: HashMap<proj_id, (Fund Abbr, Fund Name TH, Latest NAV)>
    pub async fn get_latest_nav_map(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<NavMap, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                t.proj_id,
                COALESCE(
                    t.fund_abbr,
                    (SELECT proj_abbr_name FROM funds WHERE proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id) LIMIT 1),
                    t.proj_id
                ) AS proj_abbr_name,
                (SELECT proj_name_th FROM funds WHERE proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id) LIMIT 1) AS proj_name_th,
                COALESCE(
                    -- 1. Exact Share Class Match in fund_nav_history
                    (
                        SELECT COALESCE(NULLIF(NULLIF(nav, 'None'), ''), buy_price, sell_price)
                        FROM fund_nav_history
                        WHERE proj_id = t.proj_id
                          AND (
                              fund_class_name = t.fund_abbr 
                              OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = t.fund_abbr LIMIT 1)
                              OR (t.fund_abbr IS NULL AND fund_class_name = (SELECT proj_abbr_name FROM funds WHERE proj_id = t.proj_id LIMIT 1))
                          )
                          AND ((nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0')
                            OR (buy_price IS NOT NULL AND buy_price != 'None' AND buy_price != '' AND buy_price != '0'))
                        ORDER BY nav_date DESC
                        LIMIT 1
                    ),
                    -- 2. Fallback to latest fund_nav_history for single-class funds
                    (
                        SELECT COALESCE(NULLIF(NULLIF(nav, 'None'), ''), buy_price, sell_price)
                        FROM fund_nav_history
                        WHERE proj_id = t.proj_id
                          AND ((nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0')
                            OR (buy_price IS NOT NULL AND buy_price != 'None' AND buy_price != '' AND buy_price != '0'))
                        ORDER BY nav_date DESC
                        LIMIT 1
                    ),
                    (SELECT last_nav FROM funds WHERE (proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id)) AND last_nav IS NOT NULL AND last_nav != '0' AND last_nav != 'None' LIMIT 1),
                    (
                        SELECT CAST(unit_price AS TEXT)
                        FROM transactions
                        WHERE user_id = ?1 AND proj_id = t.proj_id AND unit_price > 0
                        ORDER BY trans_date DESC, rowid DESC
                        LIMIT 1
                    ),
                    '0'
                ) AS last_nav,
                COALESCE(
                    -- 1. Exact Share Class Date in fund_nav_history
                    (
                        SELECT nav_date
                        FROM fund_nav_history
                        WHERE proj_id = t.proj_id
                          AND (
                              fund_class_name = t.fund_abbr 
                              OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = t.fund_abbr LIMIT 1)
                              OR (t.fund_abbr IS NULL AND fund_class_name = (SELECT proj_abbr_name FROM funds WHERE proj_id = t.proj_id LIMIT 1))
                          )
                          AND ((nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0')
                            OR (buy_price IS NOT NULL AND buy_price != 'None' AND buy_price != '' AND buy_price != '0'))
                        ORDER BY nav_date DESC
                        LIMIT 1
                    ),
                    -- 2. Fallback Date
                    (
                        SELECT nav_date
                        FROM fund_nav_history
                        WHERE proj_id = t.proj_id
                          AND ((nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0')
                            OR (buy_price IS NOT NULL AND buy_price != 'None' AND buy_price != '' AND buy_price != '0'))
                        ORDER BY nav_date DESC
                        LIMIT 1
                    ),
                    (SELECT last_nav_date FROM funds WHERE (proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id)) AND last_nav_date IS NOT NULL LIMIT 1),
                    (
                        SELECT trans_date
                        FROM transactions
                        WHERE user_id = ?1 AND proj_id = t.proj_id AND unit_price > 0
                        ORDER BY trans_date DESC, rowid DESC
                        LIMIT 1
                    )
                ) AS last_nav_date
            FROM (SELECT proj_id, MAX(fund_abbr) AS fund_abbr FROM transactions WHERE user_id = ?1 GROUP BY proj_id) t
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        let mut map = HashMap::new();
        for row in rows {
            let proj_id: String = row.get("proj_id");
            let abbr: Option<String> = row.get("proj_abbr_name");
            let name_th: Option<String> = row.get("proj_name_th");
            let last_nav_str: Option<String> = row.get("last_nav");
            let nav_date: Option<String> = row.get("last_nav_date");

            let nav = last_nav_str
                .and_then(|s| Decimal::from_str(&s).ok())
                .unwrap_or(Decimal::ZERO);

            let fund_abbr = abbr.unwrap_or_else(|| proj_id.clone());
            map.entry(proj_id.clone()).or_insert_with(|| (fund_abbr.clone(), name_th.clone(), nav, nav_date.clone()));
            let class_key = format!("{}:{}", proj_id, fund_abbr);
            map.insert(class_key, (fund_abbr, name_th, nav, nav_date));
        }

        Ok(map)
    }

    /// บันทึกธุรกรรม (Transaction) ลงฐานข้อมูล สำหรับ user_id
    /// บันทึกธุรกรรม (Transaction) ลงฐานข้อมูล สำหรับ user_id (คืนค่า true ถ้าเพิ่มสำเร็จ, false ถ้าเป็นรายการซ้ำ)
    pub async fn insert_transaction(
        pool: &DbPool,
        user_id: &str,
        tx: &Transaction,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let res = sqlx::query(
            r#"
            INSERT INTO transactions (
                id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date,
                units, unit_price, total_amount, fee, note
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(user_id, idempotency_key) DO NOTHING
            "#,
        )
        .bind(&tx.id)
        .bind(user_id)
        .bind(&tx.idempotency_key)
        .bind(&tx.proj_id)
        .bind(&tx.fund_abbr)
        .bind(tx.platform.as_str())
        .bind(tx.trans_type.as_str())
        .bind(&tx.trans_date)
        .bind(tx.units.to_string())
        .bind(tx.unit_price.to_string())
        .bind(tx.total_amount.to_string())
        .bind(tx.fee.to_string())
        .bind(&tx.note)
        .execute(pool)
        .await?;

        Ok(res.rows_affected() > 0)
    }

    /// บันทึกรายการธุรกรรมหลายรายการพร้อมกันใน Transaction เดียว (Batch Insert with Deduplication)
    /// คืนค่า (inserted_count, skipped_count)
    pub async fn insert_transactions_batch(
        pool: &DbPool,
        user_id: &str,
        txs: &[Transaction],
    ) -> Result<(usize, usize), Box<dyn std::error::Error + Send + Sync>> {
        let mut conn = pool.begin().await?;
        let mut inserted_count = 0;
        let mut skipped_count = 0;

        for tx in txs {
            let res = sqlx::query(
                r#"
                INSERT INTO transactions (
                    id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date,
                    units, unit_price, total_amount, fee, note
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                ON CONFLICT(user_id, idempotency_key) DO NOTHING
                "#,
            )
            .bind(&tx.id)
            .bind(user_id)
            .bind(&tx.idempotency_key)
            .bind(&tx.proj_id)
            .bind(&tx.fund_abbr)
            .bind(tx.platform.as_str())
            .bind(tx.trans_type.as_str())
            .bind(&tx.trans_date)
            .bind(tx.units.to_string())
            .bind(tx.unit_price.to_string())
            .bind(tx.total_amount.to_string())
            .bind(tx.fee.to_string())
            .bind(&tx.note)
            .execute(&mut *conn)
            .await?;

            if res.rows_affected() > 0 {
                inserted_count += 1;
            } else {
                skipped_count += 1;
            }
        }

        conn.commit().await?;
        Ok((inserted_count, skipped_count))
    }

    /// ดึงรายการธุรกรรมทั้งหมดของ user_id เรียงตามวันที่
    pub async fn get_all_transactions(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<Vec<Transaction>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date,
                   units, unit_price, total_amount, fee, note
            FROM transactions
            WHERE user_id = ?1
            ORDER BY trans_date ASC, created_at ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        let mut list = Vec::new();
        for row in rows {
            let id: String = row.get("id");
            let idempotency_key: Option<String> = row.get("idempotency_key");
            let proj_id: String = row.get("proj_id");
            let fund_abbr: Option<String> = row.get("fund_abbr");
            let platform_str: String = row.get("platform");
            let trans_type_str: String = row.get("trans_type");
            let trans_date: String = row.get("trans_date");
            let units_str: String = row.get("units");
            let unit_price_str: String = row.get("unit_price");
            let total_amount_str: String = row.get("total_amount");
            let fee_str: String = row.get("fee");
            let note: Option<String> = row.get("note");

            list.push(Transaction {
                id,
                idempotency_key,
                proj_id,
                fund_abbr,
                platform: Platform::from_str(&platform_str),
                trans_type: TransactionType::from_str(&trans_type_str),
                trans_date,
                units: Decimal::from_str(&units_str).unwrap_or(Decimal::ZERO),
                unit_price: Decimal::from_str(&unit_price_str).unwrap_or(Decimal::ZERO),
                total_amount: Decimal::from_str(&total_amount_str).unwrap_or(Decimal::ZERO),
                fee: Decimal::from_str(&fee_str).unwrap_or(Decimal::ZERO),
                note,
            });
        }

        // รวมรายการธุรกรรมหุ้นต่างประเทศ (US Stocks from stock_transactions)
        if let Ok(stock_rows) = sqlx::query(
            r#"
            SELECT id, idempotency_key, ticker, company_name, platform, trans_type, trans_date,
                   shares, price_usd, total_thb, fee_thb, exchange_rate, note
            FROM stock_transactions
            WHERE user_id = ?1
            ORDER BY trans_date ASC, created_at ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        {
            for row in stock_rows {
                let id: String = row.get("id");
                let idempotency_key: Option<String> = row.get("idempotency_key");
                let ticker: String = row.get("ticker");
                let platform_str: String = row.get("platform");
                let trans_type_str: String = row.get("trans_type");
                let trans_date: String = row.get("trans_date");
                let shares_str: String = row.get("shares");
                let price_usd_str: String = row.get("price_usd");
                let total_thb_str: String = row.get("total_thb");
                let fee_thb_str: String = row.get("fee_thb");
                let note: Option<String> = row.get("note");
                let exchange_rate: Option<String> = row.get("exchange_rate");

                let mut note_parts = Vec::new();
                if let Some(n) = note {
                    if !n.trim().is_empty() {
                        note_parts.push(n);
                    }
                }
                if let Some(fx) = exchange_rate {
                    if !fx.trim().is_empty() {
                        note_parts.push(format!("${} (FX {})", price_usd_str, fx));
                    }
                }
                let full_note = if note_parts.is_empty() {
                    None
                } else {
                    Some(note_parts.join(" | "))
                };

                list.push(Transaction {
                    id,
                    idempotency_key,
                    proj_id: ticker.clone(),
                    fund_abbr: Some(ticker),
                    platform: Platform::from_str(&platform_str),
                    trans_type: TransactionType::from_str(&trans_type_str),
                    trans_date,
                    units: Decimal::from_str(&shares_str).unwrap_or(Decimal::ZERO),
                    unit_price: Decimal::from_str(&price_usd_str).unwrap_or(Decimal::ZERO),
                    total_amount: Decimal::from_str(&total_thb_str).unwrap_or(Decimal::ZERO),
                    fee: Decimal::from_str(&fee_thb_str).unwrap_or(Decimal::ZERO),
                    note: full_note,
                });
            }
        }

        // เรียงตามวันที่ธุรกรรม
        list.sort_by(|a, b| a.trans_date.cmp(&b.trans_date));

        Ok(list)
    }

    /// ค้นหากองทุนจากฐานข้อมูล (จากชื่อย่อ, ชนิดหน่วยลงทุน/Class, หรือชื่อเต็ม)
    pub async fn search_funds(
        pool: &DbPool,
        query: &str,
        limit: i64,
    ) -> Result<Vec<crate::db::schema::FundSearchResult>, Box<dyn std::error::Error + Send + Sync>>
    {
        let q_clean = query.trim();
        let pattern = format!("%{}%", q_clean);
        let prefix = format!("{}%", q_clean);
        let q_norm = q_clean.replace(&['&', '-', '(', ')', ' '][..], "");
        let norm_pattern = format!("%{}%", q_norm);

        let rows = sqlx::query(
            r#"
            WITH matched_funds AS (
                -- 1. Direct match on funds table
                SELECT 
                    f.proj_id, 
                    f.proj_abbr_name, 
                    f.proj_name_th, 
                    f.proj_name_en, 
                    f.last_nav, 
                    f.last_nav_date,
                    1 AS priority
                FROM funds f
                WHERE f.proj_abbr_name LIKE ?1 OR f.proj_name_th LIKE ?1 OR f.proj_name_en LIKE ?1 OR f.proj_id LIKE ?1

                UNION

                -- 2. Match on fund_aliases (class tickers, aliases e.g. SCBS&P500E, SCBNDQ(E))
                SELECT 
                    a.proj_id, 
                    a.canonical_abbr AS proj_abbr_name, 
                    f.proj_name_th, 
                    f.proj_name_en, 
                    COALESCE(
                        (SELECT nh.nav FROM fund_nav_history nh WHERE nh.proj_id = a.proj_id AND nh.fund_class_name = a.canonical_abbr ORDER BY nh.nav_date DESC LIMIT 1),
                        f.last_nav
                    ) AS last_nav, 
                    COALESCE(
                        (SELECT nh.nav_date FROM fund_nav_history nh WHERE nh.proj_id = a.proj_id AND nh.fund_class_name = a.canonical_abbr ORDER BY nh.nav_date DESC LIMIT 1),
                        f.last_nav_date
                    ) AS last_nav_date,
                    2 AS priority
                FROM fund_aliases a
                JOIN funds f ON a.proj_id = f.proj_id
                WHERE a.alias LIKE ?1 OR a.canonical_abbr LIKE ?1 OR a.alias LIKE ?2

                UNION

                -- 3. Match on stock_prices (US Stocks e.g. NVDA, UNH, NVO)
                SELECT
                    sp.ticker AS proj_id,
                    sp.ticker AS proj_abbr_name,
                    sp.ticker AS proj_name_th,
                    sp.ticker AS proj_name_en,
                    sp.price AS last_nav,
                    sp.quote_date AS last_nav_date,
                    2 AS priority
                FROM stock_prices sp
                WHERE sp.ticker LIKE ?1 OR sp.ticker LIKE ?2
            )
            SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date
            FROM (
                SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date, MIN(priority) as best_prio
                FROM matched_funds
                GROUP BY proj_id, UPPER(proj_abbr_name)
            )
            ORDER BY 
                CASE 
                    WHEN UPPER(proj_abbr_name) = UPPER(?3) THEN 1
                    WHEN UPPER(proj_abbr_name) LIKE UPPER(?4) THEN 2
                    ELSE 3
                END,
                best_prio ASC,
                proj_abbr_name ASC
            LIMIT ?5
            "#,
        )
        .bind(&pattern)
        .bind(&norm_pattern)
        .bind(q_clean)
        .bind(&prefix)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        let mut results = Vec::new();
        for row in rows {
            results.push(crate::db::schema::FundSearchResult {
                proj_id: row.get("proj_id"),
                proj_abbr_name: row.get("proj_abbr_name"),
                proj_name_th: row.get("proj_name_th"),
                proj_name_en: row.get("proj_name_en"),
                last_nav: row.get("last_nav"),
                last_nav_date: row.get("last_nav_date"),
            });
        }

        Ok(results)
    }

    /// ดึงรหัส proj_id ของกองทุนทั้งหมดที่ผู้ใช้เคยทำรายการซื้อขาย เพื่อใช้ sync NAV
    pub async fn get_unique_held_fund_ids(
        pool: &DbPool,
    ) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query("SELECT DISTINCT proj_id FROM transactions")
            .fetch_all(pool)
            .await?;

        let mut list = Vec::new();
        for row in rows {
            let pid: String = row.get("proj_id");
            list.push(pid);
        }
        Ok(list)
    }

    /// อัปเดตรายการธุรกรรมสำหรับ user_id
    pub async fn update_transaction(
        pool: &DbPool,
        user_id: &str,
        id: &str,
        tx: &Transaction,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let res = sqlx::query(
            r#"
            UPDATE transactions
            SET proj_id = ?1,
                fund_abbr = ?2,
                platform = ?3,
                trans_type = ?4,
                trans_date = ?5,
                units = ?6,
                unit_price = ?7,
                total_amount = ?8,
                fee = ?9,
                note = ?10,
                idempotency_key = ?11
            WHERE id = ?12 AND user_id = ?13
            "#,
        )
        .bind(&tx.proj_id)
        .bind(&tx.fund_abbr)
        .bind(tx.platform.as_str())
        .bind(tx.trans_type.as_str())
        .bind(&tx.trans_date)
        .bind(tx.units.to_string())
        .bind(tx.unit_price.to_string())
        .bind(tx.total_amount.to_string())
        .bind(tx.fee.to_string())
        .bind(&tx.note)
        .bind(&tx.idempotency_key)
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;

        if res.rows_affected() > 0 {
            return Ok(true);
        }

        // ถ้าไม่พบใน transactions ให้ลองอัปเดตใน stock_transactions
        let res_stock = sqlx::query(
            r#"
            UPDATE stock_transactions
            SET ticker = ?1,
                platform = ?2,
                trans_type = ?3,
                trans_date = ?4,
                shares = ?5,
                price_usd = ?6,
                total_thb = ?7,
                fee_thb = ?8,
                note = ?9
            WHERE id = ?10 AND user_id = ?11
            "#,
        )
        .bind(&tx.proj_id)
        .bind(tx.platform.as_str())
        .bind(tx.trans_type.as_str())
        .bind(&tx.trans_date)
        .bind(tx.units.to_string())
        .bind(tx.unit_price.to_string())
        .bind(tx.total_amount.to_string())
        .bind(tx.fee.to_string())
        .bind(&tx.note)
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(res_stock.rows_affected() > 0)
    }

    /// ลบรายการธุรกรรมสำหรับ user_id
    pub async fn delete_transaction(
        pool: &DbPool,
        user_id: &str,
        id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let res = sqlx::query("DELETE FROM transactions WHERE id = ?1 AND user_id = ?2")
            .bind(id)
            .bind(user_id)
            .execute(pool)
            .await?;

        if res.rows_affected() > 0 {
            return Ok(true);
        }

        let res_stock = sqlx::query("DELETE FROM stock_transactions WHERE id = ?1 AND user_id = ?2")
            .bind(id)
            .bind(user_id)
            .execute(pool)
            .await?;

        Ok(res_stock.rows_affected() > 0)
    }

    /// ลบรายการธุรกรรมหลายรายการพร้อมกันในคราวเดียวสำหรับ user_id
    pub async fn delete_transactions_bulk(
        pool: &DbPool,
        user_id: &str,
        ids: &[String],
    ) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        if ids.is_empty() {
            return Ok(0);
        }

        let mut tx = pool.begin().await?;
        let mut total_deleted = 0;
        for id in ids {
            let res = sqlx::query("DELETE FROM transactions WHERE id = ?1 AND user_id = ?2")
                .bind(id)
                .bind(user_id)
                .execute(&mut *tx)
                .await?;
            if res.rows_affected() > 0 {
                total_deleted += res.rows_affected();
            } else {
                let res_stock = sqlx::query("DELETE FROM stock_transactions WHERE id = ?1 AND user_id = ?2")
                    .bind(id)
                    .bind(user_id)
                    .execute(&mut *tx)
                    .await?;
                total_deleted += res_stock.rows_affected();
            }
        }
        tx.commit().await?;

        Ok(total_deleted)
    }

    /// ดึงการตั้งค่าของผู้ใช้
    pub async fn get_user_settings(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<UserSettings, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query(
            r#"
            SELECT user_id, gmail_account, gmail_app_password, dob_day, dob_month,
                   dob_year_ce, dob_year_be, national_id_last5, custom_pdf_passwords,
                   auto_sync_enabled, last_sync_at
            FROM user_settings
            WHERE user_id = ?1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        if let Some(r) = row {
            let auto_sync: i64 = r.get("auto_sync_enabled");
            Ok(UserSettings {
                user_id: r.get("user_id"),
                gmail_account: r.get("gmail_account"),
                gmail_app_password: r.get("gmail_app_password"),
                dob_day: r.get("dob_day"),
                dob_month: r.get("dob_month"),
                dob_year_ce: r.get("dob_year_ce"),
                dob_year_be: r.get("dob_year_be"),
                national_id_last5: r.get("national_id_last5"),
                custom_pdf_passwords: r.get("custom_pdf_passwords"),
                auto_sync_enabled: auto_sync != 0,
                last_sync_at: r.get("last_sync_at"),
            })
        } else {
            Ok(UserSettings {
                user_id: user_id.to_string(),
                ..Default::default()
            })
        }
    }

    /// บันทึกหรืออัปเดตการตั้งค่าของผู้ใช้
    pub async fn upsert_user_settings(
        pool: &DbPool,
        settings: &UserSettings,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            r#"
            INSERT INTO user_settings (
                user_id, gmail_account, gmail_app_password, dob_day, dob_month,
                dob_year_ce, dob_year_be, national_id_last5, custom_pdf_passwords,
                auto_sync_enabled, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                gmail_account = COALESCE(?2, gmail_account),
                gmail_app_password = CASE 
                    WHEN ?3 IS NOT NULL AND ?3 != '********' AND ?3 != '' THEN ?3 
                    ELSE gmail_app_password 
                END,
                dob_day = COALESCE(?4, dob_day),
                dob_month = COALESCE(?5, dob_month),
                dob_year_ce = COALESCE(?6, dob_year_ce),
                dob_year_be = COALESCE(?7, dob_year_be),
                national_id_last5 = COALESCE(?8, national_id_last5),
                custom_pdf_passwords = COALESCE(?9, custom_pdf_passwords),
                auto_sync_enabled = ?10,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&settings.user_id)
        .bind(&settings.gmail_account)
        .bind(&settings.gmail_app_password)
        .bind(&settings.dob_day)
        .bind(&settings.dob_month)
        .bind(&settings.dob_year_ce)
        .bind(&settings.dob_year_be)
        .bind(&settings.national_id_last5)
        .bind(&settings.custom_pdf_passwords)
        .bind(if settings.auto_sync_enabled { 1 } else { 0 })
        .execute(pool)
        .await?;

        Ok(())
    }

    /// ดึงรายการสถานะการถือครองกองทุนสำรองเลี้ยงชีพ (PVD Latest Positions) สำหรับ user_id
    pub async fn get_pvd_positions(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<Vec<PvdPosition>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, policy_code, policy_name, as_of_date,
                   units, nav, cost, market_value, unrealized_pl, unrealized_pl_pct, statement_file
            FROM pvd_positions
            WHERE user_id = ?1
            ORDER BY policy_code ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        let positions = rows
            .into_iter()
            .map(|r| {
                let units_str: String = r.get("units");
                let nav_str: String = r.get("nav");
                let cost_str: String = r.get("cost");
                let mval_str: String = r.get("market_value");
                let upl_str: String = r.get("unrealized_pl");
                let upl_pct_str: String = r.get("unrealized_pl_pct");

                PvdPosition {
                    id: r.get("id"),
                    user_id: r.get("user_id"),
                    policy_code: r.get("policy_code"),
                    policy_name: r.get("policy_name"),
                    as_of_date: r.get("as_of_date"),
                    units: Decimal::from_str(&units_str).unwrap_or(Decimal::ZERO),
                    nav: Decimal::from_str(&nav_str).unwrap_or(Decimal::ZERO),
                    cost: Decimal::from_str(&cost_str).unwrap_or(Decimal::ZERO),
                    market_value: Decimal::from_str(&mval_str).unwrap_or(Decimal::ZERO),
                    unrealized_pl: Decimal::from_str(&upl_str).unwrap_or(Decimal::ZERO),
                    unrealized_pl_pct: Decimal::from_str(&upl_pct_str).unwrap_or(Decimal::ZERO),
                    statement_file: r.get("statement_file"),
                }
            })
            .collect();

        Ok(positions)
    }

    /// ดึง NAV ตามวันที่กำหนด จาก fund_nav_history (หรือ fallback ไปยัง last_nav)
    pub async fn get_nav_by_date(
        pool: &DbPool,
        proj_id: &str,
        date: &str,
        fund_abbr: Option<&str>,
    ) -> Result<Option<NavByDateResult>, Box<dyn std::error::Error + Send + Sync>> {
        let trimmed_id = proj_id.trim();
        let target_proj_id = if let Ok(Some(row)) = sqlx::query(
            "SELECT proj_id FROM fund_aliases WHERE alias = ?1 OR canonical_abbr = ?1
             UNION
             SELECT proj_id FROM funds WHERE UPPER(proj_abbr_name) = UPPER(?1) OR proj_id = ?1
             LIMIT 1"
        )
        .bind(trimmed_id)
        .fetch_optional(pool)
        .await {
            row.get::<String, _>("proj_id")
        } else {
            trimmed_id.to_string()
        };

        let effective_abbr = fund_abbr.unwrap_or("").trim();
        let class_filter = if !effective_abbr.is_empty() {
            effective_abbr
        } else if trimmed_id != target_proj_id {
            trimmed_id
        } else {
            ""
        };

        let history_row = sqlx::query(
            r#"
            SELECT 
                CASE 
                    WHEN CAST(sell_price AS REAL) > 0 THEN sell_price
                    WHEN CAST(nav AS REAL) > 0 THEN nav
                    ELSE '0'
                END as nav,
                nav_date
            FROM fund_nav_history
            WHERE proj_id = ?1 AND nav_date <= ?2
              AND (
                  ?3 = '' OR ?3 IS NULL
                  OR fund_class_name = ?3
                  OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = ?3 LIMIT 1)
                  OR fund_class_name = (SELECT proj_abbr_name FROM funds WHERE proj_id = ?1 LIMIT 1)
                  OR fund_class_name = ''
              )
              AND (CAST(sell_price AS REAL) > 0 OR CAST(nav AS REAL) > 0)
            ORDER BY 
              (CASE WHEN fund_class_name = ?3 OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = ?3 LIMIT 1) THEN 1 ELSE 2 END),
              nav_date DESC
            LIMIT 1
            "#,
        )
        .bind(&target_proj_id)
        .bind(date)
        .bind(class_filter)
        .fetch_optional(pool)
        .await?;

        if let Some(r) = history_row {
            let nav_str: String = r.get("nav");
            let nav_date: String = r.get("nav_date");
            if let Ok(nav) = Decimal::from_str(&nav_str) {
                let is_exact = nav_date == date;
                return Ok(Some(NavByDateResult {
                    nav,
                    nav_date,
                    nav_source: "SEC_HISTORY".to_string(),
                    is_exact_date: is_exact,
                }));
            }
        }

        let fund_row = sqlx::query(
            r#"
            SELECT last_nav, last_nav_date
            FROM funds
            WHERE (proj_id = ?1 OR UPPER(proj_abbr_name) = UPPER(?1))
              AND last_nav IS NOT NULL AND last_nav != 'None' AND last_nav != '' AND last_nav != '0'
            LIMIT 1
            "#,
        )
        .bind(proj_id)
        .fetch_optional(pool)
        .await?;

        if let Some(r) = fund_row {
            let nav_str: Option<String> = r.get("last_nav");
            let nav_date: Option<String> = r.get("last_nav_date");
            if let Some(s) = nav_str {
                if let Ok(nav) = Decimal::from_str(&s) {
                    return Ok(Some(NavByDateResult {
                        nav,
                        nav_date: nav_date.unwrap_or_else(|| date.to_string()),
                        nav_source: "SEC_LATEST".to_string(),
                        is_exact_date: false,
                    }));
                }
            }
        }

        Ok(None)
    }

    /// ดึงรายการวันที่ที่มีการประกาศ NAV ในเดือนนั้นๆ สำหรับ Highlight ในปฏิทิน
    pub async fn get_nav_dates_for_month(
        pool: &DbPool,
        proj_id: &str,
        month: &str,
        fund_abbr: Option<&str>,
    ) -> Result<std::collections::HashMap<String, String>, Box<dyn std::error::Error + Send + Sync>> {
        let trimmed_id = proj_id.trim();
        let target_proj_id = if let Ok(Some(row)) = sqlx::query(
            "SELECT proj_id FROM fund_aliases WHERE alias = ?1 OR canonical_abbr = ?1
             UNION
             SELECT proj_id FROM funds WHERE UPPER(proj_abbr_name) = UPPER(?1) OR proj_id = ?1
             LIMIT 1"
        )
        .bind(trimmed_id)
        .fetch_optional(pool)
        .await {
            row.get::<String, _>("proj_id")
        } else {
            trimmed_id.to_string()
        };

        let effective_abbr = fund_abbr.unwrap_or("").trim();
        let class_filter = if !effective_abbr.is_empty() {
            effective_abbr
        } else if trimmed_id != target_proj_id {
            trimmed_id
        } else {
            ""
        };

        let month_pattern = format!("{}%", month.trim());
        let rows = sqlx::query(
            r#"
            SELECT nav_date, fund_class_name,
                   CASE 
                       WHEN CAST(sell_price AS REAL) > 0 THEN sell_price
                       WHEN CAST(nav AS REAL) > 0 THEN nav
                       ELSE '0'
                   END as effective_nav
            FROM fund_nav_history
            WHERE proj_id = ?1 AND nav_date LIKE ?2
              AND (
                  ?3 = '' OR ?3 IS NULL
                  OR fund_class_name = ?3
                  OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = ?3 LIMIT 1)
                  OR fund_class_name = (SELECT proj_abbr_name FROM funds WHERE proj_id = ?1 LIMIT 1)
              )
              AND (CAST(sell_price AS REAL) > 0 OR CAST(nav AS REAL) > 0)
            ORDER BY 
              nav_date ASC,
              (CASE WHEN fund_class_name = ?3 OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = ?3 LIMIT 1) THEN 1 ELSE 2 END)
            "#,
        )
        .bind(&target_proj_id)
        .bind(&month_pattern)
        .bind(class_filter)
        .fetch_all(pool)
        .await?;

        let mut map = std::collections::HashMap::new();
        for r in rows {
            let date: String = r.get("nav_date");
            let nav: String = r.get("effective_nav");
            if nav != "0" && nav != "0.0000" && !nav.is_empty() {
                map.insert(date, nav);
            }
        }

        Ok(map)
    }

    /// ดึงคำแนะนำกองทุนที่ใกล้เคียงจากฐานข้อมูล SEC
    pub async fn get_fund_suggestions(
        pool: &DbPool,
        query: &str,
        limit: i64,
    ) -> Result<Vec<FundSuggestion>, Box<dyn std::error::Error + Send + Sync>> {
        let trimmed = query.trim();
        let pattern = format!("%{}%", trimmed);
        let rows = sqlx::query(
            r#"
            SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav
            FROM funds
            WHERE proj_abbr_name LIKE ?1 OR proj_name_en LIKE ?1 OR proj_name_th LIKE ?1
            ORDER BY
                CASE WHEN proj_abbr_name LIKE ?2 THEN 1 ELSE 2 END,
                proj_abbr_name ASC
            LIMIT ?3
            "#,
        )
        .bind(&pattern)
        .bind(format!("{}%", trimmed))
        .bind(limit)
        .fetch_all(pool)
        .await?;

        let mut res = Vec::new();
        for r in rows {
            res.push(FundSuggestion {
                proj_id: r.get("proj_id"),
                fund_abbr: r.get::<Option<String>, _>("proj_abbr_name").unwrap_or_default(),
                fund_name_th: r.get("proj_name_th"),
                fund_name_en: r.get("proj_name_en"),
                last_nav: r.get("last_nav"),
            });
        }
        Ok(res)
    }

    /// ดึงรายการธุรกรรมที่รอการยืนยัน (Pending Transactions) สำหรับ Staged Import
    pub async fn get_pending_transactions(
        pool: &DbPool,
        user_id: &str,
        status_filter: Option<&str>,
    ) -> Result<Vec<PendingTransaction>, Box<dyn std::error::Error + Send + Sync>> {
        let status = status_filter.unwrap_or("PENDING");
        let rows = sqlx::query(
            r#"
            SELECT id, user_id, sync_batch_id, source_file, source_email, platform,
                   raw_fund_name, proj_id, fund_abbr, fund_name_th, fund_name_en,
                   match_confidence, trans_type, trans_date, units, unit_price,
                   nav_source, total_amount, fee, note, status, created_at
            FROM pending_transactions
            WHERE user_id = ?1 AND status = ?2
            ORDER BY trans_date DESC, created_at DESC
            "#,
        )
        .bind(user_id)
        .bind(status)
        .fetch_all(pool)
        .await?;

        let mut list = Vec::new();
        for r in rows {
            let units_str: String = r.get("units");
            let price_str: String = r.get("unit_price");
            let amount_str: String = r.get("total_amount");
            let fee_str: String = r.get("fee");
            let raw_fund: String = r.get("raw_fund_name");
            let match_conf: String = r.get("match_confidence");
            let proj_id: Option<String> = r.get("proj_id");

            let suggestions = if proj_id.is_none() || match_conf == "NONE" {
                Self::get_fund_suggestions(pool, &raw_fund, 3).await.unwrap_or_default()
            } else {
                Vec::new()
            };

            list.push(PendingTransaction {
                id: r.get("id"),
                user_id: r.get("user_id"),
                sync_batch_id: r.get("sync_batch_id"),
                source_file: r.get("source_file"),
                source_email: r.get("source_email"),
                platform: r.get("platform"),
                raw_fund_name: raw_fund,
                proj_id,
                fund_abbr: r.get("fund_abbr"),
                fund_name_th: r.get("fund_name_th"),
                fund_name_en: r.get("fund_name_en"),
                match_confidence: match_conf,
                trans_type: r.get("trans_type"),
                trans_date: r.get("trans_date"),
                units: Decimal::from_str(&units_str).unwrap_or(Decimal::ZERO),
                unit_price: Decimal::from_str(&price_str).unwrap_or(Decimal::ZERO),
                nav_source: r.get("nav_source"),
                total_amount: Decimal::from_str(&amount_str).unwrap_or(Decimal::ZERO),
                fee: Decimal::from_str(&fee_str).unwrap_or(Decimal::ZERO),
                note: r.get("note"),
                status: r.get("status"),
                suggestions,
                created_at: r.get("created_at"),
            });
        }

        Ok(list)
    }

    /// เพิ่มรายการ Pending ด้วยตัวเอง (Manual Entry ในหน้า Review)
    pub async fn insert_pending_transaction(
        pool: &DbPool,
        user_id: &str,
        p: &crate::domain::CreatePendingPayload,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let id = uuid::Uuid::new_v4().to_string();
        let sync_batch_id = p.sync_batch_id.clone().unwrap_or_else(|| "manual".to_string());
        let source_file = p.source_file.clone().unwrap_or_else(|| "MANUAL_ENTRY".to_string());
        let total = p.total_amount.unwrap_or_else(|| p.units * p.unit_price);
        let fee = p.fee.unwrap_or(Decimal::ZERO);
        let match_confidence = if p.proj_id.is_some() { "EXACT" } else { "NONE" };

        sqlx::query(
            r#"
            INSERT INTO pending_transactions (
                id, user_id, sync_batch_id, source_file, source_email, platform,
                raw_fund_name, proj_id, fund_abbr, match_confidence, trans_type,
                trans_date, units, unit_price, nav_source, total_amount, fee, note, status
            ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'MANUAL', ?14, ?15, ?16, 'PENDING')
            "#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(&sync_batch_id)
        .bind(&source_file)
        .bind(&p.platform)
        .bind(&p.raw_fund_name)
        .bind(&p.proj_id)
        .bind(&p.fund_abbr)
        .bind(match_confidence)
        .bind(&p.trans_type)
        .bind(&p.trans_date)
        .bind(p.units.to_string())
        .bind(p.unit_price.to_string())
        .bind(total.to_string())
        .bind(fee.to_string())
        .bind(&p.note)
        .execute(pool)
        .await?;

        Ok(id)
    }

    /// เพิ่มรายการ Pending เป็นชุด (Batch Staging จาก Universal Importer หรือ Multi-row Manual Entry)
    pub async fn insert_pending_transactions_batch(
        pool: &DbPool,
        user_id: &str,
        batch: &[crate::domain::CreatePendingPayload],
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let mut tx = pool.begin().await?;
        let mut inserted_count = 0;

        for p in batch {
            let id = uuid::Uuid::new_v4().to_string();
            let sync_batch_id = p.sync_batch_id.clone().unwrap_or_else(|| "universal_import".to_string());
            let source_file = p.source_file.clone().unwrap_or_else(|| "STATEMENT_IMPORT".to_string());
            let total = p.total_amount.unwrap_or_else(|| p.units * p.unit_price);
            let fee = p.fee.unwrap_or(Decimal::ZERO);

            let mut resolved_proj_id = p.proj_id.clone();
            let mut resolved_fund_abbr = p.fund_abbr.clone();
            let mut match_confidence = if resolved_proj_id.is_some() { "EXACT" } else { "NONE" };

            if resolved_proj_id.is_none() {
                let candidate = p.fund_abbr.as_deref().unwrap_or(&p.raw_fund_name);
                // 1. Check fund_aliases first (handles share classes e.g. SCBS&P500E, NDQ(E))
                if let Ok(Some(row)) = sqlx::query(
                    r#"
                    SELECT a.proj_id, a.canonical_abbr AS proj_abbr_name
                    FROM fund_aliases a
                    JOIN funds f ON a.proj_id = f.proj_id
                    WHERE UPPER(a.alias) = UPPER(?1) OR UPPER(a.canonical_abbr) = UPPER(?1)
                    LIMIT 1
                    "#,
                )
                .bind(candidate)
                .fetch_optional(&mut *tx)
                .await {
                    resolved_proj_id = Some(row.get("proj_id"));
                    resolved_fund_abbr = Some(row.get("proj_abbr_name"));
                    match_confidence = "EXACT";
                } else if let Ok(Some(row)) = sqlx::query(
                    "SELECT proj_id, proj_abbr_name FROM funds WHERE UPPER(proj_abbr_name) = UPPER(?1) OR proj_id = ?1 LIMIT 1"
                )
                .bind(candidate)
                .fetch_optional(&mut *tx)
                .await {
                    resolved_proj_id = Some(row.get("proj_id"));
                    resolved_fund_abbr = row.get("proj_abbr_name");
                    match_confidence = "EXACT";
                }
            }

            sqlx::query(
                r#"
                INSERT INTO pending_transactions (
                    id, user_id, sync_batch_id, source_file, source_email, platform,
                    raw_fund_name, proj_id, fund_abbr, match_confidence, trans_type,
                    trans_date, units, unit_price, nav_source, total_amount, fee, note, status
                ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'MANUAL', ?14, ?15, ?16, 'PENDING')
                "#,
            )
            .bind(&id)
            .bind(user_id)
            .bind(&sync_batch_id)
            .bind(&source_file)
            .bind(&p.platform)
            .bind(&p.raw_fund_name)
            .bind(&resolved_proj_id)
            .bind(&resolved_fund_abbr)
            .bind(match_confidence)
            .bind(&p.trans_type)
            .bind(&p.trans_date)
            .bind(p.units.to_string())
            .bind(p.unit_price.to_string())
            .bind(total.to_string())
            .bind(fee.to_string())
            .bind(&p.note)
            .execute(&mut *tx)
            .await?;

            inserted_count += 1;
        }

        tx.commit().await?;
        Ok(inserted_count)
    }

    /// แก้ไขข้อมูลรายการ Pending Transaction
    pub async fn update_pending_transaction(
        pool: &DbPool,
        id: &str,
        user_id: &str,
        patch: &PendingPatch,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let existing = sqlx::query(
            "SELECT id, proj_id, fund_abbr, trans_type, trans_date, units, unit_price, total_amount, fee, platform, note FROM pending_transactions WHERE id = ?1 AND user_id = ?2",
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        let row = match existing {
            Some(r) => r,
            None => return Ok(false),
        };

        let proj_id = patch.proj_id.clone().or_else(|| row.get("proj_id"));
        let fund_abbr = patch.fund_abbr.clone().or_else(|| row.get("fund_abbr"));
        let fund_name_th = patch.fund_name_th.clone();
        let fund_name_en = patch.fund_name_en.clone();
        let trans_type = patch.trans_type.clone().unwrap_or_else(|| row.get("trans_type"));
        let trans_date = patch.trans_date.clone().unwrap_or_else(|| row.get("trans_date"));
        let platform = patch.platform.clone().unwrap_or_else(|| row.get("platform"));
        let note = patch.note.clone().or_else(|| row.get("note"));

        let units_str = patch.units.map(|u| u.to_string()).unwrap_or_else(|| row.get("units"));
        let price_str = patch.unit_price.map(|p| p.to_string()).unwrap_or_else(|| row.get("unit_price"));
        let fee_str = patch.fee.map(|f| f.to_string()).unwrap_or_else(|| row.get("fee"));

        let total_str = if let Some(tot) = patch.total_amount {
            tot.to_string()
        } else if patch.units.is_some() || patch.unit_price.is_some() {
            let u = Decimal::from_str(&units_str).unwrap_or(Decimal::ZERO);
            let p = Decimal::from_str(&price_str).unwrap_or(Decimal::ZERO);
            (u * p).to_string()
        } else {
            row.get("total_amount")
        };

        let match_confidence = if proj_id.is_some() { "EXACT" } else { "NONE" };

        let res = sqlx::query(
            r#"
            UPDATE pending_transactions SET
                proj_id = ?1,
                fund_abbr = ?2,
                fund_name_th = COALESCE(?3, fund_name_th),
                fund_name_en = COALESCE(?4, fund_name_en),
                match_confidence = ?5,
                trans_type = ?6,
                trans_date = ?7,
                units = ?8,
                unit_price = ?9,
                total_amount = ?10,
                fee = ?11,
                platform = ?12,
                note = ?13,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?14 AND user_id = ?15
            "#,
        )
        .bind(proj_id)
        .bind(fund_abbr)
        .bind(fund_name_th)
        .bind(fund_name_en)
        .bind(match_confidence)
        .bind(trans_type)
        .bind(trans_date)
        .bind(units_str)
        .bind(price_str)
        .bind(total_str)
        .bind(fee_str)
        .bind(platform)
        .bind(note)
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(res.rows_affected() > 0)
    }

    /// ลบรายการ Pending เดี่ยว
    pub async fn delete_pending_transaction(
        pool: &DbPool,
        id: &str,
        user_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let res = sqlx::query("DELETE FROM pending_transactions WHERE id = ?1 AND user_id = ?2")
            .bind(id)
            .bind(user_id)
            .execute(pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    /// ลบรายการ Pending หลายรายการพร้อมกัน (Batch Delete / Reject)
    pub async fn batch_delete_pending(
        pool: &DbPool,
        ids: &[String],
        user_id: &str,
    ) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut count = 0;
        for id in ids {
            let res = sqlx::query("DELETE FROM pending_transactions WHERE id = ?1 AND user_id = ?2")
                .bind(id)
                .bind(user_id)
                .execute(pool)
                .await?;
            count += res.rows_affected();
        }
        Ok(count)
    }

    /// ยืนยันรายการ Pending ที่เลือกเข้าฐานข้อมูลจริง (Commit to Transactions)
    pub async fn commit_pending_transactions(
        pool: &DbPool,
        ids: &[String],
        user_id: &str,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        if ids.is_empty() {
            return Ok(0);
        }

        let mut tx_pool = pool.begin().await?;
        let mut committed = 0;

        for id in ids {
            let row_opt = sqlx::query(
                r#"
                SELECT id, user_id, platform, raw_fund_name, proj_id, fund_abbr,
                       trans_type, trans_date, units, unit_price, total_amount, fee, note
                FROM pending_transactions
                WHERE id = ?1 AND user_id = ?2 AND status = 'PENDING'
                "#,
            )
            .bind(id)
            .bind(user_id)
            .fetch_optional(&mut *tx_pool)
            .await?;

            if let Some(r) = row_opt {
                let platform_str: String = r.get("platform");
                let raw_fund: String = r.get("raw_fund_name");
                let proj_id_opt: Option<String> = r.get("proj_id");
                let fund_abbr_opt: Option<String> = r.get("fund_abbr");
                let trans_type_str: String = r.get("trans_type");
                let trans_date: String = r.get("trans_date");
                let units_str: String = r.get("units");
                let price_str: String = r.get("unit_price");
                let amount_str: String = r.get("total_amount");
                let fee_str: String = r.get("fee");
                let note: Option<String> = r.get("note");

                let proj_id = proj_id_opt
                    .unwrap_or_else(|| fund_abbr_opt.clone().unwrap_or(raw_fund));
                let fund_abbr = fund_abbr_opt.unwrap_or_else(|| proj_id.clone());

                let units = Decimal::from_str(&units_str).unwrap_or(Decimal::ZERO);
                let total_amount = Decimal::from_str(&amount_str).unwrap_or(Decimal::ZERO);

                let idempotency_key = Transaction::compute_idempotency_key(
                    user_id,
                    &platform_str,
                    &proj_id,
                    Some(fund_abbr.as_str()),
                    &trans_date,
                    &trans_type_str,
                    &units,
                    &total_amount,
                    note.as_deref(),
                );

                let tx_id = uuid::Uuid::new_v4().to_string();

                sqlx::query(
                    r#"
                    INSERT INTO transactions (
                        id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date,
                        units, unit_price, total_amount, fee, note
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                    ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
                        units = excluded.units,
                        unit_price = excluded.unit_price,
                        total_amount = excluded.total_amount,
                        fee = excluded.fee,
                        note = excluded.note
                    "#,
                )
                .bind(&tx_id)
                .bind(user_id)
                .bind(&idempotency_key)
                .bind(&proj_id)
                .bind(&fund_abbr)
                .bind(&platform_str)
                .bind(&trans_type_str)
                .bind(&trans_date)
                .bind(&units_str)
                .bind(&price_str)
                .bind(&amount_str)
                .bind(&fee_str)
                .bind(&note)
                .execute(&mut *tx_pool)
                .await?;

                sqlx::query(
                    "UPDATE pending_transactions SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2",
                )
                .bind(id)
                .bind(user_id)
                .execute(&mut *tx_pool)
                .await?;

                committed += 1;
            }
        }

        tx_pool.commit().await?;
        Ok(committed)
    }

    /// ยืนยันรายการ Pending ทั้งหมดของผู้ใช้
    pub async fn commit_all_pending(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            "SELECT id FROM pending_transactions WHERE user_id = ?1 AND status = 'PENDING'",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        let ids: Vec<String> = rows.into_iter().map(|r| r.get("id")).collect();
        Self::commit_pending_transactions(pool, &ids, user_id).await
    }

    /// ดึงสถิติจำนวนอีเมลและไฟล์แนบที่เคยประมวลผลแล้วในแคช
    pub async fn get_sync_cache_stats(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let total_emails: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM processed_emails")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let broker_rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT broker, COUNT(*) FROM processed_emails GROUP BY broker"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let mut by_broker = serde_json::Map::new();
        for (broker, count) in broker_rows {
            by_broker.insert(broker, serde_json::json!(count));
        }

        let total_attachments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM processed_attachments")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        let pending_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pending_transactions WHERE user_id = ?1 AND status = 'PENDING'"
        )
        .bind(user_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        Ok(serde_json::json!({
            "total_emails": total_emails,
            "by_broker": by_broker,
            "total_attachments": total_attachments,
            "pending_count": pending_count,
        }))
    }

    /// ล้างแคชประวัติการสแกนอีเมล (รีเซ็ตแคชเพื่อให้สแกนใหม่ได้)
    pub async fn reset_sync_cache(
        pool: &DbPool,
        user_id: &str,
        broker: Option<&str>,
        clear_attachments: bool,
        clear_pending: bool,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let mut tx = pool.begin().await?;

        let deleted_emails = match broker {
            Some(b) if !b.is_empty() && b.to_uppercase() != "ALL" => {
                let res = sqlx::query("DELETE FROM processed_emails WHERE UPPER(broker) = UPPER(?1)")
                    .bind(b)
                    .execute(&mut *tx)
                    .await?;
                res.rows_affected()
            }
            _ => {
                let res = sqlx::query("DELETE FROM processed_emails")
                    .execute(&mut *tx)
                    .await?;
                res.rows_affected()
            }
        };

        let deleted_attachments = if clear_attachments {
            let res = sqlx::query("DELETE FROM processed_attachments")
                .execute(&mut *tx)
                .await?;
            res.rows_affected()
        } else {
            0
        };

        let deleted_pending = if clear_pending {
            match broker {
                Some(b) if !b.is_empty() && b.to_uppercase() != "ALL" => {
                    let res = sqlx::query("DELETE FROM pending_transactions WHERE user_id = ?1 AND UPPER(platform) = UPPER(?2)")
                        .bind(user_id)
                        .bind(b)
                        .execute(&mut *tx)
                        .await?;
                    res.rows_affected()
                }
                _ => {
                    let res = sqlx::query("DELETE FROM pending_transactions WHERE user_id = ?1")
                        .bind(user_id)
                        .execute(&mut *tx)
                        .await?;
                    res.rows_affected()
                }
            }
        } else {
            0
        };

        tx.commit().await?;

        Ok(serde_json::json!({
            "success": true,
            "deleted_emails": deleted_emails,
            "deleted_attachments": deleted_attachments,
            "deleted_pending": deleted_pending,
        }))
    }

    /// ดึงรายการอีเมลในแคชพร้อมค้นหา/กรอง
    pub async fn list_cached_emails(
        pool: &DbPool,
        broker: Option<&str>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = match broker {
            Some(b) if !b.is_empty() && b.to_uppercase() != "ALL" => {
                sqlx::query(
                    "SELECT message_id, broker, subject, email_date, tx_count, created_at FROM processed_emails WHERE UPPER(broker) = UPPER(?1) ORDER BY created_at DESC LIMIT ?2"
                )
                .bind(b)
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
            _ => {
                sqlx::query(
                    "SELECT message_id, broker, subject, email_date, tx_count, created_at FROM processed_emails ORDER BY created_at DESC LIMIT ?1"
                )
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
        };

        let mut list = Vec::new();
        for r in rows {
            list.push(serde_json::json!({
                "message_id": r.get::<String, _>("message_id"),
                "broker": r.get::<String, _>("broker"),
                "subject": r.get::<String, _>("subject"),
                "email_date": r.get::<String, _>("email_date"),
                "tx_count": r.get::<i64, _>("tx_count"),
                "created_at": r.get::<Option<String>, _>("created_at"),
            }));
        }

        Ok(list)
    }

    /// ลบอีเมลฉบับเดียวออกจากแคชเพื่อให้ resync เฉพาะฉบับนั้น
    pub async fn delete_cached_email(
        pool: &DbPool,
        message_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let res = sqlx::query("DELETE FROM processed_emails WHERE message_id = ?1")
            .bind(message_id)
            .execute(pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    /// ดึงรายการ Master Broker Configs สำหรับการซิงค์อีเมล
    pub async fn get_email_broker_configs(
        pool: &DbPool,
    ) -> Result<Vec<crate::db::schema::EmailBrokerConfig>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT broker_key, name, enabled, sender_emails, subject_includes, subject_excludes,
                   extraction_type, password_patterns, ai_prompt_variant
            FROM email_broker_configs
            ORDER BY rowid ASC
            "#,
        )
        .fetch_all(pool)
        .await?;

        let mut configs = Vec::new();
        for r in rows {
            let key: String = r.try_get("broker_key")?;
            let name: String = r.try_get("name")?;
            let enabled: bool = r.try_get("enabled")?;
            let sender_emails_str: String = r.try_get("sender_emails")?;
            let subject_includes_str: String = r.try_get("subject_includes")?;
            let subject_excludes_str: String = r.try_get("subject_excludes")?;
            let extraction_type: String = r.try_get("extraction_type")?;
            let password_patterns_str: String = r.try_get("password_patterns")?;
            let ai_prompt_variant: String = r.try_get("ai_prompt_variant")?;

            configs.push(crate::db::schema::EmailBrokerConfig {
                key,
                name,
                enabled,
                sender_emails: serde_json::from_str(&sender_emails_str).unwrap_or_default(),
                subject_includes: serde_json::from_str(&subject_includes_str).unwrap_or_default(),
                subject_excludes: serde_json::from_str(&subject_excludes_str).unwrap_or_default(),
                extraction_type,
                password_patterns: serde_json::from_str(&password_patterns_str).unwrap_or_default(),
                ai_prompt_variant,
            });
        }
        Ok(configs)
    }

    /// อัปเดตรายการ Master Broker Configs
    pub async fn update_email_broker_configs(
        pool: &DbPool,
        configs: &[crate::db::schema::EmailBrokerConfig],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut tx = pool.begin().await?;
        for c in configs {
            let senders_json = serde_json::to_string(&c.sender_emails)?;
            let includes_json = serde_json::to_string(&c.subject_includes)?;
            let excludes_json = serde_json::to_string(&c.subject_excludes)?;
            let pwds_json = serde_json::to_string(&c.password_patterns)?;

            sqlx::query(
                r#"
                INSERT INTO email_broker_configs (
                    broker_key, name, enabled, sender_emails, subject_includes, subject_excludes,
                    extraction_type, password_patterns, ai_prompt_variant, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
                ON CONFLICT(broker_key) DO UPDATE SET
                    name = excluded.name,
                    enabled = excluded.enabled,
                    sender_emails = excluded.sender_emails,
                    subject_includes = excluded.subject_includes,
                    subject_excludes = excluded.subject_excludes,
                    extraction_type = excluded.extraction_type,
                    password_patterns = excluded.password_patterns,
                    ai_prompt_variant = excluded.ai_prompt_variant,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&c.key)
            .bind(&c.name)
            .bind(c.enabled)
            .bind(senders_json)
            .bind(includes_json)
            .bind(excludes_json)
            .bind(&c.extraction_type)
            .bind(pwds_json)
            .bind(&c.ai_prompt_variant)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// รีเซ็ต Broker Configs กลับเป็นค่าตั้งต้นจาก Template JSON
    pub async fn reset_email_broker_configs(
        pool: &DbPool,
    ) -> Result<Vec<crate::db::schema::EmailBrokerConfig>, Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query("DELETE FROM email_broker_configs").execute(pool).await?;
        crate::db::seed_default_email_broker_configs(pool).await?;
        Self::get_email_broker_configs(pool).await
    }

    /// บันทึกเริ่มต้นการทำงานของ Background Scheduler Daemon (Slice 33)
    pub async fn insert_scheduled_sync_log(
        pool: &DbPool,
        job_name: &str,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let id = sqlx::query_scalar::<_, i64>(
            r#"
            INSERT INTO scheduled_sync_logs (job_name, status)
            VALUES (?1, 'RUNNING')
            RETURNING id
            "#,
        )
        .bind(job_name)
        .fetch_one(pool)
        .await?;
        Ok(id)
    }

    /// อัปเดตสถานะเมื่อการทำงานของ Scheduled Sync เสร็จสิ้น (Slice 33)
    pub async fn complete_scheduled_sync_log(
        pool: &DbPool,
        id: i64,
        status: &str,
        updated_funds_count: i64,
        error_summary: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            r#"
            UPDATE scheduled_sync_logs
            SET status = ?1,
                completed_at = CURRENT_TIMESTAMP,
                updated_funds_count = ?2,
                error_summary = ?3
            WHERE id = ?4
            "#,
        )
        .bind(status)
        .bind(updated_funds_count)
        .bind(error_summary)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// ดึงประวัติการรันล่าสุดของงาน Schedule (Slice 33)
    pub async fn get_last_scheduled_sync_log(
        pool: &DbPool,
        job_name: &str,
    ) -> Result<Option<crate::db::schema::ScheduledSyncLog>, Box<dyn std::error::Error + Send + Sync>> {
        let log = sqlx::query_as::<_, crate::db::schema::ScheduledSyncLog>(
            r#"
            SELECT id, job_name, triggered_at, completed_at, status, updated_funds_count, error_summary
            FROM scheduled_sync_logs
            WHERE job_name = ?1
            ORDER BY id DESC
            LIMIT 1
            "#,
        )
        .bind(job_name)
        .fetch_optional(pool)
        .await?;
        Ok(log)
    }

    /// ตรวจสอบว่าในวันนี้มีการรันสำเร็จแล้วหรือไม่ (Slice 33)
    pub async fn has_successful_sync_today(
        pool: &DbPool,
        job_name: &str,
        date_prefix_ict: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM scheduled_sync_logs
            WHERE job_name = ?1
              AND status = 'SUCCESS'
              AND triggered_at LIKE ?2
            "#,
        )
        .bind(job_name)
        .bind(format!("{date_prefix_ict}%"))
        .fetch_one(pool)
        .await?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;
    use crate::domain::models::{Platform, TransactionType};
    use rust_decimal_macros::dec;

    #[tokio::test]
    async fn test_insert_transactions_batch_deduplication() {
        let pool = init_db("sqlite::memory:").await.unwrap();
        let user_id = "test_user_dedup";

        let tx = Transaction {
            id: "tx-original".to_string(),
            idempotency_key: Some(Transaction::compute_idempotency_key(
                user_id,
                "TTB",
                "M0001",
                Some("ES-USTECH"),
                "2023-12-28",
                "BUY",
                &dec!(46.0992),
                &dec!(625.00),
                Some("023362010997256"),
            )),
            proj_id: "M0001".to_string(),
            fund_abbr: Some("ES-USTECH".to_string()),
            platform: Platform::Ttb,
            trans_type: TransactionType::Buy,
            trans_date: "2023-12-28".to_string(),
            units: dec!(46.0992),
            unit_price: dec!(13.5577),
            total_amount: dec!(625.00),
            fee: dec!(0),
            note: Some("023362010997256".to_string()),
        };

        // First insert -> (1 inserted, 0 skipped)
        let (inserted1, skipped1) =
            Repository::insert_transactions_batch(&pool, user_id, &[tx.clone()])
                .await
                .unwrap();
        assert_eq!(inserted1, 1);
        assert_eq!(skipped1, 0);

        // Second insert of identical transaction (even with new random UUID) -> (0 inserted, 1 skipped)
        let mut tx_duplicate = tx.clone();
        tx_duplicate.id = "tx-new-uuid".to_string();
        let (inserted2, skipped2) =
            Repository::insert_transactions_batch(&pool, user_id, &[tx_duplicate])
                .await
                .unwrap();
        assert_eq!(inserted2, 0);
        assert_eq!(skipped2, 1);

        // Verify total records in DB is still exactly 1
        let all = Repository::get_all_transactions(&pool, user_id)
            .await
            .unwrap();
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn test_sec_share_classes_coexistence_and_nav_accuracy() {
        let pool = init_db("sqlite::memory:").await.unwrap();
        let user_id = "test_user_classes";
        let proj_id = "M0005_2558";

        // Insert umbrella fund in funds table
        sqlx::query(
            "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th) VALUES (?1, ?2, ?3)",
        )
        .bind(proj_id)
        .bind("SCBCHAFUND")
        .bind("กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์")
        .execute(&pool)
        .await
        .unwrap();

        // Insert alias: SCBCHA(A) -> SCBCHAA
        sqlx::query(
            "INSERT INTO fund_aliases (alias, proj_id, canonical_abbr, display_name) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind("SCBCHA(A)")
        .bind(proj_id)
        .bind("SCBCHAA")
        .bind("SCBCHAFUND (SCBCHA(A))")
        .execute(&pool)
        .await
        .unwrap();

        // SEC publishes 2 distinct classes on the exact same date (2026-11-12)
        let nav_items = vec![
            crate::sec::models::DailyNavInfo {
                proj_id: proj_id.to_string(),
                unique_id: None,
                fund_class_name: Some("SCBCHAE".to_string()),
                nav_date: "2026-11-12".to_string(),
                net_asset: None,
                last_val: Some(dec!(9.4122)),
                sell_price: Some(dec!(9.4122)),
                buy_price: Some(dec!(9.4122)),
                last_upd_date: None,
            },
            crate::sec::models::DailyNavInfo {
                proj_id: proj_id.to_string(),
                unique_id: None,
                fund_class_name: Some("SCBCHAA".to_string()),
                nav_date: "2026-11-12".to_string(),
                net_asset: None,
                last_val: Some(dec!(8.1893)),
                sell_price: Some(dec!(8.1893)),
                buy_price: Some(dec!(8.1893)),
                last_upd_date: None,
            },
        ];

        // Upsert into fund_nav_history
        Repository::upsert_nav_history(&pool, proj_id, &nav_items)
            .await
            .unwrap();

        // 1. Verify BOTH classes coexist in fund_nav_history on the same date (no overwrite!)
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM fund_nav_history WHERE proj_id = ?1 AND nav_date = '2026-11-12'",
        )
        .bind(proj_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            count, 2,
            "Both classes must coexist on the same date without collision"
        );

        // 2. Insert transaction for user holding SCBCHA(A) (Class A)
        let tx = Transaction {
            id: "tx-scbcha-a".to_string(),
            idempotency_key: Some("key-1".to_string()),
            proj_id: proj_id.to_string(),
            fund_abbr: Some("SCBCHA(A)".to_string()),
            platform: Platform::Ttb,
            trans_type: TransactionType::Buy,
            trans_date: "2026-10-28".to_string(),
            units: dec!(18.2397),
            unit_price: dec!(8.2238),
            total_amount: dec!(150.00),
            fee: dec!(0),
            note: None,
        };
        Repository::insert_transactions_batch(&pool, user_id, &[tx])
            .await
            .unwrap();

        // 3. Query get_latest_nav_map: User holding SCBCHA(A) MUST resolve to 8.1893 (Class A), NOT 9.4122 (Class E)!
        let nav_map = Repository::get_latest_nav_map(&pool, user_id)
            .await
            .unwrap();
        let nav_entry = nav_map
            .get(proj_id)
            .expect("Should have NAV entry for M0005_2558");
        assert_eq!(
            nav_entry.2,
            dec!(8.1893),
            "Must match Class A NAV, never Class E NAV!"
        );
    }

    #[tokio::test]
    async fn test_email_broker_configs_crud_and_reset() {
        let pool = init_db("sqlite::memory:").await.unwrap();

        // 1. Initial seeded configs should exist
        let configs = Repository::get_email_broker_configs(&pool).await.unwrap();
        assert!(!configs.is_empty(), "Seeded configs must not be empty");
        let ttb = configs.iter().find(|b| b.key == "TTB").expect("TTB config exists");
        assert!(ttb.enabled);
        assert_eq!(ttb.sender_emails[0], "estatement@eservice.ttbbank.com");

        // 2. Update config: disable TTB and add a new sender email
        let mut modified = configs.clone();
        for b in &mut modified {
            if b.key == "TTB" {
                b.enabled = false;
                b.sender_emails.push("custom@ttbbank.com".to_string());
            }
        }
        Repository::update_email_broker_configs(&pool, &modified).await.unwrap();

        let updated = Repository::get_email_broker_configs(&pool).await.unwrap();
        let ttb_updated = updated.iter().find(|b| b.key == "TTB").unwrap();
        assert!(!ttb_updated.enabled, "TTB should now be disabled");
        assert_eq!(ttb_updated.sender_emails.len(), 2);

        // 3. Reset configs back to default
        let reset = Repository::reset_email_broker_configs(&pool).await.unwrap();
        let ttb_reset = reset.iter().find(|b| b.key == "TTB").unwrap();
        assert!(ttb_reset.enabled, "TTB should be re-enabled after reset");
        assert_eq!(ttb_reset.sender_emails.len(), 1);
    }
}
