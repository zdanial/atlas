<script lang="ts">
	import { getProjectNodes, updateNode } from '$lib/stores/nodes.svelte';
	import { tagColor } from '$lib/utils/chat-helpers';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let editingTag = $state<string | null>(null);
	let editValue = $state('');

	let tagCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const n of getProjectNodes()) {
			const t = n.payload?.tags;
			if (Array.isArray(t)) {
				for (const tag of t as string[]) {
					counts.set(tag, (counts.get(tag) ?? 0) + 1);
				}
			}
		}
		return counts;
	});

	let sortedTags = $derived(
		Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
	);

	function startRename(tag: string) {
		editingTag = tag;
		editValue = tag;
	}

	async function commitRename() {
		if (!editingTag) return;
		const newTag = editValue.trim().toLowerCase().replace(/\s+/g, '-');
		if (!newTag || newTag === editingTag) {
			editingTag = null;
			return;
		}

		const nodes = getProjectNodes();
		for (const n of nodes) {
			const tags = n.payload?.tags;
			if (Array.isArray(tags) && (tags as string[]).includes(editingTag)) {
				const updated = (tags as string[]).map((t) => (t === editingTag ? newTag : t));
				await updateNode(n.id, { payload: { ...(n.payload ?? {}), tags: updated } });
			}
		}
		editingTag = null;
	}

	async function deleteTag(tag: string) {
		const nodes = getProjectNodes();
		for (const n of nodes) {
			const tags = n.payload?.tags;
			if (Array.isArray(tags) && (tags as string[]).includes(tag)) {
				const filtered = (tags as string[]).filter((t) => t !== tag);
				await updateNode(n.id, { payload: { ...(n.payload ?? {}), tags: filtered } });
			}
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tag-manager-overlay" onclick={onClose}>
	<div class="tag-manager" onclick={(e) => e.stopPropagation()}>
		<div class="tm-header">
			<span class="tm-title">Manage Tags</span>
			<button class="tm-close" onclick={onClose}>x</button>
		</div>
		<div class="tm-list">
			{#each sortedTags as [tag, count]}
				<div class="tm-row">
					<span class="tm-dot" style:background={tagColor(tag)}></span>
					{#if editingTag === tag}
						<input
							class="tm-rename-input"
							bind:value={editValue}
							onkeydown={(e) => {
								if (e.key === 'Enter') commitRename();
								if (e.key === 'Escape') editingTag = null;
							}}
							onblur={commitRename}
						/>
					{:else}
						<span class="tm-tag-name" ondblclick={() => startRename(tag)}>{tag}</span>
					{/if}
					<span class="tm-count">{count}</span>
					<button class="tm-action" onclick={() => startRename(tag)} title="Rename">
						&#9998;
					</button>
					<button class="tm-action tm-delete" onclick={() => deleteTag(tag)} title="Delete">
						&times;
					</button>
				</div>
			{:else}
				<div class="tm-empty">No tags yet</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.tag-manager-overlay {
		position: fixed;
		inset: 0;
		z-index: 6000;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tag-manager {
		background: #111;
		border: 1px solid #262626;
		border-radius: 10px;
		width: 320px;
		max-height: 400px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	.tm-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #1a1a1a;
	}

	.tm-title {
		font-size: 13px;
		font-weight: 600;
		color: #d4d4d4;
	}

	.tm-close {
		background: none;
		border: none;
		color: #525252;
		font-size: 16px;
		cursor: pointer;
		padding: 0 4px;
	}
	.tm-close:hover {
		color: #a3a3a3;
	}

	.tm-list {
		overflow-y: auto;
		padding: 8px 0;
	}

	.tm-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 16px;
	}
	.tm-row:hover {
		background: #1a1a1a;
	}

	.tm-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tm-tag-name {
		flex: 1;
		font-size: 12px;
		color: #a3a3a3;
		cursor: text;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tm-rename-input {
		flex: 1;
		font-size: 12px;
		color: #e5e5e5;
		background: #0a0a0a;
		border: 1px solid #525252;
		border-radius: 4px;
		padding: 2px 6px;
		outline: none;
		min-width: 0;
	}

	.tm-count {
		font-size: 10px;
		color: #525252;
		min-width: 16px;
		text-align: right;
	}

	.tm-action {
		background: none;
		border: none;
		color: #404040;
		font-size: 13px;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
	}
	.tm-action:hover {
		color: #a3a3a3;
	}
	.tm-delete:hover {
		color: #ef4444;
	}

	.tm-empty {
		padding: 16px;
		text-align: center;
		font-size: 12px;
		color: #404040;
	}
</style>
