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
    ) -> Result<
        HashMap<String, (String, Option<String>, Decimal)>,
        Box<dyn std::error::Error + Send + Sync>,
    > {
        let rows = sqlx::query(
            r#"
            SELECT 
                t.proj_id,
                COALESCE(
                    (SELECT proj_abbr_name FROM funds WHERE proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id) LIMIT 1),
                    t.fund_abbr,
                    t.proj_id
                ) AS proj_abbr_name,
                (SELECT proj_name_th FROM funds WHERE proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id) LIMIT 1) AS proj_name_th,
                COALESCE(
                    (SELECT nav FROM fund_nav_history WHERE proj_id = t.proj_id ORDER BY nav_date DESC LIMIT 1),
                    (SELECT last_nav FROM funds WHERE (proj_id = t.proj_id OR LOWER(proj_abbr_name) = LOWER(t.proj_id) OR LOWER(proj_name_en) = LOWER(t.proj_id)) AND last_nav IS NOT NULL AND last_nav != '0' LIMIT 1),
                    (
                        SELECT CAST(unit_price AS TEXT)
                        FROM transactions
                        WHERE user_id = ?1 AND proj_id = t.proj_id AND unit_price > 0
                        ORDER BY trans_date DESC, rowid DESC
                        LIMIT 1
                    ),
                    '0'
                ) AS last_nav
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

            let nav = last_nav_str
                .and_then(|s| Decimal::from_str(&s).ok())
                .unwrap_or(Decimal::ZERO);

            let fund_abbr = abbr.unwrap_or_else(|| proj_id.clone());
            map.insert(proj_id, (fund_abbr, name_th, nav));
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

        Ok(list)
    }

    /// ค้นหากองทุนจากฐานข้อมูล (จากชื่อย่อ หรือชื่อเต็ม)
    pub async fn search_funds(
        pool: &DbPool,
        query: &str,
        limit: i64,
    ) -> Result<Vec<crate::db::schema::FundSearchResult>, Box<dyn std::error::Error + Send + Sync>>
    {
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
}
