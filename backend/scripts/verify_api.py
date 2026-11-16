import urllib.request
import json

req = urllib.request.Request('http://localhost:8088/api/portfolio')
req.add_header('x-user-id', 'user_3M5R1qx9Sis0ImuVmsGGRVDhKCB')

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    for h in data['holdings']:
        code = h.get('fund_abbr')
        if code in ['SCBS&P500E', 'ES-ASIA-A', 'ES-GF', 'KT-CSBOND-A', 'K-WPSPEEDUP']:
            u = float(h['total_units'])
            ac = float(h['avg_cost'])
            c = float(h['total_cost'])
            cn = float(h['current_nav'])
            mv = float(h['market_value'])
            pl = float(h['unrealized_pl'])
            plp = float(h['unrealized_pl_pct'])
            dt = h['nav_date']
            print(f"{code:12} ({h['platform']:4}) | units={u:>10.4f} | avg={ac:>7.4f} | cost={c:>9.2f} | nav={cn:>7.4f} | val={mv:>9.2f} | P/L={pl:>9.2f} ({plp:>+6.2f}%) | date={dt}")
