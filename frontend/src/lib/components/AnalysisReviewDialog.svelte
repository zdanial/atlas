<script lang="ts">
	import { onWsEvent } from '$lib/services/ws';

	const API_BASE = '';

	interface Finding {
		title: string;
		node_type: string;
		body: string;
		layer: number;
		is_unimplemented: boolean;
		confidence: number;
		file_refs?: string[];
		evidence?: string;
	}

	interface ToolCall {
		tool: string;
		summary: string;
		ts: number;
	}

	let {
		projectId,
		repoId,
		agentRunId,
		onClose,
		onImported
	}: {
		projectId: string;
		repoId: string;
		agentRunId: string;
		onClose: () => void;
		onImported: (count: number) => void;
	} = $props();

	let step = $state<'analyzing' | 'preview' | 'importing' | 'done'>('analyzing');
	let statusMessage = $state('Connecting to analysis stream...');
	let findings = $state<Finding[]>([]);
	let toolCalls = $state<ToolCall[]>([]);
	let filter = $state<'all' | 'tickets' | 'observations'>('tickets');
	let importedCount = $state(0);
	let errorMessage = $state('');

	// Subscribe to live cartographer events on the shared WebSocket connection.
	$effect(() => {
		const offProgress = onWsEvent('analysis.progress', (msg) => {
			if (msg.agent_run_id !== agentRunId) return;
			const status = String(msg.status ?? '');
			statusMessage = String(msg.message ?? statusMessage);
			if (status === 'done') {
				loadFindings();
			} else if (status === 'error') {
				errorMessage = String(msg.message ?? 'Analysis failed');
				step = 'preview';
			}
		});

		const offTool = onWsEvent('cartographer.tool', (msg) => {
			if (msg.agent_run_id !== agentRunId) return;
			toolCalls = [
				...toolCalls,
				{
					tool: String(msg.tool ?? 'tool'),
					summary: String(msg.summary ?? ''),
					ts: Date.now()
				}
			].slice(-100); // cap log
		});

		const offFinding = onWsEvent('cartographer.finding', (msg) => {
			if (msg.agent_run_id !== agentRunId) return;
			const f = msg.finding as Finding | undefined;
			if (!f || !f.title) return;
			// Dedup by title — claude can re-emit during retries
			if (findings.some((x) => x.title === f.title)) return;
			findings = [...findings, f];
			// Flip to preview as soon as the first finding arrives so user sees them stream
			if (step === 'analyzing') step = 'preview';
		});

		// Fallback if WS misses the done event
		const pollTimer = setInterval(() => {
			if (step !== 'analyzing' && step !== 'preview') return;
			void pollForCompletion(true);
		}, 15_000);

		return () => {
			offProgress();
			offTool();
			offFinding();
			clearInterval(pollTimer);
		};
	});

	async function pollForCompletion(once = false) {
		const attempts = once ? 1 : 60;
		for (let i = 0; i < attempts; i++) {
			if (!once) await new Promise((r) => setTimeout(r, 2000));
			try {
				const resp = await fetch(`${API_BASE}/api/agent-runs/${agentRunId}`);
				if (!resp.ok) continue;
				const data = (await resp.json()) as {
					status: string;
					findings: Finding[];
				};
				if (data.status === 'done') {
					mergeFindings(data.findings);
					step = 'preview';
					return;
				} else if (data.status === 'error') {
					errorMessage = 'Analysis failed. Check server logs.';
					step = 'preview';
					return;
				}
			} catch {
				// continue polling
			}
		}
		if (!once) {
			errorMessage = 'Analysis timed out.';
			step = 'preview';
		}
	}

	function mergeFindings(incoming: Finding[]) {
		const existing = new Set(findings.map((f) => f.title));
		const additions = incoming.filter((f) => f.title && !existing.has(f.title));
		if (additions.length > 0) {
			findings = [...findings, ...additions];
		}
	}

	async function loadFindings() {
		try {
			const resp = await fetch(`${API_BASE}/api/agent-runs/${agentRunId}`);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = (await resp.json()) as { status: string; findings: Finding[] };
			mergeFindings(data.findings);
			step = 'preview';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
			step = 'preview';
		}
	}

	let filteredFindings = $derived(
		filter === 'tickets'
			? findings.filter((f) => f.node_type === 'ticket')
			: filter === 'observations'
				? findings.filter((f) => f.node_type !== 'ticket')
				: findings
	);

	function removeF(index: number) {
		const showing = filteredFindings;
		const target = showing[index];
		findings = findings.filter((f) => f !== target);
	}

	function changeType(finding: Finding, newType: string) {
		findings = findings.map((f) => (f === finding ? { ...f, node_type: newType } : f));
	}

	async function handleImport() {
		if (filteredFindings.length === 0) return;
		step = 'importing';
		importedCount = 0;

		try {
			const resp = await fetch(`${API_BASE}/api/repos/${repoId}/analyze/${agentRunId}/commit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					findings: filteredFindings.map((f) => ({
						title: f.title,
						node_type: f.node_type,
						body: f.body,
						layer: f.layer,
						confidence: f.confidence
					}))
				})
			});

			if (!resp.ok) {
				const body = await resp.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(body.error ?? `HTTP ${resp.status}`);
			}

			const data = (await resp.json()) as { created: number };
			importedCount = data.created;
			step = 'done';
			onImported(importedCount);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
			step = 'preview';
		}
	}

	function confidenceColor(c: number): string {
		if (c >= 0.85) return 'text-green-400';
		if (c >= 0.65) return 'text-yellow-400';
		return 'text-neutral-500';
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	const NODE_TYPES = [
		'ticket',
		'note',
		'insight',
		'idea',
		'question',
		'goal',
		'problem',
		'risk',
		'decision'
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
	onclick={handleBackdropClick}
>
	<div
		class="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl"
	>
		<!-- Header -->
		<div class="flex shrink-0 items-center justify-between border-b border-neutral-800 px-5 py-3">
			<h2 class="text-sm font-semibold text-neutral-200">
				{#if step === 'analyzing'}
					Cartographer Analysis
				{:else if step === 'preview'}
					Review Findings ({findings.length})
				{:else if step === 'importing'}
					Importing...
				{:else}
					Import Complete
				{/if}
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
		<div class="min-h-0 flex-1 overflow-hidden">
			{#if step === 'analyzing'}
				<div class="flex h-full flex-col px-5 py-4">
					<div class="mb-3 flex items-center gap-3">
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500"
						></div>
						<p class="text-sm text-neutral-300">{statusMessage}</p>
					</div>
					<p class="mb-3 text-xs text-neutral-600">Cartographer agent is reading your repo…</p>

					<!-- Live tool-call feed -->
					<div
						class="min-h-0 flex-1 overflow-y-auto rounded-md border border-neutral-800 bg-black/40 p-2 font-mono text-[11px]"
					>
						{#if toolCalls.length === 0}
							<p class="text-neutral-700">waiting for first tool call…</p>
						{:else}
							{#each toolCalls as tc}
								<div class="flex gap-2 py-0.5">
									<span class="text-indigo-400 shrink-0">{tc.tool}</span>
									<span class="text-neutral-500 truncate">{tc.summary}</span>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{:else if step === 'preview'}
				<div class="flex h-full flex-col">
					{#if errorMessage}
						<div class="mx-5 mt-4 rounded-md border border-red-800 bg-red-900/30 px-3 py-2">
							<p class="text-xs text-red-400">{errorMessage}</p>
						</div>
					{/if}

					<!-- Filter bar -->
					<div class="flex shrink-0 gap-1 border-b border-neutral-800 px-5 py-2">
						{#each [['all', 'All'], ['tickets', 'Unimplemented'], ['observations', 'Observations']] as [val, label]}
							<button
								class="rounded px-2 py-0.5 text-xs transition-colors {filter === val
									? 'bg-neutral-700 text-neutral-200'
									: 'text-neutral-500 hover:text-neutral-300'}"
								onclick={() => (filter = val as typeof filter)}
							>
								{label}
								{#if val === 'tickets'}
									({findings.filter((f) => f.node_type === 'ticket').length})
								{:else if val === 'observations'}
									({findings.filter((f) => f.node_type !== 'ticket').length})
								{:else}
									({findings.length})
								{/if}
							</button>
						{/each}
					</div>

					<!-- Findings list -->
					<div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
						{#if filteredFindings.length === 0 && !errorMessage}
							<p class="text-center text-xs text-neutral-600">No findings in this category.</p>
						{/if}
						{#each filteredFindings as finding, i (finding.title)}
							<div
								class="group flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-800/30 p-2.5"
							>
								<div class="flex flex-1 flex-col gap-1 min-w-0">
									<div class="flex items-center gap-2">
										<select
											value={finding.node_type}
											class="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 outline-none"
											onchange={(e: Event) =>
												changeType(finding, (e.target as HTMLSelectElement).value)}
										>
											{#each NODE_TYPES as t}
												<option value={t}>{t}</option>
											{/each}
										</select>
										<span class="truncate text-xs font-medium text-neutral-200"
											>{finding.title}</span
										>
										<span class="ml-auto shrink-0 text-xs {confidenceColor(finding.confidence)}">
											{Math.round(finding.confidence * 100)}%
										</span>
									</div>
									<p class="text-xs text-neutral-500 leading-relaxed">{finding.body}</p>
									{#if finding.evidence}
										<pre
											class="mt-1 max-h-24 overflow-y-auto rounded bg-black/40 p-1.5 font-mono text-[10px] text-neutral-400 whitespace-pre-wrap break-all">{finding.evidence}</pre>
									{/if}
									{#if finding.file_refs && finding.file_refs.length > 0}
										<div class="mt-1 flex flex-wrap gap-1">
											{#each finding.file_refs as ref}
												<span
													class="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300"
													>{ref}</span
												>
											{/each}
										</div>
									{/if}
								</div>
								<button
									class="mt-0.5 shrink-0 rounded p-0.5 text-neutral-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
									onclick={() => removeF(i)}
									title="Remove"
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>
						{/each}
					</div>

					<!-- Actions -->
					<div
						class="flex shrink-0 items-center justify-between border-t border-neutral-800 px-5 py-3"
					>
						<button
							class="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-300"
							onclick={onClose}
						>
							Cancel
						</button>
						<button
							class="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
							onclick={handleImport}
							disabled={filteredFindings.length === 0}
						>
							Import {filteredFindings.length} finding{filteredFindings.length === 1 ? '' : 's'}
						</button>
					</div>
				</div>
			{:else if step === 'importing'}
				<div class="flex h-full flex-col items-center justify-center py-8">
					<div
						class="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500"
					></div>
					<p class="text-sm text-neutral-400">Creating nodes on canvas...</p>
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center py-8">
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
					<p class="mb-1 text-sm font-medium text-neutral-200">
						{importedCount} node{importedCount === 1 ? '' : 's'} created
					</p>
					<p class="mb-4 text-xs text-neutral-500">Findings placed on the canvas.</p>
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
