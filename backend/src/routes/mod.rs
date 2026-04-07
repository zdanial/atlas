pub mod nodes;
#[cfg(test)]
mod tests;

use axum::{
    extract::State,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde_json::{json, Value};

use crate::db::pool::Pool;

async fn health() -> Json<Value> {
    Json(json!({"status": "ok"}))
}

async fn list_workspaces(State(_pool): State<Pool>) -> Json<Value> {
    Json(json!({"workspaces": [], "message": "placeholder"}))
}

async fn health_with_state(State(_pool): State<Pool>) -> Json<Value> {
    Json(json!({"status": "ok"}))
}

/// Router with database pool state, used in the real server.
pub fn router() -> Router<Pool> {
    Router::new()
        .route("/api/health", get(health_with_state))
        .route("/api/workspaces", get(list_workspaces))
        // Node CRUD
        .route("/api/nodes", get(nodes::list_nodes).post(nodes::create_node))
        .route(
            "/api/nodes/{id}",
            get(nodes::get_node)
                .patch(nodes::update_node)
                .delete(nodes::delete_node),
        )
        // Node search
        .route("/api/nodes/search", get(nodes::search_nodes))
        // Node edges
        .route(
            "/api/nodes/{id}/edges",
            get(nodes::list_node_edges).post(nodes::create_node_edge),
        )
        // Node versions
        .route("/api/nodes/{id}/versions", get(nodes::list_node_versions))
        // Standalone edge delete
        .route("/api/edges/{id}", delete(nodes::delete_edge))
        // Agent runs
        .route("/api/agent-runs", post(nodes::create_agent_run))
}

/// Router without any state requirement, for integration tests that skip the DB.
pub fn router_without_state() -> Router {
    Router::new().route("/api/health", get(health))
}
