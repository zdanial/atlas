pub mod braindump;
pub mod events;
pub mod github;
pub mod imports;
pub mod nodes;
pub mod projects;
pub mod providers;
pub mod repos;
pub mod strategist;
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
        .route(
            "/api/nodes",
            get(nodes::list_nodes).post(nodes::create_node),
        )
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
        // Provider config CRUD
        .route(
            "/api/providers",
            get(providers::list_providers).post(providers::create_provider),
        )
        .route(
            "/api/providers/{id}",
            patch(providers::update_provider).delete(providers::delete_provider),
        )
        // Project CRUD
        .route(
            "/api/projects",
            get(projects::list_projects).post(projects::create_project),
        )
        .route(
            "/api/projects/{id}",
            get(projects::get_project)
                .patch(projects::update_project)
                .delete(projects::delete_project),
        )
        // Import source CRUD
        .route(
            "/api/imports",
            get(imports::list_imports).post(imports::create_import),
        )
        .route(
            "/api/imports/{id}",
            get(imports::get_import)
                .patch(imports::update_import)
                .delete(imports::delete_import),
        )
        // Import mappings
        .route(
            "/api/imports/{id}/mappings",
            get(imports::list_import_mappings).post(imports::create_import_mapping),
        )
        // Brain dump
        .route("/api/brain-dump", post(braindump::brain_dump))
        // Event sourcing (WP-15)
        .route("/api/events", post(events::create_event))
        .route("/api/projects/{id}/events", get(events::list_events))
        .route("/api/projects/{id}/state", get(events::get_state_at))
        .route(
            "/api/projects/{id}/snapshots",
            post(events::create_snapshot),
        )
        // GitHub Scanner (WP-19)
        .route("/api/github/scan", post(github::scan_repo))
        // Repo CRUD + Cartographer (WP-19)
        .route(
            "/api/repos",
            get(repos::list_repos).post(repos::connect_repo),
        )
        .route("/api/repos/{id}", delete(repos::delete_repo))
        .route("/api/repos/{id}/analyze", post(repos::trigger_analysis))
        .route(
            "/api/repos/{id}/analyze/{run_id}/commit",
            post(repos::commit_findings),
        )
        .route(
            "/api/repos/{id}/existing-titles",
            get(repos::existing_titles),
        )
        .route("/api/agent-runs/{id}", get(repos::get_agent_run))
        // Strategist Agent (WP-18)
        .route(
            "/api/projects/{id}/strategist/analyze",
            get(strategist::analyze_intents),
        )
        .route(
            "/api/projects/{project_id}/strategist/what-if/{intent_id}",
            get(strategist::what_if_drop),
        )
}

/// Router without any state requirement, for integration tests that skip the DB.
pub fn router_without_state() -> Router {
    Router::new().route("/api/health", get(health))
}
