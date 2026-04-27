//! Streaming HTTP client for the claude-code container.
//!
//! Calls `POST /prompt-stream` and parses the chunked NDJSON response,
//! invoking a callback for every event so the caller can fan-out to
//! WebSocket / DB / etc as the agent works.

use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct CcStreamRequest {
    pub system_prompt: String,
    pub user_prompt: String,
    pub model: String,
    pub cwd: String,
    pub allowed_tools: Vec<String>,
    pub max_turns: u32,
}

/// One event emitted by the streaming claude run.
#[derive(Debug, Clone)]
pub enum CcEvent {
    /// `system` message at session start (init)
    System { raw: Value },
    /// Assistant text chunk — typically a streamed text block
    AssistantText { text: String },
    /// Tool invocation by the agent (Read/Grep/Glob/...)
    ToolUse { name: String, input: Value },
    /// Tool result returning to the agent
    ToolResult { is_error: bool, summary: String },
    /// Final result event (claude finished normally)
    Result { raw: Value },
    /// Synthetic terminator emitted by the CC wrapper
    Exit { code: i32, stderr: String },
    /// Wrapper-level error
    Error { error: String },
    /// Raw, uninterpreted JSON line (kept for debugging)
    Other { raw: Value },
}

#[derive(Debug, thiserror::Error)]
pub enum CcError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("CC container returned status {0}")]
    Status(u16),
}

/// Open a streaming connection to the claude-code container.
/// Calls `on_event` for every NDJSON line received until the stream ends.
pub async fn stream<F>(req: CcStreamRequest, mut on_event: F) -> Result<(), CcError>
where
    F: FnMut(CcEvent) + Send,
{
    let base_url =
        std::env::var("CLAUDE_CODE_URL").unwrap_or_else(|_| "http://localhost:3002".into());
    let url = format!("{base_url}/prompt-stream");

    let payload = serde_json::json!({
        "systemPrompt": req.system_prompt,
        "userPrompt": req.user_prompt,
        "model": req.model,
        "cwd": req.cwd,
        "allowedTools": req.allowed_tools,
        "maxTurns": req.max_turns,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()?;

    tracing::info!(url = %url, "cc_stream sending request");
    let resp = client.post(&url).json(&payload).send().await?;
    let status = resp.status();
    tracing::info!(status = %status, "cc_stream got response");
    if !status.is_success() {
        return Err(CcError::Status(status.as_u16()));
    }

    let mut buf = String::new();
    let mut stream = resp.bytes_stream();
    let mut chunk_count = 0u32;

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                tracing::error!(error = %e, chunks_so_far = chunk_count, "cc_stream chunk error");
                return Err(CcError::Request(e));
            }
        };
        chunk_count += 1;
        tracing::debug!(chunk = chunk_count, len = bytes.len(), "cc_stream chunk");
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(nl) = buf.find('\n') {
            let line: String = buf.drain(..=nl).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            for ev in classify(&value) {
                on_event(ev);
            }
        }
    }

    // Flush trailing partial line if any
    let tail = buf.trim();
    if !tail.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(tail) {
            for ev in classify(&v) {
                on_event(ev);
            }
        }
    }

    tracing::info!(chunks = chunk_count, "cc_stream finished");
    Ok(())
}

/// Map a raw stream-json event into one or more typed CcEvent values.
/// Tool calls are flattened so each tool_use block becomes its own event.
fn classify(v: &Value) -> Vec<CcEvent> {
    let ty = v["type"].as_str().unwrap_or("");
    match ty {
        "cc_exit" => vec![CcEvent::Exit {
            code: v["exit_code"].as_i64().unwrap_or(-1) as i32,
            stderr: v["stderr"].as_str().unwrap_or("").to_string(),
        }],
        "cc_error" => vec![CcEvent::Error {
            error: v["error"].as_str().unwrap_or("unknown").to_string(),
        }],
        "system" => vec![CcEvent::System { raw: v.clone() }],
        "assistant" => {
            // Assistant message — may contain text and/or tool_use blocks
            let mut out = Vec::new();
            let blocks = v["message"]["content"].as_array();
            if let Some(arr) = blocks {
                for block in arr {
                    let bt = block["type"].as_str().unwrap_or("");
                    match bt {
                        "text" => {
                            if let Some(t) = block["text"].as_str() {
                                out.push(CcEvent::AssistantText { text: t.to_string() });
                            }
                        }
                        "tool_use" => {
                            out.push(CcEvent::ToolUse {
                                name: block["name"].as_str().unwrap_or("").to_string(),
                                input: block["input"].clone(),
                            });
                        }
                        _ => {}
                    }
                }
            }
            if out.is_empty() {
                out.push(CcEvent::Other { raw: v.clone() });
            }
            out
        }
        "user" => {
            // Typically tool_result blocks come back as user messages
            let mut out = Vec::new();
            if let Some(arr) = v["message"]["content"].as_array() {
                for block in arr {
                    if block["type"].as_str() == Some("tool_result") {
                        let is_error = block["is_error"].as_bool().unwrap_or(false);
                        let content = match &block["content"] {
                            Value::String(s) => s.clone(),
                            Value::Array(a) => a
                                .iter()
                                .filter_map(|c| c["text"].as_str())
                                .collect::<Vec<_>>()
                                .join("\n"),
                            _ => String::new(),
                        };
                        let summary = content.chars().take(160).collect::<String>();
                        out.push(CcEvent::ToolResult { is_error, summary });
                    }
                }
            }
            if out.is_empty() {
                out.push(CcEvent::Other { raw: v.clone() });
            }
            out
        }
        "result" => vec![CcEvent::Result { raw: v.clone() }],
        _ => vec![CcEvent::Other { raw: v.clone() }],
    }
}
