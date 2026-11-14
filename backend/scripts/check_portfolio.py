import json
import urllib.request

req = urllib.request.Request('http://localhost:8088/api/portfolio')
req.add_header('Authorization', 'Bearer dev_bypass_token')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print('=== Portfolio Summary ===')
    print('Total Cost:        ', f"{float(data.get('total_cost')):>12,.2f}", 'THB')
    print('Market Value:      ', f"{float(data.get('market_value')):>12,.2f}", 'THB')
    print('Unrealized P/L:    ', f"{float(data.get('total_unrealized_pl')):>12,.2f}", 'THB')
    print('Unrealized P/L %:  ', f"{float(data.get('total_unrealized_pl_pct')):>11.2f}%")
    print('Holdings Count:    ', len(data.get('holdings', [])))
    print('\n=== Platforms Breakdown ===')
    for p, v in data.get('platforms', {}).items():
        print(f"  [{p:<5}] Cost: {float(v['total_cost']):>10,.2f} | MktVal: {float(v['market_value']):>10,.2f} | P/L: {float(v['unrealized_pl']):>10,.2f} ({v['unrealized_pl_pct']}%) | Share: {v['allocation_pct']}%")

    print('\n=== Holdings Table ===')
    for h in sorted(data.get('holdings', []), key=lambda x: (x['platform'], x['fund_abbr'])):
        print(f"  [{h['platform']:<5}] {h['fund_abbr']:<22} | Units: {float(h['total_units']):>10.4f} | AvgCost: {float(h['avg_cost']):>8.4f} | NAV: {float(h['current_nav']):>8.4f} | Cost: {float(h['total_cost']):>10,.2f} | MktVal: {float(h['market_value']):>10,.2f} | P/L%: {h['unrealized_pl_pct']}%")
