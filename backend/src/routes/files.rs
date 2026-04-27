// ---------------------------------------------------------------------------
// File I/O routes — read/write .md files with YAML frontmatter
// ---------------------------------------------------------------------------

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::db::pool::Pool;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub modified: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WriteFileRequest {
    pub slug: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ReadFileRequest {
    pub slug: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn project_dir(project_id: &str) -> PathBuf {
    // Store files in .butterfly/<project_id>/ relative to current working dir
    let base = std::env::var("BUTTERFLY_DATA_DIR").unwrap_or_else(|_| ".butterfly".to_string());
    PathBuf::from(base).join(project_id)
}

async fn ensure_dir(dir: &std::path::Path) -> Result<(), StatusCode> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/projects/:id/files — list .md files
pub async fn list_files(
    Path(project_id): Path<String>,
    State(_pool): State<Pool>,
) -> Result<Json<Value>, StatusCode> {
    let dir = project_dir(&project_id);

    if !dir.exists() {
        return Ok(Json(json!({ "files": [] })));
    }

    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let modified = entry
                .metadata()
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

            entries.push(FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                modified,
            });
        }
    }

    Ok(Json(json!({ "files": entries })))
}

/// POST /api/projects/:id/files/read — read a specific .md file
pub async fn read_file(
    Path(project_id): Path<String>,
    State(_pool): State<Pool>,
    Json(body): Json<ReadFileRequest>,
) -> Result<Json<Value>, StatusCode> {
    let path = project_dir(&project_id).join(format!("{}.md", body.slug));

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "slug": body.slug,
        "content": content,
    })))
}

/// POST /api/projects/:id/files/write — write a .md file
pub async fn write_file(
    Path(project_id): Path<String>,
    State(_pool): State<Pool>,
    Json(body): Json<WriteFileRequest>,
) -> Result<Json<Value>, StatusCode> {
    let dir = project_dir(&project_id);
    ensure_dir(&dir).await?;

    let path = dir.join(format!("{}.md", body.slug));

    tokio::fs::write(&path, &body.content)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "slug": body.slug,
        "written": true,
    })))
}

/// DELETE /api/projects/:id/files/:slug — delete a .md file
pub async fn delete_file(
    Path((project_id, slug)): Path<(String, String)>,
    State(_pool): State<Pool>,
) -> Result<Json<Value>, StatusCode> {
    let path = project_dir(&project_id).join(format!("{slug}.md"));

    if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(Json(json!({ "deleted": true })))
}

/// POST /api/projects/:id/sync — bulk sync (placeholder for full sync)
pub async fn sync_files(
    Path(project_id): Path<String>,
    State(_pool): State<Pool>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let dir = project_dir(&project_id);
    ensure_dir(&dir).await?;

    let files = body
        .get("files")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();

    let mut written = 0;
    for file in &files {
        let slug = file.get("slug").and_then(|s| s.as_str()).unwrap_or("");
        let content = file.get("content").and_then(|c| c.as_str()).unwrap_or("");
        if !slug.is_empty() {
            let path = dir.join(format!("{slug}.md"));
            if tokio::fs::write(&path, content).await.is_ok() {
                written += 1;
            }
        }
    }

    Ok(Json(json!({
        "synced": written,
        "total": files.len(),
    })))
}
