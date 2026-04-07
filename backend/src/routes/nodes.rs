use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::{models, pool::Pool};

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListNodesQuery {
    pub project_id: Option<Uuid>,
    pub r#type: Option<String>,
    pub layer: Option<i32>,
    pub status: Option<String>,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateNodeBody {
    pub r#type: String,
    pub layer: i32,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub body: Option<Value>,
    pub payload: Option<Value>,
    pub status: Option<String>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNodeBody {
    pub r#type: Option<String>,
    pub title: Option<String>,
    pub body: Option<Value>,
    pub payload: Option<Value>,
    pub status: Option<String>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeBody {
    pub source_id: Uuid,
    pub target_id: Uuid,
    pub relation_type: String,
    pub weight: Option<f64>,
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchNodesQuery {
    pub q: String,
    pub project_id: Option<Uuid>,
    pub r#type: Option<String>,
    pub layer: Option<i32>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentRunBody {
    pub agent: String,
    pub layer: Option<i32>,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub model: Option<String>,
    pub tokens: Option<i64>,
    pub cost: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct NodeResponse {
    pub node: models::Node,
}

#[derive(Debug, Serialize)]
pub struct NodesResponse {
    pub nodes: Vec<models::Node>,
}

#[derive(Debug, Serialize)]
pub struct EdgeResponse {
    pub edge: models::NodeEdge,
}

#[derive(Debug, Serialize)]
pub struct EdgesResponse {
    pub edges: Vec<models::NodeEdge>,
}

#[derive(Debug, Serialize)]
pub struct VersionsResponse {
    pub versions: Vec<models::NodeVersion>,
}

#[derive(Debug, Serialize)]
pub struct AgentRunResponse {
    pub agent_run: models::AgentRun,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

#[cfg(not(feature = "sqlite"))]
const LIST_NODES_SQL: &str = "\
    SELECT id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at \
    FROM node \
    WHERE ($1::uuid IS NULL OR project_id = $1) \
    AND ($2::text IS NULL OR type = $2) \
    AND ($3::int IS NULL OR layer = $3) \
    AND ($4::text IS NULL OR status = $4) \
    AND ($5::uuid IS NULL OR parent_id = $5) \
    ORDER BY created_at DESC";

#[cfg(feature = "sqlite")]
const LIST_NODES_SQL: &str = "\
    SELECT id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at \
    FROM node \
    WHERE ($1 IS NULL OR project_id = $1) \
    AND ($2 IS NULL OR type = $2) \
    AND ($3 IS NULL OR layer = $3) \
    AND ($4 IS NULL OR status = $4) \
    AND ($5 IS NULL OR parent_id = $5) \
    ORDER BY created_at DESC";

#[cfg(not(feature = "sqlite"))]
const SEARCH_NODES_SQL: &str = "\
    SELECT id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at \
    FROM node \
    WHERE title ILIKE $1 \
    AND ($2::uuid IS NULL OR project_id = $2) \
    AND ($3::text IS NULL OR type = $3) \
    AND ($4::int IS NULL OR layer = $4) \
    AND ($5::text IS NULL OR status = $5) \
    ORDER BY created_at DESC";

#[cfg(feature = "sqlite")]
const SEARCH_NODES_SQL: &str = "\
    SELECT id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at \
    FROM node \
    WHERE title LIKE $1 \
    AND ($2 IS NULL OR project_id = $2) \
    AND ($3 IS NULL OR type = $3) \
    AND ($4 IS NULL OR layer = $4) \
    AND ($5 IS NULL OR status = $5) \
    ORDER BY created_at DESC";

#[cfg(not(feature = "sqlite"))]
const UPDATE_NODE_SQL: &str = "\
    UPDATE node SET \
    type = COALESCE($2, type), \
    title = COALESCE($3, title), \
    body = COALESCE($4, body), \
    payload = COALESCE($5, payload), \
    status = COALESCE($6, status), \
    position_x = COALESCE($7, position_x), \
    position_y = COALESCE($8, position_y), \
    parent_id = COALESCE($9, parent_id), \
    updated_at = now() \
    WHERE id = $1 \
    RETURNING id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at";

#[cfg(feature = "sqlite")]
const UPDATE_NODE_SQL: &str = "\
    UPDATE node SET \
    type = COALESCE($2, type), \
    title = COALESCE($3, title), \
    body = COALESCE($4, body), \
    payload = COALESCE($5, payload), \
    status = COALESCE($6, status), \
    position_x = COALESCE($7, position_x), \
    position_y = COALESCE($8, position_y), \
    parent_id = COALESCE($9, parent_id), \
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
    WHERE id = $1 \
    RETURNING id, type, layer, project_id, parent_id, title, body, payload, \
    status, position_x, position_y, created_by, created_at, updated_at";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/nodes?project_id=...&type=...&layer=...&status=...
pub async fn list_nodes(
    State(pool): State<Pool>,
    Query(query): Query<ListNodesQuery>,
) -> Result<Json<NodesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = sqlx::query_as::<_, models::Node>(LIST_NODES_SQL)
        .bind(query.project_id)
        .bind(query.r#type)
        .bind(query.layer)
        .bind(query.status)
        .bind(query.parent_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(NodesResponse { nodes }))
}

/// POST /api/nodes
pub async fn create_node(
    State(pool): State<Pool>,
    Json(body): Json<CreateNodeBody>,
) -> Result<(StatusCode, Json<NodeResponse>), (StatusCode, Json<ErrorResponse>)> {
    let node = sqlx::query_as::<_, models::Node>(
        "INSERT INTO node (type, layer, project_id, parent_id, title, body, payload, status, position_x, position_y) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'active'), $9, $10) \
         RETURNING id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at",
    )
    .bind(&body.r#type)
    .bind(body.layer)
    .bind(body.project_id)
    .bind(body.parent_id)
    .bind(&body.title)
    .bind(&body.body)
    .bind(&body.payload)
    .bind(&body.status)
    .bind(body.position_x)
    .bind(body.position_y)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(NodeResponse { node })))
}

/// GET /api/nodes/:id
pub async fn get_node(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<NodeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let node = sqlx::query_as::<_, models::Node>(
        "SELECT id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at \
         FROM node WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    match node {
        Some(n) => Ok(Json(NodeResponse { node: n })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Node {id} not found"),
            }),
        )),
    }
}

/// PATCH /api/nodes/:id
pub async fn update_node(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateNodeBody>,
) -> Result<Json<NodeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let node = sqlx::query_as::<_, models::Node>(UPDATE_NODE_SQL)
        .bind(id)
        .bind(&body.r#type)
        .bind(&body.title)
        .bind(&body.body)
        .bind(&body.payload)
        .bind(&body.status)
        .bind(body.position_x)
        .bind(body.position_y)
        .bind(body.parent_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    match node {
        Some(n) => Ok(Json(NodeResponse { node: n })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Node {id} not found"),
            }),
        )),
    }
}

/// DELETE /api/nodes/:id
pub async fn delete_node(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM node WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Node {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/nodes/:id/edges
pub async fn list_node_edges(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<EdgesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let edges = sqlx::query_as::<_, models::NodeEdge>(
        "SELECT id, source_id, target_id, relation_type, weight, source, created_at \
         FROM node_edge WHERE source_id = $1 OR target_id = $1 \
         ORDER BY created_at DESC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(EdgesResponse { edges }))
}

/// POST /api/nodes/:id/edges
pub async fn create_node_edge(
    State(pool): State<Pool>,
    Path(_id): Path<Uuid>,
    Json(body): Json<CreateEdgeBody>,
) -> Result<(StatusCode, Json<EdgeResponse>), (StatusCode, Json<ErrorResponse>)> {
    let edge = sqlx::query_as::<_, models::NodeEdge>(
        "INSERT INTO node_edge (source_id, target_id, relation_type, weight, source) \
         VALUES ($1, $2, $3, COALESCE($4, 1.0), COALESCE($5, 'human')) \
         RETURNING id, source_id, target_id, relation_type, weight, source, created_at",
    )
    .bind(body.source_id)
    .bind(body.target_id)
    .bind(&body.relation_type)
    .bind(body.weight)
    .bind(&body.source)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok((StatusCode::CREATED, Json(EdgeResponse { edge })))
}

/// DELETE /api/edges/:id
pub async fn delete_edge(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM node_edge WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Edge {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/nodes/:id/versions
pub async fn list_node_versions(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<VersionsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let versions = sqlx::query_as::<_, models::NodeVersion>(
        "SELECT id, node_id, version, body, payload, diff_summary, author, created_at \
         FROM node_version WHERE node_id = $1 \
         ORDER BY version ASC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(VersionsResponse { versions }))
}

/// GET /api/nodes/search?q=...&project_id=...
pub async fn search_nodes(
    State(pool): State<Pool>,
    Query(query): Query<SearchNodesQuery>,
) -> Result<Json<NodesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let pattern = format!("%{}%", query.q);
    let nodes = sqlx::query_as::<_, models::Node>(SEARCH_NODES_SQL)
        .bind(&pattern)
        .bind(query.project_id)
        .bind(query.r#type)
        .bind(query.layer)
        .bind(query.status)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(NodesResponse { nodes }))
}

/// POST /api/agent-runs
pub async fn create_agent_run(
    State(pool): State<Pool>,
    Json(body): Json<CreateAgentRunBody>,
) -> Result<(StatusCode, Json<AgentRunResponse>), (StatusCode, Json<ErrorResponse>)> {
    let run = sqlx::query_as::<_, models::AgentRun>(
        "INSERT INTO agent_run (agent, layer, input, output, model, tokens, cost) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING id, agent, layer, input, output, model, tokens, cost, created_at",
    )
    .bind(&body.agent)
    .bind(body.layer)
    .bind(&body.input)
    .bind(&body.output)
    .bind(&body.model)
    .bind(body.tokens)
    .bind(body.cost)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok((
        StatusCode::CREATED,
        Json(AgentRunResponse { agent_run: run }),
    ))
}
