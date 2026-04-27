/**
 * Edge Inference Service (WP-12)
 *
 * Infers relationships between notes using heuristic analysis.
 * In a production setup, this would call the provider registry for AI-based inference.
 * For Mode A (browser-only), uses keyword/type-based heuristics.
 */

import type { Node, NodeEdge, CreateEdge } from '$lib/storage/adapter';

export type InferredRelation = {
	sourceId: string;
	targetId: string;
	relationType: 'supports' | 'contradicts' | 'blocks' | 'implements' | 'duplicates' | 'refines';
	confidence: number;
	reason: string;
};

const CONTRADICTION_KEYWORDS = [
	['but', 'however'],
	['instead', 'rather'],
	['wrong', 'right'],
	['disagree', 'agree']
];

const SUPPORT_PAIRS: Record<string, string[]> = {
	idea: ['goal', 'hypothesis'],
	decision: ['constraint', 'risk'],
	insight: ['question', 'hypothesis'],
	bet: ['idea', 'goal']
};

const IMPLEMENTATION_PAIRS: Record<string, string[]> = {
	ticket: ['epic', 'intent'],
	epic: ['intent'],
	phase: ['epic']
};

/**
 * Infer edges for a new note against a set of recent notes.
 * Uses heuristic analysis (keyword overlap, type relationships, title similarity).
 */
export function inferEdges(
	newNode: Node,
	recentNodes: Node[],
	existingEdges: NodeEdge[],
	maxResults = 5
): InferredRelation[] {
	const results: InferredRelation[] = [];
	const existingPairs = new Set(existingEdges.map((e) => `${e.sourceId}:${e.targetId}`));

	for (const other of recentNodes) {
		if (other.id === newNode.id) continue;

		// Skip if edge already exists
		const pairKey1 = `${newNode.id}:${other.id}`;
		const pairKey2 = `${other.id}:${newNode.id}`;
		if (existingPairs.has(pairKey1) || existingPairs.has(pairKey2)) continue;

		const relations = analyzeRelation(newNode, other);
		results.push(...relations);
	}

	// Sort by confidence, take top N
	return results.sort((a, b) => b.confidence - a.confidence).slice(0, maxResults);
}

function analyzeRelation(a: Node, b: Node): InferredRelation[] {
	const relations: InferredRelation[] = [];

	// 1. Check for implementation relationships (type-based)
	const implTargets = IMPLEMENTATION_PAIRS[a.type];
	if (implTargets?.includes(b.type)) {
		relations.push({
			sourceId: a.id,
			targetId: b.id,
			relationType: 'implements',
			confidence: 0.7,
			reason: `${a.type} implements ${b.type}`
		});
	}
	const reverseImplTargets = IMPLEMENTATION_PAIRS[b.type];
	if (reverseImplTargets?.includes(a.type)) {
		relations.push({
			sourceId: b.id,
			targetId: a.id,
			relationType: 'implements',
			confidence: 0.7,
			reason: `${b.type} implements ${a.type}`
		});
	}

	// 2. Check for support relationships (type-based)
	const supportTargets = SUPPORT_PAIRS[a.type];
	if (supportTargets?.includes(b.type)) {
		relations.push({
			sourceId: a.id,
			targetId: b.id,
			relationType: 'supports',
			confidence: 0.5,
			reason: `${a.type} tends to support ${b.type}`
		});
	}

	// 3. Title similarity → potential duplicates or refinements
	const titleSim = wordOverlap(a.title, b.title);
	if (titleSim > 0.8 && a.type === b.type) {
		relations.push({
			sourceId: a.id,
			targetId: b.id,
			relationType: 'duplicates',
			confidence: titleSim,
			reason: 'Very similar titles of the same type'
		});
	} else if (titleSim > 0.5) {
		relations.push({
			sourceId: a.id,
			targetId: b.id,
			relationType: 'refines',
			confidence: titleSim * 0.7,
			reason: 'Similar topics'
		});
	}

	// 4. Check for contradiction keywords (gated by topic overlap)
	const aText = getFullText(a).toLowerCase();
	const bText = getFullText(b).toLowerCase();
	const topicOverlap = wordOverlap(aText, bText);
	if (topicOverlap > 0.2) {
		for (const [kw1, kw2] of CONTRADICTION_KEYWORDS) {
			const re1 = new RegExp('\\b' + kw1 + '\\b');
			const re2 = new RegExp('\\b' + kw2 + '\\b');
			if ((re1.test(aText) && re2.test(bText)) || (re2.test(aText) && re1.test(bText))) {
				relations.push({
					sourceId: a.id,
					targetId: b.id,
					relationType: 'contradicts',
					confidence: Math.min(0.6, topicOverlap * 1.5),
					reason: `Opposing language (${kw1}/${kw2}) in topically related notes`
				});
				break;
			}
		}
	}

	// 5. Risk/constraint → blocks
	if (
		(a.type === 'risk' || a.type === 'constraint') &&
		(b.type === 'idea' || b.type === 'goal' || b.type === 'intent')
	) {
		const overlap = wordOverlap(aText, bText);
		if (overlap > 0.3) {
			relations.push({
				sourceId: a.id,
				targetId: b.id,
				relationType: 'blocks',
				confidence: overlap * 0.8,
				reason: `${a.type} may block ${b.type}`
			});
		}
	}

	return relations;
}

function wordOverlap(a: string, b: string): number {
	const aWords = new Set(
		a
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 2)
	);
	const bWords = new Set(
		b
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 2)
	);
	if (aWords.size === 0 || bWords.size === 0) return 0;
	let shared = 0;
	for (const w of aWords) {
		if (bWords.has(w)) shared++;
	}
	return (2 * shared) / (aWords.size + bWords.size);
}

function getFullText(node: Node): string {
	let text = node.title;
	if (node.body && typeof node.body === 'object') {
		if ('text' in node.body) {
			text += ' ' + String(node.body.text);
		} else if (node.body.type === 'doc' && Array.isArray(node.body.content)) {
			for (const block of node.body.content as Array<Record<string, unknown>>) {
				if (block && Array.isArray(block.content)) {
					for (const inline of block.content as Array<Record<string, unknown>>) {
						if (inline && 'text' in inline) {
							text += ' ' + String(inline.text);
						}
					}
				}
			}
		}
	}
	return text;
}

/**
 * Track dismissed edge pairs so they don't reappear.
 */
const dismissedPairs = new Set<string>();

export function dismissEdge(sourceId: string, targetId: string) {
	dismissedPairs.add(`${sourceId}:${targetId}`);
	dismissedPairs.add(`${targetId}:${sourceId}`);
}

export function isDismissed(sourceId: string, targetId: string): boolean {
	return (
		dismissedPairs.has(`${sourceId}:${targetId}`) || dismissedPairs.has(`${targetId}:${sourceId}`)
	);
}

/**
 * Filter out dismissed inferences.
 */
export function filterDismissed(relations: InferredRelation[]): InferredRelation[] {
	return relations.filter((r) => !isDismissed(r.sourceId, r.targetId));
}
