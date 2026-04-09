// ---------------------------------------------------------------------------
// Structured Chat Response — JSON schema for LLM responses
// ---------------------------------------------------------------------------
//
// Instead of parsing HTML comments from free text, we ask the LLM to return
// a single JSON object. This gives deterministic parsing and prevents the LLM
// from dumping structured content into conversational text.
// ---------------------------------------------------------------------------

import type { Proposal, ProposalItem } from '$lib/proposals';

/** The JSON structure the LLM must return */
export interface ChatResponse {
	/** Short conversational reply — questions, clarifications, acknowledgments only. No structured content. */
	message: string;
	/** Updated note/card body as markdown. Evolves with each message. */
	cardBody?: string;
	/** Metadata for new untitled notes — title, type, tags */
	cardMeta?: { title?: string; type?: string; tags?: string[] };
	/** Payload field updates for planning nodes (ticket, epic, etc.) */
	cardPayload?: Record<string, unknown>;
	/** Proposed changes to other nodes in the project */
	proposals?: Proposal[];
}

/**
 * Parse a raw LLM text response into a structured ChatResponse.
 *
 * Tries multiple strategies:
 * 1. Direct JSON parse
 * 2. Extract from ```json ... ``` code block
 * 3. Extract first { ... } JSON object
 * 4. Fallback: treat entire text as message (graceful degradation)
 */
export function parseChatResponse(raw: string): ChatResponse {
	const trimmed = raw.trim();

	// Strategy 1: direct JSON parse
	const direct = tryParse(trimmed);
	if (direct) return normalize(direct);

	// Strategy 2: ```json ... ``` code block
	const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (codeBlockMatch) {
		const parsed = tryParse(codeBlockMatch[1].trim());
		if (parsed) return normalize(parsed);
	}

	// Strategy 3: first { ... } block (greedy from first { to last })
	const firstBrace = trimmed.indexOf('{');
	const lastBrace = trimmed.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		const parsed = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
		if (parsed) return normalize(parsed);
	}

	// Strategy 4: fallback — treat as plain message
	return { message: trimmed };
}

function tryParse(text: string): Record<string, unknown> | null {
	try {
		const obj = JSON.parse(text);
		if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
			return obj;
		}
	} catch {
		// not valid JSON
	}
	return null;
}

function normalize(raw: Record<string, unknown>): ChatResponse {
	const result: ChatResponse = {
		message: typeof raw.message === 'string' ? raw.message : ''
	};

	if (raw.cardBody && typeof raw.cardBody === 'string') {
		result.cardBody = raw.cardBody;
	}

	if (raw.cardMeta && typeof raw.cardMeta === 'object') {
		result.cardMeta = raw.cardMeta as ChatResponse['cardMeta'];
	}

	if (raw.cardPayload && typeof raw.cardPayload === 'object') {
		result.cardPayload = raw.cardPayload as Record<string, unknown>;
	}

	if (Array.isArray(raw.proposals) && raw.proposals.length > 0) {
		result.proposals = raw.proposals.map((p: Record<string, unknown>, i: number) => ({
			id: `proposal_${i}`,
			items: Array.isArray(p.items)
				? (p.items as ProposalItem[]).map((item) => ({
						...item,
						_summary: item._summary ?? 'Change'
					}))
				: [],
			rationale: typeof p.rationale === 'string' ? p.rationale : ''
		}));
	}

	return result;
}

/**
 * Build the JSON schema instructions for the system prompt.
 * This replaces all the HTML comment format instructions.
 */
export function responseFormatInstructions(opts: {
	projectId: string;
	isNew: boolean;
	isPlanningNode: boolean;
	nodeListing?: string;
}): string {
	return `## RESPONSE FORMAT — MANDATORY

IMPORTANT: Your ENTIRE response must be a single valid JSON object. No text before or after. No markdown code fences. Just raw JSON.

SCHEMA:
{
  "message": "(string) 1-3 sentence conversational reply. Brief chat bubble only.",
  ${opts.isNew ? `"cardMeta": {"title": "string", "type": "string", "tags": ["string"]},` : ''}
  "cardBody": "(string) Updated note body as markdown. ALL substantive content goes here."${
		opts.isPlanningNode
			? `,
  "cardPayload": {"field": "value"}`
			: ''
	},
  "proposals": [{"rationale": "string", "items": [...]}]
}

### message rules:
- 1-3 sentences MAX. Questions, observations, or acknowledgments ONLY.
- NEVER include bullet points, outlines, summaries, or structured content in message.
- This is a chat bubble, not a document.

### cardBody rules:
- REQUIRED on every response. ALL substantive content goes here.
- Write as clean markdown — headings, bullets, bold, etc.
- Evolves with each message — incorporate new discussion points.
- This replaces the note body, so include everything important.
${
	opts.isNew
		? `
### cardMeta rules (new notes only):
- Include on first response to suggest title, type, and tags.
- Valid types: goal, problem, hypothesis, idea, constraint, decision, question, risk, insight, reference, bet, note`
		: ''
}
${
	opts.isPlanningNode
		? `
### cardPayload rules (planning nodes):
- Include when updating type-specific fields like targetOutcome, deadline, openQuestions, acceptanceCriteria.
- Only include fields you want to change.`
		: ''
}

### proposals — for creating/changing OTHER nodes:

WHEN TO INCLUDE proposals (REQUIRED):
- When the user says "integrate" — you MUST include proposals with create_node items
- When the user asks to create nodes, tickets, features, etc.
- When ideas, questions, or insights emerge that deserve their own card — PROACTIVELY propose them

Each proposal item creates a deterministic action. The user reviews and accepts/rejects each one.

IMPORTANT: Every created node MUST have real content — not just a title. Include a "body" field with markdown content and a "payload" object with type-specific fields.

### Node content by type:

**feature** (layer 4): body = description of the feature.
  payload: {"targetOutcome": "what success looks like", "scope": "what's in/out of scope"}

**epic** (layer 3): body = detailed description of the epic.
  payload: {"openQuestions": ["unanswered questions"]}

**ticket** (layer 1): body = implementation details.
  payload: {"intent": "what this ticket accomplishes", "acceptanceCriteria": ["done-when criteria"]}

**note/idea/question/insight** (layer 5): body = the content of the note.
  payload: {"tags": ["relevant", "tags"]}

Example proposals array:
"proposals": [{
  "rationale": "Breaking this note into actionable planning items",
  "items": [
    {"op": "create_node", "data": {"type": "feature", "layer": 4, "projectId": "${opts.projectId}", "title": "Consumer Spending Analysis", "body": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "## Overview\\nAnalyze consumer spending patterns across demographics to identify trends and forecast demand.\\n\\n## Scope\\n- Spending by income bracket\\n- Regional variations\\n- Seasonal patterns"}]}]}, "payload": {"targetOutcome": "Comprehensive spending trend model with demographic breakdowns", "scope": "US consumer data, last 5 years"}, "status": "draft"}, "_summary": "Create feature for spending analysis"},
    {"op": "create_node", "data": {"type": "ticket", "layer": 1, "projectId": "${opts.projectId}", "title": "Research spending demographics", "body": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Gather and analyze consumer spending data segmented by age, income, and region. Pull from BLS and Census Bureau datasets."}]}]}, "payload": {"intent": "Establish baseline spending data by demographic", "acceptanceCriteria": ["Data collected for 5 income brackets", "Regional breakdown complete", "Visualization dashboard created"]}, "status": "draft"}, "_summary": "Add research ticket"}
  ]
}]

Proposal rules:
- Valid types+layers: note/idea/question/decision/insight (layer 5), feature (layer 4), epic (layer 3), phase (layer 2), ticket (layer 1)
- Valid statuses: draft, active, done, archived
- Valid relationType: supports, contradicts, blocks, implements, duplicates, refines, belongs-to, compacts
- Use real node IDs from the listing — do NOT invent IDs for existing nodes
- Every item MUST have _summary (human-readable description)
- Every create_node MUST have body content and payload — NEVER create empty nodes
- body format: {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "markdown content here"}]}]}
- projectId for all new nodes: "${opts.projectId}"
${opts.nodeListing ? `\n${opts.nodeListing}` : ''}`;
}
