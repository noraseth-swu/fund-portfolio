import sqlite3
import imaplib
import email
from email.header import decode_header

conn = sqlite3.connect('d:/git/fund-portfolio/backend/portfolio.db')
cur = conn.cursor()
cur.execute("SELECT gmail_account, gmail_app_password FROM user_settings WHERE user_id = 'user_3M5R1qx9Sis0ImuVmsGGRVDhKCB'")
row = cur.fetchone()
gmail_user, gmail_pass = row[0], row[1]

mail = imaplib.IMAP4_SSL('imap.gmail.com', 993)
mail.login(gmail_user, gmail_pass)
mail.select('"[Gmail]/All Mail"', readonly=True)

def decode_mime(header_val):
    if not header_val:
        return ""
    decoded_fragments = decode_header(header_val)
    text = ""
    for frag, enc in decoded_fragments:
        if isinstance(frag, bytes):
            text += frag.decode(enc or 'utf-8', errors='replace')
        else:
            text += str(frag)
    return text

# Search for all emails from K PLUS with purchase order or fund
res, data = mail.search(None, 'FROM "KPLUS@kasikornbank.com"')
print('Total emails from KPLUS@kasikornbank.com:', len(data[0].split()) if data[0] else 0)

kplus_funds = []
if res == 'OK' and data[0]:
    ids = data[0].split()
    for eid in ids:
        res2, mdata = mail.fetch(eid, '(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE)])')
        if res2 == 'OK' and mdata[0] and isinstance(mdata[0], tuple):
            raw_headers = mdata[0][1].decode('utf-8', errors='replace')
            msg = email.message_from_string(raw_headers)
            sub = decode_mime(msg.get('Subject'))
            dt = msg.get('Date')
            # Check if subject is about fund purchase
            if any(k in sub.lower() for k in ['purchase order', 'dca', 'subscription', 'คำสั่งซื้อ']):
                kplus_funds.append((eid.decode(), dt, sub))

print(f"Found {len(kplus_funds)} fund-related K PLUS emails:")
for eid, dt, sub in kplus_funds:
    print(f"   ID {eid}: Date: {dt} | Subject: {sub}")

mail.logout()
