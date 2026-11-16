import sqlite3

def run():
    conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
    cursor = conn.cursor()

    cursor.execute("SELECT proj_id, fund_abbr FROM transactions WHERE fund_abbr LIKE '%S&P500%' LIMIT 1")
    row = cursor.fetchone()
    if row:
        proj_id, abbr = row
        print(f"proj_id for {abbr}: {proj_id}")
        cursor.execute("""
            SELECT nav_date, fund_class_name, nav, sell_price, buy_price 
            FROM fund_nav_history 
            WHERE proj_id = ? AND nav_date = '2026-10-28'
        """, (proj_id,))
        print("NAV history for 2026-10-28:")
        for r in cursor.fetchall():
            print(r)
            
    cursor.execute("""
        SELECT platform, fund_abbr, COUNT(*) 
        FROM transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 1.0
        GROUP BY platform, fund_abbr
    """)
    print("\nTransactions with > 1 THB diff:")
    for r in cursor.fetchall():
        print(r)

    cursor.execute("""
        SELECT platform, fund_abbr, COUNT(*) 
        FROM pending_transactions 
        WHERE units > 0 AND total_amount > 0 AND ABS(units * unit_price - total_amount) > 1.0
        GROUP BY platform, fund_abbr
    """)
    print("\nPending transactions with > 1 THB diff:")
    for r in cursor.fetchall():
        print(r)

    conn.close()

if __name__ == '__main__':
    run()
