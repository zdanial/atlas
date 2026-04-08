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
pub struct ListImportsQuery {
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateImportSourceBody {
    pub project_id: Uuid,
    pub source_type: String,
    pub source_config: Value,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateImportSourceBody {
    pub source_config: Option<Value>,
    pub status: Option<String>,
    pub last_synced: Option<String>,
    pub sync_cursor: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateImportMappingBody {
    pub source_id: Uuid,
    pub external_id: String,
    pub external_type: String,
    pub node_id: Uuid,
    pub confidence: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ImportSourceResponse {
    pub import_source: models::ImportSource,
}

#[derive(Debug, Serialize)]
pub struct ImportSourcesResponse {
    pub import_sources: Vec<models::ImportSource>,
}

#[derive(Debug, Serialize)]
pub struct ImportMappingResponse {
    pub import_mapping: models::ImportMapping,
}

#[derive(Debug, Serialize)]
pub struct ImportMappingsResponse {
    pub import_mappings: Vec<models::ImportMapping>,
}

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

#[cfg(not(feature = "sqlite"))]
const LIST_IMPORTS_SQL: &str = "\
    SELECT id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at \
    FROM import_source \
    WHERE ($1::uuid IS NULL OR project_id = $1) \
    ORDER BY created_at DESC";

#[cfg(feature = "sqlite")]
const LIST_IMPORTS_SQL: &str = "\
    SELECT id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at \
    FROM import_source \
    WHERE ($1 IS NULL OR project_id = $1) \
    ORDER BY created_at DESC";

#[cfg(not(feature = "sqlite"))]
const UPDATE_IMPORT_SOURCE_SQL: &str = "\
    UPDATE import_source SET \
    source_config = COALESCE($2, source_config), \
    status = COALESCE($3, status), \
    last_synced = COALESCE($4::timestamptz, last_synced), \
    sync_cursor = COALESCE($5, sync_cursor) \
    WHERE id = $1 \
    RETURNING id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at";

#[cfg(feature = "sqlite")]
const UPDATE_IMPORT_SOURCE_SQL: &str = "\
    UPDATE import_source SET \
    source_config = COALESCE($2, source_config), \
    status = COALESCE($3, status), \
    last_synced = COALESCE($4, last_synced), \
    sync_cursor = COALESCE($5, sync_cursor) \
    WHERE id = $1 \
    RETURNING id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at";

// ---------------------------------------------------------------------------
// Handlers — Import Sources
// ---------------------------------------------------------------------------

/// GET /api/imports?project_id=...
pub async fn list_imports(
    State(pool): State<Pool>,
    Query(query): Query<ListImportsQuery>,
) -> Result<Json<ImportSourcesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let import_sources = sqlx::query_as::<_, models::ImportSource>(LIST_IMPORTS_SQL)
        .bind(query.project_id)
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

    Ok(Json(ImportSourcesResponse { import_sources }))
}

/// POST /api/imports
pub async fn create_import(
    State(pool): State<Pool>,
    Json(body): Json<CreateImportSourceBody>,
) -> Result<(StatusCode, Json<ImportSourceResponse>), (StatusCode, Json<ErrorResponse>)> {
    let import_source = sqlx::query_as::<_, models::ImportSource>(
        "INSERT INTO import_source (project_id, source_type, source_config, status) \
         VALUES ($1, $2, $3, COALESCE($4, 'active')) \
         RETURNING id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at",
    )
    .bind(body.project_id)
    .bind(&body.source_type)
    .bind(&body.source_config)
    .bind(&body.status)
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
        Json(ImportSourceResponse { import_source }),
    ))
}

/// GET /api/imports/:id
pub async fn get_import(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ImportSourceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let import_source = sqlx::query_as::<_, models::ImportSource>(
        "SELECT id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at \
         FROM import_source WHERE id = $1",
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

    match import_source {
        Some(s) => Ok(Json(ImportSourceResponse { import_source: s })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("ImportSource {id} not found"),
            }),
        )),
    }
}

/// PATCH /api/imports/:id
pub async fn update_import(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateImportSourceBody>,
) -> Result<Json<ImportSourceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let import_source = sqlx::query_as::<_, models::ImportSource>(UPDATE_IMPORT_SOURCE_SQL)
        .bind(id)
        .bind(&body.source_config)
        .bind(&body.status)
        .bind(&body.last_synced)
        .bind(&body.sync_cursor)
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

    match import_source {
        Some(s) => Ok(Json(ImportSourceResponse { import_source: s })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("ImportSource {id} not found"),
            }),
        )),
    }
}

/// DELETE /api/imports/:id
pub async fn delete_import(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM import_source WHERE id = $1")
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
                error: format!("ImportSource {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Handlers — Import Mappings
// ---------------------------------------------------------------------------

/// GET /api/imports/:id/mappings
pub async fn list_import_mappings(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ImportMappingsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let import_mappings = sqlx::query_as::<_, models::ImportMapping>(
        "SELECT id, source_id, external_id, external_type, node_id, confidence, created_at \
         FROM import_mapping WHERE source_id = $1 \
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

    Ok(Json(ImportMappingsResponse { import_mappings }))
}

/// POST /api/imports/:id/mappings
pub async fn create_import_mapping(
    State(pool): State<Pool>,
    Path(_id): Path<Uuid>,
    Json(body): Json<CreateImportMappingBody>,
) -> Result<(StatusCode, Json<ImportMappingResponse>), (StatusCode, Json<ErrorResponse>)> {
    let import_mapping = sqlx::query_as::<_, models::ImportMapping>(
        "INSERT INTO import_mapping (source_id, external_id, external_type, node_id, confidence) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, source_id, external_id, external_type, node_id, confidence, created_at",
    )
    .bind(body.source_id)
    .bind(&body.external_id)
    .bind(&body.external_type)
    .bind(body.node_id)
    .bind(body.confidence)
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
        Json(ImportMappingResponse { import_mapping }),
    ))
}
