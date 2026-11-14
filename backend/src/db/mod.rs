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

        -- 2. ตารางประวัติราคา NAV รายวัน
        CREATE TABLE IF NOT EXISTS fund_nav_history (
            proj_id TEXT NOT NULL,
            nav_date TEXT NOT NULL,
            nav TEXT NOT NULL,
            buy_price TEXT,
            sell_price TEXT,
            fund_class_name TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (proj_id, nav_date)
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

    Ok(())
}
