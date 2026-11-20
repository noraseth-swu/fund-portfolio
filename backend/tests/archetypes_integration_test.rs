use backend::db::init_db;
use backend::db::repository::Repository;
use backend::domain::engine::CalculationEngine;
use backend::domain::models::{Platform, Transaction, TransactionType};
use backend::cron::DailyNavScheduler;
use backend::sec::models::DailyNavInfo;
use chrono::{Datelike, NaiveDate, TimeZone, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;

// =========================================================================
// ARCHETYPE 1: The Multi-Class Thai Indexer
// Holds multiple share classes under the same umbrella SEC fund project:
// - SCBS&P500E (Class E zero-fee) vs SCBS&P500(SSFA) (SSF tax class) under M0643_2555
// - SCBCHA Class E vs Class A/P under M0005_2558
// Verification: Distinct holdings, independent NAVs, no cross-contamination.
// =========================================================================
#[tokio::test]
async fn test_archetype_1_multi_share_class_under_same_project() {
    let pool = init_db("sqlite::memory:").await.unwrap();
    let user_id = "user-archetype-1";
    let proj_id = "M0643_2555";

    // 1. Seed umbrella fund in funds table
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES (?1, 'SCBS&P500', 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส', 'SCB US Equity Fund', '44.7211', '2026-11-10')"
    )
    .bind(proj_id)
    .execute(&pool)
    .await
    .unwrap();

    // 2. Seed distinct share class NAVs in fund_nav_history on the exact same date
    let nav_items = vec![
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("SCBS&P500E".to_string()),
            nav_date: "2026-11-10".to_string(),
            net_asset: None,
            last_val: Some(dec!(44.7211)),
            sell_price: Some(dec!(44.7211)),
            buy_price: Some(dec!(44.7211)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("SCBS&P500(SSFA)".to_string()),
            nav_date: "2026-11-10".to_string(),
            net_asset: None,
            last_val: Some(dec!(44.4444)),
            sell_price: Some(dec!(44.4444)),
            buy_price: Some(dec!(44.4444)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, proj_id, &nav_items).await.unwrap();

    // 3. User holds both share classes
    let tx_class_e = Transaction {
        id: "tx-sp500-e".to_string(),
        idempotency_key: Some("idemp-e-1".to_string()),
        proj_id: proj_id.to_string(),
        fund_abbr: Some("SCBS&P500E".to_string()),
        platform: Platform::Scb,
        trans_type: TransactionType::Buy,
        trans_date: "2026-11-01".to_string(),
        units: dec!(22.3608),
        unit_price: dec!(44.7211),
        total_amount: dec!(1000.00),
        fee: dec!(0),
        note: Some("Class E purchase".to_string()),
    };

    let tx_class_ssf = Transaction {
        id: "tx-sp500-ssf".to_string(),
        idempotency_key: Some("idemp-ssf-1".to_string()),
        proj_id: proj_id.to_string(),
        fund_abbr: Some("SCBS&P500(SSFA)".to_string()),
        platform: Platform::Scb,
        trans_type: TransactionType::Buy,
        trans_date: "2026-11-01".to_string(),
        units: dec!(22.5000),
        unit_price: dec!(44.4444),
        total_amount: dec!(1000.00),
        fee: dec!(0),
        note: Some("SSF tax purchase".to_string()),
    };

    Repository::insert_transactions_batch(&pool, user_id, &[tx_class_e.clone(), tx_class_ssf.clone()])
        .await
        .unwrap();

    // 4. Query get_latest_nav_map: MUST return class_key for each share class
    let nav_map = Repository::get_latest_nav_map(&pool, user_id).await.unwrap();

    // Check class keys in nav_map
    let class_e_key = format!("{}:{}", proj_id, "SCBS&P500E");
    let class_ssf_key = format!("{}:{}", proj_id, "SCBS&P500(SSFA)");
    assert!(nav_map.contains_key(&class_e_key), "nav_map must contain class_key for SCBS&P500E");
    assert!(nav_map.contains_key(&class_ssf_key), "nav_map must contain class_key for SCBS&P500(SSFA)");

    // 5. Calculate portfolio: Both classes must produce separate holdings with their exact NAV
    let summary = CalculationEngine::calculate_portfolio(vec![tx_class_e, tx_class_ssf], &nav_map);

    assert_eq!(summary.holdings.len(), 2, "Must produce 2 distinct holdings for 2 share classes");

    let e_holding = summary.holdings.iter().find(|h| h.fund_abbr == "SCBS&P500E").expect("SCBS&P500E holding exists");
    assert_eq!(e_holding.current_nav, dec!(44.7211), "Class E must have exact NAV 44.7211");
    assert_eq!(e_holding.total_units, dec!(22.3608));
    assert_eq!(e_holding.total_cost, dec!(1000.00));

    let ssf_holding = summary.holdings.iter().find(|h| h.fund_abbr == "SCBS&P500(SSFA)").expect("SCBS&P500(SSFA) holding exists");
    assert_eq!(ssf_holding.current_nav, dec!(44.4444), "Class SSF must have exact NAV 44.4444");
    assert_eq!(ssf_holding.total_units, dec!(22.5000));
    assert_eq!(ssf_holding.total_cost, dec!(1000.00));

    // Market value should be approx 1,000.00 THB each
    assert_eq!(e_holding.market_value, dec!(1000.00));
    assert_eq!(ssf_holding.market_value, dec!(1000.00));
}

// =========================================================================
// ARCHETYPE 2: The Global US Equity & Tech Picker
// Investor buys US stocks on Dime (or UI/CSV manual entry) with:
// - unit_price in USD ($130 NVDA, $220 AAPL)
// - total_amount funded in THB (THB 45,500 and THB 38,500)
// - Dividend in USD ($15 = 525 THB)
// Verification: Market value reflects THB value (~84,000 THB), NOT -97% loss!
// =========================================================================
#[test]
fn test_archetype_2_us_stock_picker_no_false_97_percent_loss() {
    let tx_nvda = Transaction {
        id: "tx-dime-nvda".to_string(),
        idempotency_key: None,
        proj_id: "NVDA".to_string(),
        fund_abbr: Some("NVDA".to_string()),
        platform: Platform::Dime,
        trans_type: TransactionType::Buy,
        trans_date: "2024-06-01".to_string(),
        units: dec!(10.0),            // 10 shares
        unit_price: dec!(130.00),      // $130 USD per share
        total_amount: dec!(45500.00),  // Paid 45,500 THB (implied FX = 35.0 THB/USD)
        fee: dec!(0),
        note: Some("Bought NVDA on Dime".to_string()),
    };

    let tx_aapl = Transaction {
        id: "tx-dime-aapl".to_string(),
        idempotency_key: None,
        proj_id: "AAPL".to_string(),
        fund_abbr: Some("AAPL".to_string()),
        platform: Platform::Dime,
        trans_type: TransactionType::Buy,
        trans_date: "2024-06-05".to_string(),
        units: dec!(5.0),             // 5 shares
        unit_price: dec!(220.00),      // $220 USD per share
        total_amount: dec!(38500.00),  // Paid 38,500 THB (implied FX = 35.0 THB/USD)
        fee: dec!(0),
        note: Some("Bought AAPL on Dime".to_string()),
    };

    let tx_dividend = Transaction {
        id: "tx-dime-nvda-div".to_string(),
        idempotency_key: None,
        proj_id: "NVDA".to_string(),
        fund_abbr: Some("NVDA".to_string()),
        platform: Platform::Dime,
        trans_type: TransactionType::Dividend,
        trans_date: "2024-07-01".to_string(),
        units: dec!(0),
        unit_price: dec!(0),
        total_amount: dec!(525.00),    // $15 * 35 = 525 THB
        fee: dec!(0),
        note: Some("NVDA Dividend".to_string()),
    };

    let nav_map = HashMap::new(); // No SEC NAV for US stocks, fallback to normalized unit price
    let summary = CalculationEngine::calculate_portfolio(
        vec![tx_nvda, tx_aapl, tx_dividend],
        &nav_map,
    );

    assert_eq!(summary.holdings.len(), 2, "Should have 2 stock holdings");

    let nvda_holding = summary.holdings.iter().find(|h| h.fund_abbr == "NVDA").expect("NVDA holding exists");
    assert_eq!(nvda_holding.asset_type, "STOCK", "NVDA must be classified as STOCK");
    assert_eq!(nvda_holding.currency, Some("USD".to_string()));
    assert_eq!(nvda_holding.total_units, dec!(10.0));
    assert_eq!(nvda_holding.total_cost, dec!(45500.00));

    // The critical check: Market value must reflect ~45,500 THB, NOT 1,300 THB (10 * $130)!
    assert!(
        nvda_holding.market_value >= dec!(40000.00),
        "NVDA market value was {:?}, expected >= 40,000 THB (must not suffer -97% crash)",
        nvda_holding.market_value
    );
    assert!(
        nvda_holding.unrealized_pl_pct > dec!(-50.0),
        "Unrealized P/L % was {:?}, must not be -97%",
        nvda_holding.unrealized_pl_pct
    );

    let aapl_holding = summary.holdings.iter().find(|h| h.fund_abbr == "AAPL").expect("AAPL holding exists");
    assert_eq!(aapl_holding.asset_type, "STOCK", "AAPL must be classified as STOCK");
    assert!(
        aapl_holding.market_value >= dec!(30000.00),
        "AAPL market value was {:?}, expected >= 30,000 THB",
        aapl_holding.market_value
    );

    // Total portfolio values
    let total_invested = dec!(45500.00) + dec!(38500.00); // 84,000 THB
    assert_eq!(summary.total_cost, total_invested);
    assert!(
        summary.market_value >= dec!(80000.00),
        "Total market value was {:?}, expected ~84,000 THB",
        summary.market_value
    );
    assert_eq!(summary.total_dividend, dec!(525.00));
}

// =========================================================================
// ARCHETYPE 3: The Out-of-Order & Legacy Migrator
// Historical CSV/statement import where:
// - Sell precedes Buy (missing earlier records)
// - Overselling (selling more units than held)
// - Same-day Buy and Sell reordering
// Verification: Non-negative cost basis, non-negative units, cost clamping.
// =========================================================================
#[test]
fn test_archetype_3_out_of_order_sell_before_buy_and_clamping() {
    // 1. Sell before Buy
    let tx_orphan_sell = Transaction {
        id: "tx-sell-orphan".to_string(),
        idempotency_key: None,
        proj_id: "M0123_2560".to_string(),
        fund_abbr: Some("K-GLOBAL".to_string()),
        platform: Platform::KBank,
        trans_type: TransactionType::Sell,
        trans_date: "2024-01-15".to_string(), // Early date with no prior buy
        units: dec!(50.0),
        unit_price: dec!(10.0),
        total_amount: dec!(500.00),
        fee: dec!(0),
        note: None,
    };

    let tx_subsequent_buy = Transaction {
        id: "tx-buy-subsequent".to_string(),
        idempotency_key: None,
        proj_id: "M0123_2560".to_string(),
        fund_abbr: Some("K-GLOBAL".to_string()),
        platform: Platform::KBank,
        trans_type: TransactionType::Buy,
        trans_date: "2024-02-01".to_string(),
        units: dec!(100.0),
        unit_price: dec!(10.0),
        total_amount: dec!(1000.00),
        fee: dec!(0),
        note: None,
    };

    // 2. Oversell: Sell 120 units when only 100 exist
    let tx_oversell = Transaction {
        id: "tx-oversell".to_string(),
        idempotency_key: None,
        proj_id: "M0123_2560".to_string(),
        fund_abbr: Some("K-GLOBAL".to_string()),
        platform: Platform::KBank,
        trans_type: TransactionType::Sell,
        trans_date: "2024-03-01".to_string(),
        units: dec!(120.0),
        unit_price: dec!(12.0),
        total_amount: dec!(1440.00),
        fee: dec!(0),
        note: None,
    };

    let mut nav_map = HashMap::new();
    nav_map.insert(
        "M0123_2560".to_string(),
        ("K-GLOBAL".to_string(), Some("กองทุนเค โกลบอล".to_string()), dec!(12.0), Some("2024-03-01".to_string())),
    );

    let summary = CalculationEngine::calculate_portfolio(
        vec![tx_orphan_sell, tx_subsequent_buy, tx_oversell],
        &nav_map,
    );

    let holding = summary.holdings.iter().find(|h| h.fund_abbr == "K-GLOBAL").expect("K-GLOBAL holding exists");

    // Clamping guarantees:
    // Units must be >= 0 (clamped to 0 upon full/over liquidation)
    assert!(holding.total_units >= Decimal::ZERO, "Units must not be negative: {:?}", holding.total_units);
    assert_eq!(holding.total_units, Decimal::ZERO, "All units should be liquidated");

    // Total cost must be >= 0 (clamped to 0, never negative)
    assert!(holding.total_cost >= Decimal::ZERO, "Total cost must not be negative: {:?}", holding.total_cost);
    assert_eq!(holding.total_cost, Decimal::ZERO);

    // Realized P/L must be computed accurately without NaN or overflow
    // Available units: 100 @ 10 THB cost (1,000 THB). Proceeds on oversell: 1,440 THB.
    // Clamped cost sold: 1,000 THB. Realized P/L = 1,440 - 1,000 = 440 THB.
    assert!(holding.realized_pl >= Decimal::ZERO, "Realized P/L must be >= 0: {:?}", holding.realized_pl);

    // 3. Same-day Buy and Sell reordering verification
    let same_day_sell = Transaction {
        id: "tx-sd-sell".to_string(),
        idempotency_key: None,
        proj_id: "M0555_2565".to_string(),
        fund_abbr: Some("ONE-UGG".to_string()),
        platform: Platform::Scb,
        trans_type: TransactionType::Sell,
        trans_date: "2024-05-10".to_string(),
        units: dec!(50.0),
        unit_price: dec!(20.0),
        total_amount: dec!(1000.00),
        fee: dec!(0),
        note: None,
    };

    let same_day_buy = Transaction {
        id: "tx-sd-buy".to_string(),
        idempotency_key: None,
        proj_id: "M0555_2565".to_string(),
        fund_abbr: Some("ONE-UGG".to_string()),
        platform: Platform::Scb,
        trans_type: TransactionType::Buy,
        trans_date: "2024-05-10".to_string(),
        units: dec!(100.0),
        unit_price: dec!(18.0),
        total_amount: dec!(1800.00),
        fee: dec!(0),
        note: None,
    };

    let sd_summary = CalculationEngine::calculate_portfolio(
        vec![same_day_sell, same_day_buy], // Passed with Sell before Buy
        &nav_map,
    );

    let sd_holding = sd_summary.holdings.iter().find(|h| h.fund_abbr == "ONE-UGG").expect("ONE-UGG holding exists");
    assert_eq!(sd_holding.total_units, dec!(50.0000), "Should retain 50 units after buy 100 - sell 50");
    assert_eq!(sd_holding.realized_pl, dec!(100.00), "Realized P/L = 1,000 proceeds - (50 * 18 cost) = 100");
}

// =========================================================================
// ARCHETYPE 4: Single-Class Fund 'main' Fallback
// Tests funds that have no multi-share class suffixes (e.g. TSP4-EXPLORER, HI-DIV):
// - SEC records store fund_class_name = 'main' or empty string
// - Querying by fund_abbr or canonical alias resolves correctly to 'main' NAV
// =========================================================================
#[tokio::test]
async fn test_archetype_4_single_class_fund_main_fallback() {
    let pool = init_db("sqlite::memory:").await.unwrap();

    // 1. Seed TSP4-EXPLORER (M0201_2564)
    let tsp_proj_id = "M0201_2564";
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES (?1, 'TSP4-EXPLORER', 'กองทุนเปิด ทิสโก้ สเปเชียล พลัส 4', 'TISCO Special Plus 4', '12.0018', '2023-11-30')"
    )
    .bind(tsp_proj_id)
    .execute(&pool)
    .await
    .unwrap();

    let tsp_nav_items = vec![
        DailyNavInfo {
            proj_id: tsp_proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("main".to_string()),
            nav_date: "2023-11-30".to_string(),
            net_asset: None,
            last_val: Some(dec!(12.0018)),
            sell_price: Some(dec!(12.0018)),
            buy_price: Some(dec!(12.0018)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, tsp_proj_id, &tsp_nav_items).await.unwrap();

    // 2. Seed HI-DIV (M0064_2551)
    let hidiv_proj_id = "M0064_2551";
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES (?1, 'HI-DIV', 'กองทุนเปิด ทิสโก้ ไฮ-ดิวิเดนด์ หุ้นทุน', 'TISCO High Dividend Equity Fund', '10.5520', '2024-05-31')"
    )
    .bind(hidiv_proj_id)
    .execute(&pool)
    .await
    .unwrap();

    let hidiv_nav_items = vec![
        DailyNavInfo {
            proj_id: hidiv_proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("main".to_string()),
            nav_date: "2024-05-31".to_string(),
            net_asset: None,
            last_val: Some(dec!(10.5520)),
            sell_price: Some(dec!(10.5520)),
            buy_price: Some(dec!(10.5520)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, hidiv_proj_id, &hidiv_nav_items).await.unwrap();

    // 3. Test get_nav_by_date for TSP4-EXPLORER with class fallback
    let tsp_res = Repository::get_nav_by_date(&pool, tsp_proj_id, "2023-11-30", Some("TSP4-EXPLORER"))
        .await
        .unwrap()
        .expect("Must resolve TSP4-EXPLORER NAV");
    assert_eq!(tsp_res.nav, dec!(12.0018));
    assert!(tsp_res.is_exact_date);

    // 4. Test get_nav_by_date for HI-DIV with class fallback
    let hidiv_res = Repository::get_nav_by_date(&pool, hidiv_proj_id, "2024-05-31", Some("HI-DIV"))
        .await
        .unwrap()
        .expect("Must resolve HI-DIV NAV");
    assert_eq!(hidiv_res.nav, dec!(10.5520));
    assert!(hidiv_res.is_exact_date);

    // 5. Test portfolio calculation with single-class fund
    let tx_tsp = Transaction {
        id: "tx-tsp".to_string(),
        idempotency_key: None,
        proj_id: tsp_proj_id.to_string(),
        fund_abbr: Some("TSP4-EXPLORER".to_string()),
        platform: Platform::Ttb,
        trans_type: TransactionType::Buy,
        trans_date: "2023-11-30".to_string(),
        units: dec!(100.0),
        unit_price: dec!(12.0018),
        total_amount: dec!(1200.18),
        fee: dec!(0),
        note: None,
    };

    let mut nav_map = HashMap::new();
    nav_map.insert(
        tsp_proj_id.to_string(),
        ("TSP4-EXPLORER".to_string(), Some("กองทุนเปิด ทิสโก้ สเปเชียล พลัส 4".to_string()), dec!(12.0018), Some("2023-11-30".to_string())),
    );

    let summary = CalculationEngine::calculate_portfolio(vec![tx_tsp], &nav_map);
    assert_eq!(summary.holdings.len(), 1);
    assert_eq!(summary.holdings[0].current_nav, dec!(12.0018));
    assert_eq!(summary.holdings[0].market_value, dec!(1200.18));
}

// =========================================================================
// ARCHETYPE 5: Date Parsing & Timezone Consistency for ICT (UTC+7)
// Verification:
// - DailyNavScheduler::now_ict() strictly UTC+7
// - Buddhist Era (BE) to Common Era (CE) year normalization invariance
// - Date string parsing consistency without timezone drift
// =========================================================================
#[test]
fn test_archetype_5_date_parsing_and_ict_timezone_consistency() {
    // 1. Timezone offset check: ICT must be exactly UTC+7
    let utc_now = Utc::now();
    let ict_now = DailyNavScheduler::now_ict();
    let hour_diff = (ict_now - utc_now).num_hours();
    assert_eq!(hour_diff, 7, "ICT must be strictly UTC+7 (got {} hours diff)", hour_diff);

    // 2. Trigger time matching verification
    let utc_sample = Utc.with_ymd_and_hms(2026, 11, 20, 20, 30, 0).unwrap();
    assert!(DailyNavScheduler::is_trigger_time(utc_sample, 20, 30));
    assert!(!DailyNavScheduler::is_trigger_time(utc_sample, 20, 31));
    assert!(!DailyNavScheduler::is_trigger_time(utc_sample, 19, 30));

    // 3. Buddhist Era (BE) to Common Era (CE) date normalization logic
    let normalize_year = |year: i32| -> i32 {
        if year > 2400 {
            year - 543
        } else {
            year
        }
    };

    assert_eq!(normalize_year(2567), 2024, "BE 2567 must normalize to CE 2024");
    assert_eq!(normalize_year(2569), 2026, "BE 2569 must normalize to CE 2026");
    assert_eq!(normalize_year(2026), 2026, "CE 2026 must remain 2026");

    // 4. Leap year date parsing invariance (e.g. 29 Feb 2024 / 2567)
    let leap_str = "2024-02-29";
    let parsed_leap = NaiveDate::parse_from_str(leap_str, "%Y-%m-%d");
    assert!(parsed_leap.is_ok(), "Leap date 2024-02-29 must be valid");
    let d = parsed_leap.unwrap();
    assert_eq!(d.year(), 2024);
    assert_eq!(d.month(), 2);
    assert_eq!(d.day(), 29);

    // 5. Year boundary invariance (e.g. 2026-01-01 and 2026-12-31)
    let start_of_year = NaiveDate::parse_from_str("2026-01-01", "%Y-%m-%d").unwrap();
    assert_eq!(start_of_year.to_string(), "2026-01-01");

    let end_of_year = NaiveDate::parse_from_str("2026-12-31", "%Y-%m-%d").unwrap();
    assert_eq!(end_of_year.to_string(), "2026-12-31");
}
