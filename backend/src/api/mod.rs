pub mod auth;
pub mod handlers;

use crate::db::DbPool;
use axum::{
    Router,
    routing::{delete, get, patch, post},
};
use std::path::Path;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

pub struct AppState {
    pub pool: DbPool,
    pub api_key: String,
    pub gemini_api_key: String,
    pub email_sync_pid: Arc<tokio::sync::Mutex<Option<u32>>>,
}

pub fn create_router(state: Arc<AppState>) -> Router {
    // กำหนด CORS ให้ Frontend เข้าถึงได้
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let mut router = Router::new()
        // Health check
        .route("/api/health", get(handlers::health_check))
        .route("/api/debug/sentry-test", get(handlers::sentry_test_trigger))
        .route("/api/brokers", get(handlers::get_brokers))
        // Portfolio summary
        .route("/api/portfolio", get(handlers::get_portfolio))
        // Transactions CRUD
        .route(
            "/api/transactions",
            get(handlers::get_transactions).post(handlers::create_transaction),
        )
        .route(
            "/api/transactions/batch",
            post(handlers::create_transactions_batch),
        )
        .route(
            "/api/transactions/bulk-delete",
            post(handlers::bulk_delete_transactions),
        )
        .route(
            "/api/transactions/{id}",
            delete(handlers::delete_transaction).put(handlers::update_transaction),
        )
        // Staged Import & Pending Transactions
        .route("/api/nav/by-date", get(handlers::get_nav_by_date))
        .route("/api/nav/month-dates", get(handlers::get_nav_dates_for_month))
        .route(
            "/api/transactions/pending",
            get(handlers::get_pending_transactions)
                .post(handlers::create_pending_transaction),
        )
        .route(
            "/api/transactions/pending/batch",
            post(handlers::create_pending_transactions_batch),
        )
        .route(
            "/api/transactions/pending/commit",
            post(handlers::commit_pending_transactions),
        )
        .route(
            "/api/transactions/pending/batch-delete",
            post(handlers::batch_delete_pending),
        )
        .route(
            "/api/transactions/pending/{id}",
            patch(handlers::update_pending_transaction)
                .delete(handlers::delete_pending_transaction),
        )
        // Statement AI Parser (PDF / Text via Gemini)
        .route("/api/parse/statement", post(handlers::parse_statement))
        // Funds search & sync
        .route("/api/funds/search", get(handlers::search_funds))
        .route("/api/funds/sync", post(handlers::trigger_sync))
        // User Settings & Profile
        .route(
            "/api/settings/profile",
            get(handlers::get_user_settings).post(handlers::update_user_settings),
        )
        // Gmail Harvester Actions
        .route(
            "/api/email/test-connection",
            post(handlers::test_email_connection),
        )
        .route("/api/email/sync", post(handlers::sync_email_statements))
        .route("/api/email/sync/start", post(handlers::start_email_sync))
        .route("/api/email/sync/status", get(handlers::get_email_sync_status))
        .route("/api/email/sync/cancel", post(handlers::cancel_email_sync))
        .route("/api/email/sync/cache/stats", get(handlers::get_sync_cache_stats))
        .route("/api/email/sync/cache/reset", post(handlers::reset_sync_cache))
        .route("/api/email/sync/cache/list", get(handlers::list_cached_emails))
        .route("/api/email/sync/cache/{message_id}", delete(handlers::delete_cached_email))
        .route(
            "/api/email/sync/brokers",
            get(handlers::get_email_brokers).put(handlers::update_email_brokers),
        )
        .route(
            "/api/email/sync/brokers/reset",
            post(handlers::reset_email_brokers),
        )
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    // รองรับการเสิร์ฟหน้าเว็บ Frontend (SPA) โดยตรงจาก Binary ตัวเดียวสำหรับ Homelab
    let dist_path = if Path::new("dist").exists() {
        Some("dist")
    } else if Path::new("../frontend/dist").exists() {
        Some("../frontend/dist")
    } else {
        None
    };

    if let Some(path) = dist_path {
        let serve_dir =
            ServeDir::new(path).fallback(ServeFile::new(format!("{}/index.html", path)));
        router = router.fallback_service(serve_dir);
    }

    router
}
