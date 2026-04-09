<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import {
		computeDependencyColumns,
		getBlockers,
		phaseProgress,
		isPhaseUnlocked,
		getUpstreamChain,
		getDownstreamChain
	} from '$lib/dependency-graph';
	import { onMount } from 'svelte';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		allNodes: Node[];
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onOpenNode?: (id: string) => void;
		onCreateEdge?: (sourceId: string, targetId: string) => void;
	}

	let { nodes, edges, allNodes, onUpdateNode, onOpenNode, onCreateEdge }: Props = $props();

	// ── Tree sidebar state ──
	let expanded = $state<Set<string>>(new Set());
	let scopeNodeId = $state<string | null>(null);

	// Build tree roots: top-level visible nodes (features/intents at L4, or whatever is at root)
	let treeRoots = $derived(
		nodes
			.filter((n) => !nodes.some((p) => p.id === n.parentId))
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
	);

	// Auto-expand roots on mount
	onMount(() => {
		const rootIds = treeRoots.map((n) => n.id);
		expanded = new Set(rootIds);
	});

	function toggleExpand(e: Event, id: string) {
		e.stopPropagation();
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

	function selectScope(id: string) {
		scopeNodeId = scopeNodeId === id ? null : id;
	}

	// Flattened tree for rendering
	interface TreeItem {
		node: Node;
		depth: number;
		hasChildren: boolean;
		isExpanded: boolean;
		progress: { done: number; total: number } | null;
	}

	let flatTree = $derived.by(() => {
		const items: TreeItem[] = [];
		function walk(parentId: string | null, depth: number) {
			const children =
				parentId === null
					? treeRoots
					: allNodes
							.filter((n) => n.parentId === parentId)
							.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
			for (const child of children) {
				const childChildren = allNodes.filter((n) => n.parentId === child.id);
				const hasChildren = childChildren.length > 0;
				const isExpanded = expanded.has(child.id);
				const showProgress = child.type === 'epic' || child.type === 'phase';
				const progress = showProgress ? phaseProgress(child.id, allNodes) : null;
				items.push({ node: child, depth, hasChildren, isExpanded, progress });
				if (isExpanded && hasChildren) {
					walk(child.id, depth + 1);
				}
			}
		}
		walk(null, 0);
		return items;
	});

	// ── Dependency columns (right panel) ──

	// Get the items to show in columns based on scope
	let scopedItems = $derived.by(() => {
		if (!scopeNodeId) {
			// Show all leaf-level items (tickets, or nodes with no children)
			return nodes.filter((n) => !allNodes.some((c) => c.parentId === n.id));
		}
		// Show direct children of scoped node
		return allNodes
			.filter((n) => n.parentId === scopeNodeId)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	});

	let scopeNode = $derived(scopeNodeId ? allNodes.find((n) => n.id === scopeNodeId) : null);

	// Phase tabs within scope (if scoped node has phase children)
	let scopePhases = $derived(
		scopeNodeId
			? allNodes
					.filter((n) => n.type === 'phase' && n.parentId === scopeNodeId)
					.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
			: []
	);

	let activePhaseId = $state<string | null>(null);

	$effect(() => {
		// Reset phase selection when scope changes
		if (scopePhases.length > 0) {
			const active = scopePhases.find((p) => p.status === 'active');
			activePhaseId = active?.id ?? scopePhases[0].id;
		} else {
			activePhaseId = null;
		}
	});

	// Items filtered by active phase
	let columnItems = $derived.by(() => {
		if (activePhaseId && scopePhases.length > 0) {
			return allNodes
				.filter((n) => n.parentId === activePhaseId)
				.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
		}
		return scopedItems;
	});

	let depColumns = $derived(computeDependencyColumns(columnItems, edges));
	let maxColumn = $derived(Math.max(0, ...depColumns.values()));

	let columnGroups = $derived.by(() => {
		const groups: Map<number, Node[]> = new Map();
		for (let i = 0; i <= maxColumn; i++) groups.set(i, []);
		for (const node of columnItems) {
			const col = depColumns.get(node.id) ?? 0;
			groups.get(col)?.push(node);
		}
		return groups;
	});

	function columnLabel(col: number): string {
		if (col === 0) return 'Ready Now';
		if (col === 1) return 'Waiting on 1';
		return `Waiting on ${col}+`;
	}

	// ── Hover highlighting ──
	let hoveredNodeId = $state<string | null>(null);

	let highlightedIds = $derived.by(() => {
		if (!hoveredNodeId) return null;
		const upstream = getUpstreamChain(hoveredNodeId, edges);
		const downstream = getDownstreamChain(hoveredNodeId, edges);
		return new Set([hoveredNodeId, ...upstream, ...downstream]);
	});

	// ── Arrow data ──
	let columnsEl = $state<HTMLDivElement>();
	let cardElMap = new Map<string, HTMLDivElement>();
	let arrowData = $state<
		Array<{
			sourceId: string;
			targetId: string;
			x1: number;
			y1: number;
			x2: number;
			y2: number;
		}>
	>([]);

	function recalcArrows() {
		if (!columnsEl) return;
		const containerRect = columnsEl.getBoundingClientRect();
		const scrollLeft = columnsEl.scrollLeft;
		const scrollTop = columnsEl.scrollTop;
		const newArrows: typeof arrowData = [];

		const blockEdges = edges.filter(
			(e) =>
				e.relationType === 'blocks' &&
				columnItems.some((n) => n.id === e.sourceId) &&
				columnItems.some((n) => n.id === e.targetId)
		);

		for (const edge of blockEdges) {
			const srcEl = cardElMap.get(edge.sourceId);
			const tgtEl = cardElMap.get(edge.targetId);
			if (!srcEl || !tgtEl) continue;

			const srcRect = srcEl.getBoundingClientRect();
			const tgtRect = tgtEl.getBoundingClientRect();

			newArrows.push({
				sourceId: edge.sourceId,
				targetId: edge.targetId,
				x1: srcRect.right - containerRect.left + scrollLeft,
				y1: srcRect.top + srcRect.height / 2 - containerRect.top + scrollTop,
				x2: tgtRect.left - containerRect.left + scrollLeft,
				y2: tgtRect.top + tgtRect.height / 2 - containerRect.top + scrollTop
			});
		}

		arrowData = newArrows;
	}

	$effect(() => {
		columnItems;
		depColumns;
		requestAnimationFrame(recalcArrows);
	});

	$effect(() => {
		if (!columnsEl) return;
		const handleScroll = () => requestAnimationFrame(recalcArrows);
		columnsEl.addEventListener('scroll', handleScroll);
		const ro = new ResizeObserver(() => requestAnimationFrame(recalcArrows));
		ro.observe(columnsEl);
		return () => {
			columnsEl!.removeEventListener('scroll', handleScroll);
			ro.disconnect();
		};
	});

	// ── Drag to create dependency ──
	let dragSourceId = $state<string | null>(null);
	let dragPos = $state<{ x: number; y: number } | null>(null);
	let dragStartPos = $state<{ x: number; y: number } | null>(null);
	let dragOverNodeId = $state<string | null>(null);

	function handleDragHandleDown(e: PointerEvent, nodeId: string) {
		e.preventDefault();
		e.stopPropagation();
		dragSourceId = nodeId;
		if (columnsEl) {
			const rect = columnsEl.getBoundingClientRect();
			dragStartPos = {
				x: e.clientX - rect.left + columnsEl.scrollLeft,
				y: e.clientY - rect.top + columnsEl.scrollTop
			};
			dragPos = { ...dragStartPos };
		}

		const handleMove = (me: PointerEvent) => {
			if (!columnsEl) return;
			const rect = columnsEl.getBoundingClientRect();
			dragPos = {
				x: me.clientX - rect.left + columnsEl.scrollLeft,
				y: me.clientY - rect.top + columnsEl.scrollTop
			};
			const el = document.elementFromPoint(me.clientX, me.clientY);
			const cardEl = el?.closest('[data-node-id]') as HTMLElement | null;
			const targetId = cardEl?.dataset.nodeId ?? null;
			dragOverNodeId = targetId && targetId !== dragSourceId ? targetId : null;
		};

		const handleUp = (ue: PointerEvent) => {
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);
			const el = document.elementFromPoint(ue.clientX, ue.clientY);
			const cardEl = el?.closest('[data-node-id]') as HTMLElement | null;
			if (cardEl && dragSourceId) {
				const targetId = cardEl.dataset.nodeId!;
				if (targetId !== dragSourceId) {
					onCreateEdge?.(dragSourceId, targetId);
				}
			}
			dragSourceId = null;
			dragPos = null;
			dragStartPos = null;
			dragOverNodeId = null;
		};

		window.addEventListener('pointermove', handleMove);
		window.addEventListener('pointerup', handleUp);
	}

	// ── Helpers ──
	function statusDot(status: string): string {
		if (status === 'done') return '\u2713';
		if (status === 'active') return '\u25CF';
		return '\u25CB';
	}

	function statusColor(status: string): string {
		if (status === 'done') return '#22c55e';
		if (status === 'active') return '#3b82f6';
		return '#525252';
	}

	function cardAction(el: HTMLDivElement, nodeId: string) {
		cardElMap.set(nodeId, el);
		return {
			destroy() {
				cardElMap.delete(nodeId);
			}
		};
	}
</script>

<div class="roadmap-combined">
	<!-- Left: Tree sidebar -->
	<div class="tree-sidebar">
		<div class="tree-sidebar-header">
			<span class="tree-sidebar-title">Plan Tree</span>
			{#if scopeNodeId}
				<button class="scope-clear" onclick={() => (scopeNodeId = null)}>Clear scope</button>
			{/if}
		</div>
		<div class="tree-sidebar-body">
			{#each flatTree as item (item.node.id)}
				{@const config = getNodeTypeConfig(item.node.type)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="tree-row"
					class:scoped={scopeNodeId === item.node.id}
					style:padding-left="{8 + item.depth * 16}px"
					onclick={() => selectScope(item.node.id)}
					ondblclick={() => onOpenNode?.(item.node.id)}
					role="treeitem"
					tabindex="0"
					title="Click to scope columns, double-click to open"
				>
					{#if item.hasChildren}
						<button class="tree-chevron" onclick={(e) => toggleExpand(e, item.node.id)}>
							{item.isExpanded ? '\u25BC' : '\u25B6'}
						</button>
					{:else}
						<span class="tree-indent"></span>
					{/if}

					<span class="tree-status" style:color={statusColor(item.node.status)}>
						{statusDot(item.node.status)}
					</span>
					<span class="tree-type-badge" style:color={config.badge}>
						{config.label.slice(0, 3)}
					</span>
					<span class="tree-label">{item.node.title}</span>

					{#if item.progress && item.progress.total > 0}
						<span class="tree-progress-badge">
							{item.progress.done}/{item.progress.total}
						</span>
					{/if}
				</div>
			{/each}

			{#if flatTree.length === 0}
				<div class="tree-empty">No planning items yet.</div>
			{/if}
		</div>
	</div>

	<!-- Right: Dependency columns -->
	<div class="columns-panel">
		<!-- Scope header + phase tabs -->
		<div class="columns-header">
			{#if scopeNode}
				{@const scopeConfig = getNodeTypeConfig(scopeNode.type)}
				<div class="scope-info">
					<span class="scope-type" style:color={scopeConfig.badge}>{scopeConfig.label}</span>
					<span class="scope-name">{scopeNode.title}</span>
				</div>
			{:else}
				<div class="scope-info">
					<span class="scope-name">All items (click tree to scope)</span>
				</div>
			{/if}

			{#if scopePhases.length > 0}
				<div class="phase-tabs">
					{#each scopePhases as phase, i}
						{@const progress = phaseProgress(phase.id, allNodes)}
						{@const unlocked = isPhaseUnlocked(phase.id, edges, allNodes)}
						{#if i > 0}
							<span class="phase-arrow">&rarr;</span>
						{/if}
						<button
							class="phase-tab"
							class:active={activePhaseId === phase.id}
							class:locked={!unlocked}
							onclick={() => (activePhaseId = phase.id)}
						>
							<span class="phase-status" style:color={statusColor(phase.status)}>
								{statusDot(phase.status)}
							</span>
							<span class="phase-title">{phase.title}</span>
							<span class="phase-progress">{progress.done}/{progress.total}</span>
						</button>
					{/each}
					<span class="phase-arrow">|</span>
					<button
						class="phase-tab"
						class:active={activePhaseId === null}
						onclick={() => (activePhaseId = null)}
					>
						All
					</button>
				</div>
			{/if}
		</div>

		<!-- Columns area -->
		<div class="columns-container" bind:this={columnsEl}>
			<svg class="arrow-overlay" aria-hidden="true">
				{#each arrowData as arrow}
					{@const midX = (arrow.x1 + arrow.x2) / 2}
					{@const isHighlighted =
						highlightedIds === null ||
						(highlightedIds.has(arrow.sourceId) && highlightedIds.has(arrow.targetId))}
					<path
						d="M {arrow.x1} {arrow.y1} C {midX} {arrow.y1}, {midX} {arrow.y2}, {arrow.x2} {arrow.y2}"
						fill="none"
						stroke="#f97316"
						stroke-width="1.5"
						opacity={isHighlighted ? 0.7 : 0.1}
						marker-end="url(#arrowhead-rm)"
					/>
				{/each}

				{#if dragSourceId && dragPos && dragStartPos}
					<line
						x1={dragStartPos.x}
						y1={dragStartPos.y}
						x2={dragPos.x}
						y2={dragPos.y}
						stroke="#f97316"
						stroke-width="2"
						stroke-dasharray="6 4"
						opacity="0.8"
					/>
				{/if}

				<defs>
					<marker
						id="arrowhead-rm"
						markerWidth="8"
						markerHeight="6"
						refX="8"
						refY="3"
						orient="auto"
					>
						<polygon points="0 0, 8 3, 0 6" fill="#f97316" />
					</marker>
				</defs>
			</svg>

			{#if columnItems.length === 0}
				<div class="columns-empty">
					{#if scopeNodeId}
						<p>No children in this scope. Select a node with children in the tree.</p>
					{:else}
						<p>No items to display.</p>
					{/if}
				</div>
			{:else}
				<div class="columns-scroll">
					{#each Array.from(columnGroups.entries()) as [col, colNodes]}
						<div class="dep-column">
							<div class="dep-column-header">
								<span class="column-label">{columnLabel(col)}</span>
								<span class="column-count">{colNodes.length}</span>
							</div>

							<div class="dep-column-body">
								{#each colNodes as node (node.id)}
									{@const config = getNodeTypeConfig(node.type)}
									{@const blockerIds = getBlockers(node.id, edges)}
									{@const blockerNames = blockerIds
										.map((id) => allNodes.find((n) => n.id === id)?.title ?? id)
										.slice(0, 2)}
									{@const isDimmed = highlightedIds !== null && !highlightedIds.has(node.id)}
									{@const intent = (node.payload?.intent as string) ?? ''}
									{@const childCount = allNodes.filter((n) => n.parentId === node.id).length}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<div
										class="sk-card"
										class:dimmed={isDimmed}
										class:drag-target={dragOverNodeId === node.id}
										data-node-id={node.id}
										style:border-left-color={config.badge}
										use:cardAction={node.id}
										onmouseenter={() => (hoveredNodeId = node.id)}
										onmouseleave={() => (hoveredNodeId = null)}
										role="button"
										tabindex="0"
									>
										<div class="sk-card-top">
											<span class="sk-type" style:color={config.badge}>{config.label}</span>
											<span class="sk-status" style:color={statusColor(node.status)}>
												{statusDot(node.status)}
											</span>
										</div>
										<div class="sk-title" onclick={() => onOpenNode?.(node.id)}>
											{node.title}
										</div>
										{#if intent}
											<div class="sk-intent">
												{intent.slice(0, 80)}{intent.length > 80 ? '\u2026' : ''}
											</div>
										{/if}
										{#if childCount > 0}
											<button
												class="sk-drill"
												onclick={(e) => {
													e.stopPropagation();
													scopeNodeId = node.id;
													if (!expanded.has(node.id)) {
														expanded = new Set([...expanded, node.id]);
													}
												}}
											>
												{childCount} children &darr;
											</button>
										{/if}
										{#if blockerNames.length > 0}
											<div class="sk-blockers">
												{#each blockerNames as name}
													<span class="sk-blocker-tag">&larr; {name}</span>
												{/each}
											</div>
										{/if}

										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											class="drag-handle"
											onpointerdown={(e) => handleDragHandleDown(e, node.id)}
											title="Drag to create dependency"
										>
											&#10230;
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.roadmap-combined {
		width: 100%;
		height: 100%;
		display: flex;
		overflow: hidden;
	}

	/* ── Tree sidebar ── */
	.tree-sidebar {
		width: 260px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid #1a1a1a;
		background: #0a0a0a;
	}

	.tree-sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.tree-sidebar-title {
		font-size: 11px;
		font-weight: 600;
		color: #737373;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.scope-clear {
		font-size: 10px;
		color: #525252;
		background: none;
		border: 1px solid #262626;
		border-radius: 4px;
		padding: 2px 6px;
		cursor: pointer;
	}

	.scope-clear:hover {
		color: #a3a3a3;
		border-color: #404040;
	}

	.tree-sidebar-body {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		cursor: pointer;
		transition: background 0.1s;
		min-height: 28px;
	}

	.tree-row:hover {
		background: #141414;
	}

	.tree-row.scoped {
		background: #1a1a2e;
		border-right: 2px solid #3b82f6;
	}

	.tree-chevron {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 7px;
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
		width: 14px;
		flex-shrink: 0;
	}

	.tree-status {
		font-size: 9px;
		flex-shrink: 0;
	}

	.tree-type-badge {
		font-size: 8px;
		text-transform: uppercase;
		flex-shrink: 0;
		opacity: 0.7;
	}

	.tree-label {
		font-size: 11px;
		color: #d4d4d4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.tree-progress-badge {
		font-size: 9px;
		color: #525252;
		background: #141414;
		padding: 0 4px;
		border-radius: 6px;
		flex-shrink: 0;
		margin-left: auto;
	}

	.tree-empty {
		padding: 20px 12px;
		font-size: 11px;
		color: #404040;
		text-align: center;
	}

	/* ── Columns panel ── */
	.columns-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.columns-header {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.scope-info {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.scope-type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.scope-name {
		font-size: 12px;
		color: #a3a3a3;
		font-weight: 500;
	}

	.phase-tabs {
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
	}

	.phase-tab {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border: 1px solid #262626;
		border-radius: 5px;
		background: transparent;
		color: #737373;
		font-size: 10px;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.phase-tab:hover {
		border-color: #404040;
		color: #a3a3a3;
	}

	.phase-tab.active {
		background: #1f1f1f;
		border-color: #525252;
		color: #e5e5e5;
	}

	.phase-tab.locked {
		opacity: 0.5;
	}

	.phase-arrow {
		color: #404040;
		font-size: 10px;
		flex-shrink: 0;
	}

	.phase-status {
		font-size: 9px;
	}

	.phase-title {
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.phase-progress {
		font-size: 9px;
		color: #525252;
		background: #1a1a1a;
		padding: 0 4px;
		border-radius: 6px;
	}

	/* ── Columns container ── */
	.columns-container {
		flex: 1;
		overflow: auto;
		position: relative;
	}

	.columns-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #404040;
		font-size: 12px;
	}

	.arrow-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	}

	.columns-scroll {
		display: flex;
		gap: 12px;
		padding: 12px;
		min-height: 100%;
	}

	.dep-column {
		min-width: 240px;
		max-width: 300px;
		flex: 1;
		display: flex;
		flex-direction: column;
		background: #0f0f0f;
		border-radius: 8px;
		border: 1px solid #1a1a1a;
	}

	.dep-column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
	}

	.column-label {
		font-size: 10px;
		font-weight: 600;
		color: #a3a3a3;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.column-count {
		font-size: 9px;
		color: #525252;
		background: #1a1a1a;
		padding: 1px 5px;
		border-radius: 8px;
	}

	.dep-column-body {
		flex: 1;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
	}

	/* ── Cards ── */
	.sk-card {
		background: #141414;
		border: 1px solid #262626;
		border-left: 3px solid;
		border-radius: 6px;
		padding: 10px 12px;
		cursor: pointer;
		transition: all 0.15s;
		position: relative;
	}

	.sk-card:hover {
		border-color: #404040;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	.sk-card.dimmed {
		opacity: 0.2;
	}

	.sk-card.drag-target {
		border-color: #f97316;
		box-shadow:
			0 0 0 1px #f97316,
			0 2px 12px rgba(249, 115, 22, 0.3);
	}

	.sk-card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.sk-type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sk-status {
		font-size: 11px;
	}

	.sk-title {
		font-size: 12px;
		font-weight: 600;
		color: #e5e5e5;
		line-height: 1.35;
		margin-bottom: 4px;
	}

	.sk-title:hover {
		text-decoration: underline;
	}

	.sk-intent {
		font-size: 11px;
		color: #737373;
		line-height: 1.3;
		margin-bottom: 6px;
	}

	.sk-drill {
		font-size: 10px;
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.08);
		border: none;
		border-radius: 4px;
		padding: 2px 8px;
		cursor: pointer;
		margin-bottom: 4px;
	}

	.sk-drill:hover {
		background: rgba(59, 130, 246, 0.15);
	}

	.sk-blockers {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.sk-blocker-tag {
		font-size: 9px;
		color: #f97316;
		background: rgba(249, 115, 22, 0.1);
		padding: 1px 6px;
		border-radius: 4px;
		white-space: nowrap;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.drag-handle {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: #404040;
		cursor: crosshair;
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.sk-card:hover .drag-handle {
		opacity: 1;
	}

	.drag-handle:hover {
		color: #f97316;
		background: rgba(249, 115, 22, 0.1);
	}
</style>
