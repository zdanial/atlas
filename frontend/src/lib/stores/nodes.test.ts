import { describe, it, expect, beforeEach } from 'vitest';
import type {
	StorageAdapter,
	Node,
	CreateNode,
	NodeEdge,
	CreateEdge,
	NodeFilter
} from '$lib/storage/adapter';
import {
	createNodeSchema,
	updateNodeSchema,
	createEdgeSchema,
	validatePayload
} from '$lib/schemas/node';

// In-memory adapter that mimics IndexedDBAdapter behavior
class InMemoryAdapter implements StorageAdapter {
	nodes = new Map<string, Node>();
	edges = new Map<string, NodeEdge>();
	private counter = 0;

	async getNode(id: string) {
		return this.nodes.get(id) ?? null;
	}

	async listNodes(filter: NodeFilter) {
		let arr = Array.from(this.nodes.values());
		if (filter.projectId) arr = arr.filter((n) => n.projectId === filter.projectId);
		if (filter.type) arr = arr.filter((n) => n.type === filter.type);
		if (filter.layer !== undefined) arr = arr.filter((n) => n.layer === filter.layer);
		if (filter.status) arr = arr.filter((n) => n.status === filter.status);
		return arr;
	}

	async createNode(input: CreateNode): Promise<Node> {
		const now = new Date();
		const node: Node = {
			id: crypto.randomUUID(),
			type: input.type,
			layer: input.layer,
			projectId: input.projectId,
			parentId: input.parentId ?? null,
			title: input.title,
			body: input.body ?? null,
			payload: input.payload ?? null,
			status: input.status ?? 'active',
			positionX: input.positionX ?? null,
			positionY: input.positionY ?? null,
			createdBy: null,
			createdAt: now,
			updatedAt: now
		};
		this.nodes.set(node.id, node);
		return node;
	}

	async updateNode(id: string, patch: Partial<Node>): Promise<Node> {
		const existing = this.nodes.get(id);
		if (!existing) throw new Error(`Node ${id} not found`);
		const updated = { ...existing, ...patch, updatedAt: new Date() };
		this.nodes.set(id, updated);
		return updated;
	}

	async deleteNode(id: string) {
		this.nodes.delete(id);
	}

	async getEdges(nodeId: string) {
		return Array.from(this.edges.values()).filter(
			(e) => e.sourceId === nodeId || e.targetId === nodeId
		);
	}

	async createEdge(input: CreateEdge): Promise<NodeEdge> {
		const edge: NodeEdge = {
			id: crypto.randomUUID(),
			sourceId: input.sourceId,
			targetId: input.targetId,
			relationType: input.relationType,
			weight: input.weight ?? 1.0,
			source: input.source ?? 'human',
			createdAt: new Date()
		};
		this.edges.set(edge.id, edge);
		return edge;
	}

	async deleteEdge(id: string) {
		this.edges.delete(id);
	}

	async getVersions() {
		return [];
	}
	async logAgentRun(input: any) {
		return { id: `run-${++this.counter}`, ...input, createdAt: new Date() } as any;
	}
	async searchNodes() {
		return [];
	}
	async getPendingChanges() {
		return [];
	}
	async markSynced() {}
}

// Since Svelte 5 runes ($state, $derived) are compiler features that don't work
// in plain .ts test files, we test the validation + adapter pipeline that the
// store module orchestrates.

describe('Node store integration (schema + adapter)', () => {
	let adapter: InMemoryAdapter;
	const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

	beforeEach(() => {
		adapter = new InMemoryAdapter();
	});

	it('creates a node after validation', async () => {
		const input = {
			type: 'idea' as const,
			layer: 5,
			projectId: PROJECT_ID,
			title: 'My idea'
		};
		createNodeSchema.parse(input);
		const node = await adapter.createNode(input);
		expect(node.id).toBeDefined();
		expect(node.title).toBe('My idea');
		expect(node.status).toBe('active');
	});

	it('rejects creation with invalid schema', () => {
		expect(() =>
			createNodeSchema.parse({
				type: 'invalid',
				layer: 99,
				projectId: 'not-uuid',
				title: ''
			})
		).toThrow();
	});

	it('validates payload before creating', () => {
		expect(() => validatePayload('note', { tags: ['ok'] })).not.toThrow();
		expect(() => validatePayload('note', { tags: 'not-array' })).toThrow();
	});

	it('updates a node after validation', async () => {
		const node = await adapter.createNode({
			type: 'note',
			layer: 5,
			projectId: PROJECT_ID,
			title: 'Original'
		});

		const patch = { title: 'Updated' };
		updateNodeSchema.parse(patch);
		const updated = await adapter.updateNode(node.id, patch);
		expect(updated.title).toBe('Updated');
	});

	it('deletes a node', async () => {
		const node = await adapter.createNode({
			type: 'note',
			layer: 5,
			projectId: PROJECT_ID,
			title: 'To delete'
		});

		await adapter.deleteNode(node.id);
		const result = await adapter.getNode(node.id);
		expect(result).toBeNull();
	});

	it('lists nodes with filters', async () => {
		await adapter.createNode({ type: 'idea', layer: 5, projectId: PROJECT_ID, title: 'Idea 1' });
		await adapter.createNode({ type: 'goal', layer: 4, projectId: PROJECT_ID, title: 'Goal 1' });
		await adapter.createNode({
			type: 'idea',
			layer: 5,
			projectId: '660e8400-e29b-41d4-a716-446655440000',
			title: 'Idea 2'
		});

		const ideas = await adapter.listNodes({ projectId: PROJECT_ID, type: 'idea' });
		expect(ideas).toHaveLength(1);
		expect(ideas[0].title).toBe('Idea 1');

		const allProject = await adapter.listNodes({ projectId: PROJECT_ID });
		expect(allProject).toHaveLength(2);
	});

	it('creates and retrieves edges', async () => {
		const n1 = await adapter.createNode({
			type: 'idea',
			layer: 5,
			projectId: PROJECT_ID,
			title: 'A'
		});
		const n2 = await adapter.createNode({
			type: 'goal',
			layer: 4,
			projectId: PROJECT_ID,
			title: 'B'
		});

		const edgeInput = {
			sourceId: n1.id,
			targetId: n2.id,
			relationType: 'supports' as const
		};
		createEdgeSchema.parse(edgeInput);
		const edge = await adapter.createEdge(edgeInput);
		expect(edge.relationType).toBe('supports');

		const edges = await adapter.getEdges(n1.id);
		expect(edges).toHaveLength(1);
	});

	it('deletes an edge', async () => {
		const n1 = await adapter.createNode({
			type: 'idea',
			layer: 5,
			projectId: PROJECT_ID,
			title: 'A'
		});
		const n2 = await adapter.createNode({
			type: 'idea',
			layer: 5,
			projectId: PROJECT_ID,
			title: 'B'
		});
		const edge = await adapter.createEdge({
			sourceId: n1.id,
			targetId: n2.id,
			relationType: 'blocks'
		});

		await adapter.deleteEdge(edge.id);
		const edges = await adapter.getEdges(n1.id);
		expect(edges).toHaveLength(0);
	});

	it('persists payload data across reads', async () => {
		const node = await adapter.createNode({
			type: 'ticket',
			layer: 1,
			projectId: PROJECT_ID,
			title: 'Implement login',
			payload: {
				intent: 'Add login page',
				filePaths: [],
				acceptanceCriteria: ['User can log in'],
				promptPayload: 'Create login'
			}
		});

		const retrieved = await adapter.getNode(node.id);
		expect(retrieved).not.toBeNull();
		expect(retrieved!.title).toBe('Implement login');
		expect(retrieved!.payload).toEqual({
			intent: 'Add login page',
			filePaths: [],
			acceptanceCriteria: ['User can log in'],
			promptPayload: 'Create login'
		});
	});

	it('validates ticket payload with schema', () => {
		const valid = {
			intent: 'Add login',
			filePaths: [{ repoId: '550e8400-e29b-41d4-a716-446655440000', path: 'src/login.svelte' }],
			acceptanceCriteria: ['Works'],
			promptPayload: 'Do the thing'
		};
		expect(() => validatePayload('ticket', valid)).not.toThrow();

		expect(() => validatePayload('ticket', { intent: 123 })).toThrow();
	});

	it('rejects edge with invalid relation type via schema', () => {
		expect(() =>
			createEdgeSchema.parse({
				sourceId: '550e8400-e29b-41d4-a716-446655440000',
				targetId: '660e8400-e29b-41d4-a716-446655440000',
				relationType: 'invalid'
			})
		).toThrow();
	});
});
