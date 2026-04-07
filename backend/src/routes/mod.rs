use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::PgPool;

async fn health() -> Json<Value> {
    Json(json!({"status": "ok"}))
}

async fn list_nodes(State(_pool): State<PgPool>) -> Json<Value> {
    Json(json!({"nodes": [], "message": "placeholder"}))
}

async fn list_workspaces(State(_pool): State<PgPool>) -> Json<Value> {
    Json(json!({"workspaces": [], "message": "placeholder"}))
}

/// Router with database pool state, used in the real server.
pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/api/health", get(health_with_state))
        .route("/api/nodes", get(list_nodes))
        .route("/api/workspaces", get(list_workspaces))
}

/// Health handler that accepts (and ignores) state, so it can be mounted on a stateful router.
async fn health_with_state(State(_pool): State<PgPool>) -> Json<Value> {
    Json(json!({"status": "ok"}))
}

/// Router without any state requirement, for integration tests that skip the DB.
pub fn router_without_state() -> Router {
    Router::new().route("/api/health", get(health))
}
