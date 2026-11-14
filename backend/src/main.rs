mod api;
mod db;
mod domain;
mod sec;
mod sync;

use api::{create_router, AppState};
use db::{init_db, repository::Repository};
use dotenvy::dotenv;
use sec::SecClient;
use std::env;
use std::sync::Arc;
use sync::SyncService;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenv().ok();

    println!("============================================================");
    println!("  Fund Portfolio Management - High Performance API Server   ");
    println!("============================================================");

    // 1. Initialise SQLite Database (WAL mode)
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:portfolio.db".to_string());
    println!("[+] Initializing SQLite Database ({db_url}) with WAL Mode...");
    let pool = init_db(&db_url).await?;
    println!("[✓] SQLite Connection Pool ready.");

    let api_key = env::var("SEC_API_KEY").unwrap_or_default();

    // 2. Initial Fund Profile & AMC Master Data Seed
    if !api_key.is_empty() && api_key != "your_sec_subscription_key_here" {
        let mut sec_client = SecClient::new(api_key.clone());

        // Sync AMCs จาก SEC
        if let Ok(amcs) = sec_client.get_amc_list().await {
            let _ = Repository::upsert_amc_brokers(&pool, &amcs).await;
            println!("[✓] Synced {} AMCs from SEC into Brokers Master Data.", amcs.len());
        }

        let funds_exist = Repository::search_funds(&pool, "", 1).await?.len();
        if funds_exist == 0 {
            println!("[+] Performing initial fund profile seed from SEC Open API (v2)...");
            match sec_client.get_fund_profiles(None).await {
                Ok(paged) => {
                    Repository::upsert_funds(&pool, &paged.items).await?;
                    println!("[✓] Cached initial {} fund profiles to SQLite.", paged.items.len());
                }
                Err(e) => eprintln!("[!] Initial fund seed skipped: {e}"),
            }
        }
    }

    // 3. Start Background NAV Sync Worker (runs periodically)
    let shared_pool = Arc::new(pool.clone());
    SyncService::start_background_worker(shared_pool.clone(), api_key.clone());

    // 4. Create Axum Router & App State
    let gemini_api_key = env::var("GEMINI_API_KEY").unwrap_or_default();
    if !gemini_api_key.is_empty() {
        println!("[✓] Gemini AI Statement Parser is configured and active.");
    } else {
        println!("[!] GEMINI_API_KEY is not set. PDF AI Statement Parser will be disabled.");
    }

    let app_state = Arc::new(AppState {
        pool,
        api_key,
        gemini_api_key,
    });
    let app = create_router(app_state);

    // 5. Start Web Server
    let port = env::var("SERVER_PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);
    println!("[+] Binding HTTP Server on http://{}...", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("[✓] Server is ready to receive requests!");
    println!("    • Health check:  http://localhost:{}/api/health", port);
    println!("    • Portfolio API: http://localhost:{}/api/portfolio", port);
    println!("    • Transactions:  http://localhost:{}/api/transactions", port);
    println!("    • Fund Search:   http://localhost:{}/api/funds/search?q=K-USA", port);

    axum::serve(listener, app).await?;

    Ok(())
}
