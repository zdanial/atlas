import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type {
	StorageAdapter,
	Node,
	CreateNode,
	NodeEdge,
	CreateEdge,
	NodeVersion,
	AgentRun,
	CreateAgentRun,
	NodeFilter,
	Change
} from './adapter';

class ButterflyDatabase extends Dexie {
	nodes!: Table<Node, string>;
	nodeEdges!: Table<NodeEdge, string>;
	nodeVersions!: Table<NodeVersion, string>;
	agentRuns!: Table<AgentRun, string>;
	changes!: Table<Change, string>;

	constructor() {
		super('butterfly');
		this.version(1).stores({
			nodes: 'id, type, layer, projectId, parentId, status',
			nodeEdges: 'id, sourceId, targetId, relationType',
			nodeVersions: 'id, nodeId, version',
			agentRuns: 'id, agent, createdAt',
			changes: 'id, entityType, entityId, timestamp'
		});
		this.version(2)
			.stores({
				nodes: 'id, type, layer, projectId, parentId, status, sortOrder',
				nodeEdges: 'id, sourceId, targetId, relationType',
				nodeVersions: 'id, nodeId, version',
				agentRuns: 'id, agent, createdAt',
				changes: 'id, entityType, entityId, timestamp'
			})
			.upgrade((tx) => {
				return tx
					.table('nodes')
					.toCollection()
					.modify((node) => {
						if (node.sortOrder === undefined) {
							node.sortOrder = node.createdAt?.getTime?.() ?? Date.now();
						}
					});
			});
	}
}

export class IndexedDBAdapter implements StorageAdapter {
	private db: ButterflyDatabase;

	constructor() {
		this.db = new ButterflyDatabase();
	}

	async getNode(id: string): Promise<Node | null> {
		return (await this.db.nodes.get(id)) ?? null;
	}

	async listNodes(filter: NodeFilter): Promise<Node[]> {
		let collection = this.db.nodes.toCollection();

		if (filter.projectId) {
			collection = this.db.nodes.where('projectId').equals(filter.projectId);
		}

		let results = await collection.toArray();

		if (filter.type) {
			results = results.filter((n) => n.type === filter.type);
		}
		if (filter.layer !== undefined) {
			results = results.filter((n) => n.layer === filter.layer);
		}
		if (filter.status) {
			results = results.filter((n) => n.status === filter.status);
		}

		return results;
	}

	async createNode(input: CreateNode): Promise<Node> {
		const now = new Date();
		const node: Node = {
			id: uuidv4(),
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
			positionLocked: false,
			sortOrder: input.sortOrder ?? Date.now(),
			createdBy: null,
			createdAt: now,
			updatedAt: now
		};

		await this.db.nodes.add(node);
		return node;
	}

	async updateNode(id: string, patch: Partial<Node>): Promise<Node> {
		await this.db.nodes.update(id, { ...patch, updatedAt: new Date() });
		const node = await this.db.nodes.get(id);
		if (!node) throw new Error(`Node ${id} not found`);
		return node;
	}

	async deleteNode(id: string): Promise<void> {
		await this.db.nodes.delete(id);
	}

	async getEdges(nodeId: string): Promise<NodeEdge[]> {
		const asSource = await this.db.nodeEdges.where('sourceId').equals(nodeId).toArray();
		const asTarget = await this.db.nodeEdges.where('targetId').equals(nodeId).toArray();
		return [...asSource, ...asTarget];
	}

	async createEdge(input: CreateEdge): Promise<NodeEdge> {
		const edge: NodeEdge = {
			id: uuidv4(),
			sourceId: input.sourceId,
			targetId: input.targetId,
			relationType: input.relationType,
			weight: input.weight ?? 1.0,
			source: input.source ?? 'human',
			createdAt: new Date()
		};

		await this.db.nodeEdges.add(edge);
		return edge;
	}

	async deleteEdge(id: string): Promise<void> {
		await this.db.nodeEdges.delete(id);
	}

	async getVersions(nodeId: string): Promise<NodeVersion[]> {
		return this.db.nodeVersions.where('nodeId').equals(nodeId).sortBy('version');
	}

	async logAgentRun(input: CreateAgentRun): Promise<AgentRun> {
		const run: AgentRun = {
			id: uuidv4(),
			agent: input.agent,
			layer: input.layer ?? null,
			input: input.input ?? null,
			output: input.output ?? null,
			model: input.model ?? null,
			tokens: input.tokens ?? null,
			cost: input.cost ?? null,
			createdAt: new Date()
		};

		await this.db.agentRuns.add(run);
		return run;
	}

	async searchNodes(query: string, filter?: NodeFilter): Promise<Node[]> {
		const lowerQuery = query.toLowerCase();
		let nodes = await this.listNodes(filter ?? {});
		return nodes.filter((n) => n.title.toLowerCase().includes(lowerQuery));
	}

	async getPendingChanges(): Promise<Change[]> {
		return this.db.changes.toArray();
	}

	async markSynced(changeIds: string[]): Promise<void> {
		await this.db.changes.bulkDelete(changeIds);
	}
}
