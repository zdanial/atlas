<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { NODE_TYPES, NODE_TYPE_KEYS, getNodeTypeConfig, extractBodyText } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
	}

	let { nodes, onUpdateNode }: Props = $props();

	let collapsedColumns = $state<Set<string>>(new Set());
	let draggedNodeId = $state<string | null>(null);
	let dragOverColumn = $state<string | null>(null);

	let columnNodes = $derived(
		NODE_TYPE_KEYS.reduce(
			(acc, type) => {
				acc[type] = nodes.filter((n) => n.type === type);
				return acc;
			},
			{} as Record<string, Node[]>
		)
	);

	function toggleCollapse(type: string) {
		const next = new Set(collapsedColumns);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		collapsedColumns = next;
	}

	function handleDragStart(e: DragEvent, nodeId: string) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', nodeId);
		draggedNodeId = nodeId;
	}

	function handleDragOver(e: DragEvent, type: string) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverColumn = type;
	}

	function handleDragLeave(e: DragEvent, type: string) {
		const related = e.relatedTarget as HTMLElement | null;
		const column = e.currentTarget as HTMLElement;
		if (related && column.contains(related)) return;
		if (dragOverColumn === type) dragOverColumn = null;
	}

	function handleDrop(e: DragEvent, targetType: string) {
		e.preventDefault();
		const nodeId = e.dataTransfer?.getData('text/plain');
		if (nodeId) {
			const node = nodes.find((n) => n.id === nodeId);
			if (node && node.type !== targetType) {
				onUpdateNode?.(nodeId, { type: targetType });
			}
		}
		draggedNodeId = null;
		dragOverColumn = null;
	}

	function handleDragEnd() {
		draggedNodeId = null;
		dragOverColumn = null;
	}
</script>

<div class="kanban-container">
	<div class="kanban-scroll">
		{#each NODE_TYPE_KEYS as type}
			{@const config = NODE_TYPES[type]}
			{@const columnItems = columnNodes[type] ?? []}
			{@const isCollapsed = collapsedColumns.has(type)}

			<div
				class="kanban-column"
				class:collapsed={isCollapsed}
				class:drag-over={dragOverColumn === type}
				ondragover={(e) => handleDragOver(e, type)}
				ondragleave={(e) => handleDragLeave(e, type)}
				ondrop={(e) => handleDrop(e, type)}
				role="list"
				aria-label="{config.label} column"
			>
				<button class="column-header" onclick={() => toggleCollapse(type)}>
					<span class="column-dot" style:background-color={config.badge}></span>
					<span class="column-title">{config.label}</span>
					<span class="column-count">{columnItems.length}</span>
					<span class="collapse-icon">{isCollapsed ? '▸' : '▾'}</span>
				</button>

				{#if !isCollapsed}
					<div class="column-body">
						{#if columnItems.length === 0}
							<div class="empty-placeholder">
								No {config.label.toLowerCase()} notes
							</div>
						{:else}
							{#each columnItems as node (node.id)}
								<div
									class="kanban-card"
									class:is-dragged={draggedNodeId === node.id}
									draggable="true"
									ondragstart={(e) => handleDragStart(e, node.id)}
									ondragend={handleDragEnd}
									role="listitem"
									style:border-left-color={config.badge}
								>
									<div class="card-title">{node.title}</div>
									{#if extractBodyText(node.body)}
										<div class="card-body">{extractBodyText(node.body)}</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/if}
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
		flex-shrink: 0;
		width: 240px;
		display: flex;
		flex-direction: column;
		background: #141414;
		border-radius: 8px;
		border: 1px solid #262626;
		transition: border-color 0.15s;
	}

	.kanban-column.collapsed {
		width: 44px;
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
		border: none;
		background: none;
		cursor: pointer;
		width: 100%;
		text-align: left;
		border-bottom: 1px solid #262626;
	}

	.collapsed .column-header {
		flex-direction: column;
		padding: 10px 6px;
		writing-mode: vertical-lr;
		text-orientation: mixed;
		border-bottom: none;
		height: 100%;
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

	.collapse-icon {
		font-size: 10px;
		color: #525252;
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

	.card-title {
		font-size: 12px;
		font-weight: 600;
		color: #e5e5e5;
		line-height: 1.3;
	}

	.card-body {
		font-size: 11px;
		color: #737373;
		margin-top: 4px;
		line-height: 1.3;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
