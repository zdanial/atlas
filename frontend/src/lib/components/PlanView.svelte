<script lang="ts">
	import { onMount } from 'svelte';
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import {
		computeDependencyColumns,
		phaseProgress,
		getUpstreamChain,
		getDownstreamChain
	} from '$lib/dependency-graph';
	import { isDrillable } from '$lib/stores/planningNav.svelte';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		allNodes: Node[];
		onOpenNode: (id: string) => void;
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		onCreateEdge?: (sourceId: string, targetId: string) => void;
		onDrillIn: (id: string) => void;
		onHoverNode?: (id: string, pos: { x: number; y: number }) => void;
		onLeaveNode?: (id: string) => void;
	}

	let {
		nodes,
		edges,
		allNodes,
		onOpenNode,
		onUpdateNode,
		onDrillIn,
		onHoverNode,
		onLeaveNode
	}: Props = $props();

	// ── Tree state ──

	let expanded = $state<Set<string>>(new Set());

	// Auto-expand roots on mount
	let treeRoots = $derived(
		nodes
			.filter((n) => !nodes.some((p) => p.id === n.parentId))
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
	);

	onMount(() => {
		expanded = new Set(treeRoots.map((n) => n.id));
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

	// ── Flat tree ──

	interface FlatTreeItem {
		node: Node;
		depth: number;
		hasChildren: boolean;
		isExpanded: boolean;
		isLeaf: boolean;
		progress: { done: number; total: number } | null;
	}

	let flatTree = $derived.by(() => {
		const items: FlatTreeItem[] = [];
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
				const isLeaf = !hasChildren;
				const showProgress =
					hasChildren &&
					['epic', 'phase', 'feature', 'intent', 'initiative', 'goal'].includes(child.type);
				const progress = showProgress ? phaseProgress(child.id, allNodes) : null;
				items.push({ node: child, depth, hasChildren, isExpanded, isLeaf, progress });
				if (isExpanded && hasChildren) {
					walk(child.id, depth + 1);
				}
			}
		}
		walk(null, 0);
		return items;
	});

	// ── Wave computation ──

	// Collect all leaf descendants from visible top-level nodes
	function collectLeafDescendants(rootIds: string[]): Node[] {
		const leaves: Node[] = [];
		const visited = new Set<string>();
		function walk(id: string) {
			if (visited.has(id)) return;
			visited.add(id);
			const children = allNodes.filter((n) => n.parentId === id);
			if (children.length === 0) {
				const node = allNodes.find((n) => n.id === id);
				if (node) leaves.push(node);
			} else {
				for (const c of children) walk(c.id);
			}
		}
		for (const id of rootIds) walk(id);
		return leaves;
	}

	let leafDescendants = $derived(collectLeafDescendants(treeRoots.map((n) => n.id)));
	let waveColumns = $derived(computeDependencyColumns(leafDescendants, edges));
	let maxWave = $derived(leafDescendants.length > 0 ? Math.max(0, ...waveColumns.values()) : 0);

	// Wave spans for parent nodes
	let waveSpans = $derived.by(() => {
		const spans = new Map<string, { min: number; max: number }>();

		function getSpan(nodeId: string): { min: number; max: number } | null {
			if (spans.has(nodeId)) return spans.get(nodeId)!;
			const wave = waveColumns.get(nodeId);
			if (wave !== undefined) return { min: wave, max: wave };

			const children = allNodes.filter((n) => n.parentId === nodeId);
			if (children.length === 0) return null;

			let min = Infinity;
			let max = -Infinity;
			for (const child of children) {
				const childSpan = getSpan(child.id);
				if (childSpan) {
					min = Math.min(min, childSpan.min);
					max = Math.max(max, childSpan.max);
				}
			}
			if (min === Infinity) return null;
			const span = { min, max };
			spans.set(nodeId, span);
			return span;
		}

		for (const item of flatTree) {
			if (!item.isLeaf) {
				getSpan(item.node.id);
			}
		}
		return spans;
	});

	// ── Hover / dependency chain highlighting ──

	let hoveredNodeId = $state<string | null>(null);

	let highlightedIds = $derived.by(() => {
		if (!hoveredNodeId) return null;
		const up = getUpstreamChain(hoveredNodeId, edges);
		const down = getDownstreamChain(hoveredNodeId, edges);
		const all = new Set([hoveredNodeId, ...up, ...down]);
		return all;
	});

	// ── Arrow rendering ──

	let barElMap = new Map<string, HTMLElement>();
	let planBodyEl: HTMLElement | undefined = $state();
	let arrowPaths = $state<Array<{ d: string; highlighted: boolean }>>([]);

	function trackBar(el: HTMLElement, id: string) {
		barElMap.set(id, el);
		recalcArrows();
		return {
			destroy() {
				barElMap.delete(id);
			}
		};
	}

	function recalcArrows() {
		if (!planBodyEl) {
			arrowPaths = [];
			return;
		}
		const containerRect = planBodyEl.getBoundingClientRect();
		const paths: typeof arrowPaths = [];

		const blockEdges = edges.filter(
			(e) => e.relationType === 'blocks' && barElMap.has(e.sourceId) && barElMap.has(e.targetId)
		);

		for (const edge of blockEdges) {
			const srcEl = barElMap.get(edge.sourceId)!;
			const tgtEl = barElMap.get(edge.targetId)!;
			const srcRect = srcEl.getBoundingClientRect();
			const tgtRect = tgtEl.getBoundingClientRect();

			const x1 = srcRect.right - containerRect.left;
			const y1 = srcRect.top + srcRect.height / 2 - containerRect.top;
			const x2 = tgtRect.left - containerRect.left;
			const y2 = tgtRect.top + tgtRect.height / 2 - containerRect.top;

			const dx = Math.abs(x2 - x1) * 0.4;
			const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

			const isHighlighted =
				!highlightedIds || (highlightedIds.has(edge.sourceId) && highlightedIds.has(edge.targetId));

			paths.push({ d, highlighted: isHighlighted });
		}

		arrowPaths = paths;
	}

	$effect(() => {
		// Recalc when data changes
		void flatTree;
		void waveColumns;
		void highlightedIds;
		requestAnimationFrame(recalcArrows);
	});

	// ── Interactions ──

	function handleRowClick(id: string) {
		onOpenNode(id);
	}

	function handleRowDblClick(e: Event, id: string) {
		const node = allNodes.find((n) => n.id === id);
		if (node && isDrillable(node.type)) {
			e.preventDefault();
			onDrillIn(id);
		}
	}

	function handleStatusClick(e: Event, id: string, currentStatus: string) {
		e.stopPropagation();
		const cycle: Record<string, string> = { draft: 'active', active: 'done', done: 'draft' };
		const next = cycle[currentStatus] ?? 'active';
		onUpdateNode(id, { status: next });
	}

	function handleRowHover(id: string, e: MouseEvent) {
		hoveredNodeId = id;
		const node = allNodes.find((n) => n.id === id);
		if (node && isDrillable(node.type) && getChildren(id).length > 0 && onHoverNode) {
			onHoverNode(id, { x: e.clientX, y: e.clientY });
		}
	}

	function handleRowLeave(id: string) {
		hoveredNodeId = null;
		onLeaveNode?.(id);
	}

	// ── Status rendering ──

	function statusDot(status: string): { char: string; color: string } {
		switch (status) {
			case 'done':
				return { char: '✓', color: '#22c55e' };
			case 'active':
				return { char: '●', color: '#3b82f6' };
			default:
				return { char: '○', color: '#525252' };
		}
	}

	// ── Bar positioning ──

	function barLeft(wave: number): string {
		const cols = maxWave + 1;
		return `${(wave / cols) * 100}%`;
	}

	function barWidth(): string {
		const cols = maxWave + 1;
		return `${(0.8 / cols) * 100}%`;
	}

	function stripeLeft(min: number): string {
		const cols = maxWave + 1;
		return `${(min / cols) * 100}%`;
	}

	function stripeWidth(min: number, max: number): string {
		const cols = maxWave + 1;
		return `${((max - min + 1) / cols) * 100}%`;
	}

	function barStatusClass(status: string): string {
		switch (status) {
			case 'done':
				return 'bar-done';
			case 'active':
				return 'bar-active';
			default:
				return 'bar-draft';
		}
	}

	// Wave labels
	let waveLabels = $derived(
		Array.from({ length: maxWave + 1 }, (_, i) => (i === 0 ? 'Ready' : `Wave ${i}`))
	);
</script>

<div class="plan-view">
	<!-- Wave header -->
	<div class="plan-header">
		<div class="tree-col-header">Plan</div>
		<div class="wave-headers">
			{#each waveLabels as label, i}
				<div class="wave-label" style:width="{100 / (maxWave + 1)}%">
					{label}
				</div>
			{/each}
		</div>
	</div>

	<!-- Scrollable body -->
	<div class="plan-body" bind:this={planBodyEl}>
		<!-- Arrow SVG overlay -->
		<svg class="arrow-overlay">
			<defs>
				<marker id="arrowhead-pv" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
					<polygon points="0 0, 8 3, 0 6" fill="#f97316" />
				</marker>
			</defs>
			{#each arrowPaths as arrow}
				<path
					d={arrow.d}
					fill="none"
					stroke="#f97316"
					stroke-width="1.5"
					stroke-opacity={arrow.highlighted ? 0.7 : 0.1}
					marker-end="url(#arrowhead-pv)"
				/>
			{/each}
		</svg>

		{#each flatTree as item, idx}
			{@const st = statusDot(item.node.status)}
			{@const cfg = getNodeTypeConfig(item.node.type)}
			{@const wave = waveColumns.get(item.node.id)}
			{@const span = waveSpans.get(item.node.id)}
			{@const isDimmed = highlightedIds !== null && !highlightedIds.has(item.node.id)}
			<div
				class="plan-row"
				class:dimmed={isDimmed}
				class:swim-lane={item.depth === 0 && idx > 0}
				onclick={() => handleRowClick(item.node.id)}
				ondblclick={(e) => handleRowDblClick(e, item.node.id)}
				onmouseenter={(e) => handleRowHover(item.node.id, e)}
				onmouseleave={() => handleRowLeave(item.node.id)}
				role="button"
				tabindex="0"
			>
				<!-- Tree cell (left) -->
				<div class="tree-cell" style:padding-left="{8 + item.depth * 20}px">
					{#if item.hasChildren}
						<button
							class="chevron"
							onclick={(e) => toggleExpand(e, item.node.id)}
							aria-label={item.isExpanded ? 'Collapse' : 'Expand'}
						>
							{item.isExpanded ? '▼' : '▶'}
						</button>
					{:else}
						<span class="chevron-spacer"></span>
					{/if}

					<button
						class="status-dot"
						style:color={st.color}
						onclick={(e) => handleStatusClick(e, item.node.id, item.node.status)}
						title="Click to change status"
					>
						{st.char}
					</button>

					<span class="type-badge" style:background={cfg.badge}>{cfg.label}</span>

					<span class="row-title">{item.node.title}</span>

					{#if item.progress && item.progress.total > 0}
						<span class="progress-count">
							{item.progress.done}/{item.progress.total}
						</span>
					{/if}
				</div>

				<!-- Bar cell (right) -->
				<div class="bar-cell">
					{#if item.isLeaf && wave !== undefined}
						<!-- Leaf bar -->
						<div
							class="seq-bar {barStatusClass(item.node.status)}"
							style:left={barLeft(wave)}
							style:width={barWidth()}
							use:trackBar={item.node.id}
						></div>
					{:else if !item.isLeaf && span}
						<!-- Parent progress stripe -->
						{@const prog = item.progress}
						<div
							class="seq-stripe"
							class:collapsed-stripe={!item.isExpanded}
							style:left={stripeLeft(span.min)}
							style:width={stripeWidth(span.min, span.max)}
						>
							{#if prog && prog.total > 0}
								<div
									class="stripe-fill"
									style:width="{(prog.done / prog.total) * 100}%"
									style:background={cfg.badge}
								></div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if flatTree.length === 0}
			<div class="empty-hint">No items to display.</div>
		{/if}
	</div>

	<!-- Wave gridlines -->
	{#if maxWave > 0}
		<div class="wave-gridlines" style:left="300px">
			{#each Array.from({ length: maxWave }, (_, i) => i + 1) as col}
				<div class="wave-gridline" style:left="{(col / (maxWave + 1)) * 100}%"></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.plan-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative;
		overflow: hidden;
	}

	/* ── Header ── */

	.plan-header {
		display: flex;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
		flex-shrink: 0;
		height: 28px;
		align-items: center;
	}

	.tree-col-header {
		width: 300px;
		min-width: 300px;
		font-size: 10px;
		font-weight: 600;
		color: #525252;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding-left: 12px;
		flex-shrink: 0;
	}

	.wave-headers {
		flex: 1;
		display: flex;
		min-width: 0;
	}

	.wave-label {
		font-size: 9px;
		font-weight: 600;
		color: #404040;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		text-align: center;
		padding: 0 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Body ── */

	.plan-body {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		position: relative;
	}

	.arrow-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		overflow: visible;
	}

	/* ── Rows ── */

	.plan-row {
		display: flex;
		height: 32px;
		align-items: center;
		cursor: pointer;
		transition: background 0.1s;
		position: relative;
	}

	.plan-row:hover {
		background: #141414;
	}

	.plan-row.dimmed {
		opacity: 0.2;
		transition: opacity 0.2s;
	}

	.plan-row.swim-lane {
		border-top: 1px solid #1a1a1a;
	}

	/* ── Tree cell (left) ── */

	.tree-cell {
		width: 300px;
		min-width: 300px;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		overflow: hidden;
	}

	.chevron {
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
		transition: color 0.1s;
	}

	.chevron:hover {
		color: #a3a3a3;
		background: #1a1a1a;
	}

	.chevron-spacer {
		width: 14px;
		flex-shrink: 0;
	}

	.status-dot {
		font-size: 10px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		flex-shrink: 0;
		width: 14px;
		text-align: center;
		transition: transform 0.1s;
	}

	.status-dot:hover {
		transform: scale(1.3);
	}

	.type-badge {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
		line-height: 1.4;
	}

	.row-title {
		font-size: 12px;
		color: #d4d4d4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.progress-count {
		font-size: 10px;
		color: #525252;
		flex-shrink: 0;
		margin-right: 8px;
	}

	/* ── Bar cell (right) ── */

	.bar-cell {
		flex: 1;
		position: relative;
		height: 100%;
		min-width: 0;
	}

	.seq-bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 16px;
		border-radius: 4px;
		z-index: 1;
		transition: opacity 0.2s;
	}

	.bar-done {
		background: #22c55e;
	}

	.bar-active {
		background: #3b82f6;
	}

	.bar-draft {
		background: transparent;
		border: 1.5px dashed #525252;
	}

	.seq-stripe {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 4px;
		border-radius: 2px;
		background: #1a1a1a;
		overflow: hidden;
		z-index: 1;
		transition: height 0.15s;
	}

	.seq-stripe.collapsed-stripe {
		height: 8px;
		border-radius: 4px;
	}

	.stripe-fill {
		height: 100%;
		border-radius: inherit;
		transition: width 0.3s;
	}

	/* ── Wave gridlines ── */

	.wave-gridlines {
		position: absolute;
		top: 28px;
		right: 0;
		bottom: 0;
		left: 300px;
		pointer-events: none;
		z-index: 0;
	}

	.wave-gridline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: #111;
	}

	/* ── Empty ── */

	.empty-hint {
		text-align: center;
		color: #404040;
		font-size: 13px;
		padding: 40px;
	}
</style>
