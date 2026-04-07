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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert snake_case API response to camelCase frontend model. */
function toNode(raw: Record<string, unknown>): Node {
	return {
		id: raw.id as string,
		type: raw.type as string,
		layer: raw.layer as number,
		projectId: raw.project_id as string,
		parentId: (raw.parent_id as string) ?? null,
		title: raw.title as string,
		body: (raw.body as Record<string, unknown>) ?? null,
		payload: (raw.payload as Record<string, unknown>) ?? null,
		status: (raw.status as string) ?? 'active',
		positionX: (raw.position_x as number) ?? null,
		positionY: (raw.position_y as number) ?? null,
		createdBy: (raw.created_by as string) ?? null,
		createdAt: new Date(raw.created_at as string),
		updatedAt: new Date(raw.updated_at as string)
	};
}

function toEdge(raw: Record<string, unknown>): NodeEdge {
	return {
		id: raw.id as string,
		sourceId: raw.source_id as string,
		targetId: raw.target_id as string,
		relationType: raw.relation_type as string,
		weight: (raw.weight as number) ?? 1.0,
		source: (raw.source as string) ?? 'human',
		createdAt: new Date(raw.created_at as string)
	};
}

function toVersion(raw: Record<string, unknown>): NodeVersion {
	return {
		id: raw.id as string,
		nodeId: raw.node_id as string,
		version: raw.version as number,
		body: (raw.body as Record<string, unknown>) ?? null,
		payload: (raw.payload as Record<string, unknown>) ?? null,
		diffSummary: (raw.diff_summary as string) ?? null,
		author: (raw.author as string) ?? null,
		createdAt: new Date(raw.created_at as string)
	};
}

function toAgentRun(raw: Record<string, unknown>): AgentRun {
	return {
		id: raw.id as string,
		agent: raw.agent as string,
		layer: (raw.layer as number) ?? null,
		input: (raw.input as Record<string, unknown>) ?? null,
		output: (raw.output as Record<string, unknown>) ?? null,
		model: (raw.model as string) ?? null,
		tokens: (raw.tokens as number) ?? null,
		cost: (raw.cost as number) ?? null,
		createdAt: new Date(raw.created_at as string)
	};
}

/** Convert camelCase CreateNode to snake_case for the API. */
function toCreateBody(input: CreateNode): Record<string, unknown> {
	return {
		type: input.type,
		layer: input.layer,
		project_id: input.projectId,
		parent_id: input.parentId ?? null,
		title: input.title,
		body: input.body ?? null,
		payload: input.payload ?? null,
		status: input.status ?? null,
		position_x: input.positionX ?? null,
		position_y: input.positionY ?? null
	};
}

function toUpdateBody(patch: Partial<Node>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (patch.type !== undefined) body.type = patch.type;
	if (patch.title !== undefined) body.title = patch.title;
	if (patch.body !== undefined) body.body = patch.body;
	if (patch.payload !== undefined) body.payload = patch.payload;
	if (patch.status !== undefined) body.status = patch.status;
	if (patch.positionX !== undefined) body.position_x = patch.positionX;
	if (patch.positionY !== undefined) body.position_y = patch.positionY;
	if (patch.parentId !== undefined) body.parent_id = patch.parentId;
	return body;
}

function toCreateEdgeBody(input: CreateEdge): Record<string, unknown> {
	return {
		source_id: input.sourceId,
		target_id: input.targetId,
		relation_type: input.relationType,
		weight: input.weight ?? null,
		source: input.source ?? null
	};
}

// ---------------------------------------------------------------------------
// ApiAdapter
// ---------------------------------------------------------------------------

export class ApiAdapter implements StorageAdapter {
	private baseUrl: string;

	constructor(baseUrl: string) {
		// Strip trailing slash
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	private async request<T>(path: string, options?: RequestInit): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const res = await fetch(url, {
			headers: { 'Content-Type': 'application/json' },
			...options
		});

		if (!res.ok) {
			const errorBody = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error((errorBody as Record<string, string>).error ?? `HTTP ${res.status}`);
		}

		// 204 No Content
		if (res.status === 204) return undefined as T;

		return res.json() as Promise<T>;
	}

	// -------------------------------------------------------------------------
	// Node CRUD
	// -------------------------------------------------------------------------

	async getNode(id: string): Promise<Node | null> {
		try {
			const data = await this.request<{ node: Record<string, unknown> }>(`/api/nodes/${id}`);
			return toNode(data.node);
		} catch (err) {
			if (err instanceof Error && err.message.includes('not found')) return null;
			throw err;
		}
	}

	async listNodes(filter: NodeFilter): Promise<Node[]> {
		const params = new URLSearchParams();
		if (filter.projectId) params.set('project_id', filter.projectId);
		if (filter.type) params.set('type', filter.type);
		if (filter.layer !== undefined) params.set('layer', String(filter.layer));
		if (filter.status) params.set('status', filter.status);
		if (filter.parentId !== undefined && filter.parentId !== null)
			params.set('parent_id', filter.parentId);

		const qs = params.toString();
		const data = await this.request<{ nodes: Record<string, unknown>[] }>(
			`/api/nodes${qs ? `?${qs}` : ''}`
		);
		return data.nodes.map(toNode);
	}

	async createNode(input: CreateNode): Promise<Node> {
		const data = await this.request<{ node: Record<string, unknown> }>('/api/nodes', {
			method: 'POST',
			body: JSON.stringify(toCreateBody(input))
		});
		return toNode(data.node);
	}

	async updateNode(id: string, patch: Partial<Node>): Promise<Node> {
		const data = await this.request<{ node: Record<string, unknown> }>(`/api/nodes/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(toUpdateBody(patch))
		});
		return toNode(data.node);
	}

	async deleteNode(id: string): Promise<void> {
		await this.request<void>(`/api/nodes/${id}`, { method: 'DELETE' });
	}

	// -------------------------------------------------------------------------
	// Edges
	// -------------------------------------------------------------------------

	async getEdges(nodeId: string): Promise<NodeEdge[]> {
		const data = await this.request<{ edges: Record<string, unknown>[] }>(
			`/api/nodes/${nodeId}/edges`
		);
		return data.edges.map(toEdge);
	}

	async createEdge(input: CreateEdge): Promise<NodeEdge> {
		// Use the sourceId node's endpoint for creation
		const data = await this.request<{ edge: Record<string, unknown> }>(
			`/api/nodes/${input.sourceId}/edges`,
			{ method: 'POST', body: JSON.stringify(toCreateEdgeBody(input)) }
		);
		return toEdge(data.edge);
	}

	async deleteEdge(id: string): Promise<void> {
		await this.request<void>(`/api/edges/${id}`, { method: 'DELETE' });
	}

	// -------------------------------------------------------------------------
	// Versions
	// -------------------------------------------------------------------------

	async getVersions(nodeId: string): Promise<NodeVersion[]> {
		const data = await this.request<{ versions: Record<string, unknown>[] }>(
			`/api/nodes/${nodeId}/versions`
		);
		return data.versions.map(toVersion);
	}

	// -------------------------------------------------------------------------
	// Agent runs
	// -------------------------------------------------------------------------

	async logAgentRun(input: CreateAgentRun): Promise<AgentRun> {
		const data = await this.request<{ agent_run: Record<string, unknown> }>('/api/agent-runs', {
			method: 'POST',
			body: JSON.stringify({
				agent: input.agent,
				layer: input.layer ?? null,
				input: input.input ?? null,
				output: input.output ?? null,
				model: input.model ?? null,
				tokens: input.tokens ?? null,
				cost: input.cost ?? null
			})
		});
		return toAgentRun(data.agent_run);
	}

	// -------------------------------------------------------------------------
	// Search
	// -------------------------------------------------------------------------

	async searchNodes(query: string, filter?: NodeFilter): Promise<Node[]> {
		const params = new URLSearchParams({ q: query });
		if (filter?.projectId) params.set('project_id', filter.projectId);
		if (filter?.type) params.set('type', filter.type);
		if (filter?.layer !== undefined) params.set('layer', String(filter.layer));
		if (filter?.status) params.set('status', filter.status);

		const data = await this.request<{ nodes: Record<string, unknown>[] }>(
			`/api/nodes/search?${params}`
		);
		return data.nodes.map(toNode);
	}

	// -------------------------------------------------------------------------
	// Sync (not applicable for server mode — return empty)
	// -------------------------------------------------------------------------

	async getPendingChanges(): Promise<Change[]> {
		return [];
	}

	async markSynced(_changeIds: string[]): Promise<void> {
		// No-op in server mode — server is the source of truth
	}
}
