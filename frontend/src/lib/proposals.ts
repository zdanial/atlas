// ---------------------------------------------------------------------------
// Unified Proposal System — types
//
// Every AI response returns {message, proposals[]}. Proposals are the ONLY
// mechanism for AI to propose state mutations. The user reviews and accepts
// or rejects each one.
// ---------------------------------------------------------------------------

import type { Node, CreateNode, CreateEdge } from '$lib/storage/adapter';

// ---------------------------------------------------------------------------
// Proposal operations — all possible state mutations
// ---------------------------------------------------------------------------

export type ProposalOp =
	// --- Node mutations ---
	| {
			type: 'create_node';
			data: {
				nodeType: string;
				layer: number;
				title: string;
				body: string; // markdown
				parentId?: string;
				status?: string;
				payload?: Record<string, unknown>;
			};
	  }
	| {
			type: 'update_node';
			nodeId: string; // "CURRENT" = the node being chatted about
			changes: {
				title?: string;
				body?: string;
				type?: string;
				status?: string;
				parentId?: string; // reparent = move
				payload?: Record<string, unknown>;
			};
	  }
	| { type: 'delete_node'; nodeId: string }

	// --- Edge mutations ---
	| {
			type: 'create_edge';
			data: {
				sourceId: string;
				targetId: string;
				relationType: string;
			};
	  }
	| { type: 'delete_edge'; edgeId: string }

	// --- Branch mutations ---
	| {
			type: 'fork_node';
			parentId: string;
			newNode: {
				nodeType: string;
				layer: number;
				title: string;
				body: string;
				status?: string;
				payload?: Record<string, unknown>;
			};
	  }

	// --- Context mutations ---
	| {
			type: 'update_context';
			section: string; // goals | constraints | tech-stack | team | decisions | other
			content: string;
	  };

/** A single proposed change with human-readable metadata */
export interface Proposal {
	summary: string;
	rationale: string;
	op: ProposalOp;
}

// ---------------------------------------------------------------------------
// Legacy types — kept for backward compatibility during transition
// ---------------------------------------------------------------------------

/** @deprecated Use Proposal with ProposalOp instead */
export type ProposalItem =
	| { op: 'create_node'; data: CreateNode; _summary: string }
	| { op: 'update_node'; nodeId: string; patch: Partial<Node>; _summary: string }
	| { op: 'delete_node'; nodeId: string; _summary: string }
	| { op: 'create_edge'; data: CreateEdge; _summary: string }
	| { op: 'delete_edge'; edgeId: string; _summary: string };

/** @deprecated Use Proposal[] instead */
export interface LegacyProposalGroup {
	id: string;
	items: ProposalItem[];
	rationale: string;
}
