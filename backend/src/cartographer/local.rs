//! Local filesystem source for the Cartographer agent.
//! Mirrors github.rs but reads from a path on disk.

use std::path::{Path, PathBuf};

use super::github::TreeEntry;

#[derive(Debug, thiserror::Error)]
pub enum LocalError {
    #[error("Path not found or not a directory: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Validate that a path exists and is a directory.
pub fn validate_path(path: &str) -> Result<(), LocalError> {
    let p = Path::new(path);
    if !p.is_dir() {
        return Err(LocalError::NotFound(path.to_string()));
    }
    Ok(())
}

/// Fetch all `plans/*.md` files. Returns (filename, content) pairs.
/// If `plans/` does not exist, returns empty.
pub async fn fetch_plans(root: &str) -> Result<Vec<(String, String)>, LocalError> {
    let plans_dir = Path::new(root).join("plans");
    if !plans_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut results: Vec<(String, String)> = Vec::new();
    let mut rd = tokio::fs::read_dir(&plans_dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.ends_with(".md") => n.to_string(),
            _ => continue,
        };
        let content = tokio::fs::read_to_string(&path).await?;
        let truncated = if content.len() > 15_000 {
            format!("{}\n\n[... truncated ...]", &content[..15_000])
        } else {
            content
        };
        results.push((name, truncated));
    }

    results.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(results)
}

/// Recursively walk the source tree. Filter to relevant extensions, skip junk dirs, cap at 500.
pub async fn fetch_tree(root: &str) -> Result<Vec<TreeEntry>, LocalError> {
    let root_path = Path::new(root).to_path_buf();
    if !root_path.is_dir() {
        return Err(LocalError::NotFound(root.to_string()));
    }

    let relevant_exts = [
        ".rs", ".ts", ".svelte", ".toml", ".json", ".md", ".sql", ".js", ".go", ".py",
    ];
    let skip_dir_names = ["node_modules", ".git", "target", "dist", ".svelte-kit"];

    let mut out: Vec<TreeEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root_path.clone()];

    while let Some(dir) = stack.pop() {
        let mut rd = match tokio::fs::read_dir(&dir).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        while let Some(entry) = rd.next_entry().await? {
            let path = entry.path();
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            let ft = match entry.file_type().await {
                Ok(ft) => ft,
                Err(_) => continue,
            };

            if ft.is_dir() {
                if skip_dir_names.iter().any(|s| name == *s) {
                    continue;
                }
                stack.push(path);
                continue;
            }

            if !ft.is_file() {
                continue;
            }
            if !relevant_exts.iter().any(|ext| name.ends_with(ext)) {
                continue;
            }
            if name.ends_with(".lock") {
                continue;
            }

            let rel = path
                .strip_prefix(&root_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            let size = entry.metadata().await.ok().map(|m| m.len());

            out.push(TreeEntry {
                path: rel,
                kind: "blob".to_string(),
                size,
            });

            if out.len() >= 500 {
                return Ok(out);
            }
        }
    }

    Ok(out)
}
