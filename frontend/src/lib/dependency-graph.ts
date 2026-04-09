/**
 * Pure dependency-graph utilities for planning nodes.
 *
 * Edge convention: sourceId "blocks" targetId
 * meaning targetId cannot start until sourceId is done.
 */

import type { Node, NodeEdge } from '$lib/storage/adapter';

/** Return IDs of nodes that block the given node. */
export function getBlockers(nodeId: string, edges: NodeEdge[]): string[] {
	return edges
		.filter((e) => e.relationType === 'blocks' && e.targetId === nodeId)
		.map((e) => e.sourceId);
}

/** Return IDs of nodes that the given node blocks. */
export function getBlocked(nodeId: string, edges: NodeEdge[]): string[] {
	return edges
		.filter((e) => e.relationType === 'blocks' && e.sourceId === nodeId)
		.map((e) => e.targetId);
}

/** Is a node unblocked? True if all blockers have status 'done'. */
export function isUnblocked(nodeId: string, edges: NodeEdge[], allNodes: Node[]): boolean {
	const blockerIds = getBlockers(nodeId, edges);
	if (blockerIds.length === 0) return true;
	const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
	return blockerIds.every((id) => nodeMap.get(id)?.status === 'done');
}

/**
 * Topological sort into dependency columns.
 *
 * Column 0 = no unresolved blockers (can start NOW)
 * Column N = longest blocking chain of length N
 *
 * Only considers `blocks` edges between the provided nodes.
 */
export function computeDependencyColumns(nodes: Node[], edges: NodeEdge[]): Map<string, number> {
	const nodeIds = new Set(nodes.map((n) => n.id));
	const blockEdges = edges.filter(
		(e) => e.relationType === 'blocks' && nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
	);

	// Build adjacency: for each node, which nodes block it?
	const inDegree = new Map<string, Set<string>>();
	for (const id of nodeIds) inDegree.set(id, new Set());
	for (const e of blockEdges) {
		inDegree.get(e.targetId)?.add(e.sourceId);
	}

	const columns = new Map<string, number>();
	const resolved = new Set<string>();

	// BFS-style layer assignment
	let currentLayer = 0;
	let remaining = new Set(nodeIds);

	while (remaining.size > 0) {
		const ready: string[] = [];
		for (const id of remaining) {
			const blockers = inDegree.get(id)!;
			const unresolvedBlockers = [...blockers].filter((b) => !resolved.has(b));
			if (unresolvedBlockers.length === 0) {
				ready.push(id);
			}
		}

		if (ready.length === 0) {
			// Cycle detected — assign remaining to current layer
			for (const id of remaining) {
				columns.set(id, currentLayer);
			}
			break;
		}

		for (const id of ready) {
			columns.set(id, currentLayer);
			resolved.add(id);
			remaining.delete(id);
		}
		currentLayer++;
	}

	return columns;
}

/** Phase progress: how many child tickets are done vs total. */
export function phaseProgress(phaseId: string, allNodes: Node[]): { done: number; total: number } {
	const children = allNodes.filter((n) => n.parentId === phaseId);
	return {
		done: children.filter((n) => n.status === 'done').length,
		total: children.length
	};
}

/** Is a phase unlocked? All blocking phases must be done. */
export function isPhaseUnlocked(phaseId: string, edges: NodeEdge[], allNodes: Node[]): boolean {
	return isUnblocked(phaseId, edges, allNodes);
}

/**
 * Get the full upstream dependency chain for a node (all transitive blockers).
 */
export function getUpstreamChain(nodeId: string, edges: NodeEdge[]): Set<string> {
	const result = new Set<string>();
	const queue = getBlockers(nodeId, edges);
	while (queue.length > 0) {
		const id = queue.pop()!;
		if (result.has(id)) continue;
		result.add(id);
		queue.push(...getBlockers(id, edges));
	}
	return result;
}

/**
 * Get the full downstream dependency chain for a node (all transitive blocked).
 */
export function getDownstreamChain(nodeId: string, edges: NodeEdge[]): Set<string> {
	const result = new Set<string>();
	const queue = getBlocked(nodeId, edges);
	while (queue.length > 0) {
		const id = queue.pop()!;
		if (result.has(id)) continue;
		result.add(id);
		queue.push(...getBlocked(id, edges));
	}
	return result;
}
