import sqlite3

conn = sqlite3.connect("D:/git/fund-portfolio/backend/portfolio.db")
c = conn.cursor()

print("--- KKP NDQ IN FUNDS TABLE ---")
for r in c.execute("SELECT proj_id, proj_abbr_name, proj_name_th, last_nav, last_nav_date FROM funds WHERE proj_abbr_name LIKE '%NDQ%' OR proj_id LIKE '%NDQ%'").fetchall():
    print(r)

print("\n--- KKP US500 IN FUNDS TABLE ---")
for r in c.execute("SELECT proj_id, proj_abbr_name, proj_name_th, last_nav, last_nav_date FROM funds WHERE proj_abbr_name LIKE '%US500%' OR proj_id LIKE '%US500%'").fetchall():
    print(r)
