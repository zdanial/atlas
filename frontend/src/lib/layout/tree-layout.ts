// ---------------------------------------------------------------------------
// Reingold-Tilford-style tree layout
//
// Computes (x, y) positions for nodes arranged in a top-down tree.
// Nodes with `positionLocked === true` keep their current position.
// ---------------------------------------------------------------------------

import type { Node, NodeEdge } from '$lib/storage/adapter';

export interface Position {
	x: number;
	y: number;
}

export interface TreeLayoutOptions {
	nodeWidth?: number;
	nodeHeight?: number;
	horizontalGap?: number;
	verticalGap?: number;
}

interface TreeNode {
	id: string;
	children: TreeNode[];
	subtreeWidth: number;
	x: number;
	y: number;
	locked: boolean;
	origX: number;
	origY: number;
}

const DEFAULTS: Required<TreeLayoutOptions> = {
	nodeWidth: 220,
	nodeHeight: 80,
	horizontalGap: 40,
	verticalGap: 60
};

/**
 * Build a map of parentId → childIds from edges.
 * Edges where source is parent and target is child (supports, refines, implements).
 */
function buildChildMap(edges: NodeEdge[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const edge of edges) {
		const children = map.get(edge.sourceId) ?? [];
		children.push(edge.targetId);
		map.set(edge.sourceId, children);
	}
	return map;
}

function buildTree(
	nodeId: string,
	nodeMap: Map<string, Node>,
	childMap: Map<string, string[]>,
	visited: Set<string>
): TreeNode | null {
	if (visited.has(nodeId)) return null;
	visited.add(nodeId);

	const node = nodeMap.get(nodeId);
	if (!node) return null;

	const childIds = childMap.get(nodeId) ?? [];
	const children: TreeNode[] = [];

	for (const childId of childIds) {
		const child = buildTree(childId, nodeMap, childMap, visited);
		if (child) children.push(child);
	}

	return {
		id: nodeId,
		children,
		subtreeWidth: 0,
		x: 0,
		y: 0,
		locked: node.positionLocked === true,
		origX: node.positionX ?? 0,
		origY: node.positionY ?? 0
	};
}

function computeSubtreeWidths(tree: TreeNode, opts: Required<TreeLayoutOptions>): void {
	if (tree.children.length === 0) {
		tree.subtreeWidth = opts.nodeWidth;
		return;
	}

	for (const child of tree.children) {
		computeSubtreeWidths(child, opts);
	}

	const totalChildWidth = tree.children.reduce((sum, c) => sum + c.subtreeWidth, 0);
	const gaps = (tree.children.length - 1) * opts.horizontalGap;
	tree.subtreeWidth = Math.max(opts.nodeWidth, totalChildWidth + gaps);
}

function assignPositions(
	tree: TreeNode,
	x: number,
	y: number,
	opts: Required<TreeLayoutOptions>
): void {
	if (tree.locked) {
		tree.x = tree.origX;
		tree.y = tree.origY;
	} else {
		tree.x = x;
		tree.y = y;
	}

	if (tree.children.length === 0) return;

	const totalChildWidth = tree.children.reduce((sum, c) => sum + c.subtreeWidth, 0);
	const gaps = (tree.children.length - 1) * opts.horizontalGap;
	const totalWidth = totalChildWidth + gaps;

	// Center children under parent
	let childX = tree.x + opts.nodeWidth / 2 - totalWidth / 2;
	const childY = tree.y + opts.nodeHeight + opts.verticalGap;

	for (const child of tree.children) {
		const childCenterX = childX + child.subtreeWidth / 2 - opts.nodeWidth / 2;
		assignPositions(child, childCenterX, childY, opts);
		childX += child.subtreeWidth + opts.horizontalGap;
	}
}

function collectPositions(tree: TreeNode, result: Map<string, Position>): void {
	result.set(tree.id, { x: tree.x, y: tree.y });
	for (const child of tree.children) {
		collectPositions(child, result);
	}
}

/**
 * Compute tree layout positions for all nodes reachable from `rootId`.
 *
 * Nodes with `positionLocked === true` retain their current (positionX, positionY).
 * All other nodes are placed using a Reingold-Tilford-style algorithm.
 */
export function computeTreeLayout(
	nodes: Node[],
	edges: NodeEdge[],
	rootId: string,
	options?: TreeLayoutOptions
): Map<string, Position> {
	const opts = { ...DEFAULTS, ...options };
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const childMap = buildChildMap(edges);

	const tree = buildTree(rootId, nodeMap, childMap, new Set());
	if (!tree) return new Map();

	computeSubtreeWidths(tree, opts);
	assignPositions(tree, 0, 0, opts);

	const result = new Map<string, Position>();
	collectPositions(tree, result);
	return result;
}

/**
 * Find root nodes — nodes that are not the target of any edge.
 */
export function findRootNodes(nodes: Node[], edges: NodeEdge[]): string[] {
	const targetIds = new Set(edges.map((e) => e.targetId));
	return nodes.filter((n) => !targetIds.has(n.id)).map((n) => n.id);
}

/**
 * Compute layout for a forest (multiple roots).
 * Each tree is laid out independently, offset horizontally.
 */
export function computeForestLayout(
	nodes: Node[],
	edges: NodeEdge[],
	options?: TreeLayoutOptions
): Map<string, Position> {
	const opts = { ...DEFAULTS, ...options };
	const roots = findRootNodes(nodes, edges);
	const result = new Map<string, Position>();

	let offsetX = 0;

	for (const rootId of roots) {
		const treePositions = computeTreeLayout(nodes, edges, rootId, opts);

		// Find the bounding box of this tree
		let maxX = 0;
		for (const [id, pos] of treePositions) {
			result.set(id, { x: pos.x + offsetX, y: pos.y });
			maxX = Math.max(maxX, pos.x + opts.nodeWidth);
		}

		offsetX += maxX + opts.horizontalGap * 2;
	}

	// Place orphan nodes (not in any tree) in a row below
	const placed = new Set(result.keys());
	let orphanX = 0;
	const orphanY = -opts.nodeHeight - opts.verticalGap;
	for (const node of nodes) {
		if (!placed.has(node.id)) {
			if (node.positionLocked) {
				result.set(node.id, { x: node.positionX ?? orphanX, y: node.positionY ?? orphanY });
			} else {
				result.set(node.id, { x: orphanX, y: orphanY });
			}
			orphanX += opts.nodeWidth + opts.horizontalGap;
		}
	}

	return result;
}
