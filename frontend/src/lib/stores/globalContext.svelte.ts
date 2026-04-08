/**
 * Global project context — free-text background that gets passed to every LLM call.
 * Persisted per-project in localStorage.
 */

const LS_PREFIX = 'atlas_global_context_';

let context = $state('');
let currentProjectId = '';

export function loadGlobalContext(projectId: string): void {
	currentProjectId = projectId;
	try {
		context = localStorage.getItem(LS_PREFIX + projectId) ?? '';
	} catch {
		context = '';
	}
}

export function getGlobalContext(): string {
	return context;
}

export function setGlobalContext(text: string): void {
	context = text;
	if (currentProjectId) {
		try {
			localStorage.setItem(LS_PREFIX + currentProjectId, text);
		} catch {
			// ignore quota errors
		}
	}
}
