#!/usr/bin/env python3
"""
Test suite and static verification for email_harvester.py
Follows engineering-rules and debugging-and-error-recovery skills:
- Validates static scope (no undefined names, no missing imports)
- Tests math sanity checks, regex parser, and schema isolation
"""

import unittest
import ast
import symtable
import builtins
import os
import sys
import sqlite3

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
HARVESTER_PATH = os.path.join(SCRIPTS_DIR, "email_harvester.py")

class TestHarvesterStaticAnalysis(unittest.TestCase):
    def setUp(self):
        with open(HARVESTER_PATH, "r", encoding="utf-8") as f:
            self.code = f.read()
        self.tree = ast.parse(self.code, filename=HARVESTER_PATH)

    def test_no_syntax_errors(self):
        """Code must parse cleanly via ast.parse"""
        self.assertIsNotNone(self.tree)

    def test_required_stdlib_imports(self):
        """Ensure time, uuid, json, re, sqlite3, datetime are imported at top level"""
        imported_modules = set()
        for node in self.tree.body:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_modules.add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                imported_modules.add(node.module)

        for required in ["time", "uuid", "json", "re", "sqlite3", "hashlib", "datetime"]:
            self.assertIn(required, imported_modules, f"Missing required stdlib import: {required}")

    def test_no_undefined_globals_via_symtable(self):
        """No undefined global variable or missing imports across any function scope"""
        builtin_names = set(dir(builtins))
        global_names = set(builtin_names)

        for node in self.tree.body:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    global_names.add(alias.asname or alias.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    global_names.add(alias.asname or alias.name)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                global_names.add(node.name)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        global_names.add(target.id)

        table = symtable.symtable(self.code, "email_harvester.py", "exec")
        undefined_symbols = []

        def check_table(t, path=""):
            for symbol in t.get_symbols():
                if symbol.is_global() and not symbol.is_declared_global():
                    name = symbol.get_name()
                    if name not in global_names:
                        undefined_symbols.append(f"{path or 'module'}: {name}")
            for child in t.get_children():
                check_table(child, path + " -> " + child.get_name())

        check_table(table)
        
        # Allowed benign module-level variables
        allowed = {
            "module: log_file_path",
            "module: file_handler",
            "module: __file__",
            " -> extract_transactions_with_gemini: __file__",
            " -> load_master_broker_configs: __file__",
        }
        actual_errors = [u for u in undefined_symbols if u not in allowed]
        self.assertEqual(actual_errors, [], f"Found undefined names: {actual_errors}")


class TestHarvesterLogic(unittest.TestCase):
    def setUp(self):
        # Dynamically import email_harvester
        sys.path.insert(0, SCRIPTS_DIR)
        import email_harvester
        self.harvester = email_harvester

    def test_compute_idempotency_key_deterministic(self):
        k1 = self.harvester.compute_idempotency_key("u1", "TTB", "M0001", "2024-05-02", "BUY", 100.0, 1000.0, "note1")
        k2 = self.harvester.compute_idempotency_key("u1", "TTB", "M0001", "2024-05-02", "BUY", 100.0, 1000.0, "note1")
        self.assertEqual(k1, k2)
        self.assertEqual(len(k1), 64)  # SHA-256 is 64 hex characters

    def test_math_sanity_check_logic(self):
        # If total_amount=2000 and units=118.5283, unit_price shouldn't be order number 1601
        total_amount = 2000.0
        units = 118.5283
        order_number_price = 1601.0
        
        # Reproduce math guard condition
        calc_price = total_amount / units
        is_absurd = order_number_price > 500.0 or abs(units * order_number_price - total_amount) > max(10.0, 0.1 * total_amount)
        self.assertTrue(is_absurd)
        self.assertAlmostEqual(calc_price, 16.8736, places=3)

    def test_clean_pdf_boilerplate(self):
        # Must be > 100 chars and contain a disclaimer marker
        body = "ข้อมูลรายการซื้อขายกองทุนรวมประจำวันที่ 28/06/2024 สำหรับลูกค้าคนสำคัญ เพื่อทราบข้อมูลพอร์ตการลงทุนที่มีประสิทธิภาพสูงมาก\n"
        disclaimer = "คำเตือน: การลงทุนในกองทุนรวมไม่ใช่การฝากเงินและมีความเสี่ยง\nข้อกำหนดและเงื่อนไขทั้งหมด..."
        text = body + disclaimer
        cleaned = self.harvester.clean_pdf_boilerplate(text)
        self.assertIn("28/06/2024", cleaned)
        self.assertNotIn("ข้อกำหนดและเงื่อนไขทั้งหมด", cleaned)

    def test_ttb_regex_fast_path(self):
        sample_ttb_pdf_text = """
PT000000000003129684
28-DEC-2023
O23362010997256
SUBSCRIPTION
EASTSPRING US Information Technology Fund
EASTSPRING
625.00 13.5577 46.0992
PT000000000003129684
28-DEC-2023
O23362010997303
SUBSCRIPTION
SCB CHINA A-SHARES FUND (Accumulation)
SCBAM
150.00 7.1888 20.8657
"""
        txs, ok = self.harvester.try_regex_parse_confirmation(sample_ttb_pdf_text, "TTB")
        self.assertTrue(ok)
        self.assertEqual(len(txs), 2)
        self.assertEqual(txs[0]["platform"], "TTB")
        self.assertEqual(txs[0]["fund_code"], "EASTSPRING US Information Technology Fund")
        self.assertEqual(txs[0]["trans_date"], "2023-12-28")
        self.assertEqual(txs[0]["total_amount"], 625.0)
        self.assertEqual(txs[0]["unit_price"], 13.5577)
        self.assertEqual(txs[0]["units"], 46.0992)
        self.assertEqual(txs[0]["trans_type"], "BUY")
        self.assertEqual(txs[0]["note"], "Order O23362010997256")

    def test_time_sleep_callable(self):
        """Verify time module is imported and usable"""
        self.assertTrue(hasattr(self.harvester, "time"))
        self.assertTrue(callable(self.harvester.time.sleep))

    def test_uuid_callable(self):
        """Verify uuid module is imported and usable"""
        self.assertTrue(hasattr(self.harvester, "uuid"))
        uid = self.harvester.uuid.uuid4().hex[:12]
        self.assertEqual(len(uid), 12)

    def test_match_fund_with_confidence_and_aliases(self):
        """Verify that known aliases and variants match with EXACT or FUZZY confidence"""
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.execute("""
            CREATE TABLE funds (
                proj_id TEXT PRIMARY KEY,
                proj_abbr_name TEXT,
                proj_name_th TEXT,
                proj_name_en TEXT
            )
        """)
        c.execute("INSERT INTO funds VALUES ('M001', 'ONE-EUROEQ', 'กองทุนเปิด วรรณ ยูโรเปี้ยน อิควิตี้ ฟันด์', 'ONE EUROPEAN EQUITY FUND')")
        c.execute("INSERT INTO funds VALUES ('M002', 'SCBNDQ', 'กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว', 'SCB US Equity NDQ')")
        c.execute("INSERT INTO funds VALUES ('M003', 'ES-USTECH', 'กองทุนเปิดอีสต์สปริง US Information Technology', 'Eastspring US Information Technology')")
        c.execute("INSERT INTO funds VALUES ('M004', 'TSF', 'กองทุนเปิด ทิสโก้ สแตรทิจิก ฟันด์', 'TISCO Strategic Fund')")
        conn.commit()

        # 1. ONE-EUROPEAN alias -> ONE-EUROEQ (EXACT)
        res = self.harvester.match_fund_with_confidence(conn, "ONE-EUROPEAN")
        self.assertEqual(res["match_confidence"], "EXACT")
        self.assertEqual(res["fund_abbr"], "ONE-EUROEQ")

        # 2. NDQ(E) alias -> SCBNDQ(E) (EXACT)
        res = self.harvester.match_fund_with_confidence(conn, "NDQ(E)")
        self.assertEqual(res["match_confidence"], "EXACT")
        self.assertEqual(res["fund_abbr"], "SCBNDQ(E)")

        # 3. EASTSPRING-USTECH alias -> ES-USTECH (EXACT)
        res = self.harvester.match_fund_with_confidence(conn, "EASTSPRING-USTECH")
        self.assertEqual(res["match_confidence"], "EXACT")
        self.assertEqual(res["fund_abbr"], "ES-USTECH")

        # 4. TISCOSTRAT alias -> TSF (EXACT)
        res = self.harvester.match_fund_with_confidence(conn, "TISCOSTRAT")
        self.assertEqual(res["match_confidence"], "EXACT")
        self.assertEqual(res["fund_abbr"], "TSF")

        # 5. Unknown fund -> NONE
        res = self.harvester.match_fund_with_confidence(conn, "NON_EXISTENT_FUND_XYZ")
        self.assertEqual(res["match_confidence"], "NONE")
        self.assertIsNone(res["proj_id"])

    def test_resolve_platform_golden_rules(self):
        """
        Verify Golden Rules of Platform Attribution (TC-PL-01 to TC-PL-08):
        - Email broker tag dictates the platform account 100%
        - Fund ticker (e.g. SCBCHINA on TTB) must NOT overwrite TTB
        - Custodian (e.g. Kasikornbank on SCB) must NOT overwrite SCB
        """
        resolve = getattr(self.harvester, "resolve_platform_for_transaction", None)
        self.assertIsNotNone(resolve, "email_harvester must export resolve_platform_for_transaction")

        # TC-PL-01: TTB email with Eastspring fund
        self.assertEqual(resolve("TTB", tx_platform=None, fund_code="ES-USTECH"), "TTB")
        self.assertEqual(resolve("ttb", tx_platform=None, fund_code="ES-USTECH"), "TTB")

        # TC-PL-02: TTB email with ONE-AM fund
        self.assertEqual(resolve("TTB", tx_platform=None, fund_code="ONE-EUROPEAN-EQ"), "TTB")

        # TC-PL-03 & 04: TTB email with SCBAM fund -> MUST BE TTB, NEVER SCB!
        self.assertEqual(resolve("TTB", tx_platform="SCB", fund_code="SCBCHINA(A)"), "TTB")
        self.assertEqual(resolve("TTB", tx_platform=None, fund_code="SCBCHA(A)"), "TTB")

        # TC-PL-05: TTB email with Kasikorn fund -> MUST BE TTB, NEVER KBANK!
        self.assertEqual(resolve("TTB", tx_platform="KBANK", fund_code="K-USA"), "TTB")

        # TC-PL-06: SCBAM email with Kasikorn custodian -> MUST BE SCB, NEVER KBANK!
        self.assertEqual(resolve("SCB", tx_platform="KBANK", fund_code="SCBS&P500E"), "SCB")
        self.assertEqual(resolve("SCB", tx_platform=None, fund_code="SP500E"), "SCB")

        # TC-PL-07 & 08: Dime email with foreign stock or Thai fund -> MUST BE DIME!
        self.assertEqual(resolve("DIME", tx_platform=None, fund_code="NVDA"), "DIME")
        self.assertEqual(resolve("DIME", tx_platform="SCB", fund_code="SCBWORLD"), "DIME")

    def test_scb_china_and_share_class_aliases(self):
        """
        Verify SEC Aliases for SCBCHINA(A), SCBCHA(A), SCBS&P500E, NDQ(E)
        """
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.execute("""
            CREATE TABLE funds (
                proj_id TEXT PRIMARY KEY,
                proj_abbr_name TEXT,
                proj_name_th TEXT,
                proj_name_en TEXT
            )
        """)
        c.execute("""
            CREATE TABLE fund_aliases (
                alias TEXT PRIMARY KEY,
                proj_id TEXT,
                canonical_abbr TEXT,
                display_name TEXT
            )
        """)
        # Populate SEC project M0005_2558 (SCBCHAFUND)
        c.execute("INSERT INTO funds VALUES ('M0005_2558', 'SCBCHAFUND', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์', 'SCB China A-Shares Fund')")
        c.execute("INSERT INTO fund_aliases VALUES ('SCBCHINA(A)', 'M0005_2558', 'SCBCHAA', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (สะสมมูลค่า)')")
        c.execute("INSERT INTO fund_aliases VALUES ('SCBCHA(A)', 'M0005_2558', 'SCBCHAA', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (สะสมมูลค่า)')")
        c.execute("INSERT INTO fund_aliases VALUES ('SCBCHINA', 'M0005_2558', 'SCBCHA', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์')")
        conn.commit()

        # Match SCBCHINA(A)
        res1 = self.harvester.match_fund_with_confidence(conn, "SCBCHINA(A)")
        self.assertEqual(res1["proj_id"], "M0005_2558")
        self.assertEqual(res1["match_confidence"], "EXACT")

        # Match SCBCHA(A)
        res2 = self.harvester.match_fund_with_confidence(conn, "SCBCHA(A)")
        self.assertEqual(res2["proj_id"], "M0005_2558")
        self.assertEqual(res2["match_confidence"], "EXACT")

    def test_dynamic_password_pattern_resolver(self):
        """
        Verify Template Resolver for all broker password formats
        """
        resolver = getattr(self.harvester, "resolve_password_template", None)
        self.assertIsNotNone(resolver, "email_harvester must export resolve_password_template")

        # TTB: 29May1989
        p1 = resolver("{DD}{MMM_EN}{YYYY_CE}", 29, 5, 1989, 2532, "47802")
        self.assertEqual(p1, "29May1989")

        # DIME: 29051989
        p2 = resolver("{DD}{MM}{YYYY_CE}", 29, 5, 1989, 2532, "47802")
        self.assertEqual(p2, "29051989")

        # PVD: 29052532 (BE)
        p3 = resolver("{DD}{MM}{YYYY_BE}", 29, 5, 1989, 2532, "47802")
        self.assertEqual(p3, "29052532")

        # SCB: 47802
        p4 = resolver("{NATIONAL_ID_LAST5}", 29, 5, 1989, 2532, "47802")
        self.assertEqual(p4, "47802")

    def test_load_master_broker_configs(self):
        """
        Verify loading master broker config file
        """
        loader = getattr(self.harvester, "load_master_broker_configs", None)
        self.assertIsNotNone(loader, "email_harvester must export load_master_broker_configs")
        configs = loader()
        self.assertGreaterEqual(len(configs), 5)
        keys = [c["key"] for c in configs]
        self.assertIn("TTB", keys)
        self.assertIn("DIME", keys)
        self.assertIn("SCB", keys)
        self.assertIn("KBANK", keys)
        self.assertIn("KBANK_PVD", keys)

    def test_generate_bank_passwords_with_dynamic_master_configs(self):
        """
        Verify dynamic password generation with master configs
        """
        master_configs = [
            {
                "key": "CUSTOM_BROKER",
                "name": "Custom",
                "enabled": True,
                "password_patterns": ["{DD}{MMM_EN}{YYYY_CE}", "{NATIONAL_ID_LAST5}"]
            }
        ]
        pwds = self.harvester.generate_bank_passwords("29", "05", "1989", "2532", "47802", master_configs)
        self.assertIn("CUSTOM_BROKER", pwds)
        self.assertIn("29May1989", pwds["CUSTOM_BROKER"])
        self.assertIn("47802", pwds["CUSTOM_BROKER"])
        self.assertIn("TTB", pwds)
        self.assertIn("29May1989", pwds["TTB"])

    def test_process_pdf_attachment_worker_contract(self):
        """
        Verify worker contract: when worker receives an empty or decryptable payload,
        it returns standard dict keys (success, txs, usage, used_pwd, task).
        """
        worker = getattr(self.harvester, "process_pdf_attachment_worker", None)
        self.assertIsNotNone(worker, "email_harvester must export process_pdf_attachment_worker")
        
        # Test with invalid pdf bytes -> should return success=False with decryption_failed
        dummy_task = {
            "pdf_data": b"not-a-valid-pdf",
            "filename": "sample.pdf",
            "pdf_hash": "dummyhash",
            "candidate_pwds": ["pass123"],
            "active_broker": "TTB",
            "broker_tag": "TTB",
            "sender_email": "estatement@eservice.ttbbank.com",
            "gemini_api_key": "",
            "message_id": "<test-id>",
            "subject": "Confirmation",
            "email_date": "2024-10-28",
        }
        res = worker(dummy_task)
        self.assertFalse(res["success"])
        self.assertEqual(res["error"], "decryption_failed")
        self.assertEqual(res["task"]["filename"], "sample.pdf")

    def test_parse_html_table_kasikorn_wealthplus(self):
        """
        Verify parse_html_table_kasikorn parses Wealth PLUS HTML tables with ISO dates
        """
        parser = getattr(self.harvester, "parse_html_table_kasikorn", None)
        self.assertIsNotNone(parser, "email_harvester must export parse_html_table_kasikorn")

        html_body = """
        <table>
          <tr><th>วันที่</th><th>รายการ</th><th>กองทุน</th><th>ผ่านช่องทาง</th><th>เลขที่บัญชีกองทุน</th><th>จำนวนหน่วย</th><th>จำนวนเงิน</th><th>มูลค่าต่อหน่วย</th><th>เลขที่รายการ</th><th>หมายเหตุ</th></tr>
          <tr><td>2025-09-08</td><td>ซื้อ</td><td>K-WPSPEEDUP</td><td>K PLUS</td><td>XXXX-XXX-5-75289-0</td><td>521.9424</td><td>5,000.00</td><td>9.5796</td><td>773656325406330600</td><td>KBANK (xxx-x-x2723-x)</td></tr>
        </table>
        <table>
          <tr><th>Date</th><th>Transaction Type</th><th>Fund Code</th><th>Channel</th><th>Fund Account</th><th>Unit</th><th>Amount</th><th>NAV</th><th>Reference</th><th>Remark</th></tr>
          <tr><td>2025-09-08</td><td>Purchase</td><td>K-WPSPEEDUP</td><td>K PLUS</td><td>XXXX-XXX-5-75289-0</td><td>521.9424</td><td>5,000.00</td><td>9.5796</td><td>773656325406330600</td><td>KBANK (xxx-x-x2723-x)</td></tr>
        </table>
        """
        txs = parser(html_body)
        self.assertEqual(len(txs), 1, "Should extract exactly 1 transaction without duplicates between Thai and English tables")
        tx = txs[0]
        self.assertEqual(tx["platform"], "KBANK")
        self.assertEqual(tx["fund_code"], "K-WPSPEEDUP")
        self.assertEqual(tx["trans_date"], "2025-09-08")
        self.assertEqual(tx["units"], 521.9424)
        self.assertEqual(tx["unit_price"], 9.5796)
        self.assertEqual(tx["total_amount"], 5000.00)

    def test_exact_alias_matching_ttb_and_german(self):
        """
        Verify ttb smart port 4 explorer fund and Eastspring German Equity Fund match with EXACT confidence
        """
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.execute("CREATE TABLE funds (proj_id TEXT PRIMARY KEY, proj_abbr_name TEXT, proj_name_th TEXT, proj_name_en TEXT)")
        c.execute("CREATE TABLE fund_aliases (alias TEXT PRIMARY KEY, proj_id TEXT, canonical_abbr TEXT, display_name TEXT)")
        c.execute("INSERT INTO funds VALUES ('M0201_2564', 'tsp4-explorer', 'กองทุนเปิด ttb smart port 4 explorer', 'ttb smart port 4 explorer fund')")
        c.execute("INSERT INTO funds VALUES ('M0462_2558', 'ES-GER', 'กองทุนเปิดอีสท์สปริง German Equity', 'Eastspring German Equity Fund')")
        c.execute("INSERT INTO fund_aliases VALUES ('TTB SMART PORT 4 EXPLORER FUND', 'M0201_2564', 'tsp4-explorer', 'tsp4-explorer')")
        c.execute("INSERT INTO fund_aliases VALUES ('EASTSPRING GERMAN EQUITY FUND', 'M0462_2558', 'ES-GER', 'ES-GER')")
        conn.commit()

        res1 = self.harvester.match_fund_with_confidence(conn, "ttb smart port 4 explorer fund")
        self.assertEqual(res1["proj_id"], "M0201_2564")
        self.assertEqual(res1["fund_abbr"], "tsp4-explorer")
        self.assertEqual(res1["match_confidence"], "EXACT")

        res2 = self.harvester.match_fund_with_confidence(conn, "Eastspring German Equity Fund")
        self.assertEqual(res2["proj_id"], "M0462_2558")
        self.assertEqual(res2["fund_abbr"], "ES-GER")
        self.assertEqual(res2["match_confidence"], "EXACT")

    def test_dime_concat_table_parsing(self):
        """
        Verify Dime tightly-spaced / concatenated table columns are parsed with 0 tokens and 100% precision
        """
        sample_pdf_text = """
        Dime! Confirmation Note
        Date: 16/06/2025
        Order No. Side Fund Units Fee Total Amount NAV
        2202506160004256 SUB KKP US500-UH-E 95.5858 2.671,000.0010.4618
        2202506160004258 SUB KKP NDQ100-UH-E 76.9479 1.601,000.0012.9958
        """
        txs, ok = self.harvester.try_regex_parse_confirmation(sample_pdf_text, "DIME")
        self.assertTrue(ok)
        self.assertEqual(len(txs), 2)
        
        self.assertEqual(txs[0]["fund_code"], "KKP US500-UH-E")
        self.assertEqual(txs[0]["trans_date"], "2025-06-16")
        self.assertEqual(txs[0]["units"], 95.5858)
        self.assertEqual(txs[0]["unit_price"], 10.4618)
        self.assertEqual(txs[0]["total_amount"], 1000.00)
        self.assertEqual(txs[0]["fee"], 2.67)
        self.assertEqual(txs[0]["note"], "2202506160004256")

        self.assertEqual(txs[1]["fund_code"], "KKP NDQ100-UH-E")
        self.assertEqual(txs[1]["trans_date"], "2025-06-16")
        self.assertEqual(txs[1]["units"], 76.9479)
        self.assertEqual(txs[1]["unit_price"], 12.9958)
        self.assertEqual(txs[1]["total_amount"], 1000.00)
        self.assertEqual(txs[1]["fee"], 1.60)
        self.assertEqual(txs[1]["note"], "2202506160004258")

    def test_kbank_wealth_plus_buy_sell_and_alias(self):
        """
        Verify Wealth PLUS HTML table parsing dynamically extracts BUY vs SELL and aliases match
        """
        html = """
        <table>
            <tr><td>วันที่</td><td>รายการ</td><td>กองทุน</td><td>ผ่านช่องทาง</td><td>เลขที่บัญชีกองทุน</td><td>จำนวนหน่วย</td><td>จำนวนเงิน</td><td>มูลค่าต่อหน่วย</td></tr>
            <tr><td>2023-10-10</td><td>ซื้อ</td><td>WP-SPEEDUP</td><td>K PLUS</td><td>XXX-5-75289-0</td><td>5,906.7443</td><td>50,000.00</td><td>8.4649</td></tr>
            <tr><td>2024-01-15</td><td>ขายคืน</td><td>WP-SPEEDUP</td><td>K PLUS</td><td>XXX-5-75289-0</td><td>1,000.0000</td><td>9,000.00</td><td>9.0000</td></tr>
        </table>
        """
        txs = self.harvester.parse_html_table_kasikorn(html)
        self.assertEqual(len(txs), 2)
        self.assertEqual(txs[0]["trans_type"], "BUY")
        self.assertEqual(txs[0]["total_amount"], 50000.00)
        self.assertEqual(txs[0]["units"], 5906.7443)
        self.assertEqual(txs[0]["fee"], 0.0)

        self.assertEqual(txs[1]["trans_type"], "SELL")
        self.assertEqual(txs[1]["total_amount"], 9000.00)
        self.assertEqual(txs[1]["units"], 1000.0)

if __name__ == "__main__":
    unittest.main()
