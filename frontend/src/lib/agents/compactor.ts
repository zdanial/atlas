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
import type { Node, NodeEdge } from '$lib/storage/adapter';

export interface CompactionResult {
	title: string;
	body: string;
	tags: string[];
	source: 'ai' | 'heuristic';
}

export interface BranchCompactionResult extends CompactionResult {
	archivedNodeIds: string[];
}

function buildCompactPrompt(nodes: Node[], projectContext: string): string {
	const parts = nodes.map((n, i) => {
		const body = extractBodyText(n.body, 2000) || '(no body)';
		const tags = Array.isArray(n.payload?.tags) ? (n.payload!.tags as string[]).join(', ') : '';
		return `## Note ${i + 1}: ${n.title}\nType: ${n.type} | Tags: ${tags || 'none'}\n${body}`;
	});

	return `You are a note compaction assistant. Given ${nodes.length} notes, create a single cohesive summary.

Rules:
- Group related content by theme using markdown headings (## Theme Name)
- Preserve decisions, action items, open questions, and constraints verbatim
- Merge overlapping content, remove redundancy
- If notes conflict, note both positions under ## Open Questions
- End with a ## Key Takeaways section (2-4 bullets)
- Keep the tone factual and concise
- Output valid JSON

${projectContext ? `Project context: ${projectContext}\n` : ''}
Notes to compact:

${parts.join('\n\n---\n\n')}

Respond with JSON:
{
  "title": "A concise title summarizing all notes",
  "body": "The merged summary as markdown (use ## headings for themes, end with ## Key Takeaways)",
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

// ---------------------------------------------------------------------------
// Branch compaction — walk a branch and compact into a summary node
// ---------------------------------------------------------------------------

function walkBranch(
	rootId: string,
	nodeMap: Map<string, Node>,
	childMap: Map<string, string[]>,
	visited: Set<string>
): Node[] {
	if (visited.has(rootId)) return [];
	visited.add(rootId);

	const node = nodeMap.get(rootId);
	if (!node) return [];

	const result: Node[] = [node];
	for (const childId of childMap.get(rootId) ?? []) {
		result.push(...walkBranch(childId, nodeMap, childMap, visited));
	}
	return result;
}

function buildBranchPrompt(branchNodes: Node[], projectContext: string): string {
	const parts = branchNodes.map((n, i) => {
		const body = extractBodyText(n.body, 1500) || '(no body)';
		const tags = Array.isArray(n.payload?.tags) ? (n.payload!.tags as string[]).join(', ') : '';
		const depth = i === 0 ? '(root)' : `(depth ${i})`;
		return `## ${depth} ${n.title}\nType: ${n.type} | Tags: ${tags || 'none'}\n${body}`;
	});

	return `You are a conversation branch compactor. This is a branch of ${branchNodes.length} connected notes forming a conversation thread.

Rules:
- Summarize the entire conversation branch into a single cohesive note
- Preserve the key conclusions, decisions, and insights from the discussion
- Note any unresolved questions or disagreements
- Keep the most important details, discard redundancy
- End with a ## Summary section (2-3 sentences)
- Output valid JSON

${projectContext ? `Project context: ${projectContext}\n` : ''}
Branch to compact (root → leaves):

${parts.join('\n\n---\n\n')}

Respond with JSON:
{
  "title": "A title summarizing the branch conversation",
  "body": "The merged summary as markdown",
  "tags": ["relevant", "tags"]
}`;
}

/**
 * Compact a conversation branch into a single summary node.
 * Walks from branchRootId through all descendants, sends to LLM for summarization.
 */
export async function compactBranch(
	branchRootId: string,
	nodes: Node[],
	edges: NodeEdge[],
	projectContext: string = ''
): Promise<BranchCompactionResult> {
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const childMap = new Map<string, string[]>();
	for (const edge of edges) {
		const children = childMap.get(edge.sourceId) ?? [];
		children.push(edge.targetId);
		childMap.set(edge.sourceId, children);
	}

	const branchNodes = walkBranch(branchRootId, nodeMap, childMap, new Set());

	if (branchNodes.length === 0) {
		return {
			title: 'Empty branch',
			body: '',
			tags: [],
			source: 'heuristic',
			archivedNodeIds: []
		};
	}

	if (branchNodes.length === 1) {
		return {
			title: branchNodes[0].title,
			body: extractBodyText(branchNodes[0].body, 5000) || '',
			tags: Array.isArray(branchNodes[0].payload?.tags)
				? (branchNodes[0].payload!.tags as string[])
				: [],
			source: 'heuristic',
			archivedNodeIds: []
		};
	}

	const prompt = buildBranchPrompt(branchNodes, projectContext);
	const archivedNodeIds = branchNodes.map((n) => n.id);

	try {
		const response = await callModel('synthesis', '', prompt, 2048);
		if (!response) {
			logWarn('compactor', 'No LLM provider for branch compaction, using heuristic');
			const result = heuristicCompact(branchNodes);
			return { ...result, archivedNodeIds };
		}

		logInfo('compactor', `Branch-compacted ${branchNodes.length} nodes via ${response.model}`);

		const jsonMatch = response.text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			logWarn('compactor', 'Failed to parse branch compaction response');
			const result = heuristicCompact(branchNodes);
			return { ...result, archivedNodeIds };
		}

		const parsed = JSON.parse(jsonMatch[0]);
		return {
			title: parsed.title || `Summary of ${branchNodes.length}-node branch`,
			body: parsed.body || '',
			tags: Array.isArray(parsed.tags) ? parsed.tags : [],
			source: 'ai',
			archivedNodeIds
		};
	} catch (err) {
		logWarn('compactor', `Branch compaction failed: ${err}, using heuristic`);
		const result = heuristicCompact(branchNodes);
		return { ...result, archivedNodeIds };
	}
}
