import os
import re
import json
import pypdf

def generate_fund_aliases():
    pdf1_path = r'C:/Users/noraseth/.gemini/antigravity/brain/445e1a61-3777-4e43-8f86-49e463c7d225/.user_uploaded/media_1794717529618_896bcd34.pdf'
    pdf2_path = r'C:/Users/noraseth/.gemini/antigravity/brain/445e1a61-3777-4e43-8f86-49e463c7d225/.user_uploaded/media_1794717529564_3f3cd79c.pdf'

    aliases = {}

    if os.path.exists(pdf1_path):
        reader1 = pypdf.PdfReader(pdf1_path)
        # Parse items 1-135
        for page in reader1.pages[:20]:
            text = page.extract_text()
            for line in text.split('\n'):
                if 'ชื่อยอกองทุน' in line:
                    content = line.replace('ชื่อยอกองทุน', '').strip()
                    parts = content.split()
                    if len(parts) >= 2:
                        new_abbr = parts[-1].strip().upper()
                        old_abbr = ' '.join(parts[:-1]).strip().upper()
                        aliases[old_abbr] = new_abbr
                        # Also add normalized version without spaces/dashes
                        old_clean = re.sub(r'[\s\-]+', '', old_abbr)
                        if old_clean and old_clean != old_abbr:
                            aliases[old_clean] = new_abbr

        # Parse items 136-166
        for page in reader1.pages[20:]:
            for line in page.extract_text().split('\n'):
                line = line.strip()
                parts = line.split()
                if len(parts) >= 3 and parts[0].isdigit() and int(parts[0]) >= 136:
                    abbr = parts[-1].strip().upper()
                    # Keep canonical abbr
                    aliases[abbr] = abbr

    # Specific TMB / Eastspring aliases and unit class split
    aliases['TMB50'] = 'ES-SET50-A'
    aliases['TMB-50'] = 'ES-SET50-A'
    aliases['ES-SET50'] = 'ES-SET50-A'
    aliases['TMB50DV'] = 'ES-SET50DV'
    aliases['TMB50RMF'] = 'ES-SET50RMF'

    # Platform & Statement Confirmation Note Aliases
    additional_aliases = {
        # TTB Smart Port
        "TTB-SMART-PORT-1": "tsp1-preserver",
        "TTB SMART PORT 1": "tsp1-preserver",
        "TTB SMART PORT 1 PRESERVER FUND": "tsp1-preserver",
        "TTB-SMART-PORT-2": "tsp2-nurturer",
        "TTB SMART PORT 2": "tsp2-nurturer",
        "TTB SMART PORT 2 NURTURER FUND": "tsp2-nurturer",
        "TTB-SMART-PORT-3": "tsp3-balancer",
        "TTB SMART PORT 3": "tsp3-balancer",
        "TTB SMART PORT 3 BALANCER FUND": "tsp3-balancer",
        "TTB-SMART-PORT-4": "tsp4-explorer",
        "TTB SMART PORT 4": "tsp4-explorer",
        "TTB SMART PORT 4 EXPLORER FUND": "tsp4-explorer",
        "TTB SMART PORT 4 EXPLORER": "tsp4-explorer",
        "TTBSMARTPORT4": "tsp4-explorer",
        "TTB-SMART-PORT-5": "tsp5-gogetter",
        "TTB SMART PORT 5": "tsp5-gogetter",
        "TTB SMART PORT 5 GOGETTER FUND": "tsp5-gogetter",

        # Eastspring confirmation note labels
        "EASTSPRING ASIA ACTIVE EQUITY FUND (ACCUMULATION CLASS)": "ES-ASIA-A",
        "EASTSPRING ASIA ACTIVE EQUITY FUND": "ES-ASIA-A",
        "TMB EASTSPRING ASIA ACTIVE FUND": "ES-ASIA-A",
        "EASTSPRING-AAEF": "ES-ASIA-A",
        "ES-ASIA": "ES-ASIA-A",
        "ES-ASIAEQ": "ES-ASIA-A",
        "EASTSPRING GIS GLOBAL BOND FUND (ACCUMULATION)": "ES-GF-A",
        "EASTSPRING GIS GLOBAL BOND FUND": "ES-GF-A",
        "EASTSPRING-GIS": "ES-GF-A",
        "T-ES-GF": "ES-GF-A",
        "TESGF": "ES-GF-A",
        "ES-GF": "ES-GF-A",
        "ES-GF-A": "ES-GF-A",
        "EASTSPRING GERMAN EQUITY FUND": "ES-GER",
        "EASTSPRING GERMANY EQUITY FUND": "ES-GER",
        "EASTSPRING-GERMAN": "ES-GER",
        "TMB GERMAN EQUITY FUND": "ES-GER",
        "ES-GER": "ES-GER",
        "ES-GERMAN": "ES-GER",
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
        "KTAM CAPITAL SECURITIES FUND - CLASS A": "KT-CSBOND-A",
        "KTAM CAPITAL SECURITIES FUND": "KT-CSBOND-A",

        # TISCO
        "TISCOSTRAT-A": "TSF-A",
        "TISCOSTR-A": "TSF-A",
        "TISCOSTRAT": "TSF-A",
        "TISCOSTR": "TSF-A",
        "TISCO STRATEGIC FUND CLASS A": "TSF-A",
        "TISCO STRATEGIC FUND": "TSF-A",
        "TSF": "TSF-A",
        "TSF-A": "TSF-A",

        # Kasikorn Wealth PLUS rebranding aliases
        "WP-LIGHT": "K-WPLIGHT",
        "WPLIGHT": "K-WPLIGHT",
        "WP-BALANCED": "K-WPBALANCED",
        "WPBALANCED": "K-WPBALANCED",
        "WP-SPARK": "K-WPSPARK",
        "WPSPARK": "K-WPSPARK",
        "WP-SPEEDUP": "K-WPSPEEDUP",
        "WPSPEEDUP": "K-WPSPEEDUP",
        "WP-ULTIMATE": "K-WPULTIMATE",
        "WPULTIMATE": "K-WPULTIMATE",
        "WPBALANCEDRMF": "K-WPBALRMF",
        "WP-BALANCED-RMF": "K-WPBALRMF",
        "WPULTIMATERMF": "K-WPULTIRMF",
        "WP-ULTIMATE-RMF": "K-WPULTIRMF",
        "WPSPEEDRMF": "K-WPSPEEDRMF",
        "WP-SPEED-RMF": "K-WPSPEEDRMF",
        "WPLIGHTRMF": "K-WPLIGHTRMF",
        "WP-LIGHT-RMF": "K-WPLIGHTRMF",

        # ONE AM
        "ONE EUROPEAN EQUITY FUND": "ONE-EUROEQ",
        "ONE-EUROPEAN": "ONE-EUROEQ",
        "ONE-EUROPE": "ONE-EUROPE",

        # SCB
        "SP500E": "SCBS&P500E",
        "SCBSP500E": "SCBS&P500E",
        "SCBS&P500E": "SCBS&P500E",
        "SCBS&P500": "SCBS&P500",
        "SCB S&P 500 INDEX FUND": "SCBS&P500",
        "SCBCHAA": "SCBCHAA",
        "SCBCHA(A)": "SCBCHAA",
        "SCBCHA-A": "SCBCHAA",
        "SCBCHINA(A)": "SCBCHAA",
        "SCBCHINA-A": "SCBCHAA",
        "SCBCHINAA": "SCBCHAA",
        "SCB CHINA A-SHARES FUND (ACCUMULATION)": "SCBCHAA",
        "SCB CHINA A-SHARES FUND": "SCBCHAFUND",
        "SCBCHINA": "SCBCHAFUND",
        "SCBCHA": "SCBCHAA",
        "SCBNDQ(E)": "SCBNDQ(E)",
        "SCB NDQ(E)": "SCBNDQ(E)",
        "SCBNDQE": "SCBNDQ(E)",
        "NDQ(E)": "SCBNDQ(E)",
        "SCBNDQ(A)": "SCBNDQ(A)",
        "SCBNDQA": "SCBNDQ(A)",

        # Dime KKP
        "KKP NDQ100-UH-E": "KKP NDQ100-UH FUND",
        "KKP NDQ100-UH": "KKP NDQ100-UH FUND",
        "KKP US500-UH-E": "KKP US500-UH FUND",
        "KKP US500-UH": "KKP US500-UH FUND",

        # Kasikorn
        "WEALTH PLUS SPEED4B": "K-WPSPEEDUP",
        "WEALTHPLUS SPEEDUP": "K-WPSPEEDUP",
        "K-FIXEDPLUS-A": "K-FIXEDPLUS",
    }

    for k, v in additional_aliases.items():
        aliases[k.upper()] = v
        clean_k = re.sub(r'[\s\-]+', '', k.upper())
        if clean_k and clean_k != k.upper():
            aliases[clean_k] = v

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fund_aliases.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(aliases, f, indent=2, ensure_ascii=False)

    print(f'[✓] Generated fund_aliases.json with {len(aliases)} mapping entries at {out_path}')
    sync_aliases_to_db(aliases)
    return aliases

def sync_aliases_to_db(aliases):
    import sqlite3
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'portfolio.db')
    if not os.path.exists(db_path):
        print(f"[!] Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS fund_aliases (
            alias TEXT PRIMARY KEY,
            proj_id TEXT NOT NULL,
            canonical_abbr TEXT NOT NULL,
            display_name TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_fund_aliases_canonical ON fund_aliases(canonical_abbr)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_fund_aliases_proj_id ON fund_aliases(proj_id)")

    # 1. First add distinct fund classes from fund_nav_history
    c.execute("""
        SELECT DISTINCT nh.proj_id, nh.fund_class_name, f.proj_name_th
        FROM fund_nav_history nh
        JOIN funds f ON nh.proj_id = f.proj_id
        WHERE nh.fund_class_name IS NOT NULL AND nh.fund_class_name != '' AND nh.fund_class_name != 'main'
    """)
    class_rows = c.fetchall()
    inserted_classes = 0
    for proj_id, class_name, name_th in class_rows:
        clean_class = class_name.strip()
        disp = f"{clean_class} - {name_th}" if name_th else clean_class
        c.execute("""
            INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
            VALUES (?, ?, ?, ?)
        """, (clean_class.upper(), proj_id, clean_class, disp))
        
        # Also normalized version without special chars
        norm = re.sub(r'[\s\-()&]+', '', clean_class.upper())
        if norm and norm != clean_class.upper():
            c.execute("""
                INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
                VALUES (?, ?, ?, ?)
            """, (norm, proj_id, clean_class, disp))

        # Generate permutations for class formats:
        # 1. SCBNDQ(E) -> SCBNDQ-E, SCBNDQE
        paren_match = re.match(r'^(.+?)\(([A-Za-z0-9]+)\)$', clean_class)
        if paren_match:
            base, cls = paren_match.groups()
            for var in [f"{base}-{cls}", f"{base}{cls}"]:
                c.execute("""
                    INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
                    VALUES (?, ?, ?, ?)
                """, (var.upper(), proj_id, clean_class, disp))

        # 2. ES-GF-A -> ES-GF(A), ES-GFA
        dash_match = re.match(r'^(.+?)-([A-Za-z0-9]+)$', clean_class)
        if dash_match:
            base, cls = dash_match.groups()
            for var in [f"{base}({cls})", f"{base}{cls}"]:
                c.execute("""
                    INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
                    VALUES (?, ?, ?, ?)
                """, (var.upper(), proj_id, clean_class, disp))

        # 3. SCBCHAA, SCBS&P500A, SCBS&P500E -> SCBCHA(A), SCBCHA-A
        if len(clean_class) > 3 and clean_class[-1] in ['A', 'D', 'E', 'P', 'R'] and not clean_class.endswith('RMF') and not clean_class.endswith('SSF'):
            base = clean_class[:-1]
            cls = clean_class[-1]
            for var in [f"{base}({cls})", f"{base}-{cls}"]:
                c.execute("""
                    INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
                    VALUES (?, ?, ?, ?)
                """, (var.upper(), proj_id, clean_class, disp))

        inserted_classes += 1

    # 2. Add aliases from aliases dict
    inserted_aliases = 0
    for alias_key, canonical in aliases.items():
        # Find proj_id for canonical (first check funds, then fund_nav_history)
        c.execute("SELECT proj_id, proj_name_th FROM funds WHERE UPPER(proj_abbr_name) = ? LIMIT 1", (canonical.upper(),))
        frow = c.fetchone()
        if not frow:
            c.execute("SELECT proj_id, fund_class_name FROM fund_nav_history WHERE UPPER(fund_class_name) = ? LIMIT 1", (canonical.upper(),))
            nrow = c.fetchone()
            if nrow:
                proj_id = nrow[0]
                c.execute("SELECT proj_name_th FROM funds WHERE proj_id = ? LIMIT 1", (proj_id,))
                prow = c.fetchone()
                name_th = prow[0] if prow else canonical
                frow = (proj_id, name_th)

        if frow:
            proj_id, name_th = frow
            disp = f"{canonical} ({alias_key})"
            c.execute("""
                INSERT OR REPLACE INTO fund_aliases (alias, proj_id, canonical_abbr, display_name)
                VALUES (?, ?, ?, ?)
            """, (alias_key.upper(), proj_id, canonical, disp))
            inserted_aliases += 1

    conn.commit()
    conn.close()
    print(f'[✓] Synced fund_aliases table in {db_path} ({inserted_classes} classes, {inserted_aliases} aliases)')

if __name__ == '__main__':
    generate_fund_aliases()
