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
import time
import uuid
import hashlib
import imaplib
import email
from email.header import decode_header
import sqlite3
import argparse
import logging
from datetime import datetime
import concurrent.futures
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

def resolve_password_template(template, dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, custom_pwd=""):
    """
    Dynamically resolve template variables against user credentials
    """
    day_str = f"{int(dob_day):02d}" if dob_day else "01"
    month_int = int(dob_month) if dob_month else 1
    month_str = f"{month_int:02d}"
    month_abbr = MONTH_NAMES_EN[month_int - 1] if 1 <= month_int <= 12 else "Jan"
    year_ce = str(dob_year_ce) if dob_year_ce else "1980"
    year_be = str(dob_year_be) if dob_year_be else str(int(year_ce) + 543)
    id_last5 = str(national_id_last5).strip() if national_id_last5 else ""

    res = template
    res = res.replace("{DD}", day_str)
    res = res.replace("{MM}", month_str)
    res = res.replace("{MMM_EN}", month_abbr)
    res = res.replace("{MMM_EN_LOWER}", month_abbr.lower())
    res = res.replace("{MMM_EN_UPPER}", month_abbr.upper())
    res = res.replace("{YYYY_CE}", year_ce)
    res = res.replace("{YYYY_BE}", year_be)
    res = res.replace("{NATIONAL_ID_LAST5}", id_last5)
    res = res.replace("{NATIONAL_ID_LAST5_ZERO_PADDED}", id_last5.zfill(5))
    res = res.replace("{CUSTOM_PWD}", custom_pwd or "")
    return res

def load_master_broker_configs(db_conn=None):
    """
    Load master broker configurations from SQLite table `email_broker_configs` if available,
    otherwise fallback to `backend/config/email_sync_brokers.json`.
    """
    if db_conn:
        try:
            c = db_conn.cursor()
            c.execute("""
                SELECT broker_key, name, enabled, sender_emails, subject_includes, subject_excludes,
                       extraction_type, password_patterns, ai_prompt_variant
                FROM email_broker_configs
                ORDER BY rowid ASC
            """)
            rows = c.fetchall()
            if rows:
                configs = []
                for r in rows:
                    configs.append({
                        "key": r[0],
                        "name": r[1],
                        "enabled": bool(r[2]),
                        "sender_emails": json.loads(r[3]) if isinstance(r[3], str) else r[3],
                        "subject_includes": json.loads(r[4]) if isinstance(r[4], str) else r[4],
                        "subject_excludes": json.loads(r[5]) if isinstance(r[5], str) else r[5],
                        "extraction_type": r[6],
                        "password_patterns": json.loads(r[7]) if isinstance(r[7], str) else r[7],
                        "ai_prompt_variant": r[8] or "DEFAULT",
                    })
                return configs
        except Exception:
            pass

    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "email_sync_brokers.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load email_sync_brokers.json: {e}")

    return [
        {"key": "TTB", "name": "ttb", "enabled": True, "sender_emails": ["estatement@eservice.ttbbank.com"], "extraction_type": "PDF_ATTACHMENT", "password_patterns": ["{DD}{MMM_EN}{YYYY_CE}"], "ai_prompt_variant": "MUTUAL_FUND_THAI"},
        {"key": "DIME", "name": "Dime!", "enabled": True, "sender_emails": ["no-reply@dime.co.th"], "extraction_type": "PDF_ATTACHMENT", "password_patterns": ["{DD}{MM}{YYYY_CE}"], "ai_prompt_variant": "AUTO_DETECT_STOCK_OR_FUND"},
        {"key": "SCB", "name": "SCB", "enabled": True, "sender_emails": ["Registrar2@email.scb.co.th"], "extraction_type": "PDF_ATTACHMENT", "password_patterns": ["{NATIONAL_ID_LAST5}"], "ai_prompt_variant": "SCB_SHARE_CLASS_AWARE"},
        {"key": "KBANK", "name": "KBank", "enabled": True, "sender_emails": ["ka.CyberInvest@kasikornasset.com", "wealthplus@kasikornbank.com", "KPLUS@kasikornbank.com", "kplus@kasikornbank.com"], "extraction_type": "HTML_BODY_TABLE", "password_patterns": [], "ai_prompt_variant": "DEFAULT"},
        {"key": "KBANK_PVD", "name": "KBank (PVD)", "enabled": True, "sender_emails": ["KA.Pvdcallcenter@kasikornasset.com"], "extraction_type": "PDF_POSITION_SNAPSHOT", "password_patterns": ["{DD}{MM}{YYYY_BE}"], "ai_prompt_variant": "DEFAULT"}
    ]

def generate_bank_passwords(dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, master_broker_configs=None):
    """
    Generate dictionary of passwords for each known broker pattern dynamically
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

    if master_broker_configs:
        for b in master_broker_configs:
            b_key = str(b.get("key", "")).upper().strip()
            patterns = b.get("password_patterns", [])
            if b_key and patterns:
                b_pwds = []
                for pat in patterns:
                    resolved = resolve_password_template(pat, dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5)
                    if resolved and resolved not in b_pwds:
                        b_pwds.append(resolved)
                if b_pwds:
                    if b_key in passwords:
                        for p in b_pwds:
                            if p not in passwords[b_key]:
                                passwords[b_key].append(p)
                    else:
                        passwords[b_key] = b_pwds
    return passwords

def resolve_platform_for_transaction(broker_tag, tx_platform=None, fund_code=""):
    """
    Golden Rules of Financial Platform Attribution:
    1. The email sender/broker tag strictly dictates the user's platform account (e.g. TTB, DIME, SCB, KBANK).
    2. Fund ticker prefix (e.g. SCBCHINA on TTB) NEVER overrides the account platform.
    3. Custodian/supervisor (e.g. Kasikornbank on SCB statement) NEVER overrides the account platform.
    """
    bt = str(broker_tag or "").upper().strip()
    if "TTB" in bt:
        return "TTB"
    if "DIME" in bt:
        return "DIME"
    if "SCB" in bt:
        return "SCB"
    if "KBANK" in bt:
        return "KBANK"
    if tx_platform:
        p = str(tx_platform).upper().strip()
        if p in ["TTB", "DIME", "SCB", "KBANK"]:
            return p
    return bt or "OTHER"

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
    Parses Kasikorn investment unit confirmation email tables (supports both CyberInvest & Wealth PLUS)
    """
    txs = []
    seen = set()
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html_body, re.IGNORECASE | re.DOTALL)
    for row in rows:
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.IGNORECASE | re.DOTALL)]
        if len(cells) >= 5:
            row_text = " ".join(cells)
            # Support both YYYY-MM-DD (Wealth PLUS) and DD/MM/YYYY (CyberInvest)
            date_iso = re.search(r'\b(\d{4})-(\d{2})-(\d{2})\b', row_text)
            date_dmy = re.search(r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b', row_text)
            
            trans_date = None
            if date_iso:
                y, m, d = date_iso.groups()
                y_int = int(y)
                if y_int > 2400:
                    y_int -= 543
                trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"
            elif date_dmy:
                d, m, y = date_dmy.groups()
                y_int = int(y)
                if y_int > 2400:
                    y_int -= 543
                trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"

            if not trans_date:
                continue

            fund_code = ""
            units = 0.0
            total_amount = 0.0
            nav = 0.0

            # 1. Wealth PLUS column layout:
            # col 0: Date, col 1: Trans Type, col 2: Fund Code, col 3: Channel, col 4: Account, col 5: Unit, col 6: Amount, col 7: NAV
            if len(cells) >= 8 and re.match(r'^[A-Za-z0-9\-_()]+$', cells[2]) and not re.match(r'^[\d,.\s-]+$', cells[2]):
                cand_fund = cells[2].strip()
                if cand_fund.lower() not in BLACKLISTED_NAMES:
                    try:
                        c_units = float(cells[5].replace(',', ''))
                        c_amount = float(cells[6].replace(',', ''))
                        c_nav = float(cells[7].replace(',', ''))
                        if c_amount > 0 and c_nav > 0:
                            fund_code = cand_fund
                            units = c_units
                            total_amount = c_amount
                            nav = c_nav
                    except (ValueError, IndexError):
                        pass

            # 2. CyberInvest & generic HTML table layout heuristic
            if not fund_code or total_amount <= 0:
                amount_matches = re.findall(r'[\d,]+\.\d{2,4}', row_text)
                if len(amount_matches) >= 2:
                    for cell in cells:
                        cell_clean = cell.strip()
                        if not cell_clean or re.search(r'\d{2}[/-]\d{2}', cell_clean):
                            continue
                        if cell_clean.lower() in BLACKLISTED_NAMES:
                            continue
                        if cell_clean.lower() in ['k plus', 'kplus', 'purchase', 'ซื้อ', 'ขาย', 'kbank', 'kasikornbank']:
                            continue
                        if re.match(r'^[\d,.\s-]+$', cell_clean):
                            continue
                        fund_code = cell_clean
                        break

                    if not fund_code or fund_code.lower() in BLACKLISTED_NAMES:
                        continue

                    nums = [float(a.replace(',', '')) for a in amount_matches]
                    if len(nums) >= 3:
                        total_amount = max(nums)
                        nums_sorted = sorted(nums)
                        nav = nums_sorted[1] if len(nums_sorted) == 3 else nums_sorted[0]
                        import math
                        units = math.floor((total_amount / nav) * 10000) / 10000 if nav > 0 else 0

            if fund_code and total_amount > 0:
                trans_type = "BUY"
                type_hint = (cells[1] if len(cells) > 1 else "") + " " + row_text
                type_hint_lower = type_hint.lower()
                if any(w in type_hint_lower for w in ["ขาย", "redemption", "sell", "สับเปลี่ยนออก", "switch out"]):
                    trans_type = "SELL"

                dedup_key = (trans_date, fund_code.upper(), trans_type, round(total_amount, 2), round(units, 4))
                if dedup_key not in seen:
                    seen.add(dedup_key)
                    txs.append({
                        "platform": "KBANK",
                        "fund_code": fund_code,
                        "trans_type": trans_type,
                        "trans_date": trans_date,
                        "units": round(units, 4),
                        "unit_price": round(nav, 4),
                        "total_amount": round(total_amount, 2),
                        "fee": 0.0,
                        "note": "Kasikorn Confirmation Email"
                    })
    return txs

def parse_kplus_order_email(html_body, conn=None):
    """
    Parses Kasikorn K PLUS fund purchase order acknowledgment emails
    (ตอบรับคำสั่งซื้อกองทุน / Acknowledging purchase order)
    """
    clean = re.sub(r'<[^>]+>', '\n', html_body).replace('&nbsp;', ' ')
    clean_lower = clean.lower()
    if any(err in clean_lower for err in ['failed', 'failure', 'ล้มเหลว', 'ไม่สำเร็จ', 'dca plan creation']):
        return []

    if 'ตอบรับคำสั่งซื้อกองทุน' not in clean and 'purchase order' not in clean_lower:
        return []

    # Date: prefer "ราคา ณ วันที่" (pricing date), fallback to "วันที่ทำรายการ" (order date)
    price_date_m = re.search(r'ราคา ณ วันที่:\s*(\d{2})[/-](\d{2})[/-](\d{4})', clean)
    order_date_m = re.search(r'วันที่ทำรายการ:\s*(\d{2})[/-](\d{2})[/-](\d{4})', clean)
    date_m = price_date_m or order_date_m
    if not date_m:
        return []
    d, m, y = date_m.groups()
    y_int = int(y)
    if y_int > 2400:
        y_int -= 543
    trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"

    # Fund: look for "กองทุน:" (avoiding "เลขที่บัญชีกองทุน:")
    fund_m = re.search(r'(?<!เลขที่บัญชี)\s*กองทุน:\s*([A-Za-z0-9\-_()]+)', clean)
    if not fund_m:
        return []
    fund_code = fund_m.group(1).strip()
    if fund_code.lower() in BLACKLISTED_NAMES:
        return []

    # Amount
    amt_m = re.search(r'จำนวนเงิน\s*\(บาท\):\s*([\d,]+\.?\d*)', clean)
    if not amt_m:
        return []
    try:
        total_amount = float(amt_m.group(1).replace(',', ''))
    except ValueError:
        return []
    if total_amount <= 0:
        return []

    # Ref
    ref_m = re.search(r'เลขที่รายการ:\s*([A-Za-z0-9]+)', clean)
    ref = ref_m.group(1).strip() if ref_m else ""

    trans_type = "BUY"
    if "ขาย" in clean and "ซื้อ" not in clean:
        trans_type = "SELL"

    return [{
        "platform": "KBANK",
        "fund_code": fund_code,
        "trans_type": trans_type,
        "trans_date": trans_date,
        "units": 0.0,
        "unit_price": 0.0,
        "total_amount": round(total_amount, 2),
        "fee": 0.0,
        "note": f"K PLUS Order #{ref}" if ref else "K PLUS Confirmation Email"
    }]

def parse_kbank_pvd_statement(pdf_text):
    """
    Parses Kasikorn Provident Fund (PVD) Member Statement into policy positions.
    Returns: (as_of_date_str, holdings_list)
    """
    as_of_match = re.search(r'(?:As of date|สิ้นสุด ณ\. วันที่)\s*(\d{2})[/-](\d{2})[/-](\d{4})', pdf_text)
    if as_of_match:
        day, month, year = as_of_match.groups()
        y_int = int(year)
        if y_int > 2400:
            y_int -= 543
        as_of_date = f"{y_int:04d}-{int(month):02d}-{int(day):02d}"
    else:
        as_of_date = ""

    names = {}
    for p_code, p_name in re.findall(r'(PF[A-Z0-9]+)\s*:\s*-\s*([^\n/]+)', pdf_text):
        names[p_code] = p_name.strip()

    holdings = []
    pattern = r'(PF[A-Z0-9]+)\s+KA\s+([\d,.]+)\s+([\d.]+)\s+([\d,.]+)'
    for code, units_s, nav_s, mval_s in re.findall(pattern, pdf_text):
        u = safe_float(units_s)
        nav = safe_float(nav_s)
        mval = safe_float(mval_s)
        if mval <= 0:
            continue
        
        idx = pdf_text.find(code)
        cost = mval
        unrealized = 0.0
        if idx != -1:
            snippet = pdf_text[idx:idx+800]
            amt_match = re.search(r'(?:รวมจำานวนเงิน|รวมจำนวนเงิน)\s*/\s*Total amount\s+([\d,.]+)\s+([-\d,.]+)\s+([\d,.]+)\s+([-\d,.]+)\s+([\d,.]+)', snippet)
            if amt_match:
                mem_c = safe_float(amt_match.group(1))
                mem_b = safe_float(amt_match.group(2))
                empr_c = safe_float(amt_match.group(3))
                empr_b = safe_float(amt_match.group(4))
                cost = mem_c + empr_c
                unrealized = mem_b + empr_b
        
        pl_pct = (unrealized / cost * 100.0) if cost > 0 else 0.0
        holdings.append({
            "code": code,
            "name": names.get(code, f"K-PVD {code}"),
            "as_of_date": as_of_date,
            "units": u,
            "nav": nav,
            "cost": round(cost, 2),
            "market_value": round(mval, 2),
            "unrealized_pl": round(unrealized, 2),
            "unrealized_pl_pct": round(pl_pct, 2)
        })
    return as_of_date, holdings

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
        # Extract trade date from header
        trans_date = None
        date_match = re.search(r'(?:Trade Date|วันที่ทำรายการ|วันที่|Date)[:\s]+(\d{2})[/-](\d{2})[/-](\d{4})', text_clean, re.I)
        if not date_match:
            date_match = re.search(r'(\d{2})[/-](\d{2})[/-](\d{4})', text_clean)
        if date_match:
            d, m, y = date_match.groups()
            y_int = int(y)
            if y_int > 2400:
                y_int -= 543
            trans_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"

        # 1a. Table lines: concatenated format (e.g. 2202506160004256 SUB KKP US500-UH-E 95.5858 2.671,000.0010.4618)
        pattern_concat = re.compile(
            r'(\d{10,22})\s+(SUB|RED|SWI|SWO)\s+([A-Za-z0-9\-_()]+(?:\s+[A-Za-z0-9\-_()]+)*?)\s+([\d.]+)\s+(\d+\.\d{2})([0-9,]+\.\d{2})(\d+\.\d{2,4})'
        )
        for m in pattern_concat.finditer(pdf_text):
            order_id, side, fcode, units_s, fee_s, amt_s, nav_s = m.groups()
            try:
                units = float(units_s)
                fee = float(fee_s)
                amt = float(amt_s.replace(',', ''))
                nav = float(nav_s)
                if amt > 0 and nav > 0 and abs(units * nav - amt) < 5.0:
                    txs.append({
                        "platform": "DIME",
                        "fund_code": fcode.strip(),
                        "trans_type": "BUY" if side in ("SUB", "SWI") else "SELL",
                        "trans_date": trans_date or datetime.now().strftime("%Y-%m-%d"),
                        "units": round(units, 4),
                        "unit_price": round(nav, 4),
                        "total_amount": round(amt, 2),
                        "fee": fee,
                        "note": order_id
                    })
            except Exception:
                pass

        # 1b. Table lines: normal spaced format (e.g. 2202506160004256 SUB KKP US500-UH-E 95.5858 10.4618 2.67 1,000.00)
        if not txs:
            pattern_spaced = re.compile(
                r'(\d{10,22})\s+(SUB|RED|SWI|SWO)\s+([A-Za-z0-9\-_()]+(?:\s+[A-Za-z0-9\-_()]+)*?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([0-9,]+\.\d{2})'
            )
            for m in pattern_spaced.finditer(pdf_text):
                order_id, side, fcode, units_s, nav_s, fee_s, amt_s = m.groups()
                try:
                    units = float(units_s)
                    nav = float(nav_s)
                    fee = float(fee_s)
                    amt = float(amt_s.replace(',', ''))
                    if amt > 0 and nav > 0 and abs(units * nav - amt) < 5.0:
                        txs.append({
                            "platform": "DIME",
                            "fund_code": fcode.strip(),
                            "trans_type": "BUY" if side in ("SUB", "SWI") else "SELL",
                            "trans_date": trans_date or datetime.now().strftime("%Y-%m-%d"),
                            "units": round(units, 4),
                            "unit_price": round(nav, 4),
                            "total_amount": round(amt, 2),
                            "fee": fee,
                            "note": order_id
                        })
                except Exception:
                    pass

        if txs:
            return txs, True

        # 1c. Fallback for single-fund confirmation note
        fund_match = re.search(r'(?:ชื่อย่อหลักทรัพย์|กองทุน|Fund Code|Fund Abbr)[:\s]+([A-Za-z0-9\-_()]+)', text_clean, re.I)
        order_match = re.search(r'(?:เลขที่คำสั่ง|Order No\.?)[:\s]+([A-Za-z0-9]+)', text_clean, re.I)
        
        amounts = re.findall(r'[\d,]+\.\d{2,4}', text_clean)
        num_vals = []
        for a in amounts:
            try:
                num_vals.append(float(a.replace(',', '')))
            except ValueError:
                pass
        
        if fund_match and trans_date and len(num_vals) >= 3:
            fcode = fund_match.group(1).strip()
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

    # 2. TTB Confirmation Note Fast-Path (0 Gemini Tokens)
    if broker_tag == "TTB":
        ttb_pattern = re.compile(
            r'(?:PT\d+[\r\n]+)?'
            r'(\d{1,2}-[A-Za-z]{3}-\d{4})[\r\n]+'
            r'([A-Za-z0-9]+)[\r\n]+'
            r'(SUBSCRIPTION|REDEMPTION|SWITCH\s+IN|SWITCH\s+OUT|TRANSFER\s+IN|TRANSFER\s+OUT|REVERSE)[\r\n]+'
            r'([^\r\n]+)[\r\n]+'
            r'([^\r\n]+)[\r\n]+'
            r'([\d,]+\.\d{2,4})\s+([\d,]+\.\d{2,4})\s+([\d,]+\.\d{2,4})',
            re.MULTILINE
        )
        for m in ttb_pattern.finditer(pdf_text):
            d_raw, tx_no, t_type_raw, fname, amc, amt_str, nav_str, units_str = m.groups()
            try:
                dt = datetime.strptime(d_raw.strip(), '%d-%b-%Y')
                iso_date = dt.strftime('%Y-%m-%d')
                amt = float(amt_str.replace(',', ''))
                nav = float(nav_str.replace(',', ''))
                units = float(units_str.replace(',', ''))
                is_buy = any(kw in t_type_raw.upper() for kw in ("SUBSCRIPTION", "SWITCH IN", "TRANSFER IN"))
                t_type = "BUY" if is_buy else "SELL"
                txs.append({
                    "platform": "TTB",
                    "fund_code": fname.strip(),
                    "trans_type": t_type,
                    "trans_date": iso_date,
                    "units": round(units, 4),
                    "unit_price": round(nav, 4),
                    "total_amount": round(amt, 2),
                    "fee": 0.0,
                    "note": f"Order {tx_no}"
                })
            except Exception:
                pass
        if txs:
            return txs, True

    # 3. SCB Statement of Holding Fast-Path (0 Gemini Tokens)
    if broker_tag == "SCB":
        # Check if text contains SCB Statement of Holding markers
        if "หนังสือรับรองสิทธิในหน่วยลงทุน" in pdf_text or "Statement of Holding" in pdf_text or "ไทยพาณิชย์" in pdf_text:
            date_m = re.search(r'วันที่\s*(\d{2}/\d{2}/\d{4})', pdf_text)
            if not date_m:
                date_m = re.search(r'(\d{2}/\d{2}/\d{4})', pdf_text)
            iso_date = None
            if date_m:
                d, m, y = date_m.group(1).split('/')
                y_int = int(y)
                if y_int > 2400:
                    y_int -= 543
                iso_date = f"{y_int:04d}-{int(m):02d}-{int(d):02d}"

            # Fund Code
            fund_code = None
            if "SP500E" in pdf_text:
                fund_code = "SCBS&P500E"
            elif "NDQ(E)" in pdf_text or "NDQ" in pdf_text:
                fund_code = "SCBNDQ(E)"
            else:
                fc_m = re.search(r'\(([A-Za-z0-9\-()]+)\)\s*(?:\n|\r\n|\s)*กองทุนตราสาร', pdf_text)
                if fc_m:
                    fund_code = fc_m.group(1).strip()

            # Transaction table row: FormNo Code Units Price THB Amount Balance
            # e.g. 160120260011946 DE 24.6504 40.5673 THB 1,000.00 866.1517
            row_m = re.search(r'(\d{10,})\s+([A-Z]{2})\s+([\d,.]+)\s+([\d,.]+)\s+THB\s+([\d,.]+)', pdf_text)
            if row_m and fund_code and iso_date:
                form_no = row_m.group(1)
                side_code = row_m.group(2)
                units_val = float(row_m.group(3).replace(',', ''))
                price_val = float(row_m.group(4).replace(',', ''))
                amt_val = float(row_m.group(5).replace(',', ''))

                # Brokerage fee: printed near "Brokerage Fee" or before "หนังสือรับรองสิทธิ"
                fee_val = 0.0
                fee_m1 = re.search(r'\n([\d.]+)\s*\n\s*หนังสือรับรอง', pdf_text)
                fee_m2 = re.search(r'([\d.]+)\s*\n(?:\s*\n)*\s*ผู้ดูแลผลประโยชน์', pdf_text)
                fee_m3 = re.search(r'([\d.]+)\s*THB\s*\n.*Brokerage Fee', pdf_text)
                if fee_m1:
                    fee_val = float(fee_m1.group(1))
                elif fee_m2:
                    fee_val = float(fee_m2.group(1))
                elif fee_m3:
                    fee_val = float(fee_m3.group(1))
                else:
                    fee_fallbacks = re.findall(r'\b(0\.\d{2}|4\.\d{2})\b', pdf_text)
                    if fee_fallbacks:
                        fee_val = float(fee_fallbacks[0])

                csg_m = re.search(r'(CSG\d+[A-Za-z0-9()]+)', pdf_text)
                note_str = csg_m.group(1) if csg_m else f"SCB Form #{form_no}"

                t_type = "BUY" if side_code == "DE" else "SELL"
                txs.append({
                    "platform": "SCB",
                    "fund_code": fund_code,
                    "trans_type": t_type,
                    "trans_date": iso_date,
                    "units": round(units_val, 4),
                    "unit_price": round(price_val, 4),
                    "total_amount": round(amt_val, 2),
                    "fee": round(fee_val, 2),
                    "note": note_str
                })
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
        "fund_code (string, exact class ticker e.g. SCBS&P500E, SCBNDQ(E), K-FIXEDPLUS-A, ES-USTECH), "
        "platform (string: TTB, DIME, SCB, KBANK, or OTHER), "
        "trans_type (BUY or SELL or DIVIDEND), "
        "trans_date (string YYYY-MM-DD), "
        "units (number), unit_price (number), total_amount (number), fee (number, 0 if none), "
        "note (string, confirmation number if present). "
        "CRITICAL: 'ผู้ดูแลผลประโยชน์ / Fund Supervisor' (e.g. ธนาคารกสิกรไทย) is only the custodian, NOT the platform. "
        "For SCB statements (บลจ. ไทยพาณิชย์), platform must strictly be 'SCB'. "
        "For SCB statements, extract 'ค่าใช้จ่ายในการซื้อขายหลักทรัพย์ (Brokerage Fee)' as 'fee' (e.g. 0.45, 0.30, 4.51). No markdown fences."
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
        for attempt in range(3):
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
                    wait_sec = (attempt + 1) * 2
                    logger.warning("[!] Gemini %s 429 rate limit reached. Backing off %ds (attempt %d/3)...", model_name, wait_sec, attempt + 1)
                    time.sleep(wait_sec)
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
    "TISCOSTRAT": "TSF",
    "TISCOSTR": "TSF",
    "TISCO STRATEGIC FUND CLASS A": "TSF",
    "TISCO STRATEGIC FUND": "TSF",
    "TSF-A": "TSF",
    # SCB S&P 500
    "SP500E": "SCBS&P500E",
    "SCBSP500E": "SCBS&P500E",
    "SCBS&P500E": "SCBS&P500E",
    "SCBS&P500": "SCBS&P500",
    "SCB S&P 500 INDEX FUND": "SCBS&P500",
    # SCB China A Shares
    "SCBCHAA": "SCBCHAFUND",
    "SCBCHA(A)": "SCBCHAFUND",
    "SCBCHINA(A)": "SCBCHAFUND",
    "SCB CHINA A-SHARES FUND (ACCUMULATION)": "SCBCHAFUND",
    "SCB CHINA A-SHARES FUND": "SCBCHAFUND",
    "SCBCHINA": "SCBCHAFUND",
    # SCB Nasdaq
    "SCBNDQ(E)": "SCBNDQ(E)",
    "SCB NDQ(E)": "SCBNDQ(E)",
    "SCBNDQE": "SCBNDQ(E)",
    "NDQ(E)": "SCBNDQ(E)",
    # Eastspring / ttb
    "EASTSPRING ASIA ACTIVE EQUITY FUND (ACCUMULATION CLASS)": "ES-ASIA-A",
    "EASTSPRING ASIA ACTIVE EQUITY FUND": "ES-ASIA-A",
    "TMB EASTSPRING ASIA ACTIVE FUND": "ES-ASIA-A",
    "ES-ASIAEQ": "ES-ASIA-A",
    "ES-ASIA": "ES-ASIA-A",
    "EASTSPRING-AAEF": "ES-ASIA-A",
    "EASTSPRING GIS GLOBAL BOND FUND (ACCUMULATION)": "ES-GIS-GBOND",
    "EASTSPRING GIS GLOBAL BOND FUND": "ES-GIS-GBOND",
    "EASTSPRING-GIS": "ES-GIS-GBOND",
    "ES-GERMAN": "ES-GER",
    "EASTSPRING-GERMAN": "ES-GER",
    "EASTSPRING GERMANY EQUITY FUND": "ES-GER",
    "TMB GERMAN EQUITY FUND": "ES-GER",
    "KTAM CAPITAL SECURITIES FUND - CLASS A": "KT-CSBOND-A",
    "KTAM CAPITAL SECURITIES FUND": "KT-CSBOND-A",
    "EASTSPRING US BLUE CHIP EQUITY FUND": "ES-USBLUECHIP",
    "EASTSPRING-USBLUE": "ES-USBLUECHIP",
    "TMB US BLUE CHIP EQUITY FUND": "ES-USBLUECHIP",
    "EASTSPRING GLOBAL CORE EQUITY FUND": "ES-GCORE",
    "EASTSPRING-GCEF": "ES-GCORE",
    "TMB EASTSPRING GLOBAL CORE EQUITY FUND": "ES-GCORE",
    "EASTSPRING GLOBAL DIVIDEND EQUITY FUND": "ES-GDIV",
    "EASTSPRING-GDEF": "ES-GDIV",
    "ES-GDIV-ACC": "ES-GDIV",
    "EASTSPRING US INFORMATION TECHNOLOGY FUND": "ES-USTECH",
    "EASTSPRING-USTECH": "ES-USTECH",
    "TTB-SMART-PORT-4": "tsp4-explorer",
    # ONE European Equity
    "ONE EUROPEAN EQUITY FUND": "ONE-EUROEQ",
    "ONE-EUROPEAN": "ONE-EUROEQ",
    "ONE-EUROPE": "ONE-EUROEQ",
    # Dime KKP funds (Normalize to SEC canonical master data)
    "KKP NDQ100-UH-E": "KKP NDQ100-UH FUND",
    "KKP NDQ100-UH": "KKP NDQ100-UH FUND",
    "KKP US500-UH-E": "KKP US500-UH FUND",
    "KKP US500-UH": "KKP US500-UH FUND",
    # Kasikorn
    "WEALTH PLUS SPEED4B": "K-WPSPEEDUP",
    "WEALTHPLUS SPEEDUP": "K-WPSPEEDUP",
    "K-FIXEDPLUS-A": "K-FIXEDPLUS",
}

def load_extra_aliases_into_dict(target_dict, alias_file_path):
    try:
        if os.path.exists(alias_file_path):
            with open(alias_file_path, "r", encoding="utf-8") as af:
                loaded = json.load(af)
                for k, v in loaded.items():
                    target_dict[k.upper()] = v
    except Exception as e:
        logger.warning(f"Could not load fund_aliases.json: {e}")

load_extra_aliases_into_dict(KNOWN_FUND_ALIASES, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fund_aliases.json"))

BLACKLISTED_NAMES = {
    "purchase (plan)", "ซื้อสม่ำเสมอ", "purchase", "sell", "dividend", 
    "subscription", "redemption", "สับเปลี่ยนเข้า", "สับเปลี่ยนออก", 
    "สับเปลี่ยน", "ขายคืน", "ซื้อ", "plan", "regular"
}

def lookup_nav_for_date(conn, proj_id: str, trans_date: str, trans_type: str = "BUY"):
    """
    ดึงราคาทำรายการจาก fund_nav_history ตามวันที่ทำรายการ (หรือใกล้เคียงก่อนหน้า)
    สำหรับ BUY: ใช้ sell_price (ราคาขายของ บลจ. รวม front-end fee / offer price ถ้ามี)
    สำหรับ SELL: ใช้ buy_price (ราคารับซื้อคืนของ บลจ. / redemption price)
    fallback ไปยัง nav (last_val)
    Returns: (nav_value_str, nav_source)
             nav_source: 'SEC_HISTORY' | 'SEC_LATEST' | 'PDF'
    """
    if not proj_id:
        return None, 'PDF'
    c = conn.cursor()
    price_col = "COALESCE(NULLIF(sell_price, ''), NULLIF(nav, ''), '0')" if trans_type == "BUY" else "COALESCE(NULLIF(buy_price, ''), NULLIF(nav, ''), '0')"
    c.execute(f"""
        SELECT {price_col} FROM fund_nav_history
        WHERE proj_id = ? AND nav_date <= ?
          AND {price_col} IS NOT NULL AND {price_col} != 'None' AND {price_col} != '' AND {price_col} != '0'
        ORDER BY nav_date DESC LIMIT 1
    """, (proj_id, trans_date))
    row = c.fetchone()
    if row and row[0]:
        return str(row[0]), 'SEC_HISTORY'

    c.execute("""
        SELECT last_nav FROM funds
        WHERE (proj_id = ? OR UPPER(proj_abbr_name) = UPPER(?))
          AND last_nav IS NOT NULL AND last_nav != 'None' AND last_nav != '' AND last_nav != '0'
        LIMIT 1
    """, (proj_id, proj_id))
    row = c.fetchone()
    if row and row[0]:
        return str(row[0]), 'SEC_LATEST'
    return None, 'PDF'

def match_fund_with_confidence(conn, fund_code: str) -> dict:
    c = conn.cursor()
    clean_code = fund_code.strip()
    upper_code = clean_code.upper()

    if clean_code.lower() in BLACKLISTED_NAMES:
        return {
            "proj_id": None, "fund_abbr": clean_code, "fund_name_th": None,
            "fund_name_en": None, "match_confidence": "NONE"
        }

    # 0. Check fund_aliases table (matches alias or canonical_abbr, including share classes)
    try:
        c.execute("""
            SELECT a.proj_id, a.canonical_abbr, f.proj_name_th, f.proj_name_en
            FROM fund_aliases a
            JOIN funds f ON a.proj_id = f.proj_id
            WHERE UPPER(a.alias) = ? OR UPPER(a.canonical_abbr) = ?
            LIMIT 1
        """, (upper_code, upper_code))
        row = c.fetchone()
        if row:
            return {
                "proj_id": row[0],
                "fund_abbr": row[1],
                "fund_name_th": row[2],
                "fund_name_en": row[3],
                "match_confidence": "EXACT"
            }
    except sqlite3.OperationalError:
        pass

    # 1. Alias map (EXACT)
    if upper_code in KNOWN_FUND_ALIASES:
        target = KNOWN_FUND_ALIASES[upper_code]
        c.execute("""SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en
                     FROM funds WHERE UPPER(proj_abbr_name) = ? LIMIT 1""",
                  (target.upper(),))
        row = c.fetchone()
        if row:
            return {
                "proj_id": row[0], "fund_abbr": row[1],
                "fund_name_th": row[2], "fund_name_en": row[3],
                "match_confidence": "EXACT"
            }
        # Check fund_nav_history classes
        try:
            c.execute("""SELECT nh.proj_id, nh.fund_class_name, f.proj_name_th, f.proj_name_en
                         FROM fund_nav_history nh
                         JOIN funds f ON nh.proj_id = f.proj_id
                         WHERE UPPER(nh.fund_class_name) = ? LIMIT 1""",
                      (target.upper(),))
            row = c.fetchone()
            if row:
                return {
                    "proj_id": row[0], "fund_abbr": row[1],
                    "fund_name_th": row[2], "fund_name_en": row[3],
                    "match_confidence": "EXACT"
                }
        except sqlite3.OperationalError:
            pass

        # Check if stripping class suffix matches parent fund in funds
        base_target = re.sub(r'[\(\-]?(E|A|P|SSF|SSFE|SSFA|X|D)\)?$', '', target.upper()).strip()
        if base_target and base_target != target.upper():
            c.execute("""SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en
                         FROM funds WHERE UPPER(proj_abbr_name) = ? LIMIT 1""",
                      (base_target,))
            row = c.fetchone()
            if row:
                return {
                    "proj_id": row[0], "fund_abbr": target,
                    "fund_name_th": row[2], "fund_name_en": row[3],
                    "match_confidence": "EXACT"
                }
        clean_code = target
        upper_code = target.upper()

    # 2. Exact match proj_abbr_name
    c.execute("""SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en
                 FROM funds WHERE LOWER(proj_abbr_name) = LOWER(?) LIMIT 1""",
              (clean_code,))
    row = c.fetchone()
    if row:
        return {
            "proj_id": row[0], "fund_abbr": row[1],
            "fund_name_th": row[2], "fund_name_en": row[3],
            "match_confidence": "EXACT"
        }

    # 3. Normalized match (strip -/spaces/()) -> FUZZY
    norm = re.sub(r'[-\s()]', '', clean_code).lower()
    c.execute("""SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en FROM funds
                 WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(proj_abbr_name,'-',''),' ',''),'(',''),')','')) = ?
                 LIMIT 1""", (norm,))
    row = c.fetchone()
    if row:
        return {
            "proj_id": row[0], "fund_abbr": row[1],
            "fund_name_th": row[2], "fund_name_en": row[3],
            "match_confidence": "FUZZY"
        }

    # 4. LIKE match on proj_name_en / proj_name_th -> FUZZY
    c.execute("""SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en FROM funds
                 WHERE LOWER(proj_name_en) LIKE LOWER(?) OR LOWER(proj_name_th) LIKE LOWER(?)
                 LIMIT 1""", (f"%{clean_code}%", f"%{clean_code}%"))
    row = c.fetchone()
    if row:
        return {
            "proj_id": row[0], "fund_abbr": row[1],
            "fund_name_th": row[2], "fund_name_en": row[3],
            "match_confidence": "FUZZY"
        }

    # 5. Not found -> NONE
    return {
        "proj_id": None, "fund_abbr": clean_code,
        "fund_name_th": None, "fund_name_en": None,
        "match_confidence": "NONE"
    }

def insert_pending(conn, user_id, sync_batch_id, platform, raw_fund_name, tx, source_file="", source_email=""):
    """
    บันทึกรายการธุรกรรมลง pending_transactions สำหรับ Staged Import (Review Before Commit)
    คืนค่า True ถ้าเพิ่มใหม่, False ถ้าเป็นรายการซ้ำใน pending
    """
    match = match_fund_with_confidence(conn, raw_fund_name)
    proj_id = match["proj_id"]
    fund_abbr = match["fund_abbr"] or raw_fund_name

    trans_date = str(tx.get("trans_date") or datetime.now().strftime("%Y-%m-%d"))
    trans_type = str(tx.get("trans_type") or "BUY").upper()
    total_amount = float(tx.get("total_amount") or 0.0)
    units = float(tx.get("units") or 0.0)
    fee = float(tx.get("fee") or 0.0)
    note = str(tx.get("note") or (f"Imported from {source_file}" if source_file else ""))

    # NAV lookup from SEC history (matching sell_price for BUY and buy_price for SELL)
    nav_val, nav_source = lookup_nav_for_date(conn, proj_id, trans_date, trans_type)
    unit_price = float(tx.get("unit_price") or 0.0)

    # Sanity check: If SEC historical NAV is available and unit_price from PDF is wildly off (>20% or >500)
    if nav_val is not None:
        try:
            sec_nav = float(nav_val)
            if sec_nav > 0:
                if unit_price <= 0 or unit_price > 500.0 or abs(unit_price - sec_nav) / sec_nav > 0.2:
                    logger.info("[PENDING] Using SEC NAV %.4f instead of raw price %.4f for %s on %s",
                                sec_nav, unit_price, fund_abbr, trans_date)
                    unit_price = sec_nav
                    if total_amount > 0 and (units <= 0 or abs(units * unit_price - total_amount) > max(10.0, 0.1 * total_amount)):
                        # DEFENSIVE GUARD: Never scale units up to match an unverified huge total_amount!
                        if units > 0 and (total_amount > 20000 or (total_amount / (units * unit_price) > 5.0)):
                            total_amount = round(units * unit_price, 2)
                        elif units <= 0:
                            import math
                            units = math.floor((total_amount / unit_price) * 10000) / 10000
                else:
                    nav_source = "SEC_HISTORY"
        except Exception:
            pass
    elif unit_price > 0 and total_amount > 0 and units > 0:
        calc_price = total_amount / units
        if unit_price > 500.0 or abs(units * unit_price - total_amount) > max(10.0, 0.1 * total_amount):
            unit_price = calc_price
        nav_source = "PDF"

    c = conn.cursor()
    # Check if duplicate pending exists to avoid duplicates
    c.execute("""
        SELECT id FROM pending_transactions
        WHERE user_id = ? AND source_file = ? AND trans_date = ? AND raw_fund_name = ?
          AND total_amount = ? AND status = 'PENDING'
        LIMIT 1
    """, (user_id, source_file, trans_date, raw_fund_name, f"{total_amount:.2f}"))
    if c.fetchone():
        logger.debug("[*] Pending duplicate skipped: %s %s from %s", trans_date, fund_abbr, source_file)
        return False

    pending_id = f"pending_{uuid.uuid4().hex}"
    c.execute("""
        INSERT INTO pending_transactions (
            id, user_id, sync_batch_id, source_file, source_email,
            platform, raw_fund_name, proj_id, fund_abbr, fund_name_th, fund_name_en,
            match_confidence, trans_type, trans_date, units, unit_price, nav_source,
            total_amount, fee, note, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, (
        pending_id, user_id, sync_batch_id, source_file, source_email,
        platform, raw_fund_name, proj_id, fund_abbr, match.get("fund_name_th"), match.get("fund_name_en"),
        match["match_confidence"], trans_type, trans_date,
        f"{units:.4f}", f"{unit_price:.4f}", nav_source,
        f"{total_amount:.2f}", f"{fee:.2f}", note
    ))
    return True

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

PROGRESS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sync_progress.json")
PROGRESS_BIN_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sync_progress.bin")

def encode_binary_sync_progress(state):
    """Encodes state into flat Binary Envelope (Magic: 0x00, Proto: 0x01, Ver: 1)"""
    import struct
    is_running = bool(state.get("is_running", False))
    completed = bool(state.get("completed", False))
    cancelled = bool(state.get("cancelled", False))
    flags = (1 if is_running else 0) | (2 if completed else 0) | (4 if cancelled else 0)

    emails_scanned = int(state.get("emails_scanned", 0))
    total_emails = int(state.get("total_emails", 0))
    attachments_found = int(state.get("attachments_found", 0))
    new_tx_count = int(state.get("new_tx_count", 0))
    skipped_tx_count = int(state.get("skipped_tx_count", 0))
    updated_at_unix_sec = int(time.time())

    status_text = str(state.get("status_text", ""))
    status_bytes = status_text.encode('utf-8')

    header = struct.pack(
        "<BBHB3xIIIIIqI",
        0x00, 0x01, 1, flags,
        emails_scanned, total_emails, attachments_found, new_tx_count, skipped_tx_count,
        updated_at_unix_sec, len(status_bytes)
    )

    recent_logs = state.get("recent_logs", [])
    logs_buf = bytearray(struct.pack("<I", len(recent_logs)))
    for log in recent_logs:
        log_bytes = str(log).encode('utf-8')
        logs_buf.extend(struct.pack("<I", len(log_bytes)))
        logs_buf.extend(log_bytes)

    return header + status_bytes + logs_buf

def write_sync_progress(state):
    try:
        # 1. Fast Path: Write high-performance Binary Envelope
        bin_data = encode_binary_sync_progress(state)
        bin_tmp = PROGRESS_BIN_FILE + ".tmp"
        with open(bin_tmp, "wb") as bf:
            bf.write(bin_data)
        if os.path.exists(bin_tmp):
            if os.path.exists(PROGRESS_BIN_FILE):
                os.remove(PROGRESS_BIN_FILE)
            os.rename(bin_tmp, PROGRESS_BIN_FILE)

        # 2. Dual-Mode Fallback: Write legacy JSON for external inspection
        tmp = PROGRESS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        if os.path.exists(tmp):
            if os.path.exists(PROGRESS_FILE):
                os.remove(PROGRESS_FILE)
            os.rename(tmp, PROGRESS_FILE)
    except Exception as e:
        logger.debug("Failed to write sync_progress: %s", e)

def process_pdf_attachment_worker(task):
    """
    Worker task for concurrent decryption and AI parsing of a single statement PDF.
    Does not touch SQLite; returns extracted transactions and usage metadata.
    """
    pdf_data = task.get("pdf_data") or b""
    filename = task.get("filename") or ""
    candidate_pwds = task.get("candidate_pwds") or []
    active_broker = task.get("active_broker") or ""
    gemini_api_key = task.get("gemini_api_key") or ""

    reader, used_pwd = decrypt_pdf_bytes(pdf_data, candidate_pwds)
    if not reader:
        return {
            "success": False,
            "error": "decryption_failed",
            "task": task,
            "used_pwd": None,
            "txs": [],
            "usage": {},
        }

    try:
        pdf_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        if not pdf_text.strip():
            return {
                "success": True,
                "empty_pdf": True,
                "task": task,
                "used_pwd": used_pwd,
                "txs": [],
                "usage": {},
            }

        # Extract transactions: Try Regex Fast-Path first (0 Token)
        regex_txs, regex_ok = try_regex_parse_confirmation(pdf_text, active_broker)
        if regex_ok:
            return {
                "success": True,
                "regex_ok": True,
                "empty_pdf": False,
                "task": task,
                "used_pwd": used_pwd,
                "txs": regex_txs,
                "usage": {},
            }

        cleaned_text = clean_pdf_boilerplate(pdf_text)
        time.sleep(0.05)  # Fast pacing enabled for Tier 1 (4,000 RPM capacity)
        gemini_txs, usage, parse_success = extract_transactions_with_gemini(cleaned_text, gemini_api_key)
        if not parse_success:
            return {
                "success": False,
                "error": "ai_parse_failed",
                "task": task,
                "used_pwd": used_pwd,
                "txs": [],
                "usage": usage or {},
            }

        return {
            "success": True,
            "regex_ok": False,
            "empty_pdf": False,
            "task": task,
            "used_pwd": used_pwd,
            "txs": gemini_txs,
            "usage": usage or {},
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "task": task,
            "used_pwd": used_pwd,
            "txs": [],
            "usage": {},
        }

def sync_gmail(user_id, gmail_account, app_password, dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, db_path, gemini_api_key=None, max_emails=0, concurrency=5):
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    c = conn.cursor()

    # 0. Load Master Broker Configs dynamically from SQLite or config JSON
    master_brokers = load_master_broker_configs(conn)
    enabled_brokers = [b for b in master_brokers if b.get("enabled", True)]
    passwords = generate_bank_passwords(dob_day, dob_month, dob_year_ce, dob_year_be, national_id_last5, enabled_brokers)
    
    senders = []
    for b in enabled_brokers:
        b_key = str(b.get("key", "")).upper().strip()
        for s_email in b.get("sender_emails", []):
            senders.append((b_key, s_email, b))

    if not senders:
        senders = [
            ("TTB", "estatement@eservice.ttbbank.com", {}),
            ("DIME", "no-reply@dime.co.th", {}),
            ("SCB", "Registrar2@email.scb.co.th", {}),
            ("KBANK", "ka.CyberInvest@kasikornasset.com", {}),
            ("KBANK_PVD", "KA.Pvdcallcenter@kasikornasset.com", {}),
        ]

    progress_state = {
        "is_running": True,
        "completed": False,
        "cancelled": False,
        "user_id": user_id,
        "broker": "STARTING",
        "broker_index": 0,
        "total_brokers": len(senders),
        "email_index": 0,
        "total_emails": 0,
        "current_subject": "",
        "current_attachment": "",
        "emails_scanned": 0,
        "attachments_found": 0,
        "transactions_inserted": 0,
        "transactions_skipped": 0,
        "tokens_used": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0},
        "status_text": "กำลังเชื่อมต่อกับ Gmail และตรวจสอบบัญชี...",
        "started_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "recent_logs": []
    }
    write_sync_progress(progress_state)

    def update_status(text, log_msg=None):
        progress_state["status_text"] = text
        progress_state["updated_at"] = datetime.now().isoformat()
        progress_state["emails_scanned"] = total_emails_scanned
        progress_state["attachments_found"] = total_attachments_found
        progress_state["transactions_inserted"] = inserted_count
        progress_state["transactions_skipped"] = skipped_count
        progress_state["tokens_used"] = {
            "prompt_tokens": total_prompt_tokens,
            "candidates_tokens": total_candidates_tokens,
            "total_tokens": total_tokens
        }
        if log_msg:
            ts = datetime.now().strftime("%H:%M:%S")
            progress_state["recent_logs"].append(f"[{ts}] {log_msg}")
            if len(progress_state["recent_logs"]) > 25:
                progress_state["recent_logs"] = progress_state["recent_logs"][-25:]
        write_sync_progress(progress_state)

    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
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
    c.execute("""
        CREATE TABLE IF NOT EXISTS pvd_positions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            policy_code TEXT NOT NULL,
            policy_name TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            units TEXT NOT NULL,
            nav TEXT NOT NULL,
            cost TEXT NOT NULL,
            market_value TEXT NOT NULL,
            unrealized_pl TEXT NOT NULL,
            unrealized_pl_pct TEXT NOT NULL,
            statement_file TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, policy_code)
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS stock_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'default_user',
            idempotency_key TEXT,
            ticker TEXT NOT NULL,
            company_name TEXT,
            platform TEXT NOT NULL,
            trans_type TEXT NOT NULL,
            trans_date TEXT NOT NULL,
            shares TEXT NOT NULL,
            price_usd TEXT NOT NULL,
            total_thb TEXT NOT NULL,
            exchange_rate TEXT,
            fee_thb TEXT DEFAULT '0.00',
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, idempotency_key)
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pending_transactions (
            id               TEXT PRIMARY KEY,
            user_id          TEXT NOT NULL DEFAULT 'default_user',
            sync_batch_id    TEXT NOT NULL,
            source_file      TEXT,
            source_email     TEXT,
            platform         TEXT NOT NULL,
            raw_fund_name    TEXT NOT NULL,
            proj_id          TEXT,
            fund_abbr        TEXT,
            fund_name_th     TEXT,
            fund_name_en     TEXT,
            match_confidence TEXT NOT NULL DEFAULT 'NONE',
            trans_type       TEXT NOT NULL,
            trans_date       TEXT NOT NULL,
            units            TEXT NOT NULL,
            unit_price       TEXT NOT NULL,
            nav_source       TEXT NOT NULL DEFAULT 'PDF',
            total_amount     TEXT NOT NULL,
            fee              TEXT NOT NULL DEFAULT '0.00',
            note             TEXT,
            status           TEXT NOT NULL DEFAULT 'PENDING',
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    
    sync_batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    logger.info("[SYNC] Generated Staging Batch ID: %s", sync_batch_id)
    
    import pypdf
    
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(gmail_account, app_password)
    try:
        res_sel, _ = mail.select('"[Gmail]/All Mail"')
        if res_sel != "OK":
            mail.select("INBOX")
    except Exception:
        mail.select("INBOX")
    
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
    update_status("เริ่มการสแกนอีเมล...", f"เข้าสู่ระบบ Gmail ({gmail_account}) สำเร็จ")

    max_workers = max(1, min(int(concurrency or 5), 10))
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
    in_flight_futures = {}
    email_errors = {}
    email_tx_counts = {}
    email_attachment_expect = {}
    email_attachment_done = {}
    email_metadata = {}

    def drain_worker_result(res):
        nonlocal inserted_count, skipped_count, total_prompt_tokens, total_candidates_tokens, total_tokens, total_txs_extracted
        task = res["task"]
        b_tag = task["broker_tag"]
        fn = task["filename"]
        pdf_h = task["pdf_hash"]
        msg_id_hdr = task["message_id"]
        subj = task["subject"]
        e_date_hdr = task["email_date"]
        
        email_attachment_done[msg_id_hdr] = email_attachment_done.get(msg_id_hdr, 0) + 1

        if not res["success"]:
            err = res.get("error", "unknown")
            if err == "decryption_failed":
                logger.warning("[%s] Decryption failed for '%s'", b_tag, fn)
                details.append(f"Failed to decrypt {fn} from {task['sender_email']}")
            else:
                logger.error("[%s] [✗] Failed to parse '%s' via AI. Will NOT cache as processed to allow retry.", b_tag, fn)
                details.append(f"AI parsing failed for {fn} (will retry next sync)")
            email_errors[msg_id_hdr] = True
            return

        used_pwd = res.get("used_pwd")
        logger.info("[%s] [✓] Decrypted '%s' using password '%s'", b_tag, fn, used_pwd or '<none>')

        if res.get("empty_pdf"):
            c.execute("INSERT OR IGNORE INTO processed_attachments (file_hash, filename, tx_count) VALUES (?, ?, 0)",
                      (pdf_h, fn))
            conn.commit()
            return

        if res.get("regex_ok"):
            logger.info("[%s] [✓] Regex Fast-Path parsed %d transactions from '%s' (0 Tokens used!)", b_tag, len(res.get("txs", [])), fn)
        else:
            usg = res.get("usage", {})
            total_prompt_tokens += usg.get("prompt_tokens", 0)
            total_candidates_tokens += usg.get("candidates_tokens", 0)
            total_tokens += usg.get("total_tokens", 0)

        txs = res.get("txs", [])
        pdf_tx_count = 0
        is_offshore_stock = "offshore" in fn.lower() or "dimeos" in fn.lower()

        if is_offshore_stock:
            for tx in txs:
                try:
                    ticker = str(tx.get("fund_code") or tx.get("ticker") or "").upper().strip()
                    if not ticker or ticker.lower() in BLACKLISTED_NAMES:
                        continue
                    shares = safe_float(tx.get("units"), 0.0)
                    price_usd = safe_float(tx.get("unit_price"), 0.0)
                    total_thb = safe_float(tx.get("total_amount"), 0.0)
                    fee_thb = safe_float(tx.get("fee"), 0.0)
                    if total_thb <= 0 and shares <= 0:
                        continue
                    t_date = str(tx.get("trans_date") or datetime.now().strftime("%Y-%m-%d"))
                    t_type = str(tx.get("trans_type") or "BUY").upper()
                    note = str(tx.get("note") or f"Imported from {fn}")

                    exchange_rate = 0.0
                    if shares > 0 and price_usd > 0:
                        exchange_rate = round(total_thb / (shares * price_usd), 2)

                    stk_id = f"tx_stk_{uuid.uuid4().hex[:12]}"
                    idem_key = compute_idempotency_key(user_id, "DIME_STOCK", ticker, t_date, t_type, shares, total_thb, note)
                    c.execute("""
                        INSERT INTO stock_transactions (id, user_id, idempotency_key, ticker, company_name, platform, trans_type, trans_date, shares, price_usd, total_thb, exchange_rate, fee_thb, note)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, idempotency_key) DO NOTHING
                    """, (stk_id, user_id, idem_key, ticker, ticker, "DIME", t_type, t_date, f"{shares:.4f}", f"{price_usd:.4f}", f"{total_thb:.2f}", f"{exchange_rate:.2f}", f"{fee_thb:.2f}", note))
                    if c.rowcount > 0:
                        inserted_count += 1
                        logger.info("[+] [STOCK] Inserted %s %s (%.4f shares @ $%.2f, %.2f THB) into stock_transactions from %s", t_date, ticker, shares, price_usd, total_thb, fn)
                    total_txs_extracted += 1
                    pdf_tx_count += 1
                except Exception as ste:
                    logger.error("[STOCK] Error inserting stock tx from %s: %s", fn, ste)

            c.execute("INSERT OR IGNORE INTO processed_attachments (file_hash, filename, tx_count) VALUES (?, ?, ?)",
                      (pdf_h, fn, pdf_tx_count))
            conn.commit()
            email_tx_counts[msg_id_hdr] = email_tx_counts.get(msg_id_hdr, 0) + pdf_tx_count
            return

        for tx in txs:
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
                    continue

                if total_amount > 0 and units > 0:
                    calc_price = total_amount / units
                    if unit_price > 500.0 or abs(units * unit_price - total_amount) > max(10.0, 0.1 * total_amount):
                        logger.warning("[%s] Auto-corrected absurd unit_price %.4f -> %.4f (total_amount=%.2f, units=%.4f) in %s",
                                       b_tag, unit_price, calc_price, total_amount, units, fn)
                        unit_price = calc_price

                t_date = str(tx.get("trans_date") or datetime.now().strftime("%Y-%m-%d"))
                platform_code = resolve_platform_for_transaction(b_tag, tx.get("platform"), fcode)
                note = str(tx.get("note") or f"Imported from {fn}")

                total_txs_extracted += 1
                pdf_tx_count += 1

                raw_fund = fcode
                inserted = insert_pending(
                    conn, user_id, sync_batch_id, platform_code, raw_fund, tx,
                    source_file=fn, source_email=subj
                )
                if inserted:
                    inserted_count += 1
                    logger.info("[+] [PENDING] Inserted %s %s (%.2f THB) from %s", t_date, raw_fund, total_amount, fn)
                    details.append(f"Pending: {t_date} {raw_fund} ({total_amount:,.2f} THB) from {fn}")
                else:
                    skipped_count += 1
                    logger.debug("[*] Skipped duplicate pending %s %s from %s", t_date, raw_fund, fn)
            except Exception as te:
                logger.error("[%s] Error inserting pending tx from %s: %s (tx: %s)", b_tag, fn, te, tx)

        c.execute("INSERT OR IGNORE INTO processed_attachments (file_hash, filename, tx_count) VALUES (?, ?, ?)",
                  (pdf_h, fn, pdf_tx_count))
        conn.commit()
        email_tx_counts[msg_id_hdr] = email_tx_counts.get(msg_id_hdr, 0) + pdf_tx_count

    def drain_in_flight(wait_all=False):
        nonlocal in_flight_futures
        if not in_flight_futures:
            return
        if wait_all:
            for fut in concurrent.futures.as_completed(list(in_flight_futures.keys())):
                res = fut.result()
                drain_worker_result(res)
            in_flight_futures.clear()
        else:
            done, _ = concurrent.futures.wait(in_flight_futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
            for fut in done:
                res = fut.result()
                drain_worker_result(res)
                del in_flight_futures[fut]

    for b_idx, (broker_tag, sender_email, broker_cfg) in enumerate(senders, 1):
        progress_state["broker"] = broker_tag
        progress_state["broker_index"] = b_idx
        update_status(f"กำลังค้นหาอีเมลของ {broker_tag}...", f"[{broker_tag}] กำลังค้นหาอีเมลจาก {sender_email}...")
        logger.info("Searching for %s emails from %s...", broker_tag, sender_email)
        if "kplus" in sender_email.lower():
            status, data = mail.search(None, f'(FROM "{sender_email}" SUBJECT "Acknowledging")')
        else:
            status, data = mail.search(None, f'(FROM "{sender_email}")')
        if status != "OK" or not data[0]:
            logger.info("No messages found for %s.", broker_tag)
            update_status(f"ไม่พบอีเมลของ {broker_tag}", f"[{broker_tag}] ไม่พบอีเมลใหม่ในกล่องข้อความ")
            continue
        
        msg_ids = data[0].split()
        progress_state["total_emails"] = len(msg_ids)
        update_status(f"[{broker_tag}] พบ {len(msg_ids)} อีเมล", f"[{broker_tag}] พบ {len(msg_ids)} อีเมล กำลังเริ่มสแกน...")

        # Dedicated Handler for KBANK_PVD (Approach 1: Latest Position Snapshot)
        if broker_tag == "KBANK_PVD":
            logger.info("[KBANK_PVD] Processing Provident Fund (PVD) Member Statements via Latest Position Snapshot...")
            latest_pvd_date = ""
            latest_pvd_holdings = []
            latest_filename = ""
            
            candidate_pwds = passwords.get("KBANK", []) + passwords.get("GENERAL", [])
            for idx, msg_id in enumerate(msg_ids, 1):
                total_emails_scanned += 1
                res, msg_data = mail.fetch(msg_id, '(RFC822)')
                if res != "OK":
                    continue
                msg = email.message_from_bytes(msg_data[0][1])
                for part in msg.walk():
                    fn = part.get_filename()
                    if fn:
                        fn = decode_mime_words(fn)
                    if fn and fn.lower().endswith(".pdf"):
                        pdf_data = part.get_payload(decode=True)
                        if not pdf_data:
                            continue
                        reader, _ = decrypt_pdf_bytes(pdf_data, candidate_pwds)
                        if reader:
                            txt = "\n".join(p.extract_text() or "" for p in reader.pages)
                            pvd_date, h_list = parse_kbank_pvd_statement(txt)
                            if pvd_date and pvd_date >= latest_pvd_date and h_list:
                                latest_pvd_date = pvd_date
                                latest_pvd_holdings = h_list
                                latest_filename = fn
            
            if latest_pvd_holdings:
                active_codes = []
                pvd_total_val = 0.0
                for h in latest_pvd_holdings:
                    active_codes.append(h["code"])
                    pvd_total_val += h["market_value"]
                    pvd_id = f"pvd_{user_id}_{h['code']}"
                    c.execute("""
                        INSERT INTO pvd_positions (
                            id, user_id, policy_code, policy_name, as_of_date,
                            units, nav, cost, market_value, unrealized_pl, unrealized_pl_pct, statement_file, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(user_id, policy_code) DO UPDATE SET
                            policy_name = excluded.policy_name,
                            as_of_date = excluded.as_of_date,
                            units = excluded.units,
                            nav = excluded.nav,
                            cost = excluded.cost,
                            market_value = excluded.market_value,
                            unrealized_pl = excluded.unrealized_pl,
                            unrealized_pl_pct = excluded.unrealized_pl_pct,
                            statement_file = excluded.statement_file,
                            updated_at = CURRENT_TIMESTAMP
                    """, (
                        pvd_id, user_id, h["code"], h["name"], h["as_of_date"],
                        f"{h['units']:.4f}", f"{h['nav']:.4f}", f"{h['cost']:.2f}",
                        f"{h['market_value']:.2f}", f"{h['unrealized_pl']:.2f}",
                        f"{h['unrealized_pl_pct']:.2f}", latest_filename
                    ))
                placeholders = ",".join("?" for _ in active_codes)
                c.execute(f"DELETE FROM pvd_positions WHERE user_id = ? AND policy_code NOT IN ({placeholders})", [user_id] + active_codes)
                conn.commit()
                logger.info("[KBANK_PVD] [✓] Synced latest PVD positions (As of %s): %d policies, Total Value: %.2f THB (from %s)", latest_pvd_date, len(latest_pvd_holdings), pvd_total_val, latest_filename)
                details.append(f"Synced PVD Snapshot as of {latest_pvd_date} ({pvd_total_val:,.2f} THB) from {latest_filename}")
            else:
                logger.info("[KBANK_PVD] No active PVD policies extracted.")
            continue
        if max_emails > 0:
            logger.info("Found %d emails for %s. Processing up to %d latest...", len(msg_ids), broker_tag, max_emails)
            target_ids = msg_ids[-max_emails:]
        else:
            logger.info("Found %d emails for %s. Full Historical Sweep (oldest to newest)...", len(msg_ids), broker_tag)
            target_ids = msg_ids  # All emails in chronological order!
        
        cfg_includes = [s.lower() for s in broker_cfg.get("subject_includes", [])]
        cfg_excludes = [s.lower() for s in broker_cfg.get("subject_excludes", [])]

        for idx, msg_id in enumerate(target_ids, 1):
            total_emails_scanned += 1
            progress_state["email_index"] = idx

            # FAST HEADER PRE-CHECK: Fetch only Message-ID, Subject, Date (100x faster than downloading full PDF attachments)
            try:
                res_hdr, hdr_data = mail.fetch(msg_id, '(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT DATE)])')
            except Exception as e:
                logger.warning("[%s] Error fetching header for msg %s: %s", broker_tag, msg_id, e)
                continue

            if res_hdr != "OK" or not hdr_data or not isinstance(hdr_data[0], tuple):
                continue

            hdr_msg = email.message_from_bytes(hdr_data[0][1])
            message_id_header = (hdr_msg.get("Message-ID") or "").strip()
            subject = decode_mime_words(hdr_msg.get("Subject", ""))
            subj_lower = subject.lower()
            email_date_header = (hdr_msg.get("Date") or "").strip()

            # 1. Check if already processed in checkpoint table (instant skip!)
            if message_id_header:
                c.execute("SELECT tx_count FROM processed_emails WHERE message_id = ?", (message_id_header,))
                if c.fetchone():
                    logger.debug("[%s] [%d/%d] Skipping already-processed email: '%s' (0 Tokens)", broker_tag, idx, len(target_ids), subject[:40])
                    if idx % 10 == 0 or idx == len(target_ids):
                        progress_state["email_index"] = idx
                        progress_state["total_emails"] = len(target_ids)
                        update_status(f"[{broker_tag}] [{idx}/{len(target_ids)}] ข้ามอีเมลที่เคยสแกนแล้ว", f"[{broker_tag}] ข้ามอีเมลที่เคยสแกนแล้ว ({idx}/{len(target_ids)})")
                    continue

            # 2. Dynamic Subject Excludes Filter
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
            ] + cfg_excludes

            if any(k in subj_lower for k in skip_subject_keywords):
                logger.debug("[%s] Skipping non-transaction email (holding statement/admin): '%s'", broker_tag, subject[:60])
                if message_id_header:
                    c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, 0)",
                              (message_id_header, broker_tag, subject, email_date_header))
                    conn.commit()
                continue

            # 3. Dynamic Subject Includes Filter (e.g. for KBANK confirmation)
            if cfg_includes:
                if not any(k in subj_lower for k in cfg_includes):
                    logger.debug("[%s] Skipping email not matching required subject keywords: '%s'", broker_tag, subject[:60])
                    if message_id_header:
                        c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, 0)",
                                  (message_id_header, broker_tag, subject, email_date_header))
                        conn.commit()
                    continue
            elif broker_tag == "KBANK":
                if "confirming investment unit transactions" not in subj_lower and "ยืนยันการทำรายการหน่วยลงทุน" not in subj_lower:
                    logger.debug("[KBANK] Skipping non-confirmation KBANK email: '%s'", subject[:60])
                    if message_id_header:
                        c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, 0)",
                                  (message_id_header, broker_tag, subject, email_date_header))
                        conn.commit()
                    continue

            # 4. Fetch full RFC822 payload ONLY for confirmed new transaction emails
            res, msg_data = mail.fetch(msg_id, '(RFC822)')
            if res != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                continue
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            logger.info("[%s] [%d/%d] Processing new email: '%s'...", broker_tag, idx, len(target_ids), subject[:60])
            progress_state["current_subject"] = subject
            progress_state["email_index"] = idx
            progress_state["total_emails"] = len(target_ids)
            update_status(f"[{broker_tag}] [{idx}/{len(target_ids)}] {subject[:45]}", f"[{broker_tag}] [{idx}/{len(target_ids)}] {subject[:50]}")
            email_tx_count = 0
            email_had_error = False
            email_queued_attachments = 0
            
            # 1. Kasikorn Funds body table & K PLUS Order Emails
            if broker_tag == "KBANK":
                html_body = ""
                for part in msg.walk():
                    if part.get_content_type() in ("text/html", "text/plain"):
                        payload = part.get_payload(decode=True)
                        if payload:
                            enc = (part.get_content_charset() or "utf-8").lower().strip()
                            if enc in ("windows-874", "win-874", "tis-620", "tis620", "cp874"):
                                enc = "cp874"
                            try:
                                body_str = payload.decode(enc, errors="replace")
                            except Exception:
                                try:
                                    body_str = payload.decode("cp874", errors="replace")
                                except Exception:
                                    body_str = payload.decode("utf-8", errors="replace")
                            if body_str:
                                html_body = body_str
                            if part.get_content_type() == "text/html":
                                break
                if html_body:
                    txs = parse_html_table_kasikorn(html_body)
                    if not txs:
                        txs = parse_kplus_order_email(html_body, conn)
                    for tx in txs:
                        total_txs_extracted += 1
                        email_tx_count += 1
                        raw_fund = tx["fund_code"]
                        try:
                            inserted = insert_pending(
                                conn, user_id, sync_batch_id, tx["platform"], raw_fund, tx,
                                source_file="KBank_Email_Table", source_email=subject
                            )
                            if inserted:
                                inserted_count += 1
                                logger.info("[+] [PENDING] Inserted %s %s (%.2f THB) from KBank email", tx['trans_date'], raw_fund, tx['total_amount'])
                                details.append(f"Pending: {tx['trans_date']} {raw_fund} {tx['total_amount']} THB")
                            else:
                                skipped_count += 1
                                logger.debug("[*] Skipped duplicate pending %s %s", tx['trans_date'], raw_fund)
                        except Exception as e:
                            logger.error("DB pending insert error: %s", e)
                    conn.commit()
            
            # 2. Check for attachments (PDF) -> Dispatched to Concurrent Worker Pool
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
                    active_broker = resolve_platform_for_transaction(broker_tag)
                    candidate_pwds = passwords.get(active_broker, []) + passwords.get("GENERAL", [])
                    
                    task = {
                        "pdf_data": pdf_data,
                        "filename": filename,
                        "pdf_hash": pdf_hash,
                        "candidate_pwds": candidate_pwds,
                        "active_broker": active_broker,
                        "broker_tag": broker_tag,
                        "sender_email": sender_email,
                        "gemini_api_key": gemini_api_key,
                        "message_id": message_id_header,
                        "subject": subject,
                        "email_date": email_date_header,
                    }
                    email_queued_attachments += 1
                    logger.info("[%s] Queuing attachment '%s' for concurrent worker parsing...", broker_tag, filename)
                    fut = executor.submit(process_pdf_attachment_worker, task)
                    in_flight_futures[fut] = task

                    # Bound memory and prevent overwhelming: drain when in-flight pool is full
                    if len(in_flight_futures) >= max_workers * 2:
                        drain_in_flight(wait_all=False)

            # Record email message_id into checkpoint cache if no attachments were queued (e.g. KBank HTML table)
            if message_id_header and email_queued_attachments == 0 and not email_had_error:
                c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, ?)",
                          (message_id_header, broker_tag, subject, email_date_header, email_tx_count))
                conn.commit()

        # Drain all remaining worker futures for this broker
        drain_in_flight(wait_all=True)

        # Mark all fully-processed emails for this broker in checkpoint table
        for m_id, att_count in list(email_attachment_expect.items()):
            if email_attachment_done.get(m_id, 0) >= att_count and not email_errors.get(m_id):
                meta = email_metadata.get(m_id, {})
                c.execute("INSERT OR IGNORE INTO processed_emails (message_id, broker, subject, email_date, tx_count) VALUES (?, ?, ?, ?, ?)",
                          (m_id, meta.get("broker", broker_tag), meta.get("subject", ""), meta.get("email_date", ""), email_tx_counts.get(m_id, 0)))
                conn.commit()

    try:
        executor.shutdown(wait=True)
    except Exception:
        pass
    
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
    
    res = {
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
    progress_state["is_running"] = False
    progress_state["completed"] = True
    progress_state["broker"] = "COMPLETED"
    progress_state["status_text"] = "การสแกนและนำเข้าข้อมูลเสร็จสิ้นเรียบร้อยแล้ว"
    progress_state["finished_at"] = datetime.now().isoformat()
    progress_state["result"] = res
    update_status("การสแกนและนำเข้าข้อมูลเสร็จสิ้นเรียบร้อยแล้ว", f"🎉 สำเร็จ! สแกน {total_emails_scanned} อีเมล, นำเข้า {inserted_count} รายการ")
    return res

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
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent worker threads")
    
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
            args.max_emails,
            args.concurrency
        )
        print(json.dumps(res, ensure_ascii=False))

if __name__ == "__main__":
    main()
