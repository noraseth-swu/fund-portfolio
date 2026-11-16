import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cursor = conn.cursor()

print("ES-GF comparison:")
cursor.execute("""
    SELECT t.id, t.trans_date, t.units, t.unit_price, t.total_amount, 
           ROUND(t.total_amount / t.units, 4) as calc_price,
           h.sell_price as sec_sell, h.fund_class_name
    FROM transactions t
    LEFT JOIN fund_nav_history h ON h.proj_id = t.proj_id 
        AND h.nav_date = t.trans_date 
        AND h.fund_class_name LIKE 'ES-GF%'
        AND ABS(CAST(h.sell_price AS REAL) - (t.total_amount / t.units)) < 0.01
    WHERE t.fund_abbr = 'ES-GF' AND ABS(t.units * t.unit_price - t.total_amount) > 1.0
    ORDER BY t.trans_date
""")
for r in cursor.fetchall():
    print(r)

print("\nES-ASIA-A comparison:")
cursor.execute("""
    SELECT t.id, t.trans_date, t.units, t.unit_price, t.total_amount, 
           ROUND(t.total_amount / t.units, 4) as calc_price,
           h.sell_price as sec_sell, h.fund_class_name
    FROM transactions t
    LEFT JOIN fund_nav_history h ON h.proj_id = t.proj_id 
        AND h.nav_date = t.trans_date 
        AND h.fund_class_name LIKE 'ES-ASIA%'
        AND ABS(CAST(h.sell_price AS REAL) - (t.total_amount / t.units)) < 0.01
    WHERE t.fund_abbr = 'ES-ASIA-A' AND ABS(t.units * t.unit_price - t.total_amount) > 1.0
    ORDER BY t.trans_date
""")
for r in cursor.fetchall():
    print(r)

conn.close()
