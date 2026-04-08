<script lang="ts">
	import { onMount } from 'svelte';
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		selectedIds?: Set<string>;
		onSelectNode?: (id: string) => void;
		onOpenNode?: (id: string) => void;
		filterType?: string | null;
		filterLayer?: number | null;
	}

	let {
		nodes,
		edges,
		selectedIds = new Set<string>(),
		onSelectNode,
		onOpenNode,
		filterType = null,
		filterLayer = null
	}: Props = $props();

	let containerEl: HTMLDivElement;
	let svgEl: SVGSVGElement;
	let width = $state(800);
	let height = $state(600);

	// Simulation state
	let simNodes = $state<
		Array<{ id: string; x: number; y: number; vx: number; vy: number; node: Node }>
	>([]);
	let animFrame: number | null = null;
	let settled = false;
	let iterations = 0;
	let mounted = false;

	let filteredNodes = $derived(
		nodes.filter((n) => {
			if (filterType && n.type !== filterType) return false;
			if (filterLayer !== null && n.layer !== filterLayer) return false;
			return true;
		})
	);

	let filteredNodeIds = $derived(new Set(filteredNodes.map((n) => n.id)));

	let filteredEdges = $derived(
		edges.filter((e) => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId))
	);

	let highlightedIds = $derived.by(() => {
		if (selectedIds.size === 0) return new Set<string>();
		const connected = new Set<string>(selectedIds);
		for (const edge of filteredEdges) {
			if (selectedIds.has(edge.sourceId)) connected.add(edge.targetId);
			if (selectedIds.has(edge.targetId)) connected.add(edge.sourceId);
		}
		return connected;
	});

	// Track node ids to detect real changes
	let lastNodeIds = '';

	function initSimulation() {
		// Cancel any running animation
		if (animFrame !== null) {
			cancelAnimationFrame(animFrame);
			animFrame = null;
		}

		simNodes = filteredNodes.map((n) => ({
			id: n.id,
			x: n.positionX ?? Math.random() * width,
			y: n.positionY ?? Math.random() * height,
			vx: 0,
			vy: 0,
			node: n
		}));
		settled = false;
		iterations = 0;
		tick();
	}

	function tick() {
		if (settled) return;

		const alpha = Math.max(0.001, 0.1 * Math.pow(0.99, iterations));
		iterations++;

		// Center force
		const cx = width / 2;
		const cy = height / 2;

		for (const sn of simNodes) {
			sn.vx += (cx - sn.x) * 0.001 * alpha;
			sn.vy += (cy - sn.y) * 0.001 * alpha;
		}

		// Repulsion (charge force)
		for (let i = 0; i < simNodes.length; i++) {
			for (let j = i + 1; j < simNodes.length; j++) {
				const a = simNodes[i];
				const b = simNodes[j];
				let dx = b.x - a.x;
				let dy = b.y - a.y;
				let dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 1) dist = 1;
				const force = (-300 * alpha) / (dist * dist);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				a.vx -= fx;
				a.vy -= fy;
				b.vx += fx;
				b.vy += fy;
			}
		}

		// Link force — snapshot edges to avoid reactive reads during animation
		const edgesSnapshot = filteredEdges;
		const nodeIndex = new Map(simNodes.map((sn, i) => [sn.id, i]));
		for (const edge of edgesSnapshot) {
			const si = nodeIndex.get(edge.sourceId);
			const ti = nodeIndex.get(edge.targetId);
			if (si === undefined || ti === undefined) continue;
			const a = simNodes[si];
			const b = simNodes[ti];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			let dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 1) dist = 1;
			const targetDist = 150;
			const force = (dist - targetDist) * 0.01 * alpha;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			a.vx += fx;
			a.vy += fy;
			b.vx -= fx;
			b.vy -= fy;
		}

		// Apply velocity with damping
		let totalMovement = 0;
		for (const sn of simNodes) {
			sn.vx *= 0.6;
			sn.vy *= 0.6;
			sn.x += sn.vx;
			sn.y += sn.vy;
			totalMovement += Math.abs(sn.vx) + Math.abs(sn.vy);
		}

		// Force reactivity update
		simNodes = [...simNodes];

		if (totalMovement < 0.5 || iterations > 300) {
			settled = true;
			animFrame = null;
		} else {
			animFrame = requestAnimationFrame(tick);
		}
	}

	function getEdgeColor(relationType: string): string {
		switch (relationType) {
			case 'supports':
				return '#22c55e';
			case 'contradicts':
				return '#ef4444';
			case 'blocks':
				return '#f97316';
			case 'implements':
				return '#6366f1';
			case 'duplicates':
				return '#737373';
			case 'refines':
				return '#06b6d4';
			default:
				return '#525252';
		}
	}

	function handleNodeClick(id: string) {
		onSelectNode?.(id);
	}

	onMount(() => {
		if (containerEl) {
			width = containerEl.clientWidth;
			height = containerEl.clientHeight;
		}
		mounted = true;
		lastNodeIds = filteredNodes
			.map((n) => n.id)
			.sort()
			.join(',');
		initSimulation();
		return () => {
			mounted = false;
			if (animFrame !== null) cancelAnimationFrame(animFrame);
		};
	});

	// Re-init only when the set of node IDs actually changes
	$effect(() => {
		const ids = filteredNodes
			.map((n) => n.id)
			.sort()
			.join(',');
		if (mounted && ids !== lastNodeIds) {
			lastNodeIds = ids;
			initSimulation();
		}
	});

	// Filter controls
	let showFilters = $state(false);
	let selectedType = $state<string | null>(null);
</script>

<div class="graph-container" bind:this={containerEl}>
	<!-- Filter bar -->
	<div class="graph-toolbar">
		<button
			class="filter-btn"
			class:active={showFilters}
			onclick={() => (showFilters = !showFilters)}
		>
			Filter
		</button>
		{#if showFilters}
			<div class="filter-pills">
				<button
					class="pill"
					class:active={selectedType === null}
					onclick={() => (selectedType = null)}
				>
					All
				</button>
				{#each ['idea', 'note', 'question', 'goal', 'problem', 'decision', 'intent', 'epic'] as t}
					{@const cfg = getNodeTypeConfig(t)}
					<button
						class="pill"
						class:active={selectedType === t}
						style:--pill-color={cfg.badge}
						onclick={() => (selectedType = selectedType === t ? null : t)}
					>
						{cfg.label}
					</button>
				{/each}
			</div>
		{/if}
		<span class="graph-stats">{filteredNodes.length} nodes · {filteredEdges.length} edges</span>
	</div>

	<svg bind:this={svgEl} {width} {height} class="graph-svg">
		<!-- Edges -->
		{#each filteredEdges as edge (edge.id)}
			{@const sourceNode = simNodes.find((sn) => sn.id === edge.sourceId)}
			{@const targetNode = simNodes.find((sn) => sn.id === edge.targetId)}
			{#if sourceNode && targetNode}
				<line
					x1={sourceNode.x}
					y1={sourceNode.y}
					x2={targetNode.x}
					y2={targetNode.y}
					stroke={getEdgeColor(edge.relationType)}
					stroke-width="1.5"
					stroke-dasharray={edge.source === 'ai' ? '4 3' : 'none'}
					opacity="0.5"
				>
					<title>{edge.relationType}</title>
				</line>
			{/if}
		{/each}

		<!-- Nodes -->
		{#each simNodes as sn (sn.id)}
			{@const cfg = getNodeTypeConfig(sn.node.type)}
			{@const isSelected = selectedIds.has(sn.id)}
			{@const isHighlighted = highlightedIds.has(sn.id)}
			{@const dimmed = selectedIds.size > 0 && !isHighlighted}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<g
				class="graph-node"
				class:dimmed
				transform="translate({sn.x}, {sn.y})"
				onclick={() => handleNodeClick(sn.id)}
				ondblclick={() => onOpenNode?.(sn.id)}
				role="button"
				tabindex="0"
			>
				<circle
					r="24"
					fill={cfg.bg}
					stroke={isSelected ? '#6366f1' : cfg.border}
					stroke-width={isSelected ? 3 : 1.5}
				/>
				<circle r="6" fill={cfg.badge} />
				<text y="38" text-anchor="middle" fill="#a3a3a3" font-size="10" font-weight="500">
					{sn.node.title.length > 16 ? sn.node.title.slice(0, 14) + '…' : sn.node.title}
				</text>
				<title>{sn.node.type}: {sn.node.title}</title>
			</g>
		{/each}
	</svg>
</div>

<style>
	.graph-container {
		width: 100%;
		height: 100%;
		position: relative;
		background: #0a0a0a;
		overflow: hidden;
	}

	.graph-svg {
		display: block;
	}

	.graph-toolbar {
		position: absolute;
		top: 8px;
		left: 8px;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.filter-btn {
		padding: 4px 10px;
		font-size: 11px;
		border-radius: 4px;
		border: 1px solid #333;
		background: #1a1a1a;
		color: #a3a3a3;
		cursor: pointer;
	}

	.filter-btn.active,
	.filter-btn:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.filter-pills {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.pill {
		padding: 2px 8px;
		font-size: 10px;
		border-radius: 10px;
		border: 1px solid #333;
		background: #1a1a1a;
		color: #737373;
		cursor: pointer;
	}

	.pill.active {
		background: var(--pill-color, #333);
		color: white;
		border-color: transparent;
	}

	.graph-stats {
		font-size: 10px;
		color: #525252;
		margin-left: 8px;
	}

	.graph-node {
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.graph-node.dimmed {
		opacity: 0.25;
	}

	.graph-node:hover circle:first-of-type {
		stroke-width: 2.5;
	}
</style>
