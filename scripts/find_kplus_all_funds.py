import sqlite3
import imaplib
import email
import re

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cur = conn.cursor()
cur.execute("SELECT gmail_account, gmail_app_password FROM user_settings WHERE user_id = 'user_3M5R1qx9Sis0ImuVmsGGRVDhKCB'")
row = cur.fetchone()
gmail_user, gmail_pass = row[0], row[1]

mail = imaplib.IMAP4_SSL('imap.gmail.com', 993)
mail.login(gmail_user, gmail_pass)
mail.select('"[Gmail]/All Mail"', readonly=True)

res, data = mail.search(None, 'FROM "KPLUS@kasikornbank.com"')
ids = data[0].split() if res == 'OK' and data[0] else []
print(f"Total KPLUS emails: {len(ids)}")

# Check in batches of 50 backwards to find any purchase order emails
found_emails = []
for eid in ids:
    res2, mdata = mail.fetch(eid, '(BODY.PEEK[HEADER.FIELDS (SUBJECT)])')
    if res2 == 'OK' and mdata[0] and isinstance(mdata[0], tuple):
        sub = mdata[0][1].decode('utf-8', errors='replace')
        if 'purchase order' in sub.lower() or 'คำสั่งซื้อ' in sub.lower():
            found_emails.append((eid.decode(), sub.strip()))

print(f"Found {len(found_emails)} purchase order emails:")
for eid, s in found_emails:
    print(eid, s)

mail.logout()
