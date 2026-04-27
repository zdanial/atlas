import { describe, it, expect } from 'vitest';
import type { Node, NodeEdge } from '$lib/storage/adapter';
import {
	getBlockers,
	getBlocked,
	isUnblocked,
	computeDependencyColumns,
	phaseProgress,
	isPhaseUnlocked,
	getUpstreamChain,
	getDownstreamChain
} from '$lib/dependency-graph';

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
	return {
		id,
		type: 'ticket',
		layer: 1,
		projectId: 'proj-1',
		parentId: null,
		title: id,
		body: null,
		payload: null,
		status: 'draft',
		positionX: null,
		positionY: null,
		positionLocked: false,
		sortOrder: null,
		createdBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

function makeEdge(sourceId: string, targetId: string, relationType = 'blocks'): NodeEdge {
	return {
		id: `${sourceId}->${targetId}`,
		sourceId,
		targetId,
		relationType,
		weight: 1,
		source: 'human',
		createdAt: new Date()
	};
}

describe('getBlockers / getBlocked', () => {
	const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'c')];

	it('returns blockers for a node', () => {
		expect(getBlockers('c', edges).sort()).toEqual(['a', 'b']);
		expect(getBlockers('b', edges)).toEqual(['a']);
		expect(getBlockers('a', edges)).toEqual([]);
	});

	it('returns blocked nodes', () => {
		expect(getBlocked('a', edges).sort()).toEqual(['b', 'c']);
		expect(getBlocked('b', edges)).toEqual(['c']);
		expect(getBlocked('c', edges)).toEqual([]);
	});

	it('ignores non-blocks edges', () => {
		const mixed = [makeEdge('a', 'b', 'supports'), makeEdge('a', 'c')];
		expect(getBlockers('b', mixed)).toEqual([]);
		expect(getBlockers('c', mixed)).toEqual(['a']);
	});
});

describe('isUnblocked', () => {
	it('returns true when no blockers', () => {
		const nodes = [makeNode('a')];
		expect(isUnblocked('a', [], nodes)).toBe(true);
	});

	it('returns true when all blockers are done', () => {
		const nodes = [makeNode('a', { status: 'done' }), makeNode('b')];
		const edges = [makeEdge('a', 'b')];
		expect(isUnblocked('b', edges, nodes)).toBe(true);
	});

	it('returns false when a blocker is not done', () => {
		const nodes = [makeNode('a', { status: 'active' }), makeNode('b')];
		const edges = [makeEdge('a', 'b')];
		expect(isUnblocked('b', edges, nodes)).toBe(false);
	});
});

describe('computeDependencyColumns', () => {
	it('assigns column 0 to nodes with no blockers', () => {
		const nodes = [makeNode('a'), makeNode('b')];
		const cols = computeDependencyColumns(nodes, []);
		expect(cols.get('a')).toBe(0);
		expect(cols.get('b')).toBe(0);
	});

	it('assigns increasing columns based on dependency depth', () => {
		// a -> b -> c (linear chain)
		const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
		const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
		const cols = computeDependencyColumns(nodes, edges);
		expect(cols.get('a')).toBe(0);
		expect(cols.get('b')).toBe(1);
		expect(cols.get('c')).toBe(2);
	});

	it('handles fan-in pattern', () => {
		// a, b both block c
		const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
		const edges = [makeEdge('a', 'c'), makeEdge('b', 'c')];
		const cols = computeDependencyColumns(nodes, edges);
		expect(cols.get('a')).toBe(0);
		expect(cols.get('b')).toBe(0);
		expect(cols.get('c')).toBe(1);
	});

	it('handles diamond pattern', () => {
		// a -> b, a -> c, b -> d, c -> d
		const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
		const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd'), makeEdge('c', 'd')];
		const cols = computeDependencyColumns(nodes, edges);
		expect(cols.get('a')).toBe(0);
		expect(cols.get('b')).toBe(1);
		expect(cols.get('c')).toBe(1);
		expect(cols.get('d')).toBe(2);
	});

	it('ignores edges to nodes not in the set', () => {
		const nodes = [makeNode('b'), makeNode('c')];
		const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]; // 'a' not in nodes
		const cols = computeDependencyColumns(nodes, edges);
		expect(cols.get('b')).toBe(0);
		expect(cols.get('c')).toBe(1);
	});
});

describe('phaseProgress', () => {
	it('counts done vs total children', () => {
		const nodes = [
			makeNode('phase', { type: 'phase', layer: 2 }),
			makeNode('t1', { parentId: 'phase', status: 'done' }),
			makeNode('t2', { parentId: 'phase', status: 'active' }),
			makeNode('t3', { parentId: 'phase', status: 'draft' })
		];
		expect(phaseProgress('phase', nodes)).toEqual({ done: 1, total: 3 });
	});

	it('returns zero for phase with no children', () => {
		const nodes = [makeNode('phase')];
		expect(phaseProgress('phase', nodes)).toEqual({ done: 0, total: 0 });
	});
});

describe('isPhaseUnlocked', () => {
	it('returns true when blocking phases are done', () => {
		const nodes = [
			makeNode('p1', { type: 'phase', status: 'done' }),
			makeNode('p2', { type: 'phase', status: 'draft' })
		];
		const edges = [makeEdge('p1', 'p2')];
		expect(isPhaseUnlocked('p2', edges, nodes)).toBe(true);
	});

	it('returns false when blocking phase is not done', () => {
		const nodes = [
			makeNode('p1', { type: 'phase', status: 'active' }),
			makeNode('p2', { type: 'phase', status: 'draft' })
		];
		const edges = [makeEdge('p1', 'p2')];
		expect(isPhaseUnlocked('p2', edges, nodes)).toBe(false);
	});
});

describe('getUpstreamChain / getDownstreamChain', () => {
	// a -> b -> c -> d, a -> c
	const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'd'), makeEdge('a', 'c')];

	it('returns full upstream chain', () => {
		const chain = getUpstreamChain('d', edges);
		expect(chain).toEqual(new Set(['a', 'b', 'c']));
	});

	it('returns full downstream chain', () => {
		const chain = getDownstreamChain('a', edges);
		expect(chain).toEqual(new Set(['b', 'c', 'd']));
	});

	it('returns empty set for root/leaf', () => {
		expect(getUpstreamChain('a', edges).size).toBe(0);
		expect(getDownstreamChain('d', edges).size).toBe(0);
	});
});
