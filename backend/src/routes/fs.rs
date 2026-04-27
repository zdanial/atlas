//! Filesystem browse endpoint — used by the frontend folder picker.
//! Lists subdirectories of a given path so the user can navigate to a project.

use axum::{extract::Query, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::nodes::ErrorResponse;

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    /// Absolute path to list. If omitted, returns home dir + filesystem root.
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BrowseResponse {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<BrowseEntry>,
}

#[derive(Debug, Serialize)]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub async fn browse(
    Query(q): Query<BrowseQuery>,
) -> Result<Json<BrowseResponse>, (StatusCode, Json<ErrorResponse>)> {
    let path = match q.path.as_deref() {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => default_root(),
    };

    let canon = std::fs::canonicalize(&path).map_err(|e| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: format!("Cannot resolve path: {e}"),
            }),
        )
    })?;

    if !canon.is_dir() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: "Not a directory".into(),
            }),
        ));
    }

    let mut entries: Vec<BrowseEntry> = Vec::new();
    let rd = std::fs::read_dir(&canon).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("read_dir failed: {e}"),
            }),
        )
    })?;

    for entry in rd.flatten() {
        let p = entry.path();
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Hide dotfiles + common junk dirs to keep the picker readable
        if name.starts_with('.') {
            continue;
        }
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        // Show directories only — picker is for selecting a folder
        if !ft.is_dir() {
            continue;
        }
        entries.push(BrowseEntry {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir: true,
        });
    }

    entries.sort_by_key(|e| e.name.to_lowercase());

    let parent = canon
        .parent()
        .filter(|p| p.as_os_str() != canon.as_os_str())
        .map(|p| p.to_string_lossy().to_string());

    Ok(Json(BrowseResponse {
        path: canon.to_string_lossy().to_string(),
        parent,
        entries,
    }))
}

fn default_root() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        let p = Path::new(&home).to_path_buf();
        if p.is_dir() {
            return p;
        }
    }
    PathBuf::from("/")
}
