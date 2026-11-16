import sqlite3

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
c = conn.cursor()

print("Schema of fund_nav_history table creation:")
print(c.execute("SELECT sql FROM sqlite_master WHERE name = 'fund_nav_history'").fetchone()[0])
