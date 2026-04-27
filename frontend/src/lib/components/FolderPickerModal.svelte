<script lang="ts">
	import { onMount } from 'svelte';

	const API_BASE = '';

	let {
		initialPath,
		onPick,
		onClose
	}: {
		initialPath?: string;
		onPick: (path: string) => void;
		onClose: () => void;
	} = $props();

	interface Entry {
		name: string;
		path: string;
		is_dir: boolean;
	}

	let currentPath = $state(initialPath ?? '');
	let parent = $state<string | null>(null);
	let entries = $state<Entry[]>([]);
	let manualPath = $state(initialPath ?? '');
	let loading = $state(false);
	let error = $state('');

	async function load(path: string | null) {
		loading = true;
		error = '';
		try {
			const url = new URL(`${API_BASE}/api/fs/browse`, window.location.origin);
			if (path) url.searchParams.set('path', path);
			const resp = await fetch(url.toString());
			if (!resp.ok) {
				const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
				throw new Error(body.error ?? `HTTP ${resp.status}`);
			}
			const data = await resp.json();
			currentPath = data.path;
			parent = data.parent;
			entries = data.entries;
			manualPath = data.path;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load(initialPath ?? null);
	});

	function navigate(path: string) {
		load(path);
	}

	function pick() {
		onPick(currentPath);
	}

	function pickEntry(p: string) {
		onPick(p);
	}

	function backdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleManualSubmit(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			load(manualPath.trim());
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
	onclick={backdrop}
>
	<div class="w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
		<div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
			<h3 class="text-sm font-semibold text-neutral-200">Pick a folder</h3>
			<button
				class="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
				onclick={onClose}
				aria-label="Close"
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

		<div class="p-4">
			<!-- Manual path input -->
			<div class="mb-3 flex items-center gap-2">
				<input
					type="text"
					bind:value={manualPath}
					onkeydown={handleManualSubmit}
					placeholder="/Users/you/path  (Enter to load)"
					class="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
				/>
				<button
					class="rounded bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
					onclick={() => load(manualPath.trim())}
				>
					Go
				</button>
			</div>

			{#if error}
				<div class="mb-3 rounded-md border border-red-800 bg-red-900/30 px-3 py-2">
					<p class="text-xs text-red-400">{error}</p>
				</div>
			{/if}

			<!-- Breadcrumb / parent -->
			<div class="mb-2 flex items-center gap-2 text-xs text-neutral-500">
				{#if parent}
					<button
						class="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
						onclick={() => navigate(parent!)}
						title="Go up"
					>
						↑ ..
					</button>
				{/if}
				<span class="break-all text-neutral-400">{currentPath || '(loading)'}</span>
			</div>

			<!-- Entries -->
			<div class="max-h-72 overflow-y-auto rounded-md border border-neutral-800">
				{#if loading}
					<div class="px-3 py-4 text-center text-xs text-neutral-500">Loading…</div>
				{:else if entries.length === 0}
					<div class="px-3 py-4 text-center text-xs text-neutral-500">
						No subfolders here. Use this folder ↓ or go up.
					</div>
				{:else}
					{#each entries as entry}
						<div
							class="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 last:border-b-0 hover:bg-neutral-800/40"
						>
							<button
								class="flex-1 truncate text-left text-xs text-neutral-200"
								onclick={() => navigate(entry.path)}
								title={entry.path}
							>
								📁 {entry.name}
							</button>
							<button
								class="ml-2 rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-indigo-900/30"
								onclick={() => pickEntry(entry.path)}
							>
								Pick
							</button>
						</div>
					{/each}
				{/if}
			</div>

			<div class="mt-4 flex justify-end gap-2">
				<button
					class="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-300"
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
					onclick={pick}
					disabled={!currentPath}
				>
					Use this folder
				</button>
			</div>
		</div>
	</div>
</div>
