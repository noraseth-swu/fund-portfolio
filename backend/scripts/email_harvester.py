#!/usr/bin/env python3
"""
Gmail Confirmation Note & E-Statement Harvester for Fund Portfolio
Supports:
  1. ttb (estatement@eservice.ttbbank.com) - PDF password: DD{Mmm}YYYY (e.g. 01Feb1980)
  2. Dime! (no-reply@dime.co.th) - PDF password: DDMMYYYY (e.g. 01021980)
  3. SCB (Registrar2@email.scb.co.th) - PDF password: last 5 digits of National ID
  4. Kasikorn Funds (ka.CyberInvest@kasikornasset.com) - HTML Table in email body
  5. Kasikorn PVD (KA.Pvdcallcenter@kasikornasset.com) - PDF password: DDMMYYYY in BE (e.g. 05032518)
"""

import sys
import os
import io
import re
import json
import hashlib
import imaplib
import email
from email.header import decode_header
import sqlite3
import argparse
from datetime import datetime
import urllib.request
import urllib.error

MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

def decode_mime_words(s):
    if not s:
        return ""
    try:
        decoded_fragments = decode_header(s)
    except Exception:
        return str(s)
    result = []
    for frag, enc in decoded_fragments:
        if isinstance(frag, bytes):
            enc_clean = (enc or "utf-8").lower().strip()
            if enc_clean in ("windows-874", "win-874", "tis-620", "tis620", "cp874"):
                enc_clean = "cp874"
            try:
                result.append(frag.decode(enc_clean, errors="replace"))
            except Exception:
                try:
                    result.append(frag.decode("cp874", errors="replace"))
                except Exception:
                    result.append(frag.decode("utf-8", errors="replace"))
        else:
            result.append(str(frag))
    return "".join(result)

def compute_idempotency_key(user_id, platform, proj_id, trans_date, trans_type, units, total_amount, note=""):
    raw = f"{user_id}|{platform}|{proj_id}|{trans_date}|{trans_type}|{float(units):.4f}|{float(total_amount):.2f}|{note or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def generate_bank_passwords(dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5):
    """
    Generate dictionary of passwords for each known broker pattern
    """
    day_str = f"{int(dob_day):02d}" if dob_day else "01"
    month_int = int(dob_month) if dob_month else 1
    month_str = f"{month_int:02d}"
    month_abbr = MONTH_NAMES_EN[month_int - 1] if 1 <= month_int <= 12 else "Jan"
    year_ce = str(dob_year_ce) if dob_year_ce else "1980"
    year_be = str(dob_year_be) if dob_year_be else str(int(year_ce) + 543)
    id_last5 = str(national_id_last5).strip() if national_id_last5 else ""

    ttb_pwd = f"{day_str}{month_abbr}{year_ce}"
    dime_pwd = f"{day_str}{month_str}{year_ce}"
    scb_pwd = id_last5
    pvd_pwd = f"{day_str}{month_str}{year_be}"

    passwords = {
        "TTB": [ttb_pwd, ttb_pwd.lower(), ttb_pwd.upper(), f"{day_str}{month_str}{year_ce}"],
        "DIME": [dime_pwd, f"{day_str}{month_abbr}{year_ce}", dime_pwd.lower()],
        "SCB": [scb_pwd, id_last5.zfill(5)] if scb_pwd else [],
        "KBANK": ["", pvd_pwd, dime_pwd],
        "GENERAL": [ttb_pwd, dime_pwd, scb_pwd, pvd_pwd, ""]
    }
    return passwords

def test_imap_connection(gmail_account, app_password):
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_account, app_password)
        status, messages = mail.select("INBOX")
        total_msgs = 0
        if status == "OK":
            total_msgs = int(messages[0].decode() or 0)
        mail.close()
        mail.logout()
        return {"success": True, "message": "เชื่อมต่อ Gmail IMAP สำเร็จ", "inbox_messages": total_msgs}
    except Exception as e:
        return {"success": False, "error": f"IMAP connection failed: {str(e)}"}

def decrypt_pdf_bytes(pdf_bytes, candidate_passwords):
    import pypdf
    stream = io.BytesIO(pdf_bytes)
    try:
        reader = pypdf.PdfReader(stream)
        if not reader.is_encrypted:
            return reader, ""
        
        for pwd in candidate_passwords:
            if not pwd:
                continue
            try:
                res = reader.decrypt(pwd)
                if res in (1, 2):  # 1 = user password, 2 = owner password
                    return reader, pwd
            except Exception:
                continue
        # Also try empty string
        try:
            if reader.decrypt("") in (1, 2):
                return reader, ""
        except Exception:
            pass
        return None, "Failed to decrypt with candidate passwords"
    except Exception as e:
        return None, str(e)

def parse_html_table_kasikorn(html_body):
    """
    Parses Kasikorn investment unit confirmation email table
    """
    txs = []
    # Simple regex row finder for HTML table
    # Looking for Fund code, transaction date, units, price, amount
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html_body, re.IGNORECASE | re.DOTALL)
    for row in rows:
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.IGNORECASE | re.DOTALL)]
        if len(cells) >= 5:
            # Check if any cell looks like a fund or date
            row_text = " ".join(cells)
            date_match = re.search(r'(\d{2})[/-](\d{2})[/-](\d{4})', row_text)
            amount_matches = re.findall(r'[\d,]+\.\d{2,4}', row_text)
            if date_match and len(amount_matches) >= 2:
                d, m, y = date_match.groups()
                # Normalize year
                y_int = int(y)
                if y_int > 2400:
                    y_int -= 543
                trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"
                
                # Fund code is usually the first or second cell
                fund_code = cells[0] if not re.search(r'\d{2}[/-]\d{2}', cells[0]) else cells[1]
                fund_code = re.sub(r'\s+', ' ', fund_code).strip()
                
                # Clean amounts
                nums = [float(a.replace(',', '')) for a in amount_matches]
                # Usually: [amount, nav, units] or [nav, units, amount]
                if len(nums) >= 3:
                    total_amount = max(nums)
                    nums_sorted = sorted(nums)
                    nav = nums_sorted[1] if len(nums_sorted) == 3 else nums_sorted[0]
                    units = total_amount / nav if nav > 0 else 0
                    txs.append({
                        "platform": "KBANK",
                        "fund_code": fund_code,
                        "trans_type": "BUY",
                        "trans_date": trans_date,
                        "units": round(units, 4),
                        "unit_price": round(nav, 4),
                        "total_amount": round(total_amount, 2),
                        "fee": 0.0,
                        "note": "Kasikorn Confirmation Email"
                    })
    return txs

def extract_transactions_with_gemini(text_content, api_key):
    """
    Call Gemini API to extract mutual fund transactions from unstructured text
    """
    if not api_key:
        if os.path.exists(".env"):
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not api_key:
        return []
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={api_key}"
    system_instruction = (
        "Extract mutual fund transactions from this bank statement or confirmation note. "
        "Return ONLY a valid JSON array of objects with keys: "
        "fund_code (string, e.g. K-FIXEDPLUS-A, ES-USTECH, SCBS&P500), "
        "platform (string: TTB, DIME, SCB, KBANK, or OTHER), "
        "trans_type (BUY or SELL or DIVIDEND), "
        "trans_date (string YYYY-MM-DD), "
        "units (number), unit_price (number), total_amount (number), fee (number, 0 if none), "
        "note (string, confirmation number if present). No markdown fences."
    )
    
    payload = {
        "contents": [{
            "parts": [
                {"text": system_instruction},
                {"text": text_content[:8000]}
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    import time
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                candidates = res_data.get("candidates", [])
                if candidates:
                    text_out = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    text_out = text_out.strip()
                    if text_out.startswith("```json"):
                        text_out = text_out[7:]
                    if text_out.endswith("```"):
                        text_out = text_out[:-3]
                    parsed = json.loads(text_out.strip())
                    if isinstance(parsed, list):
                        return parsed
                    elif isinstance(parsed, dict) and "transactions" in parsed:
                        return parsed["transactions"]
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                print(f"[!] Gemini 429 rate limit reached. Waiting 5s before retry (attempt {attempt+1}/3)...", file=sys.stderr, flush=True)
                time.sleep(5)
                continue
            print(f"[!] Gemini extraction error: {e}", file=sys.stderr, flush=True)
            break
        except Exception as e:
            print(f"[!] Gemini extraction error: {e}", file=sys.stderr, flush=True)
            break
    return []

def match_fund_in_db(conn, fund_code):
    c = conn.cursor()
    clean_code = fund_code.strip()
    # 1. Exact match proj_abbr_name
    c.execute("SELECT proj_id, proj_abbr_name FROM funds WHERE LOWER(proj_abbr_name) = LOWER(?) LIMIT 1", (clean_code,))
    row = c.fetchone()
    if row:
        return row[0], row[1]
    
    # 2. Like match
    c.execute("SELECT proj_id, proj_abbr_name FROM funds WHERE LOWER(proj_abbr_name) LIKE LOWER(?) OR LOWER(proj_name_en) LIKE LOWER(?) LIMIT 1", 
              (f"%{clean_code}%", f"%{clean_code}%"))
    row = c.fetchone()
    if row:
        return row[0], row[1]
    
    return clean_code, clean_code

def sync_gmail(user_id, gmail_account, app_password, dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, db_path, gemini_api_key=None, max_emails=30):
    passwords = generate_bank_passwords(dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5)
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    import pypdf
    
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(gmail_account, app_password)
    mail.select("INBOX")
    
    senders = [
        ("TTB", "estatement@eservice.ttbbank.com"),
        ("DIME", "no-reply@dime.co.th"),
        ("SCB", "Registrar2@email.scb.co.th"),
        ("KBANK", "ka.CyberInvest@kasikornasset.com"),
        ("KBANK_PVD", "KA.Pvdcallcenter@kasikornasset.com")
    ]
    
    total_emails_scanned = 0
    total_attachments_found = 0
    total_txs_extracted = 0
    inserted_count = 0
    skipped_count = 0
    details = []
    
    print(f"[Harvester] Starting Gmail harvest for user '{user_id}'...", file=sys.stderr, flush=True)

    for broker_tag, sender_email in senders:
        print(f"[Harvester] Searching for {broker_tag} emails from {sender_email}...", file=sys.stderr, flush=True)
        status, data = mail.search(None, f'(FROM "{sender_email}")')
        if status != "OK" or not data[0]:
            print(f"[Harvester] No messages found for {broker_tag}.", file=sys.stderr, flush=True)
            continue
        
        msg_ids = data[0].split()
        print(f"[Harvester] Found {len(msg_ids)} emails for {broker_tag}. Processing up to {max_emails} latest...", file=sys.stderr, flush=True)
        # Scan most recent emails up to max_emails
        recent_ids = msg_ids[-max_emails:] if len(msg_ids) > max_emails else msg_ids
        
        for msg_id in reversed(recent_ids):
            total_emails_scanned += 1
            res, msg_data = mail.fetch(msg_id, '(RFC822)')
            if res != "OK":
                continue
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            subject = decode_mime_words(msg.get("Subject", ""))
            subj_lower = subject.lower()
            if "credit card" in subj_lower or "บัตรเครดิต" in subj_lower:
                print(f"[Harvester] [{broker_tag}] Skipping non-investment email: '{subject[:60]}'", file=sys.stderr, flush=True)
                continue

            print(f"[Harvester] [{broker_tag}] Processing email: '{subject[:60]}'...", file=sys.stderr, flush=True)
            
            # 1. Kasikorn Funds body table
            if broker_tag == "KBANK":
                html_body = ""
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        payload = part.get_payload(decode=True)
                        if payload:
                            enc = (part.get_content_charset() or "utf-8").lower().strip()
                            if enc in ("windows-874", "win-874", "tis-620", "tis620", "cp874"):
                                enc = "cp874"
                            try:
                                html_body = payload.decode(enc, errors="replace")
                            except Exception:
                                try:
                                    html_body = payload.decode("cp874", errors="replace")
                                except Exception:
                                    html_body = payload.decode("utf-8", errors="replace")
                            break
                if html_body:
                    txs = parse_html_table_kasikorn(html_body)
                    for tx in txs:
                        total_txs_extracted += 1
                        proj_id, fund_abbr = match_fund_in_db(conn, tx["fund_code"])
                        idem_key = compute_idempotency_key(
                            user_id, tx["platform"], proj_id, tx["trans_date"], tx["trans_type"], tx["units"], tx["total_amount"], tx["note"]
                        )
                        import uuid
                        tx_id = f"tx_email_{uuid.uuid4().hex[:12]}"
                        try:
                            c.execute("""
                                INSERT INTO transactions (id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date, units, unit_price, total_amount, fee, note)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(user_id, idempotency_key) DO NOTHING
                            """, (tx_id, user_id, idem_key, proj_id, fund_abbr, tx["platform"], tx["trans_type"], tx["trans_date"], str(tx["units"]), str(tx["unit_price"]), str(tx["total_amount"]), str(tx["fee"]), tx["note"]))
                            if c.rowcount > 0:
                                inserted_count += 1
                                details.append(f"Inserted {tx['trans_date']} {fund_abbr} {tx['total_amount']} THB")
                            else:
                                skipped_count += 1
                        except Exception as e:
                            print(f"[!] DB insert error: {e}", file=sys.stderr)
                    conn.commit()
            
            # 2. Check for attachments (PDF)
            for part in msg.walk():
                content_disposition = str(part.get("Content-Disposition", ""))
                filename = part.get_filename()
                if filename:
                    filename = decode_mime_words(filename)
                
                if (filename and filename.lower().endswith(".pdf")) or "attachment" in content_disposition.lower():
                    pdf_data = part.get_payload(decode=True)
                    if not pdf_data:
                        continue
                    
                    total_attachments_found += 1
                    active_broker = "TTB" if "ttb" in broker_tag else ("DIME" if "DIME" in broker_tag else ("SCB" if "SCB" in broker_tag else "KBANK"))
                    candidate_pwds = passwords.get(active_broker, []) + passwords.get("GENERAL", [])
                    
                    print(f"[Harvester] Found attachment '{filename}'. Attempting decryption...", file=sys.stderr, flush=True)
                    reader, used_pwd = decrypt_pdf_bytes(pdf_data, candidate_pwds)
                    if not reader:
                        print(f"[Harvester] [!] Decryption failed for '{filename}'", file=sys.stderr, flush=True)
                        details.append(f"Failed to decrypt {filename} from {sender_email}")
                        continue
                    
                    print(f"[Harvester] [✓] Decrypted '{filename}' using password '{used_pwd or '<none>'}'", file=sys.stderr, flush=True)
                    
                    pdf_text = "\n".join(p.extract_text() or "" for p in reader.pages)
                    if not pdf_text.strip():
                        continue
                    
                    # Extract transactions using Gemini or regex
                    gemini_txs = extract_transactions_with_gemini(pdf_text, gemini_api_key)
                    for tx in gemini_txs:
                        total_txs_extracted += 1
                        platform_code = tx.get("platform", active_broker).upper()
                        fcode = tx.get("fund_code", "")
                        proj_id, fund_abbr = match_fund_in_db(conn, fcode)
                        t_date = tx.get("trans_date", datetime.now().strftime("%Y-%m-%d"))
                        t_type = tx.get("trans_type", "BUY").upper()
                        units = float(tx.get("units", 0))
                        unit_price = float(tx.get("unit_price", 0))
                        total_amount = float(tx.get("total_amount", 0))
                        fee = float(tx.get("fee", 0))
                        note = tx.get("note", f"Imported from {filename}")
                        
                        idem_key = compute_idempotency_key(user_id, platform_code, proj_id, t_date, t_type, units, total_amount, note)
                        import uuid
                        tx_id = f"tx_pdf_{uuid.uuid4().hex[:12]}"
                        try:
                            c.execute("""
                                INSERT INTO transactions (id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date, units, unit_price, total_amount, fee, note)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(user_id, idempotency_key) DO NOTHING
                            """, (tx_id, user_id, idem_key, proj_id, fund_abbr, platform_code, t_type, t_date, f"{units:.4f}", f"{unit_price:.4f}", f"{total_amount:.2f}", f"{fee:.2f}", note))
                            if c.rowcount > 0:
                                inserted_count += 1
                                details.append(f"Inserted {t_date} {fund_abbr} ({total_amount:,.2f} THB) from {filename}")
                            else:
                                skipped_count += 1
                        except Exception as e:
                            print(f"[!] DB insert error: {e}", file=sys.stderr)
                    conn.commit()
    
    # Update last_sync_at in user_settings
    now_str = datetime.now().isoformat()
    c.execute("UPDATE user_settings SET last_sync_at = ? WHERE user_id = ?", (now_str, user_id))
    conn.commit()
    conn.close()
    
    try:
        mail.close()
        mail.logout()
    except Exception:
        pass
    
    return {
        "success": True,
        "emails_scanned": total_emails_scanned,
        "attachments_found": total_attachments_found,
        "transactions_extracted": total_txs_extracted,
        "transactions_inserted": inserted_count,
        "transactions_skipped": skipped_count,
        "details": details[:20]
    }

def main():
    parser = argparse.ArgumentParser(description="Gmail Mutual Fund Harvester")
    parser.add_argument("--action", required=True, choices=["test", "sync"])
    parser.add_argument("--user-id", default="default_user")
    parser.add_argument("--gmail", required=True)
    parser.add_argument("--app-password", required=True)
    parser.add_argument("--dob-day", default="01")
    parser.add_argument("--dob-month", default="01")
    parser.add_argument("--dob-year-ce", default="1980")
    parser.add_argument("--dob-year-be", default="2523")
    parser.add_argument("--national-id-last5", default="")
    parser.add_argument("--db-path", default="portfolio.db")
    parser.add_argument("--gemini-api-key", default="")
    parser.add_argument("--max-emails", type=int, default=30)
    
    args = parser.parse_args()
    
    if args.action == "test":
        res = test_imap_connection(args.gmail, args.app_password)
        print(json.dumps(res, ensure_ascii=False))
    elif args.action == "sync":
        res = sync_gmail(
            args.user_id,
            args.gmail,
            args.app_password,
            args.dob_day,
            args.dob_month,
            args.dob_year_ce,
            args.dob_year_be,
            args.national_id_last5,
            args.db_path,
            args.gemini_api_key,
            args.max_emails
        )
        print(json.dumps(res, ensure_ascii=False))

if __name__ == "__main__":
    main()
