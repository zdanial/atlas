use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::{models, pool::Pool};

use super::nodes::ErrorResponse;

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListProvidersQuery {
    pub workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProviderBody {
    pub workspace_id: Uuid,
    pub provider: String,
    pub api_key_encrypted: Option<String>,
    pub model_overrides: Option<Value>,
    pub is_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProviderBody {
    pub provider: Option<String>,
    pub api_key_encrypted: Option<String>,
    pub model_overrides: Option<Value>,
    pub is_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ProviderResponse {
    pub provider_config: models::ProviderConfig,
}

#[derive(Debug, Serialize)]
pub struct ProvidersResponse {
    pub provider_configs: Vec<models::ProviderConfig>,
}

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

#[cfg(not(feature = "sqlite"))]
const LIST_PROVIDERS_SQL: &str = "\
    SELECT id, workspace_id, provider, api_key_encrypted, model_overrides, \
    is_enabled, created_at, updated_at \
    FROM provider_config \
    WHERE ($1::uuid IS NULL OR workspace_id = $1) \
    ORDER BY created_at DESC";

#[cfg(feature = "sqlite")]
const LIST_PROVIDERS_SQL: &str = "\
    SELECT id, workspace_id, provider, api_key_encrypted, model_overrides, \
    is_enabled, created_at, updated_at \
    FROM provider_config \
    WHERE ($1 IS NULL OR workspace_id = $1) \
    ORDER BY created_at DESC";

#[cfg(not(feature = "sqlite"))]
const UPDATE_PROVIDER_SQL: &str = "\
    UPDATE provider_config SET \
    provider = COALESCE($2, provider), \
    api_key_encrypted = COALESCE($3, api_key_encrypted), \
    model_overrides = COALESCE($4, model_overrides), \
    is_enabled = COALESCE($5, is_enabled), \
    updated_at = now() \
    WHERE id = $1 \
    RETURNING id, workspace_id, provider, api_key_encrypted, model_overrides, \
    is_enabled, created_at, updated_at";

#[cfg(feature = "sqlite")]
const UPDATE_PROVIDER_SQL: &str = "\
    UPDATE provider_config SET \
    provider = COALESCE($2, provider), \
    api_key_encrypted = COALESCE($3, api_key_encrypted), \
    model_overrides = COALESCE($4, model_overrides), \
    is_enabled = COALESCE($5, is_enabled), \
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
    WHERE id = $1 \
    RETURNING id, workspace_id, provider, api_key_encrypted, model_overrides, \
    is_enabled, created_at, updated_at";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/providers?workspace_id=...
pub async fn list_providers(
    State(pool): State<Pool>,
    Query(query): Query<ListProvidersQuery>,
) -> Result<Json<ProvidersResponse>, (StatusCode, Json<ErrorResponse>)> {
    let provider_configs = sqlx::query_as::<_, models::ProviderConfig>(LIST_PROVIDERS_SQL)
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

    Ok(Json(ProvidersResponse { provider_configs }))
}

/// POST /api/providers
pub async fn create_provider(
    State(pool): State<Pool>,
    Json(body): Json<CreateProviderBody>,
) -> Result<(StatusCode, Json<ProviderResponse>), (StatusCode, Json<ErrorResponse>)> {
    let provider_config = sqlx::query_as::<_, models::ProviderConfig>(
        "INSERT INTO provider_config (workspace_id, provider, api_key_encrypted, model_overrides, is_enabled) \
         VALUES ($1, $2, $3, $4, COALESCE($5, true)) \
         RETURNING id, workspace_id, provider, api_key_encrypted, model_overrides, \
         is_enabled, created_at, updated_at",
    )
    .bind(body.workspace_id)
    .bind(&body.provider)
    .bind(&body.api_key_encrypted)
    .bind(&body.model_overrides)
    .bind(body.is_enabled)
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
        Json(ProviderResponse { provider_config }),
    ))
}

/// PATCH /api/providers/:id
pub async fn update_provider(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProviderBody>,
) -> Result<Json<ProviderResponse>, (StatusCode, Json<ErrorResponse>)> {
    let provider_config = sqlx::query_as::<_, models::ProviderConfig>(UPDATE_PROVIDER_SQL)
        .bind(id)
        .bind(&body.provider)
        .bind(&body.api_key_encrypted)
        .bind(&body.model_overrides)
        .bind(body.is_enabled)
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

    match provider_config {
        Some(pc) => Ok(Json(ProviderResponse {
            provider_config: pc,
        })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("ProviderConfig {id} not found"),
            }),
        )),
    }
}

/// DELETE /api/providers/:id
pub async fn delete_provider(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM provider_config WHERE id = $1")
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
                error: format!("ProviderConfig {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}
