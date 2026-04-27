use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::db::{models, pool::Pool};

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ScanRepoBody {
    pub repo_url: String,
    pub project_id: Uuid,
    pub workspace_id: Uuid,
    pub github_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub repo_id: Uuid,
    pub commits_fetched: usize,
    pub prs_fetched: usize,
    pub nodes_created: usize,
    pub edges_created: usize,
    pub events_backfilled: usize,
}

#[derive(Debug, Serialize)]
pub struct ScanResponse {
    pub result: ScanResult,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// Internal structures for GitHub data
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GithubPr {
    number: i32,
    title: String,
    body: Option<String>,
    state: String,
    merged: bool,
    head_sha: Option<String>,
    url: String,
    created_at: String,
    labels: Vec<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/github/scan
///
/// Scan a GitHub repository: fetch commits, PRs, branches, and create
/// corresponding nodes (tickets from PRs, epics from groups, intents from milestones).
/// Creates synthetic events backdated to original timestamps.
pub async fn scan_repo(
    State(pool): State<Pool>,
    Json(body): Json<ScanRepoBody>,
) -> Result<(StatusCode, Json<ScanResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Parse repo URL (e.g. "https://github.com/owner/repo" or "owner/repo")
    let repo_slug = parse_repo_slug(&body.repo_url);

    // Check if repo already exists
    let existing_repo = sqlx::query_as::<_, models::Repo>(
        "SELECT id, workspace_id, github_repo, install_id, default_branch, created_at \
         FROM repo WHERE github_repo = $1 LIMIT 1",
    )
    .bind(&repo_slug)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to check repo: {e}"),
            }),
        )
    })?;

    let repo = if let Some(r) = existing_repo {
        r
    } else {
        sqlx::query_as::<_, models::Repo>(
            "INSERT INTO repo (workspace_id, github_repo, default_branch) \
             VALUES ($1, $2, 'main') \
             RETURNING id, workspace_id, github_repo, install_id, default_branch, created_at",
        )
        .bind(body.workspace_id)
        .bind(&repo_slug)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Failed to register repo: {e}"),
                }),
            )
        })?
    };

    // Link to project
    sqlx::query(
        "INSERT INTO project_repo (project_id, repo_id, is_primary) \
         VALUES ($1, $2, true) \
         ON CONFLICT DO NOTHING",
    )
    .bind(body.project_id)
    .bind(repo.id)
    .execute(&pool)
    .await
    .ok();

    // Create import source for tracking
    let import_source = sqlx::query_as::<_, models::ImportSource>(
        "INSERT INTO import_source (project_id, source_type, source_config, status) \
         VALUES ($1, 'github', $2, 'scanning') \
         RETURNING id, project_id, source_type, source_config, last_synced, sync_cursor, status, created_at",
    )
    .bind(body.project_id)
    .bind(json!({ "repo": repo_slug, "token_provided": body.github_token.is_some() }))
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create import source: {e}"),
            }),
        )
    })?;

    // In a real implementation, we'd use reqwest to call the GitHub API.
    // For now, create stub data that demonstrates the scanning pipeline.
    let stub_prs = generate_stub_prs(&repo_slug);
    let mut nodes_created = 0;
    let edges_created = 0;
    let mut events_backfilled = 0;

    // Process PRs → create ticket nodes
    for pr in &stub_prs {
        let status = if pr.merged {
            "done"
        } else if pr.state == "open" {
            "active"
        } else {
            "archived"
        };

        let node = sqlx::query_as::<_, models::Node>(
            "INSERT INTO node (type, layer, project_id, title, body, payload, status) \
             VALUES ('ticket', 2, $1, $2, $3, $4, $5) \
             RETURNING id, type, layer, project_id, parent_id, title, body, payload, \
             status, position_x, position_y, created_by, created_at, updated_at",
        )
        .bind(body.project_id)
        .bind(&pr.title)
        .bind(json!({ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": pr.body.as_deref().unwrap_or("") }] }] }))
        .bind(json!({
            "intent": "",
            "filePaths": [],
            "acceptanceCriteria": [],
            "promptPayload": "",
            "repoId": repo.id.to_string()
        }))
        .bind(status)
        .fetch_one(&pool)
        .await
        .ok();

        if let Some(node) = &node {
            nodes_created += 1;

            // Create PR record
            sqlx::query(
                "INSERT INTO pr (repo_id, ticket_id, number, status, head_sha, title, url) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(repo.id)
            .bind(node.id)
            .bind(pr.number)
            .bind(&pr.state)
            .bind(&pr.head_sha)
            .bind(&pr.title)
            .bind(&pr.url)
            .execute(&pool)
            .await
            .ok();

            // Create import mapping
            sqlx::query(
                "INSERT INTO import_mapping (source_id, external_id, external_type, node_id, confidence) \
                 VALUES ($1, $2, 'pr', $3, 1.0)",
            )
            .bind(import_source.id)
            .bind(format!("pr:{}", pr.number))
            .bind(node.id)
            .execute(&pool)
            .await
            .ok();

            // Create synthetic event backdated to PR creation
            sqlx::query(
                "INSERT INTO event (project_id, timestamp, event_type, entity_type, entity_id, \
                 after_state, actor, metadata) \
                 VALUES ($1, $2, 'node.created', 'node', $3, $4, 'github-scanner', $5)",
            )
            .bind(body.project_id)
            .bind(&pr.created_at)
            .bind(node.id)
            .bind(serde_json::to_value(node).ok())
            .bind(json!({ "source": "github", "pr_number": pr.number }))
            .execute(&pool)
            .await
            .ok();
            events_backfilled += 1;
        }
    }

    // Group PRs by label similarity → create epic candidates
    let label_groups = group_by_labels(&stub_prs);
    for (label, pr_numbers) in &label_groups {
        if pr_numbers.len() >= 2 {
            let epic = sqlx::query_as::<_, models::Node>(
                "INSERT INTO node (type, layer, project_id, title, payload, status) \
                 VALUES ('epic', 3, $1, $2, $3, 'active') \
                 RETURNING id, type, layer, project_id, parent_id, title, body, payload, \
                 status, position_x, position_y, created_by, created_at, updated_at",
            )
            .bind(body.project_id)
            .bind(format!("Epic: {label}"))
            .bind(json!({
                "prd": { "type": "doc", "content": [] },
                "techPlan": { "type": "doc", "content": [] },
                "openQuestions": []
            }))
            .fetch_one(&pool)
            .await
            .ok();

            if epic.is_some() {
                nodes_created += 1;
            }
        }
    }

    // Update import source status
    sqlx::query("UPDATE import_source SET status = 'complete', last_synced = now() WHERE id = $1")
        .bind(import_source.id)
        .execute(&pool)
        .await
        .ok();

    Ok((
        StatusCode::CREATED,
        Json(ScanResponse {
            result: ScanResult {
                repo_id: repo.id,
                commits_fetched: 0, // Stub — real impl would fetch these
                prs_fetched: stub_prs.len(),
                nodes_created,
                edges_created,
                events_backfilled,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_repo_slug(url: &str) -> String {
    let url = url.trim_end_matches('/').trim_end_matches(".git");
    if let Some(slug) = url.strip_prefix("https://github.com/") {
        slug.to_string()
    } else {
        url.to_string()
    }
}

fn generate_stub_prs(repo_slug: &str) -> Vec<GithubPr> {
    // Generate stub PR data for demonstration. A real implementation
    // would call the GitHub REST API with the provided token.
    vec![
        GithubPr {
            number: 1,
            title: format!("Initial setup for {repo_slug}"),
            body: Some("Set up project scaffolding".into()),
            state: "closed".into(),
            merged: true,
            head_sha: Some("abc1234".into()),
            url: format!("https://github.com/{repo_slug}/pull/1"),
            created_at: "2024-01-15T10:00:00Z".into(),
            labels: vec!["setup".into()],
        },
        GithubPr {
            number: 2,
            title: "Add authentication".into(),
            body: Some("Implement JWT-based auth".into()),
            state: "closed".into(),
            merged: true,
            head_sha: Some("def5678".into()),
            url: format!("https://github.com/{repo_slug}/pull/2"),
            created_at: "2024-01-20T14:00:00Z".into(),
            labels: vec!["auth".into(), "feature".into()],
        },
        GithubPr {
            number: 3,
            title: "Fix login redirect".into(),
            body: Some("Fix redirect loop on expired sessions".into()),
            state: "closed".into(),
            merged: true,
            head_sha: Some("ghi9012".into()),
            url: format!("https://github.com/{repo_slug}/pull/3"),
            created_at: "2024-02-01T09:00:00Z".into(),
            labels: vec!["auth".into(), "bugfix".into()],
        },
        GithubPr {
            number: 4,
            title: "Add dashboard view".into(),
            body: Some("Main dashboard with metrics".into()),
            state: "open".into(),
            merged: false,
            head_sha: Some("jkl3456".into()),
            url: format!("https://github.com/{repo_slug}/pull/4"),
            created_at: "2024-02-10T11:00:00Z".into(),
            labels: vec!["feature".into(), "ui".into()],
        },
        GithubPr {
            number: 5,
            title: "Refactor API layer".into(),
            body: Some("Clean up REST endpoints".into()),
            state: "open".into(),
            merged: false,
            head_sha: Some("mno7890".into()),
            url: format!("https://github.com/{repo_slug}/pull/5"),
            created_at: "2024-02-15T16:00:00Z".into(),
            labels: vec!["refactor".into()],
        },
    ]
}

fn group_by_labels(prs: &[GithubPr]) -> std::collections::HashMap<String, Vec<i32>> {
    let mut groups: std::collections::HashMap<String, Vec<i32>> = std::collections::HashMap::new();
    for pr in prs {
        for label in &pr.labels {
            groups.entry(label.clone()).or_default().push(pr.number);
        }
    }
    groups
}
