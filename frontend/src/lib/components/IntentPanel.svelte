<script lang="ts">
	import { getProjectNodes, createNode, updateNode, deleteNode } from '$lib/stores/nodes.svelte';
	import { getNodeTypeConfig } from '$lib/node-types';
	import type { Node } from '$lib/storage/adapter';

	let { projectId, onClose }: { projectId: string; onClose: () => void } = $props();

	let projectNodes = $derived(getProjectNodes());
	let intents = $derived(projectNodes.filter((n: Node) => n.type === 'intent'));

	let showForm = $state(false);
	let newTitle = $state('');
	let newOutcome = $state('');
	let newDeadline = $state('');
	let newTimeHorizon = $state<string>('quarter');

	let editingId = $state<string | null>(null);
	let editingTitle = $state('');

	const INTENT_STATUSES = ['active', 'draft', 'done', 'archived'] as const;

	const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
		active: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
		draft: { bg: 'bg-neutral-500/20', text: 'text-neutral-400' },
		done: { bg: 'bg-green-500/20', text: 'text-green-400' },
		archived: { bg: 'bg-red-500/20', text: 'text-red-400' }
	};

	async function handleCreate() {
		if (!newTitle.trim()) return;
		await createNode({
			type: 'intent',
			layer: 4,
			projectId,
			title: newTitle.trim(),
			status: 'active',
			payload: {
				targetOutcome: newOutcome.trim(),
				deadline: newDeadline || undefined,
				timeHorizon: newTimeHorizon
			}
		});
		newTitle = '';
		newOutcome = '';
		newDeadline = '';
		newTimeHorizon = 'quarter';
		showForm = false;
	}

	async function handleStatusChange(intent: Node, status: string) {
		await updateNode(intent.id, { status: status as 'active' | 'draft' | 'done' | 'archived' });
	}

	async function handleDelete(id: string) {
		await deleteNode(id);
	}

	function startEditing(intent: Node) {
		editingId = intent.id;
		editingTitle = intent.title;
	}

	async function finishEditing(intent: Node) {
		if (editingTitle.trim() && editingTitle !== intent.title) {
			await updateNode(intent.id, { title: editingTitle.trim() });
		}
		editingId = null;
	}

	function linkedCount(intentId: string): number {
		return projectNodes.filter((n: Node) => n.parentId === intentId).length;
	}

	function getPayload(intent: Node) {
		return (intent.payload ?? {}) as {
			targetOutcome?: string;
			deadline?: string;
			timeHorizon?: string;
		};
	}
</script>

<div
	class="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-neutral-800 bg-neutral-900 shadow-xl"
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
		<h2 class="text-sm font-semibold text-neutral-200">Intents</h2>
		<button
			class="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
			onclick={onClose}
			aria-label="Close intents panel"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-3">
		<!-- New Intent Button -->
		{#if !showForm}
			<button
				class="mb-3 w-full rounded-md border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-300"
				onclick={() => (showForm = true)}
			>
				+ New Intent
			</button>
		{/if}

		<!-- Creation Form -->
		{#if showForm}
			<div class="mb-3 rounded-md border border-neutral-700 bg-neutral-800/50 p-3">
				<input
					type="text"
					bind:value={newTitle}
					placeholder="Intent title..."
					class="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
				/>
				<textarea
					bind:value={newOutcome}
					placeholder="Target outcome..."
					rows="2"
					class="mb-2 w-full resize-none rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
				></textarea>
				<div class="mb-2 flex gap-2">
					<input
						type="date"
						bind:value={newDeadline}
						class="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-500"
					/>
					<select
						bind:value={newTimeHorizon}
						class="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-500"
					>
						<option value="week">Week</option>
						<option value="month">Month</option>
						<option value="quarter">Quarter</option>
						<option value="year">Year</option>
					</select>
				</div>
				<div class="flex gap-2">
					<button
						class="rounded bg-teal-600 px-3 py-1 text-xs text-white transition-colors hover:bg-teal-500"
						onclick={handleCreate}
					>
						Create
					</button>
					<button
						class="rounded px-3 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-300"
						onclick={() => (showForm = false)}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Intent List -->
		{#if intents.length === 0 && !showForm}
			<p class="mt-8 text-center text-xs text-neutral-600">
				No intents yet. Create one to start organizing your thinking.
			</p>
		{/if}

		{#each intents as intent (intent.id)}
			{@const payload = getPayload(intent)}
			{@const statusColor = STATUS_COLORS[intent.status] ?? STATUS_COLORS.draft}
			<div
				class="group mb-2 rounded-md border border-neutral-800 bg-neutral-800/30 p-3 transition-colors hover:border-neutral-700"
			>
				<!-- Title row -->
				<div class="mb-1 flex items-start justify-between gap-2">
					{#if editingId === intent.id}
						<input
							type="text"
							bind:value={editingTitle}
							class="flex-1 rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-200 outline-none focus:border-neutral-400"
							onblur={() => finishEditing(intent)}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') finishEditing(intent);
							}}
						/>
					{:else}
						<button
							class="flex-1 text-left text-xs font-medium text-neutral-200 hover:text-white"
							onclick={() => startEditing(intent)}
							title="Click to edit"
						>
							{intent.title}
						</button>
					{/if}
					<button
						class="shrink-0 rounded p-0.5 text-neutral-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
						onclick={() => handleDelete(intent.id)}
						title="Delete intent"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</button>
				</div>

				<!-- Status -->
				<div class="mb-1.5 flex items-center gap-2">
					<select
						value={intent.status}
						class="rounded border-none bg-transparent px-0 py-0 text-xs outline-none {statusColor.text}"
						onchange={(e: Event) =>
							handleStatusChange(intent, (e.target as HTMLSelectElement).value)}
					>
						{#each INTENT_STATUSES as s}
							<option value={s} class="bg-neutral-800 text-neutral-200">{s}</option>
						{/each}
					</select>
				</div>

				<!-- Target outcome -->
				{#if payload.targetOutcome}
					<p class="mb-1 text-xs text-neutral-500">{payload.targetOutcome}</p>
				{/if}

				<!-- Meta row -->
				<div class="flex items-center gap-3 text-xs text-neutral-600">
					{#if payload.deadline}
						<span>{payload.deadline}</span>
					{/if}
					{#if payload.timeHorizon}
						<span class="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-500"
							>{payload.timeHorizon}</span
						>
					{/if}
					{#if linkedCount(intent.id) > 0}
						<span>{linkedCount(intent.id)} linked</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
