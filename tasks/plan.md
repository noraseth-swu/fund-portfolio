# Engineering Plan: Precision Fund Resolution, Platform Integrity & Architecture Hardening

## Overview & Context
This engineering plan integrates 8 disciplines:
- `/planning-and-task-breakdown`
- `/context-engineering`
- `/frontend-ui-engineering`
- `/incremental-implementation`
- `/code-review-and-quality`
- `/code-simplification`
- `/security-and-hardening`
- `/performance-optimization`

> **Note on Long-Term Roadmap:** Slices 1 through 25 have completed the Core Engine, Parser Pipeline, Math Precision (AIMC 4-Dec), and UI/UX Reactive foundations. The updated strategic roadmap is maintained in [tasks/roadmap.md](file:///d:/git/fund-portfolio/tasks/roadmap.md).

### Primary Objectives
1. **Precise Fund & Share Class Resolution (SCBS&P500E, NDQ(E)):**
   - Resolve `SCBS&P500E` (E-Class electronic channel) and aliases (`SP500E`, `SCBSP500E`) to SEC project ID `M0643_2555` with `EXACT` match confidence while retaining the specific unitholder class ticker `SCBS&P500E`.
   - Prevent parent fund name `SCBS&P500FUND` from overwriting class `SCBS&P500E` in portfolio holdings and NAV maps.
2. **Platform Attribution Integrity (SCB vs KBANK):**
   - Eliminate platform misclassification when statements from SCB Asset Management (บลจ. ไทยพาณิชย์) designate Kasikornbank (ธนาคารกสิกรไทย) as Fund Supervisor / Custodian.
   - Enforce issuer-first priority across both AI parsers (`handlers.rs`, `email_harvester.py`) and provide editable Platform dropdowns in `TransactionReviewModal`.
3. **Frontend UI Quality & Layout Polish:**
   - Wide container layouts (`max-w-[1720px] 2xl:max-w-[1840px]`) eliminating horizontal scrolling for holdings.
   - User-specific drag-and-drop column reordering persistence.
4. **Code Quality, Security & Performance Hardening:**
   - 100% parameterized SQL queries (zero string injection risk).
   - Decimal precision (`rust_decimal::Decimal`) across all calculations.
   - Zero-copy binary envelope decoding for hot-path progress synchronization.

---

## Dependency Graph & Vertical Slices

```
Database Schema & Aliases (fund_aliases, funds)
      │
      ├── Slice 1: Database & Backend Fund Resolution (SQL queries, repository, engine)
      │       │
      │       ├── Slice 2: Harvester & Parser Platform Integrity (SCB vs KBANK rules)
      │       │       │
      │       │       └── Slice 3: Staged Review UX (Platform switch, Combobox aliases)
      │       │
      │       └── Slice 4: Portfolio Holdings Display & Persistence
      │
      └── Slice 5: Full Regression Testing, Security Audit & Build Verification
```

---

## Detailed Slices

### Slice 1: Backend Fund Alias & Share Class Resolution
- **Files:** `backend/src/db/repository.rs`, `backend/src/domain/engine.rs`, `backend/scripts/email_harvester.py`
- **Actions:**
  - Update `insert_pending_transactions_batch` in `repository.rs` to check `fund_aliases` before falling back to `funds`.
  - Update `get_latest_nav_map` in `repository.rs` so `fund_abbr` preserves class designations (e.g. `SCBS&P500E`) rather than forcibly falling back to `funds.proj_abbr_name` (`SCBS&P500FUND`).
  - Update `engine.rs` to track positions by `(proj_id, fund_abbr, platform)` so multiple share classes under the same project ID are distinctly tracked.
  - Update `match_fund_with_confidence` in `email_harvester.py` to query `fund_aliases` table directly with `EXACT` confidence.
- **Verification:** Unit tests for alias resolution, `cargo test`.

### Slice 2: Platform Attribution Integrity (Issuer Priority)
- **Files:** `backend/src/api/handlers.rs`, `backend/scripts/email_harvester.py`
- **Actions:**
  - In `parse_statement` system instructions: Add explicit rule that the fund issuing company / AMC defines the platform (`SCB` for บลจ.ไทยพาณิชย์ / SCBAM). Explicitly forbid using "ผู้ดูแลผลประโยชน์ / Fund Supervisor" as the platform.
  - In `email_harvester.py`: Ensure if text contains "บลจ.ไทยพาณิชย์" or "SCB Asset Management", platform is forced to `SCB`.
- **Verification:** Test statement parsing with SCB confirmation note containing KBank supervisor.

### Slice 3: Frontend Staged Review UX Polish
- **Files:** `frontend/src/components/TransactionReviewModal.tsx`, `frontend/src/components/FundSearchCombobox.tsx`
- **Actions:**
  - In `TransactionReviewModal.tsx`: Allow inline editing of `platform` column via a select dropdown (`SCB`, `KBANK`, `TTB`, `DIME`, `OTHER`).
  - Verify that selecting `SCBS&P500E` in `FundSearchCombobox` binds `proj_id: "M0643_2555"`, `fund_abbr: "SCBS&P500E"`, and auto-populates historical NAV.
- **Verification:** Vitest tests in `TransactionReviewModal.test.tsx`.

### Slice 4: Holdings Table Responsive Polish & Column Drag & Drop
- **Files:** `frontend/src/components/HoldingsTable.tsx`, `frontend/src/App.tsx`
- **Actions:**
  - Verify user-specific localStorage key (`fund_portfolio_holdings_col_order_${userId}`).
  - Verify widescreen container classes (`max-w-[1720px] 2xl:max-w-[1840px]`).
  - Verify column headers and drag & drop reorder indicators.
- **Verification:** `npm test -- --run` and `npm run build`.

### Slice 5: Quality Review, Code Simplification & Security Verification
- **Files:** All modified files
- **Actions:**
  - Audit all SQL statements for parameter binding.
  - Ensure zero compiler warnings and clean TypeScript types.
  - Clean up dead code, redundant comments, and AI slop.
- **Verification:** `cargo test` (all 10 Rust tests pass), `npm test -- --run` (all 27 Vitest tests pass), `npm run build` succeeds cleanly.

### Slice 6: Email Sync Performance & Cache/Resync Management
- **Files:** `backend/scripts/email_harvester.py`, `backend/src/api/handlers.rs`, `backend/src/db/repository.rs`, `frontend/src/components/SyncCacheManagerModal.tsx`, `frontend/src/components/EmailSyncModal.tsx`
- **Actions:**
  - Implemented fast IMAP header pre-check (`BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT DATE)]`) to skip 420 cached emails in ~1-2 seconds instead of downloading hundreds of megabytes.
  - Implemented `/api/email/sync/cache/stats`, `reset`, `list`, and `delete` endpoints.
  - Created `SyncCacheManagerModal.tsx` allowing platform-specific cache reset, PDF attachment wipe, pending queue wipe, and individual email record deletion.
- **Verification:** Verified with unit tests and live API requests.

---

### Slice 7: Bilingual High-Contrast Live Log & User-Friendly Formatter (Pending Execution)

#### 1. Context & Objectives
- **Zero Loss:** `backend/email_sync.log` remains 100% untouched raw programmer log for diagnostics and auditing.
- **High Contrast & Clarity:** Replace washed-out or low-contrast log text with high-contrast, WCAG AAA compliant styling (`bg-slate-950` terminal container, color-coded badges, dark-themed styling even in bright mode).
- **User-Friendly Translation:** Convert cryptic harvester strings (e.g. `[+] [PENDING] Inserted 2024-10-28 ONE-EUROPEAN (150.00 THB) from ttb...`) into friendly, clear progress cards.
- **Bilingual Support (i18n):** Support Thai (`th`) and English (`en`) dynamically via `useI18n()` context.
- **View Toggle:** Provide a segmented toggle button on top of the log viewer: `[ ✨ สรุปเข้าใจง่าย (User-Friendly) ]` vs `[ 💻 ข้อความดิบ (Raw Log) ]`.

#### 2. Pattern Transformation Matrix
| Raw Programmer Pattern | Thai (`th`) User Friendly | English (`en`) User Friendly | Type / Badge |
| :--- | :--- | :--- | :--- |
| `[+] [PENDING] Inserted <date> <fund> (<amt> THB)...` | `✅ [{platform}] บันทึกสำเร็จ: {fund} ยอด ฿{amt} ({date})` | `✅ [{platform}] Imported: {fund} ฿{amt} ({date})` | `success` / Emerald |
| `[+] [STOCK] Inserted <date> <symbol> (<shares> @ <px>, <amt> THB)...` | `📈 [{platform}] บันทึกหุ้นสำเร็จ: {symbol} ({shares} หุ้น ยอด ฿{amt})` | `📈 [{platform}] Stock imported: {symbol} ({shares} shares, ฿{amt})` | `stock` / Indigo |
| `[✓] Decrypted '<filename>' using password...` | `🔓 ถอดรหัสไฟล์ PDF สำเร็จ: {filename}` | `🔓 Decrypted PDF successfully: {filename}` | `file` / Cyan |
| `Found attachment '<filename>'. Attempting decryption...` | `📎 พบเอกสารใหม่: {filename} (กำลังตรวจสอบรหัสผ่าน)` | `📎 Found new document: {filename} (verifying password)` | `file` / Sky |
| `[<broker>] [<idx>/<total>] Processing new email: '<subj>'...` | `📧 [{broker}] ตรวจสอบอีเมลฉบับที่ {idx}/{total}: {subj}` | `📧 [{broker}] Scanning email {idx}/{total}: {subj}` | `info` / Slate |
| `Skipping already-processed email...` | `⏩ ข้ามอีเมลที่เคยสแกนแล้ว` | `⏩ Skipped previously processed email` | `skip` / Zinc |
| `[KBANK_PVD] [✓] Synced latest PVD positions...` | `🏦 ซิงค์ข้อมูลกองทุนสำรองเลี้ยงชีพ (PVD) ล่าสุดสำเร็จ` | `🏦 Successfully synced Provident Fund (PVD) data` | `pvd` / Emerald |
| `COMPLETED email sync and parsing successfully` | `🎉 สแกนและวิเคราะห์เอกสารอีเมลทั้งหมดเสร็จสิ้น` | `🎉 Email harvest and document parsing completed` | `complete` / Amber-Emerald |
| `Rate limit reached / waiting 429...` | `⏳ ถึงขีดจำกัด API กำลังรอ {seconds} วินาที...` | `⏳ Rate limit reached, waiting {seconds}s...` | `warning` / Amber |
| `[ERROR] / [✗] ...` | `❌ เกิดข้อผิดพลาด: {message}` | `❌ Error: {message}` | `error` / Rose |

#### 3. Planned Architecture & File Changes
1. **`frontend/src/lib/i18n.tsx`**:
   - Add dictionary entries for live log summary badges and translations in both `th` and `en`.
2. **`frontend/src/lib/logFormatter.ts`** (New utility):
   - Pure parser function:
     ```typescript
     export interface FormattedLogItem {
       raw: string;
       timestamp?: string;
       type: 'success' | 'stock' | 'file' | 'info' | 'skip' | 'warning' | 'error' | 'complete';
       platform?: string;
       badgeText: string;
       badgeColor: string;
       friendlyMessage: string;
     }
     export function formatLiveLog(rawLog: string, locale: 'th' | 'en'): FormattedLogItem;
     ```
3. **`frontend/src/components/EmailSyncModal.tsx`**:
   - Add state: `const [logViewMode, setLogViewMode] = useState<'friendly' | 'raw'>('friendly');`
   - Render segmented toggle `[ สรุปเข้าใจง่าย (Friendly) ]` / `[ ข้อความดิบ (Raw Log) ]`.
   - Update terminal window container with `bg-slate-950 border-slate-800 ring-1 ring-slate-800/80` and WCAG AAA color accents.
4. **`frontend/src/test/logFormatter.test.ts`** (New test suite):
   - Unit tests for all log transformation patterns in both Thai and English.

#### 4. Execution Guardrail
- **Wait Condition:** DO NOT apply file edits or restart services until current email sync harvest terminates (`/api/email/sync/status -> is_running: false`).

---

### Slice 8: High-Throughput Parallel Email Sync & Multi-Worker AI Parsing (Tier 1 Scaling)

#### 1. Context & Motivation
- With **Gemini API Tier 1** now active (4,000 Requests/Min, 4,000,000 Tokens/Min), the previous sequential execution (1 PDF at a time, 1 API call at a time) is an artificial bottleneck.
- Transforming the PDF analysis pipeline into a **Producer-Consumer Worker Pool** will accelerate full email sync by 5x–8x without hitting Google IMAP session limits.

#### 2. Technical Architecture: Producer-Consumer Model
```
┌────────────────────────────────────────────────────────┐
│ Single IMAP Connection (Producer)                       │
│  - IMAP4_SSL session to Gmail                          │
│  - Fast Header Pre-Check (skip cached Message-IDs)     │
│  - Downloads PDF payloads and pushes to task queue     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ ThreadPoolExecutor(max_workers=5..8) (AI Consumers)    │
│  - Worker 1: Decrypt & parse Statement A (Gemini API)   │
│  - Worker 2: Decrypt & parse Statement B (Gemini API)   │
│  - Worker 3: Decrypt & parse Statement C (Gemini API)   │
│  - Worker 4: Decrypt & parse Statement D (Gemini API)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Database Synchronizer (Single-Thread Writer)           │
│  - Collects parsed transactions & token counts         │
│  - Atomic batch insert into pending_transactions       │
│  - Updates processed_emails & processed_attachments    │
│  - Zero SQLite 'database is locked' errors             │
└────────────────────────────────────────────────────────┘
```

#### 3. Key Design Decisions & Guardrails
1. **Preserve Single IMAP Connection:**
   - Gmail IMAP limits concurrent connections from a single IP/account. Opening multiple simultaneous IMAP logins can trigger account security challenges. Keeping IMAP retrieval on a single connection prevents connection resets.
2. **Concurrent AI Execution:**
   - Decryption (`pypdf`) and network I/O (`client.models.generate_content`) run inside `ThreadPoolExecutor(max_workers=5..8)`.
   - Each worker isolates its own API call and retry logic.
3. **Thread-Safe Database Writes:**
   - SQLite does not support concurrent write operations across threads safely without locking.
   - Futures are yielded as completed (`as_completed(futures)`) on the main controller thread, which writes transactions to SQLite cleanly.
4. **Target Throughput:**
   - Reduce statement processing latency from ~2.5s/file down to ~0.35s/file effective throughput (85% wall-clock time reduction).

---

### Slice 9: Master Broker Config & Dynamic Harvester Engine

#### 1. Context & Objectives
- Eliminate hardcoded broker tuples and password maps in `backend/scripts/email_harvester.py`.
- Establish a **Data-Driven Master Configuration** that allows users and developers to add or update financial institutions without altering Python application code.
- Provide dynamic password template resolution and extraction dispatching.

#### 2. Configuration Schema & Storage
- **File & Database Dual Storage:**
  - Default master template stored in `backend/config/email_sync_brokers.json`.
  - Stored and customized in SQLite table `email_broker_configs`:
    ```sql
    CREATE TABLE IF NOT EXISTS email_broker_configs (
        broker_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        sender_emails TEXT NOT NULL,          -- JSON Array of email strings
        subject_includes TEXT NOT NULL,       -- JSON Array of required keyword substrings
        subject_excludes TEXT NOT NULL,       -- JSON Array of reject keyword substrings
        extraction_type TEXT NOT NULL,        -- 'PDF_ATTACHMENT' | 'HTML_BODY_TABLE' | 'PDF_POSITION_SNAPSHOT' | 'CSV_ATTACHMENT'
        password_pattern TEXT,                -- e.g. '{DD}{MMM_EN}{YYYY_CE}', '{NATIONAL_ID_LAST5}'
        fallback_patterns TEXT,              -- JSON Array of fallback pattern templates
        ai_prompt_variant TEXT NOT NULL DEFAULT 'DEFAULT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```

#### 3. Dynamic Password Pattern Resolver
- Tokens parsed dynamically against user credentials:
  - `{DD}`: 2-digit day of birth (e.g. `29`)
  - `{MM}`: 2-digit month of birth (e.g. `05`)
  - `{MMM_EN}`: 3-letter English month (e.g. `May`)
  - `{YYYY_CE}`: 4-digit Christian Era birth year (e.g. `1989`)
  - `{YYYY_BE}`: 4-digit Buddhist Era birth year (e.g. `2532`)
  - `{NATIONAL_ID_LAST5}`: Last 5 digits of National ID (e.g. `47802`)
  - `{CUSTOM_PWD}`: Explicit user-configured password override

#### 4. Frontend & API Integration
- **Backend Endpoints:**
  - `GET /api/email/sync/brokers`: Fetch active and available broker configurations.
  - `PUT /api/email/sync/brokers`: Update enabled status, sender addresses, or custom password templates.
  - `POST /api/email/sync/brokers/reset`: Revert configs to system defaults from `email_sync_brokers.json`.
- **Frontend Settings UI:**
  - Dedicated tab in `SettingsModal.tsx`: "การตั้งค่าอีเมลสถาบันการเงิน (Financial Institution Sync Config)".
  - Toggle switches to enable/disable specific brokers (saving scanning time for unused brokers).
  - Editable sender emails tag input and password template selector.

---

### Slice 10: Robust Platform Attribution (Selling Agent vs Fund AMC) & Fund Class Aliasing

#### 1. Core Problem Analysis
1. **Case-Sensitivity Mismatch in Harvester:**
   - `"ttb" in broker_tag` failed because `broker_tag` is `"TTB"`. This defaulted `active_broker` to `"KBANK"`.
2. **Ticker-Based Platform Overwrite Bug:**
   - Lines 1453-1455 had:
     ```python
     if (upper_fcode.startswith("SCB") ...) and platform_code == "KBANK":
         platform_code = "SCB"
     ```
   - In open-architecture selling agents like **ttb Smart Port** or **Dime!**, users buy funds issued by OTHER AMCs (e.g. buying `SCBCHINA(A)` or `K-USA` on ttb).
   - Inferred platform from fund ticker mistakenly transferred ttb holdings to SCB!
3. **Unresolved Share Classes (`SCBCHINA(A)`, `SCBCHA(A)`):**
   - In SEC database, project `M0005_2558` is registered as `SCBCHAFUND`.
   - `SCBCHINA` was matched, but `SCBCHINA(A)` and `SCBCHA(A)` lacked explicit aliases, resulting in `proj_id = None` and the "ต้องเลือกเอง" status.

#### 2. Robust Platform Resolution Architecture (Golden Rules)
```
┌────────────────────────────────────────────────────────────────────────┐
│ GOLDEN RULE 1: SENDER EMAIL / BROKER TAG DICTATES PLATFORM             │
│  - Email from TTB (estatement@eservice.ttbbank.com) ➔ ALWAYS 'TTB'      │
│  - Email from DIME (no-reply@dime.co.th)           ➔ ALWAYS 'DIME'     │
│  - Email from SCBAM (Registrar2@email.scb.co.th)   ➔ ALWAYS 'SCB'      │
│  - Email from KBANK (ka.CyberInvest@...)           ➔ ALWAYS 'KBANK'    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GOLDEN RULE 2: FUND TICKER NEVER OVERRIDES SELLING AGENT PLATFORM      │
│  - Buying SCBCHINA(A) on TTB Smart Port remains Platform: 'TTB'       │
│  - Buying K-USA on TTB Smart Port remains Platform: 'TTB'              │
│  - Buying ONE-EUROPEAN on TTB Smart Port remains Platform: 'TTB'       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GOLDEN RULE 3: CUSTODIAN / SUPERVISOR NEVER OVERRIDES ISSUER           │
│  - Kasikornbank as Fund Supervisor for SCBAM fund remains 'SCB'        │
└────────────────────────────────────────────────────────────────────────┘
```

#### 3. Share Class Integrity & Exact SEC NAV Mapping
1. **The Share Class NAV Divergence Problem:**
   - In Thailand, a single fund project (`proj_id`, e.g. `M0005_2558` or `M0643_2555`) contains multiple share classes (e.g. `Class A` accumulation, `Class D` dividend, `Class E` electronic, `Class SSF`, `Class P`).
   - **Different share classes have drastically different NAVs!**
     - Example in `M0005_2558`: `SCBCHAE` NAV is **9.4122**, while `SCBCHA-SSF` NAV is **8.1893**, and `SCBCHAP` NAV is **7.4113** (>27% variance!).
     - Example in `M0643_2555`: `SCBS&P500E` NAV is **43.349**, while `SCBS&P500(SSFA)` NAV is **37.4797**.
   - **Crucial Rule:** Stripping the suffix blindly to query NAV on `proj_id` without class filtering **WILL CAUSE INCORRECT NAV VALUATION**!
2. **Explicit Canonical Class Mapping in `fund_aliases`:**
   - Map each bank statement representation to its precise SEC `canonical_abbr`:
     - `SCBCHINA(A)` ➔ `proj_id: M0005_2558`, `canonical_abbr: SCBCHAA`, `display_name: กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (สะสมมูลค่า)`
     - `SCBCHA(A)`   ➔ `proj_id: M0005_2558`, `canonical_abbr: SCBCHAA`, `display_name: กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (สะสมมูลค่า)`
     - `SCBCHINA`    ➔ `proj_id: M0005_2558`, `canonical_abbr: SCBCHA`,  `display_name: กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์`
     - `SCBS&P500E`  ➔ `proj_id: M0643_2555`, `canonical_abbr: SCBS&P500E`, `display_name: กองทุนเปิดไทยพาณิชย์หุ้นยูเอส (ช่องทางอิเล็กทรอนิกส์)`
     - `SP500E`      ➔ `proj_id: M0643_2555`, `canonical_abbr: SCBS&P500E`, `display_name: กองทุนเปิดไทยพาณิชย์หุ้นยูเอส (ช่องทางอิเล็กทรอนิกส์)`
     - `NDQ(E)`      ➔ `proj_id: M0266_2564`, `canonical_abbr: SCBNDQ(E)`,  `display_name: กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว (ช่องทางอิเล็กทรอนิกส์)`
3. **Class-Aware NAV Query in `repository.rs` (`get_latest_nav_map`):**
   - The NAV lookup must match on `(proj_id, fund_class_name)` first:
     ```sql
     SELECT nav FROM fund_nav_history
     WHERE proj_id = t.proj_id 
       AND (
           fund_class_name = t.fund_abbr 
           OR fund_class_name = (SELECT canonical_abbr FROM fund_aliases WHERE alias = t.fund_abbr LIMIT 1)
           OR fund_class_name = (SELECT proj_abbr_name FROM funds WHERE proj_id = t.proj_id LIMIT 1)
       )
     ORDER BY nav_date DESC LIMIT 1
     ```
   - Only if no class-specific NAV exists does it fall back to the project default NAV.### Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator

1. **AIMC Unit Truncation Standard vs App Reconciliation (K-WPSPEEDUP):**
   - **Root Cause of 0.0008 Discrepancy:** In Thai mutual fund regulation (AIMC / SEC Thailand), allocated units are truncated (floored) to 4 decimal places: `units = floor(net_amount / offer_price * 10000) / 10000`. The fund company never rounds up fractional units.
   - For `K-WPSPEEDUP` 2026 transactions, standard `round()` rounded up 8 transactions by `+0.0001` each (total `+0.0008` units: 23,843.7056 vs 23,843.7048).
   - Applying `floor((amount / sell_price) * 10000) / 10000` matches the app ground-truth **23,843.7048** with 0.00000000 difference!
   - Remediated database and updated `email_harvester.py` and frontend calculations to use AIMC truncate-4.

2. **Historical Date NAV Resolution (SCBS&P500E 2026-01-16 = 40.5673):**
   - **Root Cause of 0.0000 and Latest NAV Override:**
     1. In `get_nav_dates_for_month`, secondary share classes (`SCBS&P500(SSFE)`, `SCBS&P500-SSF`) with `sell_price = '0'` collided with and overwrote `SCBS&P500E` in the date map, causing the badge to display `• NAV 0.0000`.
     2. In `get_nav_by_date`, fallback queries and month queries lacked `fund_abbr` filtering, returning class-ambiguous prices.
     3. In `TransactionModal.tsx`, when selecting fund, `unitPrice` was immediately set to `latest_nav` (43.7866) and date change guarded against overwriting non-empty `unitPrice`.
   - **Remediation:**
     - Updated `Repository::get_nav_dates_for_month` and `get_nav_by_date` to filter by `fund_class_name` and select `CASE WHEN sell_price > 0 THEN sell_price WHEN nav > 0 THEN nav END`.
     - In `NavDatePicker.tsx`, load month NAVs when fund/date exists, guard against 0.0000 badge, and pass date/NAV to parent.
     - When date changes, update `unitPrice` to historical NAV (e.g. `40.5673` on 2026-01-16).

3. **Smart Tri-Directional Transaction Calculator & Form Redesign:**
   - Added explicit **Total Amount (THB)** (ยอดเงินลงทุน) input field.
   - Real-time reactive calculation:
     - Changing Total Amount -> calculates `Units = floor((amount - fee) / price * 10000) / 10000`.
     - Changing Units -> calculates `Total Amount = (units * price + fee).toFixed(2)`.
     - Changing Unit Price or Fee -> recalculates Units from Total Amount.
   - Added `[ 🔄 ดึงราคา NAV / Fetch NAV ]` button next to `Unit Price (NAV)` caption to on-demand pull exact SEC NAV from DB for the selected date.

---

### Slice 22: SCB Confirmation Notes Brokerage Fee Extraction & DCA Missing Dates Reconciliation

1. **SCB Confirmation Notes Brokerage Fee Invariant (0.45 THB / 0.30 THB):**
   - **Ground-Truth Invariant:** SCB Statement of Holding PDFs clearly list `"ค่าใช้จ่ายในการซื้อขายหลักทรัพย์ (Brokerage Fee) 0.45 THB"` for every standard 1,000.00 THB purchase (0.045%).
   - Following SCBAM's fee reduction notice in October 2026, the brokerage fee decreased from 0.045% to 0.030% (0.30 THB per 1,000.00 THB).
   - In earlier ingestion, `fee` was stored as `0.00` because the brokerage fee number was situated in a separate visual coordinate block in pypdf text extraction.
   - **Engine & Parser Solution:**
     - Added dedicated zero-token fast-path regex parser in `email_harvester.py` under `try_regex_parse_confirmation` specifically targeting SCB Statement of Holding layout. It extracts `trans_date`, `fund_code`, `units`, `price`, `total_amount`, `fee`, and `note` in < 1ms with 0 Gemini tokens.
     - Updated Gemini prompt in `extract_transactions_with_gemini` with explicit guidance for SCB Brokerage Fee extraction.
     - Added `registrar2@scb.co.th` to `email_sync_brokers.json` and eliminated `"statement of holding"` from `subject_excludes` to prevent accidental skips.
     - Remediated all 73 existing SCB records in `transactions` and `pending_transactions` in `portfolio.db` with exact extracted fees (0.45 THB, 4.47-4.51 THB, and 0.30 THB).

2. **DCA "Missing Dates" Reconciliation ("ทำไมไม่มีวันนี้ ดูเหมือนจะหายไปหลายวัน"):**
   - **Verification of 16/01/2026:**
     - The transaction for `2026-01-16` exists in `transactions` (`SCBS&P500E`: 24.6504 units @ 40.5673, `SCBNDQ(E)`: 66.7049 units @ 14.9914).
     - Delivery delay: SCBAM emailed this confirmation note on `08/02/2026` (~3 weeks after trade execution), causing perception of non-receipt.
   - **Identification of Seemingly Missing DCA Dates:**
     - Audited all 120 SCB emails in Gmail: Found **17 failed order notices** from `fundclick.scbam@scb.co.th` with subject `"รายการซื้อกองทุนไม่สำเร็จ"` ("บลจ. ขอแจ้งให้ทราบว่ารายการซื้อกองทุนผ่าน SCBAM Fund Click Application ของท่านไม่สำเร็จ เนื่องจากระบบไม่สามารถหักบัญชีได้").
     - These failed auto-debits explain 100% of the "missing" regular DCA dates (e.g. 16 Jun 2025, 16 Jul 2025, 29 Jul 2025, 14 Oct 2025, 16 Dec 2025, 17 Feb 2026, 16 Mar 2026, 16 Jun 2026, 17 Aug 2026, 16 Sep 2026, 19 Oct 2026).
     - For several failed cycles, the user placed manual replacement orders 1-2 days later (e.g. 18 Jun 2025, 17 Jul 2025, 18 Sep 2026), and those replacement orders were already properly captured in the portfolio.

#### 4. Test Suite Matrix (`test_harvester.py`)
| Test ID | Email Sender / Broker | Fund Name | Mentioned Supervisor / Custodian | Expected Platform | Expected Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-PL-01` | `estatement@eservice.ttbbank.com` | `ONE-EUROPEAN-EQ` | None | `TTB` | Exact SEC |
| `TC-PL-02` | `estatement@eservice.ttbbank.com` | `ES-USTECH` | None | `TTB` | Exact SEC |
| `TC-PL-03` | `estatement@eservice.ttbbank.com` | `SCBCHINA(A)` | None | `TTB` (NOT SCB!) | Exact SEC (`M0005_2558`) |
| `TC-PL-04` | `estatement@eservice.ttbbank.com` | `SCBCHA(A)` | None | `TTB` (NOT SCB!) | Exact SEC (`M0005_2558`) |
| `TC-PL-05` | `estatement@eservice.ttbbank.com` | `K-USA` | None | `TTB` (NOT KBANK!) | Exact SEC |
| `TC-PL-06` | `Registrar2@email.scb.co.th` | `SCBS&P500E` | ธนาคารกสิกรไทย (ผู้ดูแลผลประโยชน์) | `SCB` (NOT KBANK!) | Exact SEC (`M0643_2555`) |
| `TC-PL-07` | `no-reply@dime.co.th` | `NVDA` | None | `DIME` | Stock |
| `TC-PL-08` | `no-reply@dime.co.th` | `SCBWORLD` | None | `DIME` (NOT SCB!) | Exact SEC |

---

### Slice 11: Master Rule — SEC Data Model Migration & Class-Accurate NAV Engine
*(Reference: [tasks/sec_master_rule.md](file:///d:/git/fund-portfolio/tasks/sec_master_rule.md))*

#### 1. Core Mandate: "Accuracy is Paramount (ความถูกต้องสำคัญที่สุด)"
- Empirical profiling of 9,020 funds and 68,691 NAV records revealed that `fund_nav_history` used `PRIMARY KEY (proj_id, nav_date)`.
- When SEC API publishes multiple share classes for the same project on the same date, records collided and one class overwrote the other.
- Furthermore, classes exhibit up to **>27% price divergence** (e.g. `SCBCHAE` 9.4122 vs `SCBCHAP` 7.4113).

#### 2. Architecture & Database Migration
1. **Schema Migration in `backend/src/db/mod.rs`:**
   - Migrate `fund_nav_history` table to composite key:
     ```sql
     CREATE TABLE IF NOT EXISTS fund_nav_history (
         proj_id TEXT NOT NULL,
         nav_date TEXT NOT NULL,
         fund_class_name TEXT NOT NULL DEFAULT '',
         nav TEXT NOT NULL,
         buy_price TEXT,
         sell_price TEXT,
         updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (proj_id, nav_date, fund_class_name)
     );
     ```
2. **Ingestion Fix in `backend/src/db/repository.rs` (`save_nav_history`):**
   - Update `ON CONFLICT(proj_id, nav_date, fund_class_name) DO UPDATE SET ...`
   - Store every share class without collision.
3. **Query Engine Alignment (`get_latest_nav_map` & `get_nav_on_date`):**
   - Query NAV with 3-tier fallback: Exact class match -> Single-class project match -> Confirmation note purchase price.
4. **Verification:**
   - Unit test verifying simultaneous storage and retrieval of `M0005_2558` classes `SCBCHAE` (9.4122) and `SCBCHAP` (7.4113).

---

### Slice 12: Production Issue Remediation & Precision Fixes (Pending Approval)

#### 1. Issue 1: Fix Scan Counter Discrepancy ("สแกนแล้ว 342 / 78")
* **Symptom:** UI displays `สแกนแล้ว 342 / 78`. The numerator `342` is the cumulative email count across all brokers, while denominator `78` is only the email count of the current broker (`KBANK`).
* **Root Cause:**
  * In `backend/scripts/email_harvester.py`, `total_emails_scanned` is an accumulator across all brokers, while `progress_state["total_emails"] = len(msg_ids)` is set per-broker.
  * In `frontend/src/components/EmailSyncModal.tsx`, the card renders `{progress?.emails_scanned || 0} / {progress.total_emails}`.
* **Proposed Solution:**
  * In `EmailSyncModal.tsx`, update the progress counter card to display `{progress?.email_index || 0} / {progress.total_emails}` for current broker progress, and show total cumulative emails `{progress?.emails_scanned}` in a clean dedicated statistic.

#### 2. Issue 2: Fix "ตรวจสอบและเลือกทุกรายการ" Not Opening Staged Review Modal
* **Symptom:** When clicking "ตรวจสอบและเลือกทุกรายการ" (or any bank choice button) in `EmailSyncModal`, the sync modal closes, but `TransactionReviewModal` fails to open.
* **Root Cause:**
  * In `frontend/src/App.tsx`, `onComplete` called nested asynchronous promises:
    `loadData(); checkPendingCount().then(() => getPendingTransactions('PENDING').then((pts) => { if (pts && pts.length > 0) setIsReviewModalOpen(true); }))`.
  * If `checkPendingCount` or the second `getPendingTransactions` delay or throw an error, `setIsReviewModalOpen(true)` is never reached.
* **Proposed Solution:**
  * In `frontend/src/App.tsx`, simplify `onComplete` to immediately open the review modal:
    ```tsx
    onComplete={(chosenPlatform) => {
      setReviewPlatformFilter(chosenPlatform || 'ALL');
      setIsReviewModalOpen(true);
      loadData();
      checkPendingCount();
    }}
    ```

#### 3. Issue 3: Fix KBank Wealth PLUS (`K-WPSPEEDUP`) Transactions Ingestion
* **Symptom:** Confirmation emails from KBank for Wealth PLUS (`K-WPSPEEDUP`) were not imported.
* **Root Causes:**
  1. Sender email `wealthplus@kasikornbank.com` was missing from `email_sync_brokers.json` and `email_broker_configs` table (`sender_emails` only had `ka.CyberInvest@kasikornasset.com`).
  2. In `email_harvester.py` (`parse_html_table_kasikorn`): The date regex `(\d{2})[/-](\d{2})[/-](\d{4})` only looked for `DD/MM/YYYY`, but Wealth PLUS emails use ISO date `YYYY-MM-DD` (e.g. `2025-09-08`).
  3. The Wealth PLUS HTML table has a distinct column structure:
     `Date (col 0) | Type (col 1) | Fund (col 2) | Channel (col 3) | Account (col 4) | Units (col 5) | Amount (col 6) | NAV (col 7)`.
* **Proposed Solution:**
  1. Add `"wealthplus@kasikornbank.com"` to `sender_emails` for `KBANK` in `backend/config/email_sync_brokers.json` and SQLite table `email_broker_configs`.
  2. Update `parse_html_table_kasikorn` to support `YYYY-MM-DD` date parsing and direct column index mapping for Wealth PLUS tables.
  3. Add a test case in `backend/scripts/test_harvester.py` verifying HTML table parsing from Wealth PLUS emails.

#### 4. Issue 4: Fix Duplicate Entries in Fund Search Combobox (`tsp4-explorer` x3, `ES-GER` x2) & Staged Matching Confidence
* **Symptom:** In `FundSearchCombobox.tsx`, searching for `tsp4-explorer` returns 3 duplicate items, and searching for `ES-GER` returns 2 duplicate items. Furthermore, in the Review table, both funds currently show badge **`ใกล้เคียง` (FUZZY)** instead of **`ตรง 100%` (EXACT)**.
* **Root Causes:**
  1. **Duplicate Dropdown Results:**
     - In `backend/src/db/repository.rs` (`search_funds`): The query uses `SELECT DISTINCT ..., priority FROM matched_funds`.
     - Because `priority: 1` comes from `funds` and `priority: 2` comes from `fund_aliases`, `DISTINCT` fails to deduplicate rows with different priorities.
     - SQLite `DISTINCT` is case-sensitive, so `'tsp4-explorer'` and `'TSP-EXPLORER'` were treated as distinct rows.
  2. **Why Staged Ingestion Resulted in FUZZY (ใกล้เคียง) instead of EXACT (ตรง 100%):**
     - In the TTB PDF confirmation note, the string is:
       - `ttb smart port 4 explorer fund` (has trailing `fund`)
       - `Eastspring German Equity Fund` (uses `German` instead of `Germany`)
     - In `fund_aliases`, the existing keys were:
       - `TTB SMART PORT 4` (missing `EXPLORER FUND`)
       - `EASTSPRING GERMANY EQUITY FUND` (spelled with `GERMANY` instead of `GERMAN`)
     - Because the exact PDF string did not match `fund_aliases` or `funds.proj_abbr_name` directly, `match_fund_with_confidence` fell back to LIKE matching on `proj_name_th` / `proj_name_en`, which sets `match_confidence: 'FUZZY'` (badge: `ใกล้เคียง`).
* **Proposed Solution:**
  1. **Deduplicate Search Results in `backend/src/db/repository.rs`:**
     - Group search results by `(proj_id, UPPER(proj_abbr_name))` with `MIN(priority)`:
       ```sql
       SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date
       FROM (
           SELECT proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date, MIN(priority) as best_prio
           FROM matched_funds
           GROUP BY proj_id, UPPER(proj_abbr_name)
       )
       ```
     - Add client-side deduplication filter in `frontend/src/components/FundSearchCombobox.tsx`.
  2. **Upgrade Staged Match Confidence to EXACT (ตรง 100%):**
     - Add exact statement aliases in `backend/scripts/generate_aliases.py`:
       - `"TTB SMART PORT 4 EXPLORER FUND": "tsp4-explorer"`
       - `"TTB SMART PORT 4 EXPLORER": "tsp4-explorer"`
       - `"EASTSPRING GERMAN EQUITY FUND": "ES-GER"`
       - `"EASTSPRING-GERMAN": "ES-GER"`
     - Update pending transactions in `portfolio.db` where raw fund name matches these to `match_confidence = 'EXACT'`.
     - Future scans will automatically match these with **EXACT (ตรง 100%)** confidence and green badges.

---

### Slice 13: Light Theme Log Console & Progress State Synchronization (Completed)
[... See above ...]

---

### Slice 14: Dime Mutual Fund Column Overlap Bug & Outlier Transaction Remediation (Pending Approval)

#### 1. Issue Summary & User Symptom
* **Symptom:** In the Dashboard overview, Platform Breakdown shows **Dime!** Market Value at **฿2,579,952.96** (73.17% of entire portfolio) and Cost Basis at **฿2,198,857.96**, which is completely unrealistic for bi-weekly / monthly retail DCA mutual fund investments.
* **Red Box in User Screenshot:** The Market Value of Dime (`2,579,952.96 THB`) is highlighted as wrong.

#### 2. Root Cause Analysis
1. **PDF Text Column Overlap in `pypdf`:**
   In Dime mutual fund confirmation notes (`Dime_mutual_fund_confirmationNote_DIMEMF*.pdf`), the table columns:
   `Order ID | SUB | Fund Name | Units | NAV/Unit | Fee Include Vat | Total Amount`
   are printed with tight spacing.
   When `pypdf` extracts text, the columns `Fee Include Vat`, `Total Amount`, and `NAV/Unit` are merged into single run-on numeric tokens without delimiters:
   - Row 1: `2202506160004256 SUB KKP US500-UH-E 95.5858 2.671,000.0010.4618`
     (Where Fee = `2.67`, Total Amount = `1,000.00`, NAV = `10.4618`)
   - Row 2: `2202506160004258 SUB KKP NDQ100-UH-E 76.9479 1.601,000.0012.9958`
     (Where Fee = `1.60`, Total Amount = `1,000.00`, NAV = `12.9958`)
2. **AI Extractor Confusion:**
   Because `2.671,000.0010.4618` contained `2.671` followed by `,000.00`, the AI extractor mistook `2.671` for `unit_price: 2671.0000` (or `total_amount = units * 2671`).
3. **Compound Inflation via SEC NAV Auto-Correction:**
   In `backend/scripts/email_harvester.py` (lines 923-928):
   - The code noticed `unit_price: 2671.0000` was absurd (> 500) and replaced it with SEC NAV (`10.3979` or `11.5796`).
   - However, it trusted the inflated `total_amount: 255,309.68` as truth and recomputed:
     `units = round(total_amount / unit_price, 4) = 255309.68 / 10.3979 = 24,553.9657 units`!
   - This converted a **1,000.00 THB** DCA purchase into a fabricated **255,309.68 THB** purchase of **24,553 units**!
4. **Scope of Corruption:**
   Exactly 12 transactions across 6 statements were inflated by a total of **฿2,056,366.93**:
   - `2025-06-16` KKP US500-UH-E: recorded `255,309.68 THB` (24,553.9657 units) ➔ True: `1,000.00 THB` (`95.5858 units`)
   - `2025-06-16` KKP NDQ100-UH-E: recorded `123,093.59 THB` (9,487.0550 units) ➔ True: `1,000.00 THB` (`76.9479 units`)
   - `2025-09-30` KKP US500-UH-E: recorded `230,683.00 THB` (20,075.1023 units) ➔ True: `1,000.00 THB` (`86.3587 units`)
   - `2025-09-30` KKP NDQ100-UH-E: recorded `109,942.11 THB` (7,585.5626 units) ➔ True: `1,000.00 THB` (`68.6709 units`)
   - `2025-10-30` KKP US500-UH-E: recorded `225,946.58 THB` (19,146.0682 units) ➔ True: `1,000.00 THB` (`86.xxx units`)
   - `2025-10-30` KKP NDQ100-UH-E: recorded `105,371.89 THB` (6,969.8701 units) ➔ True: `1,000.00 THB` (`68.xxx units`)
   - `2026-01-28` KKP US500-UH-E: recorded `229,883.65 THB` (19,974.5977 units) ➔ True: `1,000.00 THB` (`86.0740 units`)
   - `2026-01-28` KKP NDQ100-UH-E: recorded `108,668.08 THB` (7,387.0597 units) ➔ True: `1,000.00 THB` (`67.8688 units`)
   - `2026-01-30` KKP US500-UH-E: recorded `228,210.51 THB` (19,662.8104 units) ➔ True: `1,000.00 THB` (`86.xxx units`)
   - `2026-01-30` KKP NDQ100-UH-E: recorded `109,257.84 THB` (7,499.4914 units) ➔ True: `1,000.00 THB` (`68.xxx units`)
   - `2026-03-02` KKP US500-UH-E: recorded `220,000.00 THB` (19,118.6311 units) ➔ True: `1,000.00 THB` (`86.0422 units`)
   - `2026-03-02` KKP NDQ100-UH-E: recorded `110,000.00 THB` (7,680.7061 units) ➔ True: `1,000.00 THB` (`69.7092 units`)

#### 3. Proposed Solution
1. **Deterministic Dime Mutual Fund Regex Parser (Fast-Path, 0 Tokens):**
   - Implement regex pre-processor in `backend/scripts/email_harvester.py`:
     ```python
     # Match Dime line: OrderID SUB/RED FundName Units FeeAmountNav
     # e.g. "2202509300006776 SUB KKP US500-UH-E 86.3587 2.671,000.0011.5796"
     dime_mf_pattern = re.compile(
         r'(\d{10,20})\s+(SUB|RED|SWI|SWO)\s+([A-Za-z0-9\-_()]+)\s+([\d.]+)\s+([\d.]+),?([\d]{3}\.\d{2})([\d.]+)'
     )
     ```
     - Group 1: Order ID (e.g. `2202509300006776`)
     - Group 2: Type (`SUB` ➔ BUY, `RED` ➔ SELL)
     - Group 3: Fund Code (e.g. `KKP US500-UH-E`)
     - Group 4: Units (e.g. `86.3587`)
     - Group 5: Fee (e.g. `2.67`)
     - Group 6: Total Amount (e.g. `1,000.00`)
     - Group 7: NAV (e.g. `11.5796`)
   - Assert `abs(Units * NAV - TotalAmount) < 5.0` to guarantee 100% mathematical precision.
2. **Defensive Guard in SEC NAV Adjustment:**
   - In `email_harvester.py`, if `unit_price` is absurdly high and replaced with `sec_nav`, NEVER scale `units` up to match an unverified `total_amount`. If `units > 0`, calculate `total_amount = round(units * unit_price, 2)`.
3. **Database Remediation Script:**
   - Re-parse all Dime mutual fund statement attachments or update the 12 corrupted rows in `transactions` to their true amounts (฿1,000.00 each) and units.
   - Verify that Dime Market Value recalculates accurately from `฿2,579,952.96` down to `~฿165,000 - ฿185,000`.
4. **Verification & Test Coverage:**
   - Add unit test in `backend/scripts/test_harvester.py` testing Dime concatenated string parsing (`2.671,000.0010.4618`).
   - Run backend and frontend test suites to assert zero regression.

#### 1. Issue: Progress Card Counter Discrepancy (`0 / 167` vs `[12/167]`)
* **Symptom:** In the UI during a scan, the header subtitle displays `[TTB] [12/167]`, but Card 1 displays `0 / 167`.
* **Root Cause:**
  - The fast binary progress decoder (`BinaryEnvelopeCodec` in `backend/src/codec/`) unpacks `emails_scanned` and `total_emails`, but does not unpack `broker` or `email_index`.
  - When the frontend receives the progress state, `progress.email_index` is `undefined`, so `progress?.email_index || 0` falls back to `0`.
  - Meanwhile, `status_text` is packed with `[TTB] [12/167] ...`.
* **Proposed Solution:**
  - In `EmailSyncModal.tsx`, parse `broker`, `email_index`, and `total_emails` directly from `progress.status_text` via regex `\[([A-Z_]+)\]\s+\[(\d+)\/(\d+)\]` when `progress.email_index` is missing or 0.
  - In `backend/src/api/handlers.rs`, extract `broker` and `email_index` from `status_text` or `sync_progress.json` and include them in the JSON response payload.
  - The card will accurately display `12 / 167` and `สแกน TTB`.

#### 2. Issue: Theme Light Live Activity Log Console (White Background & Dark Text)
* **Symptom:** When the user uses Light Theme, the entire modal is white, but the Live Activity Logs terminal is hardcoded to an all-black container (`bg-[#090d16] text-slate-100`), creating an uncoordinated high-contrast block.
* **Root Cause:**
  - `EmailSyncModal.tsx` hardcoded `bg-[#090d16]` and dark-mode text colors without light-mode responsive variants.
* **Proposed Solution:**
  - **Adaptive Container:**
    ```tsx
    className="bg-slate-50 dark:bg-[#090d16] text-slate-800 dark:text-slate-100 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 ring-1 ring-slate-200 dark:ring-slate-800/80 h-52 overflow-y-auto space-y-1.5 select-text shadow-inner"
    ```
  - **Adaptive Badges in `logFormatter.ts`:**
    - Success / Imported: `bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/80`
    - Decrypted / File: `bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500/80`
    - Scanning / Info: `bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-500/80`
    - Found Emails: `bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-500/80`
    - Error: `bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/80`
  - **Adaptive Platform Badges in `EmailSyncModal.tsx`:**
    - TTB: `bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-500/80`
    - DIME: `bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-500/80`
    - SCB: `bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-500/80`
    - KBANK: `bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-500/80`
  - **Adaptive Raw Mode Syntax Tokenizer:**
---

### Slice 15: KBank Wealth PLUS Zero-Fee Preservation (50,000.00 & 5,000.00 THB) & KAsset Rebranding Aliases (Pending Approval)

#### 1. Issue Summary & Confirmed User Evidence
* **User Confirmation & Direct Evidence:** The user confirmed: **"ไม่มีค่าธรรมเนียมนะ" (There is NO fee)** with 3 official Kasikornbank Wealth PLUS confirmation emails:
  * `07/11/2566`: จำนวนเงิน 5,000.00 บาท, ค่าธรรมเนียม: 0.00 บาท (หน่วย 597.0790 @ 8.3741 = 5,000.00 บาท)
  * `07/12/2566`: จำนวนเงิน 5,000.00 บาท, ค่าธรรมเนียม: 0.00 บาท (หน่วย 584.9321 @ 8.5480 = 5,000.00 บาท)
  * `07/02/2567`: จำนวนเงิน 5,000.00 บาท, ค่าธรรมเนียม: 0.00 บาท (หน่วย 560.8210 @ 8.9155 = 5,000.00 บาท)
  * And on `2023-10-10`: จำนวนเงิน 50,000.00 บาท, ค่าธรรมเนียม: 0.00 บาท (หน่วย 5,906.7443 @ 8.4649 = 50,000.00 บาท)
* **Mathematical Proof:**
  * $5,906.7443 \times 8.4649 = 50,000.00$ บาท พอดี
  * $597.0790 \times 8.3741 = 5,000.00$ บาท พอดี
  * $584.9321 \times 8.5480 = 5,000.00$ บาท พอดี
  * $560.8210 \times 8.9155 = 5,000.00$ บาท พอดี
  * $546.6571 \times 9.1465 = 5,000.00$ บาท พอดี
  * **Fee = 0.00 บาท ตลอดทุกรายการ!**

#### 2. Root Cause Analysis
1. **The Exact Culprit in `TransactionReviewModal.tsx` (lines 282-285):**
   ```typescript
   const navRes = await getNavByDate(fund.proj_id, target.trans_date);
   if (navRes && navRes.nav) {
     newPrice = navRes.nav; // Base NAV (8.4227)
   }
   const u = parseFloat(target.units) || 0;
   const p = parseFloat(newPrice) || 0;
   const totalAmount = (u * p).toFixed(2); // Overwrites 50,000 with 49,750.74!
   ```
   When the user or system matched the fund, `getNavByDate` returned SEC Base NAV (`8.4227`). The code then forcibly recalculated `totalAmount = units * Base NAV` = `5906.7443 * 8.4227 = 49,750.74`!
   It wiped out the actual cash amount (฿50,000.00) and set it to ฿49,750.74.
2. **SEC `sell_price` vs `nav`:**
   In SEC history for `M0280_2564`:
   `sell_price` (ราคาขายของ บลจ. หรือราคาที่ผู้ลงทุนซื้อ) คือ `8.4649`, `8.3741`, `8.5480`, `8.9155`, `9.1465`.
   ราคาในอีเมลของธนาคารคือราคาเสนอขายจริง (`sell_price`) ซึ่งคูณกับหน่วยแล้วได้ยอดเงินลงทุนครบ 50,000.00 บาท และ 5,000.00 บาท โดยมีค่าธรรมเนียมเป็น 0.00 บาท!
3. **Rebranding Aliases:**
   7 กองทุน Wealth PLUS ถูกเปลี่ยนชื่อเมื่อ 22 มี.ค. 2567 จาก `WP-*` เป็น `K-WP*`

#### 3. Proposed Solution
1. **Never Overwrite Total Amount in `TransactionReviewModal.tsx` & `email_harvester.py`:**
   - If `target.total_amount` is already set from the bank statement/confirmation email (e.g. 50,000.00 or 5,000.00) and `target.units > 0`, **DO NOT recalculate `total_amount = units * newPrice`**!
   - Keep `total_amount` anchored to the actual bank deduction.
   - Keep `fee = 0.00`.
   - Keep `unit_price` as the actual transaction price ($50,000.00 / 5,906.7443 = 8.4649$).
2. **KAsset Rebranding Aliases:**
   - Add all 7 former `WP-*` tickers to `fund_aliases`:
     - `WP-LIGHT` ➔ `M0278_2564` (`K-WPLIGHT`)
     - `WP-BALANCED` ➔ `M0279_2564` (`K-WPBALANCED`)
     - `WP-SPARK` ➔ `M0281_2564` (`K-WPSPARK`)
     - `WP-SPEEDUP` ➔ `M0280_2564` (`K-WPSPEEDUP`)
     - `WP-ULTIMATE` ➔ `M0282_2564` (`K-WPULTIMATE`)
     - `WPBALANCEDRMF` ➔ `M0088_2565` (`KWPBALRMF`)
     - `WPULTIMATERMF` ➔ `M0089_2565` (`KWPULTIRMF`)
3. **Database Remediation:**
   - Update the 5 affected transactions in `transactions` (and `pending_transactions`):
     - `2023-10-10`: `total_amount = 50000.00`, `unit_price = 8.4649`, `fee = 0.00`
     - `2023-11-07`: `total_amount = 5000.00`, `unit_price = 8.3741`, `fee = 0.00`
     - `2023-12-07`: `total_amount = 5000.00`, `unit_price = 8.5480`, `fee = 0.00`
     - `2024-02-07`: `total_amount = 5000.00`, `unit_price = 8.9155`, `fee = 0.00`
     - `2024-03-07`: `total_amount = 5000.00`, `unit_price = 9.1465`, `fee = 0.00`

---

### Slice 16: Transaction History UX Enhancements (Clickable Fund Link to Edit & Real-Time Grand Total Bar) (Pending Approval)

#### 1. Issue Summary & User Requirements
1. **Clickable Fund Link to Edit:** In `TransactionHistoryPage.tsx`, clicking the fund name must open a modal to view and edit that transaction's details (`platform`, `trans_type`, `trans_date`, `units`, `unit_price`, `total_amount`, `fee`, `note`).
2. **Real-Time Grand Total Summary Bar:** At the bottom of `TransactionHistoryPage.tsx`, add a reactive Grand Total summary displaying:
   - Total Displayed Transactions (`จำนวนรายการ`)
   - Total Buy Amount (`ยอดซื้อรวม ฿`)
   - Total Sell Amount (`ยอดขายรวม ฿`)
   - Net Cash Flow / Invested Capital (`ยอดสุทธิ ฿`)
   - Total Fees (`ค่าธรรมเนียมรวม ฿`)
   - Calculating dynamically in real time from whatever rows are currently filtered and displayed.

#### 2. Architecture & Implementation Plan
1. **Backend REST API:**
   - Add endpoint `PUT /api/transactions/{id}` in `backend/src/api/mod.rs` and `backend/src/api/handlers.rs`.
   - Implement `Repository::update_transaction` in `backend/src/db/repository.rs` to safely update transaction fields.
2. **Frontend API Client:**
   - Add `updateTransaction(id: string, payload: TransactionInput)` in `frontend/src/lib/api.ts`.
3. **Edit Modal Integration:**
   - Create or extend `TransactionModal.tsx` to support `editTransaction?: Transaction | null`.
   - Pre-populate form with existing transaction values, validate inputs, and submit `PUT /api/transactions/{id}`.
4. **Fund Link Interaction:**
   - In `TransactionHistoryPage.tsx`, replace plain text `<span className="font-bold">` with an interactive button:
     ```tsx
     <button
       onClick={() => handleOpenEditModal(item)}
       className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block font-mono text-left cursor-pointer transition flex items-center gap-1 group"
     >
       <span>{item.fund_abbr || item.proj_id}</span>
       <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
     </button>
     ```
5. **Real-Time Grand Total Summary Footer:**
   - Add a sticky or table-footer `<tfoot>` and summary metric card under the table:
     - `totalBuy = filtered.filter(t => t.trans_type === 'BUY').reduce((acc, t) => acc + parseFloat(t.total_amount), 0)`
     - `totalSell = filtered.filter(t => t.trans_type === 'SELL').reduce((acc, t) => acc + parseFloat(t.total_amount), 0)`
     - `netAmount = totalBuy - totalSell`
     - `totalFee = filtered.reduce((acc, t) => acc + (parseFloat(t.fee) || 0), 0)`
   - Formatted with Thai Baht currency, responsive for mobile and desktop.

---

### Slice 17: SEC NAV Sync Optimization & Real-Time Date Up-to-Date Verification (`2026-11-12`) (Approved)

#### 1. Issue Summary & Finding
* **User Symptom:** User noted SEC NAV was already out up to `2026-11-12`, but clicking "Sync NAV" did not seem to update in the UI.
* **Empirical Verification:**
  - Database inspection revealed that all portfolio funds (including `SCBS&P500E` @ 43.7866 and `SCBNDQ(E)` @ 16.2702) **ARE ALREADY updated to `2026-11-12` / `2026-11-13`** in `portfolio.db`!
  - Root cause of user perception:
    1. SEC API endpoint `/v2/fund/daily-info/nav` only returns items in ASCENDING order from 2013.
    2. Syncing 17 portfolio funds required traversing over 20,000 historical records sequentially, taking **35–50 seconds** of synchronous HTTP execution.
    3. The user clicked "Sync NAV", saw the spinner or slow response, and checked before the background worker finished writing at 18:03:59.
* **Proposed Enhancement:**
  1. Optimize `SyncService::sync_held_funds` to run incrementally: if a fund already has recent records within the past 14 days, don't re-read 10+ years of pagination if a lighter check or fast cursor can be used.
  2. In `worker.rs` and `handlers.rs`, check `fund_aliases` FIRST before querying `funds` directly so aliased funds resolve to SEC `proj_id` accurately.
  3. Provide clear visual toast / status indicating exact latest NAV date on completion (e.g. `✅ อัปเดตราคา NAV ล่าสุดเรียบร้อยแล้ว (ข้อมูลถึงวันที่ 12/11/2026)`).

---

### Slice 18: Core Calculation Engine, Stock Asset Integration & Idempotency Hardening (Approved)

#### 1. Objectives & Defects Addressed
1. **BUG-HIGH-02 (Same-day BUY before SELL order in `engine.rs`):**
   - When multiple transactions occur on the same `trans_date`, ensure BUY transactions are processed before SELL transactions (and preserve original rowid / sequence).
   - This prevents selling transactions on the day of purchase from being erroneously discarded when initial units start at 0.
2. **BUG-HIGH-03 (`stock_transactions` in `get_portfolio`):**
   - Query `stock_transactions` table in `get_portfolio` and feed stock positions into portfolio holdings and platform summaries alongside mutual funds and PVD.
3. **BUG-HIGH-04 (Multi-Transaction Same-Day DCA Idempotency Collision):**
   - Include unique sequence / transaction order or confirmation id in `idempotency_key` so multiple DCA purchases of identical amounts on the same day do not overwrite each other.
4. **BUG-MED-01 (Remove Hardcoded `K-USA(UH)` / `M-MINVOL` from Stock Classification):**
   - Remove hardcoded mutual funds from `is_stock` check in `engine.rs` so they are correctly classified as Mutual Funds (`FUND`).

---

### Slice 19: SEC Transaction Price Alignment (Offer/Bid vs NAV), Unified Date Format (yyyy-mm-dd) & Edit Transaction UI/UX Pro Max Redesign (Active)

#### 1. Objectives & Findings
1. **SEC Historical Pricing Rule vs Raw NAV (K-WPSPEEDUP on 2026-11-10):**
   - **User Symptom:** The user identified that on `2026-11-10`, `K-WPSPEEDUP` should have NAV `10.1291` instead of `10.0786`.
   - **Root Cause Analysis:**
     - The SEC Daily NAV API (`/v2/fund/daily-info/nav`) returns three distinct pricing fields:
       1. `last_val`: Raw Net Asset Value (NAV per unit) = `10.0786`
       2. `buy_price`: AMC Repurchase Price / ราคารับซื้อคืน (used when an investor **SELLS**) = `10.0786`
       3. `sell_price`: AMC Offer Price / ราคาขาย (used when an investor **BUYS**) = **`10.1291`** (includes front-end load / sell fee: `10.0786 * 1.005 = 10.1291`)
     - In `email_harvester.py` and database lookups, the query was strictly `SELECT nav FROM fund_nav_history`, which fetched `last_val` (10.0786) instead of `sell_price` (10.1291) for BUY transactions.
     - Confirmation note transactions from Kasikorn in 2024 and 2025 always transacted at `sell_price` (e.g. 2025-10-08 unit price was 9.9251, matching `sell_price` 9.9251 while `nav` was 9.8756).
   - **Resolution:**
     - Update `lookup_nav_for_date` to dynamically resolve based on transaction type:
       - For `BUY`: select `COALESCE(NULLIF(sell_price, ''), nav)`
       - For `SELL`: select `COALESCE(NULLIF(buy_price, ''), nav)`
     - Remediate the 9 transactions of `K-WPSPEEDUP` in 2026 in `transactions` with their true `sell_price` and recalculated units:
       - `2026-01-28`: 10,000 THB @ 9.8505 (was 9.8014) -> 1,015.1769 units
       - `2026-01-29`: 5,000 THB @ 9.8563 (was 9.8072) -> 507.2897 units
       - `2026-03-30`: 5,000 THB @ 9.5408 (was 9.4932) -> 524.0651 units
       - `2026-04-30`: 5,000 THB @ 10.2821 (was 10.2308) -> 486.2820 units
       - `2026-05-29`: 5,000 THB @ 10.7479 (was 10.6943) -> 465.2072 units
       - `2026-06-30`: 5,000 THB @ 10.7900 (was 10.7362) -> 463.3920 units
       - `2026-07-31`: 5,000 THB @ 10.4686 (was 10.4164) -> 477.6188 units
       - `2026-08-31`: 5,000 THB @ 10.7475 (was 10.6939) -> 465.2245 units
       - `2026-11-10`: 5,000 THB @ 10.1291 (was 10.0786) -> 493.6273 units

2. **Global Date Format Standardization (`yyyy-mm-dd`):**
   - Enforce ISO 8601 `yyyy-mm-dd` (e.g. `2026-11-10`) consistently across all user-facing components, replacing legacy `dd/mm/yyyy` and browser-dependent locale formats:
     - `HoldingsTable.tsx`: Update `formatNavDate` to display `yyyy-mm-dd`.
     - `TransactionModal.tsx`: Integrate `NavDatePicker` displaying `yyyy-mm-dd`.
     - Audit `TransactionHistoryPage.tsx`, `TransactionReviewModal.tsx`, and `EmailSyncModal.tsx`.

3. **NavDatePicker with Trading Day NAV Highlighting in Edit Transaction:**
   - Replace standard HTML `<input type="date">` in `TransactionModal.tsx` with `<NavDatePicker value={transDate} projId={projId} fundAbbr={fundAbbr} onChange={...} />`.
   - Highlight trading days with green indicators and show active NAV trading count.
   - When a trading day is picked, auto-populate the unit price with that day's transaction NAV.

4. **Dropdown Auto-Popup Suppression on Modal Open:**
   - In `TransactionModal.tsx`, when `editTransaction` sets `searchQuery`, the debounce `useEffect` was setting `showDropdown(true)` automatically.
   - Fix by tracking user focus / explicit interaction (`isUserInteracting` or user keyboard input), preventing the dropdown popover from appearing unprompted on modal open.

5. **Dropdown UI/UX Pro Max Redesign:**
   - Redesign the fund search dropdown for high contrast, readability, and prominent NAV chips:
     - Theme-adaptive card: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl divide-y divide-slate-100 dark:divide-slate-800`.
     - Ticker: `text-slate-900 dark:text-white font-bold text-sm tracking-tight`.
     - Prominent NAV Chip: `bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 font-mono font-bold text-xs px-2.5 py-1 rounded-full shadow-xs`.
     - Fund Name: `text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5`.
     - Interactive states: smooth hover feedback with `hover:bg-indigo-50/80 dark:hover:bg-slate-800/80`.### Slice 20: Database-Wide NAV Pricing & Share-Class Reconciliation

1. **Systemic Problem Discovered Across Database:**
   - Beyond `K-WPSPEEDUP`, an exhaustive audit across `portfolio.db` revealed that **44 transactions** across multiple mutual funds had `unit_price` discrepancies where `abs(units * unit_price - total_amount) > 1.00 THB`.
   - **Root Cause:** In earlier versions of the sync pipeline (prior to composite primary key `(proj_id, nav_date, fund_class_name)`), SEC daily NAV records for secondary share classes (such as SSF classes `SCBS&P500-SSF` or dividend classes `ES-GF-D` / `ES-ASIA-S`) collided and overwrote the retail class `sell_price` in NAV lookup tables.
   - Bank confirmation notes (`total_amount` and unitholder `units`) remained the ground-truth benchmark. When historical auto-correction ran, it populated `unit_price` with the collided class's NAV rather than the executed offer price (`sell_price`).

2. **Audit Findings Breakdown:**
   - **SCB (`SCBS&P500E` - 14 transactions):**
     - User purchased retail class `SCBS&P500E` (offer price range 35.6231 - 44.7211 THB).
     - Database had stored `unit_price` as 27.8784 - 35.0501 THB (corresponding to `SCBS&P500-SSF` or main class), causing a discrepancy of 171.51 - 293.25 THB per transaction!
     - `total_amount / units` perfectly matches SEC official `sell_price` of `SCBS&P500E`.
   - **TTB (`ES-GF` - 22 transactions):**
     - User purchased accumulation class `ES-GF-A` (offer price range 11.8492 - 12.6387 THB).
     - Database had stored `unit_price` as 9.3226 - 10.3537 THB (corresponding to dividend class `ES-GF-D`), causing a discrepancy of 52.04 - 69.38 THB per transaction.
     - `total_amount / units` perfectly matches SEC official `sell_price` of `ES-GF-A`.
   - **TTB (`ES-ASIA-A` - 7 transactions):**
     - User purchased accumulation class `ES-ASIA-A` (offer price range 12.7125 - 19.6288 THB).
     - Database had stored `unit_price` as 10.0931 - 15.6343 THB (corresponding to class `ES-ASIA-S`), causing a discrepancy of ~51 THB per transaction.
     - `total_amount / units` perfectly matches SEC official `sell_price` of `ES-ASIA-A`.
   - **TTB (`KT-CSBOND-A` - 1 transaction on 2025-02-28):**
     - `units = 56.5433`, executed offer price was `11.4956` (56.5433 * 11.4956 = 650.00 THB).
     - `total_amount` was stored as `645.16 THB` due to using unadjusted NAV `11.4099`.
   - **KBANK (`K-WPSPEEDUP` - 9 transactions in 2026):**
     - Synchronized `pending_transactions` with `transactions` using official SEC offer price `sell_price` (e.g. 10.1291 on 2026-11-10).

3. **Remediation Implemented:**
   - Automated remediation script `backend/scripts/remediate_db.py`:
     - Creates timestamped backup `portfolio.db.backup_<timestamp>`.
     - Recalculates `unit_price = round(total_amount / units, 4)` for all affected transactions and pending transactions where discrepancy > 0.05 THB.
     - Updates `KT-CSBOND-A` 2025-02-28 to 650.00 THB.
     - Synchronizes `pending_transactions` with `transactions` for `K-WPSPEEDUP`.
   - Verifies 0 discrepancies remaining in `portfolio.db`.### Slice 21: Unit Calculation Standard (AIMC Truncate), Historical Date NAV Resolution & Smart Tri-Directional Transaction Calculator

1. **AIMC Unit Truncation Standard vs App Reconciliation (K-WPSPEEDUP):**
   - **Root Cause of 0.0008 Discrepancy:** In Thai mutual fund regulation (AIMC / SEC Thailand), allocated units are truncated (floored) to 4 decimal places: `units = floor(net_amount / offer_price * 10000) / 10000`. The fund company never rounds up fractional units.
   - For `K-WPSPEEDUP` 2026 transactions, standard `round()` rounded up 8 transactions by `+0.0001` each (total `+0.0008` units: 23,843.7056 vs 23,843.7048).
   - Applying `floor((amount / sell_price) * 10000) / 10000` matches the app ground-truth **23,843.7048** with 0.00000000 difference!
   - Remediated database and updated `email_harvester.py` and frontend calculations to use AIMC truncate-4.

2. **Historical Date NAV Resolution (SCBS&P500E 2026-01-16 = 40.5673):**
   - **Root Cause of 0.0000 and Latest NAV Override:**
     1. In `get_nav_dates_for_month`, secondary share classes (`SCBS&P500(SSFE)`, `SCBS&P500-SSF`) with `sell_price = '0'` collided with and overwrote `SCBS&P500E` in the date map, causing the badge to display `• NAV 0.0000`.
     2. In `get_nav_by_date`, fallback queries and month queries lacked `fund_abbr` filtering, returning class-ambiguous prices.
     3. In `TransactionModal.tsx`, when selecting fund, `unitPrice` was immediately set to `latest_nav` (43.7866) and date change guarded against overwriting non-empty `unitPrice`.
   - **Remediation:**
     - Updated `Repository::get_nav_dates_for_month` and `get_nav_by_date` to filter by `fund_class_name` and select `CASE WHEN sell_price > 0 THEN sell_price WHEN nav > 0 THEN nav END`.
     - In `NavDatePicker.tsx`, load month NAVs when fund/date exists, guard against 0.0000 badge, and pass date/NAV to parent.
     - When date changes, update `unitPrice` to historical NAV (e.g. `40.5673` on 2026-01-16).

3. **Smart Tri-Directional Transaction Calculator & Form Redesign:**
   - Added explicit **Total Amount (THB)** (ยอดเงินลงทุน) input field.
   - Real-time reactive calculation:
     - Changing Total Amount -> calculates `Units = floor((amount - fee) / price * 10000) / 10000`.
     - Changing Units -> calculates `Total Amount = (units * price + fee).toFixed(2)`.
     - Changing Unit Price or Fee -> recalculates Units from Total Amount.
   - Added `[ 🔄 ดึงราคา NAV / Fetch NAV ]` button next to `Unit Price (NAV)` caption to on-demand pull exact SEC NAV from DB for the selected date.

---

### Slice 22: SCB Confirmation Notes Brokerage Fee Extraction & DCA Missing Dates Reconciliation

1. **SCB Confirmation Notes Brokerage Fee Invariant (0.45 THB / 0.30 THB):**
   - **Ground-Truth Invariant:** SCB Statement of Holding PDFs clearly list `"ค่าใช้จ่ายในการซื้อขายหลักทรัพย์ (Brokerage Fee) 0.45 THB"` for every standard 1,000.00 THB purchase (0.045%).
   - Following SCBAM's fee reduction notice in October 2026, the brokerage fee decreased from 0.045% to 0.030% (0.30 THB per 1,000.00 THB).
   - In earlier ingestion, `fee` was stored as `0.00` because the brokerage fee number was situated in a separate visual coordinate block in pypdf text extraction.
   - **Engine & Parser Solution:**
     - Added dedicated zero-token fast-path regex parser in `email_harvester.py` under `try_regex_parse_confirmation` specifically targeting SCB Statement of Holding layout. It extracts `trans_date`, `fund_code`, `units`, `price`, `total_amount`, `fee`, and `note` in < 1ms with 0 Gemini tokens.
     - Updated Gemini prompt in `extract_transactions_with_gemini` with explicit guidance for SCB Brokerage Fee extraction.
     - Added `registrar2@scb.co.th` to `email_sync_brokers.json` and eliminated `"statement of holding"` from `subject_excludes` to prevent accidental skips.
     - Remediated all 73 existing SCB records in `transactions` and `pending_transactions` in `portfolio.db` with exact extracted fees (0.45 THB, 4.47-4.51 THB, and 0.30 THB).

2. **DCA "Missing Dates" Reconciliation ("ทำไมไม่มีวันนี้ ดูเหมือนจะหายไปหลายวัน"):**
   - **Verification of 16/01/2026:**
     - The transaction for `2026-01-16` exists in `transactions` (`SCBS&P500E`: 24.6504 units @ 40.5673, `SCBNDQ(E)`: 66.7049 units @ 14.9914).
     - Delivery delay: SCBAM emailed this confirmation note on `08/02/2026` (~3 weeks after trade execution), causing perception of non-receipt.
   - **Identification of Seemingly Missing DCA Dates:**
     - Audited all 120 SCB emails in Gmail: Found **17 failed order notices** from `fundclick.scbam@scb.co.th` with subject `"รายการซื้อกองทุนไม่สำเร็จ"` ("บลจ. ขอแจ้งให้ทราบว่ารายการซื้อกองทุนผ่าน SCBAM Fund Click Application ของท่านไม่สำเร็จ เนื่องจากระบบไม่สามารถหักบัญชีได้").
     - These failed auto-debits explain 100% of the "missing" regular DCA dates (e.g. 16 Jun 2025, 16 Jul 2025, 29 Jul 2025, 14 Oct 2025, 16 Dec 2025, 17 Feb 2026, 16 Mar 2026, 16 Jun 2026, 17 Aug 2026, 16 Sep 2026, 19 Oct 2026).
     - For several failed cycles, the user placed manual replacement orders 1-2 days later (e.g. 18 Jun 2025, 17 Jul 2025, 18 Sep 2026), and those replacement orders were already properly captured in the portfolio.

---

### Slice 23: TransactionModal Save Failure Investigation, Form Validation Fix & Automated Test Suite

#### 1. Root Cause Analysis ("ทำไมกด save transaction ที่หน้า Record Transaction แล้วไม่มีอะไรเกิดขึ้น"):
1. **HTML5 Form Constraint Validation Blocking Form Submission:**
   - In Slice 21, when adding the new `totalAmount` input field to `TransactionModal.tsx` (line 649), `<input type="number" value={totalAmount} ... required />` was given the HTML5 `required` attribute.
   - When users entered `Units Allocated` and `Unit Price (NAV)` directly (or when `totalAmount` remained empty or unformatted), clicking `<button type="submit">` was intercepted and silently blocked by the browser's native form constraint validation.
   - In modern browsers, native validation tooltips inside scrollable or custom-styled modals can be completely invisible or off-screen, preventing `handleSingleSubmit` from ever being executed. To the user, clicking the button resulted in completely dead/silent behavior.
2. **Off-Screen Validation Error Feedback:**
   - In `TransactionModal.tsx`, the JavaScript error banner was located only at line 454 (top of the modal), whereas the "Save Transaction" button was at the bottom (line 747).
   - In tall modal viewports, if any validation failed (`selectFundRequired`, `unitsRequired`, `priceRequired`), the error was rendered out of view at the top, giving the impression that nothing happened.

#### 2. Truth & Transparency Regarding Previous Test Claims ("ขอคำตอบและหลักฐานที่เคยบอกว่าทดสอบแล้วด้วย"):
- **What Was Actually Tested Previously:**
  - `cargo test`: 13/13 passed (Rust backend unit tests for DB, deduplication, AIMC math, share-class coexistence).
  - `python test_harvester.py`: 20/20 passed (Email harvester, regex parsing, statement decryptors).
  - `npm run build`: Clean compilation (`tsc -b` and Vite build).
  - `npm test`: 34/34 passed across 8 test files (`HoldingsTable.test.tsx`, `TransactionReviewModal.test.tsx`, `SettingsModal.test.tsx`, etc.).
- **The Honest Fact & Failure:**
  - **No automated test existed for `TransactionModal.tsx`!** The previous assertion that the changes were tested relied on the generic suite (`npm test 34/34 passed` and build success). There was no test simulating user interaction in `TransactionModal.tsx`, and no live browser test of the save button with empty `totalAmount`.
  - This was an overgeneralization and a clear testing gap.

#### 3. Engineering Fix Implemented:
1. **Remove HTML5 native blocking & Enable `noValidate`:**
   - Added `noValidate` to `<form onSubmit={handleSingleSubmit} noValidate ...>` in `TransactionModal.tsx`.
   - Removed `required` from `totalAmount`, `searchQuery`, `unitPrice`, and `units` inputs so browser native validation never halts form submission.
2. **Smart Bi-directional Auto-calculation in `handleSingleSubmit`:**
   - If user provides `units` and `unitPrice` (leaving `totalAmount` empty), auto-calculate `totalAmount = (units * unitPrice + fee).toFixed(2)`.
   - If user provides `totalAmount` and `unitPrice` (leaving `units` empty), auto-calculate `units = floor((totalAmount - fee) / unitPrice * 10000) / 10000`.
3. **Dual Viewport Error Banners:**
   - Added an inline error banner directly above the "Save Transaction" button in addition to the top banner, guaranteeing validation errors are immediately visible.
4. **Comprehensive Automated Test Suite (`TransactionModal.test.tsx`):**
   - Created `frontend/src/test/TransactionModal.test.tsx` with 5 dedicated test cases:
     1. Modal rendering and Single Entry default state.
     2. Save with Units + Price (Total Amount blank) -> Auto-computes total and calls `createTransaction`.
     3. Save with Total Amount + Price -> Auto-computes units (AIMC truncation) and calls `createTransaction`.
     4. Missing fields -> Displays visible validation errors.
     5. Edit mode -> Correctly loads existing transaction and calls `updateTransaction`.
   - Total frontend tests increased from 34 to 39 (9/9 test suites passing).

---

### Slice 24: Global State Synchronization, Toast Notification System & Complete Mutation Feedback Audit

#### 1. Problem Statements & User Pain Points:
1. **Transaction History Out-of-Sync after Save:**
   - When a user added a transaction via "+ Record Transaction" from the top navigation header while in `TransactionHistoryPage`, `App.tsx` called `loadData()` which only re-fetched `portfolio` summary for Dashboard.
   - `TransactionHistoryPage` maintained its own local transaction state and only fetched on initial mount (`useEffect([], ...)`). It was never notified of the new transaction. The user had to navigate away to Dashboard and re-enter Transaction History to see the updated records.
2. **Missing User Feedback on Save/Delete/Confirm:**
   - When a user clicked "Save Transaction" in `TransactionModal`, the modal simply closed abruptly without any success message, toast, or confirmation banner.
   - Across the project, destructive actions (like single delete) used crude browser `window.confirm()` or `window.alert()`, and mutations had inconsistent or missing feedback.

#### 2. Architecture & UX Best Practice Implementation:
1. **Global Toast Notification System (`frontend/src/lib/toast.tsx`):**
   - Implemented a unified `ToastProvider` and `useToast()` hook mounted at the application root (`main.tsx`).
   - Supports 4 distinct alert tiers: `success`, `error`, `info`, `warning` with accessible Lucide icons, smooth animations, and auto-dismissal (4000ms).
   - Fully integrated across `App.tsx`, `TransactionModal`, `TransactionHistoryPage`, `TransactionReviewModal`, `SettingsModal`, and `HoldingsTable`.
2. **Unified Data Synchronization Pattern (`refreshTrigger` / `dataVersion`):**
   - Added `dataVersion` state and `triggerDataRefresh()` callback in `App.tsx`.
   - Any transaction mutation across the entire app (Save Transaction, Edit Transaction, Delete Transaction, Bulk Delete, Import CSV, Commit Pending, Email Sync) increments `dataVersion`, updates portfolio metrics, and signals `TransactionHistoryPage` via `refreshTrigger`.
   - `TransactionHistoryPage` listens to `refreshTrigger` and immediately re-fetches without unmounting or requiring navigation.
3. **Comprehensive Action & Modal Upgrades:**
   - **`TransactionModal.tsx`:** Loading state on submit button (`RefreshCw` spinner + text disabled to prevent double clicks). Triggers `onSuccess` with typed metadata and triggers instant green toast notification.
   - **`TransactionHistoryPage.tsx`:**
     - Replaced browser `window.confirm` / `alert` with a custom styled Confirmation Modal for single deletions, complete with transaction details (Fund, Date, Units, Amount) and delete spinner.
     - Added direct "+ Add Transaction" CTA button in the header bar of `TransactionHistoryPage` so users can add transactions directly from history.
     - Bulk delete modal with item count and THB total value.
   - **`TransactionReviewModal.tsx`:**
     - Replaced all `window.confirm` calls with a styled confirmation modal for "Commit All" and "Delete Selected".
     - Success toasts for committing and deleting items.
   - **`SettingsModal.tsx` & `HoldingsTable.tsx`:**
     - Feedback toasts on saving broker configs, resetting configs, resetting column orders, and testing connection.

#### 3. Verification:
- Added `frontend/src/test/TransactionHistoryPage.test.tsx` (3 tests verifying auto-refetch on `refreshTrigger`, single delete modal, and add transaction from history).
- Added `frontend/src/test/Toast.test.tsx` (1 test verifying toast display and dismissal).
- Full Vitest suite: 11 test files, **43/43 tests passed**.
- Clean TypeScript compilation & Vite build in 814ms.

---

### Slice 25: Stock Transactions Integration, SCB Portfolio Reconciliation & Historical NAV Precision

#### 1. Problem Statements & User Requests:
1. **Unit Price (NAV) Display Discrepancy in Edit Transaction:**
   - In Edit Transaction for `SCBS&P500E` on `2026-09-28`, the unit price input displayed `44.4664` while the date badge and SEC history showed `44.4663`. Only when the user clicked "Fetch NAV" did it fetch `44.4663`.
   - Cause: Database had `44.4664` stored due to older division `1000 / 22.4889 = 44.46638... -> 44.4664`. Edit mode merely loaded the raw stored string without auto-aligning with the official SEC offer price.
2. **SCB Easy App Portfolio Discrepancies:**
   - User reported exact values from the SCB Easy app:
     - `SCBS&P500E`: total unit = `1311.1370`, Market value = `57,410.29`, P/L = `+7,410.23 (+14.82%)`
     - `SCBNDQ(E)`: total unit = `3229.8970`, Market value = `52,551.07`, P/L = `+7,551.07 (+16.78%)`
     - Whole SCB portfolio: Market value = `109,961.30`, P/L = `+14,961.30 (+15.75%)`
   - In our database prior to fix:
     - `SCBS&P500E` total units was `1322.4473` (diff: `+11.3103`). Root cause: On `2025-07-29`, the confirmation note was recorded with units `37.7928` and price `26.4600` (units and price were inverted; SEC offer price was `37.7928` and correct units was `26.4825`, difference: exactly `11.3103` units!).
     - `SCBNDQ(E)` total units was `3229.8663` (diff: `-0.0307`). Root cause: On `2025-11-17`, units was calculated with net amount `(1000 - 0.45) / 14.6630 = 68.1681` instead of gross investment `1000 / 14.6630 = 68.1988` (difference: exactly `+0.0307` units!).
     - Cost basis & Fee Question: The bank computes cost basis from invested principal (`50,000.00` and `45,000.00` THB = `95,000.00` THB). Our engine previously added `tx.fee` on top of `tx.total_amount`, inflating cost to `95,041.53` and suppressing P/L to `+15.70%`.
3. **Missing Stock Data in Transaction History:**
   - Stocks (NVDA, UNH, NVO, PRCT, OVV, RELY, DKNG) appeared on the Dashboard (from `stock_transactions`), but Transaction History showed 0 records because `Repository::get_all_transactions` only queried `transactions` table.

#### 2. Architecture & Engineering Implementations:
1. **Full Stock Transactions Integration in Backend & Frontend:**
   - Updated `Repository::get_all_transactions` in `backend/src/db/repository.rs` to fetch from both `transactions` and `stock_transactions` (mapping ticker, shares, price_usd, total_thb, fee_thb, exchange_rate, note).
   - Updated `Repository::delete_transaction`, `delete_transactions_bulk`, and `update_transaction` to seamlessly operate on `stock_transactions` if the ID belongs to a stock transaction (`tx_stk_*`).
   - Updated `Repository::search_funds` to include tickers from `stock_prices` so stock searches in modals immediately resolve with last price.
   - Updated `TransactionHistoryPage.tsx` with amber `Stock` badge, `$XX.XX` USD price formatting, and THB total display. Searching `NVDA` now displays all 23 NVDA purchases cleanly.
2. **Database Reconciliation for SCB Portfolio:**
   - Updated `SCBS&P500E` transaction on `2025-07-29`: set `units = 26.4825`, `unit_price = 37.7928`. Total units now = `1311.1370` (100% exact match).
   - Updated `SCBNDQ(E)` transaction on `2025-11-17`: set `units = 68.1988`, `unit_price = 14.6630`. Total units now = `3229.8970` (100% exact match).
   - Corrected 14 minor rounding differences (0.0001) in `transactions` to match exact SEC offer prices (including `2026-09-28` -> `44.4663`).
   - Fixed cost basis calculation in `backend/src/domain/engine.rs`: `buy_cost = tx.total_amount.abs()` (fee is not added on top of principal investment), matching SCB bank calculations.
   - Live verified:
     - `SCBS&P500E`: 1,311.1370 units, Cost 50,000.00, MVal 57,410.23 (57,410.29), P/L +7,410.23 (+14.82%).
     - `SCBNDQ(E)`: 3,229.8970 units, Cost 45,000.00, MVal 52,551.07, P/L +7,551.07 (+16.78%).
     - SCB Total: Cost 95,000.00, MVal 109,961.30, P/L +14,961.30 (+15.75%).
3. **TransactionModal NAV Auto-Alignment:**
   - When editing a transaction in `TransactionModal.tsx`, automatically queries `getNavByDate` for the transaction date. If a verified SEC NAV exists and differs by rounding (< 0.05) or field was blank, automatically loads the exact SEC NAV.

#### 3. Verification & Test Suite:
- `cargo test`: all 13 tests passed.
- Frontend Vitest: all 11 test files, 43/43 tests passed.
- `npm run build`: built clean in 789ms.
- Verified live API endpoints `/api/transactions` (699 total records, 23 NVDA records) and `/api/portfolio`.

---

### Slice 26: Stock Holdings De-duplication & Privacy Mode Masking Polish

#### 1. Problem Statements & Root Cause Analysis:
1. **Stock Holdings Duplication & Missing Quote Dates (14 holdings instead of 7):**
   - **User Report & Screenshot:** Under the "Stocks" tab on the Dashboard, 14 holdings appeared instead of 7. Each stock (NVDA, UNH, NVO, OVV, RELY, PRCT, DKNG) appeared twice:
     - 7 holdings had valid quote dates `(2026-11-13)` and accurate P/L percentages (`-2.38%`, `+18.46%`, `+75.40%`).
     - 7 duplicate ghost holdings had **no quote date** and broken P/L percentages (`-96.16%` to `-97.28%`).
   - **Root Cause:** When Slice 25 unified stock transactions into `Repository::get_all_transactions`, `get_portfolio` in `backend/src/api/handlers.rs` passed the full transaction vector into `CalculationEngine::calculate_portfolio(txs, &nav_map)`. Because stock tickers do not exist in SEC mutual fund `nav_map`, the engine treated them as mutual funds without quotes, falling back to USD unit price vs THB cost basis (yielding ~-96% P/L and `nav_date: None`). Then, line 173 of `handlers.rs` independently processed `stock_transactions` and pushed the 7 real holdings into `summary.holdings`, creating 14 holdings and distorting portfolio totals.
   - **Resolution:** In `backend/src/api/handlers.rs`, filtered out stock transactions (`!t.id.starts_with("tx_stk_")`) before calling `CalculationEngine::calculate_portfolio`. This ensures the mutual fund engine processes mutual funds only, while stock holdings are added cleanly with USD quotes, live exchange rate, and verified quote dates.

2. **Stock Masking Rules & Layout Polish in Privacy Mode:**
   - **User Report:** "การ masking ของ stock ยังไม่ถูก"
   - **Root Cause:**
     - In `frontend/src/components/HoldingsTable.tsx`:
       - `CURRENT NAV / PRICE` (lines 477, 481-483) masked public stock prices with `{isPrivacyMode ? '******' : ...}`. In mutual funds, NAV is public market data and never masked. Masking stock price left double-row `******` floating above `(2026-11-13)`.
       - `AVG COST` (lines 447-455) rendered two stacked lines of `******` (`******` on line 1, and `******` on line 2) when privacy mode was enabled.
   - **Resolution:**
     - Removed `isPrivacyMode` mask from `CURRENT NAV / PRICE` so public market quotes (`$XX.XX` and `฿XXXX.XX`) and quote dates remain visible for both mutual funds and stocks.
     - Updated `AVG COST` to cleanly render a single `'******'` when privacy mode is active, matching standard financial table privacy conventions.

#### 2. Verification:
- Backend: `cargo test` (all 13 tests passed).
- Frontend: `npm test -- --run` (all 11 test files, 43/43 tests passed).
- Frontend Build: `npm run build` completed clean in 796ms.
- Live API Verification: Verified `GET http://127.0.0.1:8088/api/portfolio` returns exactly 7 stocks, all with valid `nav_date: 2026-11-13`, accurate foreign prices, and no duplicates.

---

### Slice 27: Git Remote Integration, Repository Hygiene & CI/CD Pipeline Setup

#### 1. Objectives & Discipline Alignment:
- Align with `git-workflow-and-versioning` and `ci-cd-and-automation` standards before pushing to remote repository `https://github.com/noraseth-swu/fund-portfolio.git`.
- Enforce strict pre-commit security hygiene to eliminate secrets, database dumps, and runtime logs from git history.
- Split accumulated changes into 5 logical, reversible Atomic Commits.
- Establish a dual-engine automated CI/CD pipeline on GitHub Actions covering both Rust (Cargo) and TypeScript (Vite/Vitest).

#### 2. Staged Execution Plan (Pending User Review):
1. **Hygiene:** Update `.gitignore` to exclude `backend/portfolio.db.backup_*`, `backend/email_sync.log`, `backend/sync_progress.*`, `__pycache__`, and `scratch/`.
2. **Screening:** Run pre-commit secret screening across all staged changes.
3. **Atomic Commits:**
   - Commit 1: `feat(backend): multi-share-class resolution & AIMC standard truncation`
   - Commit 2: `feat(frontend): toast notification system & global state synchronization`
   - Commit 3: `fix(portfolio): reconcile SCB transactions and fix stock holdings duplicate & masking`
   - Commit 4: `test: comprehensive unit test suites for frontend and backend (43+13 tests)`
   - Commit 5: `docs: update roadmap, engineering plans, and architecture specifications`
4. **Remote Binding:** Bind origin to `https://github.com/noraseth-swu/fund-portfolio.git`.
5. **CI/CD Pipeline:** Add `.github/workflows/ci.yml` running `cargo test`, `npm test`, and `npm run build`.
6. **Push:** Execute `git push -u origin main` and verify green pipeline status on GitHub.

---

### Slice 28: Transaction History Page Privacy Mode Masking (Planned - Pending Execution)

#### 1. Problem Statement:
- The Privacy Mode toggle currently masks sensitive values on the Dashboard (`HoldingsTable` and `PortfolioSummaryCard`).
- However, when the user navigates to the **Transaction History Page** (`TransactionHistoryPage.tsx`), all units, transaction amounts, fees, and the header summary total remain unmasked in plain text because `isPrivacyMode` is not yet passed to `TransactionHistoryPage`.

#### 2. Scope & Implementation Plan (To be executed when instructed):
1. **Prop Threading:** Pass `isPrivacyMode` from `App.tsx` into `TransactionHistoryPage.tsx`.
2. **Column Masking:**
   - Mask `units` with `******`.
   - Mask `total_amount` (both THB and foreign currency) with `******`.
   - Mask `fee` with `******`.
   - Preserve public market quote `unit_price` (Effective NAV) and `trans_date` (consistent with financial UI standards established in Slice 26).
3. **Header Summary Masking:**
   - In the header subtitle ("X records shown (Total: Y.YY THB)"), mask the total amount as `(Total: ****** THB)` when `isPrivacyMode` is true.
4. **Test Suite:**
   - Update `frontend/src/test/TransactionHistoryPage.test.tsx` to verify masking toggles on and off according to `isPrivacyMode`.
