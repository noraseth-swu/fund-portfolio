import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
c = conn.cursor()

# Check table info
pk_cols = [row[1] for row in c.execute("PRAGMA table_info(fund_nav_history)").fetchall() if row[5] > 0]
print("Current PK cols:", pk_cols)

if 'fund_class_name' not in pk_cols:
    print("Migrating fund_nav_history to include fund_class_name in PRIMARY KEY...")
    c.execute("""
        CREATE TABLE fund_nav_history_new (
            proj_id TEXT NOT NULL,
            nav_date TEXT NOT NULL,
            fund_class_name TEXT NOT NULL DEFAULT '',
            nav TEXT NOT NULL,
            buy_price TEXT,
            sell_price TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (proj_id, nav_date, fund_class_name)
        )
    """)
    c.execute("""
        INSERT OR IGNORE INTO fund_nav_history_new (proj_id, nav_date, fund_class_name, nav, buy_price, sell_price, updated_at)
        SELECT proj_id, nav_date, COALESCE(fund_class_name, ''), nav, buy_price, sell_price, updated_at
        FROM fund_nav_history
    """)
    c.execute("DROP TABLE fund_nav_history")
    c.execute("ALTER TABLE fund_nav_history_new RENAME TO fund_nav_history")
    c.execute("CREATE INDEX IF NOT EXISTS idx_nav_proj_date_class ON fund_nav_history(proj_id, nav_date, fund_class_name)")
    conn.commit()
    print("Migration completed.")
else:
    print("fund_class_name is already in PRIMARY KEY.")

# Verify new PK
new_pk_cols = [row[1] for row in c.execute("PRAGMA table_info(fund_nav_history)").fetchall() if row[5] > 0]
print("New PK cols:", new_pk_cols)
print("Total rows:", c.execute("SELECT COUNT(*) FROM fund_nav_history").fetchone()[0])
