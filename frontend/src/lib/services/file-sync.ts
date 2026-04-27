// ---------------------------------------------------------------------------
// File Sync Service — orchestrates write-through to .md files + inbound sync
// ---------------------------------------------------------------------------

import type { Node } from '$lib/storage/adapter';
import { serializeMarkdownFile, type FileFrontmatter } from '$lib/file/frontmatter';
import { tiptapToMarkdown } from '$lib/file/tiptap-markdown';
import { slugify } from '$lib/file/slugify';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getApiBase(): string {
	if (typeof window !== 'undefined') {
		return ((window as unknown as Record<string, unknown>).__API_URL as string) ?? '';
	}
	return '';
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Write a single node to its corresponding .md file via the backend API.
 */
export async function writeNodeToFile(projectId: string, node: Node): Promise<void> {
	const slug = slugify(node.title);
	const bodyText = node.body ? tiptapToMarkdown(node.body as Record<string, unknown>) : '';

	const tags: string[] = Array.isArray(node.payload?.tags) ? (node.payload!.tags as string[]) : [];

	const fm: FileFrontmatter = {
		id: node.id,
		type: node.type,
		title: node.title,
		status: node.status,
		parent: node.parentId ?? undefined,
		tags: tags.length > 0 ? tags : undefined,
		created: node.createdAt instanceof Date ? node.createdAt.toISOString() : String(node.createdAt),
		updated: node.updatedAt instanceof Date ? node.updatedAt.toISOString() : String(node.updatedAt)
	};

	const content = serializeMarkdownFile(fm, bodyText);

	const apiBase = getApiBase();
	await fetch(`${apiBase}/api/projects/${projectId}/files/write`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug, content })
	});
}

/**
 * Sync all nodes to files in bulk.
 */
export async function syncAllToFiles(projectId: string, nodes: Node[]): Promise<void> {
	const files = nodes.map((node) => {
		const bodyText = node.body ? tiptapToMarkdown(node.body as Record<string, unknown>) : '';
		const tags: string[] = Array.isArray(node.payload?.tags)
			? (node.payload!.tags as string[])
			: [];

		const fm: FileFrontmatter = {
			id: node.id,
			type: node.type,
			title: node.title,
			status: node.status,
			parent: node.parentId ?? undefined,
			tags: tags.length > 0 ? tags : undefined,
			created:
				node.createdAt instanceof Date ? node.createdAt.toISOString() : String(node.createdAt),
			updated:
				node.updatedAt instanceof Date ? node.updatedAt.toISOString() : String(node.updatedAt)
		};

		return {
			slug: slugify(node.title),
			content: serializeMarkdownFile(fm, bodyText)
		};
	});

	const apiBase = getApiBase();
	await fetch(`${apiBase}/api/projects/${projectId}/sync`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ files })
	});
}

// ---------------------------------------------------------------------------
// Inbound sync (from file changes via WebSocket)
// ---------------------------------------------------------------------------

export interface FileChangedEvent {
	type: 'file.changed';
	path: string;
	action: 'created' | 'modified' | 'deleted';
	project_id: string;
}

/**
 * Handle a file change event received via WebSocket.
 * Returns the parsed file content so the caller can update the store.
 */
export async function handleFileChangedEvent(
	event: FileChangedEvent
): Promise<{ slug: string; content: string } | null> {
	if (event.action === 'deleted') return null;

	const slug = event.path.replace(/\.md$/, '').split('/').pop() ?? '';
	if (!slug) return null;

	const apiBase = getApiBase();
	const res = await fetch(`${apiBase}/api/projects/${event.project_id}/files/read`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug })
	});

	if (!res.ok) return null;

	const data = await res.json();
	return { slug: data.slug, content: data.content };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let syncEnabled = false;

/**
 * Enable file sync for a project.
 * Call this once during app initialization when running in server mode.
 */
export function enableFileSync(): void {
	syncEnabled = true;
}

/**
 * Check if file sync is currently enabled.
 */
export function isFileSyncEnabled(): boolean {
	return syncEnabled;
}
