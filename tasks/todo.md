# Implementation Tasks & Status

> **Strategic Project Roadmap:** See [tasks/roadmap.md](file:///d:/git/fund-portfolio/tasks/roadmap.md) for long-term vision and Phase 3–5 milestone breakdown.

## Slice 22: SCB Confirmation Notes Brokerage Fee Extraction & DCA Missing Dates Reconciliation
- [x] 22.1 Comprehensive SCB IMAP Audit across 120 Emails: Audited all emails from `Registrar2@email.scb.co.th`, `registrar2@scb.co.th`, and `fundclick.scbam@scb.co.th`. Found exactly 40 transaction confirmation PDFs (73 transactions), 3 semi-annual statements, 16 purchase confirmation notifications, and 17 failed order notifications.
- [x] 22.2 Root-Cause Identification for "ดูเหมือนจะหายไปหลายวัน":
  - Identified 17 failed DCA auto-debit notices from SCBAM ("รายการซื้อกองทุนไม่สำเร็จ เนื่องจากระบบไม่สามารถหักบัญชีได้") covering all seemingly missing regular DCA dates (e.g. 16 Jun 2025, 16 Jul 2025, 29 Jul 2025, 14 Oct 2025, 16 Dec 2025, 17 Feb 2026, 16 Mar 2026, 16 Jun 2026, 17 Aug 2026, 16 Sep 2026, 19 Oct 2026).
  - Identified delivery delay by SCBAM: The 16/01/2026 confirmation statement was emailed on 08/02/2026 (~3 weeks late).
  - Confirmed `2026-01-16` already exists in `transactions` (both `SCBS&P500E` 24.6504 units @ 40.5673 and `SCBNDQ(E)` 66.7049 units @ 14.9914).
- [x] 22.3 SCB Brokerage Fee Extraction & Parser Engine:
  - Added dedicated zero-token fast-path regex parser for SCB Statement of Holding in `email_harvester.py` extracting `ค่าใช้จ่ายในการซื้อขายหลักทรัพย์ (Brokerage Fee)`.
  - Updated Gemini fallback prompt in `email_harvester.py` with explicit SCB brokerage fee guidelines.
  - Added `registrar2@scb.co.th` to `email_sync_brokers.json` and cleaned up `subject_excludes`.
- [x] 22.4 Database Remediation for All 73 SCB Transactions:
  - Extracted ground-truth fees directly from all 40 decrypted statement PDFs: 0.45 THB for regular 1,000 THB purchases up to Sep 2026, 4.47-4.51 THB for initial 10,000 THB purchases on 09/04/2025, and 0.30 THB following SCBAM fee reduction in Oct 2026.
  - Updated `fee` in both `transactions` and `pending_transactions` across all 73 rows.
- [x] 22.5 Full Verification: `cargo test` (13 passed), `npm test` (34 passed), `npm run build` (clean), `python test_harvester.py` (20 passed).
## Slice 1: Backend Fund Alias & Share Class Resolution
- [x] 1.1 Update `insert_pending_transactions_batch` in `backend/src/db/repository.rs` to match via `fund_aliases` first
- [x] 1.2 Update `get_latest_nav_map` in `backend/src/db/repository.rs` to preserve unitholder class `fund_abbr`
- [x] 1.3 Update position tracking key in `backend/src/domain/engine.rs` to support distinct fund classes
- [x] 1.4 Update `match_fund_with_confidence` in `backend/scripts/email_harvester.py` to query `fund_aliases` table
- [x] 1.5 Run Rust unit tests to verify fund alias matching and engine calculations (10/10 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 2: Platform Attribution Integrity (Issuer vs Custodian)
- [x] 2.1 Update `parse_statement` system instructions in `backend/src/api/handlers.rs` for SCBAM vs KBank custodian
- [x] 2.2 Update `email_harvester.py` platform detection logic to check AMC issuer before supervisor
- [x] 2.3 Verify with test script simulating statement with SCBAM issuer and KBank custodian## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 3: Frontend Staged Review UX Polish
- [x] 3.1 Add platform inline dropdown in `TransactionReviewModal.tsx` for manual platform overriding
- [x] 3.2 Verify `FundSearchCombobox.tsx` dropdown z-index and `SCBS&P500E` selection
- [x] 3.3 Run Vitest tests for `TransactionReviewModal.test.tsx` (3/3 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 4: Holdings Table Responsive Polish & Column Drag & Drop
- [x] 4.1 Confirm `HoldingsTable.tsx` column reordering and user-specific persistence (`fund_portfolio_holdings_col_order_${userId}`)
- [x] 4.2 Verify container responsive sizing on desktop and mobile viewports (`max-w-[1720px] 2xl:max-w-[1840px]`)
- [x] 4.3 Run Vitest tests for `HoldingsTable.test.tsx` (4/4 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 5: Quality Review, Code Simplification & Verification
- [x] 5.1 Security check: verify all SQL queries use parameterized arguments (100% parameter bound)
- [x] 5.2 Code cleanup: eliminate redundant code, dead variables, and unused imports
- [x] 5.3 Run full test suites: `cargo test` in backend (10 passed), `npm test -- --run` in frontend (27 passed), `npm run build` in frontend (passed cleanly)
- [x] 5.4 Restart backend server daemon and verify end-to-end functionality## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 6: Email Sync Performance & Cache/Resync Management
- [x] 6.1 Fast IMAP Header Pre-Check in `backend/scripts/email_harvester.py` (fetching header-only to skip 420 emails in 1s instead of downloading MBs)
- [x] 6.2 Backend Sync Cache APIs in `handlers.rs` and `repository.rs` (`/api/email/sync/cache/stats`, `reset`, `list`, `delete`)
- [x] 6.3 Frontend Cache Manager Component `SyncCacheManagerModal.tsx` with Reset options and individual email deletion table
- [x] 6.4 Integrated Cache Manager button into `EmailSyncModal.tsx` and `SettingsModal.tsx`
- [x] 6.5 Full verification: `cargo test` (10/10), `npm test -- --run` (27/27), `npm run build` (clean)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 7: Bilingual High-Contrast Live Log & User-Friendly Formatter
- [x] 7.1 Wait for active background harvester sync to complete (`GET /api/email/sync/status` -> `is_running: false`)
- [x] 7.2 Add bilingual log dictionary keys to `frontend/src/lib/i18n.tsx` for both `th` and `en`
- [x] 7.3 Implement pure transformation utility in `frontend/src/lib/logFormatter.ts` (`formatLiveLog(rawLog, locale)`)
- [x] 7.4 Add unit tests in `frontend/src/test/logFormatter.test.ts` covering Thai and English patterns (6/6 passed)
- [x] 7.5 Update `frontend/src/components/EmailSyncModal.tsx`:
  - [x] Add View Mode toggle: `[ ✨ สรุปเข้าใจง่าย (User-Friendly) ]` (default) vs `[ 💻 ข้อความดิบ (Raw Log) ]`
  - [x] Restyle live log container to always-dark high-contrast terminal (`bg-slate-950 border-slate-800 ring-1 ring-slate-800/80`)
  - [x] Render formatted logs with color-coded badges, platform tags, and high-contrast timestamps
  - [x] Ensure `backend/email_sync.log` remains 100% untouched raw format
- [x] 7.6 Run Vitest (`npm test -- --run`) and production build (`npm run build`) to verify zero regressions (33 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 8: High-Throughput Parallel Email Sync & Multi-Worker AI Parsing (Tier 1 Scaling)
- [x] 8.1 Refactor PDF statement processing in `backend/scripts/email_harvester.py` into a Producer-Consumer pipeline:
  - Producer: Single IMAP connection fetches messages and pushes unparsed PDF bytes to processing queue
  - Consumer Pool: `ThreadPoolExecutor(max_workers=5)` decrypts and invokes `parse_pdf_with_gemini_vision` concurrently
- [x] 8.2 Maintain SQLite thread safety by processing `as_completed(futures)` on the main database writer thread
- [x] 8.3 Add CLI flag `--concurrency <num>` (default: 5) to control worker pool size
- [x] 8.4 Test parallel harvest with `test_harvester.py` and verify speedup and error-handling (16/16 passed)
- [x] 8.5 Verify zero SQLite concurrency locks (`database is locked`) during high-volume sync## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 9: Master Broker Config & Dynamic Harvester Engine
- [x] 9.1 Create default master config definition file `backend/config/email_sync_brokers.json` with existing broker rules
- [x] 9.2 Add `email_broker_configs` table in SQLite with database migration and auto-seeding in `repository.rs`
- [x] 9.3 Implement Dynamic Password Pattern Resolver in `email_harvester.py` supporting `{DD}`, `{MM}`, `{MMM_EN}`, `{YYYY_CE}`, `{YYYY_BE}`, `{NATIONAL_ID_LAST5}`, `{CUSTOM_PWD}`
- [x] 9.4 Refactor `email_harvester.py` main loop to load active brokers from database/config instead of hardcoded tuples
- [x] 9.5 Implement backend endpoints in `backend/src/api/handlers.rs`: `GET /api/email/sync/brokers`, `PUT /api/email/sync/brokers`, `POST /api/email/sync/brokers/reset`
- [x] 9.6 Build UI in `frontend/src/components/SettingsModal.tsx` to enable/disable brokers, edit sender emails, and configure password patterns
- [x] 9.7 Write unit tests in `test_harvester.py` verifying template resolution and config overrides (16/16 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 10: Robust Platform Attribution (Selling Agent vs Fund AMC) & Fund Class Aliasing
- [x] 10.1 Fix Case-Sensitivity bug in `backend/scripts/email_harvester.py`: Use `b_tag_upper = broker_tag.upper()` to strictly match `TTB`, `DIME`, `SCB`, `KBANK`
- [x] 10.2 Enforce Golden Rule: Email sender/broker dictates the transaction platform channel 100%; eliminate fragile ticker prefix platform overrides (`if fcode.startswith("SCB")...`)
- [x] 10.3 Insert precise SEC class aliases in `fund_aliases`:
  - `SCBCHINA(A)` ➔ `M0005_2558` (Canonical: `SCBCHAA`)
  - `SCBCHA(A)`   ➔ `M0005_2558` (Canonical: `SCBCHAA`)
  - `SCBS&P500E`  ➔ `M0643_2555` (Canonical: `SCBS&P500E`)
  - `NDQ(E)`      ➔ `M0266_2564` (Canonical: `SCBNDQ(E)`)
- [x] 10.4 Update `get_latest_nav_map` in `backend/src/db/repository.rs` to query NAV by `(proj_id, fund_class_name)` directly to prevent share-class NAV mismatch
- [x] 10.5 Add one-time database remediation script for `pending_transactions`:
  - Set `platform = 'TTB'` for all 425 items where `source_file LIKE '%ttb%' OR source_email LIKE '%ttb%'`
  - Set `proj_id = 'M0005_2558'` and `fund_abbr = 'SCBCHA(A)'` for the `SCBCHINA(A)` / `SCBCHA(A)` items
- [x] 10.6 Write comprehensive test cases in `backend/scripts/test_harvester.py` covering scenarios (14/14 passed)
- [x] 10.7 Full regression verification: `cargo test` in backend (11 passed), `python test_harvester.py` (14 passed), and `npm test -- --run` in frontend (33 passed)## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 11: Master Rule — SEC Data Model Migration & Class-Accurate NAV Engine
- [x] 11.1 Document SEC Master Rules in `tasks/sec_master_rule.md` (Accuracy First Axiom, Composite Key Architecture, 3-Tier Lookup)
- [x] 11.2 Database Schema Migration in `backend/src/db/mod.rs`: Migrate `fund_nav_history` primary key from `(proj_id, nav_date)` to `(proj_id, nav_date, fund_class_name)`
- [x] 11.3 Update `save_nav_history` in `backend/src/db/repository.rs`: Change conflict resolution to `ON CONFLICT(proj_id, nav_date, fund_class_name) DO UPDATE SET ...`
- [x] 11.4 Update `get_latest_nav_map` and `get_nav_on_date` in `backend/src/db/repository.rs` to enforce 3-tier lookup (Exact Class -> Single Class Project -> Statement Price)
- [x] 11.5 Add Rust unit test in `backend/src/db/repository.rs` asserting that multiple classes on the same date (e.g. `SCBCHAE` 9.4122 and `SCBCHAP` 7.4113) do NOT overwrite each other (passed)
- [x] 11.6 Run `cargo test` to verify zero regression across all database operations## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 12: Production Issue Remediation & Precision Fixes
- [x] 12.1 Issue 1 Fix: Align live scan counter in `frontend/src/components/EmailSyncModal.tsx` so `emails_scanned` and `total_emails` match current broker scope (`{progress?.email_index || 0} / {progress.total_emails}`) without denominator mismatch.
- [x] 12.2 Issue 2 Fix: Refactor `onComplete` in `frontend/src/App.tsx` to immediately open `TransactionReviewModal` (`setIsReviewModalOpen(true)`) and set `reviewPlatformFilter` without blocking nested `.then()` promises.
- [x] 12.3 Issue 3 Fix: KBank Wealth PLUS (`K-WPSPEEDUP`) Ingestion:
  - Add `"wealthplus@kasikornbank.com"` to `sender_emails` in `backend/config/email_sync_brokers.json` and SQLite table `email_broker_configs`.
  - Upgrade `parse_html_table_kasikorn` in `backend/scripts/email_harvester.py` to support ISO `YYYY-MM-DD` date regex and Wealth PLUS HTML table column indexing.
  - Add unit test in `backend/scripts/test_harvester.py` verifying Wealth PLUS email parsing.
- [x] 12.4 Issue 4 Fix: Deduplicate fund search results and upgrade Staged match confidence to EXACT (ตรง 100%):
  - Update SQL query in `search_funds` (`backend/src/db/repository.rs`) to `GROUP BY proj_id, UPPER(proj_abbr_name)` with `MIN(priority)` to eliminate duplicate rows across `funds` and `fund_aliases`.
  - Add defensive client-side deduplication in `FundSearchCombobox.tsx`.
  - Add exact statement aliases for `"TTB SMART PORT 4 EXPLORER FUND": "tsp4-explorer"` and `"EASTSPRING GERMAN EQUITY FUND": "ES-GER"` in `generate_aliases.py` and remediate pending table so they get `EXACT (ตรง 100%)` green badges.
- [x] 12.5 Verification: Run `cargo test` (12/12 passed), `python test_harvester.py` (18/18 passed), `npm test -- --run` (34/34 passed), and `npm run build` (clean in 829ms).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 13: Light Theme Log Console & Progress State Synchronization
- [x] 13.1 Issue Fix: Progress Card State Synchronization:
  - Add fallback parser in `EmailSyncModal.tsx` extracting `broker`, `email_index`, and `total_emails` from `progress.status_text` (e.g. `[TTB] [12/167]`) so the card correctly shows `12 / 167` instead of `0 / 167` or `342 / 78`.
  - In `backend/src/api/handlers.rs`, extract `broker` and `email_index` when serving `/api/email/sync/status`.
  - In `backend/scripts/email_harvester.py`, explicitly record `email_index` and `total_emails` in progress state.
- [x] 13.2 Issue Fix: Adaptive Light/Dark Theme for Live Activity Log Terminal:
  - Change log container in `EmailSyncModal.tsx` from hardcoded dark `bg-[#090d16]` to adaptive: `bg-slate-50 dark:bg-[#090d16] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 ring-1 ring-slate-200/80 dark:ring-slate-800/80`.
  - Make log badges in `logFormatter.ts` adaptive with light mode backgrounds/text (`bg-emerald-100 text-emerald-800 border-emerald-300`) and dark mode (`dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/80`).
  - Make platform badges and Raw Log syntax tokenizer adaptive for Light Theme (dark text on light container).
- [x] 13.3 Verification: Run `cargo test` (12/12 passed), `python test_harvester.py` (18/18 passed), `npm test -- --run` (34/34 passed), and `npm run build` (clean in 826ms).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 14: Dime Mutual Fund Column Overlap Bug & Outlier Transaction Remediation
- [x] 14.1 Root Cause & Solution Documentation in `tasks/plan.md` and `tasks/todo.md`.
- [x] 14.2 Implement Dime Mutual Fund Regex Parser in `email_harvester.py`:
  - Extract tightly spaced columns (`Order ID`, `SUB/RED`, `Fund Code`, `Units`, `Fee`, `Amount`, `NAV`) without AI token cost.
  - Verify `Units * NAV ≈ Amount` mathematically.
- [x] 14.3 Add Defensive Guard in SEC NAV Auto-Correction:
  - When `unit_price` is replaced with `sec_nav`, do NOT scale `units` up to match unverified `total_amount`; recalculate `total_amount = units * sec_nav`.
- [x] 14.4 Database Remediation Script:
  - Fix the 16 corrupted rows in `transactions` (and `pending_transactions`) back to their true amounts (฿1,000.00 each) and units.
  - Recalculate portfolio holdings and verify Dime Market Value drops from ฿2,579,952.96 to ~฿181,918.
- [x] 14.5 Write unit test in `test_harvester.py` verifying Dime concatenated string parsing (20/20 passed).
- [x] 14.6 Verification: Run `cargo test` (13/13 passed), `python test_harvester.py` (20/20 passed), `npm test -- --run` (34/34 passed), and `npm run build` (clean in 813ms).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 15: KBank Wealth PLUS Zero-Fee Preservation (50,000.00 & 5,000.00 THB) & KAsset Rebranding Aliases
- [x] 15.1 Fix `TransactionReviewModal.tsx` (lines 282-285):
  - Do NOT recalculate `total_amount = units * newPrice` when `total_amount` is already present from bank statement/email.
  - Preserve `total_amount` (50,000.00 or 5,000.00) and set `fee = 0.00`.
- [x] 15.2 Add all 18 KAsset Wealth PLUS Rebranding Aliases in `generate_aliases.py` and `fund_aliases`:
  - `WP-LIGHT`, `WP-BALANCED`, `WP-SPARK`, `WP-SPEEDUP`, `WP-ULTIMATE`, `WPBALANCEDRMF`, `WPULTIMATERMF` mapped to canonical `K-WP*` project IDs and classes.
- [x] 15.3 Fix `email_harvester.py` `parse_html_table_kasikorn` (BUG-CRIT-02):
  - Extract `trans_type` dynamically from `cells[1]` ("ซื้อ" / "Purchase" -> BUY, "ขาย" / "ขายคืน" / "Redemption" -> SELL).
- [x] 15.4 Database Remediation Script:
  - Remediate 5 affected `K-WPSPEEDUP` transactions in `transactions` and `pending_transactions` (`2023-10-10` to `total_amount: 50,000.00`, `fee: 0.00`, `unit_price: 8.4649`; and the other four to `total_amount: 5,000.00`, `fee: 0.00`).
- [x] 15.5 Unit test in `test_harvester.py` asserting Wealth PLUS 50,000 purchase preserves 50,000 amount and fee 0.00 (passed).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 16: Transaction History UX Enhancements (Clickable Fund Link to Edit & Real-Time Grand Total Bar)
- [x] 16.1 Backend API for Transaction Editing:
  - Implement `PUT /api/transactions/{id}` in `handlers.rs` and `Repository::update_transaction` in `repository.rs`.
- [x] 16.2 Frontend API Client:
  - Add `updateTransaction(id, data)` in `frontend/src/lib/api.ts`.
- [x] 16.3 Transaction Edit Modal:
  - Support editing existing transactions in `TransactionModal.tsx` (populating existing values, validation, and calling `updateTransaction`).
- [x] 16.4 Interactive Fund Name Button in `TransactionHistoryPage.tsx`:
  - Replace static fund name span with an interactive clickable button opening the edit modal.
- [x] 16.5 Real-Time Grand Total Summary Bar in `TransactionHistoryPage.tsx`:
  - Add a sticky/table-footer calculating `จำนวนรายการ`, `ยอดซื้อรวม (฿)`, `ยอดขายรวม (฿)`, `ยอดสุทธิ (฿)`, and `ค่าธรรมเนียมรวม (฿)` dynamically from `filteredTransactions` rows.
- [x] 16.6 Run Vitest unit tests to verify Grand Total calculations and edit triggers (34/34 passed).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 17: SEC NAV Sync Optimization & Real-Time Date Up-to-Date Verification (`2026-11-12`)
- [x] 17.1 Alias Resolution in `worker.rs` and `handlers.rs` (BUG-HIGH-01):
  - Query `fund_aliases` before `funds` table so statement aliases (`tsp4-explorer`, `WP-SPEEDUP`, `SCBCHINA(A)`) resolve to correct SEC `proj_id`.
- [x] 17.2 Optimize `SyncService::sync_held_funds` in `worker.rs`:
  - Query `fund_aliases` and update NAV records accurately.
- [x] 17.3 Provide explicit user feedback in the UI showing the exact latest NAV date retrieved (e.g. `ข้อมูลล่าสุดถึง 2026-11-12`).
- [x] 17.4 Full regression verification: `cargo test`, `python test_harvester.py`, `npm test -- --run`, and `npm run build`.## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 18: Core Calculation Engine, Stock Asset Integration & Idempotency Hardening
- [x] 18.1 Same-day BUY before SELL ordering in `engine.rs` (BUG-HIGH-02).
- [x] 18.2 Integrate `stock_transactions` into `get_portfolio` (BUG-HIGH-03).
- [x] 18.3 Hardcode removal for `K-USA(UH)` and `M-MINVOL` in `engine.rs` (BUG-MED-01).
- [x] 18.4 Idempotency key collision protection for same-day DCA purchases (BUG-HIGH-04).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 19: SEC Transaction Price Alignment, Date Format & Edit Transaction UI/UX Pro Max
- [x] 19.1 Update `lookup_nav_for_date` in `backend/scripts/email_harvester.py` and `repository.rs` to use `sell_price` for BUY and `buy_price` for SELL from SEC history
- [x] 19.2 Remediate 9 `K-WPSPEEDUP` transactions in 2026 with true SEC `sell_price` (e.g. 2026-11-10 @ 10.1291) and recalculated units in `portfolio.db`
- [x] 19.3 Enforce global `yyyy-mm-dd` date formatting across `HoldingsTable.tsx` and all user-facing date displays
- [x] 19.4 Replace standard `<input type="date">` in `TransactionModal.tsx` with `NavDatePicker` with NAV trading day highlighting and auto-fill
- [x] 19.5 Suppress fund dropdown auto-popup when opening Edit Transaction modal (`showDropdown` only on user interaction)
- [x] 19.6 Redesign fund search dropdown in `TransactionModal.tsx` with high contrast, readable fonts, and prominent NAV chip (UI/UX Pro Max)
- [x] 19.7 Full regression verification: `cargo test` in backend, `npm test` in frontend, and `npm run build`## Slice 20: Database-Wide NAV Pricing & Share-Class Reconciliation
- [x] 20.1 Exhaustive Database Audit: Scanned all 600+ transactions and pending transactions in `portfolio.db` for price-to-amount discrepancies (`abs(units * unit_price - total_amount) > 0.05`).
- [x] 20.2 Pinpoint Share-Class Collision Root Cause: Identified that 44 transactions across SCB (`SCBS&P500E`), TTB (`ES-GF`, `ES-ASIA-A`, `KT-CSBOND-A`) had their `unit_price` corrupted by secondary share-class NAVs (SSF / dividend classes) from legacy SEC sync.
- [x] 20.3 Develop & Execute Automated Remediation (`backend/scripts/remediate_db.py`):
  - Created timestamped database backup (`portfolio.db.backup_*`).
  - Recalculated `unit_price = round(total_amount / units, 4)` for all 43 affected mutual fund rows in `transactions` and `pending_transactions`, aligning with exact SEC `sell_price` for their respective classes.
  - Corrected `KT-CSBOND-A` 2025-02-28 transaction `total_amount` to 650.00 THB.
  - Synchronized `pending_transactions` with `transactions` for 2026 `K-WPSPEEDUP` transactions.
- [x] 20.4 Zero Discrepancy Verification: Confirmed `After: 0 discrepant rows in transactions, 0 in pending_transactions`.
- [x] 20.5 Portfolio Holdings & API Verification: Verified `get_portfolio` calculations for all affected funds (`SCBS&P500E`, `ES-ASIA-A`, `ES-GF`, `KT-CSBOND-A`, `K-WPSPEEDUP`) with 100% cost-basis consistency.
- [x] 20.6 Full Test Suite Run: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean), and `python test_harvester.py` (20/20 passed).## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.
## Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator
- [x] 21.1 Reconcile K-WPSPEEDUP Total Units with App: Identified 0.0008 unit difference caused by standard `round()` vs AIMC standard truncate (`floor(amount / sell_price * 10000) / 10000`). Remediated 2026 transactions in `portfolio.db` to exact 23,843.7048 units.
- [x] 21.2 Fix Share-Class Collision in Month NAV Dates (`repository.rs`): Added `fund_abbr` filtering in `get_nav_dates_for_month` and guarded `sell_price = '0'` so SSF classes never overwrite retail E-class prices with 0.0000.
- [x] 21.3 Historical Date NAV Auto-Fill: Resolved `SCBS&P500E` on `2026-01-16` to exact SEC offer price `40.5673` (not latest 43.7866 or 0.0000).
- [x] 21.4 Real-Time Smart Tri-Directional Calculator in `TransactionModal.tsx`: Added dedicated `Total Amount (THB)` input field with real-time bidirectional reactivity with Units Allocated and Unit Price (NAV).
- [x] 21.5 On-Demand "ดึงราคา NAV" (Fetch NAV) Button: Added interactive button beside Unit Price (NAV) caption to pull historical NAV directly from database for the selected transaction date.
- [x] 21.6 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (34/34 passed), `npm run build` (clean in 826ms), `python test_harvester.py` (20/20 passed), and verified `/api/portfolio` total units.

## Slice 23: TransactionModal Save Failure Investigation, Form Validation Fix & Test Suite
- [x] 23.1 Root Cause Investigation: Identify HTML5 `required` constraint on `totalAmount` blocking form submission silently, and off-screen error banner.
- [x] 23.2 Form Validation Refactor: Add `noValidate` to form, remove `required` constraints, implement smart auto-calculation of units/amount in `handleSingleSubmit`.
- [x] 23.3 Dual Error Display: Add inline validation alert banner immediately above the Save Transaction button.
- [x] 23.4 Automated Test Suite: Create `frontend/src/test/TransactionModal.test.tsx` with 5 unit tests covering form submit, auto-calculation, validation, and edit mode.
- [x] 23.5 Verification: Run full test suite (`npm test`: 39/39 passed across 9 test files, `cargo test`: 13/13 passed, `npm run build`: clean in 811ms).

## Slice 24: Global State Synchronization, Toast Notification System & UI/UX Mutation Audit
- [x] 24.1 Toast Notification System: Create `frontend/src/lib/toast.tsx` (`ToastProvider`, `useToast()`) and wrap at root in `main.tsx`.
- [x] 24.2 Global Data Synchronization: Add `dataVersion` and `triggerDataRefresh` in `App.tsx`; pass `refreshTrigger` to `TransactionHistoryPage` so transaction records update immediately upon save without page exit.
- [x] 24.3 TransactionHistoryPage UX Overhaul: Replace browser `window.confirm` with custom confirmation modal for single deletion; add "+ Record Transaction" button inside History page.
- [x] 24.4 TransactionReviewModal Audit: Replace `window.confirm` calls with styled confirmation modal for Commit All and Delete Selected; add feedback toasts.
- [x] 24.5 Comprehensive Audit Across Components: Verify loading states, disabled buttons during submit, and feedback toasts across `TransactionModal`, `SettingsModal`, and `HoldingsTable`.
- [x] 24.6 Regression Testing: Create `TransactionHistoryPage.test.tsx` and `Toast.test.tsx`; full suite 43/43 tests passing, clean `npm run build`.

## Slice 25: Stock Transactions Integration, SCB Portfolio Reconciliation & Historical NAV Precision
- [x] 25.1 Stock Transactions Integration in Backend: Update `get_all_transactions`, `delete_transaction`, `delete_transactions_bulk`, and `update_transaction` in `backend/src/db/repository.rs` to fetch and mutate `stock_transactions` seamlessly.
- [x] 25.2 Search Funds Extension: Include tickers from `stock_prices` in `search_funds` query.
- [x] 25.3 Stock Display in Transaction History: Add `Stock` tag, `$XX.XX` USD price formatting, and THB total in `frontend/src/components/TransactionHistoryPage.tsx`. Verified search `NVDA` returns all 23 transactions.
- [x] 25.4 SCBS&P500E Transaction Reconciliation: Identified inverted units/price on `2025-07-29` (stored 37.7928 units @ 26.4600; true SEC offer price was 37.7928, correct units 26.4825). Fixed in DB, resulting in exact `1311.1370` units.
- [x] 25.5 SCBNDQ(E) Transaction Reconciliation: Identified fee net-amount deduction on `2025-11-17` (stored 68.1681; true gross investment was 68.1988). Fixed in DB, resulting in exact `3229.8970` units.
- [x] 25.6 Cost Basis & Brokerage Fee Alignment: Clarified that banks calculate cost basis on principal investment (`total_amount`). Updated `backend/src/domain/engine.rs` so `buy_cost = tx.total_amount.abs()`. Live portfolio metrics now match SCB Easy app 100%: Total MVal `109,961.30`, Total P/L `+14,961.30 (+15.75%)`.
- [x] 25.7 Unit Price Auto-Alignment in Modal: Updated `TransactionModal.tsx` to automatically query `getNavByDate` on edit mode and auto-align with official SEC offer price (`44.4663` instead of raw `44.4664`).
- [x] 25.8 Full Regression & Verification: `cargo test` (13/13 passed), `npm test` (43/43 passed across 11 test files), `npm run build` (clean in 789ms), and live API verification on port 8088.

## Slice 26: Stock Holdings De-duplication & Privacy Mode Masking Polish
- [x] 26.1 Backend Ghost Holdings Elimination: In `backend/src/api/handlers.rs` (`get_portfolio`), filtered transactions with `!t.id.starts_with("tx_stk_")` before passing to `CalculationEngine::calculate_portfolio`. Prevented stock transactions from being double-processed as mutual funds with missing NAVs and broken -96% P/L.
- [x] 26.2 Public Market Price Masking Correction: In `frontend/src/components/HoldingsTable.tsx` (`current_nav` column), removed `isPrivacyMode` check from stock price display. Aligned with mutual fund convention where market quotes and quote dates are public market data and remain visible.
- [x] 26.3 Avg Cost Privacy Masking Cleanup: In `HoldingsTable.tsx` (`avg_cost` column), unified privacy mode output to render a single clean `'******'` instead of two stacked `******` lines for stocks.
- [x] 26.4 Full Verification & Regression Testing:
  - Backend unit tests: `cargo test` passed 13/13.
  - Live API check: `/api/portfolio` returned exactly 7 stocks (NVDA, UNH, NVO, OVV, RELY, PRCT, DKNG), all with valid quote dates `(2026-11-13)` and accurate P/L percentages.
  - Frontend test suite: `npm test -- --run` passed 43/43 tests across 11 files.
  - Frontend production build: `npm run build` completed clean in 796ms.
  - Backend daemon restarted and running on port 8088.

## Slice 27: Git Remote Integration, Repository Hygiene & CI/CD Pipeline Setup
- [x] 27.1 Repository Hygiene & .gitignore Audit: Update `.gitignore` to strictly exclude `*.backup_*`, `backend/email_sync.log`, `backend/sync_progress.*`, `__pycache__`, and `scratch/`. Untracked cached runtime logs and pycache.
- [x] 27.2 Secrets & Credential Screening: Verified no secrets, passwords, or private keys are tracked in git. Updated `backend/.env.example` with clean placeholders.
- [x] 27.3 Atomic Commits Decomposition: Split changes into 5 clean, logical commits (backend core, frontend UI/toast, reconciliation & fix, test suite, documentation).
- [x] 27.4 Remote Repository Configuration: Bound origin to `https://github.com/noraseth-swu/fund-portfolio.git`.
- [x] 27.5 GitHub Actions CI Workflow Setup: Created `.github/workflows/ci.yml` with automated quality gates (`cargo test`, `npm test`, `npm run build`).
- [x] 27.6 Safe Push & Remote Verification: Pushed `main` to `origin/main` successfully.
- [x] 27.7 Anti-Slop Audit Report: Completed both DURING and AFTER checks with zero violations, documented in `anti-slop/audit-001-2026-11-16.md`.

## Slice 28: Transaction History Page Privacy Mode Masking
- [x] 28.1 Prop Threading in App.tsx: Pass `isPrivacyMode` state from `App.tsx` down to `TransactionHistoryPage.tsx`.
- [x] 28.2 Column Data Masking: In `TransactionHistoryPage.tsx`, mask sensitive personal financial columns with `******` when `isPrivacyMode` is true:
  - Units (`units`)
  - Total Amount (`total_amount` in THB and foreign currency)
  - Brokerage Fee (`fee`)
  - Table footer net invested and total fees
  - Real-time summary grand total cards (Buy, Sell, Net, Fee)
- [x] 28.3 Header Summary Masking: Mask the aggregated total amount in the header summary text ("X records shown (Total: ****** THB)") and bulk selection bar.
- [x] 28.4 Public Data Preservation: Ensure public market quotes (Effective NAV / Unit Price) and Transaction Dates remain visible, adhering to financial UI standards established in Slice 26.
- [x] 28.5 Automated Test Verification: Add unit test in `TransactionHistoryPage.test.tsx` verifying masking toggles correctly with `isPrivacyMode`.

## Slice 29: Hierarchical Calendar Zoom-Out (Month/Year Picker) in NavDatePicker
- [x] 29.1 Interactive Month/Year Header Button in `NavDatePicker.tsx`: Replace static text span with interactive clickable header toggling between views (`days` -> `months` -> `years`).
- [x] 29.2 Month-Selection Grid View: Implement 12-month grid (`ม.ค.` - `ธ.ค.` / `Jan` - `Dec`) allowing instant month jumping without clicking chevron arrows repeatedly.
- [x] 29.3 Year/Decade Selection Grid View: Implement 12-year decade grid (e.g. 2020 - 2031 / 2563 - 2574) with decade navigation `<` and `>` for quick multi-year historical navigation.
- [x] 29.4 Trading Day NAV Highlights Retention: Ensure that when returning to the day view from a month/year selection, the SEC NAV trading days are dynamically fetched and highlighted seamlessly.
- [x] 29.5 Universal Project-Wide Consistency: Verified that `TransactionModal.tsx` (Single), `BatchTransactionTable.tsx` (Batch), and `TransactionReviewModal.tsx` (Staged) automatically inherit this zoom-out behavior through the shared `NavDatePicker` component.
- [x] 29.6 Automated Unit Tests: Created `NavDatePicker.test.tsx` testing the zoom-out toggle, month selection, year navigation, and day selection (4/4 passed).

## Slice 30: Automated Rate-Paced Historical NAV Backfill from SEC API (Dating to 2023) (Planned - Pending Execution)
- [ ] 30.1 Two-Tier Backfill Prioritization Strategy:
  - Tier 1 (High Priority): 18 distinct portfolio funds with user transactions backfilled back to `2023-01-01` (or fund inception date).
  - Tier 2 (Standard Priority): 9,020 registered mutual funds from the `funds` master table backfilled incrementally.
- [ ] 30.2 SEC Open API Rate Pacing & Quota Management:
  - Implement adaptive pacing (200ms–500ms delay per request) to strictly comply with SEC API rate limits.
  - Implement exponential backoff and jitter on HTTP 429 (Too Many Requests) or HTTP 5xx errors.
- [ ] 30.3 Resumable Checkpoint State Engine (`nav_sync_progress` table):
  - Track `proj_id`, `start_date`, `last_synced_date`, `status` (`IDLE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`), and `updated_at`.
  - Ensure backfill worker resumes from the exact last successful date/fund across server restarts without re-querying fetched ranges.
- [ ] 30.4 Fund Inception Date Guard:
  - Query SEC fund registration / inception dates (`regis_date`) from master data to avoid querying pre-inception periods for newer funds established in 2023–2024 (e.g. `M0301_2567`, `M0690_2566`, `M0744_2565`).
- [ ] 30.5 Zero-Duplicate UPSERT & Share-Class Engine:
  - Store fetched daily NAVs into `fund_nav_history` using SQLite `ON CONFLICT(proj_id, nav_date, fund_class_name) DO UPDATE SET nav = excluded.nav, sell_price = excluded.sell_price, buy_price = excluded.buy_price`.
  - Preserve multi-share-class granularity without overwrite collisions.
- [ ] 30.6 Background Daemon & Observability Endpoint:
  - Provide backend background worker / task control (`POST /api/nav/backfill/start`, `POST /api/nav/backfill/pause`, `GET /api/nav/backfill/status`).
  - Provide UI status indicator or progress modal showing backfill percentage, current fund, date range, and estimated completion time.

## Phase 5: Automation, Observability & Infrastructure Deployment (Completed - Slices 31, 32, 33, 34)

### Slice 31: Production Observability & Error Monitoring (Sentry Full-Stack Integration - Milestone 5.1)
- [x] 31.1 Sentry Configuration & Environment Schema:
  - Add `SENTRY_DSN` to `backend/.env.example` and `VITE_SENTRY_DSN` to `frontend/.env.example`.
  - Document strict PII scrubbing contract (strip bank account numbers, passwords, transaction monetary amounts, and balance figures).
- [x] 31.2 Rust Backend Sentry Integration:
  - Add `sentry` crate (with `tracing` or `actix-web` integration) to `backend/Cargo.toml`.
  - Conditional initialization in `backend/src/main.rs` (graceful no-op when `SENTRY_DSN` is empty/unset).
  - Implement panic hook and global error middleware capturing 500-level internal errors.
  - Implement `before_send` filter to redact sensitive transaction payloads and financial amounts before dispatch.
- [x] 31.3 React Frontend Sentry Integration:
  - Install `@sentry/react` in `frontend/package.json`.
  - Conditional initialization in `frontend/src/main.tsx` (active only when `VITE_SENTRY_DSN` is set).
  - Wrap top-level React tree in `<Sentry.ErrorBoundary>` with styled fallback UI.
  - Implement client-side `beforeSend` scrubbing to strip masked `******` fields and financial PII.
- [x] 31.4 Observability Health Check & Verification:
  - Add test endpoint `GET /api/debug/sentry-test` (guarded in non-production) to trigger and verify test exception capture.
  - Verify that running with empty DSN has zero startup delay, no network calls, and zero test suite disruptions (`cargo test`, `npm test`).

### Slice 32: Supply Chain Security, Dependabot & Automated CI Security Audits (Milestone 5.2)
- [x] 32.1 Dependabot Configuration (`.github/dependabot.yml`):
  - Configure automated weekly security updates for `cargo` (target: `/backend`, daily or weekly).
  - Configure automated weekly security updates for `npm` (target: `/frontend`, weekly).
  - Set PR limit, assignees, and conventional commit prefix conventions.
- [x] 32.2 CI Security Scanning Integration (`.github/workflows/ci.yml`):
  - Add `cargo-audit` step against the RustSec Advisory Database.
  - Add `npm audit --audit-level=high` step for frontend production dependencies.
  - Ensure security scanning runs non-blocking on pull requests or gates PRs appropriately.
- [x] 32.3 Local Baseline Vulnerability Audit:
  - Run `cargo audit` locally and resolve/ignore known benign crates if any.
  - Run `npm audit` locally and confirm zero high/critical vulnerabilities.

### Slice 33: Autonomous Daily NAV Sync Daemon & Ingestion Scheduler (Milestone 5.3)
- [x] 33.1 Homelab Background Scheduler Engine (`backend/src/cron`):
  - Implement lightweight, non-blocking asynchronous timer/scheduler in Rust using `tokio::time::interval` or `tokio-cron-scheduler`.
  - Default schedule: Daily at 20:30 ICT (13:30 UTC), configurable via `DAILY_NAV_SYNC_HOUR` / `DAILY_NAV_SYNC_MINUTE` in `.env`.
- [x] 33.2 Automated Closing NAV Synchronization:
  - Worker automatically triggers `trigger_nav_sync` for all active portfolio mutual funds.
  - Rate-limited and graceful: handles SEC API responses with adaptive backoff; records outcome without interrupting concurrent user requests.
- [x] 33.3 Sync Execution History & Status Endpoint (`scheduled_sync_logs` table):
  - Create SQLite table `scheduled_sync_logs` storing `id`, `sync_type`, `started_at`, `completed_at`, `status` (`SUCCESS`, `PARTIAL`, `FAILED`), `funds_updated`, `error_summary`.
  - Add endpoint `GET /api/cron/status` returning daemon health, last sync execution, and next scheduled trigger.
- [x] 33.4 Scheduler Resilience & Unit Tests:
  - Write unit tests in `backend/src/cron/tests.rs` verifying timer calculation, time zone alignment (ICT vs UTC), and error handling on network disconnect.

### Slice 34: Progressive Web App (PWA) & Mobile Cloudflare Tunnel Optimization (Milestone 5.5)
- [x] 34.1 Web App Manifest & Mobile Branding (`frontend/public`):
  - Generate standards-compliant PWA icons: `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`, and `maskable-icon.png`.
  - Create `manifest.webmanifest` defining `name: "Fund Portfolio"`, `short_name: "Portfolio"`, `theme_color: "#4f46e5"`, `background_color: "#020617"`, `display: "standalone"`, `orientation: "any"`.
- [x] 34.2 Service Worker Integration (`vite-plugin-pwa`):
  - Install and configure `vite-plugin-pwa` with `registerType: 'autoUpdate'`.
  - Configure caching strategy for local static assets (CSS, JS, fonts, SVG icons) to enable instant mobile app launch via Cloudflare Tunnel.
- [x] 34.3 Mobile Viewport, Touch Ergonomics & Safe-Area Layout:
  - Add `viewport-fit=cover` in `index.html`.
  - Add CSS utility classes respecting notch and gesture bars (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
  - Audit all interactive buttons, modal close triggers, and calendar day cells to guarantee minimum 44x44px touch targets per WCAG / `antislop-human` standards.
- [x] 34.4 Cloudflare Tunnel & Mobile Verification:
  - Verify PWA installability prompt in Chrome/Safari mobile emulation.
  - Verify zero layout breaking or horizontal scrolling down to 360px viewport width.


