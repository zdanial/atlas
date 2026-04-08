/**
 * Demo seed data for Atlas.
 *
 * Creates a realistic project ("Atlas v1 Launch") with ~30 nodes across all
 * types and layers, plus edges showing supports/contradicts/blocks/implements
 * relationships, and 3 intents with child epics on the roadmap.
 */

import type { StorageAdapter, CreateNode, CreateEdge } from '$lib/storage/adapter';

function body(text: string): Record<string, unknown> {
	return {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text }]
			}
		]
	};
}

interface SeedNode extends CreateNode {
	_key: string; // local key for wiring edges
}

export async function seedDemo(storage: StorageAdapter, projectId: string) {
	// Check if project already has data
	const existing = await storage.listNodes({ projectId });
	if (existing.length > 0) return;

	// ── L4 Intents ─────────────────────────────────────────────
	const nodes: SeedNode[] = [
		{
			_key: 'intent-mvp',
			type: 'intent',
			layer: 4,
			projectId,
			title: 'Ship browser-only MVP',
			body: body(
				"Get a working standalone canvas + auto-classify pipeline into early testers' hands. No server required — IndexedDB only."
			),
			status: 'active',
			payload: {
				targetOutcome: 'Users can dump 50+ notes and see auto-classified types with AI edges',
				deadline: '2026-06-01',
				timeHorizon: 'quarter'
			},
			positionX: 60,
			positionY: 40
		},
		{
			_key: 'intent-collab',
			type: 'intent',
			layer: 4,
			projectId,
			title: 'Enable local-server collaboration',
			body: body(
				'Docker Compose setup so a small team can share a single Atlas instance on a LAN or VPS.'
			),
			status: 'draft',
			payload: {
				targetOutcome: 'docker compose up → full stack running, data persists across restarts',
				deadline: '2026-08-01',
				timeHorizon: 'quarter'
			},
			positionX: 60,
			positionY: 200
		},
		{
			_key: 'intent-github',
			type: 'intent',
			layer: 4,
			projectId,
			title: 'Bootstrap projects from GitHub history',
			body: body(
				'Scan an existing repo, classify PRs into tickets, group into epics, and backfill timeline events.'
			),
			status: 'active',
			payload: {
				targetOutcome: 'Scanning a 500-PR repo completes in <2 min with reasonable epic grouping',
				deadline: '2026-07-15',
				timeHorizon: 'quarter'
			},
			positionX: 60,
			positionY: 360
		},

		// ── L3 Epics ──────────────────────────────────────────────
		{
			_key: 'epic-canvas',
			type: 'epic',
			layer: 3,
			projectId,
			parentId: undefined, // linked below
			title: 'Canvas interactions & polish',
			body: body(
				'Multi-select, box-select, edge drawing, undo/redo, context menu, 60fps pan/zoom.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Should we support touch gestures on iPad?']
			},
			positionX: 340,
			positionY: 40
		},
		{
			_key: 'epic-classifier',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Classifier + edge inference pipeline',
			body: body(
				'Provider registry → callModel abstraction → heuristic fallback. Batch classify new notes, infer pairwise edges.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Which embedding model gives best cost/quality for edge inference?']
			},
			positionX: 340,
			positionY: 180
		},
		{
			_key: 'epic-views',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Graph, Kanban & Roadmap views',
			body: body(
				'd3-force graph, type-grouped Kanban, Gantt-style roadmap. Shared selection state across all views.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: []
			},
			positionX: 340,
			positionY: 340
		},
		{
			_key: 'epic-docker',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Docker Compose local deployment',
			body: body('Multi-stage Dockerfiles, PG health checks, .env config, demo seed data.'),
			status: 'draft',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Do we need hot-reload in dev containers?']
			},
			positionX: 340,
			positionY: 500
		},

		// ── L5 Canvas Notes (ideas, questions, problems, etc.) ────
		{
			_key: 'goal-realtime',
			type: 'goal',
			layer: 5,
			projectId,
			title: 'Real-time collaboration',
			body: body(
				'Multiple users editing the same canvas simultaneously. Requires conflict resolution and presence indicators.'
			),
			status: 'active',
			positionX: 700,
			positionY: 40
		},
		{
			_key: 'idea-ai-layout',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'AI-suggested canvas layout',
			body: body(
				'After brain dump, automatically arrange notes in semantic clusters on the canvas instead of a grid.'
			),
			status: 'active',
			positionX: 700,
			positionY: 140
		},
		{
			_key: 'idea-export-claude',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'Export tickets as Claude Code commands',
			body: body(
				'One-click export: compile ticket context chain → copy a `claude` CLI command with full prompt payload.'
			),
			status: 'active',
			positionX: 700,
			positionY: 240
		},
		{
			_key: 'question-embedding',
			type: 'question',
			layer: 5,
			projectId,
			title: 'Which embedding model for edge inference?',
			body: body(
				'Options: text-embedding-3-small (cheap), voyage-3 (best quality), or local ONNX (privacy). Need to benchmark cost vs accuracy.'
			),
			status: 'active',
			positionX: 700,
			positionY: 340
		},
		{
			_key: 'question-mobile',
			type: 'question',
			layer: 5,
			projectId,
			title: 'Should we support mobile / tablet?',
			body: body(
				'Canvas touch interactions are complex. Could start with read-only mobile view and edit on desktop only.'
			),
			status: 'active',
			positionX: 700,
			positionY: 440
		},
		{
			_key: 'constraint-no-server',
			type: 'constraint',
			layer: 5,
			projectId,
			title: 'MVP must work without a server',
			body: body(
				'IndexedDB-only Mode A is the primary deployment for early testers. No Docker, no Postgres, no signup. Just open a URL.'
			),
			status: 'active',
			positionX: 960,
			positionY: 40
		},
		{
			_key: 'constraint-agpl',
			type: 'constraint',
			layer: 5,
			projectId,
			title: 'Must stay AGPLv3',
			body: body(
				'Legal requirement. All code open-source. SaaS deployments must share modifications.'
			),
			status: 'active',
			positionX: 960,
			positionY: 140
		},
		{
			_key: 'risk-llm-cost',
			type: 'risk',
			layer: 5,
			projectId,
			title: 'LLM API costs could explode',
			body: body(
				'Edge inference runs pairwise comparisons. 100 notes = 4,950 pairs. Need smart batching, caching, and spend limits.'
			),
			status: 'active',
			positionX: 960,
			positionY: 240
		},
		{
			_key: 'risk-perf',
			type: 'risk',
			layer: 5,
			projectId,
			title: 'Canvas perf degrades at 200+ notes',
			body: body(
				"HTML/CSS transforms don't virtualize well. May need viewport culling or switch to WebGL for large projects."
			),
			status: 'active',
			positionX: 960,
			positionY: 340
		},
		{
			_key: 'decision-svelte5',
			type: 'decision',
			layer: 5,
			projectId,
			title: 'Use Svelte 5 runes, not legacy reactivity',
			body: body(
				'$state / $derived / $effect give fine-grained reactivity. SvelteMap for O(1) node lookups. No stores API.'
			),
			status: 'done',
			positionX: 960,
			positionY: 440
		},
		{
			_key: 'decision-no-orm',
			type: 'decision',
			layer: 5,
			projectId,
			title: 'Raw SQL via SQLx, no ORM',
			body: body(
				'Diesel / SeaORM add too much complexity for our schema. SQLx string queries with FromRow derivations keep things simple.'
			),
			status: 'done',
			positionX: 960,
			positionY: 540
		},
		{
			_key: 'insight-brain-dump',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'Brain dump is the killer onboarding flow',
			body: body(
				'Users paste unstructured text → see it classified into typed notes on a canvas in seconds. This is the "aha" moment.'
			),
			status: 'active',
			positionX: 1220,
			positionY: 40
		},
		{
			_key: 'insight-temporal',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'Event sourcing enables time-travel debugging',
			body: body(
				'Every CRUD operation logs an event. Snapshots every 100 events. Can reconstruct graph state at any past timestamp for <200ms.'
			),
			status: 'active',
			positionX: 1220,
			positionY: 140
		},
		{
			_key: 'hypothesis-clusters',
			type: 'hypothesis',
			layer: 5,
			projectId,
			title: 'Auto-clustering will surface hidden themes',
			body: body(
				"If we cluster notes by shared edges + embedding similarity, users will discover feature boundaries they hadn't articulated."
			),
			status: 'active',
			positionX: 1220,
			positionY: 240
		},
		{
			_key: 'hypothesis-ai-edges',
			type: 'hypothesis',
			layer: 5,
			projectId,
			title: 'AI edges are more valuable than manual ones',
			body: body(
				"Users won't draw edges manually. But if the system infers them, users will confirm/reject — much lower friction."
			),
			status: 'active',
			positionX: 1220,
			positionY: 340
		},
		{
			_key: 'problem-dedup',
			type: 'problem',
			layer: 5,
			projectId,
			title: 'Duplicate notes after multiple brain dumps',
			body: body(
				'Users paste overlapping text across sessions. Need cosine-similarity dedup (>0.85) or title-match detection.'
			),
			status: 'active',
			positionX: 1220,
			positionY: 440
		},
		{
			_key: 'reference-svelte',
			type: 'reference',
			layer: 5,
			projectId,
			title: 'Svelte 5 runes RFC',
			body: body('https://svelte.dev/blog/runes — the design doc behind $state/$derived/$effect.'),
			status: 'active',
			positionX: 1220,
			positionY: 540
		},
		{
			_key: 'bet-open-source',
			type: 'bet',
			layer: 5,
			projectId,
			title: 'Bet: open-source will drive adoption over proprietary tools',
			body: body(
				'Linear/Notion are closed. Atlas is AGPLv3. Bet that devs want to own their planning data and extend the tool.'
			),
			status: 'active',
			positionX: 1480,
			positionY: 40
		},
		{
			_key: 'note-standup',
			type: 'note',
			layer: 5,
			projectId,
			title: 'Standup notes — Apr 7',
			body: body(
				'Wave 3 complete: canvas interactions, graph view, command palette, event sourcing, Docker, clusters, strategist, GitHub scanner, roadmap view. All 92 tests passing.'
			),
			status: 'active',
			positionX: 1480,
			positionY: 140
		},
		{
			_key: 'ticket-fix-zoom',
			type: 'ticket',
			layer: 2,
			projectId,
			title: 'Fix: pinch-to-zoom too sensitive on trackpad',
			body: body('Reduce deltaY multiplier from 0.01 to 0.005 for ctrlKey (pinch) events.'),
			status: 'active',
			payload: {
				intent: '',
				filePaths: [],
				acceptanceCriteria: [
					'Pinch zoom feels smooth on MacBook trackpad',
					'Mouse scroll zoom unchanged'
				],
				promptPayload: ''
			},
			positionX: 1480,
			positionY: 280
		},
		{
			_key: 'ticket-snapshot-api',
			type: 'ticket',
			layer: 2,
			projectId,
			title: 'Implement hourly snapshot cron in Rust backend',
			body: body(
				'Tokio task that runs every 60 min, calls create_snapshot for each active project. Wire into main.rs startup.'
			),
			status: 'draft',
			payload: {
				intent: '',
				filePaths: [],
				acceptanceCriteria: [
					'Snapshot created automatically every hour',
					'GET /state?at= returns correct graph within 200ms'
				],
				promptPayload: ''
			},
			positionX: 1480,
			positionY: 400
		}
	];

	// ── Create all nodes and build ID map ──────────────────────
	const idMap = new Map<string, string>();

	for (const seed of nodes) {
		const { _key, ...input } = seed;
		const created = await storage.createNode(input);
		idMap.set(_key, created.id);
	}

	// ── Wire parent IDs for epics → intents ────────────────────
	const parentLinks: [string, string][] = [
		['epic-canvas', 'intent-mvp'],
		['epic-classifier', 'intent-mvp'],
		['epic-views', 'intent-mvp'],
		['epic-docker', 'intent-collab'],
		['ticket-fix-zoom', 'epic-canvas'],
		['ticket-snapshot-api', 'epic-docker']
	];
	for (const [child, parent] of parentLinks) {
		const childId = idMap.get(child);
		const parentId = idMap.get(parent);
		if (childId && parentId) {
			await storage.updateNode(childId, { parentId });
		}
	}

	// ── Create edges ───────────────────────────────────────────
	const edges: (CreateEdge & { _src: string; _tgt: string })[] = [
		// Supports
		{
			_src: 'idea-ai-layout',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'idea-export-claude',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.8,
			source: 'ai'
		},
		{
			_src: 'insight-brain-dump',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.95,
			source: 'ai'
		},
		{
			_src: 'hypothesis-ai-edges',
			_tgt: 'epic-classifier',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.85,
			source: 'ai'
		},
		{
			_src: 'hypothesis-clusters',
			_tgt: 'epic-classifier',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.7,
			source: 'ai'
		},
		{
			_src: 'decision-svelte5',
			_tgt: 'epic-canvas',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.9,
			source: 'human'
		},
		{
			_src: 'decision-no-orm',
			_tgt: 'epic-docker',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.7,
			source: 'human'
		},
		{
			_src: 'bet-open-source',
			_tgt: 'constraint-agpl',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.8,
			source: 'human'
		},
		{
			_src: 'insight-temporal',
			_tgt: 'ticket-snapshot-api',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.85,
			source: 'ai'
		},

		// Blocks
		{
			_src: 'risk-llm-cost',
			_tgt: 'epic-classifier',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 0.7,
			source: 'ai'
		},
		{
			_src: 'risk-perf',
			_tgt: 'epic-canvas',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 0.6,
			source: 'ai'
		},
		{
			_src: 'constraint-no-server',
			_tgt: 'intent-collab',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 0.5,
			source: 'human'
		},

		// Contradicts
		{
			_src: 'constraint-no-server',
			_tgt: 'goal-realtime',
			sourceId: '',
			targetId: '',
			relationType: 'contradicts',
			weight: 0.8,
			source: 'ai'
		},

		// Implements
		{
			_src: 'epic-canvas',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-classifier',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-views',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-docker',
			_tgt: 'intent-collab',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-fix-zoom',
			_tgt: 'epic-canvas',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},

		// Refines
		{
			_src: 'question-embedding',
			_tgt: 'epic-classifier',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.7,
			source: 'ai'
		},
		{
			_src: 'question-mobile',
			_tgt: 'epic-canvas',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.5,
			source: 'ai'
		},
		{
			_src: 'problem-dedup',
			_tgt: 'epic-classifier',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.65,
			source: 'ai'
		},

		// Duplicates (for testing cluster panel)
		{
			_src: 'reference-svelte',
			_tgt: 'decision-svelte5',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.6,
			source: 'ai'
		}
	];

	for (const edge of edges) {
		const sourceId = idMap.get(edge._src);
		const targetId = idMap.get(edge._tgt);
		if (sourceId && targetId) {
			await storage.createEdge({
				sourceId,
				targetId,
				relationType: edge.relationType,
				weight: edge.weight,
				source: edge.source
			});
		}
	}
}
