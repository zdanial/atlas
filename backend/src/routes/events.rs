use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::{models, pool::Pool};

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListEventsQuery {
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub event_type: Option<String>,
    pub entity_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventBody {
    pub project_id: Uuid,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub before_state: Option<Value>,
    pub after_state: Option<Value>,
    pub actor: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct StateAtQuery {
    pub at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct EventResponse {
    pub event: models::Event,
}

#[derive(Debug, Serialize)]
pub struct EventsResponse {
    pub events: Vec<models::Event>,
}

#[derive(Debug, Serialize)]
pub struct GraphStateResponse {
    pub timestamp: DateTime<Utc>,
    pub nodes: Vec<models::Node>,
    pub edges: Vec<models::NodeEdge>,
}

#[derive(Debug, Serialize)]
pub struct SnapshotResponse {
    pub snapshot: models::Snapshot,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/projects/:id/events?from=...&to=...
pub async fn list_events(
    State(pool): State<Pool>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListEventsQuery>,
) -> Result<Json<EventsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let events = sqlx::query_as::<_, models::Event>(
        "SELECT id, project_id, timestamp, event_type, entity_type, entity_id, \
         before_state, after_state, actor, metadata \
         FROM event \
         WHERE project_id = $1 \
         AND ($2::timestamptz IS NULL OR timestamp >= $2) \
         AND ($3::timestamptz IS NULL OR timestamp <= $3) \
         AND ($4::text IS NULL OR event_type = $4) \
         AND ($5::text IS NULL OR entity_type = $5) \
         ORDER BY timestamp ASC",
    )
    .bind(project_id)
    .bind(query.from)
    .bind(query.to)
    .bind(&query.event_type)
    .bind(&query.entity_type)
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

    Ok(Json(EventsResponse { events }))
}

/// POST /api/events
pub async fn create_event(
    State(pool): State<Pool>,
    Json(body): Json<CreateEventBody>,
) -> Result<(StatusCode, Json<EventResponse>), (StatusCode, Json<ErrorResponse>)> {
    let event = sqlx::query_as::<_, models::Event>(
        "INSERT INTO event (project_id, event_type, entity_type, entity_id, \
         before_state, after_state, actor, metadata) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         RETURNING id, project_id, timestamp, event_type, entity_type, entity_id, \
         before_state, after_state, actor, metadata",
    )
    .bind(body.project_id)
    .bind(&body.event_type)
    .bind(&body.entity_type)
    .bind(body.entity_id)
    .bind(&body.before_state)
    .bind(&body.after_state)
    .bind(&body.actor)
    .bind(&body.metadata)
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

    Ok((StatusCode::CREATED, Json(EventResponse { event })))
}

/// GET /api/projects/:id/state?at=<timestamp>
///
/// Reconstructs the graph state at the given point in time.
/// Finds the nearest snapshot before `at`, then replays events forward.
pub async fn get_state_at(
    State(pool): State<Pool>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<StateAtQuery>,
) -> Result<Json<GraphStateResponse>, (StatusCode, Json<ErrorResponse>)> {
    let at = query.at;

    // Find nearest snapshot before `at`
    let snapshot = sqlx::query_as::<_, models::Snapshot>(
        "SELECT id, project_id, timestamp, nodes, edges, created_at \
         FROM snapshot \
         WHERE project_id = $1 AND timestamp <= $2 \
         ORDER BY timestamp DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(at)
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

    // Parse snapshot into maps
    let mut node_map: std::collections::HashMap<Uuid, models::Node> =
        std::collections::HashMap::new();
    let mut edge_map: std::collections::HashMap<Uuid, models::NodeEdge> =
        std::collections::HashMap::new();

    let replay_from = if let Some(ref snap) = snapshot {
        if let Ok(nodes) =
            serde_json::from_value::<Vec<models::Node>>(snap.nodes.clone())
        {
            for n in nodes {
                node_map.insert(n.id, n);
            }
        }
        if let Ok(edges) =
            serde_json::from_value::<Vec<models::NodeEdge>>(snap.edges.clone())
        {
            for e in edges {
                edge_map.insert(e.id, e);
            }
        }
        snap.timestamp
    } else {
        DateTime::<Utc>::from_timestamp(0, 0).unwrap_or_else(Utc::now)
    };

    // Replay events from snapshot to `at`
    let events = sqlx::query_as::<_, models::Event>(
        "SELECT id, project_id, timestamp, event_type, entity_type, entity_id, \
         before_state, after_state, actor, metadata \
         FROM event \
         WHERE project_id = $1 AND timestamp > $2 AND timestamp <= $3 \
         ORDER BY timestamp ASC",
    )
    .bind(project_id)
    .bind(replay_from)
    .bind(at)
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

    for event in &events {
        match event.event_type.as_str() {
            "node.created" | "node.updated" | "node.reclassified" => {
                if let Some(ref after) = event.after_state {
                    if let Ok(node) = serde_json::from_value::<models::Node>(after.clone()) {
                        node_map.insert(event.entity_id, node);
                    }
                }
            }
            "node.deleted" => {
                node_map.remove(&event.entity_id);
            }
            "edge.created" => {
                if let Some(ref after) = event.after_state {
                    if let Ok(edge) = serde_json::from_value::<models::NodeEdge>(after.clone()) {
                        edge_map.insert(event.entity_id, edge);
                    }
                }
            }
            "edge.deleted" => {
                edge_map.remove(&event.entity_id);
            }
            _ => {}
        }
    }

    Ok(Json(GraphStateResponse {
        timestamp: at,
        nodes: node_map.into_values().collect(),
        edges: edge_map.into_values().collect(),
    }))
}

/// POST /api/projects/:id/snapshots
///
/// Create a snapshot of the current graph state for the given project.
pub async fn create_snapshot(
    State(pool): State<Pool>,
    Path(project_id): Path<Uuid>,
) -> Result<(StatusCode, Json<SnapshotResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Fetch all current nodes and edges for the project
    let nodes = sqlx::query_as::<_, models::Node>(
        "SELECT id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at \
         FROM node WHERE project_id = $1",
    )
    .bind(project_id)
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

    let edges = sqlx::query_as::<_, models::NodeEdge>(
        "SELECT e.id, e.source_id, e.target_id, e.relation_type, e.weight, e.source, e.created_at \
         FROM node_edge e \
         JOIN node n ON e.source_id = n.id \
         WHERE n.project_id = $1",
    )
    .bind(project_id)
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

    let nodes_json = serde_json::to_value(&nodes).unwrap_or_default();
    let edges_json = serde_json::to_value(&edges).unwrap_or_default();

    let snapshot = sqlx::query_as::<_, models::Snapshot>(
        "INSERT INTO snapshot (project_id, nodes, edges) \
         VALUES ($1, $2, $3) \
         RETURNING id, project_id, timestamp, nodes, edges, created_at",
    )
    .bind(project_id)
    .bind(&nodes_json)
    .bind(&edges_json)
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

    Ok((StatusCode::CREATED, Json(SnapshotResponse { snapshot })))
}
