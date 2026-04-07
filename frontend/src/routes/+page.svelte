<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import { createStorage } from '$lib/storage';
	import type { Node } from '$lib/storage/adapter';

	type ViewMode = 'canvas' | 'kanban';

	const storage = createStorage();
	let nodes = $state<Node[]>([]);
	let gridSnap = $state(true);
	let view = $state<ViewMode>('canvas');
	let projectId = 'default';

	onMount(async () => {
		nodes = await storage.listNodes({ projectId });
	});

	async function handleCreateNote(x: number, y: number) {
		const node = await storage.createNode({
			type: 'note',
			layer: 5,
			projectId,
			title: 'Untitled',
			status: 'draft',
			positionX: x,
			positionY: y
		});
		nodes = [...nodes, node];
	}

	async function handleMoveNote(id: string, x: number, y: number) {
		nodes = nodes.map((n) => (n.id === id ? { ...n, positionX: x, positionY: y } : n));
		await storage.updateNode(id, { positionX: x, positionY: y });
	}

	async function handleUpdateNode(id: string, patch: Partial<Node>) {
		nodes = nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
		await storage.updateNode(id, patch);
	}
</script>

<div class="h-screen w-screen bg-neutral-950">
	<!-- Toolbar -->
	<div class="absolute top-3 left-3 z-10 flex items-center gap-2">
		<span class="text-sm font-semibold tracking-tight text-neutral-300">Atlas</span>
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
	</div>

	<!-- Hint -->
	{#if nodes.length === 0 && view === 'canvas'}
		<div
			class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-neutral-600"
		>
			<p class="text-sm">Double-click to create a note</p>
		</div>
	{/if}

	{#if view === 'canvas'}
		<Canvas
			{nodes}
			{gridSnap}
			onCreateNote={handleCreateNote}
			onMoveNote={handleMoveNote}
			onUpdateNode={handleUpdateNode}
		/>
	{:else}
		<div class="pt-10 h-full">
			<KanbanView {nodes} onUpdateNode={handleUpdateNode} />
		</div>
	{/if}
</div>
