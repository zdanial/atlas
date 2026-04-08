<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText, NODE_TYPES } from '$lib/node-types';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		node: Node;
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onClose: () => void;
	}

	let { node, onUpdateNode, onClose }: Props = $props();

	let isEditingTitle = $state(false);
	let isEditingBody = $state(false);
	let showTypeSelector = $state(false);
	let titleInputEl = $state<HTMLInputElement>();
	let newTagInput = $state('');

	let colors = $derived(getNodeTypeConfig(node.type));
	let bodyText = $derived(extractBodyText(node.body, 5000));
	let tags = $derived<string[]>(
		Array.isArray(node.payload?.tags) ? (node.payload!.tags as string[]) : []
	);

	function handleRemoveTag(tag: string) {
		const updated = tags.filter((t) => t !== tag);
		onUpdateNode?.(node.id, { payload: { ...(node.payload ?? {}), tags: updated } });
	}

	function handleAddTag() {
		const tag = newTagInput.trim().toLowerCase().replace(/\s+/g, '-');
		if (!tag || tags.includes(tag)) {
			newTagInput = '';
			return;
		}
		onUpdateNode?.(node.id, { payload: { ...(node.payload ?? {}), tags: [...tags, tag] } });
		newTagInput = '';
	}

	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddTag();
		} else if (e.key === 'Escape') {
			newTagInput = '';
		}
	}

	function handleTitleDblClick() {
		isEditingTitle = true;
		requestAnimationFrame(() => titleInputEl?.select());
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const input = e.target as HTMLInputElement;
			onUpdateNode?.(node.id, { title: input.value });
			isEditingTitle = false;
		} else if (e.key === 'Escape') {
			isEditingTitle = false;
		}
	}

	function handleTitleBlur(e: FocusEvent) {
		const input = e.target as HTMLInputElement;
		onUpdateNode?.(node.id, { title: input.value });
		isEditingTitle = false;
	}

	function handleTypeSelect(type: string) {
		onUpdateNode?.(node.id, { type });
		showTypeSelector = false;
	}

	function handleEditorSave(body: Record<string, unknown>) {
		onUpdateNode?.(node.id, { body });
	}

	function handleStatusChange(status: string) {
		onUpdateNode?.(node.id, { status });
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
	<div class="panel" onclick={(e) => e.stopPropagation()} style:border-color={colors.border}>
		<!-- Header -->
		<div class="panel-header">
			<div class="type-area">
				<button
					class="type-badge"
					style:background-color={colors.badge}
					onclick={() => (showTypeSelector = !showTypeSelector)}
				>
					{node.type}
				</button>
				{#if showTypeSelector}
					<div class="type-selector">
						{#each Object.entries(NODE_TYPES) as [key, config]}
							<button
								class="type-option"
								class:active={node.type === key}
								onclick={() => handleTypeSelect(key)}
							>
								<span class="type-dot" style:background-color={config.badge}></span>
								{config.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="status-pills">
				{#each ['draft', 'active', 'done', 'parked'] as s}
					<button
						class="status-pill"
						class:active={node.status === s}
						onclick={() => handleStatusChange(s)}
					>
						{s}
					</button>
				{/each}
			</div>

			<button class="close-btn" onclick={onClose}>×</button>
		</div>

		<!-- Title -->
		<div class="title-area">
			{#if isEditingTitle}
				<input
					bind:this={titleInputEl}
					class="title-input"
					value={node.title}
					onblur={handleTitleBlur}
					onkeydown={handleTitleKeydown}
				/>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<h2 class="title" ondblclick={handleTitleDblClick}>{node.title}</h2>
			{/if}
		</div>

		<!-- Body -->
		<div class="body-area">
			{#if isEditingBody}
				<NoteEditor
					content={node.body}
					onSave={handleEditorSave}
					onBlur={() => (isEditingBody = false)}
				/>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="body-text" ondblclick={() => (isEditingBody = true)}>
					{#if bodyText}
						<p>{bodyText}</p>
					{:else}
						<p class="placeholder">Double-click to add a description...</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Tags -->
		<div class="tags-section">
			<div class="tags-list">
				{#each tags as tag}
					<span class="tag-chip">
						{tag}
						<button class="tag-remove" onclick={() => handleRemoveTag(tag)}>×</button>
					</span>
				{/each}
				<input
					class="tag-input"
					placeholder="+ add tag"
					bind:value={newTagInput}
					onkeydown={handleTagKeydown}
					onblur={handleAddTag}
				/>
			</div>
		</div>

		<!-- Meta -->
		<div class="meta">
			<span>Layer {node.layer}</span>
			<span
				>Created {node.createdAt instanceof Date ? node.createdAt.toLocaleDateString() : ''}</span
			>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 5000;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.panel {
		width: 560px;
		max-height: 80vh;
		overflow-y: auto;
		background: #141414;
		border: 1px solid;
		border-radius: 12px;
		padding: 20px 24px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.type-area {
		position: relative;
	}

	.type-badge {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 3px 8px;
		border-radius: 4px;
		color: white;
		border: none;
		cursor: pointer;
	}

	.type-badge:hover {
		opacity: 0.85;
	}

	.type-selector {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 130px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}

	.type-option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.type-option:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.type-option.active {
		background: #262626;
		color: #e5e5e5;
	}

	.type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-pills {
		display: flex;
		gap: 4px;
		flex: 1;
	}

	.status-pill {
		padding: 2px 8px;
		font-size: 10px;
		border-radius: 10px;
		border: 1px solid #333;
		background: transparent;
		color: #737373;
		cursor: pointer;
		text-transform: capitalize;
	}

	.status-pill.active {
		background: #262626;
		color: #e5e5e5;
		border-color: #525252;
	}

	.status-pill:hover {
		color: #a3a3a3;
	}

	.close-btn {
		background: none;
		border: none;
		color: #525252;
		font-size: 20px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	.close-btn:hover {
		color: #a3a3a3;
	}

	.title-area {
		margin-bottom: 16px;
	}

	.title {
		font-size: 18px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 0;
		line-height: 1.3;
		cursor: text;
	}

	.title-input {
		font-size: 18px;
		font-weight: 700;
		color: #e5e5e5;
		background: transparent;
		border: none;
		border-bottom: 1px solid #525252;
		outline: none;
		width: 100%;
		padding: 0 0 4px;
		line-height: 1.3;
	}

	.body-area {
		min-height: 100px;
		margin-bottom: 16px;
	}

	.body-text {
		cursor: text;
	}

	.body-text p {
		font-size: 13px;
		color: #a3a3a3;
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
	}

	.placeholder {
		color: #404040 !important;
		font-style: italic;
	}

	.tags-section {
		margin-bottom: 16px;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-height: 28px;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #333;
		color: #a3a3a3;
	}

	.tag-remove {
		background: none;
		border: none;
		color: #525252;
		font-size: 12px;
		padding: 0;
		cursor: pointer;
		line-height: 1;
	}

	.tag-remove:hover {
		color: #ef4444;
	}

	.tag-input {
		background: none;
		border: none;
		border-bottom: 1px dashed #333;
		color: #737373;
		font-size: 11px;
		padding: 2px 4px;
		outline: none;
		width: 80px;
	}

	.tag-input::placeholder {
		color: #404040;
	}

	.tag-input:focus {
		border-color: #525252;
		color: #a3a3a3;
	}

	.meta {
		display: flex;
		gap: 16px;
		font-size: 10px;
		color: #404040;
		border-top: 1px solid #1f1f1f;
		padding-top: 12px;
	}
</style>
