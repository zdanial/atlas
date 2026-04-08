//! Cartographer agent — scans a GitHub repo and compares plans to code.

pub mod analyze;
pub mod github;

use std::sync::Arc;
use uuid::Uuid;

use crate::ai::{providers::Capability, registry::ProviderRegistry};
use crate::db::pool::Pool;
use crate::ws::{WsBroadcast, WsEvent};

use analyze::{analysis_system_prompt, build_prompt, parse_findings, Finding};
use github::{fetch_plans, fetch_tree};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Run analysis when the agent_run row has already been created by the caller.
/// Used by the route handler which pre-generates the ID to return immediately.
pub async fn run_analysis_with_run_id(
    pool: &Pool,
    registry: &Arc<ProviderRegistry>,
    broadcast: &Arc<WsBroadcast>,
    repo_id: Uuid,
    full_name: &str,
    pat: &str,
    agent_run_id: Uuid,
) {
    run_analysis_inner(
        pool,
        registry,
        broadcast,
        repo_id,
        full_name,
        pat,
        agent_run_id,
    )
    .await;
}

/// Run the Cartographer analysis pipeline for a connected repo.
///
/// Steps:
/// 1. Create an agent_run row with status "running"
/// 2. Fetch plans/ + file tree from GitHub
/// 3. Build prompt + call LLM
/// 4. Parse findings
/// 5. Update agent_run with results
/// 6. Broadcast progress events via WebSocket throughout
///
/// Returns the agent_run_id (callers use this to retrieve results later).
pub async fn run_analysis(
    pool: &Pool,
    registry: &Arc<ProviderRegistry>,
    broadcast: &Arc<WsBroadcast>,
    repo_id: Uuid,
    full_name: &str,
    pat: &str,
) -> Uuid {
    let agent_run_id = Uuid::new_v4();

    // Create agent_run row immediately so callers can poll it
    let _ = sqlx::query(
        "INSERT INTO agent_run (id, agent, layer, input, output, created_at) \
         VALUES ($1, 'cartographer', 5, $2, NULL, now())",
    )
    .bind(agent_run_id)
    .bind(serde_json::json!({ "repo_id": repo_id, "full_name": full_name, "status": "running" }))
    .execute(pool)
    .await;

    run_analysis_inner(
        pool,
        registry,
        broadcast,
        repo_id,
        full_name,
        pat,
        agent_run_id,
    )
    .await;
    agent_run_id
}

async fn run_analysis_inner(
    pool: &Pool,
    registry: &Arc<ProviderRegistry>,
    broadcast: &Arc<WsBroadcast>,
    repo_id: Uuid,
    full_name: &str,
    pat: &str,
    agent_run_id: Uuid,
) {
    let repo_id_str = repo_id.to_string();
    let run_id_str = agent_run_id.to_string();

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str.clone(),
        agent_run_id: run_id_str.clone(),
        status: "fetching_plans".into(),
        message: "Fetching plans/ directory from GitHub…".into(),
        findings_count: None,
    });

    let client = reqwest::Client::new();

    // Fetch plans
    let plans = match fetch_plans(&client, full_name, pat).await {
        Ok(p) => p,
        Err(e) => {
            finish_with_error(
                pool,
                broadcast,
                agent_run_id,
                &repo_id_str,
                &run_id_str,
                &e.to_string(),
            )
            .await;
            return;
        }
    };

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str.clone(),
        agent_run_id: run_id_str.clone(),
        status: "fetching_tree".into(),
        message: format!(
            "Fetched {} plan files. Fetching code structure…",
            plans.len()
        ),
        findings_count: None,
    });

    // Fetch file tree
    let tree = match fetch_tree(&client, full_name, pat).await {
        Ok(t) => t,
        Err(e) => {
            finish_with_error(
                pool,
                broadcast,
                agent_run_id,
                &repo_id_str,
                &run_id_str,
                &e.to_string(),
            )
            .await;
            return;
        }
    };

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str.clone(),
        agent_run_id: run_id_str.clone(),
        status: "analyzing".into(),
        message: format!("Got {} files. Analyzing plans vs code with AI…", tree.len()),
        findings_count: None,
    });

    // Call LLM — combine system prompt + user prompt into a single input
    let user_prompt = build_prompt(&plans, &tree);
    let full_input = format!(
        "{}\n\n---\n\n{}",
        analysis_system_prompt(),
        user_prompt
    );
    let llm_result = registry
        .call_model(Capability::Synthesis, &full_input)
        .await;

    let findings = match llm_result {
        Ok(text) => {
            let findings = parse_findings(&text);
            tracing::info!(
                repo_id = %repo_id,
                findings = findings.len(),
                "Cartographer analysis complete"
            );
            findings
        }
        Err(e) => {
            finish_with_error(
                pool,
                broadcast,
                agent_run_id,
                &repo_id_str,
                &run_id_str,
                &e.to_string(),
            )
            .await;
            return;
        }
    };

    let count = findings.len();

    // Persist findings to agent_run.output
    let output = serde_json::json!({
        "status": "done",
        "findings": findings,
        "findings_count": count,
    });

    let _ = sqlx::query("UPDATE agent_run SET output = $2 WHERE id = $1")
        .bind(agent_run_id)
        .bind(&output)
        .execute(pool)
        .await;

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str,
        agent_run_id: run_id_str,
        status: "done".into(),
        message: format!("Analysis complete. Found {count} items."),
        findings_count: Some(count),
    });
}

// ---------------------------------------------------------------------------
// Retrieve findings from a completed agent_run
// ---------------------------------------------------------------------------

pub async fn get_findings(pool: &Pool, agent_run_id: Uuid) -> Option<(String, Vec<Finding>)> {
    let row = sqlx::query_as::<_, (Option<serde_json::Value>,)>(
        "SELECT output FROM agent_run WHERE id = $1",
    )
    .bind(agent_run_id)
    .fetch_optional(pool)
    .await
    .ok()??;

    let output = row.0?;
    let status = output["status"].as_str().unwrap_or("running").to_string();

    if status == "done" {
        let findings: Vec<Finding> =
            serde_json::from_value(output["findings"].clone()).unwrap_or_default();
        Some((status, findings))
    } else {
        Some((status, vec![]))
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn finish_with_error(
    pool: &Pool,
    broadcast: &Arc<WsBroadcast>,
    agent_run_id: Uuid,
    repo_id: &str,
    run_id: &str,
    error: &str,
) {
    tracing::error!(agent_run_id = %agent_run_id, error, "Cartographer analysis failed");

    let output = serde_json::json!({ "status": "error", "error": error });
    let _ = sqlx::query("UPDATE agent_run SET output = $2 WHERE id = $1")
        .bind(agent_run_id)
        .bind(&output)
        .execute(pool)
        .await;

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id.to_string(),
        agent_run_id: run_id.to_string(),
        status: "error".into(),
        message: format!("Analysis failed: {error}"),
        findings_count: None,
    });
}
