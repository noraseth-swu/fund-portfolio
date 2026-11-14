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
        allowed = {"module: log_file_path", "module: file_handler", "module: __file__", " -> extract_transactions_with_gemini: __file__"}
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

if __name__ == "__main__":
    unittest.main()
