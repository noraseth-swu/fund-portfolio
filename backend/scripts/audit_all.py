import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cursor = conn.cursor()

print("--- FULL AUDIT OF TRANSACTIONS ---")
cursor.execute("""
    SELECT id, platform, fund_abbr, trans_type, trans_date, units, unit_price, total_amount, fee,
           ROUND(total_amount / units, 4) as calc_price,
           (units * unit_price - total_amount) as diff
    FROM transactions
    WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 0.05
    ORDER BY platform, fund_abbr, trans_date
""")
tx_discrepancies = cursor.fetchall()
print(f"Total transactions with diff > 0.05 THB: {len(tx_discrepancies)}")
for r in tx_discrepancies:
    print(r[1], r[2], r[4], f"units={r[5]}", f"price={r[6]}", f"total={r[7]}", f"calc_p={r[9]}", f"diff={r[10]:.2f}")

print("\n--- FULL AUDIT OF PENDING TRANSACTIONS ---")
cursor.execute("""
    SELECT id, platform, fund_abbr, trans_type, trans_date, units, unit_price, total_amount, fee, status,
           ROUND(total_amount / units, 4) as calc_price,
           (units * unit_price - total_amount) as diff
    FROM pending_transactions
    WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 0.05
    ORDER BY platform, fund_abbr, trans_date
""")
pt_discrepancies = cursor.fetchall()
print(f"Total pending transactions with diff > 0.05 THB: {len(pt_discrepancies)}")
for r in pt_discrepancies:
    print(r[1], r[2], r[4], f"units={r[5]}", f"price={r[6]}", f"total={r[7]}", f"calc_p={r[10]}", f"diff={r[11]:.2f}", f"status={r[9]}")

conn.close()
