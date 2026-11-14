#![allow(dead_code)]
use super::DbPool;
use crate::domain::{Platform, Transaction, TransactionType};
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
            let name_th = amc.comp_name_th.clone().unwrap_or_else(|| amc.unique_id.clone());
            let name_en = amc.comp_name_en.clone().unwrap_or_else(|| amc.unique_id.clone());

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

    /// บันทึกประวัติราคา NAV รายวัน
    pub async fn upsert_nav_history(
        pool: &DbPool,
        proj_id: &str,
        nav_items: &[DailyNavInfo],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        for item in nav_items {
            let last_val_str = item.last_val.map(|v| v.to_string()).unwrap_or_default();
            let buy_price_str = item.buy_price.map(|v| v.to_string());
            let sell_price_str = item.sell_price.map(|v| v.to_string());

            sqlx::query(
                r#"
                INSERT INTO fund_nav_history (
                    proj_id, nav_date, nav, buy_price, sell_price, fund_class_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(proj_id, nav_date) DO UPDATE SET
                    nav = excluded.nav,
                    buy_price = excluded.buy_price,
                    sell_price = excluded.sell_price,
                    fund_class_name = excluded.fund_class_name,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(proj_id)
            .bind(&item.nav_date)
            .bind(&last_val_str)
            .bind(&buy_price_str)
            .bind(&sell_price_str)
            .bind(&item.fund_class_name)
            .execute(pool)
            .await?;

            // อัปเดตราคาล่าสุดลงในตาราง funds ด้วย
            if let Some(val) = item.last_val {
                sqlx::query(
                    r#"
                    UPDATE funds 
                    SET last_nav = ?1, last_nav_date = ?2, updated_at = CURRENT_TIMESTAMP
                    WHERE proj_id = ?3 AND (last_nav_date IS NULL OR last_nav_date <= ?2)
                    "#,
                )
                .bind(val.to_string())
                .bind(&item.nav_date)
                .bind(proj_id)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    /// ดึงราคา NAV ล่าสุดของทุกกองทุน เพื่อใช้คำนวณพอร์ต (สำหรับ user_id)
    /// Return: HashMap<proj_id, (Fund Abbr, Fund Name TH, Latest NAV)>
    pub async fn get_latest_nav_map(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<HashMap<String, (String, Option<String>, Decimal)>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                t.proj_id,
                COALESCE(f.proj_abbr_name, t.fund_abbr, t.proj_id) AS proj_abbr_name,
                f.proj_name_th,
                COALESCE(h.latest_nav, f.last_nav, '0') AS last_nav
            FROM (SELECT DISTINCT proj_id, fund_abbr FROM transactions WHERE user_id = ?1) t
            LEFT JOIN funds f ON f.proj_id = t.proj_id
            LEFT JOIN (
                SELECT proj_id, nav AS latest_nav
                FROM fund_nav_history
                WHERE (proj_id, nav_date) IN (
                    SELECT proj_id, MAX(nav_date)
                    FROM fund_nav_history
                    GROUP BY proj_id
                )
            ) h ON h.proj_id = t.proj_id
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

            let nav = last_nav_str
                .and_then(|s| Decimal::from_str(&s).ok())
                .unwrap_or(Decimal::ZERO);

            let fund_abbr = abbr.unwrap_or_else(|| proj_id.clone());
            map.insert(proj_id, (fund_abbr, name_th, nav));
        }

        Ok(map)
    }

    /// บันทึกธุรกรรม (Transaction) ลงฐานข้อมูล สำหรับ user_id
    pub async fn insert_transaction(
        pool: &DbPool,
        user_id: &str,
        tx: &Transaction,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            r#"
            INSERT INTO transactions (
                id, user_id, proj_id, fund_abbr, platform, trans_type, trans_date,
                units, unit_price, total_amount, fee, note
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(&tx.id)
        .bind(user_id)
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

        Ok(())
    }

    /// บันทึกรายการธุรกรรมหลายรายการพร้อมกันใน Transaction เดียว (Batch Insert)
    pub async fn insert_transactions_batch(
        pool: &DbPool,
        user_id: &str,
        txs: &[Transaction],
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let mut conn = pool.begin().await?;

        for tx in txs {
            sqlx::query(
                r#"
                INSERT INTO transactions (
                    id, user_id, proj_id, fund_abbr, platform, trans_type, trans_date,
                    units, unit_price, total_amount, fee, note
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
            )
            .bind(&tx.id)
            .bind(user_id)
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
        }

        conn.commit().await?;
        Ok(txs.len())
    }

    /// ดึงรายการธุรกรรมทั้งหมดของ user_id เรียงตามวันที่
    pub async fn get_all_transactions(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<Vec<Transaction>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT id, proj_id, fund_abbr, platform, trans_type, trans_date,
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

        Ok(list)
    }

    /// ค้นหากองทุนจากฐานข้อมูล (จากชื่อย่อ หรือชื่อเต็ม)
    pub async fn search_funds(
        pool: &DbPool,
        query: &str,
        limit: i64,
    ) -> Result<Vec<crate::db::schema::FundSearchResult>, Box<dyn std::error::Error + Send + Sync>> {
        let pattern = format!("%{}%", query.trim());
        let rows = sqlx::query(
            r#"
            SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date
            FROM funds
            WHERE proj_abbr_name LIKE ?1 OR proj_name_th LIKE ?1 OR proj_name_en LIKE ?1 OR proj_id LIKE ?1
            ORDER BY 
                CASE WHEN proj_abbr_name LIKE ?2 THEN 1 ELSE 2 END,
                proj_abbr_name ASC
            LIMIT ?3
            "#,
        )
        .bind(&pattern)
        .bind(format!("{}%", query.trim()))
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

        Ok(res.rows_affected() > 0)
    }
}
