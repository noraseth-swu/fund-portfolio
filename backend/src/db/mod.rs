pub mod repository;
pub mod schema;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(
    database_url: &str,
) -> Result<DbPool, Box<dyn std::error::Error + Send + Sync>> {
    // กำหนด Options: สร้างไฟล์ถ้ายังไม่มี, เปิดโหมด WAL และ Normal Sync สำหรับความเร็วระดับ Sub-millisecond
    let connection_options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(connection_options)
        .await?;

    // รัน Migration สร้างตารางอัตโนมัติ
    create_tables(&pool).await?;
    seed_default_brokers(&pool).await?;
    seed_default_email_broker_configs(&pool).await?;

    Ok(pool)
}

async fn seed_default_brokers(
    pool: &DbPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let defaults = vec![
        (
            "KBANK",
            "ธนาคารกสิกรไทย (K PLUS / K-MyFunds)",
            "Kasikornbank",
            "RETAIL",
        ),
        (
            "SCB",
            "ธนาคารไทยพาณิชย์ (SCB EASY)",
            "Siam Commercial Bank",
            "RETAIL",
        ),
        (
            "INNOVESTX",
            "บล. อินโนเวสท์ เอกซ์ (InnovestX)",
            "InnovestX Securities",
            "RETAIL",
        ),
        (
            "TTB",
            "ธนาคารทหารไทยธนชาต (ttb touch / smart port)",
            "TMBThanachart Bank",
            "RETAIL",
        ),
        (
            "DIME",
            "บล. เคเคพี ไดม์ (Dime!)",
            "KKP Dime Securities",
            "RETAIL",
        ),
        ("FINNOMENA", "ฟินโนมีนา (Finnomena)", "Finnomena", "RETAIL"),
        (
            "STREAMING",
            "Streaming for Fund",
            "Settrade Streaming for Fund",
            "RETAIL",
        ),
        (
            "BAY",
            "ธนาคารกรุงศรีอยุธยา (KMA / Krungsri)",
            "Bank of Ayudhya",
            "RETAIL",
        ),
        (
            "BBL",
            "ธนาคารกรุงเทพ (Bangkok Bank Mobile)",
            "Bangkok Bank",
            "RETAIL",
        ),
        (
            "KTB",
            "ธนาคารกรุงไทย (Krungthai NEXT)",
            "Krungthai Bank",
            "RETAIL",
        ),
        (
            "KKP",
            "ธนาคารเกียรตินาคินภัทร / บล.เกียรตินาคินภัทร",
            "Kiatnakin Phatra",
            "RETAIL",
        ),
        ("PI", "บล. พาย (Pi Financial)", "Pi Securities", "RETAIL"),
        (
            "YUANTA",
            "บล. หยวนต้า (ประเทศไทย)",
            "Yuanta Securities",
            "RETAIL",
        ),
        (
            "PHILLIP",
            "บล. ฟิลลิป (ประเทศไทย)",
            "Phillip Securities",
            "RETAIL",
        ),
        (
            "MAYBANK",
            "บล. เมย์แบงก์ (ประเทศไทย)",
            "Maybank Securities",
            "RETAIL",
        ),
    ];

    for (code, name_th, name_en, cat) in defaults {
        sqlx::query("INSERT OR IGNORE INTO brokers (code, name_th, name_en, category) VALUES (?1, ?2, ?3, ?4)")
            .bind(code)
            .bind(name_th)
            .bind(name_en)
            .bind(cat)
            .execute(pool)
            .await?;
    }

    Ok(())
}

async fn create_tables(pool: &DbPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    sqlx::query(
        r#"
        -- 1. ตารางเก็บข้อมูลกองทุน
        CREATE TABLE IF NOT EXISTS funds (
            proj_id TEXT PRIMARY KEY,
            unique_id TEXT,
            proj_abbr_name TEXT,
            proj_name_th TEXT,
            proj_name_en TEXT,
            fund_status TEXT,
            fund_class_name TEXT,
            policy_desc TEXT,
            last_nav TEXT,
            last_nav_date TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 2. ตารางประวัติราคา NAV รายวัน (รองรับ Multi-class ตามกฎแม่บท SEC Master Rule)
        CREATE TABLE IF NOT EXISTS fund_nav_history (
            proj_id TEXT NOT NULL,
            nav_date TEXT NOT NULL,
            fund_class_name TEXT NOT NULL DEFAULT '',
            nav TEXT NOT NULL,
            buy_price TEXT,
            sell_price TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (proj_id, nav_date, fund_class_name)
        );

        -- 3. ตารางบันทึกธุรกรรมการซื้อขายพอร์ตของผู้ใช้ (รองรับ Multi-user และ Idempotent Deduplication)
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            idempotency_key TEXT,
            proj_id TEXT NOT NULL,
            fund_abbr TEXT,
            platform TEXT NOT NULL,           -- 'KBANK', 'TTB', 'DIME', 'SCB', 'OTHER'
            trans_type TEXT NOT NULL,         -- 'BUY', 'SELL', 'DIVIDEND'
            trans_date TEXT NOT NULL,         -- YYYY-MM-DD
            units TEXT NOT NULL,              -- Decimal
            unit_price TEXT NOT NULL,         -- Decimal
            total_amount TEXT NOT NULL,       -- Decimal
            fee TEXT NOT NULL DEFAULT '0.00', -- Decimal
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 4. ตาราง Master Data โบรกเกอร์ / ตัวแทนขาย / บลจ. จาก SEC
        CREATE TABLE IF NOT EXISTS brokers (
            code TEXT PRIMARY KEY,
            name_th TEXT NOT NULL,
            name_en TEXT NOT NULL,
            category TEXT NOT NULL -- 'RETAIL', 'AMC'
        );

        -- Index เพื่อความเร็วในการค้นหาและคำนวณ
        CREATE INDEX IF NOT EXISTS idx_funds_abbr ON funds(proj_abbr_name);
        CREATE INDEX IF NOT EXISTS idx_trans_proj ON transactions(proj_id);
        CREATE INDEX IF NOT EXISTS idx_trans_platform ON transactions(platform);
        CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(trans_date);
        CREATE INDEX IF NOT EXISTS idx_nav_proj_date ON fund_nav_history(proj_id, nav_date);
        CREATE INDEX IF NOT EXISTS idx_nav_proj_date_class ON fund_nav_history(proj_id, nav_date, fund_class_name);
        "#,
    )
    .execute(pool)
    .await?;

    // Migration: เพิ่มคอลัมน์ user_id ถ้ายังไม่มีในฐานข้อมูลเดิม
    let _ = sqlx::query(
        "ALTER TABLE transactions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default_user'",
    )
    .execute(pool)
    .await;

    // Migration: เพิ่มคอลัมน์ idempotency_key ถ้ายังไม่มีในฐานข้อมูลเดิม
    let _ = sqlx::query("ALTER TABLE transactions ADD COLUMN idempotency_key TEXT")
        .execute(pool)
        .await;

    // สร้าง Index บน user_id หลังจากมั่นใจว่ามีคอลัมน์แล้ว
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_trans_user ON transactions(user_id)")
        .execute(pool)
        .await;

    // สร้าง Unique Index บน user_id และ idempotency_key ป้องกันรายการซ้ำ
    let _ = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trans_idempotency ON transactions(user_id, idempotency_key)",
    )
    .execute(pool)
    .await;

    // 5. ตาราง User Settings สำหรับ Gmail Auto-Sync และการสร้างรหัสผ่านถอดรหัส Statement PDF แต่ละธนาคาร
    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            gmail_account TEXT,
            gmail_app_password TEXT,
            dob_day TEXT,
            dob_month TEXT,
            dob_year_ce TEXT,
            dob_year_be TEXT,
            national_id_last5 TEXT,
            custom_pdf_passwords TEXT,
            auto_sync_enabled INTEGER DEFAULT 0,
            last_sync_at TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 6. ตารางบันทึกประวัติอีเมลที่เคยประมวลผลแล้ว (Checkpoint & Resume) ป้องกันการสแกนซ้ำและประหยัด Token 100%
        CREATE TABLE IF NOT EXISTS processed_emails (
            message_id TEXT PRIMARY KEY,
            broker TEXT,
            subject TEXT,
            email_date TEXT,
            tx_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 7. ตารางบันทึกไฟล์แนบ PDF ที่เคยถอดรหัสแล้ว (Content Hash)
        CREATE TABLE IF NOT EXISTS processed_attachments (
            file_hash TEXT PRIMARY KEY,
            filename TEXT,
            tx_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 8. ตารางบันทึกสถานะการถือครองกองทุนสำรองเลี้ยงชีพ (PVD Latest Position Snapshot)
        CREATE TABLE IF NOT EXISTS pvd_positions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            policy_code TEXT NOT NULL,
            policy_name TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            units TEXT NOT NULL,
            nav TEXT NOT NULL,
            cost TEXT NOT NULL,
            market_value TEXT NOT NULL,
            unrealized_pl TEXT NOT NULL,
            unrealized_pl_pct TEXT NOT NULL,
            statement_file TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, policy_code)
        );

        -- 9. ตารางบันทึกประวัติธุรกรรมหุ้นต่างประเทศ (Offshore Stocks e.g. Dime US Stocks) แยกเฉพาะ
        CREATE TABLE IF NOT EXISTS stock_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            idempotency_key TEXT,
            ticker TEXT NOT NULL,
            company_name TEXT,
            platform TEXT NOT NULL,
            trans_type TEXT NOT NULL,
            trans_date TEXT NOT NULL,
            shares TEXT NOT NULL,
            price_usd TEXT NOT NULL,
            total_thb TEXT NOT NULL,
            exchange_rate TEXT,
            fee_thb TEXT DEFAULT '0.00',
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, idempotency_key)
        );

        -- 10. ตาราง Staging: รายการที่รอ user ตรวจสอบก่อน Commit จริง
        CREATE TABLE IF NOT EXISTS pending_transactions (
            id               TEXT PRIMARY KEY,
            user_id          TEXT NOT NULL DEFAULT 'default_user',
            sync_batch_id    TEXT NOT NULL,
            source_file      TEXT,
            source_email     TEXT,
            platform         TEXT NOT NULL,
            raw_fund_name    TEXT NOT NULL,
            proj_id          TEXT,
            fund_abbr        TEXT,
            fund_name_th     TEXT,
            fund_name_en     TEXT,
            match_confidence TEXT NOT NULL DEFAULT 'NONE',
            trans_type       TEXT NOT NULL,
            trans_date       TEXT NOT NULL,
            units            TEXT NOT NULL,
            unit_price       TEXT NOT NULL,
            nav_source       TEXT NOT NULL DEFAULT 'PDF',
            total_amount     TEXT NOT NULL,
            fee              TEXT NOT NULL DEFAULT '0.00',
            note             TEXT,
            status           TEXT NOT NULL DEFAULT 'PENDING',
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_pending_user_status ON pending_transactions(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_pending_batch ON pending_transactions(sync_batch_id);

        CREATE TABLE IF NOT EXISTS fund_aliases (
            alias TEXT PRIMARY KEY,
            proj_id TEXT NOT NULL,
            canonical_abbr TEXT NOT NULL,
            display_name TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_fund_aliases_canonical ON fund_aliases(canonical_abbr);
        CREATE INDEX IF NOT EXISTS idx_fund_aliases_proj_id ON fund_aliases(proj_id);

        -- 11. ตาราง Master Broker Config สำหรับ Email Harvester
        CREATE TABLE IF NOT EXISTS email_broker_configs (
            broker_key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            sender_emails TEXT NOT NULL,
            subject_includes TEXT NOT NULL,
            subject_excludes TEXT NOT NULL,
            extraction_type TEXT NOT NULL,
            password_patterns TEXT NOT NULL,
            ai_prompt_variant TEXT NOT NULL DEFAULT 'DEFAULT',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 12. ตารางประวัติการทำงานของ Background Scheduler Daemon (Slice 33)
        CREATE TABLE IF NOT EXISTS scheduled_sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_name TEXT NOT NULL,
            triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            status TEXT NOT NULL,
            updated_funds_count INTEGER DEFAULT 0,
            error_summary TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sched_sync_job_status ON scheduled_sync_logs(job_name, status);
        CREATE INDEX IF NOT EXISTS idx_sched_sync_triggered ON scheduled_sync_logs(triggered_at);

        -- 14. ตารางบันทึกราคาหุ้นต่างประเทศและอัตราแลกเปลี่ยนล่าสุด (US Stocks & FX Quotes)
        CREATE TABLE IF NOT EXISTS stock_prices (
            ticker TEXT PRIMARY KEY,
            price TEXT NOT NULL,
            currency TEXT NOT NULL,
            quote_date TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )
    .execute(pool)
    .await;

    // Migration: เพิ่มคอลัมน์ nav_source ถ้ายังไม่มี
    let _ = sqlx::query(
        "ALTER TABLE pending_transactions ADD COLUMN nav_source TEXT NOT NULL DEFAULT 'PDF'",
    )
    .execute(pool)
    .await;

    Ok(())
}

pub async fn seed_default_email_broker_configs(
    pool: &DbPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_broker_configs")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if count == 0 {
        let config_str = std::fs::read_to_string("config/email_sync_brokers.json")
            .or_else(|_| std::fs::read_to_string("backend/config/email_sync_brokers.json"))
            .unwrap_or_else(|_| include_str!("../../config/email_sync_brokers.json").to_string());

        let brokers: Vec<serde_json::Value> = serde_json::from_str(&config_str).unwrap_or_default();
        for b in brokers {
            let key = b.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let enabled = b.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            let sender_emails = serde_json::to_string(b.get("sender_emails").unwrap_or(&serde_json::json!([]))).unwrap_or_default();
            let subject_includes = serde_json::to_string(b.get("subject_includes").unwrap_or(&serde_json::json!([]))).unwrap_or_default();
            let subject_excludes = serde_json::to_string(b.get("subject_excludes").unwrap_or(&serde_json::json!([]))).unwrap_or_default();
            let extraction_type = b.get("extraction_type").and_then(|v| v.as_str()).unwrap_or("PDF_ATTACHMENT");
            let password_patterns = serde_json::to_string(b.get("password_patterns").unwrap_or(&serde_json::json!([]))).unwrap_or_default();
            let ai_prompt_variant = b.get("ai_prompt_variant").and_then(|v| v.as_str()).unwrap_or("DEFAULT");

            sqlx::query(
                r#"
                INSERT INTO email_broker_configs (
                    broker_key, name, enabled, sender_emails, subject_includes, subject_excludes,
                    extraction_type, password_patterns, ai_prompt_variant
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ON CONFLICT(broker_key) DO NOTHING
                "#,
            )
            .bind(key)
            .bind(name)
            .bind(enabled)
            .bind(sender_emails)
            .bind(subject_includes)
            .bind(subject_excludes)
            .bind(extraction_type)
            .bind(password_patterns)
            .bind(ai_prompt_variant)
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}
