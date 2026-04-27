//! Cartographer agent — scans a GitHub repo and compares plans to code.

pub mod analyze;
pub mod cc_client;
pub mod github;
pub mod local;

use std::sync::Arc;
use uuid::Uuid;

use crate::ai::{providers::Capability, registry::ProviderRegistry};
use crate::db::pool::Pool;
use crate::ws::{WsBroadcast, WsEvent};

use analyze::{
    analysis_system_prompt, build_prompt, cartographer_streaming_system_prompt, parse_finding_line,
    parse_findings, Finding,
};
use cc_client::{stream as cc_stream, CcEvent, CcStreamRequest};
use github::{fetch_plans, fetch_tree};

/// Default model for streaming cartographer. Override via `?model=`.
pub const DEFAULT_MODEL: &str = "sonnet";
const CARTOGRAPHER_MAX_TURNS: u32 = 60;
const CARTOGRAPHER_TOOLS: [&str; 4] = ["Read", "Grep", "Glob", "LS"];

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
    model: &str,
) {
    run_analysis_inner(
        pool,
        registry,
        broadcast,
        repo_id,
        full_name,
        pat,
        agent_run_id,
        model,
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
    model: &str,
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
        model,
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
    model: &str,
) {
    let is_local = full_name.starts_with("local:");

    // Local repos use the streaming claude-code container so the agent can
    // Read/Grep/Glob real source files on disk and stream findings back live.
    if is_local {
        let path = full_name.trim_start_matches("local:").to_string();
        run_analysis_streaming(pool, broadcast, repo_id, &path, agent_run_id, model).await;
        return;
    }

    // Existing one-shot GitHub path (no live filesystem access)
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

    let _ = model; // GitHub path uses ProviderRegistry's default model

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str.clone(),
        agent_run_id: run_id_str.clone(),
        status: "analyzing".into(),
        message: format!("Got {} files. Analyzing plans vs code with AI…", tree.len()),
        findings_count: None,
    });

    // Call LLM — combine system prompt + user prompt into a single input
    let user_prompt = build_prompt(&plans, &tree);
    let full_input = format!("{}\n\n---\n\n{}", analysis_system_prompt(), user_prompt);
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
// Streaming run via the claude-code container (local repos)
// ---------------------------------------------------------------------------

async fn run_analysis_streaming(
    pool: &Pool,
    broadcast: &Arc<WsBroadcast>,
    repo_id: Uuid,
    repo_path: &str,
    agent_run_id: Uuid,
    model: &str,
) {
    let repo_id_str = repo_id.to_string();
    let run_id_str = agent_run_id.to_string();

    broadcast.publish(WsEvent::AnalysisProgress {
        repo_id: repo_id_str.clone(),
        agent_run_id: run_id_str.clone(),
        status: "starting".into(),
        message: format!("Cartographer scanning {repo_path} (model: {model})"),
        findings_count: None,
    });

    // Validate path is reachable from this container before spawning claude
    if !std::path::Path::new(repo_path).is_dir() {
        finish_with_error(
            pool,
            broadcast,
            agent_run_id,
            &repo_id_str,
            &run_id_str,
            &format!("Repo path not reachable from backend container: {repo_path}"),
        )
        .await;
        return;
    }

    // Accumulate findings as they stream in. Tokio Mutex to share across awaits.
    let findings_collector = std::sync::Arc::new(std::sync::Mutex::new(Vec::<Finding>::new()));
    let mut text_buf = String::new();

    let req = CcStreamRequest {
        system_prompt: cartographer_streaming_system_prompt().to_string(),
        user_prompt: format!(
            "Scan this repository and produce findings. Plans (if any) live under `plans/`. \
             Source tree is the rest. Begin."
        ),
        model: model.to_string(),
        cwd: repo_path.to_string(),
        allowed_tools: CARTOGRAPHER_TOOLS.iter().map(|s| s.to_string()).collect(),
        max_turns: CARTOGRAPHER_MAX_TURNS,
    };

    let collector_clone = findings_collector.clone();
    let broadcast_clone = broadcast.clone();
    let run_id_clone = run_id_str.clone();
    let repo_id_clone = repo_id_str.clone();

    let stream_result = cc_stream(req, |event| {
        match event {
            CcEvent::ToolUse { name, input } => {
                let summary = summarize_tool_input(&name, &input);
                broadcast_clone.publish(WsEvent::CartographerTool {
                    agent_run_id: run_id_clone.clone(),
                    tool: name,
                    summary,
                });
            }
            CcEvent::ToolResult { is_error, summary } => {
                if is_error {
                    broadcast_clone.publish(WsEvent::CartographerTool {
                        agent_run_id: run_id_clone.clone(),
                        tool: "tool_error".into(),
                        summary,
                    });
                }
            }
            CcEvent::AssistantText { text } => {
                // Accumulate text and parse FINDING: lines as they complete
                text_buf.push_str(&text);
                while let Some(nl) = text_buf.find('\n') {
                    let line: String = text_buf.drain(..=nl).collect();
                    if let Some(finding) = parse_finding_line(&line) {
                        let value = serde_json::to_value(&finding).unwrap_or_default();
                        broadcast_clone.publish(WsEvent::CartographerFinding {
                            agent_run_id: run_id_clone.clone(),
                            finding: value,
                        });
                        if let Ok(mut vec) = collector_clone.lock() {
                            vec.push(finding);
                            let count = vec.len();
                            broadcast_clone.publish(WsEvent::AnalysisProgress {
                                repo_id: repo_id_clone.clone(),
                                agent_run_id: run_id_clone.clone(),
                                status: "streaming".into(),
                                message: format!("{count} findings so far…"),
                                findings_count: Some(count),
                            });
                        }
                    }
                }
            }
            CcEvent::Result { .. } => {
                // Final result event — main loop ends shortly after
            }
            CcEvent::Exit { code, stderr } => {
                if code != 0 {
                    broadcast_clone.publish(WsEvent::CartographerTool {
                        agent_run_id: run_id_clone.clone(),
                        tool: "claude_exit".into(),
                        summary: format!(
                            "exit {code}: {}",
                            stderr.chars().take(200).collect::<String>()
                        ),
                    });
                }
            }
            CcEvent::Error { error } => {
                broadcast_clone.publish(WsEvent::CartographerTool {
                    agent_run_id: run_id_clone.clone(),
                    tool: "claude_error".into(),
                    summary: error,
                });
            }
            _ => {}
        }
    })
    .await;

    // Flush trailing text (in case last finding had no newline)
    if let Some(finding) = parse_finding_line(&text_buf) {
        let value = serde_json::to_value(&finding).unwrap_or_default();
        broadcast.publish(WsEvent::CartographerFinding {
            agent_run_id: run_id_str.clone(),
            finding: value,
        });
        if let Ok(mut vec) = findings_collector.lock() {
            vec.push(finding);
        }
    }

    let findings = findings_collector
        .lock()
        .map(|v| v.clone())
        .unwrap_or_default();
    let count = findings.len();

    if let Err(e) = stream_result {
        // Persist whatever findings we got and report the error
        let output = serde_json::json!({
            "status": "error",
            "error": e.to_string(),
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
            status: "error".into(),
            message: format!("Cartographer stream failed: {e}. Kept {count} partial findings."),
            findings_count: Some(count),
        });
        return;
    }

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
        message: format!("Cartographer complete. Found {count} items."),
        findings_count: Some(count),
    });
}

fn summarize_tool_input(name: &str, input: &serde_json::Value) -> String {
    match name {
        "Read" => input["file_path"]
            .as_str()
            .map(|p| p.to_string())
            .unwrap_or_default(),
        "Grep" => {
            let pattern = input["pattern"].as_str().unwrap_or("");
            let path = input["path"].as_str().unwrap_or("");
            if path.is_empty() {
                pattern.to_string()
            } else {
                format!("{pattern}  in  {path}")
            }
        }
        "Glob" => input["pattern"]
            .as_str()
            .map(|p| p.to_string())
            .unwrap_or_default(),
        "LS" => input["path"]
            .as_str()
            .map(|p| p.to_string())
            .unwrap_or_default(),
        _ => {
            let s = input.to_string();
            s.chars().take(120).collect()
        }
    }
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
