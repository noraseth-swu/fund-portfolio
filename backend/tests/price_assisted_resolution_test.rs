use backend::db::init_db;
use backend::db::repository::Repository;
use backend::sec::models::DailyNavInfo;
use rust_decimal_macros::dec;

#[tokio::test]
async fn test_project_id_resolution_with_messy_broker_strings() {
    let pool = init_db("sqlite::memory:").await.unwrap();

    // 1. Seed master funds catalog
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES 
         ('M0621_2553', 'ES-GF', 'กองทุนเปิดทหารไทย โกลบอล บอนด์ ฟันด์', 'Eastspring GIS Global Bond Fund', '12.1120', '2024-02-28'),
         ('M0011_2547', 'TSF', 'กองทุนเปิด ทิสโก้ สแตรทิจิก ฟันด์', 'TISCO Strategic Fund', '71.6857', '2026-10-28'),
         ('M0643_2555', 'SCBS&P500', 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส ดัชนี', 'SCB S&P 500 Index Fund', '44.7211', '2026-11-10'),
         ('M0005_2558', 'SCBCHA', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์', 'SCB China A-Shares Fund', '8.3946', '2026-10-28'),
         ('M0201_2564', 'TSP4-EXPLORER', 'กองทุนเปิด ทิสโก้ สเปเชียล พลัส 4', 'TISCO Special Plus 4', '12.0018', '2023-11-30')"
    )
    .execute(&pool)
    .await
    .unwrap();

    // 2. Test messy broker string: "EASTSPRING GIS GLOBAL BOND FUND" -> resolves to M0621_2553
    let res_es_gf = Repository::resolve_project_id(&pool, "EASTSPRING GIS GLOBAL BOND FUND")
        .await
        .unwrap();
    assert_eq!(
        res_es_gf,
        Some("M0621_2553".to_string()),
        "Should resolve 'EASTSPRING GIS GLOBAL BOND FUND' to M0621_2553"
    );

    // Also with extra boilerplate, brackets, and case variations
    let res_es_gf_bracket = Repository::resolve_project_id(&pool, "กองทุนเปิด EASTSPRING GIS GLOBAL BOND FUND [CLASS A]")
        .await
        .unwrap();
    assert_eq!(
        res_es_gf_bracket,
        Some("M0621_2553".to_string()),
        "Should strip boilerplate like 'กองทุนเปิด' and '[CLASS A]' and resolve to M0621_2553"
    );

    // 3. Test messy broker string: "TISCO STRATEGIC FUND" -> resolves to M0011_2547
    let res_tsf = Repository::resolve_project_id(&pool, "TISCO STRATEGIC FUND")
        .await
        .unwrap();
    assert_eq!(
        res_tsf,
        Some("M0011_2547".to_string()),
        "Should resolve 'TISCO STRATEGIC FUND' to M0011_2547"
    );

    // 4. Test messy broker string: "SCB S&P 500 INDEX FUND" -> resolves to M0643_2555
    let res_sp500 = Repository::resolve_project_id(&pool, "SCB S&P 500 INDEX FUND")
        .await
        .unwrap();
    assert_eq!(
        res_sp500,
        Some("M0643_2555".to_string()),
        "Should resolve 'SCB S&P 500 INDEX FUND' to M0643_2555"
    );

    // Direct abbreviation matching
    let res_abbr = Repository::resolve_project_id(&pool, "SCBS&P500")
        .await
        .unwrap();
    assert_eq!(
        res_abbr,
        Some("M0643_2555".to_string()),
        "Should resolve exact abbreviation 'SCBS&P500' to M0643_2555"
    );
}

#[tokio::test]
async fn test_price_assisted_share_class_resolution() {
    let pool = init_db("sqlite::memory:").await.unwrap();

    // 1. Seed funds
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES 
         ('M0621_2553', 'ES-GF', 'กองทุนเปิดทหารไทย โกลบอล บอนด์ ฟันด์', 'Eastspring GIS Global Bond Fund', '12.1120', '2024-02-28'),
         ('M0011_2547', 'TSF', 'กองทุนเปิด ทิสโก้ สแตรทิจิก ฟันด์', 'TISCO Strategic Fund', '71.6857', '2026-10-28'),
         ('M0005_2558', 'SCBCHA', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์', 'SCB China A-Shares Fund', '8.3946', '2026-10-28'),
         ('M0201_2564', 'TSP4-EXPLORER', 'กองทุนเปิด ทิสโก้ สเปเชียล พลัส 4', 'TISCO Special Plus 4', '12.0018', '2023-11-30')"
    )
    .execute(&pool)
    .await
    .unwrap();

    // 2. Seed NAV history with distinct share classes
    // Case A: M0621_2553 (ES-GF) on 2024-02-28 has ES-GF-A @ 12.1120 and ES-GF-D @ 10.1113
    let es_nav_items = vec![
        DailyNavInfo {
            proj_id: "M0621_2553".to_string(),
            unique_id: None,
            fund_class_name: Some("ES-GF-A".to_string()),
            nav_date: "2024-02-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(12.1120)),
            sell_price: Some(dec!(12.1120)),
            buy_price: Some(dec!(12.1120)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: "M0621_2553".to_string(),
            unique_id: None,
            fund_class_name: Some("ES-GF-D".to_string()),
            nav_date: "2024-02-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(10.1113)),
            sell_price: Some(dec!(10.1113)),
            buy_price: Some(dec!(10.1113)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, "M0621_2553", &es_nav_items).await.unwrap();

    // Case B: M0011_2547 (TSF) on 2026-10-28 has TSF-A @ 71.6857 and TSF-D @ 55.4321
    let tsf_nav_items = vec![
        DailyNavInfo {
            proj_id: "M0011_2547".to_string(),
            unique_id: None,
            fund_class_name: Some("TSF-A".to_string()),
            nav_date: "2026-10-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(71.6857)),
            sell_price: Some(dec!(71.6857)),
            buy_price: Some(dec!(71.6857)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: "M0011_2547".to_string(),
            unique_id: None,
            fund_class_name: Some("TSF-D".to_string()),
            nav_date: "2026-10-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(55.4321)),
            sell_price: Some(dec!(55.4321)),
            buy_price: Some(dec!(55.4321)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, "M0011_2547", &tsf_nav_items).await.unwrap();

    // Case C: M0005_2558 (SCBCHA) on 2026-10-28 has SCBCHAA @ 8.3946 and SCBCHAE @ 9.4122
    let scbcha_nav_items = vec![
        DailyNavInfo {
            proj_id: "M0005_2558".to_string(),
            unique_id: None,
            fund_class_name: Some("SCBCHAA".to_string()),
            nav_date: "2026-10-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(8.3946)),
            sell_price: Some(dec!(8.3946)),
            buy_price: Some(dec!(8.3946)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: "M0005_2558".to_string(),
            unique_id: None,
            fund_class_name: Some("SCBCHAE".to_string()),
            nav_date: "2026-10-28".to_string(),
            net_asset: None,
            last_val: Some(dec!(9.4122)),
            sell_price: Some(dec!(9.4122)),
            buy_price: Some(dec!(9.4122)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, "M0005_2558", &scbcha_nav_items).await.unwrap();

    // Case D: Single-class fund M0201_2564 (TSP4-EXPLORER) on 2023-11-30 with 'main'
    let tsp_nav_items = vec![
        DailyNavInfo {
            proj_id: "M0201_2564".to_string(),
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
    Repository::upsert_nav_history(&pool, "M0201_2564", &tsp_nav_items).await.unwrap();

    // 3. Test resolution for M0621_2553 on 2024-02-28 with price 12.1120 -> resolves to ES-GF-A (not ES-GF-D @ 10.1113)
    let class_es_gf = Repository::resolve_share_class_by_price(
        &pool,
        "M0621_2553",
        "2024-02-28",
        dec!(12.1120),
    )
    .await
    .unwrap();
    assert_eq!(
        class_es_gf,
        Some("ES-GF-A".to_string()),
        "Price 12.1120 must resolve to ES-GF-A, not ES-GF-D"
    );

    // Also test price within tolerance (< 0.005) e.g. 12.1122
    let class_es_gf_tol = Repository::resolve_share_class_by_price(
        &pool,
        "M0621_2553",
        "2024-02-28",
        dec!(12.1122),
    )
    .await
    .unwrap();
    assert_eq!(
        class_es_gf_tol,
        Some("ES-GF-A".to_string()),
        "Price 12.1122 (within 0.005 tolerance) must resolve to ES-GF-A"
    );

    // 4. Test resolution for M0011_2547 (TSF) on 2026-10-28 with price 71.6857 -> resolves to TSF-A
    let class_tsf = Repository::resolve_share_class_by_price(
        &pool,
        "M0011_2547",
        "2026-10-28",
        dec!(71.6857),
    )
    .await
    .unwrap();
    assert_eq!(
        class_tsf,
        Some("TSF-A".to_string()),
        "Price 71.6857 must resolve to TSF-A"
    );

    // 5. Test resolution for M0005_2558 (SCBCHA) on 2026-10-28 with price 8.3946 -> resolves to SCBCHAA
    let class_scbcha = Repository::resolve_share_class_by_price(
        &pool,
        "M0005_2558",
        "2026-10-28",
        dec!(8.3946),
    )
    .await
    .unwrap();
    assert_eq!(
        class_scbcha,
        Some("SCBCHAA".to_string()),
        "Price 8.3946 must resolve to SCBCHAA"
    );

    // 6. Test resolution for Single-class fund M0201_2564 (TSP4-EXPLORER) -> resolves cleanly to base project/class
    let class_tsp = Repository::resolve_share_class_by_price(
        &pool,
        "M0201_2564",
        "2023-11-30",
        dec!(12.0018),
    )
    .await
    .unwrap();
    assert!(
        class_tsp == Some("TSP4-EXPLORER".to_string()) || class_tsp == Some("main".to_string()),
        "Single-class fund must resolve cleanly to base project/class, got: {:?}",
        class_tsp
    );
}

#[tokio::test]
async fn test_heuristic_tiering_fallback_when_price_unavailable_or_holiday() {
    let pool = init_db("sqlite::memory:").await.unwrap();

    let proj_id = "M0643_2555";
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES (?1, 'SCBS&P500', 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส ดัชนี', 'SCB S&P 500 Index Fund', '44.7211', '2026-11-10')"
    )
    .bind(proj_id)
    .execute(&pool)
    .await
    .unwrap();

    // Seed multiple classes: SSF tax class, Dividend class (-D), and Accumulation/Class A (-A)
    let nav_items = vec![
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
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("SCBS&P500-D".to_string()),
            nav_date: "2026-11-10".to_string(),
            net_asset: None,
            last_val: Some(dec!(35.1234)),
            sell_price: Some(dec!(35.1234)),
            buy_price: Some(dec!(35.1234)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("SCBS&P500-A".to_string()),
            nav_date: "2026-11-10".to_string(),
            net_asset: None,
            last_val: Some(dec!(44.7211)),
            sell_price: Some(dec!(44.7211)),
            buy_price: Some(dec!(44.7211)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, proj_id, &nav_items).await.unwrap();

    // Query on a weekend/holiday date where NAV is not published, or with price = 0
    let resolved = Repository::resolve_share_class_by_price(
        &pool,
        proj_id,
        "2026-11-15", // Sunday
        dec!(0),
    )
    .await
    .unwrap();

    assert!(resolved.is_some(), "Should resolve a fallback class via heuristic tiering");
    let class_name = resolved.unwrap();
    // Invariant: Must resolve to Tier 1 Class A / retail accumulation
    assert!(
        class_name.ends_with("-A") || class_name.ends_with("(A)") || class_name.ends_with("AA") || class_name.ends_with("A"),
        "Must default to Class A / retail accumulation, got: {}",
        class_name
    );
    // Strict Guard: Must NEVER default to SSF, RMF, or ThaiESG
    assert!(
        !class_name.to_uppercase().contains("SSF"),
        "Fallback must NEVER default to SSF without explicit tax keyword! Got: {}",
        class_name
    );
    assert!(
        !class_name.to_uppercase().contains("RMF"),
        "Fallback must NEVER default to RMF! Got: {}",
        class_name
    );
    assert!(
        !class_name.to_uppercase().contains("THAIESG") && !class_name.to_uppercase().contains("TESG"),
        "Fallback must NEVER default to ThaiESG! Got: {}",
        class_name
    );
}

#[tokio::test]
async fn test_unseen_new_fund_dynamic_sec_master_resolution() {
    let pool = init_db("sqlite::memory:").await.unwrap();

    // An entirely unseen fund from SEC Open API with no static dict entry anywhere
    let proj_id = "M9999_2569";
    sqlx::query(
        "INSERT INTO funds (proj_id, proj_abbr_name, proj_name_th, proj_name_en, last_nav, last_nav_date)
         VALUES (?1, 'NEW-QUANT', 'กองทุนเปิดนิวเอจ ควอนตัม แมชชีนเลิร์นนิ่ง', 'New Age Quantum ML Fund', '10.5000', '2026-11-20')"
    )
    .bind(proj_id)
    .execute(&pool)
    .await
    .unwrap();

    // 1. Resolve project ID from raw broker string
    let resolved_proj = Repository::resolve_project_id(&pool, "NEW AGE QUANTUM ML FUND")
        .await
        .unwrap();
    assert_eq!(resolved_proj, Some(proj_id.to_string()), "Must resolve completely unseen fund by SEC master catalog");

    // 2. Seed classes in NAV history
    let nav_items = vec![
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("NEW-QUANT-A".to_string()),
            nav_date: "2026-11-20".to_string(),
            net_asset: None,
            last_val: Some(dec!(10.5000)),
            sell_price: Some(dec!(10.5000)),
            buy_price: Some(dec!(10.5000)),
            last_upd_date: None,
        },
        DailyNavInfo {
            proj_id: proj_id.to_string(),
            unique_id: None,
            fund_class_name: Some("NEW-QUANT-SSF".to_string()),
            nav_date: "2026-11-20".to_string(),
            net_asset: None,
            last_val: Some(dec!(10.4500)),
            sell_price: Some(dec!(10.4500)),
            buy_price: Some(dec!(10.4500)),
            last_upd_date: None,
        },
    ];
    Repository::upsert_nav_history(&pool, proj_id, &nav_items).await.unwrap();

    // 3. Resolve share class by transaction price
    let resolved_class = Repository::resolve_share_class_by_price(
        &pool,
        proj_id,
        "2026-11-20",
        dec!(10.5000),
    )
    .await
    .unwrap();
    assert_eq!(
        resolved_class,
        Some("NEW-QUANT-A".to_string()),
        "Must dynamically resolve to NEW-QUANT-A based on price without static dict"
    );
}

