import { SvelteMap } from 'svelte/reactivity';
import type {
	Node,
	CreateNode,
	NodeFilter,
	NodeEdge,
	CreateEdge,
	StorageAdapter
} from '$lib/storage/adapter';
import {
	createNodeSchema,
	updateNodeSchema,
	createEdgeSchema,
	type UpdateNodeInput,
	type NodeType,
	validatePayload
} from '$lib/schemas/node';

// ---------------------------------------------------------------------------
// Store state (Svelte 5 runes — must be used in a component or $effect scope)
// ---------------------------------------------------------------------------

/** All nodes indexed by id. SvelteMap so .set()/.delete() are reactive. */
let nodeMap = new SvelteMap<string, Node>();

/** All edges indexed by id. SvelteMap so .set()/.delete() are reactive. */
let edgeMap = new SvelteMap<string, NodeEdge>();

/** Current project filter. */
let currentProjectId = $state<string | null>(null);

/** Active storage adapter. */
let storage: StorageAdapter | null = null;

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** All nodes for the current project (private derived, exposed via getter). */
const _projectNodes = $derived(
	currentProjectId
		? Array.from(nodeMap.values()).filter((n) => n.projectId === currentProjectId)
		: Array.from(nodeMap.values())
);

/** All nodes for the current project. */
export function getProjectNodes(): Node[] {
	return _projectNodes;
}

/** Nodes filtered by type. */
export function nodesByType(type: NodeType): Node[] {
	return _projectNodes.filter((n) => n.type === type);
}

/** Nodes filtered by layer. */
export function nodesByLayer(layer: number): Node[] {
	return _projectNodes.filter((n) => n.layer === layer);
}

/** Nodes filtered by status. */
export function nodesByStatus(status: string): Node[] {
	return _projectNodes.filter((n) => n.status === status);
}

/** Get a single node by id. */
export function getNode(id: string): Node | undefined {
	return nodeMap.get(id);
}

/** All edges as array (private derived, exposed via getter). */
const _allEdges = $derived(Array.from(edgeMap.values()));

/** All edges as array. */
export function getAllEdges(): NodeEdge[] {
	return _allEdges;
}

/** Edges for a specific node. */
export function edgesForNode(nodeId: string): NodeEdge[] {
	return _allEdges.filter((e) => e.sourceId === nodeId || e.targetId === nodeId);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Bind storage adapter and optionally load a project's nodes. */
export async function initStore(adapter: StorageAdapter, projectId?: string) {
	storage = adapter;
	if (projectId) {
		currentProjectId = projectId;
		await loadNodes({ projectId });
	}
}

/** Load nodes matching a filter into the store. */
export async function loadNodes(filter: NodeFilter) {
	if (!storage) throw new Error('Store not initialized — call initStore first');
	const nodes = await storage.listNodes(filter);
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}
}

/** Set the active project and reload nodes. */
export async function setProject(projectId: string) {
	currentProjectId = projectId;
	await loadNodes({ projectId });
}

// ---------------------------------------------------------------------------
// CRUD — optimistic updates
// ---------------------------------------------------------------------------

/** Create a node. Validates input via Zod, writes to store optimistically, persists to storage. */
export async function createNode(input: CreateNode): Promise<Node> {
	if (!storage) throw new Error('Store not initialized');

	// Validate base fields
	createNodeSchema.parse(input);

	// Validate type-specific payload if present
	if (input.payload) {
		validatePayload(input.type as NodeType, input.payload);
	}

	const node = await storage.createNode(input);
	nodeMap.set(node.id, node);
	return node;
}

/** Update a node. Optimistically patches the store, then persists. */
export async function updateNode(id: string, patch: UpdateNodeInput): Promise<Node> {
	if (!storage) throw new Error('Store not initialized');

	updateNodeSchema.parse(patch);

	// Optimistic: apply patch immediately
	const existing = nodeMap.get(id);
	if (existing) {
		nodeMap.set(id, { ...existing, ...patch, updatedAt: new Date() } as Node);
	}

	try {
		const updated = await storage.updateNode(id, patch);
		nodeMap.set(id, updated);
		return updated;
	} catch (err) {
		// Rollback on failure
		if (existing) {
			nodeMap.set(id, existing);
		} else {
			nodeMap.delete(id);
		}
		throw err;
	}
}

/** Delete a node. Optimistically removes from store, then persists. */
export async function deleteNode(id: string): Promise<void> {
	if (!storage) throw new Error('Store not initialized');

	const existing = nodeMap.get(id);
	nodeMap.delete(id);

	try {
		await storage.deleteNode(id);
	} catch (err) {
		// Rollback
		if (existing) {
			nodeMap.set(id, existing);
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Edge CRUD
// ---------------------------------------------------------------------------

/** Create an edge between two nodes. */
export async function createEdge(input: CreateEdge): Promise<NodeEdge> {
	if (!storage) throw new Error('Store not initialized');
	createEdgeSchema.parse(input);
	const edge = await storage.createEdge(input);
	edgeMap.set(edge.id, edge);
	return edge;
}

/** Delete an edge. */
export async function deleteEdge(id: string): Promise<void> {
	if (!storage) throw new Error('Store not initialized');
	const existing = edgeMap.get(id);
	edgeMap.delete(id);
	try {
		await storage.deleteEdge(id);
	} catch (err) {
		if (existing) edgeMap.set(id, existing);
		throw err;
	}
}

/** Load edges for a node. */
export async function loadEdges(nodeId: string): Promise<NodeEdge[]> {
	if (!storage) throw new Error('Store not initialized');
	const edges = await storage.getEdges(nodeId);
	for (const edge of edges) {
		edgeMap.set(edge.id, edge);
	}
	return edges;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Clear all state (useful for tests or switching workspaces). */
export function resetStore() {
	nodeMap.clear();
	edgeMap.clear();
	currentProjectId = null;
	storage = null;
}
