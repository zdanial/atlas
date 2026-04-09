<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onOpenNode?: (id: string) => void;
	}

	let { nodes, onUpdateNode, onOpenNode }: Props = $props();

	const STATUS_COLUMNS = [
		{ key: 'draft', label: 'Draft', color: '#525252' },
		{ key: 'active', label: 'Active', color: '#3b82f6' },
		{ key: 'done', label: 'Done', color: '#22c55e' },
		{ key: 'archived', label: 'Archived', color: '#404040' }
	];

	let draggedNodeId = $state<string | null>(null);
	let dragOverColumn = $state<string | null>(null);
	let dropIndicatorIdx = $state<number | null>(null);

	let columnNodes = $derived(
		STATUS_COLUMNS.reduce(
			(acc, col) => {
				acc[col.key] = nodes
					.filter((n) => n.status === col.key)
					.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
				return acc;
			},
			{} as Record<string, Node[]>
		)
	);

	function handleDragStart(e: DragEvent, nodeId: string) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', nodeId);
		draggedNodeId = nodeId;
	}

	function handleDragOver(e: DragEvent, status: string) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverColumn = status;

		// Calculate drop position within column
		const column = (e.currentTarget as HTMLElement).querySelector('.column-body');
		if (!column) return;
		const cards = Array.from(column.querySelectorAll('.kanban-card:not(.is-dragged)'));
		let idx = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const rect = cards[i].getBoundingClientRect();
			if (e.clientY < rect.top + rect.height / 2) {
				idx = i;
				break;
			}
		}
		dropIndicatorIdx = idx;
	}

	function handleDragLeave(e: DragEvent, status: string) {
		const related = e.relatedTarget as HTMLElement | null;
		const column = e.currentTarget as HTMLElement;
		if (related && column.contains(related)) return;
		if (dragOverColumn === status) {
			dragOverColumn = null;
			dropIndicatorIdx = null;
		}
	}

	function handleDrop(e: DragEvent, targetStatus: string) {
		e.preventDefault();
		const nodeId = e.dataTransfer?.getData('text/plain');
		if (!nodeId) {
			draggedNodeId = null;
			dragOverColumn = null;
			dropIndicatorIdx = null;
			return;
		}

		const colItems = columnNodes[targetStatus] ?? [];
		const filteredItems = colItems.filter((n) => n.id !== nodeId);
		const insertIdx = Math.min(dropIndicatorIdx ?? filteredItems.length, filteredItems.length);

		// Calculate new sortOrder based on neighbors
		let newSortOrder: number;
		if (filteredItems.length === 0) {
			newSortOrder = Date.now();
		} else if (insertIdx === 0) {
			newSortOrder = (filteredItems[0].sortOrder ?? 0) - 1000;
		} else if (insertIdx >= filteredItems.length) {
			newSortOrder = (filteredItems[filteredItems.length - 1].sortOrder ?? 0) + 1000;
		} else {
			const before = filteredItems[insertIdx - 1].sortOrder ?? 0;
			const after = filteredItems[insertIdx].sortOrder ?? 0;
			newSortOrder = (before + after) / 2;
		}

		const node = nodes.find((n) => n.id === nodeId);
		const patch: Partial<Node> = { sortOrder: newSortOrder };
		if (node && node.status !== targetStatus) {
			patch.status = targetStatus;
		}
		onUpdateNode?.(nodeId, patch);

		draggedNodeId = null;
		dragOverColumn = null;
		dropIndicatorIdx = null;
	}

	function handleDragEnd() {
		draggedNodeId = null;
		dragOverColumn = null;
		dropIndicatorIdx = null;
	}
</script>

<div class="kanban-container">
	<div class="kanban-scroll">
		{#each STATUS_COLUMNS as col}
			{@const items = columnNodes[col.key] ?? []}

			<div
				class="kanban-column"
				class:drag-over={dragOverColumn === col.key}
				ondragover={(e) => handleDragOver(e, col.key)}
				ondragleave={(e) => handleDragLeave(e, col.key)}
				ondrop={(e) => handleDrop(e, col.key)}
				role="list"
				aria-label="{col.label} column"
			>
				<div class="column-header">
					<span class="column-dot" style:background-color={col.color}></span>
					<span class="column-title">{col.label}</span>
					<span class="column-count">{items.length}</span>
				</div>

				<div class="column-body">
					{#if items.length === 0}
						<div class="empty-placeholder">
							No {col.label.toLowerCase()} items
						</div>
					{:else}
						{#each items as node, i (node.id)}
							{@const config = getNodeTypeConfig(node.type)}
							{#if dragOverColumn === col.key && dropIndicatorIdx === i && draggedNodeId !== node.id}
								<div class="drop-indicator"></div>
							{/if}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="kanban-card"
								class:is-dragged={draggedNodeId === node.id}
								draggable="true"
								ondragstart={(e) => handleDragStart(e, node.id)}
								ondragend={handleDragEnd}
								onclick={() => onOpenNode?.(node.id)}
								role="listitem"
								style:border-left-color={config.badge}
							>
								<div class="card-type-badge" style:color={config.badge}>{config.label}</div>
								<div class="card-title">{node.title}</div>
							</div>
						{/each}
						{#if dragOverColumn === col.key && dropIndicatorIdx !== null && dropIndicatorIdx >= items.length}
							<div class="drop-indicator"></div>
						{/if}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.kanban-container {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.kanban-scroll {
		display: flex;
		gap: 8px;
		height: 100%;
		padding: 12px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.kanban-column {
		flex: 1;
		min-width: 180px;
		max-width: 300px;
		display: flex;
		flex-direction: column;
		background: #141414;
		border-radius: 8px;
		border: 1px solid #262626;
		transition: border-color 0.15s;
	}

	.kanban-column.drag-over {
		border-color: #525252;
		background: #1a1a1a;
	}

	.column-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 12px;
		border-bottom: 1px solid #262626;
	}

	.column-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.column-title {
		font-size: 12px;
		font-weight: 600;
		color: #d4d4d4;
		flex: 1;
		white-space: nowrap;
	}

	.column-count {
		font-size: 11px;
		color: #737373;
		background: #262626;
		padding: 0 6px;
		border-radius: 10px;
		min-width: 20px;
		text-align: center;
	}

	.column-body {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.empty-placeholder {
		text-align: center;
		color: #404040;
		font-size: 11px;
		padding: 20px 8px;
	}

	.drop-indicator {
		height: 2px;
		background: #3b82f6;
		border-radius: 1px;
		margin: -1px 0;
		flex-shrink: 0;
	}

	.kanban-card {
		background: #1a1a1a;
		border: 1px solid #262626;
		border-left: 3px solid;
		border-radius: 6px;
		padding: 8px 10px;
		cursor: grab;
		transition:
			opacity 0.15s,
			box-shadow 0.15s;
	}

	.kanban-card:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		border-color: #333;
	}

	.kanban-card:active {
		cursor: grabbing;
	}

	.kanban-card.is-dragged {
		opacity: 0.4;
	}

	.card-type-badge {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 2px;
	}

	.card-title {
		font-size: 12px;
		font-weight: 600;
		color: #e5e5e5;
		line-height: 1.3;
	}
</style>
