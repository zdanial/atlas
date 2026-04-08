// ---------------------------------------------------------------------------
// Undo / Redo history store (WP-11)
// ---------------------------------------------------------------------------

import type { Node, NodeEdge } from '$lib/storage/adapter';
import {
	createNode as storeCreateNode,
	updateNode as storeUpdateNode,
	deleteNode as storeDeleteNode,
	createEdge as storeCreateEdge,
	deleteEdge as storeDeleteEdge,
	getNode
} from './nodes.svelte';
import type { UpdateNodeInput } from '$lib/schemas/node';

export type Operation =
	| { type: 'create_node'; node: Node }
	| { type: 'delete_node'; node: Node }
	| { type: 'update_node'; id: string; before: Partial<Node>; after: Partial<Node> }
	| { type: 'create_edge'; edge: NodeEdge }
	| { type: 'delete_edge'; edge: NodeEdge }
	| { type: 'batch'; operations: Operation[] };

const MAX_HISTORY = 50;

let undoStack = $state<Operation[]>([]);
let redoStack = $state<Operation[]>([]);

export function canUndo(): boolean {
	return undoStack.length > 0;
}

export function canRedo(): boolean {
	return redoStack.length > 0;
}

export function pushOperation(op: Operation) {
	undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), op];
	redoStack = [];
}

async function applyInverse(op: Operation) {
	switch (op.type) {
		case 'create_node':
			await storeDeleteNode(op.node.id);
			break;
		case 'delete_node':
			await storeCreateNode({
				type: op.node.type,
				layer: op.node.layer,
				projectId: op.node.projectId,
				parentId: op.node.parentId,
				title: op.node.title,
				body: op.node.body,
				payload: op.node.payload,
				status: op.node.status,
				positionX: op.node.positionX,
				positionY: op.node.positionY
			});
			break;
		case 'update_node':
			await storeUpdateNode(op.id, op.before as UpdateNodeInput);
			break;
		case 'create_edge':
			await storeDeleteEdge(op.edge.id);
			break;
		case 'delete_edge':
			await storeCreateEdge({
				sourceId: op.edge.sourceId,
				targetId: op.edge.targetId,
				relationType: op.edge.relationType,
				weight: op.edge.weight,
				source: op.edge.source
			});
			break;
		case 'batch':
			for (const sub of [...op.operations].reverse()) {
				await applyInverse(sub);
			}
			break;
	}
}

async function applyForward(op: Operation) {
	switch (op.type) {
		case 'create_node':
			await storeCreateNode({
				type: op.node.type,
				layer: op.node.layer,
				projectId: op.node.projectId,
				parentId: op.node.parentId,
				title: op.node.title,
				body: op.node.body,
				payload: op.node.payload,
				status: op.node.status,
				positionX: op.node.positionX,
				positionY: op.node.positionY
			});
			break;
		case 'delete_node':
			await storeDeleteNode(op.node.id);
			break;
		case 'update_node':
			await storeUpdateNode(op.id, op.after as UpdateNodeInput);
			break;
		case 'create_edge':
			await storeCreateEdge({
				sourceId: op.edge.sourceId,
				targetId: op.edge.targetId,
				relationType: op.edge.relationType,
				weight: op.edge.weight,
				source: op.edge.source
			});
			break;
		case 'delete_edge':
			await storeDeleteEdge(op.edge.id);
			break;
		case 'batch':
			for (const sub of op.operations) {
				await applyForward(sub);
			}
			break;
	}
}

export async function undo() {
	if (undoStack.length === 0) return;
	const op = undoStack[undoStack.length - 1];
	undoStack = undoStack.slice(0, -1);
	await applyInverse(op);
	redoStack = [...redoStack, op];
}

export async function redo() {
	if (redoStack.length === 0) return;
	const op = redoStack[redoStack.length - 1];
	redoStack = redoStack.slice(0, -1);
	await applyForward(op);
	undoStack = [...undoStack, op];
}

export function clearHistory() {
	undoStack = [];
	redoStack = [];
}
