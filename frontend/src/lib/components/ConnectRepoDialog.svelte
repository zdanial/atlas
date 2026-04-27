<script lang="ts">
	import FolderPickerModal from './FolderPickerModal.svelte';

	const API_BASE = '';

	let {
		projectId,
		onClose,
		onConnected
	}: {
		projectId: string;
		onClose: () => void;
		onConnected: (
			repo: { id: string; full_name: string },
			newProject?: { id: string; name: string }
		) => void;
	} = $props();

	type SourceType = 'github' | 'local';
	let sourceType = $state<SourceType>('github');
	let showPicker = $state(false);

	// GitHub
	let fullName = $state('');
	let pat = $state('');

	// Local
	let localPath = $state('');
	let localLabel = $state('');

	let step = $state<'input' | 'connecting' | 'done'>('input');
	let error = $state('');
	let connectedRepo = $state<{ id: string; full_name: string } | null>(null);

	function parseRepoInput(raw: string): string {
		const trimmed = raw.trim();
		const match = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+\/[^/]+)/);
		if (match) return match[1].replace(/\.git$/, '');
		return trimmed;
	}

	let resolvedName = $derived(parseRepoInput(fullName));
	let canSubmit = $derived(sourceType === 'github' ? !!resolvedName : !!localPath.trim());

	function deriveProjectName(p: string, label: string): string {
		if (label.trim()) return label.trim();
		const cleaned = p.replace(/\/+$/, '');
		const last = cleaned.split('/').filter(Boolean).pop();
		return last || 'Imported Project';
	}

	async function handleConnect() {
		if (!canSubmit) return;
		step = 'connecting';
		error = '';

		// Local connect always creates a new project; GitHub connect attaches
		// to the current project (existing behaviour).
		const newProjectId = sourceType === 'local' ? crypto.randomUUID() : null;
		const targetProjectId = newProjectId ?? projectId;
		const newProjectName = sourceType === 'local' ? deriveProjectName(localPath, localLabel) : '';

		try {
			const url =
				sourceType === 'github' ? `${API_BASE}/api/repos` : `${API_BASE}/api/repos/connect-local`;
			const body =
				sourceType === 'github'
					? {
							project_id: targetProjectId,
							full_name: resolvedName,
							github_pat: pat.trim() || null,
							is_primary: true
						}
					: {
							project_id: targetProjectId,
							path: localPath.trim(),
							label: newProjectName,
							is_primary: true
						};

			const resp = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!resp.ok) {
				const errBody = await resp.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errBody.error ?? `HTTP ${resp.status}`);
			}

			const data = await resp.json();
			connectedRepo = { id: data.repo.id, full_name: data.repo.full_name };
			step = 'done';
			if (newProjectId) {
				onConnected(connectedRepo, { id: newProjectId, name: newProjectName });
			} else {
				onConnected(connectedRepo);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			step = 'input';
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function displayName(fn: string): string {
		return fn.startsWith('local:') ? fn.slice('local:'.length) : fn;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
	onclick={handleBackdropClick}
>
	<div class="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
			<h2 class="text-sm font-semibold text-neutral-200">
				{#if step === 'done'}Repository Connected{:else}Connect Repository{/if}
			</h2>
			<button
				class="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
				onclick={onClose}
				aria-label="Close dialog"
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

		<!-- Body -->
		<div class="p-5">
			{#if step === 'input'}
				<!-- Source toggle -->
				<div class="mb-4 inline-flex rounded-md border border-neutral-700 p-0.5">
					<button
						class="rounded px-3 py-1 text-xs transition-colors"
						class:bg-neutral-700={sourceType === 'github'}
						class:text-neutral-100={sourceType === 'github'}
						class:text-neutral-400={sourceType !== 'github'}
						onclick={() => (sourceType = 'github')}
					>
						GitHub
					</button>
					<button
						class="rounded px-3 py-1 text-xs transition-colors"
						class:bg-neutral-700={sourceType === 'local'}
						class:text-neutral-100={sourceType === 'local'}
						class:text-neutral-400={sourceType !== 'local'}
						onclick={() => (sourceType = 'local')}
					>
						Local Folder
					</button>
				</div>

				{#if error}
					<div class="mb-3 rounded-md border border-red-800 bg-red-900/30 px-3 py-2">
						<p class="text-xs text-red-400">{error}</p>
					</div>
				{/if}

				{#if sourceType === 'github'}
					<p class="mb-4 text-xs text-neutral-500">
						Connect a GitHub repo to analyze its <code class="text-neutral-400">plans/</code> directory
						against the code and populate the board with findings.
					</p>

					<div class="mb-3">
						<label class="mb-1 block text-xs text-neutral-400" for="repo-name">
							Repository (owner/repo)
						</label>
						<input
							id="repo-name"
							type="text"
							bind:value={fullName}
							placeholder="e.g. owner/repo or https://github.com/owner/repo"
							class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
						/>
						{#if resolvedName && resolvedName !== fullName.trim()}
							<p class="mt-1 text-xs text-neutral-500">
								→ <code class="text-neutral-400">{resolvedName}</code>
							</p>
						{/if}
					</div>

					<div class="mb-4">
						<label class="mb-1 block text-xs text-neutral-400" for="repo-pat">
							Personal Access Token
							<span class="text-neutral-600">(optional for public repos)</span>
						</label>
						<input
							id="repo-pat"
							type="password"
							bind:value={pat}
							placeholder="ghp_... (leave blank for public repos)"
							class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
						/>
						<p class="mt-1 text-xs text-neutral-600">
							Needs <code>repo</code> scope for private repos.
						</p>
					</div>
				{:else}
					<p class="mb-4 text-xs text-neutral-500">
						Point to a folder on disk. Cartographer scans <code class="text-neutral-400"
							>plans/</code
						>
						and the source tree, then proposes findings.
					</p>

					<div class="mb-3">
						<label class="mb-1 block text-xs text-neutral-400" for="local-path">
							Folder path (absolute)
						</label>
						<div class="flex items-center gap-2">
							<input
								id="local-path"
								type="text"
								bind:value={localPath}
								placeholder="/Users/you/code/my-project"
								class="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
							/>
							<button
								type="button"
								class="rounded bg-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-600"
								onclick={() => (showPicker = true)}
							>
								Browse…
							</button>
						</div>
						<p class="mt-1 text-xs text-neutral-600">
							Path is read by the backend, so it must be reachable from the server process.
						</p>
					</div>

					<div class="mb-4">
						<label class="mb-1 block text-xs text-neutral-400" for="local-label">
							Label <span class="text-neutral-600">(optional — defaults to folder name)</span>
						</label>
						<input
							id="local-label"
							type="text"
							bind:value={localLabel}
							placeholder="my-project"
							class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
						/>
					</div>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						class="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-300"
						onclick={onClose}
					>
						Cancel
					</button>
					<button
						class="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
						onclick={handleConnect}
						disabled={!canSubmit}
					>
						Connect
					</button>
				</div>
			{:else if step === 'connecting'}
				<div class="flex flex-col items-center py-8">
					<div
						class="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500"
					></div>
					<p class="text-sm text-neutral-400">
						{sourceType === 'github' ? 'Validating with GitHub...' : 'Validating folder...'}
					</p>
				</div>
			{:else}
				<div class="flex flex-col items-center py-8">
					<svg
						class="mb-3 h-10 w-10 text-green-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
					<p class="mb-1 text-sm font-medium text-neutral-200">Connected!</p>
					<p class="mb-4 break-all text-center text-xs text-neutral-500">
						<code class="text-neutral-400">{displayName(connectedRepo?.full_name ?? '')}</code> is linked
						to this project.
					</p>
					<button
						class="rounded bg-neutral-700 px-4 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-600"
						onclick={onClose}
					>
						Close
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if showPicker}
	<FolderPickerModal
		initialPath={localPath.trim() || undefined}
		onPick={(p) => {
			localPath = p;
			showPicker = false;
		}}
		onClose={() => (showPicker = false)}
	/>
{/if}
