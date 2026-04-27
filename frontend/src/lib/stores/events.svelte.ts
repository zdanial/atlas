// ---------------------------------------------------------------------------
// Event Sourcing Store (WP-15)
// ---------------------------------------------------------------------------

import type { Node, NodeEdge } from '$lib/storage/adapter';

export interface ButterflyEvent {
	id: string;
	projectId: string;
	timestamp: Date;
	eventType: string;
	entityType: 'node' | 'edge';
	entityId: string;
	beforeState: Record<string, unknown> | null;
	afterState: Record<string, unknown> | null;
	actor: string | null;
	metadata: Record<string, unknown> | null;
}

export interface GraphState {
	nodes: Map<string, Node>;
	edges: Map<string, NodeEdge>;
	timestamp: Date;
}

export interface Snapshot {
	id: string;
	projectId: string;
	timestamp: Date;
	nodes: Node[];
	edges: NodeEdge[];
}

// Event types
export const EVENT_TYPES = {
	NODE_CREATED: 'node.created',
	NODE_UPDATED: 'node.updated',
	NODE_DELETED: 'node.deleted',
	NODE_RECLASSIFIED: 'node.reclassified',
	EDGE_CREATED: 'edge.created',
	EDGE_DELETED: 'edge.deleted'
} as const;

// In-memory event log for Mode A (IndexedDB)
let events = $state<ButterflyEvent[]>([]);
let snapshots = $state<Snapshot[]>([]);
let eventCounter = 0;

const SNAPSHOT_INTERVAL = 100; // Create snapshot every 100 events

export function recordEvent(
	projectId: string,
	eventType: string,
	entityType: 'node' | 'edge',
	entityId: string,
	beforeState: Record<string, unknown> | null,
	afterState: Record<string, unknown> | null,
	actor?: string
): ButterflyEvent {
	const event: ButterflyEvent = {
		id: crypto.randomUUID(),
		projectId,
		timestamp: new Date(),
		eventType,
		entityType,
		entityId,
		beforeState,
		afterState,
		actor: actor ?? null,
		metadata: null
	};
	events = [...events, event];
	eventCounter++;
	return event;
}

export function getEvents(projectId: string, from?: Date, to?: Date): ButterflyEvent[] {
	return events.filter((e) => {
		if (e.projectId !== projectId) return false;
		if (from && e.timestamp < from) return false;
		if (to && e.timestamp > to) return false;
		return true;
	});
}

export function getEventCount(): number {
	return events.length;
}

export function shouldCreateSnapshot(): boolean {
	return eventCounter >= SNAPSHOT_INTERVAL;
}

export function createSnapshot(projectId: string, nodes: Node[], edges: NodeEdge[]): Snapshot {
	const snapshot: Snapshot = {
		id: crypto.randomUUID(),
		projectId,
		timestamp: new Date(),
		nodes: [...nodes],
		edges: [...edges]
	};
	snapshots = [...snapshots, snapshot];
	eventCounter = 0;
	return snapshot;
}

/**
 * Reconstruct graph state at a given timestamp.
 * Finds the nearest snapshot before the timestamp, then replays events forward.
 */
export function reconstructState(projectId: string, at: Date): GraphState {
	// Find the nearest snapshot before `at`
	const projectSnapshots = snapshots
		.filter((s) => s.projectId === projectId && s.timestamp <= at)
		.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

	let nodeMap = new Map<string, Node>();
	let edgeMap = new Map<string, NodeEdge>();
	let startFrom: Date;

	if (projectSnapshots.length > 0) {
		const snap = projectSnapshots[0];
		for (const n of snap.nodes) nodeMap.set(n.id, n);
		for (const e of snap.edges) edgeMap.set(e.id, e);
		startFrom = snap.timestamp;
	} else {
		startFrom = new Date(0);
	}

	// Replay events from snapshot to `at`
	const relevantEvents = events
		.filter((e) => e.projectId === projectId && e.timestamp > startFrom && e.timestamp <= at)
		.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

	for (const event of relevantEvents) {
		switch (event.eventType) {
			case EVENT_TYPES.NODE_CREATED:
			case EVENT_TYPES.NODE_UPDATED:
			case EVENT_TYPES.NODE_RECLASSIFIED:
				if (event.afterState) {
					nodeMap.set(event.entityId, event.afterState as unknown as Node);
				}
				break;
			case EVENT_TYPES.NODE_DELETED:
				nodeMap.delete(event.entityId);
				break;
			case EVENT_TYPES.EDGE_CREATED:
				if (event.afterState) {
					edgeMap.set(event.entityId, event.afterState as unknown as NodeEdge);
				}
				break;
			case EVENT_TYPES.EDGE_DELETED:
				edgeMap.delete(event.entityId);
				break;
		}
	}

	return { nodes: nodeMap, edges: edgeMap, timestamp: at };
}

export function clearEvents() {
	events = [];
	snapshots = [];
	eventCounter = 0;
}
