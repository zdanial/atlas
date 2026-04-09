// ---------------------------------------------------------------------------
// Shared chat utilities — used by NodeChat, NodeChatModal, NotesZone
// ---------------------------------------------------------------------------

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Node } from '$lib/storage/adapter';
import type { Proposal } from '$lib/proposals';

/** Chat history entry stored in node payload */
export type ChatHistoryEntry = {
	role: 'user' | 'assistant';
	content: string;
	proposals?: Proposal[];
};

/** Render markdown text to sanitized HTML */
export function renderMarkdown(text: string): string {
	const raw = marked.parse(text, { async: false }) as string;
	return DOMPurify.sanitize(raw);
}

/** Extract the first non-empty line, truncated to 120 chars */
export function firstLine(text: string): string {
	const line = text.split('\n').find((l) => l.trim()) ?? text;
	return line.length > 120 ? line.slice(0, 120) + '...' : line;
}

/** Deterministic color from a tag string */
export function tagColor(tag: string): string {
	let hash = 0;
	for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
	const palette = [
		'#6366f1',
		'#22c55e',
		'#f97316',
		'#06b6d4',
		'#ec4899',
		'#eab308',
		'#8b5cf6',
		'#14b8a6',
		'#ef4444',
		'#3b82f6'
	];
	return palette[Math.abs(hash) % palette.length];
}

/**
 * Deep-clone payload and merge patch, stripping Svelte 5 proxies
 * so the result can be safely written to IndexedDB.
 */
export function savePayload(
	node: Node,
	patch: Record<string, unknown>,
	onUpdateNode: (id: string, patch: Partial<Node>) => void
) {
	const clean = JSON.parse(JSON.stringify({ ...node.payload, ...patch }));
	onUpdateNode(node.id, { payload: clean });
}
