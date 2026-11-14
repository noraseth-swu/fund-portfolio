import csv
import hashlib
import sqlite3
import uuid
from decimal import Decimal, ROUND_HALF_UP

db_path = r'D:\git\fund-portfolio\backend\portfolio.db'
csv_path = r'D:\git\fund-portfolio\backend\data\historical_excel_data.csv'

conn = sqlite3.connect(db_path)

# Mappings to SEC proj_id and official fund abbreviations
fund_meta = {
    'tsp4-explorer': {
        'proj_id': 'M0201_2564',
        'fund_abbr': 'tsp4-explorer',
        'platform': 'TTB',
        'default_day': 28
    },
    'KT-CSBOND-A': {
        'proj_id': 'M0168_2561',
        'fund_abbr': 'KT-CSBOND-A',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-GF-A': {
        'proj_id': 'M0621_2553',
        'fund_abbr': 'ES-GF-A',
        'platform': 'TTB',
        'default_day': 28
    },
    'TSF-A': {
        'proj_id': 'M0011_2547',
        'fund_abbr': 'TSF-A',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-GDIV': {
        'proj_id': 'M0744_2565',
        'fund_abbr': 'ES-GDIV',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-USTECH': {
        'proj_id': 'M0422_2565',
        'fund_abbr': 'ES-USTECH',
        'platform': 'TTB',
        'default_day': 28
    },
    'ONE-EUROEQ': {
        'proj_id': 'M0078_2561',
        'fund_abbr': 'ONE-EUROEQ',
        'platform': 'TTB',
        'default_day': 28
    },
    'SCBCHAA': {
        'proj_id': 'M0005_2558',
        'fund_abbr': 'SCBCHAA',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-ASIA-A': {
        'proj_id': 'M0485_2557',
        'fund_abbr': 'ES-ASIA-A',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-GCORE': {
        'proj_id': 'M0277_2562',
        'fund_abbr': 'ES-GCORE',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-GER': {
        'proj_id': 'M0462_2558',
        'fund_abbr': 'ES-GER',
        'platform': 'TTB',
        'default_day': 28
    },
    'ES-USBLUECHIP': {
        'proj_id': 'M0090_2559',
        'fund_abbr': 'ES-USBLUECHIP',
        'platform': 'TTB',
        'default_day': 28
    },
    'WealthPLUS SpeedUp': {
        'proj_id': 'M0280_2564',
        'fund_abbr': 'K-WPSPEEDUP',
        'platform': 'KBANK',
        'default_day': 25
    },
    'K-FIXEDPLUS-A': {
        'proj_id': 'M0054_2560',
        'fund_abbr': 'K-FIXEDPLUS-A',
        'platform': 'KBANK',
        'default_day': 25
    },
    'SCBNDQ(E)': {
        'proj_id': 'M0311_2564',
        'fund_abbr': 'SCBNDQ(E)',
        'platform': 'SCB',
        'default_day': 25
    },
    'SCBS&P500E': {
        'proj_id': 'M0643_2555',
        'fund_abbr': 'SCBS&P500E',
        'platform': 'SCB',
        'default_day': 25
    },
    'KKP NDQ100-UH-E': {
        'proj_id': 'M0690_2566',
        'fund_abbr': 'KKP NDQ100-UH-E',
        'platform': 'DIME',
        'default_day': 25
    },
    'KPP US500-UH-E': {
        'proj_id': 'M0301_2567',
        'fund_abbr': 'KPP US500-UH-E',
        'platform': 'DIME',
        'default_day': 25
    },
}

def compute_idempotency_key(user_id, platform, proj_id, fund_abbr, trans_date, trans_type, units, total_amount, note):
    hasher = hashlib.sha256()
    hasher.update(user_id.strip().encode('utf-8'))
    hasher.update(b"|")
    hasher.update(platform.strip().upper().encode('utf-8'))
    hasher.update(b"|")
    
    fund_key = (fund_abbr if fund_abbr and fund_abbr.strip() else proj_id).strip().upper()
    hasher.update(fund_key.encode('utf-8'))
    hasher.update(b"|")
    hasher.update(trans_date.strip().encode('utf-8'))
    hasher.update(b"|")
    hasher.update(trans_type.strip().upper().encode('utf-8'))
    hasher.update(b"|")
    hasher.update(f"{units:.4f}".encode('utf-8'))
    hasher.update(b"|")
    hasher.update(f"{total_amount:.2f}".encode('utf-8'))
    
    if note and note.strip():
        hasher.update(b"|")
        hasher.update(note.strip().encode('utf-8'))
        
    return hasher.hexdigest()

def get_best_nav(proj_id, target_date_str):
    """Finds the closest NAV on or before target_date in the same month"""
    prefix = target_date_str[:7] # YYYY-MM
    row = conn.execute("""
        SELECT nav_date, nav FROM fund_nav_history 
        WHERE proj_id = ? AND nav_date <= ? AND nav_date LIKE ? AND nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0'
        ORDER BY nav_date DESC LIMIT 1
    """, (proj_id, target_date_str, f"{prefix}%")).fetchone()
    
    if row and row[1]:
        try:
            return row[0], float(row[1])
        except Exception:
            pass
        
    # If no earlier date in month, pick closest date in that month
    row = conn.execute("""
        SELECT nav_date, nav FROM fund_nav_history 
        WHERE proj_id = ? AND nav_date LIKE ? AND nav IS NOT NULL AND nav != 'None' AND nav != '' AND nav != '0'
        ORDER BY nav_date ASC LIMIT 1
    """, (proj_id, f"{prefix}%")).fetchone()
    
    if row and row[1]:
        try:
            return row[0], float(row[1])
        except Exception:
            pass
        
    return target_date_str, 10.0 # Fallback

with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)
    
month_cols = header[10:]

funds_to_seed = []
current_broker = 'TTB'

with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        b = row.get('Broker', '').strip()
        if b:
            current_broker = b
        name = row.get('กองทุน', '').strip()
        if not name or name == 'Total':
            continue
            
        target_cost = float(row.get('ต้นทุน', '0') or 0)
        target_units = float(row.get('หน่วยทั้งหมด', '0') or 0)
        avg_cost = float(row.get('ต้นทุนเฉลี่ยต่อหน่วย', '0') or 0)
        
        months = {}
        for m in month_cols:
            val = float(row.get(m, '0') or 0)
            if val > 0:
                months[m] = val
                
        funds_to_seed.append({
            'name': name,
            'broker': current_broker,
            'target_cost': target_cost,
            'target_units': target_units,
            'avg_cost': avg_cost,
            'months': months
        })

target_users = ['user_3M5R1qx9Sis0ImuVmsGGRVDhKCB', 'default_user']
total_inserted = 0
total_skipped = 0

print(f"Beginning Seeding of {len(funds_to_seed)} funds into SQLite...")

for f in funds_to_seed:
    name = f['name']
    meta = fund_meta.get(name)
    if not meta:
        print(f"Warning: No metadata found for {name}")
        continue
        
    proj_id = meta['proj_id']
    fund_abbr = meta['fund_abbr']
    platform = meta['platform']
    default_day = meta['default_day']
    target_units = Decimal(str(f['target_units']))
    target_cost = Decimal(str(f['target_cost']))
    
    # Generate draft transactions for each active month
    tx_drafts = []
    for month_key, amount in f['months'].items():
        year_month = month_key[:7] # YYYY-MM
        target_date_str = f"{year_month}-{default_day:02d}"
        actual_date, nav_val = get_best_nav(proj_id, target_date_str)
        
        amt_dec = Decimal(str(amount))
        nav_dec = Decimal(str(round(nav_val, 4)))
        units_dec = (amt_dec / nav_dec).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        
        tx_drafts.append({
            'date': actual_date,
            'amount': amt_dec,
            'nav': nav_dec,
            'units': units_dec,
            'note': f"DCA {year_month}"
        })
        
    # Reconcile unit sum with exact target_units ground truth
    current_units_sum = sum(t['units'] for t in tx_drafts)
    diff = target_units - current_units_sum
    if diff != Decimal('0') and tx_drafts:
        # Adjust last transaction units so total units match ground truth exactly!
        tx_drafts[-1]['units'] += diff
        # Re-derive unit price for that transaction
        if tx_drafts[-1]['units'] > 0:
            tx_drafts[-1]['nav'] = (tx_drafts[-1]['amount'] / tx_drafts[-1]['units']).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
            
    # Insert for each user
    for user_id in target_users:
        for t in tx_drafts:
            tx_id = str(uuid.uuid4())
            t_units = float(t['units'])
            t_amount = float(t['amount'])
            t_nav = float(t['nav'])
            
            key = compute_idempotency_key(
                user_id, platform, proj_id, fund_abbr, t['date'], 'BUY', t_units, t_amount, t['note']
            )
            
            res = conn.execute("""
                INSERT INTO transactions (
                    id, user_id, idempotency_key, proj_id, fund_abbr, platform, trans_type,
                    trans_date, units, unit_price, total_amount, fee, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, idempotency_key) DO NOTHING
            """, (
                tx_id, user_id, key, proj_id, fund_abbr, platform, 'BUY',
                t['date'], f"{t_units:.4f}", f"{t_nav:.4f}", f"{t_amount:.2f}", "0.00", t['note']
            ))
            
            if res.rowcount > 0:
                total_inserted += 1
            else:
                total_skipped += 1

conn.commit()
print(f"\n[DONE] Seeding Finished!")
print(f"Total Transactions Processed: {total_inserted} inserted, {total_skipped} skipped (due to Idempotent Deduplication).")
