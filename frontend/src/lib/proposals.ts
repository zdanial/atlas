// ---------------------------------------------------------------------------
// Unified Proposal System — types
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
