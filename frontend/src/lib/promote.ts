/**
 * Manual promote — convert L5 notes into planning items (L4→L1).
 *
 * This is the non-AI path for the Notes → Planning transition.
 * Creates a planning node from the note's content, links them
 * with a "supports" edge, and batches everything for undo/redo.
 */

import type { Node } from '$lib/storage/adapter';
import { createNode, createEdge, updateNode } from '$lib/stores/nodes.svelte';
import { pushOperation, type Operation } from '$lib/stores/history.svelte';

/** Type→layer mapping for planning nodes */
const TYPE_LAYER: Record<string, number> = {
	feature: 4,
	goal: 4,
	initiative: 4,
	intent: 4,
	epic: 3,
	phase: 2,
	ticket: 1
};

export interface PromoteOptions {
	/** The source L5 note */
	note: Node;
	/** Target planning type */
	targetType: string;
	/** Parent planning node ID (null = root) */
	parentId: string | null;
	/** Whether to archive the source note */
	archiveSource: boolean;
}

/**
 * Promote a single note into a planning item.
 * Returns the newly created planning node.
 */
export async function promoteNote(opts: PromoteOptions): Promise<Node> {
	const { note, targetType, parentId, archiveSource } = opts;
	const layer = TYPE_LAYER[targetType] ?? 4;

	const ops: Operation[] = [];

	// 1. Create the planning node with content from the source note
	const sourceTags = Array.isArray(note.payload?.tags) ? (note.payload!.tags as string[]) : [];
	const newNode = await createNode({
		type: targetType,
		layer,
		projectId: note.projectId,
		parentId: parentId ?? undefined,
		title: note.title,
		body: note.body,
		payload: {
			tags: sourceTags,
			sourceNoteId: note.id
		},
		status: 'draft'
	});
	ops.push({ type: 'create_node', node: newNode });

	// 2. Create "supports" edge from source note → new planning node
	const edge = await createEdge({
		sourceId: note.id,
		targetId: newNode.id,
		relationType: 'supports',
		source: 'human'
	});
	ops.push({ type: 'create_edge', edge });

	// 3. Optionally archive the source note
	if (archiveSource) {
		const before = { status: note.status };
		await updateNode(note.id, { status: 'archived' });
		ops.push({ type: 'update_node', id: note.id, before, after: { status: 'archived' } });
	}

	// 4. Push as a single batch operation (one undo reverses all)
	pushOperation({ type: 'batch', operations: ops });

	return newNode;
}

/**
 * Get the valid promote target types with their layers.
 */
export function getPromoteTargets(): Array<{ type: string; layer: number; label: string }> {
	return [
		{ type: 'feature', layer: 4, label: 'Feature' },
		{ type: 'goal', layer: 4, label: 'Goal' },
		{ type: 'epic', layer: 3, label: 'Epic' },
		{ type: 'phase', layer: 2, label: 'Phase' },
		{ type: 'ticket', layer: 1, label: 'Ticket' }
	];
}

/**
 * Get valid parent types for a given target type.
 * e.g. a Ticket can go under a Phase, Epic, or Feature.
 */
export function getValidParentTypes(targetType: string): string[] {
	const targetLayer = TYPE_LAYER[targetType] ?? 4;
	return Object.entries(TYPE_LAYER)
		.filter(([, layer]) => layer > targetLayer)
		.map(([type]) => type);
}
