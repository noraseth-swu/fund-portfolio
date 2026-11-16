import sqlite3
import math

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cursor = conn.cursor()

# 9 transactions of 2026 for K-WPSPEEDUP
txs_2026 = [
    ('2026-01-28', 10000.0, 9.8505),
    ('2026-01-29', 5000.0, 9.8563),
    ('2026-03-30', 5000.0, 9.5408),
    ('2026-04-30', 5000.0, 10.2821),
    ('2026-05-29', 5000.0, 10.7479),
    ('2026-06-30', 5000.0, 10.7900),
    ('2026-07-31', 5000.0, 10.4686),
    ('2026-08-31', 5000.0, 10.7475),
    ('2026-11-10', 5000.0, 10.1291),
]

for t_date, amount, price in txs_2026:
    # AIMC standard: truncate to 4 decimal places
    t_units = math.floor((amount / price) * 10000) / 10000
    units_str = f"{t_units:.4f}"
    
    cursor.execute("""
        UPDATE transactions
        SET units = ?
        WHERE fund_abbr = 'K-WPSPEEDUP' AND trans_date = ?
    """, (units_str, t_date))
    
    cursor.execute("""
        UPDATE pending_transactions
        SET units = ?
        WHERE fund_abbr = 'K-WPSPEEDUP' AND trans_date = ?
    """, (units_str, t_date))
    print(f"Updated {t_date}: amount={amount}, price={price} -> units={units_str}")

conn.commit()

# Verify sum
cursor.execute("SELECT SUM(CAST(units AS REAL)) FROM transactions WHERE fund_abbr = 'K-WPSPEEDUP'")
total_units = cursor.fetchone()[0]
print(f"\nNew Total Units in transactions: {total_units:.4f}")
print(f"Target in App:                  23843.7048")
print(f"Difference:                     {total_units - 23843.7048:.8f}")

conn.close()
