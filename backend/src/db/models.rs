use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub owner_id: Option<Uuid>,
    pub settings: Option<serde_json::Value>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Node {
    pub id: Uuid,
    pub r#type: String,
    pub layer: i32,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub body: Option<serde_json::Value>,
    pub payload: Option<serde_json::Value>,
    pub status: Option<String>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub created_by: Option<Uuid>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl Node {
    pub const DEFAULT_STATUS: &'static str = "active";
}

// ---------------------------------------------------------------------------
// NodeEdge
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct NodeEdge {
    pub id: Uuid,
    pub source_id: Uuid,
    pub target_id: Uuid,
    pub relation_type: String,
    pub weight: Option<f64>,
    pub source: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// NodeVersion
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct NodeVersion {
    pub id: Uuid,
    pub node_id: Uuid,
    pub version: i32,
    pub body: Option<serde_json::Value>,
    pub payload: Option<serde_json::Value>,
    pub diff_summary: Option<String>,
    pub author: Option<Uuid>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Event {
    pub id: Uuid,
    pub project_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub before_state: Option<serde_json::Value>,
    pub after_state: Option<serde_json::Value>,
    pub actor: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Snapshot {
    pub id: Uuid,
    pub project_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub nodes: serde_json::Value,
    pub edges: serde_json::Value,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Repo {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub github_repo: String,
    pub install_id: Option<String>,
    pub default_branch: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// ProjectRepo (composite PK)
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProjectRepo {
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub is_primary: Option<bool>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Pr (pull request)
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Pr {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub ticket_id: Option<Uuid>,
    pub number: i32,
    pub status: Option<String>,
    pub head_sha: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// VerificationReport
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VerificationReport {
    pub id: Uuid,
    pub target_id: Uuid,
    pub severity: String,
    pub findings: serde_json::Value,
    pub pr_id: Option<Uuid>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// AgentRun
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentRun {
    pub id: Uuid,
    pub agent: String,
    pub layer: Option<i32>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub model: Option<String>,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// ProviderConfig
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProviderConfig {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub provider: String,
    pub api_key_encrypted: Option<String>,
    pub model_overrides: Option<serde_json::Value>,
    pub is_enabled: Option<bool>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// ExportLog
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ExportLog {
    pub id: Uuid,
    pub project_id: Uuid,
    pub export_type: String,
    pub target_id: Option<Uuid>,
    pub payload: Option<serde_json::Value>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// ImportSource
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ImportSource {
    pub id: Uuid,
    pub project_id: Uuid,
    pub source_type: String,
    pub source_config: serde_json::Value,
    pub last_synced: Option<DateTime<Utc>>,
    pub sync_cursor: Option<serde_json::Value>,
    pub status: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// ImportMapping
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ImportMapping {
    pub id: Uuid,
    pub source_id: Uuid,
    pub external_id: String,
    pub external_type: String,
    pub node_id: Uuid,
    pub confidence: Option<f64>,
    pub created_at: Option<DateTime<Utc>>,
}
