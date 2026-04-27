// ---------------------------------------------------------------------------
// Planning Inbox Store — reactive inbox backed by Dexie (IndexedDB)
// ---------------------------------------------------------------------------

import { SvelteMap } from 'svelte/reactivity';
import { v4 as uuidv4 } from 'uuid';
import Dexie, { type Table } from 'dexie';
import type { Proposal } from '$lib/proposals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxItem {
	id: string;
	projectId: string;
	sourceNodeId: string;
	sourceTitle: string;
	proposals: Proposal[];
	origin: 'manual' | 'llm-suggested';
	createdAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Dexie database (separate from main butterfly db to avoid migration coupling)
// ---------------------------------------------------------------------------

class InboxDatabase extends Dexie {
	inboxItems!: Table<InboxItem, string>;

	constructor() {
		super('butterfly-inbox');
		this.version(1).stores({
			inboxItems: 'id, projectId, createdAt'
		});
	}
}

const db = new InboxDatabase();

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const items = new SvelteMap<string, InboxItem>();

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initInboxStore(): Promise<void> {
	const all = await db.inboxItems.toArray();
	for (const item of all) {
		items.set(item.id, item);
	}
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function addInboxItem(input: Omit<InboxItem, 'id' | 'createdAt'>): Promise<InboxItem> {
	const item: InboxItem = {
		...input,
		id: uuidv4(),
		createdAt: new Date().toISOString()
	};
	items.set(item.id, item);
	await db.inboxItems.add(item);
	return item;
}

export async function removeInboxItem(id: string): Promise<void> {
	items.delete(id);
	await db.inboxItems.delete(id);
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

export function getInboxItems(projectId: string): InboxItem[] {
	const result: InboxItem[] = [];
	for (const item of items.values()) {
		if (item.projectId === projectId) result.push(item);
	}
	return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInboxCount(projectId: string): number {
	let count = 0;
	for (const item of items.values()) {
		if (item.projectId === projectId) count++;
	}
	return count;
}
