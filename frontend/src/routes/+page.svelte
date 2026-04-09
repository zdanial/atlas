<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import ZoneSidebar from '$lib/components/ZoneSidebar.svelte';
	import NotesZone from '$lib/components/NotesZone.svelte';
	import PlanningZone from '$lib/components/PlanningZone.svelte';
	import DocsZone from '$lib/components/DocsZone.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import LogPanel from '$lib/components/LogPanel.svelte';
	import ConnectRepoDialog from '$lib/components/ConnectRepoDialog.svelte';
	import AnalysisReviewDialog from '$lib/components/AnalysisReviewDialog.svelte';
	import { createStorage } from '$lib/storage';
	import type { StorageAdapter } from '$lib/storage/adapter';
	import { startConnector, stopConnector } from '$lib/agents/connector.svelte';
	import {
		loadGlobalContext,
		getGlobalContext,
		setGlobalContext
	} from '$lib/stores/globalContext.svelte';
	import { seedDemo } from '$lib/seed-demo';
	import { initStore, getProjectNodes, setProject, loadNodes } from '$lib/stores/nodes.svelte';
	import { undo, redo } from '$lib/stores/history.svelte';
	import { getActiveZone, setActiveZone, type Zone } from '$lib/stores/zone.svelte';

	let projectId = $state<string>('');
	let ready = $state(false);
	let showSettings = $state(false);
	let showLog = $state(false);
	let showCommandPalette = $state(false);
	let showConnectRepo = $state(false);
	let showAnalysis = $state(false);
	let showContext = $state(false);
	let contextDraft = $state('');
	let connectedRepo = $state<{ id: string; full_name: string } | null>(null);
	let pendingAgentRunId = $state<string | null>(null);
	let workspaceId = $state<string>('');
	let storageRef: StorageAdapter | null = null;

	let activeZone = $derived(getActiveZone());
	let projectNodes = $derived(getProjectNodes());

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
		const SEED_VERSION = '4';
		const storedVersion = localStorage.getItem('atlas_seed_version');
		if (storedVersion !== SEED_VERSION) {
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
		// ⌘1/2/3 — Zone switching
		if ((e.metaKey || e.ctrlKey) && e.key === '1') {
			e.preventDefault();
			setActiveZone('notes');
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === '2') {
			e.preventDefault();
			setActiveZone('planning');
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === '3') {
			e.preventDefault();
			setActiveZone('docs');
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

	// Command palette actions
	function handlePaletteAction(action: string, payload?: unknown) {
		showCommandPalette = false;
		switch (action) {
			case 'new_note':
				setActiveZone('notes');
				break;
			case 'switch_view':
				// View switching now handled within zones
				break;
			case 'go_notes':
				setActiveZone('notes');
				break;
			case 'go_planning':
				setActiveZone('planning');
				break;
			case 'go_docs':
				setActiveZone('docs');
				break;
			case 'undo':
				undo();
				break;
			case 'redo':
				redo();
				break;
			case 'select_node':
				setActiveZone('notes');
				break;
		}
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
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="app-shell">
	{#if !ready}
		<div class="loading">
			<p>Loading...</p>
		</div>
	{:else}
		<ZoneSidebar
			{activeZone}
			{projects}
			currentProjectId={projectId}
			onZoneChange={setActiveZone}
			onSwitchProject={handleSwitchProject}
			onCreateProject={handleCreateProject}
			onOpenSettings={() => (showSettings = true)}
		/>

		<main class="zone-content">
			<!-- Zone top-right controls -->
			<div class="global-controls">
				<button
					class="gc-btn"
					onclick={() => (showCommandPalette = true)}
					title="Command palette (⌘K)"
				>
					⌘K
				</button>
				<button
					class="gc-btn"
					class:active={showContext}
					onclick={() => {
						showContext = !showContext;
						contextDraft = getGlobalContext();
					}}
					title="Global Context"
				>
					⊕
				</button>
				<button
					class="gc-btn"
					class:active={showLog}
					onclick={() => (showLog = !showLog)}
					title="Activity Log"
				>
					≡
				</button>

				{#if connectedRepo}
					<span class="repo-name">{connectedRepo.full_name}</span>
					<button class="gc-btn repo" onclick={handleAnalyze}>Analyze</button>
				{:else}
					<button class="gc-btn" onclick={() => (showConnectRepo = true)}>Connect Repo</button>
				{/if}
			</div>

			{#if activeZone === 'notes'}
				<NotesZone {projectId} />
			{:else if activeZone === 'planning'}
				<PlanningZone {projectId} />
			{:else if activeZone === 'docs'}
				<DocsZone {projectId} />
			{/if}
		</main>
	{/if}

	<!-- Global overlays -->
	{#if showCommandPalette}
		<CommandPalette
			nodes={projectNodes}
			currentView="canvas"
			onAction={handlePaletteAction}
			onClose={() => (showCommandPalette = false)}
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
	.app-shell {
		display: flex;
		height: 100vh;
		width: 100vw;
		background: #0a0a0a;
		overflow: hidden;
	}

	.loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #404040;
		font-size: 13px;
	}

	.zone-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		position: relative;
	}

	.global-controls {
		position: absolute;
		top: 6px;
		right: 12px;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.gc-btn {
		background: none;
		border: none;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 11px;
		color: #525252;
		cursor: pointer;
		transition: all 0.15s;
	}

	.gc-btn:hover {
		color: #a3a3a3;
	}

	.gc-btn.active {
		color: #d4d4d4;
	}

	.gc-btn.repo {
		color: #34d399;
	}

	.repo-name {
		font-size: 11px;
		color: #404040;
	}

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
