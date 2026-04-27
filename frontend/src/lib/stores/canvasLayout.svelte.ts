// ---------------------------------------------------------------------------
// Canvas Layout Store — manages computed tree positions + transient drag offsets
// ---------------------------------------------------------------------------

import { SvelteMap } from 'svelte/reactivity';
import type { Node, NodeEdge } from '$lib/storage/adapter';
import {
	computeForestLayout,
	type Position,
	type TreeLayoutOptions
} from '$lib/layout/tree-layout';

// Computed positions from tree layout
const canvasPositions = new SvelteMap<string, Position>();

// Transient drag offsets (not persisted)
const dragOffsets = new SvelteMap<string, Position>();

/**
 * Get the effective display position for a node.
 * Returns layout position + any active drag offset.
 */
export function getNodePosition(id: string): Position {
	const base = canvasPositions.get(id) ?? { x: 0, y: 0 };
	const offset = dragOffsets.get(id);
	if (!offset) return base;
	return { x: base.x + offset.x, y: base.y + offset.y };
}

/**
 * Set a transient drag offset for a node.
 */
export function setDragOffset(id: string, dx: number, dy: number): void {
	dragOffsets.set(id, { x: dx, y: dy });
}

/**
 * Clear the drag offset for a node.
 * Returns the final position (base + offset) so the caller can persist it if needed.
 */
export function clearDragOffset(id: string): Position {
	const pos = getNodePosition(id);
	dragOffsets.delete(id);
	return pos;
}

/**
 * Check if a drag was significant enough to count as a real move.
 */
export function isDragSignificant(id: string, threshold = 5): boolean {
	const offset = dragOffsets.get(id);
	if (!offset) return false;
	return Math.abs(offset.x) > threshold || Math.abs(offset.y) > threshold;
}

/**
 * Recompute the tree layout for all nodes.
 * Only repositions nodes where positionLocked is false.
 */
export function recomputeLayout(
	nodes: Node[],
	edges: NodeEdge[],
	options?: TreeLayoutOptions
): void {
	const positions = computeForestLayout(nodes, edges, options);
	canvasPositions.clear();
	for (const [id, pos] of positions) {
		canvasPositions.set(id, pos);
	}
	// Clear stale drag offsets
	dragOffsets.clear();
}

/**
 * Get all computed positions (for debugging / rendering).
 */
export function getAllPositions(): Map<string, Position> {
	return canvasPositions;
}
