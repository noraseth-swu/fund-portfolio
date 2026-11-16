import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cursor = conn.cursor()

cursor.execute("""
    SELECT t.id, t.trans_date, t.units, t.unit_price, t.total_amount, 
           ROUND(t.total_amount / t.units, 4) as calc_price,
           h.sell_price as sec_sell, h.buy_price as sec_buy, h.nav as sec_nav
    FROM transactions t
    LEFT JOIN fund_nav_history h ON h.proj_id = t.proj_id 
        AND h.nav_date = t.trans_date 
        AND h.fund_class_name = 'SCBS&P500E'
    WHERE t.fund_abbr = 'SCBS&P500E' AND ABS(t.units * t.unit_price - t.total_amount) > 1.0
    ORDER BY t.trans_date
""")
print("SCBS&P500E comparison:")
for r in cursor.fetchall():
    print(r)

conn.close()
