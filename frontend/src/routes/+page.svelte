<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import RoadmapView from '$lib/components/RoadmapView.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import ClusterPanel from '$lib/components/ClusterPanel.svelte';
	import IntentPanel from '$lib/components/IntentPanel.svelte';
	import BrainDumpDialog from '$lib/components/BrainDumpDialog.svelte';
	import ProjectSwitcher from '$lib/components/ProjectSwitcher.svelte';
	import NodeDetailPanel from '$lib/components/NodeDetailPanel.svelte';
	import ConnectorStatus from '$lib/components/ConnectorStatus.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import LogPanel from '$lib/components/LogPanel.svelte';
	import ConnectRepoDialog from '$lib/components/ConnectRepoDialog.svelte';
	import AnalysisReviewDialog from '$lib/components/AnalysisReviewDialog.svelte';
	import { createStorage } from '$lib/storage';
	import type { Node, NodeEdge, StorageAdapter } from '$lib/storage/adapter';
	import {
		startConnector,
		stopConnector,
		debounceClassification
	} from '$lib/agents/connector.svelte';
	import {
		loadGlobalContext,
		getGlobalContext,
		setGlobalContext
	} from '$lib/stores/globalContext.svelte';
	import { callModel } from '$lib/agents/providers';
	import { dismissEdge } from '$lib/services/edge-inference';
	import { seedDemo } from '$lib/seed-demo';
	import {
		initStore,
		getProjectNodes,
		getAllEdges,
		createNode,
		updateNode,
		deleteNode,
		createEdge,
		deleteEdge,
		setProject,
		getNode
	} from '$lib/stores/nodes.svelte';
	import { pushOperation, undo, redo, canUndo, canRedo } from '$lib/stores/history.svelte';
	import { loadNodes } from '$lib/stores/nodes.svelte';
	import type { UpdateNodeInput } from '$lib/schemas/node';

	type ViewMode = 'canvas' | 'kanban' | 'graph' | 'roadmap';

	let gridSnap = $state(true);
	let view = $state<ViewMode>('canvas');
	let projectId = $state<string>('');
	let ready = $state(false);
	let showIntents = $state(false);
	let showBrainDump = $state(false);
	let showCommandPalette = $state(false);
	let showClusters = $state(false);
	let selectedNodeIds = $state<Set<string>>(new Set());
	let showSettings = $state(false);
	let showLog = $state(false);
	let showConnectRepo = $state(false);
	let showAnalysis = $state(false);
	let connectedRepo = $state<{ id: string; full_name: string } | null>(null);
	let pendingAgentRunId = $state<string | null>(null);
	let workspaceId = $state<string>('');
	let showContext = $state(false);
	let contextDraft = $state('');
	let synthesizing = $state(false);
	let storageRef: StorageAdapter | null = null;
	let detailNodeId = $state<string | null>(null);
	let detailNode = $derived(detailNodeId ? (getNode(detailNodeId) ?? null) : null);

	function handleOpenNode(id: string) {
		detailNodeId = id;
	}

	let projectNodes = $derived(getProjectNodes());
	let projectEdges = $derived(getAllEdges());

	// Project tracking
	let projects = $state<Array<{ id: string; name: string; color?: string | null }>>([]);

	const PROJECT_COLORS = [
		'#6366f1',
		'#22c55e',
		'#f97316',
		'#06b6d4',
		'#ec4899',
		'#eab308',
		'#8b5cf6'
	];

	onMount(async () => {
		const storage = createStorage();

		// Clear stale data and reseed when seed version changes
		const SEED_VERSION = '2';
		const storedVersion = localStorage.getItem('atlas_seed_version');
		if (storedVersion !== SEED_VERSION) {
			// Clear old IndexedDB data so demo seed runs fresh
			const staleNodes = await storage.listNodes({});
			for (const node of staleNodes) {
				await storage.deleteNode(node.id);
			}
			localStorage.setItem('atlas_seed_version', SEED_VERSION);
		}

		const allNodes = await storage.listNodes({});
		const projectMap = new Map<string, string>();
		for (const node of allNodes) {
			if (!projectMap.has(node.projectId)) {
				projectMap.set(node.projectId, node.projectId);
			}
		}

		if (projectMap.size > 0) {
			projects = Array.from(projectMap.keys()).map((id, i) => ({
				id,
				name: i === 0 ? 'Atlas v1 Launch' : `Project ${i + 1}`,
				color: PROJECT_COLORS[i % PROJECT_COLORS.length]
			}));
			projectId = projects[0].id;
		} else {
			projectId = crypto.randomUUID();
			projects = [{ id: projectId, name: 'Atlas v1 Launch', color: PROJECT_COLORS[0] }];
			await seedDemo(storage, projectId);
		}

		await initStore(storage, projectId);
		storageRef = storage;
		loadGlobalContext(projectId);
		contextDraft = getGlobalContext();
		startConnector(storage, projectId);
		ready = true;
	});

	onDestroy(() => {
		stopConnector();
	});

	// Global keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// ⌘K — Command palette
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			showCommandPalette = !showCommandPalette;
			return;
		}
		// ⌘Z — Undo
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
			return;
		}
		// ⌘⇧Z — Redo
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
			e.preventDefault();
			redo();
			return;
		}
	}

	async function handleSwitchProject(id: string) {
		projectId = id;
		await setProject(id);
	}

	function handleCreateProject() {
		const newId = crypto.randomUUID();
		const idx = projects.length;
		projects = [
			...projects,
			{ id: newId, name: `Project ${idx + 1}`, color: PROJECT_COLORS[idx % PROJECT_COLORS.length] }
		];
		handleSwitchProject(newId);
	}

	async function handleCreateNote(x: number, y: number) {
		const node = await createNode({
			type: 'note',
			layer: 5,
			projectId,
			title: 'Untitled',
			status: 'draft',
			positionX: x,
			positionY: y
		});
		pushOperation({ type: 'create_node', node });
		// Classification fires when the user edits the title (via debounceClassification)
	}

	async function handleAcceptEdge(sourceId: string, targetId: string, relationType: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType,
			source: 'ai'
		});
		pushOperation({ type: 'create_edge', edge });
	}

	function handleDismissEdge(sourceId: string, targetId: string) {
		dismissEdge(sourceId, targetId);
	}

	async function handleSynthesize(ids: string[]) {
		if (ids.length < 2 || synthesizing) return;
		synthesizing = true;

		try {
			const sourceNodes = ids.map((id) => getNode(id)).filter(Boolean) as Node[];
			if (sourceNodes.length < 2) return;

			const centroidX =
				sourceNodes.reduce((s, n) => s + (n.positionX ?? 0), 0) / sourceNodes.length - 120;
			const centroidY =
				sourceNodes.reduce((s, n) => s + (n.positionY ?? 0), 0) / sourceNodes.length - 160;

			const noteList = sourceNodes.map((n) => `[${n.type}] ${n.title}`).join('\n');

			const allTags = Array.from(
				new Set(
					sourceNodes.flatMap((n) =>
						Array.isArray(n.payload?.tags) ? (n.payload!.tags as string[]) : []
					)
				)
			);

			let epicTitle = sourceNodes.map((n) => n.title.split(' ').slice(0, 2).join(' ')).join(' + ');
			let epicBody = `Synthesized from ${sourceNodes.length} notes: ${sourceNodes.map((n) => n.title).join(', ')}`;

			const gc = getGlobalContext();
			const systemPrompt = `You are a project synthesizer for Atlas. Given a set of related notes, synthesize them into a single epic. Return ONLY JSON: {"title": "...", "body": "..."}`;
			const userMsg = `Notes:\n${noteList}${gc ? `\n\nProject context:\n${gc}` : ''}`;

			try {
				const response = await callModel('synthesis', systemPrompt, userMsg, 512);
				if (response) {
					const jsonMatch = response.text.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						const parsed = JSON.parse(jsonMatch[0]);
						if (parsed.title) epicTitle = parsed.title;
						if (parsed.body) epicBody = parsed.body;
					}
				}
			} catch {
				/* use fallback title/body */
			}

			const epic = await createNode({
				type: 'epic',
				layer: 4,
				projectId,
				title: epicTitle,
				body: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: epicBody }] }]
				},
				payload: { tags: allTags },
				status: 'draft',
				positionX: Math.round(centroidX),
				positionY: Math.round(centroidY)
			});
			pushOperation({ type: 'create_node', node: epic });

			for (const n of sourceNodes) {
				await createEdge({
					sourceId: epic.id,
					targetId: n.id,
					relationType: 'refines',
					source: 'ai'
				});
			}

			selectedNodeIds = new Set([epic.id]);
			detailNodeId = epic.id;
		} catch (e) {
			console.error('Synthesize failed:', e);
		} finally {
			synthesizing = false;
		}
	}

	async function handleMoveNote(id: string, x: number, y: number) {
		await updateNode(id, { positionX: x, positionY: y });
	}

	async function handleUpdateNode(id: string, patch: Partial<Node>) {
		const existing = getNode(id);
		const allowed: UpdateNodeInput = {};
		if (patch.type !== undefined) allowed.type = patch.type as UpdateNodeInput['type'];
		if (patch.title !== undefined) allowed.title = patch.title;
		if (patch.body !== undefined) allowed.body = patch.body;
		if (patch.payload !== undefined) allowed.payload = patch.payload;
		if (patch.status !== undefined) allowed.status = patch.status as UpdateNodeInput['status'];
		if (patch.positionX !== undefined) allowed.positionX = patch.positionX;
		if (patch.positionY !== undefined) allowed.positionY = patch.positionY;
		if (patch.parentId !== undefined) allowed.parentId = patch.parentId;

		const before: Partial<Node> = {};
		if (existing) {
			const existingAny = existing as unknown as Record<string, unknown>;
			for (const key of Object.keys(allowed) as (keyof UpdateNodeInput)[]) {
				(before as Record<string, unknown>)[key] = existingAny[key];
			}
		}

		await updateNode(id, allowed);
		pushOperation({ type: 'update_node', id, before, after: allowed });

		// Re-classify if title or body changed — debounced so we wait for editing to stop
		if (allowed.title !== undefined || allowed.body !== undefined) {
			debounceClassification(id);
		}
	}

	async function handleDeleteNodes(ids: string[]) {
		const ops = [];
		for (const id of ids) {
			const node = getNode(id);
			if (node) {
				ops.push({ type: 'delete_node' as const, node });
				await deleteNode(id);
			}
		}
		if (ops.length > 0) {
			pushOperation(ops.length === 1 ? ops[0] : { type: 'batch', operations: ops });
		}
		selectedNodeIds = new Set();
	}

	async function handleCreateEdge(sourceId: string, targetId: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType: 'supports',
			source: 'human'
		});
		pushOperation({ type: 'create_edge', edge });
	}

	function handleSelectNodes(ids: Set<string>) {
		selectedNodeIds = ids;
	}

	async function handleAnalyze() {
		if (!connectedRepo) return;
		try {
			const res = await fetch(`/api/repos/${connectedRepo.id}/analyze`, { method: 'POST' });
			if (!res.ok) throw new Error('Analyze request failed');
			const data = await res.json();
			pendingAgentRunId = data.agent_run_id;
			showAnalysis = true;
		} catch (e) {
			console.error('Analyze failed:', e);
		}
	}

	// Command palette actions
	function handlePaletteAction(action: string, payload?: unknown) {
		showCommandPalette = false;
		switch (action) {
			case 'new_note':
				handleCreateNote(200, 200);
				break;
			case 'switch_view':
				view = payload as ViewMode;
				break;
			case 'toggle_intents':
				showIntents = !showIntents;
				break;
			case 'import':
				showBrainDump = true;
				break;
			case 'undo':
				undo();
				break;
			case 'redo':
				redo();
				break;
			case 'select_node':
				if (typeof payload === 'string') {
					selectedNodeIds = new Set([payload]);
					view = 'canvas';
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="h-screen w-screen bg-neutral-950">
	<!-- Toolbar -->
	<div class="absolute top-3 left-3 z-10 flex items-center gap-2">
		<span class="text-sm font-semibold tracking-tight text-neutral-300">Atlas</span>
		<span class="text-neutral-700">|</span>

		<ProjectSwitcher
			{projects}
			currentProjectId={projectId}
			onSwitch={handleSwitchProject}
			onCreate={handleCreateProject}
		/>

		<span class="text-neutral-700">|</span>

		{#each ['canvas', 'kanban', 'graph', 'roadmap'] as v}
			<button
				class="rounded px-2 py-0.5 text-xs capitalize transition-colors {view === v
					? 'bg-neutral-700 text-neutral-200'
					: 'text-neutral-500 hover:text-neutral-300'}"
				onclick={() => (view = v as ViewMode)}
			>
				{v}
			</button>
		{/each}

		{#if view === 'canvas'}
			<span class="text-neutral-700">|</span>
			<button
				class="rounded px-2 py-0.5 text-xs transition-colors {gridSnap
					? 'bg-neutral-700 text-neutral-200'
					: 'text-neutral-500 hover:text-neutral-300'}"
				onclick={() => (gridSnap = !gridSnap)}
			>
				Grid snap
			</button>
		{/if}

		<span class="text-neutral-700">|</span>

		<button
			class="rounded px-2 py-0.5 text-xs transition-colors {showIntents
				? 'bg-teal-700 text-teal-200'
				: 'text-neutral-500 hover:text-neutral-300'}"
			onclick={() => (showIntents = !showIntents)}
		>
			Intents
		</button>

		<button
			class="rounded px-2 py-0.5 text-xs transition-colors {showClusters
				? 'bg-purple-700 text-purple-200'
				: 'text-neutral-500 hover:text-neutral-300'}"
			onclick={() => (showClusters = !showClusters)}
		>
			Clusters
		</button>

		<button
			class="rounded px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
			onclick={() => (showBrainDump = true)}
		>
			Import
		</button>

		<button
			class="rounded px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
			onclick={() => (showCommandPalette = true)}
			title="⌘K"
		>
			⌘K
		</button>

		<span class="text-neutral-700">|</span>

		<ConnectorStatus onAcceptEdge={handleAcceptEdge} onDismissEdge={handleDismissEdge} />

		{#if selectedNodeIds.size >= 2}
			<button
				class="rounded px-2 py-0.5 text-xs transition-colors"
				class:opacity-50={synthesizing}
				style="color: #a78bfa; border: 1px solid #4c1d95;"
				onclick={() => handleSynthesize([...selectedNodeIds])}
				disabled={synthesizing}
				title="Synthesize selected into epic"
			>
				{synthesizing ? '…' : `◈ Synthesize (${selectedNodeIds.size})`}
			</button>
		{/if}

		<span class="text-neutral-700">|</span>

		<button
			class="rounded px-2 py-0.5 text-xs transition-colors"
			class:text-neutral-300={showContext}
			class:text-neutral-500={!showContext}
			onclick={() => {
				showContext = !showContext;
				contextDraft = getGlobalContext();
			}}
			title="Global Context"
		>
			⊕
		</button>

		<button
			class="rounded px-2 py-0.5 text-xs transition-colors"
			class:text-neutral-300={showLog}
			class:text-neutral-500={!showLog}
			onclick={() => (showLog = !showLog)}
			title="Activity Log"
		>
			≡
		</button>

		<button
			class="rounded px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
			onclick={() => (showSettings = true)}
			title="Settings"
		>
			⚙
		</button>

		<span class="text-neutral-700">|</span>

		{#if connectedRepo}
			<span class="text-xs text-neutral-500">{connectedRepo.full_name}</span>
			<button
				class="rounded px-2 py-0.5 text-xs text-emerald-500 transition-colors hover:text-emerald-300"
				onclick={handleAnalyze}
			>
				Analyze
			</button>
		{:else}
			<button
				class="rounded px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
				onclick={() => (showConnectRepo = true)}
			>
				Connect Repo
			</button>
		{/if}
	</div>

	{#if !ready}
		<div class="flex h-full items-center justify-center text-neutral-600">
			<p class="text-sm">Loading...</p>
		</div>
	{:else}
		{#if projectNodes.length === 0 && view === 'canvas'}
			<div
				class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-neutral-600"
			>
				<p class="text-sm">Double-click to create a note</p>
			</div>
		{/if}

		{#if view === 'canvas'}
			<Canvas
				nodes={projectNodes}
				edges={projectEdges}
				{gridSnap}
				selectedIds={selectedNodeIds}
				onCreateNote={handleCreateNote}
				onMoveNote={handleMoveNote}
				onUpdateNode={handleUpdateNode}
				onDeleteNodes={handleDeleteNodes}
				onSelectNodes={handleSelectNodes}
				onCreateEdge={handleCreateEdge}
				onOpenNode={handleOpenNode}
				onSynthesize={handleSynthesize}
			/>
		{:else if view === 'kanban'}
			<div class="pt-10 h-full">
				<KanbanView
					nodes={projectNodes}
					onUpdateNode={handleUpdateNode}
					onOpenNode={handleOpenNode}
				/>
			</div>
		{:else if view === 'graph'}
			<div class="pt-10 h-full">
				<GraphView
					nodes={projectNodes}
					edges={projectEdges}
					selectedIds={selectedNodeIds}
					onSelectNode={(id) => (selectedNodeIds = new Set([id]))}
					onOpenNode={handleOpenNode}
				/>
			</div>
		{:else if view === 'roadmap'}
			<div class="pt-10 h-full">
				<RoadmapView
					nodes={projectNodes}
					onUpdateNode={handleUpdateNode}
					onOpenNode={handleOpenNode}
				/>
			</div>
		{/if}
	{/if}

	{#if showIntents}
		<IntentPanel {projectId} onClose={() => (showIntents = false)} />
	{/if}

	{#if showClusters}
		<ClusterPanel
			nodes={projectNodes}
			edges={projectEdges}
			onClose={() => (showClusters = false)}
		/>
	{/if}

	{#if showBrainDump}
		<BrainDumpDialog {projectId} onClose={() => (showBrainDump = false)} />
	{/if}

	{#if showCommandPalette}
		<CommandPalette
			nodes={projectNodes}
			currentView={view}
			onAction={handlePaletteAction}
			onClose={() => (showCommandPalette = false)}
		/>
	{/if}

	{#if detailNode}
		<NodeDetailPanel
			node={detailNode}
			onUpdateNode={handleUpdateNode}
			onClose={() => (detailNodeId = null)}
		/>
	{/if}

	{#if showSettings}
		<SettingsDialog onClose={() => (showSettings = false)} />
	{/if}

	{#if showLog}
		<LogPanel onClose={() => (showLog = false)} />
	{/if}

	{#if showConnectRepo}
		<ConnectRepoDialog
			{projectId}
			onConnected={(repo) => {
				connectedRepo = repo;
				showConnectRepo = false;
			}}
			onClose={() => (showConnectRepo = false)}
		/>
	{/if}

	{#if showAnalysis && pendingAgentRunId && connectedRepo}
		<AnalysisReviewDialog
			agentRunId={pendingAgentRunId}
			repoId={connectedRepo.id}
			{projectId}
			onImported={async () => {
				showAnalysis = false;
				pendingAgentRunId = null;
				await loadNodes({ projectId });
			}}
			onClose={() => {
				showAnalysis = false;
				pendingAgentRunId = null;
			}}
		/>
	{/if}

	{#if showContext}
		<div class="context-panel">
			<div class="context-header">
				<span class="context-title">Global Context</span>
				<span class="context-hint">Passed to every AI call as background</span>
				<button
					class="context-close"
					onclick={() => {
						setGlobalContext(contextDraft);
						showContext = false;
					}}>Save & close</button
				>
			</div>
			<textarea
				class="context-body"
				placeholder="Describe your project, goals, constraints, key decisions... This is sent as background context to every AI classification and synthesis call."
				bind:value={contextDraft}
				onblur={() => setGlobalContext(contextDraft)}
			></textarea>
		</div>
	{/if}
</div>

<style>
	.context-panel {
		position: fixed;
		right: 0;
		top: 40px;
		bottom: 0;
		width: 320px;
		background: #0f0f0f;
		border-left: 1px solid #1f1f1f;
		display: flex;
		flex-direction: column;
		z-index: 4000;
	}

	.context-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.context-title {
		font-size: 11px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.context-hint {
		font-size: 10px;
		color: #404040;
		flex: 1;
	}

	.context-close {
		background: none;
		border: 1px solid #333;
		color: #737373;
		font-size: 10px;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: pointer;
	}

	.context-close:hover {
		color: #a3a3a3;
		border-color: #525252;
	}

	.context-body {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: #a3a3a3;
		font-size: 12px;
		line-height: 1.6;
		padding: 14px;
		resize: none;
		font-family: inherit;
	}

	.context-body::placeholder {
		color: #2a2a2a;
	}
</style>
