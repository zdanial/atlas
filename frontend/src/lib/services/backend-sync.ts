/**
 * One-way sync from backend Postgres -> local IndexedDB.
 *
 * Frontend runs in browser-only mode by default (Mode A) but features like
 * the Cartographer write to the backend Postgres node table. After such a
 * write, call `syncBackendNodesToLocal(projectId)` to mirror the new rows
 * into IndexedDB so they appear on the canvas.
 */

import type { StorageAdapter } from '$lib/storage/adapter';

interface BackendNode {
	id: string;
	type: string;
	layer: number;
	project_id: string;
	parent_id?: string | null;
	title: string;
	body?: Record<string, unknown> | null;
	payload?: Record<string, unknown> | null;
	status?: string;
	position_x?: number | null;
	position_y?: number | null;
}

export async function syncBackendNodesToLocal(
	storage: StorageAdapter,
	projectId: string
): Promise<{ added: number; skipped: number }> {
	let added = 0;
	let skipped = 0;

	const resp = await fetch(`/api/nodes?project_id=${encodeURIComponent(projectId)}`);
	if (!resp.ok) {
		throw new Error(`Failed to fetch backend nodes: HTTP ${resp.status}`);
	}
	const data = (await resp.json()) as { nodes: BackendNode[] };

	const existing = await storage.listNodes({ projectId });
	// Dedup by backend id stored in payload, falling back to title+type.
	const existingBackendIds = new Set<string>();
	const existingTitleType = new Set<string>();
	for (const e of existing) {
		const bid = (e.payload as Record<string, unknown> | null)?.backend_id;
		if (typeof bid === 'string') existingBackendIds.add(bid);
		existingTitleType.add(`${e.type}::${e.title.toLowerCase()}`);
	}

	for (const n of data.nodes) {
		if (existingBackendIds.has(n.id)) {
			skipped++;
			continue;
		}
		if (existingTitleType.has(`${n.type}::${n.title.toLowerCase()}`)) {
			skipped++;
			continue;
		}
		try {
			await storage.createNode({
				type: n.type,
				layer: n.layer,
				projectId: n.project_id,
				parentId: n.parent_id ?? null,
				title: n.title,
				body: n.body ?? null,
				payload: { ...(n.payload ?? {}), backend_id: n.id },
				status: n.status ?? 'active',
				positionX: n.position_x ?? null,
				positionY: n.position_y ?? null,
				sortOrder: null
			});
			added++;
		} catch {
			skipped++;
		}
	}

	return { added, skipped };
}
