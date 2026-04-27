// ---------------------------------------------------------------------------
// Thread Context — build conversation context from a thread of nodes
//
// Walks ancestor chain from a node to the root, then formats it as
// conversation history that can be injected into LLM system prompts.
// ---------------------------------------------------------------------------

import type { Node, NodeEdge } from '$lib/storage/adapter';
import { extractBodyText } from '$lib/node-types';

/**
 * Walk from a node up to the root via edges, returning the chain root → node.
 */
export function walkThread(nodeId: string, nodes: Node[], edges: NodeEdge[]): Node[] {
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	// Build reverse map: targetId → sourceId (child → parent)
	const parentMap = new Map<string, string>();
	for (const edge of edges) {
		// First edge wins — if multiple parents, take the first
		if (!parentMap.has(edge.targetId)) {
			parentMap.set(edge.targetId, edge.sourceId);
		}
	}

	// Walk up from nodeId to root
	const chain: Node[] = [];
	let currentId: string | null = nodeId;
	const visited = new Set<string>();

	while (currentId && !visited.has(currentId)) {
		visited.add(currentId);
		const node = nodeMap.get(currentId);
		if (!node) break;
		chain.unshift(node); // prepend so root is first
		currentId = parentMap.get(currentId) ?? null;
	}

	return chain;
}

/**
 * Format a thread chain as a conversation history string for LLM context.
 */
export function buildThreadPrompt(chain: Node[]): string {
	if (chain.length <= 1) return '';

	const lines: string[] = ['Conversation thread (from root to current):'];

	for (let i = 0; i < chain.length; i++) {
		const node = chain[i];
		const bodyText = extractBodyText(node.body, 500);
		const indent = i === chain.length - 1 ? '→' : '  ';
		const label = `[${node.type}] "${node.title}"`;
		const body = bodyText ? `: ${bodyText}` : '';
		lines.push(`${indent} ${i + 1}. ${label}${body}`);
	}

	return lines.join('\n');
}
