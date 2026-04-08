use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::nodes::ErrorResponse;
use crate::db::{models, pool::Pool};

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListProjectsQuery {
    pub workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectBody {
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub settings: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub settings: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct ProjectResponse {
    pub project: models::Project,
}

#[derive(Debug, Serialize)]
pub struct ProjectsResponse {
    pub projects: Vec<models::Project>,
}

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

#[cfg(not(feature = "sqlite"))]
const LIST_PROJECTS_SQL: &str = "\
    SELECT id, workspace_id, name, slug, description, color, settings, created_at, updated_at \
    FROM project \
    WHERE ($1::uuid IS NULL OR workspace_id = $1) \
    ORDER BY created_at DESC";

#[cfg(feature = "sqlite")]
const LIST_PROJECTS_SQL: &str = "\
    SELECT id, workspace_id, name, slug, description, color, settings, created_at, updated_at \
    FROM project \
    WHERE ($1 IS NULL OR workspace_id = $1) \
    ORDER BY created_at DESC";

#[cfg(not(feature = "sqlite"))]
const UPDATE_PROJECT_SQL: &str = "\
    UPDATE project SET \
    name = COALESCE($2, name), \
    description = COALESCE($3, description), \
    color = COALESCE($4, color), \
    settings = COALESCE($5, settings), \
    updated_at = now() \
    WHERE id = $1 \
    RETURNING id, workspace_id, name, slug, description, color, settings, created_at, updated_at";

#[cfg(feature = "sqlite")]
const UPDATE_PROJECT_SQL: &str = "\
    UPDATE project SET \
    name = COALESCE($2, name), \
    description = COALESCE($3, description), \
    color = COALESCE($4, color), \
    settings = COALESCE($5, settings), \
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
    WHERE id = $1 \
    RETURNING id, workspace_id, name, slug, description, color, settings, created_at, updated_at";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Generate a URL-friendly slug from a name: lowercase, replace non-alphanumeric with hyphens,
/// collapse multiple hyphens, trim leading/trailing hyphens.
fn slugify(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse multiple hyphens and trim
    let mut result = String::new();
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen && !result.is_empty() {
                result.push('-');
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    result.trim_end_matches('-').to_string()
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/projects?workspace_id=...
pub async fn list_projects(
    State(pool): State<Pool>,
    Query(query): Query<ListProjectsQuery>,
) -> Result<Json<ProjectsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let projects = sqlx::query_as::<_, models::Project>(LIST_PROJECTS_SQL)
        .bind(query.workspace_id)
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

    Ok(Json(ProjectsResponse { projects }))
}

/// POST /api/projects
pub async fn create_project(
    State(pool): State<Pool>,
    Json(body): Json<CreateProjectBody>,
) -> Result<(StatusCode, Json<ProjectResponse>), (StatusCode, Json<ErrorResponse>)> {
    let slug = body.slug.unwrap_or_else(|| slugify(&body.name));

    let project = sqlx::query_as::<_, models::Project>(
        "INSERT INTO project (workspace_id, name, slug, description, color, settings) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         RETURNING id, workspace_id, name, slug, description, color, settings, created_at, updated_at",
    )
    .bind(body.workspace_id)
    .bind(&body.name)
    .bind(&slug)
    .bind(&body.description)
    .bind(&body.color)
    .bind(&body.settings)
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

    Ok((StatusCode::CREATED, Json(ProjectResponse { project })))
}

/// GET /api/projects/:id
pub async fn get_project(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProjectResponse>, (StatusCode, Json<ErrorResponse>)> {
    let project = sqlx::query_as::<_, models::Project>(
        "SELECT id, workspace_id, name, slug, description, color, settings, created_at, updated_at \
         FROM project WHERE id = $1",
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

    match project {
        Some(p) => Ok(Json(ProjectResponse { project: p })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Project {id} not found"),
            }),
        )),
    }
}

/// PATCH /api/projects/:id
pub async fn update_project(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProjectBody>,
) -> Result<Json<ProjectResponse>, (StatusCode, Json<ErrorResponse>)> {
    let project = sqlx::query_as::<_, models::Project>(UPDATE_PROJECT_SQL)
        .bind(id)
        .bind(&body.name)
        .bind(&body.description)
        .bind(&body.color)
        .bind(&body.settings)
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

    match project {
        Some(p) => Ok(Json(ProjectResponse { project: p })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Project {id} not found"),
            }),
        )),
    }
}

/// DELETE /api/projects/:id
pub async fn delete_project(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM project WHERE id = $1")
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
                error: format!("Project {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}
