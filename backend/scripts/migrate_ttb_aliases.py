import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'portfolio.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("UPDATE transactions SET fund_abbr = 'ES-GF-A' WHERE proj_id = 'M0621_2553' AND (fund_abbr = 'ES-GF' OR fund_abbr IS NULL)")
print("Updated ES-GF -> ES-GF-A in transactions:", c.rowcount)

c.execute("UPDATE transactions SET fund_abbr = 'TSF-A' WHERE proj_id = 'M0011_2547' AND (fund_abbr = 'TSF' OR fund_abbr IS NULL)")
print("Updated TSF -> TSF-A in transactions:", c.rowcount)

c.execute("UPDATE pending_transactions SET fund_abbr = 'ES-GF-A' WHERE fund_abbr = 'ES-GF'")
c.execute("UPDATE pending_transactions SET fund_abbr = 'TSF-A' WHERE fund_abbr = 'TSF'")

c.execute("UPDATE fund_aliases SET canonical_abbr = 'ES-GF-A' WHERE proj_id = 'M0621_2553' AND (alias = 'ES-GF' OR canonical_abbr = 'ES-GF')")
c.execute("UPDATE fund_aliases SET canonical_abbr = 'TSF-A' WHERE proj_id = 'M0011_2547' AND (alias = 'TSF' OR canonical_abbr = 'TSF')")

conn.commit()
conn.close()
print("Migration completed successfully.")
