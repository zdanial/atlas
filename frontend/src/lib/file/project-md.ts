// ---------------------------------------------------------------------------
// Project MD — generate and parse _project.md
//
// Auto-generated project context file that LLMs can read.
// External edits are parsed back into node updates.
// ---------------------------------------------------------------------------

import type { Node, NodeEdge } from '$lib/storage/adapter';
import { extractBodyText } from '$lib/node-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectInfo {
	name: string;
	description: string;
}

export interface ProjectMdPatch {
	statusChanges: Array<{ nodeId: string; newStatus: string }>;
	newItems: Array<{ title: string; type: string; section: string }>;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function statusCheckbox(status: string): string {
	if (status === 'done') return '[x]';
	if (status === 'active') return '[-]';
	return '[ ]';
}

/**
 * Generate _project.md content from project data.
 */
export function generateProjectMd(
	project: ProjectInfo,
	nodes: Node[],
	_edges: NodeEdge[],
	globalContext?: string
): string {
	const lines: string[] = [];

	// Header
	lines.push(`# Project: ${project.name}`);
	lines.push('');
	if (project.description) {
		lines.push(project.description);
		lines.push('');
	}

	// Goals (L0-L1 level nodes: goals, initiatives, features)
	const goalTypes = new Set(['goal', 'initiative', 'feature']);
	const goals = nodes.filter((n) => goalTypes.has(n.type) && n.status !== 'archived');
	if (goals.length > 0) {
		lines.push('## Goals');
		for (const g of goals) {
			const summary = extractBodyText(g.body, 100);
			const desc = summary ? ` — ${summary}` : '';
			lines.push(`- ${statusCheckbox(g.status)} ${g.title}${desc}`);
		}
		lines.push('');
	}

	// Active Work (grouped by type)
	const activeNodes = nodes.filter((n) => n.status === 'active' && !goalTypes.has(n.type));
	if (activeNodes.length > 0) {
		lines.push('## Active Work');

		// Group by type
		const byType = new Map<string, Node[]>();
		for (const n of activeNodes) {
			const group = byType.get(n.type) ?? [];
			group.push(n);
			byType.set(n.type, group);
		}

		for (const [type, items] of byType) {
			lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
			for (const item of items) {
				lines.push(`- ${statusCheckbox(item.status)} ${item.title} (${item.status})`);
			}
		}
		lines.push('');
	}

	// Decisions
	const decisions = nodes.filter((n) => n.type === 'decision' && n.status !== 'archived');
	if (decisions.length > 0) {
		lines.push('## Decisions');
		for (const d of decisions) {
			const summary = extractBodyText(d.body, 100);
			lines.push(`- ${d.title}${summary ? `: ${summary}` : ''}`);
		}
		lines.push('');
	}

	// Open Questions
	const questions = nodes.filter(
		(n) => n.type === 'question' && n.status !== 'done' && n.status !== 'archived'
	);
	if (questions.length > 0) {
		lines.push('## Open Questions');
		for (const q of questions) {
			lines.push(`- ${q.title}`);
		}
		lines.push('');
	}

	// Global Context
	if (globalContext) {
		lines.push('## Context');
		lines.push(globalContext);
		lines.push('');
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse _project.md and extract patches (status changes, new items).
 * Compares checkbox state against known nodes to detect changes.
 */
export function parseProjectMd(content: string, existingNodes: Node[]): ProjectMdPatch {
	const patch: ProjectMdPatch = {
		statusChanges: [],
		newItems: []
	};

	const nodeByTitle = new Map<string, Node>();
	for (const n of existingNodes) {
		nodeByTitle.set(n.title.toLowerCase(), n);
	}

	let currentSection = '';
	for (const line of content.split('\n')) {
		// Track sections
		if (line.startsWith('## ')) {
			currentSection = line.slice(3).trim().toLowerCase();
			continue;
		}

		// Parse checkbox items: - [x] Title or - [ ] Title
		const checkboxMatch = line.match(/^-\s+\[([ x\-])\]\s+(.+?)(?:\s+—.*|\s+\(.*\))?$/);
		if (!checkboxMatch) continue;

		const checked = checkboxMatch[1];
		const title = checkboxMatch[2].trim();
		const existing = nodeByTitle.get(title.toLowerCase());

		if (existing) {
			// Detect status change
			let newStatus: string | null = null;
			if (checked === 'x' && existing.status !== 'done') newStatus = 'done';
			else if (checked === '-' && existing.status !== 'active') newStatus = 'active';
			else if (checked === ' ' && existing.status !== 'draft') newStatus = 'draft';

			if (newStatus) {
				patch.statusChanges.push({ nodeId: existing.id, newStatus });
			}
		} else {
			// New item
			const typeMap: Record<string, string> = {
				goals: 'goal',
				'active work': 'note',
				decisions: 'decision',
				'open questions': 'question'
			};
			patch.newItems.push({
				title,
				type: typeMap[currentSection] ?? 'note',
				section: currentSection
			});
		}
	}

	return patch;
}
