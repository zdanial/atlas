use atlas_server::{db, routes, ws};

use axum::{routing::get, Router};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    dotenvy::dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set in environment or .env");

    tracing::info!("Connecting to database...");
    let pool = db::pool::connect(&database_url).await?;

    tracing::info!("Running migrations...");
    db::pool::run_migrations(&pool).await?;

    tracing::info!("Seeding defaults...");
    db::seed::seed_defaults(&pool).await?;

    // WebSocket broadcast channel (capacity: 256 buffered events)
    let broadcast = Arc::new(ws::WsBroadcast::new(256));

    let allowed_origins = [
        "http://localhost:5173"
            .parse::<http::HeaderValue>()
            .unwrap(),
        "http://localhost:6200"
            .parse::<http::HeaderValue>()
            .unwrap(),
    ];
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(routes::router())
        .route("/ws", get(ws::ws_handler).with_state(broadcast))
        .layer(cors)
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await?;
    tracing::info!("Atlas server listening on :3001");
    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn router_builds_without_panic() {
        let _router = atlas_server::app_without_db();
    }
}
