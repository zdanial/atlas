/**
 * Compactor Agent
 *
 * Takes multiple notes and compacts them into a single summary note,
 * similar to LLM context compaction. Preserves key insights, decisions,
 * constraints, and action items. Merges tags.
 */

import { callModel } from './providers';
import { logInfo, logWarn } from '$lib/stores/log.svelte';
import { extractBodyText } from '$lib/node-types';
import type { Node } from '$lib/storage/adapter';

export interface CompactionResult {
	title: string;
	body: string;
	tags: string[];
	source: 'ai' | 'heuristic';
}

function buildCompactPrompt(nodes: Node[], projectContext: string): string {
	const parts = nodes.map((n, i) => {
		const body = extractBodyText(n.body, 2000) || '(no body)';
		const tags = Array.isArray(n.payload?.tags) ? (n.payload!.tags as string[]).join(', ') : '';
		return `## Note ${i + 1}: ${n.title}\nType: ${n.type} | Tags: ${tags || 'none'}\n${body}`;
	});

	return `You are a note compaction assistant. Given ${nodes.length} notes, create a single cohesive summary.

Rules:
- Preserve all key insights, decisions, constraints, and action items
- Merge overlapping content, remove redundancy
- Organize by theme or topic
- Keep the tone factual and concise
- Output valid JSON

${projectContext ? `Project context: ${projectContext}\n` : ''}
Notes to compact:

${parts.join('\n\n---\n\n')}

Respond with JSON:
{
  "title": "A concise title summarizing all notes",
  "body": "The merged summary as markdown text",
  "tags": ["merged", "unique", "tags"]
}`;
}

function heuristicCompact(nodes: Node[]): CompactionResult {
	const allTags = new Set<string>();
	const bodies: string[] = [];

	for (const n of nodes) {
		const body = extractBodyText(n.body, 1000);
		if (body) bodies.push(`**${n.title}:** ${body}`);
		else bodies.push(`**${n.title}**`);

		const tags = n.payload?.tags;
		if (Array.isArray(tags)) {
			for (const t of tags) allTags.add(t as string);
		}
	}

	return {
		title: `Summary of ${nodes.length} notes`,
		body: bodies.join('\n\n'),
		tags: Array.from(allTags),
		source: 'heuristic'
	};
}

export async function compact(
	nodes: Node[],
	projectContext: string = ''
): Promise<CompactionResult> {
	if (nodes.length === 0) {
		return { title: 'Empty summary', body: '', tags: [], source: 'heuristic' };
	}

	const prompt = buildCompactPrompt(nodes, projectContext);

	try {
		const response = await callModel('synthesis', '', prompt, 2048);
		if (!response) {
			logWarn('compactor', 'No LLM provider available, using heuristic compaction');
			return heuristicCompact(nodes);
		}

		logInfo('compactor', `Compacted ${nodes.length} notes via ${response.model}`);

		const jsonMatch = response.text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			logWarn('compactor', 'Failed to parse LLM response, falling back to heuristic');
			return heuristicCompact(nodes);
		}

		const parsed = JSON.parse(jsonMatch[0]);
		return {
			title: parsed.title || `Summary of ${nodes.length} notes`,
			body: parsed.body || '',
			tags: Array.isArray(parsed.tags) ? parsed.tags : [],
			source: 'ai'
		};
	} catch (err) {
		logWarn('compactor', `Compaction failed: ${err}, using heuristic`);
		return heuristicCompact(nodes);
	}
}
