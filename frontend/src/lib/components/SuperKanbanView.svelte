<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import {
		computeDependencyColumns,
		getBlockers,
		getBlocked,
		phaseProgress,
		isPhaseUnlocked,
		getUpstreamChain,
		getDownstreamChain
	} from '$lib/dependency-graph';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		allNodes: Node[];
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onOpenNode?: (id: string) => void;
		onCreateEdge?: (sourceId: string, targetId: string) => void;
	}

	let { nodes, edges, allNodes, onUpdateNode, onOpenNode, onCreateEdge }: Props = $props();

	// Phase tabs
	let phases = $derived(
		allNodes
			.filter((n) => n.type === 'phase' && nodes.some((v) => v.parentId === n.id))
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
	);

	let activePhaseId = $state<string | null>(null);

	// Auto-select first active phase on mount
	$effect(() => {
		if (activePhaseId === null) {
			if (phases.length > 0) {
				const active = phases.find((p) => p.status === 'active');
				activePhaseId = active?.id ?? phases[0].id;
			} else {
				activePhaseId = 'all';
			}
		}
	});

	// Phase-level block edges for tab arrows
	let phaseBlockEdges = $derived(
		edges.filter(
			(e) =>
				e.relationType === 'blocks' &&
				phases.some((p) => p.id === e.sourceId) &&
				phases.some((p) => p.id === e.targetId)
		)
	);

	// Filtered tickets for the active phase (or all)
	let filteredTickets = $derived.by(() => {
		if (activePhaseId === 'all') return nodes;
		if (!activePhaseId) return nodes;
		return nodes.filter((n) => n.parentId === activePhaseId);
	});

	// Dependency columns
	let depColumns = $derived(computeDependencyColumns(filteredTickets, edges));

	let maxColumn = $derived(Math.max(0, ...depColumns.values()));

	let columnGroups = $derived.by(() => {
		const groups: Map<number, Node[]> = new Map();
		for (let i = 0; i <= maxColumn; i++) groups.set(i, []);
		for (const node of filteredTickets) {
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

	// Hover highlighting
	let hoveredNodeId = $state<string | null>(null);

	let highlightedIds = $derived.by(() => {
		if (!hoveredNodeId) return null;
		const upstream = getUpstreamChain(hoveredNodeId, edges);
		const downstream = getDownstreamChain(hoveredNodeId, edges);
		const all = new Set([hoveredNodeId, ...upstream, ...downstream]);
		return all;
	});

	// Arrow data for SVG overlay
	let outerEl = $state<HTMLDivElement>();
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
				filteredTickets.some((n) => n.id === e.sourceId) &&
				filteredTickets.some((n) => n.id === e.targetId)
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
		// Recalc whenever tickets or columns change
		filteredTickets;
		depColumns;
		requestAnimationFrame(recalcArrows);
	});

	// Recalc arrows on scroll and resize
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

	// Drag to create dependency
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
			// Track hover target for visual feedback
			const el = document.elementFromPoint(me.clientX, me.clientY);
			const cardEl = el?.closest('[data-node-id]') as HTMLElement | null;
			const targetId = cardEl?.dataset.nodeId ?? null;
			dragOverNodeId = targetId && targetId !== dragSourceId ? targetId : null;
		};

		const handleUp = (ue: PointerEvent) => {
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);

			// Check if dropped on a card
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

	function cardAction(el: HTMLDivElement, nodeId: string) {
		cardElMap.set(nodeId, el);
		return {
			destroy() {
				cardElMap.delete(nodeId);
			}
		};
	}
</script>

<div class="super-kanban" bind:this={outerEl}>
	<!-- Phase tabs -->
	<div class="phase-tabs">
		{#if phases.length > 0}
			{#each phases as phase, i}
				{@const progress = phaseProgress(phase.id, allNodes)}
				{@const unlocked = isPhaseUnlocked(phase.id, edges, allNodes)}
				{#if i > 0}
					<span class="phase-arrow">→</span>
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
		{/if}
		<button
			class="phase-tab"
			class:active={activePhaseId === 'all'}
			onclick={() => (activePhaseId = 'all')}
		>
			All{#if phases.length === 0}
				items{/if}
		</button>
	</div>

	<!-- Dependency columns -->
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
					marker-end="url(#arrowhead)"
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
				<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
					<polygon points="0 0, 8 3, 0 6" fill="#f97316" />
				</marker>
			</defs>
		</svg>

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
								onclick={() => onOpenNode?.(node.id)}
								role="button"
								tabindex="0"
							>
								<div class="sk-card-top">
									<span class="sk-type" style:color={config.badge}>{config.label}</span>
									<span class="sk-status" style:color={statusColor(node.status)}>
										{statusDot(node.status)}
									</span>
								</div>
								<div class="sk-title">{node.title}</div>
								{#if intent}
									<div class="sk-intent">{intent.slice(0, 80)}{intent.length > 80 ? '…' : ''}</div>
								{/if}
								{#if blockerNames.length > 0}
									<div class="sk-blockers">
										{#each blockerNames as name}
											<span class="sk-blocker-tag">← {name}</span>
										{/each}
									</div>
								{/if}

								<!-- Drag handle for creating dependencies -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="drag-handle"
									onpointerdown={(e) => handleDragHandleDown(e, node.id)}
									title="Drag to create dependency"
								>
									⟶
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.super-kanban {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.phase-tabs {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		overflow-x: auto;
		flex-shrink: 0;
	}

	.phase-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid #262626;
		border-radius: 6px;
		background: transparent;
		color: #737373;
		font-size: 11px;
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
		font-size: 11px;
		flex-shrink: 0;
	}

	.phase-status {
		font-size: 10px;
	}

	.phase-title {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.phase-progress {
		font-size: 10px;
		color: #525252;
		background: #1a1a1a;
		padding: 1px 5px;
		border-radius: 8px;
	}

	.columns-container {
		flex: 1;
		overflow: auto;
		position: relative;
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
		min-width: 260px;
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
		padding: 10px 12px;
		border-bottom: 1px solid #1a1a1a;
	}

	.column-label {
		font-size: 11px;
		font-weight: 600;
		color: #a3a3a3;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.column-count {
		font-size: 10px;
		color: #525252;
		background: #1a1a1a;
		padding: 1px 6px;
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

	.sk-intent {
		font-size: 11px;
		color: #737373;
		line-height: 1.3;
		margin-bottom: 6px;
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
