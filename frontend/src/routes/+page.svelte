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
	import { loadGlobalContext } from '$lib/stores/globalContext.svelte';
	import GlobalContextPanel from '$lib/components/GlobalContextPanel.svelte';
	import { seedDemo } from '$lib/seed-demo';
	import { initStore, getProjectNodes, setProject, loadNodes } from '$lib/stores/nodes.svelte';
	import { undo, redo } from '$lib/stores/history.svelte';
	import { initInboxStore } from '$lib/stores/inboxStore.svelte';
	import { getActiveZone, setActiveZone, type Zone } from '$lib/stores/zone.svelte';
	import DemoOverlay from '$lib/components/DemoOverlay.svelte';
	import { isDemoActive, startDemo } from '$lib/demo/store.svelte';
	import { onDemoAction } from '$lib/demo/actions';
	import { loadProjects, saveProjects, upsertProject } from '$lib/stores/projects';
	import { logInfo, logSuccess, logError, logWarn } from '$lib/stores/log.svelte';
	import { startWs, stopWs, pipeWsToActivityLog } from '$lib/services/ws';
	import { syncBackendNodesToLocal } from '$lib/services/backend-sync';

	let projectId = $state<string>('');
	let ready = $state(false);
	let showSettings = $state(false);
	let showLog = $state(false);
	let showCommandPalette = $state(false);
	let showConnectRepo = $state(false);
	let showAnalysis = $state(false);
	let showContext = $state(false);
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
		const SEED_VERSION = '6';
		const storedVersion = localStorage.getItem('butterfly_seed_version');
		if (storedVersion !== SEED_VERSION) {
			const staleNodes = await storage.listNodes({});
			for (const node of staleNodes) {
				await storage.deleteNode(node.id);
			}
			localStorage.setItem('butterfly_seed_version', SEED_VERSION);
		}

		// Merge persisted project list with any project IDs found in nodes.
		// Persisted entries keep their custom names (e.g. "atlas" for an imported repo).
		const persisted = loadProjects();
		const persistedById = new Map(persisted.map((p) => [p.id, p]));

		const allNodes = await storage.listNodes({});
		const nodeProjectIds = new Set<string>();
		for (const node of allNodes) nodeProjectIds.add(node.projectId);

		// Add any node-derived projects that aren't persisted yet
		for (const id of nodeProjectIds) {
			if (!persistedById.has(id)) {
				const idx = persistedById.size;
				persistedById.set(id, {
					id,
					name: idx === 0 ? 'TaskFlow' : `Project ${idx + 1}`,
					color: PROJECT_COLORS[idx % PROJECT_COLORS.length]
				});
			}
		}

		if (persistedById.size === 0) {
			// First-run: seed demo
			const newId = crypto.randomUUID();
			persistedById.set(newId, { id: newId, name: 'TaskFlow', color: PROJECT_COLORS[0] });
			await seedDemo(storage, newId);
		}

		projects = Array.from(persistedById.values());
		saveProjects(projects);
		projectId = projects[0].id;

		await initStore(storage, projectId);
		await initInboxStore();
		storageRef = storage;
		loadGlobalContext(projectId);
		startConnector(storage, projectId);

		// Open WebSocket + pipe backend events into the activity log
		pipeWsToActivityLog();
		startWs();

		ready = true;
	});

	let demoCleanups: Array<() => void> = [];

	onMount(() => {
		demoCleanups.push(
			onDemoAction('demo:open-context-panel', () => {
				showCommandPalette = false;
				showContext = true;
			}),
			onDemoAction('demo:open-command-palette', () => {
				showCommandPalette = true;
			}),
			onDemoAction('demo:close-command-palette', () => {
				showCommandPalette = false;
			})
		);
	});

	onDestroy(() => {
		stopConnector();
		stopWs();
		demoCleanups.forEach((fn) => fn());
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
		const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
		const entry = { id: newId, name: `Project ${idx + 1}`, color };
		projects = [...projects, entry];
		upsertProject(entry);
		handleSwitchProject(newId);
	}

	function addProject(id: string, name: string) {
		if (projects.some((p) => p.id === id)) return;
		const idx = projects.length;
		const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
		const entry = { id, name, color };
		projects = [...projects, entry];
		upsertProject(entry);
	}

	async function handleDeleteProject(id: string) {
		if (!storageRef) return;
		try {
			// Wipe all nodes for the project from local IndexedDB
			const stale = await storageRef.listNodes({ projectId: id });
			for (const n of stale) {
				await storageRef.deleteNode(n.id);
			}
			// Best-effort: tell backend too (cascades repo links / postgres nodes)
			fetch(`/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});

			// Remove from local list + persist
			const remaining = projects.filter((p) => p.id !== id);
			projects = remaining;
			saveProjects(remaining);

			// Switch to another project if we deleted the active one
			if (projectId === id) {
				const next = remaining[0]?.id;
				if (next) {
					await handleSwitchProject(next);
				}
			}
			logSuccess('project', `Deleted project ${id.slice(0, 8)}`);
		} catch (e) {
			logError('project', 'Delete failed', String(e));
		}
	}

	async function handleRescanRepo() {
		if (!connectedRepo) return;
		const ok = confirm(
			`Re-run cartographer on ${connectedRepo.full_name}?\n\nThis will start a new analysis. Existing findings on the canvas are kept; new ones are appended.`
		);
		if (!ok) return;
		await handleAnalyze();
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
			onDeleteProject={handleDeleteProject}
			onOpenSettings={() => (showSettings = true)}
		/>

		<main class="zone-content">
			<!-- Zone top-right controls -->
			<div class="global-controls">
				<button
					class="gc-btn demo-toggle"
					class:active={isDemoActive()}
					onclick={startDemo}
					title="Start demo walkthrough"
				>
					Demo
				</button>
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
					data-demo="context-btn"
					onclick={() => (showContext = !showContext)}
					title="Global Context"
				>
					Context
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
					<span class="repo-name" title={connectedRepo.full_name}>
						{connectedRepo.full_name.startsWith('local:')
							? connectedRepo.full_name.slice(6)
							: connectedRepo.full_name}
					</span>
					<button
						class="gc-btn repo"
						onclick={handleRescanRepo}
						title="Re-run cartographer on this repo"
					>
						Re-scan
					</button>
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
			onConnected={async (repo, newProject) => {
				connectedRepo = repo;
				showConnectRepo = false;
				logSuccess('cartographer', `Connected ${repo.full_name}`);
				if (newProject) {
					addProject(newProject.id, newProject.name);
					await handleSwitchProject(newProject.id);
				}
				await handleAnalyze();
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
				if (storageRef) {
					try {
						const result = await syncBackendNodesToLocal(storageRef, projectId);
						logSuccess(
							'cartographer',
							`Imported ${result.added} nodes`,
							result.skipped > 0 ? `${result.skipped} duplicates skipped` : undefined
						);
					} catch (e) {
						logError('cartographer', 'Sync failed', String(e));
					}
				}
				await loadNodes({ projectId });
			}}
			onClose={() => {
				showAnalysis = false;
				pendingAgentRunId = null;
			}}
		/>
	{/if}

	<DemoOverlay />

	{#if showContext}
		<GlobalContextPanel onClose={() => (showContext = false)} />
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

	.gc-btn.demo-toggle {
		color: #6366f1;
		border: 1px solid #3730a3;
		border-radius: 4px;
	}

	.gc-btn.demo-toggle:hover {
		background: #1e1b4b;
		color: #818cf8;
	}

	.gc-btn.repo {
		color: #34d399;
	}

	.repo-name {
		font-size: 11px;
		color: #404040;
	}
</style>
