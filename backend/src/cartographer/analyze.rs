//! Builds the analysis prompt and parses the Cartographer's structured output.

use serde::{Deserialize, Serialize};

use super::github::TreeEntry;

// ---------------------------------------------------------------------------
// Finding — one item proposed by the Cartographer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub title: String,
    /// Butterfly node type: "ticket", "note", "insight", "idea", "question", etc.
    pub node_type: String,
    pub body: String,
    /// Butterfly layer (1 = ticket, 5 = canvas note/insight)
    pub layer: i32,
    pub is_unimplemented: bool,
    pub confidence: f64,
    /// Optional file references that back this finding (e.g. "src/foo.rs:42-55").
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub file_refs: Vec<String>,
    /// Optional short evidence snippet (1-2 lines of code or quoted text).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<String>,
}

impl Finding {
    pub fn is_valid_type(t: &str) -> bool {
        matches!(
            t,
            "ticket"
                | "note"
                | "insight"
                | "idea"
                | "question"
                | "goal"
                | "problem"
                | "hypothesis"
                | "constraint"
                | "decision"
                | "risk"
                | "reference"
                | "bet"
                | "intent"
                | "epic"
                | "phase"
        )
    }

    /// Canonical layer for a given node type.
    pub fn default_layer(node_type: &str) -> i32 {
        match node_type {
            "ticket" => 1,
            "intent" => 4,
            _ => 5,
        }
    }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ANALYSIS_SYSTEM: &str = r#"You are the Cartographer agent for Butterfly, a project planning tool.

Your job is to compare a project's PLANS directory with its CODE STRUCTURE and identify:
1. Features or work items described in plans that appear NOT YET IMPLEMENTED in code
2. Interesting architectural observations about what has been built
3. Gaps between the plan and the implementation

Return a JSON array of findings. Each finding:
{
  "title": string (under 80 chars, action-oriented for unimplemented items),
  "node_type": "ticket" | "insight" | "note" | "idea" | "question",
  "body": string (1-3 sentences explaining the finding),
  "layer": 1 | 5,
  "is_unimplemented": boolean,
  "confidence": float (0.0-1.0)
}

Rules:
- Use "ticket" (layer=1) for unimplemented plan items that represent concrete work to do
- Use "insight" (layer=5) for architectural observations and what IS implemented
- Use "note" (layer=5) for general observations
- Use "idea" (layer=5) for suggestions not in the plan
- Use "question" (layer=5) for open questions you notice
- Confidence reflects how certain you are (0.9 = clearly unimplemented, 0.6 = uncertain)
- Aim for 10-30 findings total; prioritize actionable unimplemented items
- Title should be specific and concrete (not "implement X" but "Build X that does Y")

Respond with a JSON array only. No markdown, no explanation outside the JSON."#;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

pub fn build_prompt(plans: &[(String, String)], tree: &[TreeEntry]) -> String {
    let mut prompt = String::with_capacity(64_000);

    // Plans section
    prompt.push_str("## PLANS DIRECTORY\n\n");
    if plans.is_empty() {
        prompt.push_str("(No plans/ directory found in this repo)\n\n");
    } else {
        for (name, content) in plans {
            prompt.push_str(&format!("### {name}\n\n{content}\n\n---\n\n"));
        }
    }

    // Code structure section
    prompt.push_str("## CODE STRUCTURE (file tree)\n\n");
    for entry in tree {
        prompt.push_str(&format!("  {}\n", entry.path));
    }

    prompt.push_str(
        "\n\nBased on the plans and code structure above, identify what's implemented \
         vs unimplemented, and produce the JSON findings array.",
    );

    prompt
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

pub fn parse_findings(raw: &str) -> Vec<Finding> {
    // Strip markdown code fences if present
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let arr: Vec<serde_json::Value> = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(
                "Failed to parse Cartographer JSON: {e}\nRaw: {}",
                &raw[..raw.len().min(500)]
            );
            return vec![];
        }
    };

    arr.into_iter()
        .filter_map(|item| finding_from_value(&item))
        .take(50) // Hard cap to prevent runaway outputs
        .collect()
}

/// Convert a serde_json Value (one finding) into a Finding, applying type
/// validation and default layer logic. Returns None if title is missing/empty.
pub fn finding_from_value(item: &serde_json::Value) -> Option<Finding> {
    let title = item["title"].as_str()?.to_string();
    if title.is_empty() {
        return None;
    }

    let raw_type = item["node_type"].as_str().unwrap_or("note").to_string();
    let node_type = if Finding::is_valid_type(&raw_type) {
        raw_type
    } else {
        "note".to_string()
    };

    let body = item["body"].as_str().unwrap_or("").to_string();
    let is_unimplemented = item["is_unimplemented"].as_bool().unwrap_or(false);
    let confidence = item["confidence"].as_f64().unwrap_or(0.7).clamp(0.0, 1.0);
    let layer = item["layer"]
        .as_i64()
        .map(|l| l as i32)
        .unwrap_or_else(|| Finding::default_layer(&node_type));

    let file_refs: Vec<String> = item["file_refs"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let evidence = item["evidence"].as_str().map(|s| s.to_string());

    Some(Finding {
        title,
        node_type,
        body,
        layer,
        is_unimplemented,
        confidence,
        file_refs,
        evidence,
    })
}

/// Parse a single line that may contain a `FINDING: {json}` marker emitted
/// by the streaming Cartographer prompt. Returns None if the line is not a
/// well-formed finding.
pub fn parse_finding_line(line: &str) -> Option<Finding> {
    let trimmed = line.trim();
    let json = trimmed.strip_prefix("FINDING:")?.trim();
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    finding_from_value(&value)
}

pub fn analysis_system_prompt() -> &'static str {
    ANALYSIS_SYSTEM
}

/// System prompt for the streaming Cartographer that runs inside the
/// claude-code container and has read-only filesystem access to the repo.
pub fn cartographer_streaming_system_prompt() -> &'static str {
    CARTOGRAPHER_STREAMING
}

const CARTOGRAPHER_STREAMING: &str = r#"You are the Cartographer agent for Butterfly, a project planning tool.

You have read-only access to a code repository at the current working directory. Use the Read, Grep, and Glob tools to investigate it. The user has provided no instructions inside the repo — this is an external scan.

GOAL
Compare what the project's PLANS describe with what is actually IMPLEMENTED, and surface findings that are useful to a project planner: missing work, gaps, observations, open questions.

PROCESS
1. Glob `plans/**/*.md` to discover any planning documents.
2. Read the plan files (or the most relevant subset if many).
3. Use Glob/Grep on the source tree to check what is implemented.
4. Read source files only when needed to verify claims.
5. Produce findings as you go (see OUTPUT below).

OUTPUT FORMAT — STRICT
Emit each finding on its own line, prefixed with the literal token `FINDING:` followed by a single JSON object. No markdown, no commentary, no JSON arrays. Example:

FINDING: {"title":"Build OAuth flow","node_type":"ticket","body":"plans/03-auth.md describes GitHub OAuth but no auth handler exists in src/.","layer":1,"is_unimplemented":true,"confidence":0.9,"file_refs":["plans/03-auth.md"],"evidence":"Plan: 'Users sign in via GitHub OAuth.'"}
FINDING: {"title":"Canvas zone is implemented","node_type":"insight","body":"src/components/Canvas.svelte exists and matches plan description.","layer":5,"is_unimplemented":false,"confidence":0.95,"file_refs":["src/components/Canvas.svelte"]}

FIELD RULES
- title: under 80 chars, action-oriented for unimplemented items
- node_type: one of "ticket","insight","note","idea","question","goal","problem","hypothesis","constraint","decision","risk","reference","bet","intent","epic","phase"
- body: 1-3 sentences explaining the finding
- layer: 1 for tickets, 5 for canvas notes/insights/etc
- is_unimplemented: true if it represents work to do
- confidence: 0.0-1.0
- file_refs: array of paths (optionally with :start-end line ranges) you actually opened
- evidence: short quote from a plan or code snippet supporting the finding (optional)

CONSTRAINTS
- Aim for 10-30 findings. Hard ceiling 50.
- Prioritise actionable unimplemented items over generic observations.
- If `plans/` is empty or missing, infer intent from README + top-level docs.
- Do NOT modify any file. Tools are read-only.
- Do NOT wrap the output in code fences or arrays. One `FINDING:` per line."#;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_findings_valid() {
        let raw = r#"[
            {"title":"Build OAuth flow","node_type":"ticket","body":"GitHub OAuth not implemented.","layer":1,"is_unimplemented":true,"confidence":0.9},
            {"title":"Canvas is implemented","node_type":"insight","body":"Canvas.svelte exists.","layer":5,"is_unimplemented":false,"confidence":0.95}
        ]"#;
        let findings = parse_findings(raw);
        assert_eq!(findings.len(), 2);
        assert_eq!(findings[0].node_type, "ticket");
        assert!(findings[0].is_unimplemented);
        assert_eq!(findings[1].node_type, "insight");
    }

    #[test]
    fn parse_findings_strips_fences() {
        let raw = "```json\n[{\"title\":\"T\",\"node_type\":\"note\",\"body\":\"B\",\"layer\":5,\"is_unimplemented\":false,\"confidence\":0.8}]\n```";
        let findings = parse_findings(raw);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].title, "T");
    }

    #[test]
    fn parse_findings_bad_json_empty() {
        let findings = parse_findings("not json at all");
        assert!(findings.is_empty());
    }

    #[test]
    fn parse_findings_unknown_type_falls_back() {
        let raw = r#"[{"title":"X","node_type":"banana","body":"B","layer":5,"is_unimplemented":false,"confidence":0.5}]"#;
        let findings = parse_findings(raw);
        assert_eq!(findings[0].node_type, "note");
    }

    #[test]
    fn build_prompt_contains_plans() {
        let plans = vec![(
            "00-overview.md".to_string(),
            "# Overview\nThis is Butterfly.".to_string(),
        )];
        let tree = vec![TreeEntry {
            path: "backend/src/main.rs".to_string(),
            kind: "blob".to_string(),
            size: Some(1000),
        }];
        let prompt = build_prompt(&plans, &tree);
        assert!(prompt.contains("00-overview.md"));
        assert!(prompt.contains("This is Butterfly"));
        assert!(prompt.contains("backend/src/main.rs"));
    }
}
