# Comprehensive Remediation Plan & Test Matrix: Fund Portfolio Management System

**Document Version:** 1.0  
**Status:** Approved for Execution  
**Target Slices:** Tracks A, B, C  
**Reference Document:** Swarm Assessor Audit Report

---

## 1. Executive Summary & Strategy

Following the deep codebase audit of the Fund Portfolio system, 12 vulnerabilities and architectural gaps were identified. Left unaddressed, these issues cause silent 15%–30% portfolio valuation distortions on multi-class funds, false ~97% capital losses on US stocks, `SQLITE_BUSY` database write crashes under background sync, rate-limiting cascading bans from the SEC Open API, timezone date slippage in the frontend, and incomplete internationalization.

This remediation plan establishes:
1. **3 Decoupled Implementation Tracks** (Tracks A, B, and C) organized by criticality and dependency boundaries.
2. **Exhaustive Test Matrix** featuring unit tests, invariant property tests, 5 real-world Thai investor archetypes, and an automated i18n unicode scanner.
3. **Collision-Free Execution Protocol** guaranteeing that backend engine changes, database infrastructure, and frontend UI refactoring proceed in parallel without merge conflicts.

---

## 2. Implementation Tracks Breakdown (12 Issues)

### Track A: P0 Critical Engine & DB Fixes

#### Issue 1: Multi-Class Share NAV Divergence & Grouping Collapse
- **Target Files**: `backend/src/db/repository.rs` (Lines 245–285), `backend/src/domain/engine.rs` (Lines 54–66, 129–135)
- **Root Cause**:
  `Repository::get_latest_nav_map` uses `SELECT proj_id, MAX(fund_abbr) AS fund_abbr ... GROUP BY proj_id`. If an investor holds multiple share classes under one project (e.g., `SCBS&P500E` and `SCBS&P500(SSFA)` under `M0643_2555`), only one class survives the subquery. In `calculate_portfolio`, `nav_map.get(&class_key)` misses the omitted class and falls back to parent `proj_id`, inheriting the winner class NAV (up to 27% valuation divergence).
- **Remediation Specification**:
  1. Change the subquery in `get_latest_nav_map`:
     ```sql
     FROM (
         SELECT proj_id, COALESCE(fund_abbr, proj_id) AS fund_abbr 
         FROM transactions 
         WHERE user_id = ?1 
         GROUP BY proj_id, COALESCE(fund_abbr, proj_id)
     ) t
     ```
  2. In `get_latest_nav_map`, join `fund_nav_history` matching both `proj_id` and `fund_class_name = t.fund_abbr` (or fallback to parent).
  3. Ensure `map` explicitly stores both `class_key` (`"{proj_id}:{fund_abbr}"`) and fallback parent `proj_id`.
- **Acceptance Criteria**:
  Holding both `SCBCHA` Class E and Class P produces two distinct holdings with different NAVs (`9.4122` vs `7.4113`), matching bank app balances down to 2 decimal places.

---

#### Issue 2: US Stock Dual-Architecture Fracture & Missing Currency Conversion
- **Target Files**: `backend/src/api/handlers.rs` (Lines 80–84), `backend/src/db/repository.rs` (Lines 468–482), `backend/src/domain/engine.rs` (Lines 136–167)
- **Root Cause**:
  1. UI/CSV manual stock transactions are stored in `transactions` with `unit_price` in USD and `total_amount` in THB.
  2. `handlers.rs` filters out only transactions with ID starting with `"tx_stk_"`. Manual transactions have UUIDs, so they enter `CalculationEngine::calculate_portfolio`.
  3. In `calculate_portfolio`, `current_nav` falls back to `tracker.last_unit_price` in USD ($120).
  4. Market value is computed as `10 shares * $120 = 1,200 THB`, while cost is `42,000 THB`, creating a false -97% portfolio crash (-40,800 THB).
- **Remediation Specification**:
  1. Detect asset type in `CalculationEngine`: if `tx.platform == Dime && tx.proj_id` matches US ticker pattern (or `asset_type == "STOCK"`):
     - Calculate implied FX rate from original purchase: `implied_fx = tx.total_amount / (tx.units * tx.unit_price)`.
     - Or store and retrieve `price_currency` ("USD" vs "THB") and normalize `current_nav` to THB (`last_unit_price * fx_rate`) before computing `market_value = units * current_nav_thb`.
  2. Unify Dime stock transaction fetching so harvester and UI transactions follow the exact same normalization pipeline.
- **Acceptance Criteria**:
  An investor buying 10 shares of NVDA at $150 USD with THB 52,500 invested sees a market value of THB 52,500+ (or current USD price * current FX rate) and 0% unrealized P/L on day 1, never -97%.

---

#### Issue 3: Missing SQLite `busy_timeout` (SQLITE_BUSY Concurrency Deadlock)
- **Target Files**: `backend/src/db/mod.rs` (Lines 14–23), `backend/scripts/email_harvester.py` (Lines 1364, 1430)
- **Root Cause**:
  `init_db` sets WAL mode but omits `.busy_timeout(...)`. The Python harvester uses default `sqlite3.connect(db_path)`. When `BackfillService` or `email_harvester.py` writes in a transaction, concurrent API requests crash with `database is locked`.
- **Remediation Specification**:
  1. In `backend/src/db/mod.rs`:
     ```rust
     let connection_options = SqliteConnectOptions::from_str(database_url)?
         .create_if_missing(true)
         .journal_mode(SqliteJournalMode::Wal)
         .synchronous(SqliteSynchronous::Normal)
         .busy_timeout(std::time::Duration::from_secs(30))
         .foreign_keys(true);
     ```
  2. In `backend/scripts/email_harvester.py`:
     ```python
     conn = sqlite3.connect(db_path, timeout=30.0)
     conn.execute("PRAGMA journal_mode=WAL;")
     conn.execute("PRAGMA busy_timeout=30000;")
     ```
- **Acceptance Criteria**:
  Simultaneous execution of SEC history backfill, Python email harvester sync, and 20 parallel UI transaction CRUD calls completes with 0 `SQLITE_BUSY` or `database is locked` errors.

---

#### Issue 4: Sell-Before-Buy & Out-of-Order Transaction Clamping
- **Target Files**: `backend/src/domain/engine.rs` (Lines 93–112)
- **Root Cause**:
  When processing `TransactionType::Sell`:
  - If `tracker.units <= 0`, the sell transaction is silently skipped. Cash proceeds and realized P/L are lost.
  - When `units_to_sell > tracker.units`, `cost_of_units_sold = units_to_sell * avg_cost` exceeds `tracker.total_cost`, driving `tracker.total_cost` negative and corrupting P/L.
- **Remediation Specification**:
  1. Sort transactions chronologically: `trans_date ASC, (Buy -> Dividend -> Sell)`.
  2. When `units_to_sell > tracker.units`:
     - If `tracker.units > 0`: `cost_of_units_sold = tracker.total_cost`. Compute realized P/L on available units.
     - Unmatched sell units: Record in an `unmatched_sell_units` position field.
     - Clamp `tracker.units = Decimal::ZERO` and `tracker.total_cost = Decimal::ZERO`. Never allow negative cost or negative units.
- **Acceptance Criteria**:
  Importing a sell of 100 units before buy, followed by a buy of 100 units, maintains non-negative cost basis, clamps cost to available capital, and records zero negative holdings.

---

### Track B: P1 Robustness & Architecture

#### Issue 5: Shared SEC Client Rate Limiter (Token Bucket / Shared Mutex)
- **Target Files**: `backend/src/sec/client.rs` (Lines 46–54), `backend/src/sync/worker.rs`, `backend/src/sync/backfill.rs`, `backend/src/api/handlers.rs`
- **Root Cause**:
  `SecClient::throttle` uses instance-local `last_request_time: Option<Instant>`. Creating multiple `SecClient` instances causes concurrent calls to hit `api.sec.or.th` simultaneously, triggering HTTP 429.
- **Remediation Specification**:
  1. In `sec/client.rs`, replace private `Option<Instant>` with a shared throttle mechanism:
     ```rust
     #[derive(Clone)]
     pub struct SecClient {
         client: reqwest::Client,
         base_url: String,
         last_request: Arc<tokio::sync::Mutex<Option<Instant>>>,
         min_interval: Duration,
     }
     ```
  2. In `throttle(&self)`:
     ```rust
     let mut lock = self.last_request.lock().await;
     if let Some(last) = *lock {
         let elapsed = last.elapsed();
         if elapsed < self.min_interval {
             sleep(self.min_interval - elapsed).await;
         }
     }
     *lock = Some(Instant::now());
     ```
- **Acceptance Criteria**:
  Triggering manual NAV sync while background backfill is running guarantees >= 16ms between all outgoing HTTP requests across all threads; 0 HTTP 429 errors encountered.

---

#### Issue 6: SEC Cursor Pagination Infinite Loop Defense
- **Target Files**: `backend/src/sec/client.rs` (Lines 150–183)
- **Root Cause**:
  `get_paged_all` continues looping as long as `next_cursor` is present, without verifying if `items` is empty, if the cursor is repeating, or if an upper iteration boundary is reached.
- **Remediation Specification**:
  Add loop guards in `get_paged_all`:
  ```rust
  let mut page_count = 0;
  loop {
      page_count += 1;
      let paged: SecPagedResponse<T> = self.get_paged_single(endpoint, &query_params).await?;
      if paged.items.is_empty() || page_count > 500 {
          break;
      }
      all_items.extend(paged.items);
      match paged.next_cursor {
          Some(ref next) if !next.trim().is_empty() && cursor.as_deref() != Some(next) => {
              cursor = Some(next.clone());
          }
          _ => break,
      }
  }
  ```
- **Acceptance Criteria**:
  Mock SEC response with static cursor or empty items terminates within 1 iteration; max cap prevents runaway thread execution.

---

#### Issue 7: Arbitrary Class Selection in `funds.last_nav` and Date Lookup
- **Target Files**: `backend/src/db/repository.rs` (Lines 155–170, 920–939)
- **Root Cause**:
  `upsert_nav_history` updates `funds.last_nav` using whatever item is last in `nav_items.iter().rev()`. Multi-class responses update the umbrella fund with an arbitrary share class.
- **Remediation Specification**:
  1. In `upsert_nav_history`, filter `nav_items` for the base/accumulation class or match `fund_class_name == fund.proj_abbr_name` before updating `funds.last_nav`.
  2. In `get_nav_by_date`, match exact `fund_class_name = ?3` or alias canonical name before falling back to `'main'`.
- **Acceptance Criteria**:
  Umbrella fund search and dropdown displays the primary fund class NAV rather than an arbitrary sub-class.

---

#### Issue 8: Frontend Timezone Date Drift (UTC vs ICT)
- **Target Files**: `frontend/src/components/NavDatePicker.tsx` (Lines 29, 55, 126–127)
- **Root Cause**:
  `new Date("YYYY-MM-DD")` evaluates as UTC midnight, shifting to previous day in timezones behind UTC. `toISOString().split('T')[0]` before 07:00 AM ICT returns yesterday.
- **Remediation Specification**:
  1. Parse date string without `new Date(value)` UTC conversion:
     ```typescript
     const parseLocalDate = (dStr: string) => {
       const [y, m, d] = dStr.split('-').map(Number);
       return { year: y, month: m - 1, day: d };
     };
     ```
  2. Format current date using local calendar getters:
     ```typescript
     const getTodayLocalDateStr = () => {
       const now = new Date();
       const y = now.getFullYear();
       const m = String(now.getMonth() + 1).padStart(2, '0');
       const d = String(now.getDate()).padStart(2, '0');
       return `${y}-${m}-${d}`;
     };
     ```
- **Acceptance Criteria**:
  Clicking "Today" at 01:30 AM ICT returns the current day's date; user in UTC-5 sees correct day without -1 offset.

---

#### Issue 9: Frontend Buddhist Era (BE) Year Overflow
- **Target Files**: `frontend/src/components/NavDatePicker.tsx` (Lines 160, 298)
- **Root Cause**:
  When input value is already formatted in Buddhist Era (e.g. `2569-01-01`), `viewYear + 543` outputs `3112`.
- **Remediation Specification**:
  Normalize `viewYear` on ingest:
  ```typescript
  const normalizeYear = (year: number) => (year > 2400 ? year - 543 : year);
  ```
  Render:
  ```typescript
  const displayYear = locale === 'th' ? normalizeYear(viewYear) + 543 : normalizeYear(viewYear);
  ```
- **Acceptance Criteria**:
  Any input year > 2400 displays as 2569 in Thai locale, 2026 in English locale, and never > 3000.

---

#### Issue 10: Local PDF.js Worker Bundle & Syllable Spacing
- **Target Files**: `frontend/src/lib/pdfParser.ts` (Lines 4, 66–72)
- **Root Cause**:
  Worker is fetched from `https://unpkg.com/...`, failing in offline/homelab setups. Joining text items with `' '` breaks Thai words into isolated syllables (`ก อง ทุน`).
- **Remediation Specification**:
  1. Bundle `pdf.worker.min.mjs` into `frontend/public/` or bundle via Vite worker import:
     ```typescript
     import * as pdfjsLib from 'pdfjs-dist';
     pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
       'pdfjs-dist/build/pdf.worker.min.mjs',
       import.meta.url
     ).toString();
     ```
  2. In text extraction: if adjacent text items have contiguous horizontal bounds (`item.transform[4]`) and contain Thai characters, concatenate without spaces.
- **Acceptance Criteria**:
  PDF parser operates with no internet connection (offline mode); extracted Thai fund names match regex patterns without fragmented spaces.

---

### Track C: P2 i18n & Completeness

#### Issue 11: Complete i18n Dictionary & Modal Key Extraction
- **Target Files**:
  - `frontend/src/lib/i18n.tsx`
  - `frontend/src/components/SyncCacheManagerModal.tsx` (Currently 0% i18n)
  - `frontend/src/components/SettingsModal.tsx`
  - `frontend/src/components/TransactionReviewModal.tsx`
  - `frontend/src/components/EmailSyncModal.tsx`
  - `frontend/src/components/NavDatePicker.tsx`
  - `frontend/src/components/TransactionHistoryPage.tsx`
- **Remediation Specification**:
  1. Add full set of translation keys to `translations.th` and `translations.en`:
     - `syncCacheManager.*`: title, cachedEmails, clearCache, resync, bankFilter, etc.
     - `settings.*`: masterBrokers, passwordRules, backfillProgress, etc.
     - `reviewModal.*`: selectAll, deselectAll, tableHeaders (date, fund, type, units, price, amount, fee, status), confirmApprove, confirmReject, etc.
     - `emailSync.*`: stepLabels, unitMessages, unitFiles, unitRecords, etc.
     - `navDatePicker.*`: hasNav, fetchingSec, selectFundFirst, today, etc.
     - `txHistory.*`: filterAllTypes, filterBuy, filterSell, filterDividend, etc.
  2. Replace all hardcoded Thai strings in JSX with `t('...')`.
- **Acceptance Criteria**:
  Switching language to English displays 0 hardcoded Thai strings across all 6 modals and history page (excluding user data/fund names).

---

#### Issue 12: Initial Database Seeding Pagination
- **Target Files**: `backend/src/main.rs` (Lines 95–108)
- **Root Cause**:
  `main.rs` calls `sec_client.get_fund_profiles(None).await`, which only fetches 100 funds on page 1.
- **Remediation Specification**:
  In `main.rs`, during initial seed when fund count is 0:
  - Call `sec_client.get_paged_all("fund/profile", &[], 100)` to populate full catalog, or seed the top active AMCs (e.g. SCBAM, Kasikorn, TTB, BBLAM) in batches of 100 up to 1,000 active funds.
  - Log progress clearly with elapsed time and total fund count.
- **Acceptance Criteria**:
  A fresh startup seeds >= 500 funds immediately into SQLite, enabling instant search and auto-complete.

---

## 3. Test Matrix for Tester & QA

### The 5 Real-World Thai Investor Archetype Fixtures

1. **Archetype 1: The Multi-Class Thai Indexer**
   - **Profile**: Holds 3 distinct share classes of `SCBCHA` (`M0005_2558`) and `SCBS&P500` (`M0643_2555`):
     - `SCBS&P500E` (E-Class zero fee): 22.3608 units @ 44.7211 NAV
     - `SCBS&P500(SSFA)` (Tax allowance SSF): 22.5000 units @ 44.4444 NAV
     - `SCBCHA` Class E (NAV 9.4122) + Class P (NAV 7.4113)
   - **Verification**: `summary.holdings` must return distinct holding items with independent NAVs matching `fund_nav_history`. Unrealized P/L must not cross-contaminate.

2. **Archetype 2: The Global US Equity & Tech Picker**
   - **Profile**: Uses Dime and manual UI to trade US stocks in USD with THB funding:
     - 10 shares of NVDA bought at $130 USD (total paid: 45,500 THB; implied FX: 35.0)
     - 5 shares of AAPL bought at $220 USD (total paid: 38,500 THB)
     - 1 dividend of $15 USD (received 525 THB)
   - **Verification**: Portfolio market value reflects total THB equivalent (~84,000 THB). Unrealized P/L is ~0% on cost basis, not -97%.

3. **Archetype 3: The Systematic DCA & Tax Saver**
   - **Profile**: Monthly DCA purchases into ThaiESG, SSF, and RMF across KBank, SCB, and TTB:
     - 12 consecutive monthly buys of `K-USA(UH)`
     - Semi-annual dividend payouts
     - 1 partial redemption of 20% holdings
   - **Verification**: AIMC 4-decimal truncation matches K-PLUS transaction slips. Realized gain from redemption accurately accounts for average cost.

4. **Archetype 4: The Out-of-Order & Legacy Migrator**
   - **Profile**: Migrated historical data via CSV or multi-file statement upload:
     - Transaction 1: Sell 50 units (executed on 2024-01-15, but purchase records from 2023 missing)
     - Transaction 2: Buy 100 units on 2024-02-01
     - Transaction 3: Sell 120 units on 2024-03-01 (oversell by 20 units)
   - **Verification**: Clamping ensures `total_cost >= 0`, `units >= 0`. System flags 20 unmatched units in audit warnings without crashing or corrupting subsequent calculations.

5. **Archetype 5: The Automated Homelab Multi-Broker Exporter**
   - **Profile**: Self-hosted Docker instance running unattended:
     - Background SEC NAV history sync running for 50 funds
     - Python email harvester ingesting encrypted PDFs every 15 minutes
     - User navigating UI and approving staged transactions simultaneously
     - Offline environment with no internet access to `unpkg.com`
   - **Verification**: Zero `SQLITE_BUSY` lockups. PDF parser decrypts and extracts statements using local worker bundle. Shared SEC rate limiter throttles API traffic strictly >= 16ms.

---

## 4. Execution Order & Collision Prevention Matrix

| Phase | Tracks / Issues | Components Modified | Owner Role | Collision Prevention Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1: Foundation & DB Lockup Defense** | Track A3, Track B5, Track B6 | `backend/src/db/mod.rs`<br>`backend/src/sec/client.rs`<br>`backend/scripts/email_harvester.py` | Implementer (Infra) | Pure infrastructure changes. Does not touch domain models or calculation logic. |
| **Phase 2: Core Engine & DB Reconciliation** | Track A1, Track A2, Track A4, Track B7, Track C12 | `backend/src/db/repository.rs`<br>`backend/src/domain/engine.rs`<br>`backend/src/api/handlers.rs`<br>`backend/src/main.rs` | Implementer (Backend) | Locked to backend domain & DB queries. Tester builds Archetypes 1–4 fixtures in parallel. |
| **Phase 3: Frontend Resilience & i18n** | Track B8, Track B9, Track B10, Track C11 | `frontend/src/lib/i18n.tsx`<br>`frontend/src/lib/pdfParser.ts`<br>`frontend/src/components/*` | Implementer (Frontend) | Modifies only `frontend/src/`. Completely decoupled from Rust backend changes. |
| **Phase 4: Verification & QA Sign-off** | All Issues & Archetypes | `backend/tests/*`<br>`frontend/src/test/*` | Tester & QA | Executes comprehensive test matrix, Archetypes 1–5, and i18n scanner. |
