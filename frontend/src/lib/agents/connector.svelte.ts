/**
 * Connector Agent — Background Loop (WP-22)
 *
 * Watches for new or changed notes, auto-classifies them, and infers edges.
 * Runs as a Svelte 5 reactive module — start it once from the root layout.
 */

import { classifyNote, type ClassificationResult } from './classifier';
import { inferEdges, filterDismissed, type InferredRelation } from '$lib/services/edge-inference';
import type { StorageAdapter, Node, NodeEdge } from '$lib/storage/adapter';
import { updateNode as storeUpdateNode, getProjectNodes } from '$lib/stores/nodes.svelte';
import type { NodeType } from '$lib/schemas/node';
import { logInfo, logWarn, logError } from '$lib/stores/log.svelte';
import { getGlobalContext } from '$lib/stores/globalContext.svelte';
import { extractBodyText } from '$lib/node-types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let storage: StorageAdapter | null = null;
let projectId: string | null = null;
let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

/** Queue of node IDs pending classification. */
let queue = $state<string[]>([]);

/** Currently classifying node ID. */
let activeNodeId = $state<string | null>(null);

/** Most recent classification results (for UI display). */
let recentResults = $state<Array<{ nodeId: string; result: ClassificationResult }>>([]);

/** Pending edge suggestions awaiting user review. */
let pendingSuggestions = $state<InferredRelation[]>([]);

/** Set of node IDs we've already classified (avoid re-processing). */
const classifiedNodes = new Set<string>();

// Rate limiting
const MAX_CALLS_PER_MINUTE = 10;
let callTimestamps: number[] = [];

// Debounce timers: nodeId → pending setTimeout handle
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start the connector loop for a project. */
export function startConnector(adapter: StorageAdapter, pid: string) {
	storage = adapter;
	projectId = pid;
	running = true;
	classifiedNodes.clear();
	queue = [];
	recentResults = [];
	pendingSuggestions = [];

	logInfo('connector', `Started for project ${pid}`);

	// Poll every 3 seconds for unclassified notes
	intervalId = setInterval(pollForUnclassified, 3000);
}

/** Stop the connector loop. */
export function stopConnector() {
	running = false;
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	for (const handle of debounceTimers.values()) clearTimeout(handle);
	debounceTimers.clear();
	logInfo('connector', 'Stopped');
}

/** Enqueue a specific node for (re-)classification immediately. */
export function enqueueClassification(nodeId: string) {
	// Always allow reclassification — remove from "already done" set
	classifiedNodes.delete(nodeId);
	if (!queue.includes(nodeId)) {
		queue = [...queue, nodeId];
		processQueue();
	}
}

/**
 * Debounced classification — call on every edit event.
 * Waits DEBOUNCE_MS after the last call before actually enqueuing.
 * Prevents API calls while the user is actively typing.
 */
export function debounceClassification(nodeId: string) {
	const existing = debounceTimers.get(nodeId);
	if (existing) clearTimeout(existing);

	const handle = setTimeout(() => {
		debounceTimers.delete(nodeId);
		enqueueClassification(nodeId);
	}, DEBOUNCE_MS);

	debounceTimers.set(nodeId, handle);
}

/** Reactive state accessors for UI. */
export function getQueue(): string[] {
	return queue;
}

export function getActiveNodeId(): string | null {
	return activeNodeId;
}

export function getRecentResults(): Array<{ nodeId: string; result: ClassificationResult }> {
	return recentResults;
}

export function getPendingSuggestions(): InferredRelation[] {
	return pendingSuggestions;
}

export function isConnectorRunning(): boolean {
	return running;
}

/** Clear a suggestion (accepted or dismissed). */
export function clearSuggestion(sourceId: string, targetId: string) {
	pendingSuggestions = pendingSuggestions.filter(
		(s) => !(s.sourceId === sourceId && s.targetId === targetId)
	);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function pollForUnclassified() {
	if (!storage || !projectId || !running) return;

	try {
		// Find notes that are still type='note', have a real title, and haven't been classified yet
		const allNodes = await storage.listNodes({ projectId });
		const unclassified = allNodes.filter(
			(n) =>
				n.type === 'note' &&
				n.title.trim().length >= 3 &&
				n.title.trim() !== 'Untitled' &&
				!classifiedNodes.has(n.id) &&
				!queue.includes(n.id)
		);

		if (unclassified.length > 0) {
			logInfo(
				'connector',
				`Found ${unclassified.length} unclassified note${unclassified.length === 1 ? '' : 's'} — queuing`
			);
			queue = [...queue, ...unclassified.map((n) => n.id)];
			processQueue();
		}
	} catch (e) {
		logError('connector', 'Failed to poll for unclassified notes', String(e));
	}
}

async function processQueue() {
	if (!storage || !running || activeNodeId) return;
	if (queue.length === 0) return;

	// Rate limit check
	const now = Date.now();
	callTimestamps = callTimestamps.filter((t) => now - t < 60_000);
	if (callTimestamps.length >= MAX_CALLS_PER_MINUTE) {
		logWarn('connector', `Rate limit reached (${MAX_CALLS_PER_MINUTE}/min) — waiting`);
		return;
	}

	const nodeId = queue[0];
	queue = queue.slice(1);
	activeNodeId = nodeId;

	try {
		const node = await storage.getNode(nodeId);
		if (!node) {
			// Node was deleted
			logInfo('connector', `Node ${nodeId} not found — skipping`);
			classifiedNodes.add(nodeId);
			activeNodeId = null;
			processQueue();
			return;
		}

		// Skip if title is empty/default — wait for user to type something meaningful
		const title = node.title.trim();
		if (!title || title === 'Untitled' || title.length < 3) {
			logInfo('connector', `Skipping "${node.title}" — title too short or placeholder`);
			activeNodeId = null;
			processQueue();
			return;
		}

		// Extract body text for classification
		const bodyText = extractBodyText(node.body, 10000);
		const hasBody = !!bodyText?.trim();

		logInfo('connector', `Classifying "${title}"${hasBody ? '' : ' (will generate body)'}…`);

		// Classify — pass global context and whether body already exists
		callTimestamps.push(Date.now());
		const globalContext = getGlobalContext();
		// Gather existing project tags for the classifier to prefer
		const projectTags = Array.from(
			new Set(
				getProjectNodes().flatMap((n) =>
					Array.isArray(n.payload?.tags) ? (n.payload!.tags as string[]) : []
				)
			)
		);
		const result = await classifyNote(title, bodyText, {
			globalContext: globalContext || undefined,
			existingTags: projectTags.length > 0 ? projectTags : undefined
		});

		// Merge new tags into existing payload tags (deduplicated)
		const existingTags: string[] = Array.isArray(node.payload?.tags)
			? (node.payload!.tags as string[])
			: [];
		const mergedTags = Array.from(new Set([...existingTags, ...result.tags]));
		const tagsChanged =
			mergedTags.length !== existingTags.length ||
			mergedTags.some((t) => !existingTags.includes(t));

		// Build the patch to apply
		const patch: Parameters<typeof storeUpdateNode>[1] = {
			payload: { ...(node.payload ?? {}), tags: mergedTags }
		};

		// Apply generated body if node has no body content
		if (!hasBody && result.body) {
			// Wrap in TipTap paragraph doc format
			patch.body = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: result.body }] }]
			};
			logInfo('connector', `Generated body for "${title}"`, result.body.slice(0, 100));
		}

		// Apply classification if confident enough and different from current type
		if (result.type !== node.type && result.confidence >= 0.5) {
			logInfo(
				'connector',
				`Reclassified "${title}": ${node.type} → ${result.type} (${Math.round(result.confidence * 100)}%)`,
				`${result.reason}${result.tags.length ? ' | tags: ' + result.tags.join(', ') : ''}`
			);
			patch.type = result.type;
			await storeUpdateNode(nodeId, patch);

			// Log agent run
			await storage.logAgentRun({
				agent: 'connector-classifier',
				layer: node.layer,
				input: { nodeId, title: node.title, bodyText },
				output: {
					type: result.type,
					confidence: result.confidence,
					reason: result.reason,
					tags: result.tags,
					source: result.source
				},
				model: result.model ?? null,
				tokens: result.tokens ?? null,
				cost: estimateCost(result)
			});
		} else {
			if (result.type === node.type) {
				logInfo(
					'connector',
					`"${title}" confirmed as ${result.type} (${Math.round(result.confidence * 100)}%)`,
					result.tags.length ? 'tags: ' + result.tags.join(', ') : undefined
				);
			} else {
				logInfo(
					'connector',
					`"${title}" → ${result.type} but confidence too low (${Math.round(result.confidence * 100)}%) — keeping ${node.type}`
				);
			}
			// Still save tags + body even if type didn't change
			if (tagsChanged || patch.body) {
				await storeUpdateNode(nodeId, patch);
			}
		}

		classifiedNodes.add(nodeId);
		recentResults = [{ nodeId, result }, ...recentResults.slice(0, 9)];

		// Infer edges for newly classified node
		await inferEdgesForNode(node, result.type);
	} catch (e) {
		logError('connector', `Classification failed for node ${nodeId}`, String(e));
		// Put back in queue on failure (will retry next cycle)
	}

	activeNodeId = null;

	// Continue processing
	if (queue.length > 0) {
		setTimeout(processQueue, 200);
	}
}

async function inferEdgesForNode(node: Node, classifiedType: NodeType) {
	if (!storage || !projectId) return;

	try {
		const allNodes = await storage.listNodes({ projectId });
		const recentNodes = allNodes
			.filter((n) => n.id !== node.id)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.slice(0, 50);

		// Get existing edges
		const existingEdges = await storage.getEdges(node.id);

		// Use the classified type for inference
		const typedNode = { ...node, type: classifiedType };
		const inferred = inferEdges(typedNode, recentNodes, existingEdges, 5);
		const filtered = filterDismissed(inferred);

		if (filtered.length > 0) {
			logInfo(
				'connector',
				`Inferred ${filtered.length} edge suggestion${filtered.length === 1 ? '' : 's'} for "${node.title}"`,
				filtered.map((r) => `${r.relationType}: ${r.reason}`).join(' | ')
			);
			pendingSuggestions = [...pendingSuggestions, ...filtered];
		}
	} catch (e) {
		logError('connector', `Edge inference failed for "${node.title}"`, String(e));
	}
}

function estimateCost(result: ClassificationResult): number | null {
	if (!result.tokens) return null;
	// Rough cost estimates per 1K tokens
	const costPer1K: Record<string, number> = {
		'claude-haiku-4-5-20251001': 0.001,
		'gpt-4o-mini': 0.00015
	};
	const rate = costPer1K[result.model ?? ''] ?? 0.001;
	return (result.tokens / 1000) * rate;
}
