<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { phaseProgress } from '$lib/dependency-graph';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';

	interface Props {
		rootNode: Node;
		allNodes: Node[];
		edges: NodeEdge[];
		position: { x: number; y: number };
		onClickNode?: (id: string) => void;
		onMouseEnter?: () => void;
		onMouseLeave?: () => void;
	}

	let { rootNode, allNodes, edges, position, onClickNode, onMouseEnter, onMouseLeave }: Props =
		$props();

	// Expand/collapse state
	let expanded = $state<Set<string>>(new Set());

	// Auto-expand first level on mount only
	onMount(() => {
		const firstLevel = allNodes.filter((n) => n.parentId === rootNode.id).map((n) => n.id);
		expanded = new Set(firstLevel);
	});

	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function getChildren(parentId: string): Node[] {
		return allNodes
			.filter((n) => n.parentId === parentId)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	}

	function countDescendants(nodeId: string): { epics: number; phases: number; tickets: number } {
		const counts = { epics: 0, phases: 0, tickets: 0 };
		const queue = allNodes.filter((n) => n.parentId === nodeId);
		while (queue.length > 0) {
			const n = queue.pop()!;
			if (n.type === 'epic') counts.epics++;
			else if (n.type === 'phase') counts.phases++;
			else if (n.type === 'ticket') counts.tickets++;
			queue.push(...allNodes.filter((c) => c.parentId === n.id));
		}
		return counts;
	}

	function statusDot(status: string): string {
		if (status === 'done') return '✓';
		if (status === 'active') return '●';
		return '○';
	}

	function statusColor(status: string): string {
		if (status === 'done') return '#22c55e';
		if (status === 'active') return '#3b82f6';
		return '#525252';
	}

	// Flatten tree recursively for rendering
	interface TreeItem {
		node: Node;
		depth: number;
		hasChildren: boolean;
		isExpanded: boolean;
		showProgress: boolean;
		progress: { done: number; total: number } | null;
	}

	let flatTree = $derived.by(() => {
		const items: TreeItem[] = [];
		function walk(parentId: string, depth: number) {
			const children = getChildren(parentId);
			for (const child of children) {
				const hasChildren = allNodes.some((n) => n.parentId === child.id);
				const isExpanded = expanded.has(child.id);
				const showProgress = child.type === 'epic' || child.type === 'phase';
				const progress = showProgress ? phaseProgress(child.id, allNodes) : null;
				items.push({ node: child, depth, hasChildren, isExpanded, showProgress, progress });
				if (isExpanded && hasChildren) {
					walk(child.id, depth + 1);
				}
			}
		}
		walk(rootNode.id, 0);
		return items;
	});

	// Smart positioning
	let panelStyle = $derived.by(() => {
		const margin = 16;
		const panelWidth = 360;
		const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
		const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

		let x = position.x + 12;
		if (x + panelWidth > viewportW - margin) {
			x = position.x - panelWidth - 12;
		}
		x = Math.max(margin, x);

		let y = position.y;
		const maxH = viewportH * 0.7;
		if (y + maxH > viewportH - margin) {
			y = viewportH - maxH - margin;
		}
		y = Math.max(margin, y);

		return `left: ${x}px; top: ${y}px;`;
	});

	let descendants = $derived(countDescendants(rootNode.id));
	let summaryParts = $derived.by(() => {
		const parts: string[] = [];
		if (descendants.epics > 0) parts.push(`${descendants.epics} epics`);
		if (descendants.phases > 0) parts.push(`${descendants.phases} phases`);
		if (descendants.tickets > 0) parts.push(`${descendants.tickets} tickets`);
		return parts.join(' · ');
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="tree-explorer"
	style={panelStyle}
	transition:fly={{ y: 8, duration: 150 }}
	onmouseenter={onMouseEnter}
	onmouseleave={onMouseLeave}
>
	<!-- Header -->
	<div class="tree-header">
		<span class="tree-type" style:color={getNodeTypeConfig(rootNode.type).badge}
			>{getNodeTypeConfig(rootNode.type).label}</span
		>
		<span class="tree-root-title">{rootNode.title}</span>
		{#if summaryParts}
			<span class="tree-summary">{summaryParts}</span>
		{/if}
	</div>

	<!-- Tree body (flattened recursive) -->
	<div class="tree-body">
		{#each flatTree as item (item.node.id)}
			{@const config = getNodeTypeConfig(item.node.type)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="tree-row"
				style:padding-left="{10 + item.depth * 18}px"
				role="treeitem"
				tabindex="0"
			>
				{#if item.hasChildren}
					<button class="tree-chevron" onclick={() => toggleExpand(item.node.id)}>
						{item.isExpanded ? '▼' : '▶'}
					</button>
				{:else}
					<span class="tree-indent"></span>
				{/if}

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<span
					class="tree-row-content"
					onclick={() => onClickNode?.(item.node.id)}
					role="button"
					tabindex="0"
				>
					<span class="tree-status" style:color={statusColor(item.node.status)}>
						{statusDot(item.node.status)}
					</span>
					{#if item.depth === 0}
						<span class="tree-label-type" style:color={config.badge}>
							{config.label}:
						</span>
					{/if}
					<span class="tree-label">{item.node.title}</span>
				</span>
			</div>

			{#if item.showProgress && item.progress && item.progress.total > 0}
				<div class="tree-progress" style:padding-left="{36 + item.depth * 18}px">
					<div class="progress-bar">
						<div
							class="progress-fill"
							style:width="{(item.progress.done / item.progress.total) * 100}%"
						></div>
					</div>
					<span class="progress-text">{item.progress.done}/{item.progress.total}</span>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.tree-explorer {
		position: fixed;
		width: 360px;
		max-height: 70vh;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 10px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
		z-index: 200;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.tree-header {
		padding: 12px 14px;
		border-bottom: 1px solid #1a1a1a;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tree-type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.tree-root-title {
		font-size: 13px;
		font-weight: 600;
		color: #e5e5e5;
	}

	.tree-summary {
		font-size: 11px;
		color: #525252;
	}

	.tree-body {
		flex: 1;
		overflow-y: auto;
		padding: 6px 0;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		cursor: pointer;
		transition: background 0.1s;
	}

	.tree-row:hover {
		background: #1a1a1a;
	}

	.tree-chevron {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 8px;
		color: #525252;
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		border-radius: 3px;
	}

	.tree-chevron:hover {
		color: #a3a3a3;
		background: #262626;
	}

	.tree-indent {
		width: 16px;
		flex-shrink: 0;
	}

	.tree-row-content {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.tree-status {
		font-size: 10px;
		flex-shrink: 0;
	}

	.tree-label-type {
		font-size: 10px;
		text-transform: capitalize;
		flex-shrink: 0;
	}

	.tree-label {
		font-size: 12px;
		color: #d4d4d4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tree-progress {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px 4px;
	}

	.progress-bar {
		flex: 1;
		height: 3px;
		background: #1a1a1a;
		border-radius: 2px;
		overflow: hidden;
		max-width: 100px;
	}

	.progress-fill {
		height: 100%;
		background: #22c55e;
		border-radius: 2px;
		transition: width 0.3s;
	}

	.progress-text {
		font-size: 10px;
		color: #525252;
	}
</style>
