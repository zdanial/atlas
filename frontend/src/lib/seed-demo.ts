/**
 * Demo seed data for Atlas.
 *
 * Three-zone structure:
 * - Notes (L5): raw thoughts positioned on a time axis (x = days from today)
 * - Planning (L4→L3→L2→L1): hierarchical plan with parentId links
 * - Docs: populated by Cartographer (not seeded)
 */

import type { StorageAdapter, CreateNode, CreateEdge } from '$lib/storage/adapter';

const DAY_WIDTH = 300; // must match Canvas dayWidth default
const DAY_MS = 86_400_000;

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

/** Position a note on the time axis. daysAgo=0 means today, daysAgo=3 means 3 days ago. */
function timeX(daysAgo: number): number {
	return -daysAgo * DAY_WIDTH + 40;
}

interface SeedNode extends CreateNode {
	_key: string;
}

export async function seedDemo(storage: StorageAdapter, projectId: string) {
	const existing = await storage.listNodes({ projectId });
	if (existing.length > 0) return;

	const nodes: SeedNode[] = [
		// ═══════════════════════════════════════════════════════════
		// NOTES ZONE — L5 (raw thoughts on the time axis)
		// ═══════════════════════════════════════════════════════════

		// 5 days ago — early thinking
		{
			_key: 'note-initial',
			type: 'note',
			layer: 5,
			projectId,
			title: 'Atlas should compile thoughts into plans',
			body: body(
				'The core loop: dump thoughts → classify → structure into epics/tickets → export as executable plans. Think Notion meets Linear meets a whiteboard.'
			),
			status: 'active',
			positionX: timeX(5),
			positionY: 40
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
			positionX: timeX(5),
			positionY: 160
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
			positionX: timeX(5),
			positionY: 280
		},

		// 4 days ago
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
			positionX: timeX(4),
			positionY: 40
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
			positionX: timeX(4),
			positionY: 160
		},

		// 3 days ago
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
			positionX: timeX(3),
			positionY: 40
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
			positionX: timeX(3),
			positionY: 160
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
			positionX: timeX(3),
			positionY: 280
		},

		// 2 days ago
		{
			_key: 'idea-three-zones',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'Three zones: Notes, Planning, Docs',
			body: body(
				'Notes for raw thinking with AI chat. Planning for hierarchical drill-down (intents→epics→tickets). Docs auto-filled from repo analysis.'
			),
			status: 'done',
			payload: {
				chatHistory: [
					{
						role: 'user',
						content:
							'I want the app to have three distinct modes — one for raw thinking, one for structured planning, one for documentation'
					},
					{
						role: 'assistant',
						content:
							"That's a clean separation. The Notes zone is where ideas live before they're ready. Planning is where they get structured into a hierarchy. Docs is auto-maintained from your actual code. The key interaction is the integration flow — when a note is ready, AI helps slot it into the right place in the plan."
					}
				]
			},
			positionX: timeX(2),
			positionY: 40
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
			positionX: timeX(2),
			positionY: 160
		},

		// 1 day ago
		{
			_key: 'idea-time-axis',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'Canvas x-axis should represent time',
			body: body(
				'Notes placed on a timeline by default, so you can see the progression of your thinking. Days as default unit, zoom to weeks/months.'
			),
			status: 'done',
			positionX: timeX(1),
			positionY: 40
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
			positionX: timeX(1),
			positionY: 160
		},

		// Today
		{
			_key: 'note-today',
			type: 'note',
			layer: 5,
			projectId,
			title: 'Three zones working, planning hierarchy built',
			body: body(
				'Sidebar navigation between Notes/Planning/Docs is live. Planning zone has breadcrumb drill-down. Time axis on notes canvas. Next: wire up the integrate flow so notes can be promoted into the plan.'
			),
			status: 'active',
			positionX: timeX(0),
			positionY: 40
		},
		{
			_key: 'goal-integrate-flow',
			type: 'goal',
			layer: 5,
			projectId,
			title: 'Notes should flow into the plan automatically',
			body: body(
				'When a note is fleshed out via AI chat, clicking "Integrate" should analyze existing plan and slot it in — creating or updating epics/tickets as needed.'
			),
			status: 'active',
			positionX: timeX(0),
			positionY: 160
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L4 Features / Goals
		// ═══════════════════════════════════════════════════════════
		{
			_key: 'intent-mvp',
			type: 'feature',
			layer: 4,
			projectId,
			title: 'Ship browser-only MVP',
			body: body(
				'Working standalone canvas with brain dump, AI classification, and three-zone navigation. No server required.'
			),
			status: 'active',
			payload: {
				targetOutcome:
					'Users can dump 50+ notes, chat with AI to develop them, and see a structured plan emerge',
				deadline: '2026-06-01',
				tags: ['frontend', 'ai', 'canvas']
			},
			positionX: 100,
			positionY: 60
		},
		{
			_key: 'intent-github',
			type: 'feature',
			layer: 4,
			projectId,
			title: 'Bootstrap projects from GitHub',
			body: body(
				'Scan an existing repo, run Cartographer analysis, auto-generate docs and backfill planning history.'
			),
			status: 'active',
			payload: {
				targetOutcome:
					'Scanning a 500-PR repo fills in Docs zone and creates initial plan structure',
				deadline: '2026-07-15',
				tags: ['backend', 'github', 'ai']
			},
			positionX: 400,
			positionY: 60
		},
		{
			_key: 'intent-collab',
			type: 'goal',
			layer: 4,
			projectId,
			title: 'Enable team collaboration',
			body: body(
				'Docker Compose setup so a small team can share a single Atlas instance. Real-time sync via WebSockets.'
			),
			status: 'draft',
			payload: {
				targetOutcome: 'docker compose up → full stack running, 2+ users editing simultaneously',
				deadline: '2026-09-01',
				timeHorizon: 'quarter',
				tags: ['infra', 'backend']
			},
			positionX: 700,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L3 Epics (children of features/goals)
		// ═══════════════════════════════════════════════════════════
		{
			_key: 'epic-canvas',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Canvas interactions & polish',
			body: body(
				'Multi-select, box-select, edge drawing, undo/redo, context menu, time axis, 60fps pan/zoom.'
			),
			status: 'done',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: [],
				tags: ['frontend', 'canvas']
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'epic-classifier',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'AI classifier & edge inference',
			body: body(
				'Provider registry, callModel abstraction, heuristic fallback. Batch classify new notes, infer pairwise edges.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Which embedding model gives best cost/quality for edge inference?'],
				tags: ['ai', 'backend']
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'epic-zones',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Three-zone navigation',
			body: body(
				'Zone sidebar, Notes/Planning/Docs zones. Planning hierarchy with breadcrumb drill-down. Note AI chat panel.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: []
			},
			positionX: 620,
			positionY: 60
		},
		{
			_key: 'epic-integrate',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Notes → Plan integration flow',
			body: body(
				'When a note is fleshed out, AI analyzes it against the existing plan and proposes where to slot it in. User reviews and confirms.'
			),
			status: 'draft',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Should integration create new epics or only add to existing ones?']
			},
			positionX: 900,
			positionY: 60
		},
		{
			_key: 'epic-cartographer',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Cartographer & Docs zone',
			body: body(
				'Wire real Anthropic API calls, build docs UI with Architecture/Built/Planned/Questions pages from Cartographer findings.'
			),
			status: 'draft',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'epic-docker',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Docker Compose deployment',
			body: body('Multi-stage Dockerfiles, PG health checks, .env config, WebSocket proxy.'),
			status: 'draft',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: []
			},
			positionX: 340,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L2 Phases (children of epics)
		// ═══════════════════════════════════════════════════════════
		{
			_key: 'phase-provider-registry',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 1: Provider registry & callModel',
			body: body(
				'localStorage API keys, capability routing (classification → Anthropic, embedding → OpenAI), model prefs in settings.'
			),
			status: 'done',
			payload: {
				objective:
					'Stand up a pluggable provider registry so the rest of the AI stack has a stable callModel() abstraction',
				fileChanges: [
					{ path: 'src/lib/agents/providers.ts', action: 'create' },
					{ path: 'src/lib/agents/connector.svelte.ts', action: 'create' }
				],
				archNotes:
					'Capability-based routing pattern. Each provider registers capabilities (classification, embedding, chat). callModel() dispatches to the provider with the matching capability. This decouples feature code from specific LLM vendors.',
				verifyCriteria: [
					'callModel resolves with mock in tests',
					'Settings UI persists keys to localStorage'
				],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'phase-heuristic',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 2: Classification pipeline',
			body: body(
				'Heuristic fallback + LLM classifier + batch processing + classification result UI.'
			),
			status: 'active',
			payload: {
				objective:
					'Classify brain-dump notes into typed cards using heuristics first, then LLM for ambiguous cases',
				fileChanges: [
					{ path: 'src/lib/agents/classifier.ts', action: 'modify' },
					{ path: 'src/lib/components/ClassifyResultUI.svelte', action: 'create' }
				],
				archNotes: 'Heuristic fires first for instant feedback, LLM handles ambiguous cases',
				verifyCriteria: [
					'50-note brain dump classifies in <30s',
					'No 429 errors from API',
					'Heuristic handles 60%+ of common types'
				],
				complexity: 'high',
				contextBundle: []
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'phase-edge-inference',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 3: LLM edge inference',
			body: body(
				'Pairwise comparison with batching and caching. Connector runs in background, presents inferred edges for accept/dismiss.'
			),
			status: 'draft',
			payload: {
				objective:
					'Infer semantic edges between notes using embedding similarity and LLM pairwise comparison',
				fileChanges: [
					{ path: 'src/lib/agents/edgeInference.ts', action: 'create' },
					{ path: 'src/lib/components/EdgeAcceptUI.svelte', action: 'create' }
				],
				archNotes:
					'Fan-in pattern: embedding cache and pairwise engine must both complete before edge UI can render',
				verifyCriteria: [
					'Inferred edges appear within 10s for 20 notes',
					'Accept/dismiss persists edge decision',
					'Cached embeddings skip API calls'
				],
				complexity: 'high',
				contextBundle: []
			},
			positionX: 620,
			positionY: 60
		},
		{
			_key: 'phase-zone-shell',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 1: Zone shell & sidebar',
			body: body('Zone store, ZoneSidebar component, refactor +page.svelte to zone router.'),
			status: 'done',
			payload: {
				objective:
					'Create the three-zone navigation shell so users can switch between Notes, Planning, and Docs',
				fileChanges: [
					{ path: 'src/lib/stores/zone.svelte.ts', action: 'create' },
					{ path: 'src/lib/components/ZoneSidebar.svelte', action: 'create' }
				],
				archNotes:
					'Three-zone architecture uses a simple string-state store. Each zone is a top-level Svelte component receiving projectId. Zone switching is instant because all zones share the same reactive node store — no data reload needed.',
				verifyCriteria: [
					'Clicking zone icon switches view',
					'Active zone persists across page reloads'
				],
				complexity: 'low',
				contextBundle: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'phase-note-chat',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 2: Note AI chat panel',
			body: body(
				'NoteChatPanel with multi-turn OpenAI chat, chat history persisted in node payload, system prompt with project context.'
			),
			status: 'done',
			payload: {
				objective: 'Enable AI-assisted note development through multi-turn chat with context',
				fileChanges: [{ path: 'src/lib/components/NodeChatModal.svelte', action: 'create' }],
				archNotes: 'Chat history stored in node payload.chatHistory array',
				verifyCriteria: [
					'Chat history persists across modal close/reopen',
					'System prompt includes project context'
				],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'phase-planning-hierarchy',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 3: Planning hierarchy drill-down',
			body: body(
				'PlanningNav store, PlanningBreadcrumb, scoped Canvas/Kanban/Roadmap views at each level.'
			),
			status: 'done',
			payload: {
				objective:
					'Let users drill into feature→epic→phase→ticket hierarchy with breadcrumb navigation',
				fileChanges: [
					{ path: 'src/lib/stores/planningNav.svelte.ts', action: 'create' },
					{ path: 'src/lib/components/PlanningBreadcrumb.svelte', action: 'create' }
				],
				archNotes: 'Nav stack pattern — push on drill-down, pop on breadcrumb click',
				verifyCriteria: ['Breadcrumb shows full path', 'Back navigation works at every level'],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 620,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L1 Tickets (children of phases)
		// ═══════════════════════════════════════════════════════════

		// --- Phase 1: Provider Registry tickets (all done, all parallel) ---
		{
			_key: 'ticket-provider-registry',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Provider registry singleton',
			body: body(
				'Create a singleton registry that maps capabilities to provider configs. Support OpenAI and Anthropic initially.'
			),
			status: 'done',
			payload: {
				intent: 'Centralize API provider configuration so all AI features share one registry',
				filePaths: [{ repoId: 'atlas', path: 'src/lib/agents/providers.ts' }],
				acceptanceCriteria: [
					'Registry returns correct provider for each capability',
					'Adding a new provider requires only config'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 2 * DAY_MS).toISOString()
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-callmodel',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'callModel abstraction',
			body: body(
				'Unified callModel() function that routes to the correct provider based on capability type.'
			),
			status: 'done',
			payload: {
				intent: 'Provide a single function for all LLM calls regardless of provider',
				filePaths: [{ repoId: 'atlas', path: 'src/lib/agents/providers.ts' }],
				acceptanceCriteria: [
					'callModel resolves for classification capability',
					'callModel resolves for embedding capability'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 2 * DAY_MS).toISOString()
			},
			positionX: 200,
			positionY: 60
		},
		{
			_key: 'ticket-api-keys-ui',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Settings UI for API keys',
			body: body(
				'Settings panel where users enter API keys for each provider. Keys stored in localStorage.'
			),
			status: 'done',
			payload: {
				intent: 'Let users configure their own API keys without environment variables',
				filePaths: [],
				acceptanceCriteria: [
					'Keys persist in localStorage',
					'Masking input shows/hides key',
					'Invalid key shows error state'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 2 * DAY_MS).toISOString()
			},
			positionX: 340,
			positionY: 60
		},

		// --- Phase 2: Classification tickets (dependency chain) ---
		{
			_key: 'ticket-heuristic',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Heuristic classifier',
			body: body(
				'Keyword/prefix matching for common note types. Fires before LLM call for instant feedback.'
			),
			status: 'done',
			payload: {
				intent: 'Provide instant classification feedback while LLM processes ambiguous notes',
				filePaths: [{ repoId: 'atlas', path: 'src/lib/agents/classifier.ts' }],
				acceptanceCriteria: [
					'Classifies "Decision:" prefix as decision type',
					'Returns confidence score',
					'Falls through to LLM for low-confidence'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 1 * DAY_MS).toISOString()
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-llm-classify',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'LLM classifier integration',
			body: body(
				'Wire callModel to classify notes that the heuristic is uncertain about. Parse structured LLM response into type + confidence.'
			),
			status: 'active',
			payload: {
				intent: 'Handle ambiguous notes that heuristics cannot confidently classify',
				filePaths: [{ repoId: 'atlas', path: 'src/lib/agents/classifier.ts' }],
				acceptanceCriteria: [
					'LLM classification matches expected type for 90%+ test cases',
					'Structured response parsing handles edge cases'
				],
				promptPayload: ''
			},
			positionX: 200,
			positionY: 60
		},
		{
			_key: 'ticket-batch-classify',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Batch classification with rate limiting',
			body: body(
				'Process up to 10 notes per batch, 2s delay between batches, cache results in payload.'
			),
			status: 'active',
			payload: {
				intent: 'Prevent API rate limiting while classifying large brain dumps',
				filePaths: [{ repoId: 'atlas', path: 'src/lib/agents/classifier.ts' }],
				acceptanceCriteria: ['50-note brain dump classifies in <30s', 'No 429 errors from API'],
				promptPayload: ''
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'ticket-classify-ui',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Classification result UI',
			body: body(
				'Show classification results inline on note cards — type badge with confidence indicator and option to override.'
			),
			status: 'draft',
			payload: {
				intent:
					'Give users visibility into AI classification decisions and ability to correct them',
				filePaths: [],
				acceptanceCriteria: [
					'Shows type badge with confidence %',
					'Click badge opens type override dropdown',
					'Override persists to node'
				],
				promptPayload: ''
			},
			positionX: 480,
			positionY: 60
		},

		// --- Phase 3: Edge Inference tickets (fan-in pattern) ---
		{
			_key: 'ticket-embed-cache',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Embedding cache in IndexedDB',
			body: body(
				'Store embedding vectors per-node. Only re-embed when title or body changes. Expire after 7 days.'
			),
			status: 'draft',
			payload: {
				intent: 'Reduce embedding API calls by caching vectors locally',
				filePaths: [],
				acceptanceCriteria: [
					'Second edge-inference run on same notes uses 0 API calls',
					'Cache invalidates when node content changes'
				],
				promptPayload: ''
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-pairwise',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Pairwise comparison engine',
			body: body(
				'Compare embedding vectors pairwise, filter by cosine similarity threshold, batch LLM confirmation for top candidates.'
			),
			status: 'draft',
			payload: {
				intent: 'Efficiently find semantically related note pairs for edge inference',
				filePaths: [],
				acceptanceCriteria: [
					'Cosine similarity threshold filters 80%+ of pairs',
					'Batched LLM confirmation for remaining pairs',
					'Results cached per pair hash'
				],
				promptPayload: ''
			},
			positionX: 200,
			positionY: 60
		},
		{
			_key: 'ticket-edge-ui',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Edge accept/dismiss UI',
			body: body(
				'Present inferred edges to user with accept/dismiss buttons. Accepted edges become permanent, dismissed are suppressed.'
			),
			status: 'draft',
			payload: {
				intent: 'Let users curate AI-inferred edges with minimal friction',
				filePaths: [],
				acceptanceCriteria: [
					'Inferred edges shown in a review panel',
					'Accept creates edge in storage',
					'Dismiss suppresses re-suggestion'
				],
				promptPayload: ''
			},
			positionX: 340,
			positionY: 60
		},

		// --- Zones epic tickets ---
		{
			_key: 'ticket-integrate-ui',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Build "Integrate into plan" confirmation dialog',
			body: body(
				'When user clicks Integrate, show proposed actions (create epic, add ticket, link to intent) with confirm/reject per action.'
			),
			status: 'draft',
			payload: {
				intent: 'Let users review AI integration proposals before executing',
				filePaths: [],
				acceptanceCriteria: [
					'Shows preview of all proposed node creates/updates',
					'User can reject individual actions',
					'Executes approved actions atomically'
				],
				promptPayload: ''
			},
			positionX: 60,
			positionY: 60
		}
	];

	// ── Create all nodes and build ID map ──────────────────────
	const idMap = new Map<string, string>();

	for (const seed of nodes) {
		const { _key, ...input } = seed;
		const created = await storage.createNode(input);
		idMap.set(_key, created.id);
	}

	// ── Wire parent IDs ────────────────────────────────────────
	const parentLinks: [string, string][] = [
		// Epics → Intents
		['epic-canvas', 'intent-mvp'],
		['epic-classifier', 'intent-mvp'],
		['epic-zones', 'intent-mvp'],
		['epic-integrate', 'intent-mvp'],
		['epic-cartographer', 'intent-github'],
		['epic-docker', 'intent-collab'],
		// Phases → Epics
		['phase-provider-registry', 'epic-classifier'],
		['phase-heuristic', 'epic-classifier'],
		['phase-edge-inference', 'epic-classifier'],
		['phase-zone-shell', 'epic-zones'],
		['phase-note-chat', 'epic-zones'],
		['phase-planning-hierarchy', 'epic-zones'],
		// Tickets → Phases (Phase 1: Provider Registry — all parallel)
		['ticket-provider-registry', 'phase-provider-registry'],
		['ticket-callmodel', 'phase-provider-registry'],
		['ticket-api-keys-ui', 'phase-provider-registry'],
		// Tickets → Phases (Phase 2: Classification — dependency chain)
		['ticket-heuristic', 'phase-heuristic'],
		['ticket-llm-classify', 'phase-heuristic'],
		['ticket-batch-classify', 'phase-heuristic'],
		['ticket-classify-ui', 'phase-heuristic'],
		// Tickets → Phases (Phase 3: Edge Inference — fan-in)
		['ticket-embed-cache', 'phase-edge-inference'],
		['ticket-pairwise', 'phase-edge-inference'],
		['ticket-edge-ui', 'phase-edge-inference'],
		// Tickets → Phases (Zones epic)
		['ticket-integrate-ui', 'phase-note-chat']
	];
	for (const [child, parent] of parentLinks) {
		const childId = idMap.get(child);
		const parentIdVal = idMap.get(parent);
		if (childId && parentIdVal) {
			await storage.updateNode(childId, { parentId: parentIdVal });
		}
	}

	// ── Create edges ───────────────────────────────────────────
	const edges: (CreateEdge & { _src: string; _tgt: string })[] = [
		// Notes ↔ Notes relationships
		{
			_src: 'insight-brain-dump',
			_tgt: 'note-initial',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'risk-llm-cost',
			_tgt: 'question-embedding',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.8,
			source: 'ai'
		},
		{
			_src: 'hypothesis-ai-edges',
			_tgt: 'question-embedding',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.7,
			source: 'ai'
		},
		{
			_src: 'idea-three-zones',
			_tgt: 'note-initial',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.85,
			source: 'ai'
		},
		{
			_src: 'constraint-no-server',
			_tgt: 'idea-export-claude',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.6,
			source: 'ai'
		},
		{
			_src: 'problem-dedup',
			_tgt: 'insight-brain-dump',
			sourceId: '',
			targetId: '',
			relationType: 'contradicts',
			weight: 0.5,
			source: 'ai'
		},
		{
			_src: 'goal-integrate-flow',
			_tgt: 'idea-three-zones',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.9,
			source: 'ai'
		},
		// Plan nodes → source notes (refines edges for lineage tracing)
		{
			_src: 'epic-zones',
			_tgt: 'idea-three-zones',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-classifier',
			_tgt: 'hypothesis-ai-edges',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-canvas',
			_tgt: 'note-initial',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'phase-provider-registry',
			_tgt: 'decision-svelte5',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		// Dependency (blocks) edges — within-phase ticket dependencies
		{
			_src: 'ticket-llm-classify',
			_tgt: 'ticket-batch-classify',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-llm-classify',
			_tgt: 'ticket-classify-ui',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-embed-cache',
			_tgt: 'ticket-edge-ui',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-pairwise',
			_tgt: 'ticket-edge-ui',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		// Phase-level sequential ordering
		{
			_src: 'phase-provider-registry',
			_tgt: 'phase-heuristic',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'phase-heuristic',
			_tgt: 'phase-edge-inference',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		// Planning hierarchy edges
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
			_src: 'epic-zones',
			_tgt: 'intent-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-cartographer',
			_tgt: 'intent-github',
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
