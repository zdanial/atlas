/**
 * Context compiler — scans nodes for auto-suggestions and compiles
 * structured context into LLM-ready system prompt text.
 *
 * No API key needed — uses node type classification to suggest
 * relevant items for each context section.
 */

import type { Node } from '$lib/storage/adapter';
import type { AutoSuggestion, GlobalContext } from '$lib/stores/globalContext.svelte';
import { extractBodyText } from '$lib/node-types';

/** Maps node types to context section IDs */
const TYPE_TO_SECTION: Record<string, string> = {
	goal: 'goals',
	constraint: 'constraints',
	risk: 'constraints',
	decision: 'decisions',
	insight: 'goals'
};

/**
 * Scan all nodes and generate auto-suggestions for context sections.
 * Returns an updated context with suggestions merged in (does not mutate input).
 */
export function scanForSuggestions(allNodes: Node[], currentContext: GlobalContext): GlobalContext {
	const updated: GlobalContext = {
		...currentContext,
		sections: currentContext.sections.map((s) => ({
			...s,
			autoSuggestions: [...s.autoSuggestions]
		}))
	};

	// Collect already-known suggestion source IDs per section
	const knownIds = new Map<string, Set<string>>();
	for (const section of updated.sections) {
		knownIds.set(section.id, new Set(section.autoSuggestions.map((s) => s.sourceNodeId)));
	}

	for (const node of allNodes) {
		const sectionId = TYPE_TO_SECTION[node.type];
		if (!sectionId) continue;

		const section = updated.sections.find((s) => s.id === sectionId);
		if (!section) continue;

		const known = knownIds.get(sectionId)!;
		if (known.has(node.id)) continue;

		// Extract a snippet from the node
		const bodyText = extractBodyText(node.body as Record<string, unknown> | null, 100);
		const snippet = bodyText ? `${node.title}: ${bodyText}` : node.title;

		const suggestion: AutoSuggestion = {
			sourceNodeId: node.id,
			sourceTitle: node.title,
			sourceType: node.type,
			snippet,
			accepted: false,
			dismissed: false
		};

		section.autoSuggestions.push(suggestion);
		known.add(node.id);
	}

	return updated;
}

/**
 * Compile a GlobalContext into a plain string for LLM system prompts.
 */
export function compileContextForLLM(ctx: GlobalContext): string {
	if (ctx.mode === 'freeform') {
		return ctx.freeformOverride;
	}

	const parts: string[] = [];
	for (const section of ctx.sections) {
		const content = section.content.trim();
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
 * Compile context enriched with _project.md content.
 * If projectMd is available, include it as an additional context section.
 */
export function compileContextWithProjectMd(ctx: GlobalContext, projectMd?: string): string {
	const base = compileContextForLLM(ctx);
	if (!projectMd) return base;

	return [base, '## Project Overview (from _project.md)', projectMd].filter(Boolean).join('\n\n');
}
