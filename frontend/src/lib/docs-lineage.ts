/**
 * Docs zone lineage utilities.
 *
 * Traces the journey from a plan node back to the L5 notes that inspired it,
 * and computes feature-level progress for the overview dashboard.
 */

import type { Node, NodeEdge } from '$lib/storage/adapter';

export interface LineageEntry {
	nodeId: string;
	nodeType: string;
	title: string;
	layer: number;
	status: string;
	relationship: 'parent' | 'refines' | 'compacts';
}

/**
 * Walk parentId chain + refines edges to build the full journey of a node.
 * Returns entries from the node itself up through parents and across refines edges to L5 notes.
 */
export function traceLineage(
	nodeId: string,
	allNodes: Node[],
	allEdges: NodeEdge[]
): LineageEntry[] {
	const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
	const entries: LineageEntry[] = [];
	const visited = new Set<string>();

	// Walk up parentId chain
	let current = nodeMap.get(nodeId);
	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		entries.push({
			nodeId: current.id,
			nodeType: current.type,
			title: current.title,
			layer: current.layer,
			status: current.status,
			relationship: entries.length === 0 ? 'parent' : 'parent'
		});
		if (current.parentId) {
			current = nodeMap.get(current.parentId);
		} else {
			break;
		}
	}

	// Reverse so root is first, target node is last
	entries.reverse();

	// Find refines edges pointing TO any node in the chain (plan node refines source note)
	// Convention: sourceId refines targetId means source was derived from target
	// Also check: targetId refines sourceId (edge direction may vary)
	for (const entry of [...entries]) {
		for (const edge of allEdges) {
			if (edge.relationType !== 'refines') continue;
			// plan node is sourceId, source note is targetId
			if (edge.sourceId === entry.nodeId && !visited.has(edge.targetId)) {
				const target = nodeMap.get(edge.targetId);
				if (target) {
					visited.add(target.id);
					entries.push({
						nodeId: target.id,
						nodeType: target.type,
						title: target.title,
						layer: target.layer,
						status: target.status,
						relationship: 'refines'
					});
				}
			}
		}
	}

	return entries;
}

/**
 * Find L5 source notes that spawned a plan node (via refines edges).
 * Walks refines edges from the node and its ancestors to find L5 origins.
 */
export function getSourceNotes(nodeId: string, allNodes: Node[], allEdges: NodeEdge[]): Node[] {
	const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
	const sourceNotes: Node[] = [];
	const visited = new Set<string>();

	// Collect the node and all its ancestors
	const chain: string[] = [];
	let current = nodeMap.get(nodeId);
	while (current) {
		chain.push(current.id);
		if (current.parentId) {
			current = nodeMap.get(current.parentId);
		} else {
			break;
		}
	}

	// Find refines edges from any node in the chain to L5 notes
	for (const chainId of chain) {
		for (const edge of allEdges) {
			if (edge.relationType !== 'refines') continue;
			if (edge.sourceId === chainId && !visited.has(edge.targetId)) {
				const target = nodeMap.get(edge.targetId);
				if (target && target.layer === 5) {
					visited.add(target.id);
					sourceNotes.push(target);
				}
			}
		}
	}

	return sourceNotes;
}

/**
 * Progress computation: done/total tickets (L1) under a feature (L4).
 * Recursively counts all descendant tickets.
 */
export function getFeatureProgress(
	featureId: string,
	allNodes: Node[]
): { done: number; total: number } {
	// Build parent→children index
	const childrenOf = new Map<string, Node[]>();
	for (const node of allNodes) {
		if (node.parentId) {
			const siblings = childrenOf.get(node.parentId) ?? [];
			siblings.push(node);
			childrenOf.set(node.parentId, siblings);
		}
	}

	let done = 0;
	let total = 0;

	// BFS to find all descendant tickets
	const queue = [featureId];
	const visited = new Set<string>();
	while (queue.length > 0) {
		const id = queue.pop()!;
		if (visited.has(id)) continue;
		visited.add(id);

		const children = childrenOf.get(id) ?? [];
		for (const child of children) {
			if (child.type === 'ticket') {
				total++;
				if (child.status === 'done') done++;
			}
			queue.push(child.id);
		}
	}

	return { done, total };
}
