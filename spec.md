# Technical Specification & Implementation Plan
## Unified Staged Import, Multi-Row Transaction Entry & Fund Mapping Pipeline

**Document Status:** Ready for Review  
**Date:** 2026-11-15  
**Skills Applied:** `/planning-and-task-breakdown`, `/performance-optimization`, `engineering-rules`  
**Target Workspace:** `d:/git/fund-portfolio`

---

## 1. Objectives & Executive Summary

### 1.1 Core Problems Addressed
1. **Fund Fragmentation & Duplicate Entries:** Older statement confirmation notes use deprecated abbreviations (e.g. `TMBAALF`, `TMB50`, `EASTSPRING-USTECH`, `TTB-SMART-PORT-4`, `ONE-EUROPEAN`, `TISCOSTRAT`) which fail exact SEC matching and split into fragmented holding positions with missing NAV history.
2. **Inconsistent Importer Workflows:** The Email Harvester currently uses the staged review flow (`pending_transactions` + `TransactionReviewModal`), whereas the Universal Statement Importer (`CsvImportModal`) directly pushes records into the live `transactions` table without SEC fund matching assistance or historical NAV verification.
3. **Single-Row Manual Entry Bottleneck:** The `New Transaction` modal currently only allows creating one transaction at a time with full modal dismiss/reopen cycles.
4. **Database State Cleanup:** Existing corrupted/fragmented scan runs need to be completely cleared while strictly preserving user credentials, Gmail tokens, and SEC master data (`user_settings`, `funds`, `fund_nav_history`).

### 1.2 Target Deliverables
- **166+ Fund Name Mapping Table:** Extracted directly from official Eastspring announcements (PDF 1 & 2) and integrated into SEC fund matching logic.
- **Unified Review Architecture:** Both Email Harvester and Universal Importer (PDF/CSV/Text) route into `pending_transactions`, unlocking the exact same high-efficiency review, auto-completion, and inline modification UI.
- **Multi-Row / Batch Manual Entry:** User can switch or open a Batch Entry grid within `TransactionModal` with inline SEC autocomplete, date-based NAV auto-fill, and multi-row add/delete.
- **Safe DB Reset Execution:** Script to wipe `transactions`, `pending_transactions`, `processed_emails`, `processed_attachments`, and `pvd_positions` with safety guards.

---

## 2. Architecture & Data Flow

```
                      ┌──────────────────────────────────────┐
                      │             Input Sources            │
                      └──────────────────┬───────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
│ Email Harvester │             │Universal Importer│            │ Multi-Row Entry │
│(IMAP/PDF Attach)│             │ (PDF, CSV, Text)│             │ (Manual Input)  │
└───────┬─────────┘             └────────┬────────┘             └────────┬────────┘
        │                                │                               │
        │ Extract Rows                   │ Extract Rows                  │ Add Rows
        └─────────────────┬──────────────┴───────────────────────────────┘
                          │
                          ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                 SEC Matcher & Alias Normalizer                 │
        │  • 166 Eastspring / TMB / Thanachart Mappings (ES-... / A)     │
        │  • TTB Smart Port / TISCO / ONE Fund Aliases                   │
        │  • Historical NAV Lookup by Transaction Date                   │
        └───────────────────────────────┬────────────────────────────────┘
                                        │
                                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │            Database Staging: pending_transactions              │
        │  (batch_id: "email_sync" | "universal_import" | "manual_batch") │
        └───────────────────────────────┬────────────────────────────────┘
                                        │
                                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                 TransactionReviewModal (Unified)               │
        │  • Status Tabs (All, Exact, Fuzzy, None)                       │
        │  • FundSearchCombobox (Debounced SEC Search)                  │
        │  • Date-based NAV Lookup (/api/nav/by-date)                    │
        │  • Unit & Price Recalculation                                  │
        │  • Row Add / Edit / Delete / Selection Checkboxes              │
        └───────────────────────────────┬────────────────────────────────┘
                                        │ User Approves ("Commit Selected/All")
                                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │               Live Table: transactions (SQLite)                │
        │        Portfolio Holdings, Realized P/L & Cost Basis           │
        └────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Specifications

### 3.1 166 Eastspring & Platform Fund Aliases
Based on official announcement PDFs `029_สิ่งที่ส่งมาด้วย_1.pdf` (166 funds) and `029_สิ่งที่ส่งมาด้วย_2.pdf` (TMB50 unit classes):

| Source Pattern in Statement | Canonical SEC Fund Abbr | Project Symbol / Class | Note |
|---|---|---|---|
| `TMB50`, `TMB-50` | `ES-SET50-A` | `ES-SET50` | Class A Accumulation |
| `TMBAALF` | `ES-AALF` | `ES-AALF` | Asset Allocation Long Term |
| `TMBAGLF` | `ES-ASIA` | `ES-ASIA` / `ES-ASIA-A` | Asia Active Equity |
| `TMBASIAB` | `ES-ASIANBOND` | `ES-ASIANBOND` | Asian Bond |
| `T-CASH` | `ES-CASH` | `ES-CASH` | Thanachart Cash Mgmt |
| `TMBCB` | `ES-CB` | `ES-CB` | Corporate Bond |
| `T-EuropeEQ` | `ES-EUROPEEQ` | `ES-EUROPEEQ` | Thanachart Europe EQ |
| `TMB-ES-GCORE` | `ES-GCORE` | `ES-GCORE` | Global Core Equity |
| `EASTSPRING-USTECH` | `ES-USTECH` | `ES-USTECH` | US Info Tech |
| `EASTSPRING-GDEF` | `ES-GDIV` | `ES-GDIV` | Global Dividend Equity |
| `EASTSPRING-GIS` | `ES-GF` / `ES-GIS` | `ES-GF` | GIS Global Bond |
| `EASTSPRING-USBLUE` | `ES-USBLUECHIP` | `ES-USBLUECHIP` | US Blue Chip Equity |
| `TTB-SMART-PORT-4` | `tsp4-explorer` | `tsp4-explorer` | TTB Smart Port 4 |
| `TISCOSTRAT` | `TISCOSTR` | `TISCOSTR` | TISCO Strategic Fund |
| `ONE-EUROPEAN` | `ONE-EUROEQ` | `ONE-EUROEQ` | One European Equity |

*All 166 pairs will be compiled into `backend/scripts/fund_aliases.json` and loaded into both Python harvester and Rust backend SEC suggestion engine.*

### 3.2 Database Reset Procedure (`backend/scripts/reset_db.py`)
- **Preserved Tables (READ-ONLY during reset):**
  - `user_settings` (Gmail OAuth/App Password, DOB, National ID last 5)
  - `funds` (SEC Fund Master dataset with ~3,000+ mutual funds)
  - `fund_nav_history` (Historical NAVs)
- **Cleared Tables:**
  - `transactions` (All historical live records)
  - `pending_transactions` (All staged pending items)
  - `processed_emails` (Email sync idempotency hash cache)
  - `processed_attachments` (Attachment scan cache)
  - `pvd_positions` (Provident fund snapshot cache)
  - File cache `backend/sync_progress.json`

### 3.3 Universal Importer Unification (`CsvImportModal.tsx` -> `pending_transactions`)
1. In `CsvImportModal.tsx`:
   - After parsing CSV, PDF, or pasted text, instead of inserting directly into `transactions` via `createTransactionsBatch`, the system calls `POST /api/transactions/pending/batch` with `sync_batch_id: "universal_import"`.
   - On response, `CsvImportModal` closes and immediately opens `TransactionReviewModal` pre-filtered to the imported batch.
   - The user gets full SEC fund matching, confidence indicators, date-based NAV lookups, and inline editing before any transaction touches live portfolio holdings.
2. New Backend Endpoint:
   - `POST /api/transactions/pending/batch`: Accepts an array of pending transaction objects and inserts them in a single SQLite transaction with idempotency checks.

### 3.4 Multi-Row Transaction Entry (`TransactionModal.tsx`)
1. **Entry Mode Switcher:**
   - Add a segmented toggle or button in `TransactionModal.tsx`:
     - `[ รายการเดียว (Single) ]` | `[ หลายรายการ (Batch Entry) ]`
2. **Batch Entry Grid UI:**
   - Interactive table allowing rapid keyboard entry:
     - Columns: Platform, Date, Fund Search Combobox, Type (BUY/SELL), Units, Unit Price, Amount, Fee, Note, Delete Action.
     - Auto NAV Fetch: Selecting a fund + changing transaction date triggers background NAV lookup (`/api/nav/by-date`).
     - Auto Amount: Typing Units or NAV automatically calculates Amount (`Units * NAV + Fee`).
     - `+ เพิ่มแถว (Add Row)` shortcut button.
3. **Save Options:**
   - `บันทึกโดยตรง (Save Immediately)`: Directly calls batch insert into `transactions`.
   - `ส่งไปตรวจสอบ (Send to Review)`: Inserts into `pending_transactions` and opens `TransactionReviewModal`.

---

## 4. Performance Optimization Blueprint

Per `/performance-optimization` guidelines:

### 4.1 Index Optimization & Database Access
- **Existing indexes verified:**
  - `CREATE INDEX IF NOT EXISTS idx_pending_user_status ON pending_transactions(user_id, status);`
  - `CREATE INDEX IF NOT EXISTS idx_pending_batch ON pending_transactions(sync_batch_id);`
  - `CREATE INDEX IF NOT EXISTS idx_fund_nav_lookup ON fund_nav_history(proj_id, nav_date);`
- **Batching SQLite Operations:**
  - Avoid individual `INSERT INTO pending_transactions` loops.
  - Implement Rust transaction batching with `rusqlite::Transaction` to insert up to 500 rows in < 15ms.

### 4.2 Frontend Render & Bundle Efficiency
- **Autocomplete Combobox Debouncing:**
  - 250ms debounce with in-memory LRU cache (50 entries) in `FundSearchCombobox.tsx` to eliminate redundant SEC search calls.
- **Memoized Row Calculations:**
  - Wrap review grid rows and calculation hooks with `useMemo` and `useCallback` to prevent cascading re-renders when toggling single row checkboxes.
- **Virtualization Guard:**
  - For pending batches > 50 rows, paginate or window table view to maintain smooth 60fps scrolling and fast initial DOM painting.

---

## 5. Detailed Task Breakdown & Implementation Steps

### Task 1: Generate Fund Alias Database (166 Funds)
- **Files:** `backend/scripts/generate_aliases.py`, `backend/scripts/fund_aliases.json`
- **Action:** Parse `029_สิ่งที่ส่งมาด้วย_1.pdf` and `029_สิ่งที่ส่งมาด้วย_2.pdf` using Python `pypdf`, extract old->new abbreviation maps, and save to a clean JSON dictionary.
- **Verification:** Run test verifying that `TMBAALF` -> `ES-AALF`, `TMB50` -> `ES-SET50-A`, `T-CASH` -> `ES-CASH`, `TTB-SMART-PORT-4` -> `tsp4-explorer`.

### Task 2: Database Reset & Staging Cleanup Script
- **Files:** `backend/scripts/reset_db.py`
- **Action:** Update `reset_db.py` to also clear `pending_transactions`, then execute reset on `backend/portfolio.db`.
- **Verification:** Execute `python backend/scripts/reset_db.py` and inspect table row counts: `transactions` = 0, `pending_transactions` = 0, `user_settings` > 0.

### Task 3: Backend Batch Pending API
- **Files:** `backend/src/api/handlers.rs`, `backend/src/db/repository.rs`, `backend/src/api/mod.rs`
- **Action:** Add `POST /api/transactions/pending/batch` accepting `Vec<PendingTransactionInput>` wrapped in a single SQLite transaction.
- **Verification:** Write Rust unit test in `backend/tests/` and test via `cargo test`.

### Task 4: Standardize Universal Statement Importer
- **Files:** `frontend/src/components/CsvImportModal.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`
- **Action:**
  - Update `createPendingBatch` API client function.
  - Update `CsvImportModal` to stage parsed CSV/PDF/text rows into `pending_transactions` with `sync_batch_id: "universal_import"`.
  - Automatically open `TransactionReviewModal` upon successful staging.
- **Verification:** Upload sample statement PDF or CSV, verify rows appear in `TransactionReviewModal` with SEC suggestions and historical NAV.

### Task 5: Multi-Row Manual Transaction Entry
- **Files:** `frontend/src/components/TransactionModal.tsx`, `frontend/src/components/BatchTransactionModal.tsx`
- **Action:**
  - Implement multi-row entry mode in `TransactionModal` with a toggle tab.
  - Support inline `FundSearchCombobox`, date picker, auto-recalculating Units/Price/Amount.
  - Allow saving directly or sending to staged review.
- **Verification:** Add 3 rows in batch mode, verify validation works, and save successfully.

### Task 6: End-to-End Verification & Regression Testing
- **Actions:**
  - Run `python backend/scripts/test_harvester.py` (ensure 100% pass rate).
  - Run `cargo test` in `backend/`.
  - Run `npm test -- --run` and `npm run build` in `frontend/`.
  - Verify live UI on `http://localhost:5173`.

### Task 7: Email Sync & Staged Review Filtering by Bank / Platform (Completed)
- **Files:** `frontend/src/components/EmailSyncModal.tsx`, `frontend/src/components/TransactionReviewModal.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/i18n.tsx`
- **Action:**
  - `EmailSyncModal`: When scan is completed, render a bank summary grid showing found transactions and total amount grouped by bank (`ttb`, `Dime!`, `SCB`, `KBank`, `KBank PVD`). Each card has a `เลือก [ธนาคาร] →` button.
  - `TransactionReviewModal`: Added Bank / Platform filter bar (`[ทุกธนาคาร]`, `[ttb]`, `[Dime!]`, `[SCB]`, `[KBank]`, `[KBank PVD]`) with transaction counts, bank total amounts, quick select/deselect per bank, row platform badges with distinctive bank branding, and a `ยืนยันเฉพาะ [ธนาคาร] ที่เลือก` button.
  - `App.tsx`: Wired `reviewPlatformFilter` state so selecting a bank in `EmailSyncModal` opens `TransactionReviewModal` pre-filtered to that platform.
- **Verification:** Unit tests in `frontend/src/test/TransactionReviewModal.test.tsx` (3/3 passed). Total frontend vitest tests: 23/23 passed. `npm run build` passed.

---

## 6. Acceptance Criteria

1. **Clean Database:** DB reset executes cleanly without deleting Gmail tokens or user settings.
2. **Fund Mapping Accuracy:** Statements containing `TMB50`, `TMB-ES-GCORE`, `TMBAALF`, `TTB-SMART-PORT-4`, `ONE-EUROPEAN`, `TISCOSTRAT` match directly to SEC canonical symbols without manual typing.
3. **Universal Importer Flow:** CSV and PDF imports enter the staged review queue (`TransactionReviewModal`) with confidence indicators and SEC suggestions.
4. **Multi-Row Entry Flow:** Users can add multiple transactions simultaneously from the `New Transaction` modal.
5. **Bank / Platform Filtering:** Users can filter and commit transactions per bank (`ttb`, `Dime!`, `SCB`, `KBank`, `KBank PVD`) from both `EmailSyncModal` summary and `TransactionReviewModal`.
6. **Zero Compile / Build Errors:** Frontend TypeScript build (`npm run build`) and Rust backend compilation (`cargo check`) succeed with zero warnings or errors.
