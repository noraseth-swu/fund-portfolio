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
import logging
from datetime import datetime
import urllib.request
import urllib.error

# Structured Logging by Level (Observability & Production Standard)
logger = logging.getLogger("email_harvester")
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

console_handler = logging.StreamHandler(sys.stderr)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

try:
    log_file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "email_sync.log")
    file_handler = logging.FileHandler(log_file_path, mode="a", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
except Exception:
    pass

def handle_uncaught_exception(exc_type, exc_value, exc_traceback):
    logger.critical("UNCAUGHT FATAL EXCEPTION:", exc_info=(exc_type, exc_value, exc_traceback))

sys.excepthook = handle_uncaught_exception

def safe_float(val, default=0.0):
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        cleaned = re.sub(r'[^\d.-]', '', str(val).strip())
        if not cleaned or cleaned in ('-', '.', '-.', '--'):
            return default
        return float(cleaned)
    except (ValueError, TypeError):
        return default

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
    u = safe_float(units)
    amt = safe_float(total_amount)
    raw = f"{user_id}|{platform}|{proj_id}|{trans_date}|{trans_type}|{u:.4f}|{amt:.2f}|{note or ''}"
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
                
                # Identify fund code cell by filtering out date, type, account numbers, and numeric cells
                fund_code = ""
                for cell in cells:
                    cell_clean = cell.strip()
                    if not cell_clean or re.search(r'\d{2}[/-]\d{2}', cell_clean):
                        continue
                    if cell_clean.lower() in BLACKLISTED_NAMES:
                        continue
                    # Skip pure digits (like account numbers or amounts)
                    if re.match(r'^[\d,.\s-]+$', cell_clean):
                        continue
                    fund_code = cell_clean
                    break

                if not fund_code or fund_code.lower() in BLACKLISTED_NAMES:
                    continue
                
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

def clean_pdf_boilerplate(text):
    """
    Strips repetitive legal footers, warning boxes, and branch directories
    to cut token consumption by 40-60%.
    """
    disclaimer_markers = [
        "การลงทุนในกองทุนรวมไม่ใช่การฝากเงิน",
        "ผู้ลงทุนควรทำความเข้าใจลักษณะสินค้า",
        "Mutual fund is not a bank deposit",
        "Disclaimer:",
        "ข้อกำหนดและเงื่อนไข:",
        "สอบถามข้อมูลเพิ่มเติมหรือขอรับหนังสือชี้ชวน",
        "Warning: Investment in mutual fund",
        "คำเตือน :",
        "คำเตือน:",
        "คำเตือนเกี่ยวกับการลงทุน",
    ]
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        if any(marker.lower() in line.lower() for marker in disclaimer_markers):
            break
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    return result if len(result) > 100 else text[:4000]

def try_regex_parse_confirmation(pdf_text, broker_tag):
    """
    Fast-path parser for structured confirmation notes (Dime, SCB).
    Returns (transactions_list, success_bool). If success, 0 Gemini tokens are used!
    """
    txs = []
    text_clean = re.sub(r'[ \t]+', ' ', pdf_text)
    
    # 1. Dime Confirmation Note
    if broker_tag == "DIME":
        fund_match = re.search(r'(?:ชื่อย่อหลักทรัพย์|กองทุน|Fund Code|Fund Abbr)[:\s]+([A-Za-z0-9\-_()]+)', text_clean, re.I)
        date_match = re.search(r'(\d{2})[/-](\d{2})[/-](\d{4})', text_clean)
        order_match = re.search(r'(?:เลขที่คำสั่ง|Order No\.?)[:\s]+([A-Za-z0-9]+)', text_clean, re.I)
        
        amounts = re.findall(r'[\d,]+\.\d{2,4}', text_clean)
        num_vals = []
        for a in amounts:
            try:
                num_vals.append(float(a.replace(',', '')))
            except ValueError:
                pass
        
        if fund_match and date_match and len(num_vals) >= 3:
            fcode = fund_match.group(1).strip()
            d, m, y = date_match.groups()
            y_int = int(y)
            if y_int > 2400:
                y_int -= 543
            trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"
            
            total_amount = max(num_vals)
            sorted_nums = sorted(num_vals)
            found_pair = False
            for u in sorted_nums:
                for p in sorted_nums:
                    if abs(u * p - total_amount) < 1.0 and u > 0 and p > 0:
                        units = min(u, p) if total_amount > 100 else u
                        nav = max(u, p) if total_amount > 100 else p
                        txs.append({
                            "platform": "DIME",
                            "fund_code": fcode,
                            "trans_type": "BUY" if "ซื้อ" in text_clean or "BUY" in text_clean.upper() else "SELL",
                            "trans_date": trans_date,
                            "units": round(units, 4),
                            "unit_price": round(nav, 4),
                            "total_amount": round(total_amount, 2),
                            "fee": 0.0,
                            "note": order_match.group(1) if order_match else "Dime Confirmation Note"
                        })
                        found_pair = True
                        break
                if found_pair:
                    break
            if txs:
                return txs, True

    return [], False

def extract_transactions_with_gemini(text_content, api_key):
    """
    Call Gemini API to extract mutual fund transactions from unstructured text
    Returns: (transactions_list, token_usage_dict, success_bool)
    """
    empty_usage = {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        env_paths = [
            ".env",
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        ]
        for ep in env_paths:
            if os.path.exists(ep):
                with open(ep, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("GEMINI_API_KEY="):
                            api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            if api_key:
                break
    if not api_key:
        return [], empty_usage, False
    
    candidate_models = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-flash-latest"]
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
    
    import time
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    usage_meta = res_data.get("usageMetadata", {})
                    token_usage = {
                        "prompt_tokens": usage_meta.get("promptTokenCount", 0),
                        "candidates_tokens": usage_meta.get("candidatesTokenCount", 0),
                        "total_tokens": usage_meta.get("totalTokenCount", 0)
                    }

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
                            return parsed, token_usage, True
                        elif isinstance(parsed, dict) and "transactions" in parsed:
                            return parsed["transactions"], token_usage, True
                        return [], token_usage, True
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    logger.warning("[!] Gemini %s 429 rate limit reached. Waiting 3s (attempt %d)...", model_name, attempt + 1)
                    time.sleep(3)
                    continue
                else:
                    logger.warning("[!] Gemini %s error (%s). Trying next fallback model...", model_name, e)
                    break
            except Exception as e:
                logger.warning("[!] Gemini %s error (%s). Trying next fallback model...", model_name, e)
                break
    
    logger.error("[!] All Gemini models exhausted or failed for this document.")
    return [], empty_usage, False

KNOWN_FUND_ALIASES = {
    # TISCO Strategic
    "TISCOSTRAT-A": "TSF",
    "TISCOSTR-A": "TSF",
    "TISCO STRATEGIC FUND CLASS A": "TSF",
    "TISCO STRATEGIC FUND": "TSF",
    "TSF-A": "TSF",
    # SCB S&P 500
    "SP500E": "SCBS&P500FUND",
    "SCBS&P500E": "SCBS&P500FUND",
    "SCBS&P500": "SCBS&P500FUND",
    "SCB S&P 500 INDEX FUND": "SCBS&P500FUND",
    # SCB China A Shares
    "SCBCHAA": "SCBCHAFUND",
    "SCB CHINA A-SHARES FUND (ACCUMULATION)": "SCBCHAFUND",
    "SCB CHINA A-SHARES FUND": "SCBCHAFUND",
    # Eastspring / ttb
    "EASTSPRING ASIA ACTIVE EQUITY FUND (ACCUMULATION CLASS)": "ES-ASIA-A",
    "EASTSPRING ASIA ACTIVE EQUITY FUND": "ES-ASIA-A",
    "ES-ASIAEQ": "ES-ASIA-A",
    "ES-ASIA": "ES-ASIA-A",
    "EASTSPRING GIS GLOBAL BOND FUND (ACCUMULATION)": "ES-GIS-GBOND",
    "EASTSPRING GIS GLOBAL BOND FUND": "ES-GIS-GBOND",
    "ES-GERMAN": "ES-GER",
    "EASTSPRING GERMANY EQUITY FUND": "ES-GER",
    "KTAM CAPITAL SECURITIES FUND - CLASS A": "KT-CSBOND-A",
    "KTAM CAPITAL SECURITIES FUND": "KT-CSBOND-A",
    "EASTSPRING US BLUE CHIP EQUITY FUND": "ES-USBLUECHIP",
    "EASTSPRING GLOBAL DIVIDEND EQUITY FUND": "ES-GDIV",
    "ES-GDIV-ACC": "ES-GDIV",
    "EASTSPRING US INFORMATION TECHNOLOGY FUND": "ES-USTECH",
    "ONE EUROPEAN EQUITY FUND": "ONE-EUROEQ",
    # Dime KKP funds
    "KKP NDQ100-UH FUND": "KKP NDQ100-UH-E",
    "KKP NDQ100-UH": "KKP NDQ100-UH-E",
    "KKP US500-UH FUND": "KKP US500-UH-E",
    "KKP US500-UH": "KKP US500-UH-E",
    # Kasikorn
    "WEALTH PLUS SPEED4B": "K-WPSPEEDUP",
    "WEALTHPLUS SPEEDUP": "K-WPSPEEDUP",
    "K-FIXEDPLUS-A": "K-FIXEDPLUS",
}

BLACKLISTED_NAMES = {
    "purchase (plan)", "ซื้อสม่ำเสมอ", "purchase", "sell", "dividend", 
    "subscription", "redemption", "สับเปลี่ยนเข้า", "สับเปลี่ยนออก", 
    "สับเปลี่ยน", "ขายคืน", "ซื้อ", "plan", "regular"
}

def match_fund_in_db(conn, fund_code):
    c = conn.cursor()
    clean_code = fund_code.strip()
    upper_code = clean_code.upper()

    # 0. Check blacklist
    if clean_code.lower() in BLACKLISTED_NAMES:
        return None, None

    # Check known alias dictionary first
    if upper_code in KNOWN_FUND_ALIASES:
        target_abbr = KNOWN_FUND_ALIASES[upper_code]
        c.execute("SELECT proj_id, proj_abbr_name FROM funds WHERE UPPER(proj_abbr_name) = ? LIMIT 1", (target_abbr.upper(),))
        row = c.fetchone()
        if row:
            return row[0], row[1]
        clean_code = target_abbr

    # 1. Exact match proj_abbr_name
    c.execute("SELECT proj_id, proj_abbr_name FROM funds WHERE LOWER(proj_abbr_name) = LOWER(?) LIMIT 1", (clean_code,))
    row = c.fetchone()
    if row:
        return row[0], row[1]

    # 2. Match without punctuation / spaces
    norm = clean_code.replace("-", "").replace(" ", "").replace("(", "").replace(")", "").lower()
    c.execute(
        "SELECT proj_id, proj_abbr_name FROM funds WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(proj_abbr_name, '-', ''), ' ', ''), '(', ''), ')', '')) = ? LIMIT 1",
        (norm,)
    )
    row = c.fetchone()
    if row:
        return row[0], row[1]
    
    # 3. Like match on proj_name_en / proj_name_th
    c.execute("SELECT proj_id, proj_abbr_name FROM funds WHERE LOWER(proj_name_en) LIKE LOWER(?) OR LOWER(proj_name_th) LIKE LOWER(?) LIMIT 1", 
              (f"%{clean_code}%", f"%{clean_code}%"))
    row = c.fetchone()
    if row:
        return row[0], row[1]
    
    return clean_code, clean_code

def sync_gmail(user_id, gmail_account, app_password, dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, db_path, gemini_api_key=None, max_emails=0):
    passwords = generate_bank_passwords(dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5)
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # 0. Ensure checkpoint cache tables exist
    c.execute("""
        CREATE TABLE IF NOT EXISTS processed_emails (
            message_id TEXT PRIMARY KEY,
            broker TEXT,
            subject TEXT,
            email_date TEXT,
            tx_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS processed_attachments (
            file_hash TEXT PRIMARY KEY,
            filename TEXT,
            tx_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    
    import pypdf
    
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(gmail_account, app_password)
    mail.select("INBOX")
    
    senders = [
        ("TTB", "estatement@eservice.ttbbank.com"),
        ("DIME", "no-reply@dime.co.th"),
        ("SCB", "Registrar2@email.scb.co.th"),
        ("KBANK", "ka.CyberInvest@kasikornasset.com"),
    ]
    
    total_emails_scanned = 0
    total_attachments_found = 0
    total_txs_extracted = 0
    inserted_count = 0
    skipped_count = 0
    total_prompt_tokens = 0
    total_candidates_tokens = 0
    total_tokens = 0
    details = []
    
    logger.info("Starting Gmail harvest for user '%s'...", user_id)

    for broker_tag, sender_email in senders:
        logger.info("Searching for %s emails from %s...", broker_tag, sender_email)
        status, data = mail.search(None, f'(FROM "{sender_email}")')
        if status != "OK" or not data[0]:
            logger.info("No messages found for %s.", broker_tag)
            continue
        
        msg_ids = data[0].split()
        if max_emails > 0:
            logger.info("Found %d emails for %s. Processing up to %d latest...", len(msg_ids), broker_tag, max_emails)
            target_ids = msg_ids[-max_emails:]
        else:
            logger.info("Found %d emails for %s. Full Historical Sweep (oldest to newest)...", len(msg_ids), broker_tag)
            target_ids = msg_ids  # All emails in chronological order!
        
        for idx, msg_id in enumerate(target_ids, 1):
            total_emails_scanned += 1
            res, msg_data = mail.fetch(msg_id, '(RFC822)')
            if res != "OK":
                continue
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            subject = decode_mime_words(msg.get("Subject", ""))
            subj_lower = subject.lower()

            message_id_header = (msg.get("Message-ID") or "").strip()
            email_date_header = (msg.get("Date") or "").strip()

            # STRICT TRANSACTION FILTER:
            # We ONLY process genuine transaction confirmation notes!
            # Reject monthly balance summaries, statements of holding, order reminders, opening letters.
            skip_subject_keywords = [
                "statement of holding",
                "monthly statement",
                "ใบสรุปข้อมูลบัญชี",
                "สรุปข้อมูลการลงทุน",
                "reminding of waiting order",
                "เปิดบัญชีกองทุน",
                "ใบแจ้งยอดเงิน",
                "ใบรับรอง",
                "credit card",
                "บัตรเครดิต"
            ]
            if any(k in subj_lower for k in skip_subject_keywords):
                logger.debug("[%s] Skipping non-transaction email (holding statement/admin): '%s'", broker_tag, subject[:60])
                if message_id_header:
                    c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, 0)",
                              (message_id_header, broker_tag, subject, email_date_header))
                    conn.commit()
                continue

            # For KBANK: Must be confirmation of executed transaction
            if broker_tag == "KBANK":
                if "confirming investment unit transactions" not in subj_lower and "ยืนยันการทำรายการหน่วยลงทุน" not in subj_lower:
                    logger.debug("[KBANK] Skipping non-confirmation KBANK email: '%s'", subject[:60])
                    if message_id_header:
                        c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, 0)",
                                  (message_id_header, broker_tag, subject, email_date_header))
                        conn.commit()
                    continue

            if message_id_header:
                c.execute("SELECT tx_count FROM processed_emails WHERE message_id = ?", (message_id_header,))
                if c.fetchone():
                    logger.debug("[%s] [%d/%d] Skipping already-processed email: '%s' (0 Tokens)", broker_tag, idx, len(target_ids), subject[:40])
                    continue

            logger.info("[%s] [%d/%d] Processing email: '%s'...", broker_tag, idx, len(target_ids), subject[:60])
            email_tx_count = 0
            email_had_error = False
            
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
                        email_tx_count += 1
                        proj_id, fund_abbr = match_fund_in_db(conn, tx["fund_code"])
                        if not proj_id or not fund_abbr:
                            logger.warning("Skipping invalid or blacklisted fund name: '%s'", tx["fund_code"])
                            continue
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
                                logger.info("[+] Inserted %s %s (%.2f THB) from KBank email", tx['trans_date'], fund_abbr, tx['total_amount'])
                                details.append(f"Inserted {tx['trans_date']} {fund_abbr} {tx['total_amount']} THB")
                            else:
                                skipped_count += 1
                                logger.debug("[*] Skipped duplicate %s %s", tx['trans_date'], fund_abbr)
                        except Exception as e:
                            logger.error("DB insert error: %s", e)
                    conn.commit()
            
            # 2. Check for attachments (PDF)
            for part in msg.walk():
                content_disposition = str(part.get("Content-Disposition", ""))
                filename = part.get_filename()
                if filename:
                    filename = decode_mime_words(filename)
                
                fn_lower = filename.lower() if filename else ""
                skip_pdf_keywords = [
                    "statement of holding",
                    "statement_of_holding",
                    "monthly_statement",
                    "monthly statement",
                    "stm20",
                    "stm_",
                    "open_account",
                    "suittest",
                    "fatca",
                    "terms",
                    "condition",
                    "consent"
                ]
                if any(skip_kw in fn_lower for skip_kw in skip_pdf_keywords):
                    logger.debug("[%s] Skipping monthly holding / administrative PDF: '%s'", broker_tag, filename)
                    continue

                if broker_tag == "TTB" and "confirmation note" not in fn_lower:
                    logger.debug("[%s] Skipping non-confirmation-note TTB PDF: '%s'", broker_tag, filename)
                    continue

                if broker_tag == "DIME" and "confirmationnote" not in fn_lower and "confirmation note" not in fn_lower:
                    logger.debug("[%s] Skipping non-confirmation-note Dime PDF: '%s'", broker_tag, filename)
                    continue
                
                if (filename and filename.lower().endswith(".pdf")) or "attachment" in content_disposition.lower():
                    pdf_data = part.get_payload(decode=True)
                    if not pdf_data:
                        continue
                    
                    pdf_hash = hashlib.sha256(pdf_data).hexdigest()
                    c.execute("SELECT tx_count FROM processed_attachments WHERE file_hash = ?", (pdf_hash,))
                    if c.fetchone():
                        logger.debug("[%s] Skipping already-processed PDF '%s' (hash: %s, 0 Tokens)", broker_tag, filename, pdf_hash[:8])
                        continue

                    total_attachments_found += 1
                    active_broker = "TTB" if "ttb" in broker_tag else ("DIME" if "DIME" in broker_tag else ("SCB" if "SCB" in broker_tag else "KBANK"))
                    candidate_pwds = passwords.get(active_broker, []) + passwords.get("GENERAL", [])
                    
                    logger.info("[%s] Found attachment '%s'. Attempting decryption...", broker_tag, filename)
                    reader, used_pwd = decrypt_pdf_bytes(pdf_data, candidate_pwds)
                    if not reader:
                        logger.warning("[%s] Decryption failed for '%s'", broker_tag, filename)
                        details.append(f"Failed to decrypt {filename} from {sender_email}")
                        continue
                    
                    logger.info("[%s] [✓] Decrypted '%s' using password '%s'", broker_tag, filename, used_pwd or '<none>')
                    
                    try:
                        pdf_text = "\n".join(p.extract_text() or "" for p in reader.pages)
                        if not pdf_text.strip():
                            # Record 0-tx non-text/empty PDF as processed so we don't re-read it endlessly
                            c.execute("INSERT OR IGNORE INTO processed_attachments (file_hash, filename, tx_count) VALUES (?, ?, 0)",
                                      (pdf_hash, filename))
                            conn.commit()
                            continue
                        
                        # Extract transactions: Try Regex Fast-Path first (0 Token)
                        regex_txs, regex_ok = try_regex_parse_confirmation(pdf_text, active_broker)
                        parse_success = True
                        if regex_ok:
                            logger.info("[%s] [✓] Regex Fast-Path parsed %d transactions from '%s' (0 Tokens used!)", broker_tag, len(regex_txs), filename)
                            gemini_txs = regex_txs
                        else:
                            cleaned_text = clean_pdf_boilerplate(pdf_text)
                            gemini_txs, usage, parse_success = extract_transactions_with_gemini(cleaned_text, gemini_api_key)
                            total_prompt_tokens += usage.get("prompt_tokens", 0)
                            total_candidates_tokens += usage.get("candidates_tokens", 0)
                            total_tokens += usage.get("total_tokens", 0)

                        if not parse_success:
                            logger.error("[%s] [✗] Failed to parse '%s' via AI (rate limit or outage). Will NOT cache as processed to allow retry.", broker_tag, filename)
                            details.append(f"AI parsing failed for {filename} (will retry next sync)")
                            email_had_error = True
                            continue

                        pdf_tx_count = 0
                        for tx in gemini_txs:
                            try:
                                fcode = tx.get("fund_code", "")
                                if not fcode or str(fcode).lower() in BLACKLISTED_NAMES:
                                    continue
                                proj_id, fund_abbr = match_fund_in_db(conn, fcode)
                                if not proj_id or not fund_abbr:
                                    logger.warning("Skipping invalid or blacklisted fund name: '%s'", fcode)
                                    continue
                                units = safe_float(tx.get("units"), 0.0)
                                unit_price = safe_float(tx.get("unit_price"), 0.0)
                                total_amount = safe_float(tx.get("total_amount"), 0.0)
                                fee = safe_float(tx.get("fee"), 0.0)
                                if total_amount <= 0 and units <= 0:
                                    # Non-transactional item (e.g. account opening notification)
                                    continue
                                
                                t_date = str(tx.get("trans_date") or datetime.now().strftime("%Y-%m-%d"))
                                t_type = str(tx.get("trans_type") or "BUY").upper()
                                platform_code = str(tx.get("platform") or active_broker).upper()
                                note = str(tx.get("note") or f"Imported from {filename}")
                                
                                total_txs_extracted += 1
                                email_tx_count += 1
                                pdf_tx_count += 1
                                
                                idem_key = compute_idempotency_key(user_id, platform_code, proj_id, t_date, t_type, units, total_amount, note)
                                import uuid
                                tx_id = f"tx_pdf_{uuid.uuid4().hex[:12]}"
                                c.execute("""
                                    INSERT INTO transactions (id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type, trans_date, units, unit_price, total_amount, fee, note)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ON CONFLICT(user_id, idempotency_key) DO NOTHING
                                """, (tx_id, user_id, idem_key, proj_id, fund_abbr, platform_code, t_type, t_date, f"{units:.4f}", f"{unit_price:.4f}", f"{total_amount:.2f}", f"{fee:.2f}", note))
                                if c.rowcount > 0:
                                    inserted_count += 1
                                    logger.info("[+] Inserted %s %s (%.2f THB) from %s", t_date, fund_abbr, total_amount, filename)
                                    details.append(f"Inserted {t_date} {fund_abbr} ({total_amount:,.2f} THB) from {filename}")
                                else:
                                    skipped_count += 1
                                    logger.debug("[*] Skipped duplicate %s %s from %s", t_date, fund_abbr, filename)
                            except Exception as te:
                                logger.error("[%s] Error inserting tx from %s: %s (tx: %s)", broker_tag, filename, te, tx)
                        
                        # Record PDF attachment hash into checkpoint cache
                        c.execute("INSERT OR IGNORE INTO processed_attachments (file_hash, filename, tx_count) VALUES (?, ?, ?)",
                                  (pdf_hash, filename, pdf_tx_count))
                        conn.commit()
                    except Exception as pe:
                        logger.error("[%s] Unexpected error processing attachment '%s': %s", broker_tag, filename, pe)
                        email_had_error = True
                        continue

            # Record email message_id into checkpoint cache (only if no failures occurred)
            if message_id_header and not email_had_error:
                c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, ?)",
                          (message_id_header, broker_tag, subject, email_date_header, email_tx_count))
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
    
    logger.info("=" * 60)
    logger.info("🎉 [✓] Gmail Harvest & Email Sync COMPLETED successfully!")
    logger.info("📊 Summary: %d emails scanned | %d attachments found", total_emails_scanned, total_attachments_found)
    logger.info("📥 Transactions: %d extracted | %d inserted | %d skipped (duplicates)", total_txs_extracted, inserted_count, skipped_count)
    logger.info("🪙 Tokens used: %s prompt + %s candidates = %s total tokens", f"{total_prompt_tokens:,}", f"{total_candidates_tokens:,}", f"{total_tokens:,}")
    logger.info("=" * 60)
    
    return {
        "success": True,
        "emails_scanned": total_emails_scanned,
        "attachments_found": total_attachments_found,
        "transactions_extracted": total_txs_extracted,
        "transactions_inserted": inserted_count,
        "transactions_skipped": skipped_count,
        "tokens_used": {
            "prompt_tokens": total_prompt_tokens,
            "candidates_tokens": total_candidates_tokens,
            "total_tokens": total_tokens
        },
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
    parser.add_argument("--max-emails", type=int, default=0)
    
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
