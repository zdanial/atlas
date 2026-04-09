<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText, NODE_TYPES } from '$lib/node-types';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		node: Node;
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onCreateEdge?: (sourceId: string, targetId: string) => void;
		onClose: () => void;
		onOpenChat?: () => void;
	}

	let { node, onUpdateNode, onCreateEdge, onClose, onOpenChat }: Props = $props();

	let isEditingTitle = $state(false);
	let isEditingBody = $state(false);
	let showTypeSelector = $state(false);
	let titleInputEl = $state<HTMLInputElement>();
	let newTagInput = $state('');
	let showTagSuggestions = $state(false);
	let showLinkSearch = $state(false);
	let linkSearchQuery = $state('');

	// Derive all unique tags across the project for autocomplete
	let allProjectTags = $derived.by(() => {
		const tagSet = new Set<string>();
		for (const n of getProjectNodes()) {
			const t = n.payload?.tags;
			if (Array.isArray(t)) {
				for (const tag of t) tagSet.add(tag as string);
			}
		}
		return Array.from(tagSet).sort();
	});

	// Stable color from tag name
	function tagColor(tag: string): string {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
		const colors = [
			'#6366f1',
			'#22c55e',
			'#f97316',
			'#06b6d4',
			'#ec4899',
			'#eab308',
			'#8b5cf6',
			'#14b8a6',
			'#ef4444',
			'#3b82f6'
		];
		return colors[Math.abs(hash) % colors.length];
	}

	let tagSuggestions = $derived.by(() => {
		const q = newTagInput.trim().toLowerCase();
		if (!q) return allProjectTags.filter((t) => !tags.includes(t));
		return allProjectTags.filter((t) => t.includes(q) && !tags.includes(t));
	});

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

	function handleSelectTag(tag: string) {
		if (!tags.includes(tag)) {
			onUpdateNode?.(node.id, { payload: { ...(node.payload ?? {}), tags: [...tags, tag] } });
		}
		newTagInput = '';
		showTagSuggestions = false;
	}

	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddTag();
		} else if (e.key === 'Escape') {
			newTagInput = '';
			showTagSuggestions = false;
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

	// Linkable planning nodes (L1-L4, excluding self)
	let linkableNodes = $derived.by(() => {
		const q = linkSearchQuery.trim().toLowerCase();
		return getProjectNodes()
			.filter((n) => n.id !== node.id && n.layer >= 1 && n.layer <= 4)
			.filter((n) => !q || n.title.toLowerCase().includes(q))
			.slice(0, 10);
	});

	function handleLink(targetId: string) {
		onCreateEdge?.(node.id, targetId);
		showLinkSearch = false;
		linkSearchQuery = '';
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

			{#if onOpenChat}
				<button class="chat-btn" onclick={onOpenChat} title="Chat about this note">💬</button>
			{/if}
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
						<span class="tag-dot" style:background={tagColor(tag)}></span>
						{tag}
						<button class="tag-remove" onclick={() => handleRemoveTag(tag)}>×</button>
					</span>
				{/each}
				<div class="tag-input-wrap">
					<input
						class="tag-input"
						placeholder="+ add tag"
						bind:value={newTagInput}
						onkeydown={handleTagKeydown}
						onfocus={() => (showTagSuggestions = true)}
						onblur={() => {
							setTimeout(() => (showTagSuggestions = false), 150);
							handleAddTag();
						}}
					/>
					{#if showTagSuggestions && tagSuggestions.length > 0}
						<div class="tag-suggestions">
							{#each tagSuggestions.slice(0, 8) as suggestion}
								<button
									class="tag-suggestion"
									onmousedown={(e) => {
										e.preventDefault();
										handleSelectTag(suggestion);
									}}
								>
									<span class="tag-dot" style:background={tagColor(suggestion)}></span>
									{suggestion}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Link to -->
		{#if onCreateEdge}
			<div class="link-section">
				{#if showLinkSearch}
					<div class="link-search-wrap">
						<input
							class="link-search-input"
							placeholder="Search planning nodes..."
							bind:value={linkSearchQuery}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									showLinkSearch = false;
									linkSearchQuery = '';
								}
							}}
						/>
						<div class="link-results">
							{#each linkableNodes as target}
								{@const tc = getNodeTypeConfig(target.type)}
								<button class="link-result" onclick={() => handleLink(target.id)}>
									<span class="link-result-dot" style:background={tc.badge}></span>
									<span class="link-result-type">{tc.label}</span>
									<span class="link-result-title">{target.title}</span>
								</button>
							{/each}
							{#if linkableNodes.length === 0}
								<div class="link-empty">No matching nodes</div>
							{/if}
						</div>
					</div>
				{:else}
					<button class="link-btn" onclick={() => (showLinkSearch = true)}> Link to... </button>
				{/if}
			</div>
		{/if}

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

	.chat-btn {
		background: none;
		border: 1px solid #2a2a4a;
		color: #818cf8;
		font-size: 13px;
		cursor: pointer;
		padding: 2px 8px;
		border-radius: 4px;
		line-height: 1;
	}

	.chat-btn:hover {
		background: #1f1f3a;
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

	.tag-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
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

	.tag-input-wrap {
		position: relative;
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

	.tag-suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px;
		min-width: 140px;
		max-height: 200px;
		overflow-y: auto;
		z-index: 100;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}

	.tag-suggestion {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
	}

	.tag-suggestion:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.link-section {
		margin-bottom: 16px;
	}

	.link-btn {
		background: none;
		border: 1px dashed #333;
		color: #525252;
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 6px;
		cursor: pointer;
	}

	.link-btn:hover {
		color: #a3a3a3;
		border-color: #525252;
	}

	.link-search-wrap {
		border: 1px solid #333;
		border-radius: 6px;
		overflow: hidden;
	}

	.link-search-input {
		width: 100%;
		background: #1a1a1a;
		border: none;
		border-bottom: 1px solid #262626;
		color: #e5e5e5;
		font-size: 12px;
		padding: 8px 10px;
		outline: none;
	}

	.link-results {
		max-height: 200px;
		overflow-y: auto;
	}

	.link-result {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
	}

	.link-result:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.link-result-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.link-result-type {
		font-size: 9px;
		text-transform: uppercase;
		color: #525252;
		flex-shrink: 0;
	}

	.link-result-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link-empty {
		padding: 8px 10px;
		font-size: 11px;
		color: #404040;
		text-align: center;
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
