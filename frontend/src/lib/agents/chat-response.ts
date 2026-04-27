// ---------------------------------------------------------------------------
// Structured Chat Response — JSON schema for LLM responses
// ---------------------------------------------------------------------------
//
// Every AI response returns {message, proposals[]}. Proposals are the
// structured mechanism for ALL state mutations — creating nodes, updating
// bodies, linking items, updating project context, etc.
// ---------------------------------------------------------------------------

import type { Proposal, ProposalOp } from '$lib/proposals';

/** The JSON structure the LLM must return */
export interface ChatResponse {
	/** Short conversational reply — chat bubble only */
	message: string;
	/** Proposed state changes — user reviews each */
	proposals: Proposal[];
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
export function parseChatResponse(raw: string, currentNodeId?: string): ChatResponse {
	const trimmed = raw.trim();

	// Strategy 1: direct JSON parse
	const direct = tryParse(trimmed);
	if (direct) return normalize(direct, currentNodeId);

	// Strategy 2: ```json ... ``` code block
	const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (codeBlockMatch) {
		const parsed = tryParse(codeBlockMatch[1].trim());
		if (parsed) return normalize(parsed, currentNodeId);
	}

	// Strategy 3: first { ... } block (greedy from first { to last })
	const firstBrace = trimmed.indexOf('{');
	const lastBrace = trimmed.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		const parsed = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
		if (parsed) return normalize(parsed, currentNodeId);
	}

	// Strategy 4: fallback — treat as plain message
	return { message: trimmed, proposals: [] };
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

function normalize(raw: Record<string, unknown>, currentNodeId?: string): ChatResponse {
	const result: ChatResponse = {
		message: typeof raw.message === 'string' ? raw.message : '',
		proposals: []
	};

	// Parse new-format proposals
	if (Array.isArray(raw.proposals)) {
		result.proposals = raw.proposals
			.filter((p: unknown) => p && typeof p === 'object')
			.map((p: Record<string, unknown>) => {
				const op = p.op as Record<string, unknown> | undefined;
				if (!op || typeof op !== 'object') return null;

				// Resolve "CURRENT" nodeId
				if (currentNodeId && op.type === 'update_node' && op.nodeId === 'CURRENT') {
					op.nodeId = currentNodeId;
				}

				return {
					summary: typeof p.summary === 'string' ? p.summary : 'Proposed change',
					rationale: typeof p.rationale === 'string' ? p.rationale : '',
					op: op as ProposalOp
				} satisfies Proposal;
			})
			.filter((p): p is Proposal => p !== null);
	}

	// --- Backward compatibility: convert old cardBody/cardMeta/cardPayload to proposals ---

	if (typeof raw.cardBody === 'string' && currentNodeId) {
		result.proposals.unshift({
			summary: 'Update note body',
			rationale: 'Incorporating discussion into the note',
			op: {
				type: 'update_node',
				nodeId: currentNodeId,
				changes: { body: raw.cardBody }
			}
		});
	}

	if (raw.cardMeta && typeof raw.cardMeta === 'object' && currentNodeId) {
		const meta = raw.cardMeta as Record<string, unknown>;
		const changes: Record<string, unknown> = {};
		if (typeof meta.title === 'string') changes.title = meta.title;
		if (typeof meta.type === 'string') changes.type = meta.type;
		if (Array.isArray(meta.tags)) changes.payload = { tags: meta.tags };
		if (Object.keys(changes).length > 0) {
			result.proposals.push({
				summary: 'Set note title, type, and tags',
				rationale: 'Classifying the new note',
				op: {
					type: 'update_node',
					nodeId: currentNodeId,
					changes: changes as ProposalOp extends { type: 'update_node' }
						? ProposalOp['changes']
						: never
				} as ProposalOp
			});
		}
	}

	if (raw.cardPayload && typeof raw.cardPayload === 'object' && currentNodeId) {
		result.proposals.push({
			summary: 'Update planning fields',
			rationale: 'Updating type-specific metadata',
			op: {
				type: 'update_node',
				nodeId: currentNodeId,
				changes: { payload: raw.cardPayload as Record<string, unknown> }
			}
		});
	}

	// Legacy proposal format: {rationale, items: [{op, data, _summary}]}
	if (
		Array.isArray(raw.proposals) &&
		raw.proposals.length > 0 &&
		raw.proposals[0]?.items &&
		result.proposals.length === 0
	) {
		for (const group of raw.proposals as Array<Record<string, unknown>>) {
			if (!Array.isArray(group.items)) continue;
			const rationale = typeof group.rationale === 'string' ? group.rationale : '';
			for (const item of group.items as Array<Record<string, unknown>>) {
				const converted = convertLegacyItem(item, rationale);
				if (converted) result.proposals.push(converted);
			}
		}
	}

	return result;
}

function convertLegacyItem(item: Record<string, unknown>, rationale: string): Proposal | null {
	const summary = typeof item._summary === 'string' ? item._summary : 'Change';

	if (item.op === 'create_node' && item.data && typeof item.data === 'object') {
		const data = item.data as Record<string, unknown>;
		return {
			summary,
			rationale,
			op: {
				type: 'create_node',
				data: {
					nodeType: (data.type as string) || 'note',
					layer: (data.layer as number) || 5,
					title: (data.title as string) || 'Untitled',
					body: typeof data.body === 'string' ? data.body : '',
					parentId: data.parentId as string | undefined,
					status: (data.status as string) || 'draft',
					payload: data.payload as Record<string, unknown> | undefined
				}
			}
		};
	}

	if (item.op === 'update_node' && typeof item.nodeId === 'string') {
		return {
			summary,
			rationale,
			op: {
				type: 'update_node',
				nodeId: item.nodeId,
				changes: (item.patch as Record<string, unknown>) || {}
			}
		};
	}

	if (item.op === 'delete_node' && typeof item.nodeId === 'string') {
		return {
			summary,
			rationale,
			op: {
				type: 'delete_node',
				nodeId: item.nodeId
			}
		};
	}

	if (item.op === 'delete_edge' && typeof item.edgeId === 'string') {
		return {
			summary,
			rationale,
			op: {
				type: 'delete_edge',
				edgeId: item.edgeId
			}
		};
	}

	if (item.op === 'create_edge' && item.data && typeof item.data === 'object') {
		const data = item.data as Record<string, unknown>;
		return {
			summary,
			rationale,
			op: {
				type: 'create_edge',
				data: {
					sourceId: data.sourceId as string,
					targetId: data.targetId as string,
					relationType: (data.relationType as string) || 'supports'
				}
			}
		};
	}

	return null;
}

/**
 * Build the JSON schema instructions for the system prompt.
 */
export function responseFormatInstructions(opts: {
	projectId: string;
	currentNodeId: string;
	isNew: boolean;
	isPlanningNode: boolean;
	nodeListing?: string;
}): string {
	const notesProposalGuidance = `
### WHEN to include proposals (IMPORTANT — be proactive):
- ALWAYS include an update_node proposal for the current note body when you have substantive content to add
- When the conversation reveals MULTIPLE distinct ideas, questions, or risks — propose each as a separate L5 note
- When the user mentions something of a DIFFERENT TYPE than the current note (e.g., discussing a goal but surfacing a risk) — propose a new note of that type
- When the current note is getting complex with multiple concerns — propose splitting into separate notes
- When actionable items emerge — propose tickets or features
- When a project-level insight surfaces (constraint, tech decision, goal) — propose an update_context
- DO NOT put everything in the current node body. If a distinct idea deserves its own card, PROPOSE it as a create_node.`;

	const planningProposalGuidance = `
### WHEN to include proposals (IMPORTANT — be proactive):
- ALWAYS include an update_node proposal for the current node body/payload when you have content to add
- ALWAYS propose the next level of decomposition when discussing scope or implementation:
  - feature → propose epics
  - epic → propose phases and/or tickets
  - phase → propose tickets
  - ticket → propose sub-tickets if complex
- When the user mentions related work not yet captured → propose sibling nodes
- When open questions arise → propose question notes (L5)
- When risks are identified → propose risk notes (L5)
- When a project-level insight surfaces → propose update_context
- You are a planning decomposition engine. Include proposals in EVERY response where scope or work items are discussed.`;

	return `## RESPONSE FORMAT — MANDATORY

Your ENTIRE response must be a single valid JSON object. No text before or after. No markdown fences.

{
  "message": "1-3 sentence chat reply — questions, observations, or next-step suggestions only",
  "proposals": [
    {
      "summary": "Human-readable description of the change",
      "rationale": "Why this change is being proposed",
      "op": { ... }
    }
  ]
}

**message**: 1-3 sentences MAX. Chat bubble — no bullets, outlines, or structured content. Use this for questions, observations, or suggesting what to explore next.

**proposals**: Array of proposed state changes. The user reviews and accepts/rejects each one.

### Proposal operations:

**update_node** — update body, title, type, status, payload, or parentId of any node:
  op: {"type": "update_node", "nodeId": "${opts.currentNodeId}", "changes": {"body": "markdown content", "payload": {...}}}
  Use nodeId "${opts.currentNodeId}" (or "CURRENT") to update the note being discussed.
  Use changes.parentId to move/reparent a node.
  Use changes.status to change status (draft/active/done/archived).

**create_node** — create a new node at any layer:
  op: {"type": "create_node", "data": {"nodeType": "epic", "layer": 3, "title": "...", "body": "markdown", "parentId": "optional", "status": "draft", "payload": {...}}}
  Types+layers: note/idea/question/decision/insight/risk/goal/constraint (L5), feature (L4), epic (L3), phase (L2), ticket (L1)

**create_edge** — link two nodes:
  op: {"type": "create_edge", "data": {"sourceId": "...", "targetId": "...", "relationType": "supports"}}
  Relations: supports, contradicts, blocks, implements, duplicates, refines, belongs-to

**update_context** — update global project context:
  op: {"type": "update_context", "section": "constraints", "content": "GDPR requires data residency in EU"}
  Sections: goals, constraints, tech-stack, team, decisions, other

**delete_node** / **delete_edge** — remove items:
  op: {"type": "delete_node", "nodeId": "..."}
  op: {"type": "delete_edge", "edgeId": "..."}

### Node content guidance:
- **feature** (L4): payload: {targetOutcome, scope}
- **epic** (L3): payload: {openQuestions: [...]}
- **phase** (L2): payload: {objective, verifyCriteria: [...]}
- **ticket** (L1): payload: {intent, acceptanceCriteria: [...]}
- **note/idea/question/risk** (L5): payload: {tags: [...]}

### Rules:
- body: plain markdown string
- Use real node IDs from the listing — do NOT invent IDs for existing nodes
- projectId for all new nodes: "${opts.projectId}"
- Every proposal needs a clear summary and rationale
${opts.isPlanningNode ? planningProposalGuidance : notesProposalGuidance}
${
	opts.isNew
		? `
### MANDATORY — New note title:
This is a NEW untitled note. Your FIRST response MUST include an update_node proposal setting a concise title (3-8 words) for this note based on the user's message. Do NOT leave the title as "Untitled".`
		: ''
}
${opts.nodeListing ? `\n${opts.nodeListing}` : ''}`;
}
