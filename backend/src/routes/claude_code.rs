use axum::{http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use super::nodes::ErrorResponse;

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ClaudeCodeRequest {
    pub system_prompt: Option<String>,
    pub user_prompt: String,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeCodeResponse {
    pub output: String,
}

#[derive(Debug, Deserialize)]
struct ContainerResponse {
    output: String,
}

#[derive(Debug, Deserialize)]
struct ContainerError {
    error: String,
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// POST /api/claude-code/prompt
///
/// Proxies a prompt to the Claude Code container service.
/// The container wraps `claude --print --model <model>` in an HTTP API.
pub async fn prompt(
    Json(body): Json<ClaudeCodeRequest>,
) -> Result<Json<ClaudeCodeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_prompt = body.user_prompt.trim();
    if user_prompt.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "user_prompt must not be empty".into(),
            }),
        ));
    }

    let base_url =
        std::env::var("CLAUDE_CODE_URL").unwrap_or_else(|_| "http://localhost:3002".into());
    let url = format!("{base_url}/prompt");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to create HTTP client: {e}"),
                }),
            )
        })?;

    let mut payload = serde_json::json!({
        "userPrompt": user_prompt,
    });

    if let Some(system_prompt) = &body.system_prompt {
        payload["systemPrompt"] = serde_json::Value::String(system_prompt.clone());
    }
    if let Some(model) = &body.model {
        payload["model"] = serde_json::Value::String(model.clone());
    }

    let res = client.post(&url).json(&payload).send().await.map_err(|e| {
        tracing::error!("Claude Code container request failed: {e}");
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: format!("Claude Code service unavailable: {e}"),
            }),
        )
    })?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res
            .json::<ContainerError>()
            .await
            .unwrap_or(ContainerError {
                error: format!("Container returned status {status}"),
            });
        tracing::error!("Claude Code container error {status}: {}", body.error);
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse { error: body.error }),
        ));
    }

    let container_resp = res.json::<ContainerResponse>().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to parse container response: {e}"),
            }),
        )
    })?;

    Ok(Json(ClaudeCodeResponse {
        output: container_resp.output,
    }))
}
