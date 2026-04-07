use axum::{http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::nodes::ErrorResponse;

// ---------------------------------------------------------------------------
// Request / response DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct BrainDumpBody {
    pub text: String,
    pub project_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct BrainDumpResponse {
    pub thoughts: Vec<Thought>,
}

#[derive(Debug, Serialize)]
pub struct Thought {
    pub text: String,
    pub suggested_type: String,
    pub related_to: Vec<usize>,
}

// ---------------------------------------------------------------------------
// Heuristic classifier
// ---------------------------------------------------------------------------

fn classify_thought(text: &str) -> &'static str {
    let trimmed = text.trim();
    let lower = trimmed.to_lowercase();

    // Prefix-based rules
    if trimmed.starts_with('?') {
        return "question";
    }
    if trimmed.starts_with('!') {
        return "insight";
    }
    if lower.starts_with("todo") || lower.starts_with("fixme") {
        return "idea";
    }

    // Keyword-based rules
    if lower.contains("risk") || lower.contains("danger") {
        return "risk";
    }
    if lower.contains("decide") || lower.contains("choice") {
        return "decision";
    }
    if lower.contains("goal") || lower.contains("objective") {
        return "goal";
    }
    if lower.contains("problem") || lower.contains("issue") || lower.contains("bug") {
        return "problem";
    }
    if lower.contains("hypothes") {
        return "hypothesis";
    }
    if lower.contains("constraint") || lower.contains("limitation") {
        return "constraint";
    }
    if lower.contains("reference") || lower.contains("see also") || lower.contains("http") {
        return "reference";
    }
    if lower.contains("bet") && lower.contains("that") {
        return "bet";
    }

    "note"
}

/// Split input text into individual thoughts.
/// Splits on double-newlines (paragraphs) first, then falls back to single newlines.
fn split_into_thoughts(text: &str) -> Vec<String> {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();

    let mut thoughts = Vec::new();
    for para in paragraphs {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }
        // If a paragraph has multiple lines, split further by newline.
        let lines: Vec<&str> = trimmed.lines().collect();
        if lines.len() > 1 {
            for line in lines {
                let line_trimmed = line.trim();
                if !line_trimmed.is_empty() {
                    thoughts.push(line_trimmed.to_string());
                }
            }
        } else {
            thoughts.push(trimmed.to_string());
        }
    }

    thoughts
}

/// Find simple keyword-based relationships between thoughts.
fn find_relations(thoughts: &[String]) -> Vec<Vec<usize>> {
    let mut relations = vec![Vec::new(); thoughts.len()];

    for i in 0..thoughts.len() {
        let words_i: Vec<String> = thoughts[i]
            .to_lowercase()
            .split_whitespace()
            .filter(|w| w.len() > 4) // Only consider words with 5+ chars
            .map(|s| s.to_string())
            .collect();

        for j in (i + 1)..thoughts.len() {
            let lower_j = thoughts[j].to_lowercase();
            // Check if any significant word from thought i appears in thought j
            let shared = words_i.iter().any(|w| lower_j.contains(w.as_str()));
            if shared {
                relations[i].push(j);
                relations[j].push(i);
            }
        }
    }

    relations
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// POST /api/brain-dump
pub async fn brain_dump(
    Json(body): Json<BrainDumpBody>,
) -> Result<Json<BrainDumpResponse>, (StatusCode, Json<ErrorResponse>)> {
    if body.text.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "text must not be empty".into(),
            }),
        ));
    }

    let raw_thoughts = split_into_thoughts(&body.text);

    if raw_thoughts.is_empty() {
        return Ok(Json(BrainDumpResponse {
            thoughts: Vec::new(),
        }));
    }

    let relations = find_relations(&raw_thoughts);

    let thoughts: Vec<Thought> = raw_thoughts
        .iter()
        .enumerate()
        .map(|(i, text)| Thought {
            text: text.clone(),
            suggested_type: classify_thought(text).to_string(),
            related_to: relations[i].clone(),
        })
        .collect();

    Ok(Json(BrainDumpResponse { thoughts }))
}
