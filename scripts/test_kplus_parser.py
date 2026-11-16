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

success_ids = ['65922', '65989', '67169', '67849', '68494', '69227', '70748', '71552', '73347']

def parse_kplus_body(body_text, cur):
    clean = re.sub(r'<[^>]+>', '\n', body_text).replace('&nbsp;', ' ')
    if 'failed' in clean.lower() or 'failure' in clean.lower() or 'ล้มเหลว' in clean:
        return []
    
    # Date
    date_m = re.search(r'(?:ราคา ณ วันที่|วันที่ทำรายการ):\s*(\d{2})[/-](\d{2})[/-](\d{4})', clean)
    if not date_m:
        return []
    d, m, y = date_m.groups()
    y_int = int(y)
    if y_int > 2400:
        y_int -= 543
    trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"
    
    # Fund
    fund_m = re.search(r'\n\s*กองทุน:\s*([A-Za-z0-9\-_()]+)', clean)
    if not fund_m:
        return []
    fund_code = fund_m.group(1).strip()
    
    # Amount
    amt_m = re.search(r'จำนวนเงิน\s*\(บาท\):\s*([\d,]+\.?\d*)', clean)
    if not amt_m:
        return []
    total_amount = float(amt_m.group(1).replace(',', ''))
    
    # Ref
    ref_m = re.search(r'เลขที่รายการ:\s*([A-Za-z0-9]+)', clean)
    ref = ref_m.group(1).strip() if ref_m else ""
    
    # Trans type
    trans_type = "BUY"
    if "ขาย" in clean and "ซื้อ" not in clean:
        trans_type = "SELL"
    
    # Query SEC proj_id & NAV
    cur.execute("SELECT proj_id FROM funds WHERE proj_abbr_name = ? OR proj_id = ? LIMIT 1", (fund_code, fund_code))
    prow = cur.fetchone()
    proj_id = prow[0] if prow else fund_code
    
    cur.execute("SELECT nav, nav_date FROM fund_nav_history WHERE proj_id = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1", (proj_id, trans_date))
    nav_row = cur.fetchone()
    
    if nav_row:
        nav = float(nav_row[0])
        units = round(total_amount / nav, 4) if nav > 0 else 0.0
        nav_source = "SEC"
    else:
        nav = 0.0
        units = 0.0
        nav_source = "ESTIMATED"
        
    return [{
        "trans_date": trans_date,
        "platform": "KBANK",
        "fund_code": fund_code,
        "proj_id": proj_id,
        "trans_type": trans_type,
        "units": units,
        "unit_price": nav,
        "total_amount": total_amount,
        "fee": 0.0,
        "nav_source": nav_source,
        "ref": ref
    }]

print(f"{'Date':<12} {'Fund':<14} {'Type':<6} {'Amount (THB)':<14} {'NAV':<10} {'Units':<12} {'Ref'}")
print("-" * 80)
for eid in success_ids:
    res, mdata = mail.fetch(eid, '(RFC822)')
    if res == 'OK' and mdata[0] and isinstance(mdata[0], tuple):
        msg = email.message_from_bytes(mdata[0][1])
        body_text = ""
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ('text/plain', 'text/html'):
                payload = part.get_payload(decode=True)
                if payload:
                    enc = part.get_content_charset() or 'utf-8'
                    body_text += payload.decode(enc, errors='replace')
        txs = parse_kplus_body(body_text, cur)
        for tx in txs:
            print(f"{tx['trans_date']:<12} {tx['fund_code']:<14} {tx['trans_type']:<6} {tx['total_amount']:<14.2f} {tx['unit_price']:<10.4f} {tx['units']:<12.4f} {tx['ref']}")

mail.logout()
