/**
 * Global project context — structured sections that get compiled and passed to every LLM call.
 * Persisted per-project in localStorage. Backwards-compatible with old plain-text format.
 */

const LS_PREFIX = 'butterfly_global_context_';

export interface AutoSuggestion {
	sourceNodeId: string;
	sourceTitle: string;
	sourceType: string;
	snippet: string;
	accepted: boolean;
	dismissed: boolean;
}

export interface ContextSection {
	id: string;
	label: string;
	content: string;
	autoSuggestions: AutoSuggestion[];
}

export interface GlobalContext {
	sections: ContextSection[];
	freeformOverride: string;
	mode: 'structured' | 'freeform';
}

const DEFAULT_SECTIONS: ContextSection[] = [
	{ id: 'goals', label: 'Project Goals', content: '', autoSuggestions: [] },
	{ id: 'constraints', label: 'Constraints', content: '', autoSuggestions: [] },
	{ id: 'tech-stack', label: 'Tech Stack', content: '', autoSuggestions: [] },
	{ id: 'team', label: 'Team & Roles', content: '', autoSuggestions: [] },
	{ id: 'decisions', label: 'Key Decisions', content: '', autoSuggestions: [] },
	{ id: 'other', label: 'Other', content: '', autoSuggestions: [] }
];

function createDefaultContext(): GlobalContext {
	return {
		sections: DEFAULT_SECTIONS.map((s) => ({ ...s, autoSuggestions: [] })),
		freeformOverride: '',
		mode: 'structured'
	};
}

let context = $state<GlobalContext>(createDefaultContext());
let currentProjectId = '';

/**
 * Load context from localStorage. Migrates old plain-text format automatically.
 */
export function loadGlobalContext(projectId: string): void {
	currentProjectId = projectId;
	try {
		const raw = localStorage.getItem(LS_PREFIX + projectId);
		if (!raw) {
			context = createDefaultContext();
			return;
		}

		try {
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.sections)) {
				// New structured format
				context = parsed as GlobalContext;
				return;
			}
		} catch {
			// Not JSON — old plain-text format, migrate
		}

		// Migration: old plain text → put in 'other' section, set freeform mode
		const migrated = createDefaultContext();
		migrated.freeformOverride = raw;
		migrated.mode = 'freeform';
		const otherSection = migrated.sections.find((s) => s.id === 'other');
		if (otherSection) otherSection.content = raw;
		context = migrated;
		saveToStorage();
	} catch {
		context = createDefaultContext();
	}
}

function saveToStorage(): void {
	if (!currentProjectId) return;
	try {
		localStorage.setItem(LS_PREFIX + currentProjectId, JSON.stringify(context));
	} catch {
		// ignore quota errors
	}
}

/**
 * Get the compiled context string for LLM system prompts.
 * Backwards-compatible: returns a plain string.
 */
export function getGlobalContext(): string {
	if (context.mode === 'freeform') {
		return context.freeformOverride;
	}

	const parts: string[] = [];
	for (const section of context.sections) {
		const content = section.content.trim();
		// Include accepted auto-suggestions
		const accepted = section.autoSuggestions
			.filter((s) => s.accepted)
			.map((s) => `- ${s.snippet}`)
			.join('\n');

		const combined = [content, accepted].filter(Boolean).join('\n');
		if (combined) {
			parts.push(`## ${section.label}\n${combined}`);
		}
	}
	return parts.join('\n\n');
}

/**
 * Get the raw structured context object.
 */
export function getStructuredContext(): GlobalContext {
	return context;
}

/**
 * Update the entire structured context and persist.
 */
export function setStructuredContext(updated: GlobalContext): void {
	context = updated;
	saveToStorage();
}

/**
 * Update a single section's content.
 */
export function updateSectionContent(sectionId: string, content: string): void {
	const section = context.sections.find((s) => s.id === sectionId);
	if (section) {
		section.content = content;
		saveToStorage();
	}
}

/**
 * Set context mode (structured vs freeform).
 */
export function setContextMode(mode: 'structured' | 'freeform'): void {
	context.mode = mode;
	saveToStorage();
}

/**
 * Update freeform override text.
 */
export function setFreeformOverride(text: string): void {
	context.freeformOverride = text;
	saveToStorage();
}

/**
 * Accept an auto-suggestion in a section.
 */
export function acceptSuggestion(sectionId: string, sourceNodeId: string): void {
	const section = context.sections.find((s) => s.id === sectionId);
	if (!section) return;
	const suggestion = section.autoSuggestions.find((s) => s.sourceNodeId === sourceNodeId);
	if (suggestion) {
		suggestion.accepted = true;
		suggestion.dismissed = false;
		saveToStorage();
	}
}

/**
 * Dismiss an auto-suggestion in a section.
 */
export function dismissSuggestion(sectionId: string, sourceNodeId: string): void {
	const section = context.sections.find((s) => s.id === sectionId);
	if (!section) return;
	const suggestion = section.autoSuggestions.find((s) => s.sourceNodeId === sourceNodeId);
	if (suggestion) {
		suggestion.dismissed = true;
		suggestion.accepted = false;
		saveToStorage();
	}
}

/**
 * Legacy setter — sets freeform mode with the given text.
 * Used for backwards compatibility with existing callers.
 */
export function setGlobalContext(text: string): void {
	context.freeformOverride = text;
	context.mode = 'freeform';
	// Also put in 'other' section for easy migration to structured
	const otherSection = context.sections.find((s) => s.id === 'other');
	if (otherSection) otherSection.content = text;
	saveToStorage();
}
