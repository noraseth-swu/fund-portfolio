mod api;
pub mod codec;
mod db;
mod domain;
mod sec;
mod sync;

use api::{AppState, create_router};
use db::{init_db, repository::Repository};
use dotenvy::dotenv;
use sec::SecClient;
use std::env;
use std::sync::Arc;
use sync::SyncService;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenv().ok();

    // 0. Sentry Observability & Error Monitoring (Optional - GitHub Student Developer Pack)
    let sentry_dsn = env::var("SENTRY_DSN").unwrap_or_default();
    let _sentry_guard = if !sentry_dsn.trim().is_empty() && sentry_dsn.starts_with("http") {
        let env_name = env::var("SENTRY_ENVIRONMENT").unwrap_or_else(|_| "production".into());
        let mut options = sentry::ClientOptions::default();
        options.release = sentry::release_name!();
        options.environment = Some(env_name.into());
        options.before_send = Some(Arc::new(|mut event| {
            // PII Redaction Filter: Redact authorization headers, cookies, and sensitive payload data
            if let Some(req) = event.request.as_mut() {
                req.headers.remove("authorization");
                req.headers.remove("cookie");
                req.data = None; // Redact raw transaction payloads
            }
            Some(event)
        }));
        Some(sentry::init((sentry_dsn, options)))
    } else {
        None
    };

    // Initialise Tracing Subscriber with Sentry integration
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "backend=info,tower_http=info".into());

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .compact();

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(sentry::integrations::tracing::SpanLayer::default())
        .with(sentry::integrations::tracing::LogLayer::default())
        .init();

    tracing::info!("============================================================");
    tracing::info!("  Fund Portfolio Management - High Performance API Server   ");
    tracing::info!("============================================================");
    if _sentry_guard.is_some() {
        tracing::info!("[✓] Sentry Error Monitoring is active.");
    } else {
        tracing::info!("[i] Sentry Error Monitoring is disabled (SENTRY_DSN not set).");
    }

    // 1. Initialise SQLite Database (WAL mode)
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:portfolio.db".to_string());
    tracing::info!("[+] Initializing SQLite Database ({db_url}) with WAL Mode...");
    let pool = init_db(&db_url).await?;
    tracing::info!("[✓] SQLite Connection Pool ready.");

    let api_key = env::var("SEC_API_KEY").unwrap_or_default();

    // 2. Initial Fund Profile & AMC Master Data Seed
    if !api_key.is_empty() && api_key != "your_sec_subscription_key_here" {
        let mut sec_client = SecClient::new(api_key.clone());

        // Sync AMCs จาก SEC
        if let Ok(amcs) = sec_client.get_amc_list().await {
            let _ = Repository::upsert_amc_brokers(&pool, &amcs).await;
            tracing::info!(
                "[✓] Synced {} AMCs from SEC into Brokers Master Data.",
                amcs.len()
            );
        }

        let funds_exist = Repository::search_funds(&pool, "", 1).await?.len();
        if funds_exist == 0 {
            tracing::info!("[+] Performing initial fund profile seed from SEC Open API (v2)...");
            match sec_client.get_fund_profiles(None).await {
                Ok(paged) => {
                    Repository::upsert_funds(&pool, &paged.items).await?;
                    tracing::info!(
                        "[✓] Cached initial {} fund profiles to SQLite.",
                        paged.items.len()
                    );
                }
                Err(e) => tracing::warn!("[!] Initial fund seed skipped: {e}"),
            }
        }
    }

    // 3. Start Background NAV Sync Worker (runs periodically)
    let shared_pool = Arc::new(pool.clone());
    SyncService::start_background_worker(shared_pool.clone(), api_key.clone());

    // 4. Create Axum Router & App State
    let gemini_api_key = env::var("GEMINI_API_KEY").unwrap_or_default();
    if !gemini_api_key.is_empty() {
        tracing::info!("[✓] Gemini AI Statement Parser is configured and active.");
    } else {
        tracing::warn!("[!] GEMINI_API_KEY is not set. PDF AI Statement Parser will be disabled.");
    }

    let app_state = Arc::new(AppState {
        pool,
        api_key,
        gemini_api_key,
        email_sync_pid: Arc::new(tokio::sync::Mutex::new(None)),
    });
    let app = create_router(app_state);

    // 5. Start Web Server
    let port = env::var("SERVER_PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("[+] Binding HTTP Server on http://{}...", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("[✓] Server is ready to receive requests!");
    tracing::info!("    • Health check:  http://localhost:{}/api/health", port);
    tracing::info!(
        "    • Portfolio API: http://localhost:{}/api/portfolio",
        port
    );
    tracing::info!(
        "    • Transactions:  http://localhost:{}/api/transactions",
        port
    );
    tracing::info!(
        "    • Fund Search:   http://localhost:{}/api/funds/search?q=K-USA",
        port
    );

    axum::serve(listener, app).await?;

    Ok(())
}
