import sqlite3
import shutil
from datetime import datetime

DB_PATH = 'd:/git/fund-portfolio/backend/portfolio.db'
BACKUP_PATH = f'd:/git/fund-portfolio/backend/portfolio.db.backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}'

def remediate():
    # 1. Create a safe backup first
    shutil.copy2(DB_PATH, BACKUP_PATH)
    print(f"Backup created at: {BACKUP_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Audit before
    cursor.execute("""
        SELECT COUNT(*) FROM transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 0.05
    """)
    tx_before = cursor.fetchone()[0]
    cursor.execute("""
        SELECT COUNT(*) FROM pending_transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 0.05
    """)
    pt_before = cursor.fetchone()[0]
    print(f"Before: {tx_before} discrepant rows in transactions, {pt_before} in pending_transactions")

    # 2. Fix KT-CSBOND-A 2025-02-28 total_amount
    cursor.execute("""
        UPDATE transactions
        SET total_amount = '650.00'
        WHERE fund_abbr = 'KT-CSBOND-A' AND trans_date = '2025-02-28' AND total_amount = '645.16'
    """)
    cursor.execute("""
        UPDATE pending_transactions
        SET total_amount = '650.00'
        WHERE fund_abbr = 'KT-CSBOND-A' AND trans_date = '2025-02-28' AND total_amount = '645.16'
    """)
    print("Updated KT-CSBOND-A 2025-02-28 total_amount to 650.00")

    # 3. Fix share-class price mismatch in transactions:
    # unit_price = printf('%.4f', round(total_amount / units, 4))
    # for all mutual funds where discrepancy > 0.05
    cursor.execute("""
        UPDATE transactions
        SET unit_price = printf('%.4f', ROUND(CAST(total_amount AS REAL) / CAST(units AS REAL), 4))
        WHERE units > 0 AND total_amount > 0 AND ABS(CAST(units AS REAL) * CAST(unit_price AS REAL) - CAST(total_amount AS REAL)) > 0.05
    """)
    updated_tx = cursor.rowcount
    print(f"Updated {updated_tx} rows in transactions to true executed unit_price")

    # 4. Fix pending_transactions for the same share-class mismatches
    cursor.execute("""
        UPDATE pending_transactions
        SET unit_price = printf('%.4f', ROUND(CAST(total_amount AS REAL) / CAST(units AS REAL), 4))
        WHERE units > 0 AND total_amount > 0 AND ABS(CAST(units AS REAL) * CAST(unit_price AS REAL) - CAST(total_amount AS REAL)) > 0.05
    """)
    updated_pt = cursor.rowcount
    print(f"Updated {updated_pt} rows in pending_transactions to true executed unit_price")

    # 5. Reconcile K-WPSPEEDUP pending_transactions with transactions for 2026 rows
    cursor.execute("""
        SELECT t.trans_date, t.units, t.unit_price, t.total_amount
        FROM transactions t
        WHERE t.fund_abbr = 'K-WPSPEEDUP' AND t.trans_date LIKE '2026%'
    """)
    k_txs = cursor.fetchall()
    for t_date, t_units, t_price, t_amt in k_txs:
        cursor.execute("""
            UPDATE pending_transactions
            SET units = ?, unit_price = ?, total_amount = ?
            WHERE fund_abbr = 'K-WPSPEEDUP' AND trans_date = ?
        """, (t_units, t_price, t_amt, t_date))
    print(f"Synchronized {len(k_txs)} K-WPSPEEDUP 2026 rows in pending_transactions")

    conn.commit()

    # Audit after
    cursor.execute("""
        SELECT COUNT(*) FROM transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(CAST(units AS REAL) * CAST(unit_price AS REAL) - CAST(total_amount AS REAL)) > 0.05
    """)
    tx_after = cursor.fetchone()[0]
    cursor.execute("""
        SELECT COUNT(*) FROM pending_transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(CAST(units AS REAL) * CAST(unit_price AS REAL) - CAST(total_amount AS REAL)) > 0.05
    """)
    pt_after = cursor.fetchone()[0]
    print(f"After: {tx_after} discrepant rows in transactions, {pt_after} in pending_transactions")

    conn.close()

if __name__ == '__main__':
    remediate()
