# SEC Open API Master Rule: Financial Accuracy & Multi-Class Pricing Integrity

> **Core Axiom:**
> *"Financial accuracy is non-negotiable. A portfolio tracking platform must never trade precision for convenience. Dropping share class suffixes, collapsing distinct unit classes, or cross-pollinating NAVs between classes compromises portfolio valuation integrity."*

---

## 1. SEC Open API Data Architecture & Profiling Findings

From empirical analysis of **9,020 mutual funds** and **68,691 historical NAV records** from the Thai SEC Open API (`/v2/fund/`):

### 1.1 Project (`proj_id`) vs Share Class (`fund_class_name`)
* **`proj_id` (e.g. `M0643_2555`, `M0005_2558`):** Identifies the **umbrella fund scheme** registered with the SEC.
* **`fund_class_name` (e.g. `SCBS&P500E`, `SCBS&P500(SSFA)`, `SCBCHAE`, `SCBCHAP`):** Identifies the **specific unitholder class (ชนิดหน่วยลงทุน)**.
* In Thailand, a single project often holds **up to 7 distinct share classes**.
  * `M0643_2555` (SCBS&P500): 7 classes (`SCBS&P500`, `SCBS&P500P`, `SCBS&P500E`, `SCBS&P500-SSF`, `SCBS&P500A`, `SCBS&P500(SSFE)`, `SCBS&P500(SSFA)`)
  * `M0005_2558` (SCBCHA): 6 classes (`SCBCHA`, `SCBCHAP`, `SCBCHAE`, `SCBCHA-SSF`, `SCBCHAA`, `SCBCHA(SSFE)`)
  * `M0311_2564` (SCBNDQ): 5 classes (`SCBNDQ(E)`, `SCBNDQ(A)`, `SCBNDQ(SSF)`, `SCBNDQ(P)`, `SCBNDQ(SSFE)`)
  * `M0301_2567` (KKP US500): 4 classes (`KKP US500-UH`, `KKP US500-UH-M`, `KKP US500-UH-SSF`, `KKP US500-UH-E`)

### 1.2 The Share Class NAV Divergence Reality
Share classes are **economically distinct investment vehicles** despite sharing the underlying asset pool:
1. **Inception Date Asymmetry:** Classes are launched at different times (e.g. Class E launched years after Class A), meaning initial NAVs (starting at 10.00 THB) began compounding from different benchmark dates.
2. **Fee Tier Differentiation:** E-Classes (Electronic) feature zero or reduced front-end and management fees compared to standard banking agent classes, compounding NAV higher over time.
3. **Dividend Policies (XD Events):**
   * Class A (Accumulation / สะสมมูลค่า): Does not distribute cash dividends; net gains are reinvested, causing NAV to compound continuously.
   * Class D (Dividend / ปันผล): Pays cash dividends to unitholders; NAV drops by the dividend distribution amount on every XD date.
4. **Empirical Divergence:**
   * In `M0005_2558`: `SCBCHAE` NAV is **9.4122** vs `SCBCHAP` NAV is **7.4113** (**>27.0% variance**).
   * In `M0643_2555`: `SCBS&P500E` NAV is **43.349** vs `SCBS&P500(SSFA)` NAV is **37.4797** (**>15.6% variance**).

> [!CAUTION]
> If a system strips share class suffixes like `(A)`, `(E)`, or `-SSF` and fetches the latest NAV of the `proj_id` generically, the user will be assigned the wrong class's NAV, causing an instantaneous 15%–30% portfolio error!

---

## 2. The Master Rules (Golden Axioms)

### Rule 1: Composite Key Integrity
The atomic pricing unit of the SEC API is **`(proj_id, fund_class_name, nav_date)`**, NOT `(proj_id, nav_date)`.
* **Database Requirement:**
  ```sql
  CREATE TABLE fund_nav_history (
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
* Ingestion queries (`save_nav_history`) must use:
  ```sql
  ON CONFLICT(proj_id, nav_date, fund_class_name) DO UPDATE SET ...
  ```
  This guarantees that SEC updates for multiple classes on the same day never overwrite each other.

---

### Rule 2: Class-Preserving Representation
1. **Never drop class identifiers** in transactions, holdings, or pending tables.
2. If a statement says `SCBS&P500E`, the ticker stored in `transactions.fund_abbr` is `SCBS&P500E`.
3. If a statement says `SCBCHINA(A)`, the ticker stored in `transactions.fund_abbr` is `SCBCHA(A)`.
4. Engine tracking keys must be `(proj_id, fund_abbr, platform)` so that holdings in Class E and Class A of the same fund remain distinct.

---

### Rule 3: Hierarchical Class-Aware NAV Lookup
When calculating current market value or resolving staged transactions:

```
[ User Holds Ticker (e.g. SCBS&P500E) ]
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│ TIER 1: Exact Share Class Match                        │
│ Query fund_nav_history WHERE proj_id = ?               │
│   AND fund_class_name = user_ticker                    │
│   OR fund_class_name = alias.canonical_abbr            │
│ ORDER BY nav_date DESC LIMIT 1                         │
└──────────────────────────┬─────────────────────────────┘
                           │ If Not Found
                           ▼
┌────────────────────────────────────────────────────────┐
│ TIER 2: Base Fund Match (For single-class funds only)   │
│ Query fund_nav_history WHERE proj_id = ?               │
│   AND (fund_class_name = '' OR fund_class_name = proj) │
│ ORDER BY nav_date DESC LIMIT 1                         │
└──────────────────────────┬─────────────────────────────┘
                           │ If Not Found
                           ▼
┌────────────────────────────────────────────────────────┐
│ TIER 3: Last Verified Confirmation Note Price          │
│ Use unit_price from the statement transaction          │
└────────────────────────────────────────────────────────┘
```

---

### Rule 4: SEC Aliasing Contract in `fund_aliases`
The `fund_aliases` table serves as the bridge between diverse banking statement notations and SEC canonical classes:

| Bank Statement Notation | SEC `proj_id` | SEC `canonical_abbr` | SEC Official Display Name |
| :--- | :--- | :--- | :--- |
| `SCBS&P500E` | `M0643_2555` | `SCBS&P500E` | กองทุนเปิดไทยพาณิชย์หุ้นยูเอส (ช่องทางอิเล็กทรอนิกส์) |
| `SP500E` | `M0643_2555` | `SCBS&P500E` | กองทุนเปิดไทยพาณิชย์หุ้นยูเอส (ช่องทางอิเล็กทรอนิกส์) |
| `SCBS&P500FUND` | `M0643_2555` | `SCBS&P500` | กองทุนเปิดไทยพาณิชย์หุ้นยูเอส |
| `SCBNDQ(E)` | `M0266_2564` | `SCBNDQ(E)` | กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว (ช่องทางอิเล็กทรอนิกส์) |
| `NDQ(E)` | `M0266_2564` | `SCBNDQ(E)` | กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว (ช่องทางอิเล็กทรอนิกส์) |
| `SCBCHINA(A)` | `M0005_2558` | `SCBCHAA` | กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (ชนิดสะสมมูลค่า) |
| `SCBCHA(A)` | `M0005_2558` | `SCBCHAA` | กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ (ชนิดสะสมมูลค่า) |
| `SCBCHINA` | `M0005_2558` | `SCBCHA` | กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ |
| `ES-USTECH` | `M0429_2564` | `ES-USTECH` | กองทุนเปิดอีสท์สปริง US Information Technology |
| `ONE-EUROPEAN-EQ` | `M0098_2558` | `ONE-EUROPEAN-EQ` | กองทุนเปิด วรรณ ยูโรเปี้ยน อิควิตี้ |

---

## 3. Implementation Checklist & Verification Gates
- [ ] Schema Migration: Update `fund_nav_history` to `PRIMARY KEY (proj_id, nav_date, fund_class_name)`
- [ ] Ingestion Fix: Update `ON CONFLICT` in `repository.rs` line 136
- [ ] Query Fix: Update `get_latest_nav_map` in `repository.rs` line 192 to match on `fund_class_name`
- [ ] SEC Client: Verify pagination on `/v2/fund/daily-info/nav` stores all returned classes
- [ ] Regression Test: Verify `M0005_2558` stores both `SCBCHAE` (9.4122) and `SCBCHAP` (7.4113) simultaneously without collision
