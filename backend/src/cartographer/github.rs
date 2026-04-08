//! GitHub API client for the Cartographer agent.
//! Uses a PAT (Personal Access Token) for authentication.

use base64::Engine as _;
use serde::Deserialize;

#[derive(Debug, thiserror::Error)]
pub enum GithubError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("GitHub API error {status}: {message}")]
    Api { status: u16, message: String },
    #[error("Unexpected response shape: {0}")]
    Parse(String),
}

#[derive(Debug, Clone, Deserialize)]
pub struct TreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String, // "blob" or "tree"
    pub size: Option<u64>,
}

/// Validate that a PAT can access the given repo.
pub async fn validate_pat(
    client: &reqwest::Client,
    full_name: &str,
    pat: &str,
) -> Result<(), GithubError> {
    let url = format!("https://api.github.com/repos/{full_name}");
    let resp = github_get(client, &url, pat).await?;
    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        let message = json["message"].as_str().unwrap_or("unknown").to_string();
        return Err(GithubError::Api { status, message });
    }
    Ok(())
}

/// Fetch the recursive file tree for the repo's default branch.
/// Filters to source files only and caps at 500 entries.
pub async fn fetch_tree(
    client: &reqwest::Client,
    full_name: &str,
    pat: &str,
) -> Result<Vec<TreeEntry>, GithubError> {
    let url = format!("https://api.github.com/repos/{full_name}/git/trees/HEAD?recursive=1");
    let resp = github_get(client, &url, pat).await?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        let message = json["message"].as_str().unwrap_or("unknown").to_string();
        return Err(GithubError::Api { status, message });
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| GithubError::Parse(e.to_string()))?;

    let tree = json["tree"]
        .as_array()
        .ok_or_else(|| GithubError::Parse("missing 'tree' array".into()))?;

    let relevant_exts = [
        ".rs", ".ts", ".svelte", ".toml", ".json", ".md", ".sql", ".js", ".go", ".py",
    ];

    let entries: Vec<TreeEntry> = tree
        .iter()
        .filter_map(|v| serde_json::from_value::<TreeEntry>(v.clone()).ok())
        .filter(|e| {
            e.kind == "blob"
                && relevant_exts.iter().any(|ext| e.path.ends_with(ext))
                && !e.path.contains("node_modules")
                && !e.path.contains(".git")
                && !e.path.contains("target/")
                && !e.path.contains("dist/")
                && !e.path.contains(".lock")
        })
        .take(500)
        .collect();

    Ok(entries)
}

/// Fetch the text content of a single file.
pub async fn fetch_file(
    client: &reqwest::Client,
    full_name: &str,
    pat: &str,
    path: &str,
) -> Result<String, GithubError> {
    let url = format!("https://api.github.com/repos/{full_name}/contents/{path}");
    let resp = github_get(client, &url, pat).await?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        let message = json["message"].as_str().unwrap_or("unknown").to_string();
        return Err(GithubError::Api { status, message });
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| GithubError::Parse(e.to_string()))?;

    let encoded = json["content"]
        .as_str()
        .ok_or_else(|| GithubError::Parse("missing 'content' field".into()))?
        .replace('\n', "");

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&encoded)
        .map_err(|e| GithubError::Parse(format!("base64 decode: {e}")))?;

    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Fetch all `plans/*.md` files from the repo. Returns (filename, content) pairs.
/// Falls back gracefully if the `plans/` directory doesn't exist.
pub async fn fetch_plans(
    client: &reqwest::Client,
    full_name: &str,
    pat: &str,
) -> Result<Vec<(String, String)>, GithubError> {
    // List the plans/ directory
    let url = format!("https://api.github.com/repos/{full_name}/contents/plans");
    let resp = github_get(client, &url, pat).await?;

    if resp.status().as_u16() == 404 {
        // No plans/ directory — return empty
        return Ok(vec![]);
    }

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let json: serde_json::Value = resp.json().await.unwrap_or_default();
        let message = json["message"].as_str().unwrap_or("unknown").to_string();
        return Err(GithubError::Api { status, message });
    }

    let entries: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| GithubError::Parse(e.to_string()))?;

    let md_paths: Vec<String> = entries
        .iter()
        .filter_map(|e| {
            let name = e["name"].as_str()?;
            let kind = e["type"].as_str()?;
            if kind == "file" && name.ends_with(".md") {
                Some(format!("plans/{name}"))
            } else {
                None
            }
        })
        .collect();

    let mut results = Vec::with_capacity(md_paths.len());
    for path in md_paths {
        match fetch_file(client, full_name, pat, &path).await {
            Ok(content) => {
                let name = path.split('/').next_back().unwrap_or(&path).to_string();
                // Truncate to ~15KB per file to stay within token budget
                let truncated = if content.len() > 15_000 {
                    format!("{}\n\n[... truncated ...]", &content[..15_000])
                } else {
                    content
                };
                results.push((name, truncated));
            }
            Err(e) => tracing::warn!("Failed to fetch {path}: {e}"),
        }
    }

    // Sort by filename for deterministic order
    results.sort_by(|a, b| a.0.cmp(&b.0));

    Ok(results)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn github_get(
    client: &reqwest::Client,
    url: &str,
    pat: &str,
) -> Result<reqwest::Response, GithubError> {
    let mut req = client
        .get(url)
        .header("User-Agent", "atlas-cartographer/1.0")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");

    if !pat.is_empty() {
        req = req.header("Authorization", format!("Bearer {pat}"));
    }

    req.send().await.map_err(GithubError::Request)
}
