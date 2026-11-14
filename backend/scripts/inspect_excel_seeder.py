import csv
import json

file_path = r'D:\git\fund-portfolio\backend\data\historical_excel_data.csv'

with open(file_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)
    
print("Header columns:")
for idx, col in enumerate(header):
    print(f"  {idx}: {col}")

month_cols = header[10:]
print(f"\nTotal month columns: {len(month_cols)} from {month_cols[0]} to {month_cols[-1]}")

current_broker = "TTB"
funds_data = []

with open(file_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        broker = row.get('Broker', '').strip()
        if broker:
            current_broker = broker
            
        fund_name = row.get('กองทุน', '').strip()
        if not fund_name or fund_name == 'Total':
            continue
            
        total_cost = float(row.get('ต้นทุน', '0') or 0)
        avg_cost = float(row.get('ต้นทุนเฉลี่ยต่อหน่วย', '0') or 0)
        total_units = float(row.get('หน่วยทั้งหมด', '0') or 0)
        latest_nav = float(row.get('NAV ณ 27/01/26', '0') or 0)
        
        # Monthly amounts
        months = {}
        for m in month_cols:
            val = float(row.get(m, '0') or 0)
            if val > 0:
                months[m] = val
                
        funds_data.append({
            'broker': current_broker,
            'fund_name': fund_name,
            'total_cost': total_cost,
            'avg_cost': avg_cost,
            'total_units': total_units,
            'latest_nav': latest_nav,
            'active_months_count': len(months),
            'sum_monthly_amounts': sum(months.values()),
            'months': months
        })

print(f"\nTotal Funds Parsed: {len(funds_data)}")
total_portfolio_cost = sum(f['total_cost'] for f in funds_data)
total_monthly_sum = sum(f['sum_monthly_amounts'] for f in funds_data)
print(f"Total Invested Capital (from summary column): {total_portfolio_cost:,.2f} THB")
print(f"Total Invested Capital (from sum of monthly DCA): {total_monthly_sum:,.2f} THB")

for f in funds_data:
    diff = abs(f['total_cost'] - f['sum_monthly_amounts'])
    print(f"[{f['broker']}] {f['fund_name']:<25} | Cost: {f['total_cost']:>10,.2f} | Monthly Sum: {f['sum_monthly_amounts']:>10,.2f} | Months: {f['active_months_count']} | Units: {f['total_units']:>10.4f} | AvgCost: {f['avg_cost']:>8.4f} | Diff: {diff:.2f}")
