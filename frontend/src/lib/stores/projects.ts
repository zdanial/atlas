/**
 * Lightweight project list persistence.
 *
 * Frontend uses IndexedDB for nodes but has no project table — projects
 * were previously derived from the set of distinct projectIds across nodes.
 * That means a freshly-created project (e.g. via "Connect Repo") would
 * disappear on reload until it had a node.
 *
 * This module persists the canonical project list to localStorage so the
 * sidebar survives reloads regardless of whether nodes exist yet.
 */

const STORAGE_KEY = 'butterfly_projects_v1';

export interface ProjectEntry {
	id: string;
	name: string;
	color?: string | null;
}

export function loadProjects(): ProjectEntry[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(p) => p && typeof p.id === 'string' && typeof p.name === 'string'
		) as ProjectEntry[];
	} catch {
		return [];
	}
}

export function saveProjects(projects: ProjectEntry[]): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
	} catch {
		// Quota or private mode — best effort
	}
}

export function upsertProject(entry: ProjectEntry): ProjectEntry[] {
	const list = loadProjects();
	const idx = list.findIndex((p) => p.id === entry.id);
	if (idx === -1) {
		list.push(entry);
	} else {
		list[idx] = entry;
	}
	saveProjects(list);
	return list;
}
