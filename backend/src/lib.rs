pub mod db;
pub mod routes;

use axum::Router;

/// Build the application router without database state, for testing.
pub fn app_without_db() -> Router {
    routes::router_without_state()
}
