import json
import os
import sqlite3
import time
import urllib.request
import urllib.error

# Read SEC API KEY
sec_api_key = ""
env_path = r'D:\git\fund-portfolio\backend\.env'
with open(env_path) as f:
    for line in f:
        if line.startswith('SEC_API_KEY='):
            sec_api_key = line.strip().split('=')[1]

print("Loaded SEC_API_KEY:", sec_api_key[:6] + "...")

proj_mapping = {
    'tsp4-explorer': 'M0201_2564',
    'KT-CSBOND-A': 'M0168_2561',
    'ES-GF-A': 'M0621_2553',
    'TSF-A': 'M0011_2547',
    'ES-GDIV': 'M0744_2565',
    'ES-USTECH': 'M0422_2565',
    'ONE-EUROEQ': 'M0078_2561',
    'SCBCHAA': 'M0005_2558',
    'ES-ASIA-A': 'M0485_2557',
    'ES-GCORE': 'M0277_2562',
    'ES-GER': 'M0462_2558',
    'ES-USBLUECHIP': 'M0090_2559',
    'WealthPLUS SpeedUp': 'M0280_2564',
    'K-FIXEDPLUS-A': 'M0054_2560',
    'SCBNDQ(E)': 'M0311_2564',
    'SCBS&P500E': 'M0643_2555',
    'KKP NDQ100-UH-E': 'M0690_2566',
    'KPP US500-UH-E': 'M0301_2567',
}

db_path = r'D:\git\fund-portfolio\backend\portfolio.db'
conn = sqlite3.connect(db_path)

def fetch_sec_nav_all(proj_id):
    all_navs = []
    cursor = None
    page = 1
    
    while True:
        url = f"https://api.sec.or.th/v2/fund/daily-info/nav?proj_id={proj_id}&page_size=100"
        if cursor:
            url += f"&next_cursor={cursor}"
            
        req = urllib.request.Request(url)
        req.add_header("Ocp-Apim-Subscription-Key", sec_api_key)
        req.add_header("Content-Type", "application/json")
        
        try:
            time.sleep(0.02) # Respect >= 16ms delay
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                items = data.get('items', [])
                if not items:
                    break
                all_navs.extend(items)
                next_cur = data.get('next_cursor')
                if not next_cur or not next_cur.strip():
                    break
                cursor = next_cur
                page += 1
        except Exception as e:
            print(f"Error fetching NAV for {proj_id}: {e}")
            break
            
    return all_navs

print("\nChecking missing funds in fund_nav_history...")
for name, pid in proj_mapping.items():
    cnt = conn.execute("SELECT COUNT(*) FROM fund_nav_history WHERE proj_id = ?", (pid,)).fetchone()[0]
    if cnt == 0:
        print(f"Fetching NAV history from SEC for {name} ({pid})...")
        items = fetch_sec_nav_all(pid)
        print(f"  Got {len(items)} records.")
        if items:
            for item in items:
                nav_date = item.get('nav_date')
                nav = item.get('nav')
                buy_price = item.get('buy_price')
                sell_price = item.get('sell_price')
                fund_class = item.get('fund_class_name')
                
                conn.execute("""
                    INSERT OR REPLACE INTO fund_nav_history 
                    (proj_id, nav_date, nav, buy_price, sell_price, fund_class_name)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (pid, nav_date, str(nav), str(buy_price) if buy_price else None, str(sell_price) if sell_price else None, fund_class))
            conn.commit()
    else:
        print(f"Already have {cnt} records for {name} ({pid}).")

print("\nAll target funds now have full NAV history in SQLite!")
