// ---------------------------------------------------------------------------
// Unified Proposal System — types + parsing
// ---------------------------------------------------------------------------

import type { Node, CreateNode, CreateEdge } from '$lib/storage/adapter';

/** Atomic change operations, mirroring the Operation type from history.svelte.ts */
export type ProposalItem =
	| { op: 'create_node'; data: CreateNode; _summary: string }
	| { op: 'update_node'; nodeId: string; patch: Partial<Node>; _summary: string }
	| { op: 'delete_node'; nodeId: string; _summary: string }
	| { op: 'create_edge'; data: CreateEdge; _summary: string }
	| { op: 'delete_edge'; edgeId: string; _summary: string };

/** A proposal block parsed from an AI response */
export interface Proposal {
	id: string;
	items: ProposalItem[];
	rationale: string;
}

/**
 * Parse `<!--proposals:[...]-->` blocks from AI response text.
 * Returns the cleaned display text and any parsed proposals.
 */
export function parseProposals(text: string): { displayText: string; proposals: Proposal[] } {
	let displayText = text;
	const proposals: Proposal[] = [];

	const match = text.match(/<!--proposals:([\s\S]*?)-->/);
	if (match) {
		try {
			const raw = JSON.parse(match[1]);
			const arr = Array.isArray(raw) ? raw : [raw];
			for (let i = 0; i < arr.length; i++) {
				const p = arr[i];
				proposals.push({
					id: `proposal_${i}`,
					items: (p.items ?? []).map((item: Partial<ProposalItem>) => ({
						...item,
						_summary: item._summary ?? 'Change'
					})),
					rationale: p.rationale ?? ''
				});
			}
		} catch {
			/* malformed JSON — ignore */
		}
		displayText = displayText.replace(match[0], '').trim();
	}

	return { displayText, proposals };
}
