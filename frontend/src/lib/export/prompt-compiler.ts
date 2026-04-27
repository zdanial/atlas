/**
 * Compile a node (ticket, phase, epic, feature, or canvas note) into a
 * ready-to-paste markdown prompt for Claude Code, with an butterfly-ref
 * traceability tag at the bottom.
 */

import type { Node, NodeEdge } from '$lib/storage/adapter';
import { extractBodyText, getNodeTypeConfig } from '$lib/node-types';
import { computeDependencyColumns, getBlockers, getBlocked } from '$lib/dependency-graph';

// ── Helpers ──────────────────────────────────────────────────────────────

function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
}

function getParentChain(node: Node, nodeMap: Map<string, Node>): Node[] {
	const chain: Node[] = [];
	let current = node;
	while (current.parentId) {
		const parent = nodeMap.get(current.parentId);
		if (!parent) break;
		chain.push(parent);
		current = parent;
	}
	return chain; // closest → root
}

function getSiblings(node: Node, allNodes: Node[]): Node[] {
	if (!node.parentId) return [];
	return allNodes
		.filter((n) => n.parentId === node.parentId && n.id !== node.id)
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function getDirectChildren(parentId: string, allNodes: Node[]): Node[] {
	return allNodes
		.filter((n) => n.parentId === parentId)
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function childProgress(parentId: string, allNodes: Node[]): { done: number; total: number } {
	const children = allNodes.filter((n) => n.parentId === parentId);
	return {
		done: children.filter((n) => n.status === 'done').length,
		total: children.length
	};
}

function buildPathString(node: Node, parentChain: Node[]): string {
	return [
		...parentChain
			.slice()
			.reverse()
			.map((n) => n.title),
		node.title
	].join(' > ');
}

function buildButterflyRef(node: Node, parentChain: Node[]): string {
	const path = buildPathString(node, parentChain);
	const ref = {
		nodeId: node.id,
		type: node.type,
		title: node.title,
		path: [path]
	};
	return [
		'',
		'## Butterfly Reference',
		`<!-- butterfly-ref: ${JSON.stringify(ref)} -->`,
		'',
		'When creating commits or PRs for this work, include this tag in the commit message or PR description:',
		`butterfly-ref: ${node.id}`,
		''
	].join('\n');
}

function upstreamContext(parentChain: Node[]): string {
	if (parentChain.length === 0) return '';

	const lines: string[] = ['', '## Upstream Context'];

	for (const ancestor of parentChain) {
		const config = getNodeTypeConfig(ancestor.type);
		const payload = ancestor.payload as Record<string, unknown> | null;
		lines.push('', `### ${config.label}: ${ancestor.title}`);

		if (payload?.objective) lines.push(String(payload.objective));
		else if (payload?.targetOutcome) lines.push(`Target outcome: ${payload.targetOutcome}`);

		const body = extractBodyText(ancestor.body as Record<string, unknown> | null, 2000);
		if (body && !payload?.objective && !payload?.targetOutcome) lines.push(body);
	}

	return lines.join('\n');
}

function dependencySection(node: Node, edges: NodeEdge[], nodeMap: Map<string, Node>): string {
	const blockerIds = getBlockers(node.id, edges);
	const blockedIds = getBlocked(node.id, edges);
	if (blockerIds.length === 0 && blockedIds.length === 0) return '';

	const lines: string[] = ['', '## Dependencies'];
	for (const id of blockerIds) {
		const n = nodeMap.get(id);
		if (n) lines.push(`- Blocked by: ${n.title} (${n.status})`);
	}
	for (const id of blockedIds) {
		const n = nodeMap.get(id);
		if (n) lines.push(`- Blocks: ${n.title} (${n.status})`);
	}
	return lines.join('\n');
}

// ── Shared detail renderers (reused at every level) ─────────────────────

/** Render a single ticket's detail as markdown lines (no heading prefix). */
function renderTicketDetail(ticket: Node, edges: NodeEdge[], nodeMap: Map<string, Node>): string[] {
	const lines: string[] = [];
	const tp = ticket.payload as Record<string, unknown> | null;

	if (tp?.intent) lines.push(`**Intent:** ${tp.intent}`);

	const body = extractBodyText(ticket.body as Record<string, unknown> | null, 5000);
	if (body && !tp?.intent) lines.push(body);

	const fp = tp?.filePaths as Array<{ repoId?: string; path: string }> | undefined;
	if (fp && fp.length > 0) {
		lines.push(`**Files:** ${fp.map((f) => f.path).join(', ')}`);
	}

	const ac = tp?.acceptanceCriteria as string[] | undefined;
	if (ac && ac.length > 0) {
		lines.push('**Acceptance Criteria:**');
		for (const c of ac) lines.push(`- [ ] ${c}`);
	}

	lines.push(`**Status:** ${ticket.status}`);

	const blockerIds = getBlockers(ticket.id, edges);
	if (blockerIds.length > 0) {
		const blockerNames = blockerIds.map((id) => nodeMap.get(id)?.title).filter(Boolean);
		if (blockerNames.length > 0) {
			lines.push(`**Blocked by:** ${blockerNames.join(', ')}`);
		}
	}

	return lines;
}

/** Render a phase with all its tickets grouped by dependency wave. */
function renderPhaseBlock(
	phase: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>,
	headingLevel: string
): string[] {
	const lines: string[] = [];
	const pp = phase.payload as Record<string, unknown> | null;
	const children = getDirectChildren(phase.id, allNodes);
	const progress = childProgress(phase.id, allNodes);

	lines.push(
		'',
		`${headingLevel} Phase: ${phase.title} (${phase.status}) — ${progress.done}/${progress.total} done`
	);

	if (pp?.objective) lines.push(`**Objective:** ${pp.objective}`);
	if (pp?.archNotes) lines.push(`**Architecture Notes:** ${pp.archNotes}`);

	const vc = pp?.verifyCriteria as string[] | undefined;
	if (vc && vc.length > 0) {
		lines.push('**Verification Criteria:**');
		for (const v of vc) lines.push(`- ${v}`);
	}

	if (children.length > 0) {
		const depColumns = computeDependencyColumns(children, edges);
		const maxCol = Math.max(0, ...depColumns.values());

		let ticketNum = 1;
		for (let wave = 0; wave <= maxCol; wave++) {
			const waveTickets = children
				.filter((n) => (depColumns.get(n.id) ?? 0) === wave)
				.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

			if (waveTickets.length === 0) continue;

			if (maxCol > 0) {
				const waveLabel =
					wave === 0 ? 'Wave 1 (no dependencies)' : `Wave ${wave + 1} (after wave ${wave})`;
				lines.push('', `${headingLevel}# ${waveLabel}`);
			}

			for (const ticket of waveTickets) {
				lines.push('', `${headingLevel}## ${ticketNum}. ${ticket.title}`);
				lines.push(...renderTicketDetail(ticket, edges, nodeMap));
				ticketNum++;
			}
		}
	}

	return lines;
}

/** Render an epic with all its phases and their tickets. */
function renderEpicBlock(
	epic: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>,
	headingLevel: string
): string[] {
	const lines: string[] = [];
	const payload = epic.payload as Record<string, unknown> | null;
	const phases = getDirectChildren(epic.id, allNodes);

	lines.push('', `${headingLevel} Epic: ${epic.title} (${epic.status})`);

	const body = extractBodyText(epic.body as Record<string, unknown> | null, 5000);
	if (body) lines.push(body);

	const openQuestions = payload?.openQuestions as string[] | undefined;
	if (openQuestions && openQuestions.length > 0) {
		lines.push('', '**Open Questions:**');
		for (const q of openQuestions) lines.push(`- ${q}`);
	}

	for (const phase of phases) {
		lines.push(...renderPhaseBlock(phase, allNodes, edges, nodeMap, headingLevel + '#'));
	}

	return lines;
}

// ── Per-type compilers ───────────────────────────────────────────────────

function compileTicket(
	node: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>
): string {
	const payload = node.payload as Record<string, unknown> | null;
	const parentChain = getParentChain(node, nodeMap);
	const lines: string[] = [];

	lines.push(`# Ticket: ${node.title}`);

	// Intent
	const intent = (payload?.intent as string) ?? '';
	const body = extractBodyText(node.body as Record<string, unknown> | null, 10000);
	if (intent || body) {
		lines.push('', '## Intent', intent || body || '');
	}

	// Files to touch
	const filePaths = payload?.filePaths as Array<{ repoId?: string; path: string }> | undefined;
	if (filePaths && filePaths.length > 0) {
		lines.push('', '## Files to Touch');
		for (const f of filePaths) {
			lines.push(`- ${f.path}${f.repoId ? ` (${f.repoId})` : ''}`);
		}
	}

	// Acceptance criteria
	const criteria = payload?.acceptanceCriteria as string[] | undefined;
	if (criteria && criteria.length > 0) {
		lines.push('', '## Acceptance Criteria');
		for (const c of criteria) lines.push(`- [ ] ${c}`);
	}

	// Upstream context
	lines.push(upstreamContext(parentChain));

	// Siblings
	const siblings = getSiblings(node, allNodes);
	if (siblings.length > 0) {
		lines.push('', '## Sibling Tickets (same phase)');
		for (const s of siblings) lines.push(`- ${s.title} (${s.status})`);
	}

	// Dependencies
	lines.push(dependencySection(node, edges, nodeMap));

	// Branch convention
	const idShort = node.id.slice(0, 8);
	const slug = slugify(node.title);
	lines.push('', '## Branch Convention', `butterfly/${idShort}-${slug}`);

	// Butterfly ref
	lines.push(buildButterflyRef(node, parentChain));

	return lines.join('\n');
}

function compilePhase(
	node: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>
): string {
	const payload = node.payload as Record<string, unknown> | null;
	const parentChain = getParentChain(node, nodeMap);
	const children = getDirectChildren(node.id, allNodes);
	const lines: string[] = [];

	lines.push(`# Phase: ${node.title} (${children.length} tickets)`);

	if (payload?.objective) {
		lines.push('', '## Objective', String(payload.objective));
	}

	if (payload?.archNotes) {
		lines.push('', '## Architecture Notes', String(payload.archNotes));
	}

	const verifyCriteria = payload?.verifyCriteria as string[] | undefined;
	if (verifyCriteria && verifyCriteria.length > 0) {
		lines.push('', '## Verification Criteria');
		for (const v of verifyCriteria) lines.push(`- ${v}`);
	}

	// Upstream context
	lines.push(upstreamContext(parentChain));

	// Execution order using dependency columns — full ticket detail
	if (children.length > 0) {
		const depColumns = computeDependencyColumns(children, edges);
		const maxCol = Math.max(0, ...depColumns.values());

		lines.push('', '## Execution Order');

		let ticketNum = 1;
		for (let wave = 0; wave <= maxCol; wave++) {
			const waveTickets = children
				.filter((n) => (depColumns.get(n.id) ?? 0) === wave)
				.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

			if (waveTickets.length === 0) continue;

			const waveLabel =
				wave === 0 ? 'Wave 1 (no dependencies)' : `Wave ${wave + 1} (after wave ${wave})`;
			lines.push('', `### ${waveLabel}`);

			for (const ticket of waveTickets) {
				lines.push('', `#### ${ticketNum}. ${ticket.title}`);
				lines.push(...renderTicketDetail(ticket, edges, nodeMap));
				ticketNum++;
			}
		}
	}

	// Butterfly ref
	lines.push(buildButterflyRef(node, parentChain));

	return lines.join('\n');
}

function compileEpic(
	node: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>
): string {
	const payload = node.payload as Record<string, unknown> | null;
	const parentChain = getParentChain(node, nodeMap);
	const lines: string[] = [];

	lines.push(`# Epic: ${node.title}`);

	const body = extractBodyText(node.body as Record<string, unknown> | null, 5000);
	if (body) {
		lines.push('', '## Overview', body);
	}

	const openQuestions = payload?.openQuestions as string[] | undefined;
	if (openQuestions && openQuestions.length > 0) {
		lines.push('', '## Open Questions');
		for (const q of openQuestions) lines.push(`- ${q}`);
	}

	// Upstream context
	lines.push(upstreamContext(parentChain));

	// Full phases with all tickets
	const phases = getDirectChildren(node.id, allNodes);
	if (phases.length > 0) {
		lines.push('', '## Phases');
		for (const phase of phases) {
			lines.push(...renderPhaseBlock(phase, allNodes, edges, nodeMap, '###'));
		}
	}

	// Butterfly ref
	lines.push(buildButterflyRef(node, parentChain));

	return lines.join('\n');
}

function compileFeature(
	node: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>
): string {
	const payload = node.payload as Record<string, unknown> | null;
	const parentChain = getParentChain(node, nodeMap);
	const config = getNodeTypeConfig(node.type);
	const lines: string[] = [];

	lines.push(`# ${config.label}: ${node.title}`);

	if (payload?.targetOutcome) {
		lines.push('', '## Target Outcome', String(payload.targetOutcome));
	}

	if (payload?.deadline) {
		lines.push('', '## Deadline', String(payload.deadline));
	}

	const body = extractBodyText(node.body as Record<string, unknown> | null, 5000);
	if (body) {
		lines.push('', '## Description', body);
	}

	// Full epics with all phases and tickets
	const epics = getDirectChildren(node.id, allNodes);
	if (epics.length > 0) {
		for (const epic of epics) {
			lines.push(...renderEpicBlock(epic, allNodes, edges, nodeMap, '##'));
		}
	}

	// Butterfly ref
	lines.push(buildButterflyRef(node, parentChain));

	return lines.join('\n');
}

function compileGeneric(
	node: Node,
	allNodes: Node[],
	edges: NodeEdge[],
	nodeMap: Map<string, Node>
): string {
	const config = getNodeTypeConfig(node.type);
	const parentChain = getParentChain(node, nodeMap);
	const lines: string[] = [];

	lines.push(`# ${config.label}: ${node.title}`);

	const body = extractBodyText(node.body as Record<string, unknown> | null, 10000);
	if (body) {
		lines.push('', body);
	}

	// Include any children recursively
	const children = getDirectChildren(node.id, allNodes);
	if (children.length > 0) {
		lines.push('', '## Children');
		for (const child of children) {
			const childConfig = getNodeTypeConfig(child.type);
			lines.push('', `### ${childConfig.label}: ${child.title} (${child.status})`);
			const childBody = extractBodyText(child.body as Record<string, unknown> | null, 2000);
			if (childBody) lines.push(childBody);

			// Recurse one more level
			const grandchildren = getDirectChildren(child.id, allNodes);
			for (const gc of grandchildren) {
				const gcConfig = getNodeTypeConfig(gc.type);
				lines.push('', `#### ${gcConfig.label}: ${gc.title} (${gc.status})`);
				const gcBody = extractBodyText(gc.body as Record<string, unknown> | null, 1000);
				if (gcBody) lines.push(gcBody);
			}
		}
	}

	lines.push(buildButterflyRef(node, parentChain));

	return lines.join('\n');
}

// ── Main export ──────────────────────────────────────────────────────────

/**
 * Compile a planning node into a markdown prompt ready to paste into Claude Code.
 * Includes full upstream context and an butterfly-ref traceability tag.
 */
export function compilePrompt(node: Node, allNodes: Node[], edges: NodeEdge[]): string {
	const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

	switch (node.type) {
		case 'ticket':
			return compileTicket(node, allNodes, edges, nodeMap);
		case 'phase':
			return compilePhase(node, allNodes, edges, nodeMap);
		case 'epic':
			return compileEpic(node, allNodes, edges, nodeMap);
		case 'feature':
		case 'intent':
		case 'goal':
		case 'initiative':
			return compileFeature(node, allNodes, edges, nodeMap);
		default:
			return compileGeneric(node, allNodes, edges, nodeMap);
	}
}
