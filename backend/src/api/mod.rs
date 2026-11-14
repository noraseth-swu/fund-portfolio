pub mod auth;
pub mod handlers;

use crate::db::DbPool;
use axum::{
    Router,
    routing::{delete, get, post},
};
use std::path::Path;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

pub struct AppState {
    pub pool: DbPool,
    pub api_key: String,
    pub gemini_api_key: String,
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
            "/api/transactions/{id}",
            delete(handlers::delete_transaction),
        )
        // Statement AI Parser (PDF / Text via Gemini)
        .route("/api/parse/statement", post(handlers::parse_statement))
        // Funds search & sync
        .route("/api/funds/search", get(handlers::search_funds))
        .route("/api/funds/sync", post(handlers::trigger_sync))
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
