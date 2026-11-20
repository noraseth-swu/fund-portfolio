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

    # 2. Dynamically derive aliases from official SEC database records (funds and fund_nav_history)
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'portfolio.db')
    if os.path.exists(db_path):
        import sqlite3
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        
        # Populate aliases from funds table (SEC master catalog)
        try:
            c.execute("SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en FROM funds")
            for pid, abbr, name_th, name_en in c.fetchall():
                if abbr:
                    clean_abbr = abbr.strip().upper()
                    aliases[clean_abbr] = clean_abbr
                    norm = re.sub(r'[\s\-()&]+', '', clean_abbr)
                    if norm and norm != clean_abbr:
                        aliases[norm] = clean_abbr
                if name_en:
                    # Normalized English name alias without boilerplate
                    cleaned_en = re.sub(r'\b(FUND|FUNDS|OPEN|ENDED|MUTUAL)\b', '', name_en.upper()).strip()
                    cleaned_en = re.sub(r'\s+', ' ', cleaned_en)
                    if cleaned_en and abbr:
                        aliases[cleaned_en] = abbr.strip().upper()
        except sqlite3.OperationalError:
            pass

        # Populate aliases from fund_nav_history (distinct SEC registered share classes)
        try:
            c.execute("""
                SELECT DISTINCT nh.proj_id, nh.fund_class_name, f.proj_abbr_name 
                FROM fund_nav_history nh
                JOIN funds f ON nh.proj_id = f.proj_id
                WHERE nh.fund_class_name IS NOT NULL AND nh.fund_class_name != '' AND nh.fund_class_name != 'main'
            """)
            for pid, class_name, proj_abbr in c.fetchall():
                clean_class = class_name.strip().upper()
                aliases[clean_class] = clean_class
                norm = re.sub(r'[\s\-()&]+', '', clean_class)
                if norm and norm != clean_class:
                    aliases[norm] = clean_class
        except sqlite3.OperationalError:
            pass

        conn.close()

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fund_aliases.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(aliases, f, indent=2, ensure_ascii=False)

    print(f'[✓] Generated fund_aliases.json strictly from SEC DB & PDF records ({len(aliases)} entries) at {out_path}')
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
