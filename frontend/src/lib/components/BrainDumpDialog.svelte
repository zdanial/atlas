<script lang="ts">
	import { createNode } from '$lib/stores/nodes.svelte';
	import { getNodeTypeConfig, NODE_TYPE_KEYS } from '$lib/node-types';

	let { projectId, onClose }: { projectId: string; onClose: () => void } = $props();

	let inputText = $state('');
	let thoughts = $state<Array<{ text: string; suggestedType: string; relatedTo: number[] }>>([]);
	let step = $state<'input' | 'preview' | 'importing' | 'done'>('input');
	let importedCount = $state(0);

	function parseThoughts(text: string) {
		const paragraphs = text
			.split(/\n\n+/)
			.map((p) => p.trim())
			.filter(Boolean);
		return paragraphs.map((p) => {
			let type = 'note';
			const lower = p.toLowerCase();
			if (
				p.startsWith('?') ||
				lower.includes('how ') ||
				lower.includes('why ') ||
				lower.includes('what if')
			)
				type = 'question';
			else if (p.startsWith('!') || lower.includes('realized') || lower.includes('insight'))
				type = 'insight';
			else if (
				lower.includes('todo') ||
				lower.includes('idea') ||
				lower.includes('we could') ||
				lower.includes('what about')
			)
				type = 'idea';
			else if (lower.includes('risk') || lower.includes('danger') || lower.includes('careful'))
				type = 'risk';
			else if (
				lower.includes('decide') ||
				lower.includes('decision') ||
				lower.includes('chose') ||
				lower.includes('choice')
			)
				type = 'decision';
			else if (lower.includes('goal') || lower.includes('objective') || lower.includes('target'))
				type = 'goal';
			else if (
				lower.includes('problem') ||
				lower.includes('issue') ||
				lower.includes('bug') ||
				lower.includes('broken')
			)
				type = 'problem';
			else if (
				lower.includes('constraint') ||
				lower.includes('limit') ||
				lower.includes('must not') ||
				lower.includes('cannot')
			)
				type = 'constraint';
			else if (lower.includes('hypothesis') || lower.includes('assume') || lower.includes('theory'))
				type = 'hypothesis';
			else if (lower.includes('reference') || lower.includes('see also') || lower.includes('link'))
				type = 'reference';
			else if (lower.includes('bet') || lower.includes('wager') || lower.includes('gamble'))
				type = 'bet';

			return { text: p, suggestedType: type, relatedTo: [] as number[] };
		});
	}

	function handleParse() {
		if (!inputText.trim()) return;
		thoughts = parseThoughts(inputText);
		step = 'preview';
	}

	function changeType(index: number, newType: string) {
		thoughts[index] = { ...thoughts[index], suggestedType: newType };
	}

	function removeThought(index: number) {
		thoughts = thoughts.filter((_, i) => i !== index);
	}

	async function handleImport() {
		step = 'importing';
		importedCount = 0;

		const cols = Math.ceil(Math.sqrt(thoughts.length));

		for (let i = 0; i < thoughts.length; i++) {
			const t = thoughts[i];
			const col = i % cols;
			const row = Math.floor(i / cols);
			await createNode({
				type: t.suggestedType,
				layer: 5,
				projectId,
				title: t.text.slice(0, 80),
				body: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: t.text }] }]
				},
				status: 'active',
				positionX: col * 260 - cols * 130,
				positionY: row * 200 - 200
			});
			importedCount++;
		}
		step = 'done';
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
	onclick={handleBackdropClick}
>
	<div class="w-full max-w-2xl rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
			<h2 class="text-sm font-semibold text-neutral-200">
				{#if step === 'input'}Brain Dump Import
				{:else if step === 'preview'}Review Extracted Thoughts
				{:else if step === 'importing'}Importing...
				{:else}Import Complete
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
		<div class="p-5">
			{#if step === 'input'}
				<p class="mb-3 text-xs text-neutral-500">
					Paste your unstructured notes, ideas, or brain dump below. Separate thoughts with blank
					lines.
				</p>
				<textarea
					bind:value={inputText}
					placeholder="Paste your thoughts here...

Separate each thought with a blank line.

? Questions start with a question mark
! Insights start with an exclamation mark
Keywords like 'idea', 'risk', 'goal' will be auto-detected..."
					rows="12"
					class="mb-4 w-full resize-none rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500"
				></textarea>
				<div class="flex justify-end gap-2">
					<button
						class="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-300"
						onclick={onClose}
					>
						Cancel
					</button>
					<button
						class="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
						onclick={handleParse}
						disabled={!inputText.trim()}
					>
						Parse
					</button>
				</div>
			{:else if step === 'preview'}
				<div class="mb-4 max-h-96 space-y-2 overflow-y-auto pr-1">
					{#each thoughts as thought, i (i)}
						{@const config = getNodeTypeConfig(thought.suggestedType)}
						<div
							class="group flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-800/30 p-2.5"
						>
							<select
								value={thought.suggestedType}
								class="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 outline-none"
								onchange={(e: Event) => changeType(i, (e.target as HTMLSelectElement).value)}
							>
								{#each NODE_TYPE_KEYS as t}
									{@const tc = getNodeTypeConfig(t)}
									<option value={t}>{tc.label}</option>
								{/each}
							</select>
							<p class="flex-1 text-xs text-neutral-300">{thought.text}</p>
							<button
								class="shrink-0 rounded p-0.5 text-neutral-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
								onclick={() => removeThought(i)}
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
				{#if thoughts.length === 0}
					<p class="mb-4 text-center text-xs text-neutral-600">
						No thoughts extracted. Try adding more text.
					</p>
				{/if}
				<div class="flex justify-between">
					<button
						class="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-300"
						onclick={() => (step = 'input')}
					>
						Back
					</button>
					<button
						class="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
						onclick={handleImport}
						disabled={thoughts.length === 0}
					>
						Import All ({thoughts.length})
					</button>
				</div>
			{:else if step === 'importing'}
				<div class="flex flex-col items-center py-8">
					<div
						class="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500"
					></div>
					<p class="text-sm text-neutral-400">
						Importing {importedCount} / {thoughts.length} thoughts...
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
					<p class="mb-1 text-sm font-medium text-neutral-200">
						Successfully imported {importedCount} thoughts
					</p>
					<p class="mb-4 text-xs text-neutral-500">They have been placed on your canvas.</p>
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
