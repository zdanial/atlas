<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText, NODE_TYPES } from '$lib/node-types';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		node: Node;
		isDragging: boolean;
		isSelected?: boolean;
		onDragStart: (e: PointerEvent) => void;
		onClick?: (e: MouseEvent) => void;
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onOpen?: (id: string) => void;
		onDelete?: (id: string) => void;
	}

	let {
		node,
		isDragging,
		isSelected = false,
		onDragStart,
		onClick,
		onUpdateNode,
		onOpen,
		onDelete
	}: Props = $props();

	let isEditing = $state(false);
	let isEditingTitle = $state(false);
	let showTypeSelector = $state(false);
	let isHovered = $state(false);
	let titleInputEl = $state<HTMLInputElement>();

	let colors = $derived(getNodeTypeConfig(node.type));
	let bodyPreview = $derived(extractBodyText(node.body));
	let tags = $derived<string[]>(
		Array.isArray(node.payload?.tags) ? (node.payload!.tags as string[]) : []
	);

	let x = $derived(node.positionX ?? 0);
	let y = $derived(node.positionY ?? 0);

	function handleDblClick(e: MouseEvent) {
		e.stopPropagation();
		if (onOpen) {
			onOpen(node.id);
		} else {
			isEditing = true;
		}
	}

	function handleTitleDblClick(e: MouseEvent) {
		e.stopPropagation();
		isEditingTitle = true;
		requestAnimationFrame(() => titleInputEl?.select());
	}

	function handleTitleBlur() {
		isEditingTitle = false;
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

	function handleTitleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		onUpdateNode?.(node.id, { title: input.value });
	}

	function handleEditorSave(body: Record<string, unknown>) {
		onUpdateNode?.(node.id, { body });
	}

	function handleEditorBlur() {
		isEditing = false;
	}

	function handleTypeSelect(type: string) {
		onUpdateNode?.(node.id, { type });
		showTypeSelector = false;
	}

	function handleBadgeClick(e: MouseEvent) {
		e.stopPropagation();
		showTypeSelector = !showTypeSelector;
	}

	function handlePointerDown(e: PointerEvent) {
		if (isEditing || isEditingTitle) return;
		onDragStart(e);
	}

	function handleClick(e: MouseEvent) {
		if (isEditing || isEditingTitle) return;
		onClick?.(e);
	}

	function handleDeleteClick(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		onDelete?.(node.id);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="note-card"
	class:dragging={isDragging}
	class:editing={isEditing}
	class:selected={isSelected}
	role="button"
	tabindex="0"
	style:left="{x}px"
	style:top="{y}px"
	style:background-color={colors.bg}
	style:border-color={colors.border}
	onpointerdown={handlePointerDown}
	onclick={handleClick}
	ondblclick={handleDblClick}
	onmouseenter={() => (isHovered = true)}
	onmouseleave={() => (isHovered = false)}
>
	<div class="note-header">
		<button class="type-badge" style:background-color={colors.badge} onclick={handleBadgeClick}>
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

		<div class="header-right">
			{#if tags.length > 0}
				<!-- Collapsed: always in flow -->
				{#if !isHovered}
					<span class="tag-chip">{tags[0]}</span>
					{#if tags.length > 1}
						<span class="tag-more">+{tags.length - 1}</span>
					{/if}
				{/if}
			{/if}
			{#if isHovered && onDelete}
				<button class="delete-btn" onclick={handleDeleteClick} title="Delete">×</button>
			{/if}
		</div>

		<!-- Expanded tags float below the header when hovered -->
		{#if isHovered && tags.length > 0}
			<div class="tags-float">
				{#each tags as tag}
					<span class="tag-chip">{tag}</span>
				{/each}
			</div>
		{/if}
	</div>

	{#if isEditingTitle}
		<input
			bind:this={titleInputEl}
			class="note-title-input"
			value={node.title}
			onblur={handleTitleBlur}
			onkeydown={handleTitleKeydown}
			oninput={handleTitleInput}
		/>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<h3 class="note-title" ondblclick={handleTitleDblClick}>{node.title}</h3>
	{/if}

	{#if isEditing}
		<NoteEditor content={node.body} onSave={handleEditorSave} onBlur={handleEditorBlur} />
	{:else if bodyPreview}
		<p class="note-body">{bodyPreview}</p>
	{/if}
</div>

<style>
	.note-card {
		position: absolute;
		width: 220px;
		min-height: 60px;
		padding: 10px 12px;
		border: 1px solid;
		border-radius: 8px;
		cursor: grab;
		user-select: none;
		transition: box-shadow 0.15s ease;
		touch-action: none;
	}

	.note-card.editing {
		cursor: auto;
		user-select: text;
		width: 280px;
		z-index: 500;
	}

	.note-card:hover {
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.1),
			0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.note-card.dragging {
		cursor: grabbing;
		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.2),
			0 8px 24px rgba(0, 0, 0, 0.5);
		z-index: 1000;
	}

	.note-card.selected {
		box-shadow:
			0 0 0 2px #6366f1,
			0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.note-header {
		display: flex;
		align-items: flex-start;
		gap: 4px;
		margin-bottom: 6px;
		position: relative;
	}

	.type-badge {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 6px;
		border-radius: 4px;
		color: white;
		border: none;
		cursor: pointer;
		transition: opacity 0.1s;
		flex-shrink: 0;
	}

	.type-badge:hover {
		opacity: 0.85;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 3px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.tag-chip {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.07);
		color: #737373;
		white-space: nowrap;
		max-width: 70px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-more {
		font-size: 9px;
		color: #525252;
		white-space: nowrap;
	}

	.tags-float {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		justify-content: flex-end;
		max-width: 200px;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		padding: 5px 7px;
		z-index: 1500;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}

	.delete-btn {
		background: none;
		border: none;
		color: #525252;
		font-size: 14px;
		line-height: 1;
		padding: 0 2px;
		cursor: pointer;
		flex-shrink: 0;
		transition: color 0.1s;
	}

	.delete-btn:hover {
		color: #ef4444;
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
		z-index: 2000;
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

	.note-title {
		font-size: 13px;
		font-weight: 600;
		color: #e5e5e5;
		margin: 0;
		line-height: 1.3;
	}

	.note-title-input {
		font-size: 13px;
		font-weight: 600;
		color: #e5e5e5;
		background: transparent;
		border: none;
		border-bottom: 1px solid #525252;
		outline: none;
		width: 100%;
		margin: 0;
		padding: 0 0 2px;
		line-height: 1.3;
	}

	.note-body {
		font-size: 11px;
		color: #a3a3a3;
		margin: 4px 0 0;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}
</style>
