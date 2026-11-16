import sqlite3
import os

DB_PATH = "D:/git/fund-portfolio/backend/portfolio.db"
PROGRESS_FILE = "D:/git/fund-portfolio/backend/sync_progress.json"

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

print("--- RESETTING PORTFOLIO DATABASE ---")
c.execute("DELETE FROM transactions")
print(f"[✓] Cleared transactions table (deleted {c.rowcount} rows)")

try:
    c.execute("DELETE FROM pending_transactions")
    print(f"[✓] Cleared pending_transactions table (deleted {c.rowcount} rows)")
except sqlite3.OperationalError:
    pass

try:
    c.execute("DELETE FROM stock_transactions")
    print(f"[✓] Cleared stock_transactions table (deleted {c.rowcount} rows)")
except sqlite3.OperationalError:
    pass

c.execute("DELETE FROM processed_emails")
print(f"[✓] Cleared processed_emails cache (deleted {c.rowcount} rows)")

c.execute("DELETE FROM processed_attachments")
print(f"[✓] Cleared processed_attachments cache (deleted {c.rowcount} rows)")

c.execute("DELETE FROM pvd_positions")
print(f"[✓] Cleared pvd_positions snapshot (deleted {c.rowcount} rows)")

conn.commit()
conn.close()

if os.path.exists(PROGRESS_FILE):
    os.remove(PROGRESS_FILE)
    print("[✓] Cleared sync_progress.json")

print("--- RESET COMPLETED. READY FOR FRESH SCAN ---")
