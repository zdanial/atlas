import { describe, it, expect } from 'vitest';
import type { StorageAdapter, CreateNode, NodeFilter } from './adapter';

// Test the adapter interface contract with a mock implementation
class MockAdapter implements StorageAdapter {
	private nodes: Map<string, any> = new Map();

	async getNode(id: string) {
		return this.nodes.get(id) ?? null;
	}
	async listNodes(_filter: NodeFilter) {
		return Array.from(this.nodes.values());
	}
	async createNode(input: CreateNode) {
		const node = {
			id: crypto.randomUUID(),
			...input,
			parentId: input.parentId ?? null,
			body: input.body ?? null,
			payload: input.payload ?? null,
			status: input.status ?? 'active',
			positionX: input.positionX ?? null,
			positionY: input.positionY ?? null,
			createdBy: null,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		this.nodes.set(node.id, node);
		return node;
	}
	async updateNode(id: string, patch: any) {
		const existing = this.nodes.get(id);
		if (!existing) throw new Error('Not found');
		const updated = { ...existing, ...patch, updatedAt: new Date() };
		this.nodes.set(id, updated);
		return updated;
	}
	async deleteNode(id: string) {
		this.nodes.delete(id);
	}
	async getEdges() {
		return [];
	}
	async createEdge(input: any) {
		return {
			id: crypto.randomUUID(),
			...input,
			weight: input.weight ?? 1.0,
			source: input.source ?? 'human',
			createdAt: new Date()
		};
	}
	async deleteEdge() {}
	async getVersions() {
		return [];
	}
	async logAgentRun(input: any) {
		return { id: crypto.randomUUID(), ...input, createdAt: new Date() };
	}
	async searchNodes() {
		return [];
	}
	async getPendingChanges() {
		return [];
	}
	async markSynced() {}
}

describe('StorageAdapter', () => {
	it('creates and retrieves a node', async () => {
		const adapter: StorageAdapter = new MockAdapter();
		const created = await adapter.createNode({
			type: 'idea',
			layer: 5,
			projectId: 'test-project',
			title: 'Test idea'
		});

		expect(created.id).toBeDefined();
		expect(created.title).toBe('Test idea');
		expect(created.type).toBe('idea');
		expect(created.layer).toBe(5);
		expect(created.status).toBe('active');

		const retrieved = await adapter.getNode(created.id);
		expect(retrieved).not.toBeNull();
		expect(retrieved!.title).toBe('Test idea');
	});

	it('updates a node', async () => {
		const adapter: StorageAdapter = new MockAdapter();
		const created = await adapter.createNode({
			type: 'note',
			layer: 5,
			projectId: 'test-project',
			title: 'Original title'
		});

		const updated = await adapter.updateNode(created.id, { title: 'Updated title' });
		expect(updated.title).toBe('Updated title');
	});

	it('deletes a node', async () => {
		const adapter: StorageAdapter = new MockAdapter();
		const created = await adapter.createNode({
			type: 'note',
			layer: 5,
			projectId: 'test-project',
			title: 'To be deleted'
		});

		await adapter.deleteNode(created.id);
		const result = await adapter.getNode(created.id);
		expect(result).toBeNull();
	});

	it('lists nodes', async () => {
		const adapter: StorageAdapter = new MockAdapter();
		await adapter.createNode({ type: 'idea', layer: 5, projectId: 'p1', title: 'Idea 1' });
		await adapter.createNode({ type: 'goal', layer: 4, projectId: 'p1', title: 'Goal 1' });

		const nodes = await adapter.listNodes({ projectId: 'p1' });
		expect(nodes).toHaveLength(2);
	});
});
