import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cursor = conn.cursor()

# Check ES-GF proj_id
cursor.execute("SELECT proj_id, fund_abbr FROM transactions WHERE fund_abbr = 'ES-GF' LIMIT 1")
proj_id, abbr = cursor.fetchone()
print(f"proj_id for {abbr}: {proj_id}")

cursor.execute("""
    SELECT nav_date, fund_class_name, nav, sell_price, buy_price 
    FROM fund_nav_history 
    WHERE proj_id = ? AND nav_date = '2024-02-28'
""", (proj_id,))
print("NAV history for ES-GF on 2024-02-28:")
for r in cursor.fetchall():
    print(r)

# Check transaction on that date
cursor.execute("""
    SELECT trans_date, units, unit_price, total_amount, ROUND(total_amount/units, 4) 
    FROM transactions 
    WHERE fund_abbr = 'ES-GF' AND trans_date = '2024-02-28'
""")
print("Transaction for ES-GF on 2024-02-28:")
for r in cursor.fetchall():
    print(r)

conn.close()
