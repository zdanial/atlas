use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::ai::registry::ProviderRegistry;
use crate::cartographer::{self, analyze::Finding};
use crate::db::{models, pool::Pool};
use crate::ws::WsBroadcast;

use super::nodes::ErrorResponse;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListReposQuery {
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct ConnectRepoBody {
    pub project_id: Uuid,
    pub full_name: String, // "owner/repo"
    pub github_pat: Option<String>,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ConnectLocalBody {
    pub project_id: Uuid,
    pub path: String,            // absolute filesystem path
    pub label: Option<String>,   // optional human-friendly name
    pub is_primary: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RepoResponse {
    pub repo: RepoView,
}

#[derive(Debug, Serialize)]
pub struct ReposResponse {
    pub repos: Vec<RepoView>,
}

/// Public view of a repo — never exposes the PAT.
#[derive(Debug, Serialize)]
pub struct RepoView {
    pub id: String,
    pub full_name: String,
    pub default_branch: Option<String>,
    pub project_id: Option<String>,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct AnalyzeTriggerResponse {
    pub agent_run_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeQuery {
    /// Optional override for the cartographer model alias
    /// (haiku | sonnet | opus). Defaults to sonnet.
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CommitBody {
    pub project_id: Uuid,
    pub source_id: Option<Uuid>,
    pub findings: Vec<CommitFinding>,
}

#[derive(Debug, Deserialize)]
pub struct CommitFinding {
    pub title: String,
    pub node_type: String,
    pub body: String,
    pub layer: i32,
    pub confidence: f64,
}

#[derive(Debug, Serialize)]
pub struct CommitResponse {
    pub created: usize,
}

#[derive(Debug, Serialize)]
pub struct AgentRunStatusResponse {
    pub status: String, // "running" | "done" | "error"
    pub findings: Vec<Finding>,
    pub findings_count: usize,
}

// ---------------------------------------------------------------------------
// GET /api/repos?project_id=
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct RepoJoinRow {
    id: Uuid,
    github_repo: String,
    default_branch: Option<String>,
    project_id: Option<Uuid>,
    is_primary: Option<bool>,
}

pub async fn list_repos(
    State(pool): State<Pool>,
    Query(query): Query<ListReposQuery>,
) -> Result<Json<ReposResponse>, (StatusCode, Json<ErrorResponse>)> {
    let rows: Vec<RepoJoinRow> = if let Some(pid) = query.project_id {
        sqlx::query_as::<_, RepoJoinRow>(
            "SELECT r.id, r.github_repo, r.default_branch, \
             pr.project_id, pr.is_primary \
             FROM repo r \
             JOIN project_repo pr ON pr.repo_id = r.id \
             WHERE pr.project_id = $1 \
             ORDER BY r.created_at DESC",
        )
        .bind(pid)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query_as::<_, RepoJoinRow>(
            "SELECT r.id, r.github_repo, r.default_branch, \
             pr.project_id, pr.is_primary \
             FROM repo r \
             LEFT JOIN project_repo pr ON pr.repo_id = r.id \
             ORDER BY r.created_at DESC",
        )
        .fetch_all(&pool)
        .await
    }
    .map_err(internal)?;

    let repos = rows
        .into_iter()
        .map(|r| RepoView {
            id: r.id.to_string(),
            full_name: r.github_repo,
            default_branch: r.default_branch,
            project_id: r.project_id.map(|id| id.to_string()),
            is_primary: r.is_primary,
        })
        .collect();

    Ok(Json(ReposResponse { repos }))
}

// ---------------------------------------------------------------------------
// POST /api/repos
// ---------------------------------------------------------------------------

pub async fn connect_repo(
    State(pool): State<Pool>,
    Json(body): Json<ConnectRepoBody>,
) -> Result<(StatusCode, Json<RepoResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Validate inputs
    if body.full_name.is_empty() || !body.full_name.contains('/') {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "full_name must be in 'owner/repo' format".into(),
            }),
        ));
    }
    // Only validate PAT against GitHub if one was provided
    let pat = body.github_pat.as_deref().unwrap_or("");
    if !pat.is_empty() {
        let client = reqwest::Client::new();
        cartographer::github::validate_pat(&client, &body.full_name, pat)
            .await
            .map_err(|e| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(ErrorResponse {
                        error: format!("GitHub validation failed: {e}"),
                    }),
                )
            })?;
    }

    // Look up workspace_id from the project (auto-create project if missing)
    let workspace_id = ensure_project_workspace(&pool, body.project_id).await?;

    // Insert repo (install_id stores the PAT for Mode B; upgrade to encrypted in Mode C)
    let repo = sqlx::query_as::<_, models::Repo>(
        "INSERT INTO repo (id, workspace_id, github_repo, install_id, default_branch) \
         VALUES (gen_random_uuid(), $1, $2, $3, 'main') \
         ON CONFLICT DO NOTHING \
         RETURNING id, workspace_id, github_repo, install_id, default_branch, created_at",
    )
    .bind(workspace_id)
    .bind(&body.full_name)
    .bind(body.github_pat.as_deref().filter(|s| !s.is_empty()))
    .fetch_optional(&pool)
    .await
    .map_err(|e| bad_request(&e.to_string()))?;

    // Handle conflict (repo already exists for this workspace)
    let repo = if let Some(r) = repo {
        r
    } else {
        sqlx::query_as::<_, models::Repo>(
            "SELECT id, workspace_id, github_repo, install_id, default_branch, created_at \
             FROM repo WHERE workspace_id = $1 AND github_repo = $2",
        )
        .bind(workspace_id)
        .bind(&body.full_name)
        .fetch_one(&pool)
        .await
        .map_err(internal)?
    };

    // Link repo to project via project_repo
    sqlx::query(
        "INSERT INTO project_repo (project_id, repo_id, is_primary) \
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(body.project_id)
    .bind(repo.id)
    .bind(body.is_primary.unwrap_or(true))
    .execute(&pool)
    .await
    .map_err(internal)?;

    Ok((
        StatusCode::CREATED,
        Json(RepoResponse {
            repo: RepoView {
                id: repo.id.to_string(),
                full_name: repo.github_repo,
                default_branch: repo.default_branch,
                project_id: Some(body.project_id.to_string()),
                is_primary: body.is_primary,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// POST /api/repos/local
// ---------------------------------------------------------------------------

pub async fn connect_local_repo(
    State(pool): State<Pool>,
    Json(body): Json<ConnectLocalBody>,
) -> Result<(StatusCode, Json<RepoResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Validate path exists and is a directory
    cartographer::local::validate_path(&body.path).map_err(|e| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: format!("Invalid path: {e}"),
            }),
        )
    })?;

    // Resolve to absolute path so the cartographer can find it later regardless of cwd
    let abs_path = std::fs::canonicalize(&body.path)
        .map_err(|e| bad_request(&format!("Cannot canonicalize path: {e}")))?
        .to_string_lossy()
        .to_string();

    // Sentinel format: "local:<absolute_path>"
    let full_name = format!("local:{abs_path}");
    let label = body.label.unwrap_or_else(|| {
        std::path::Path::new(&abs_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&abs_path)
            .to_string()
    });

    // Look up workspace_id from project (auto-create project if missing)
    let workspace_id = ensure_project_workspace(&pool, body.project_id).await?;

    // Insert repo (install_id used as label for local sources)
    let repo = sqlx::query_as::<_, models::Repo>(
        "INSERT INTO repo (id, workspace_id, github_repo, install_id, default_branch) \
         VALUES (gen_random_uuid(), $1, $2, $3, NULL) \
         ON CONFLICT DO NOTHING \
         RETURNING id, workspace_id, github_repo, install_id, default_branch, created_at",
    )
    .bind(workspace_id)
    .bind(&full_name)
    .bind(&label)
    .fetch_optional(&pool)
    .await
    .map_err(|e| bad_request(&e.to_string()))?;

    let repo = if let Some(r) = repo {
        r
    } else {
        sqlx::query_as::<_, models::Repo>(
            "SELECT id, workspace_id, github_repo, install_id, default_branch, created_at \
             FROM repo WHERE workspace_id = $1 AND github_repo = $2",
        )
        .bind(workspace_id)
        .bind(&full_name)
        .fetch_one(&pool)
        .await
        .map_err(internal)?
    };

    // Link to project
    sqlx::query(
        "INSERT INTO project_repo (project_id, repo_id, is_primary) \
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(body.project_id)
    .bind(repo.id)
    .bind(body.is_primary.unwrap_or(true))
    .execute(&pool)
    .await
    .map_err(internal)?;

    Ok((
        StatusCode::CREATED,
        Json(RepoResponse {
            repo: RepoView {
                id: repo.id.to_string(),
                full_name: repo.github_repo,
                default_branch: repo.default_branch,
                project_id: Some(body.project_id.to_string()),
                is_primary: body.is_primary,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// DELETE /api/repos/:id
// ---------------------------------------------------------------------------

pub async fn delete_repo(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let result = sqlx::query("DELETE FROM repo WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(internal)?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Repo {id} not found"),
            }),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// POST /api/repos/:id/analyze
// ---------------------------------------------------------------------------

pub async fn trigger_analysis(
    State(pool): State<Pool>,
    Extension(registry): Extension<Arc<ProviderRegistry>>,
    Extension(broadcast): Extension<Arc<WsBroadcast>>,
    Path(id): Path<Uuid>,
    Query(q): Query<AnalyzeQuery>,
) -> Result<Json<AnalyzeTriggerResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = sqlx::query_as::<_, models::Repo>(
        "SELECT id, workspace_id, github_repo, install_id, default_branch, created_at \
         FROM repo WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| not_found(&format!("Repo {id}")))?;

    let pat = repo.install_id.clone().unwrap_or_default();

    let model = q
        .model
        .filter(|m| matches!(m.as_str(), "haiku" | "sonnet" | "opus"))
        .unwrap_or_else(|| cartographer::DEFAULT_MODEL.to_string());

    let pool_clone = pool.clone();
    let registry_clone = Arc::clone(&registry);
    let broadcast_clone = Arc::clone(&broadcast);
    let full_name = repo.github_repo.clone();
    let repo_id = repo.id;

    // Run analysis in background — return agent_run_id immediately
    // We need to pre-generate the ID so we can return it
    let agent_run_id = Uuid::new_v4();

    // Seed the agent_run row before spawning
    let _ = sqlx::query(
        "INSERT INTO agent_run (id, agent, layer, input, output, created_at) \
         VALUES ($1, 'cartographer', 5, $2, NULL, now())",
    )
    .bind(agent_run_id)
    .bind(serde_json::json!({ "repo_id": repo_id, "full_name": &full_name, "status": "running" }))
    .execute(&pool)
    .await;

    tokio::spawn(async move {
        cartographer::run_analysis_with_run_id(
            &pool_clone,
            &registry_clone,
            &broadcast_clone,
            repo_id,
            &full_name,
            &pat,
            agent_run_id,
            &model,
        )
        .await;
    });

    Ok(Json(AnalyzeTriggerResponse {
        agent_run_id: agent_run_id.to_string(),
    }))
}

// ---------------------------------------------------------------------------
// GET /api/agent-runs/:id
// ---------------------------------------------------------------------------

pub async fn get_agent_run(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentRunStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let row = sqlx::query_as::<_, (Option<serde_json::Value>,)>(
        "SELECT output FROM agent_run WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| not_found(&format!("AgentRun {id}")))?;

    let output = row.0.unwrap_or(serde_json::json!({ "status": "running" }));
    let status = output["status"].as_str().unwrap_or("running").to_string();

    let findings: Vec<Finding> = if status == "done" {
        serde_json::from_value(output["findings"].clone()).unwrap_or_default()
    } else {
        vec![]
    };

    let count = findings.len();
    Ok(Json(AgentRunStatusResponse {
        status,
        findings,
        findings_count: count,
    }))
}

// ---------------------------------------------------------------------------
// POST /api/repos/:id/analyze/:run_id/commit
// ---------------------------------------------------------------------------

pub async fn commit_findings(
    State(pool): State<Pool>,
    Path((repo_id, run_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CommitBody>,
) -> Result<Json<CommitResponse>, (StatusCode, Json<ErrorResponse>)> {
    if body.findings.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "findings must not be empty".into(),
            }),
        ));
    }

    // Ensure an import_source exists for this repo+project
    let source_id = if let Some(sid) = body.source_id {
        sid
    } else {
        // Determine source type from repo's full_name prefix
        let full_name: Option<String> =
            sqlx::query_as::<_, (String,)>("SELECT github_repo FROM repo WHERE id = $1")
                .bind(repo_id)
                .fetch_optional(&pool)
                .await
                .map_err(internal)?
                .map(|r| r.0);
        let source_type = match full_name.as_deref() {
            Some(s) if s.starts_with("local:") => "local",
            _ => "github",
        };

        sqlx::query_as::<_, (Uuid,)>(
            "INSERT INTO import_source (id, project_id, source_type, source_config, status) \
             VALUES (gen_random_uuid(), $1, $2, $3, 'active') \
             ON CONFLICT DO NOTHING \
             RETURNING id",
        )
        .bind(body.project_id)
        .bind(source_type)
        .bind(serde_json::json!({ "repo_id": repo_id, "agent_run_id": run_id }))
        .fetch_optional(&pool)
        .await
        .map_err(internal)?
        .map(|r| r.0)
        .unwrap_or_else(|| {
            // Conflict — fetch existing
            Uuid::new_v4() // fallback; import_mapping creation is best-effort
        })
    };

    let _total = body.findings.len();
    let tickets: Vec<_> = body
        .findings
        .iter()
        .filter(|f| f.node_type == "ticket")
        .collect();
    let other: Vec<_> = body
        .findings
        .iter()
        .filter(|f| f.node_type != "ticket")
        .collect();
    let ticket_cols = (tickets.len() as f64).sqrt().ceil() as i32;
    let other_cols = (other.len() as f64).sqrt().ceil() as i32;

    let mut created = 0usize;
    let mut ticket_idx = 0i32;
    let mut other_idx = 0i32;

    for finding in &body.findings {
        // Grid placement: tickets cluster top, others cluster below
        let (pos_x, pos_y) = if finding.node_type == "ticket" {
            let col = ticket_idx % ticket_cols.max(1);
            let row = ticket_idx / ticket_cols.max(1);
            ticket_idx += 1;
            (col * 280 - ticket_cols * 140, row * 180)
        } else {
            let col = other_idx % other_cols.max(1);
            let row = other_idx / other_cols.max(1);
            other_idx += 1;
            (col * 280 - other_cols * 140, row * 180 + 600)
        };

        let body_json = serde_json::json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": finding.body }] }]
        });

        let result = sqlx::query_as::<_, (Uuid,)>(
            "INSERT INTO node (type, layer, project_id, title, body, payload, status, position_x, position_y) \
             VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8) \
             RETURNING id",
        )
        .bind(&finding.node_type)
        .bind(finding.layer)
        .bind(body.project_id)
        .bind(&finding.title)
        .bind(&body_json)
        .bind(serde_json::json!({ "confidence": finding.confidence, "source": "cartographer" }))
        .bind(pos_x as f64)
        .bind(pos_y as f64)
        .fetch_one(&pool)
        .await;

        if let Ok((node_id,)) = result {
            created += 1;

            // Create import_mapping to track this finding for dedup
            let external_id = format!("{:x}", md5_hash(&finding.title));
            let _ = sqlx::query(
                "INSERT INTO import_mapping (source_id, external_id, external_type, node_id, confidence) \
                 VALUES ($1, $2, 'cartographer_finding', $3, $4) ON CONFLICT DO NOTHING",
            )
            .bind(source_id)
            .bind(&external_id)
            .bind(node_id)
            .bind(finding.confidence)
            .execute(&pool)
            .await;
        }
    }

    // Mark import_source last_synced
    let _ =
        sqlx::query("UPDATE import_source SET last_synced = now(), sync_cursor = $2 WHERE id = $1")
            .bind(source_id)
            .bind(serde_json::json!({ "agent_run_id": run_id }))
            .execute(&pool)
            .await;

    Ok(Json(CommitResponse { created }))
}

// ---------------------------------------------------------------------------
// GET /api/repos/:id/existing-titles  (for dedup in re-analysis)
// ---------------------------------------------------------------------------

pub async fn existing_titles(
    State(pool): State<Pool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // Find import_source for this repo, then get all mapped node titles
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT n.title FROM node n \
         JOIN import_mapping im ON im.node_id = n.id \
         JOIN import_source isrc ON isrc.id = im.source_id \
         WHERE im.external_type = 'cartographer_finding' \
         AND isrc.source_config->>'repo_id' = $1 \
         ORDER BY n.created_at DESC \
         LIMIT 200",
    )
    .bind(id.to_string())
    .fetch_all(&pool)
    .await
    .map_err(internal)?;

    let titles: Vec<String> = rows.into_iter().map(|r| r.0).collect();
    Ok(Json(serde_json::json!({ "titles": titles })))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn internal(e: impl std::fmt::Display) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: e.to_string(),
        }),
    )
}

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: msg.to_string(),
        }),
    )
}

fn not_found(msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: format!("{msg} not found"),
        }),
    )
}

/// Minimal MD5-like hash for dedup key generation (not for security).
fn md5_hash(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

/// Look up workspace_id for a project. If the project does not exist
/// (e.g. frontend uses IndexedDB and project lives only in browser),
/// auto-create it under the default workspace so backend features
/// (repos, cartographer, etc.) can attach to it.
async fn ensure_project_workspace(
    pool: &Pool,
    project_id: Uuid,
) -> Result<Uuid, (StatusCode, Json<ErrorResponse>)> {
    if let Some((ws,)) =
        sqlx::query_as::<_, (Uuid,)>("SELECT workspace_id FROM project WHERE id = $1")
            .bind(project_id)
            .fetch_optional(pool)
            .await
            .map_err(internal)?
    {
        return Ok(ws);
    }

    // Project not found — find or create a default workspace
    let workspace_id: Uuid = if let Some((id,)) =
        sqlx::query_as::<_, (Uuid,)>("SELECT id FROM workspace ORDER BY created_at ASC LIMIT 1")
            .fetch_optional(pool)
            .await
            .map_err(internal)?
    {
        id
    } else {
        let new_ws = Uuid::new_v4();
        sqlx::query("INSERT INTO workspace (id, name, slug) VALUES ($1, $2, $3)")
            .bind(new_ws)
            .bind("Default Workspace")
            .bind("default")
            .execute(pool)
            .await
            .map_err(internal)?;
        new_ws
    };

    // Insert project with the id supplied by the client (browser UUID)
    let slug = format!("p-{}", project_id.simple());
    sqlx::query(
        "INSERT INTO project (id, workspace_id, name, slug) VALUES ($1, $2, $3, $4) \
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(project_id)
    .bind(workspace_id)
    .bind("Imported Project")
    .bind(&slug)
    .execute(pool)
    .await
    .map_err(internal)?;

    Ok(workspace_id)
}
