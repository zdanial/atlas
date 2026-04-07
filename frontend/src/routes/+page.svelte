<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import IntentPanel from '$lib/components/IntentPanel.svelte';
	import BrainDumpDialog from '$lib/components/BrainDumpDialog.svelte';
	import ProjectSwitcher from '$lib/components/ProjectSwitcher.svelte';
	import { createStorage } from '$lib/storage';
	import type { Node } from '$lib/storage/adapter';
	import {
		initStore,
		getProjectNodes,
		createNode,
		updateNode,
		setProject
	} from '$lib/stores/nodes.svelte';
	import type { UpdateNodeInput } from '$lib/schemas/node';

	type ViewMode = 'canvas' | 'kanban';

	let gridSnap = $state(true);
	let view = $state<ViewMode>('canvas');
	let projectId = $state<string>('');
	let ready = $state(false);
	let showIntents = $state(false);
	let showBrainDump = $state(false);

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

		// Load or discover projects from existing nodes
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
				name: `Project ${i + 1}`,
				color: PROJECT_COLORS[i % PROJECT_COLORS.length]
			}));
			projectId = projects[0].id;
		} else {
			projectId = crypto.randomUUID();
			projects = [{ id: projectId, name: 'Project 1', color: PROJECT_COLORS[0] }];
		}

		await initStore(storage, projectId);
		ready = true;
	});

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
		await createNode({
			type: 'note',
			layer: 5,
			projectId,
			title: 'Untitled',
			status: 'draft',
			positionX: x,
			positionY: y
		});
	}

	async function handleMoveNote(id: string, x: number, y: number) {
		await updateNode(id, { positionX: x, positionY: y });
	}

	async function handleUpdateNode(id: string, patch: Partial<Node>) {
		const allowed: UpdateNodeInput = {};
		if (patch.type !== undefined) allowed.type = patch.type as UpdateNodeInput['type'];
		if (patch.title !== undefined) allowed.title = patch.title;
		if (patch.body !== undefined) allowed.body = patch.body;
		if (patch.payload !== undefined) allowed.payload = patch.payload;
		if (patch.status !== undefined) allowed.status = patch.status as UpdateNodeInput['status'];
		if (patch.positionX !== undefined) allowed.positionX = patch.positionX;
		if (patch.positionY !== undefined) allowed.positionY = patch.positionY;
		if (patch.parentId !== undefined) allowed.parentId = patch.parentId;
		await updateNode(id, allowed);
	}
</script>

<div class="h-screen w-screen bg-neutral-950">
	<!-- Toolbar -->
	<div class="absolute top-3 left-3 z-10 flex items-center gap-2">
		<span class="text-sm font-semibold tracking-tight text-neutral-300">Atlas</span>
		<span class="text-neutral-700">|</span>

		<!-- Project Switcher -->
		<ProjectSwitcher
			{projects}
			currentProjectId={projectId}
			onSwitch={handleSwitchProject}
			onCreate={handleCreateProject}
		/>

		<span class="text-neutral-700">|</span>

		<!-- View switcher -->
		<button
			class="rounded px-2 py-0.5 text-xs transition-colors {view === 'canvas'
				? 'bg-neutral-700 text-neutral-200'
				: 'text-neutral-500 hover:text-neutral-300'}"
			onclick={() => (view = 'canvas')}
		>
			Canvas
		</button>
		<button
			class="rounded px-2 py-0.5 text-xs transition-colors {view === 'kanban'
				? 'bg-neutral-700 text-neutral-200'
				: 'text-neutral-500 hover:text-neutral-300'}"
			onclick={() => (view = 'kanban')}
		>
			Kanban
		</button>

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

		<!-- Intents button -->
		<button
			class="rounded px-2 py-0.5 text-xs transition-colors {showIntents
				? 'bg-teal-700 text-teal-200'
				: 'text-neutral-500 hover:text-neutral-300'}"
			onclick={() => (showIntents = !showIntents)}
		>
			Intents
		</button>

		<!-- Import button -->
		<button
			class="rounded px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
			onclick={() => (showBrainDump = true)}
		>
			Import
		</button>
	</div>

	{#if !ready}
		<div class="flex h-full items-center justify-center text-neutral-600">
			<p class="text-sm">Loading...</p>
		</div>
	{:else}
		<!-- Hint -->
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
				{gridSnap}
				onCreateNote={handleCreateNote}
				onMoveNote={handleMoveNote}
				onUpdateNode={handleUpdateNode}
			/>
		{:else}
			<div class="pt-10 h-full">
				<KanbanView nodes={projectNodes} onUpdateNode={handleUpdateNode} />
			</div>
		{/if}
	{/if}

	{#if showIntents}
		<IntentPanel {projectId} onClose={() => (showIntents = false)} />
	{/if}

	{#if showBrainDump}
		<BrainDumpDialog {projectId} onClose={() => (showBrainDump = false)} />
	{/if}
</div>
