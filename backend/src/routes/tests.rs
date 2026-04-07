#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
        Router,
    };
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tower::ServiceExt;

    use crate::db::pool::Pool;
    use crate::routes;

    /// Helper: build the app router with a real database pool.
    async fn app(pool: &Pool) -> Router {
        Router::new()
            .merge(routes::router())
            .with_state(pool.clone())
    }

    /// Helper: send a JSON request and return (status, body as Value).
    async fn json_request(
        app: Router,
        method: Method,
        uri: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let req_body = match body {
            Some(v) => Body::from(serde_json::to_vec(&v).unwrap()),
            None => Body::empty(),
        };

        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .body(req_body)
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };

        (status, value)
    }

    /// Full CRUD integration test. Requires DATABASE_URL.
    /// Run with: DATABASE_URL=postgres://... cargo test -- --ignored
    #[tokio::test]
    #[ignore]
    async fn crud_nodes() {
        dotenvy::dotenv().ok();
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
        let pool = crate::db::pool::connect(&database_url).await.unwrap();
        crate::db::pool::run_migrations(&pool).await.unwrap();

        let router = app(&pool).await;

        // Get seeded project
        let project_row: (uuid::Uuid,) = sqlx::query_as("SELECT id FROM project LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        let project_id = project_row.0.to_string();

        // CREATE node
        let (status, body) = json_request(
            router.clone(),
            Method::POST,
            "/api/nodes",
            Some(json!({
                "type": "idea",
                "layer": 5,
                "project_id": project_id,
                "title": "Integration Test Idea",
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let node_id = body["node"]["id"].as_str().unwrap().to_string();

        // READ
        let (status, body) = json_request(
            router.clone(),
            Method::GET,
            &format!("/api/nodes/{node_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["node"]["title"], "Integration Test Idea");

        // LIST with filter
        let (status, body) = json_request(
            router.clone(),
            Method::GET,
            &format!("/api/nodes?project_id={project_id}&type=idea"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["nodes"].as_array().unwrap().len() >= 1);

        // SEARCH
        let (status, body) = json_request(
            router.clone(),
            Method::GET,
            "/api/nodes/search?q=Integration",
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["nodes"].as_array().unwrap().len() >= 1);

        // UPDATE
        let (status, body) = json_request(
            router.clone(),
            Method::PATCH,
            &format!("/api/nodes/{node_id}"),
            Some(json!({ "title": "Updated Idea", "status": "archived" })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["node"]["title"], "Updated Idea");
        assert_eq!(body["node"]["status"], "archived");

        // CREATE second node for edges
        let (_, body2) = json_request(
            router.clone(),
            Method::POST,
            "/api/nodes",
            Some(json!({
                "type": "goal",
                "layer": 4,
                "project_id": project_id,
                "title": "Test Goal",
            })),
        )
        .await;
        let node_id_2 = body2["node"]["id"].as_str().unwrap().to_string();

        // CREATE EDGE
        let (status, edge_body) = json_request(
            router.clone(),
            Method::POST,
            &format!("/api/nodes/{node_id}/edges"),
            Some(json!({
                "source_id": node_id,
                "target_id": node_id_2,
                "relation_type": "supports",
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let edge_id = edge_body["edge"]["id"].as_str().unwrap().to_string();
        assert_eq!(edge_body["edge"]["relation_type"], "supports");

        // LIST EDGES
        let (status, edges_body) = json_request(
            router.clone(),
            Method::GET,
            &format!("/api/nodes/{node_id}/edges"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(edges_body["edges"].as_array().unwrap().len() >= 1);

        // DELETE EDGE
        let (status, _) = json_request(
            router.clone(),
            Method::DELETE,
            &format!("/api/edges/{edge_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        // VERSIONS (should be empty)
        let (status, versions_body) = json_request(
            router.clone(),
            Method::GET,
            &format!("/api/nodes/{node_id}/versions"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(versions_body["versions"].as_array().unwrap().len(), 0);

        // AGENT RUN
        let (status, run_body) = json_request(
            router.clone(),
            Method::POST,
            "/api/agent-runs",
            Some(json!({
                "agent": "connector",
                "model": "gpt-4",
                "tokens": 100,
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(run_body["agent_run"]["agent"], "connector");

        // DELETE nodes
        let (status, _) = json_request(
            router.clone(),
            Method::DELETE,
            &format!("/api/nodes/{node_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        // Verify deleted
        let (status, _) = json_request(
            router.clone(),
            Method::GET,
            &format!("/api/nodes/{node_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);

        // Cleanup
        let _ = json_request(
            router.clone(),
            Method::DELETE,
            &format!("/api/nodes/{node_id_2}"),
            None,
        )
        .await;
    }

    #[tokio::test]
    #[ignore]
    async fn get_nonexistent_node_returns_404() {
        dotenvy::dotenv().ok();
        let url = std::env::var("DATABASE_URL").unwrap();
        let pool = crate::db::pool::connect(&url).await.unwrap();
        crate::db::pool::run_migrations(&pool).await.unwrap();

        let router = app(&pool).await;
        let fake_id = uuid::Uuid::new_v4();
        let (status, body) =
            json_request(router, Method::GET, &format!("/api/nodes/{fake_id}"), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(body["error"].as_str().unwrap().contains("not found"));
    }

    #[tokio::test]
    #[ignore]
    async fn delete_nonexistent_returns_404() {
        dotenvy::dotenv().ok();
        let url = std::env::var("DATABASE_URL").unwrap();
        let pool = crate::db::pool::connect(&url).await.unwrap();
        crate::db::pool::run_migrations(&pool).await.unwrap();

        let router = app(&pool).await;
        let fake_id = uuid::Uuid::new_v4();

        // Delete nonexistent node
        let (status, _) = json_request(
            router.clone(),
            Method::DELETE,
            &format!("/api/nodes/{fake_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);

        // Delete nonexistent edge
        let (status, _) = json_request(
            router,
            Method::DELETE,
            &format!("/api/edges/{fake_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
}
