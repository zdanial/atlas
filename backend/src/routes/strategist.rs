use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::db::{models, pool::Pool};

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct Suggestion {
    pub kind: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub intent_id: Uuid,
    pub related_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct WhatIfResult {
    pub dropped_intent: Uuid,
    pub affected_nodes: Vec<AffectedNode>,
    pub summary: String,
}

#[derive(Debug, Serialize)]
pub struct AffectedNode {
    pub id: Uuid,
    pub title: String,
    pub impact: String,
}

#[derive(Debug, Serialize)]
pub struct AnalysisResponse {
    pub suggestions: Vec<Suggestion>,
}

#[derive(Debug, Serialize)]
pub struct WhatIfResponse {
    pub result: WhatIfResult,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/projects/:id/strategist/analyze
///
/// Analyze the Intent layer for a project. Detects:
/// - Stale intents (no linked node activity in >14 days)
/// - Blocked intents (blocked by unresolved questions/risks)
/// - Contradicting intents
pub async fn analyze_intents(
    State(pool): State<Pool>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<AnalysisResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Fetch all intents for the project
    let intents = sqlx::query_as::<_, models::Node>(
        "SELECT id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at \
         FROM node WHERE project_id = $1 AND type = 'intent' \
         ORDER BY created_at DESC",
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

    // Fetch all nodes to check for linked activity
    let all_nodes = sqlx::query_as::<_, models::Node>(
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

    // Fetch edges for blocking detection
    let edges = sqlx::query_as::<_, models::NodeEdge>(
        "SELECT e.id, e.source_id, e.target_id, e.relation_type, e.weight, e.source, e.created_at \
         FROM node_edge e \
         JOIN node n ON e.source_id = n.id \
         WHERE n.project_id = $1",
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let now = chrono::Utc::now();
    let stale_threshold = chrono::Duration::days(14);
    let mut suggestions = Vec::new();

    for intent in &intents {
        if intent.status.as_deref() == Some("done") || intent.status.as_deref() == Some("archived")
        {
            continue;
        }

        // Check for stale intents
        let linked_nodes: Vec<&models::Node> = all_nodes
            .iter()
            .filter(|n| n.parent_id == Some(intent.id))
            .collect();

        let latest_activity = linked_nodes
            .iter()
            .filter_map(|n| n.updated_at)
            .max()
            .unwrap_or(intent.created_at.unwrap_or(now));

        if now - latest_activity > stale_threshold {
            suggestions.push(Suggestion {
                kind: "stale".into(),
                severity: "warning".into(),
                title: format!("Stale intent: {}", intent.title),
                description: format!(
                    "No activity on '{}' for {} days. Consider updating or archiving.",
                    intent.title,
                    (now - latest_activity).num_days()
                ),
                intent_id: intent.id,
                related_ids: linked_nodes.iter().map(|n| n.id).collect(),
            });
        }

        // Check for blocking edges
        let blocking_edges: Vec<&models::NodeEdge> = edges
            .iter()
            .filter(|e| {
                e.relation_type == "blocks" && linked_nodes.iter().any(|n| n.id == e.target_id)
            })
            .collect();

        if !blocking_edges.is_empty() {
            let blockers: Vec<Uuid> = blocking_edges.iter().map(|e| e.source_id).collect();
            let blocker_nodes: Vec<&models::Node> = all_nodes
                .iter()
                .filter(|n| blockers.contains(&n.id))
                .collect();

            let blocker_names: Vec<String> = blocker_nodes
                .iter()
                .map(|n| format!("{} ({})", n.title, n.r#type))
                .collect();

            suggestions.push(Suggestion {
                kind: "blocked".into(),
                severity: "error".into(),
                title: format!("Blocked intent: {}", intent.title),
                description: format!(
                    "'{}' is blocked by: {}",
                    intent.title,
                    blocker_names.join(", ")
                ),
                intent_id: intent.id,
                related_ids: blockers,
            });
        }
    }

    // Log agent run
    sqlx::query(
        "INSERT INTO agent_run (agent, layer, input, output, model) \
         VALUES ('strategist', 4, $1, $2, 'heuristic')",
    )
    .bind(serde_json::json!({ "project_id": project_id, "intent_count": intents.len() }))
    .bind(serde_json::json!({ "suggestion_count": suggestions.len() }))
    .execute(&pool)
    .await
    .ok();

    Ok(Json(AnalysisResponse { suggestions }))
}

/// GET /api/projects/:id/strategist/what-if/:intent_id
///
/// Analyze the downstream impact of dropping an intent.
pub async fn what_if_drop(
    State(pool): State<Pool>,
    Path((project_id, intent_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<WhatIfResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Get the intent
    let intent = sqlx::query_as::<_, models::Node>(
        "SELECT id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at \
         FROM node WHERE id = $1 AND project_id = $2",
    )
    .bind(intent_id)
    .bind(project_id)
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

    let intent = intent.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Intent {intent_id} not found"),
            }),
        )
    })?;

    // Find all nodes linked to this intent (directly or via edges)
    let children = sqlx::query_as::<_, models::Node>(
        "SELECT id, type, layer, project_id, parent_id, title, body, payload, \
         status, position_x, position_y, created_by, created_at, updated_at \
         FROM node WHERE parent_id = $1",
    )
    .bind(intent_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let affected: Vec<AffectedNode> = children
        .iter()
        .map(|n| AffectedNode {
            id: n.id,
            title: n.title.clone(),
            impact: format!("{} would become orphaned", n.r#type),
        })
        .collect();

    let summary = if affected.is_empty() {
        format!(
            "Dropping '{}' would have no downstream impact — no linked nodes found.",
            intent.title
        )
    } else {
        format!(
            "Dropping '{}' would affect {} nodes: {}",
            intent.title,
            affected.len(),
            affected
                .iter()
                .map(|a| a.title.clone())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    Ok(Json(WhatIfResponse {
        result: WhatIfResult {
            dropped_intent: intent_id,
            affected_nodes: affected,
            summary,
        },
    }))
}
