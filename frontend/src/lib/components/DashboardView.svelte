<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { computeDependencyColumns, phaseProgress } from '$lib/dependency-graph';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		allNodes: Node[];
		edges: NodeEdge[];
		onOpenNode: (id: string) => void;
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
	}

	let { allNodes, edges, onOpenNode, onUpdateNode }: Props = $props();

	const PLANNING_TYPES = new Set([
		'feature',
		'goal',
		'initiative',
		'epic',
		'phase',
		'ticket',
		'intent'
	]);

	// ── Active Now ──

	let activeNodes = $derived(allNodes.filter((n) => n.status === 'active'));

	let activeByType = $derived.by(() => {
		const groups = new Map<string, Node[]>();
		for (const node of activeNodes) {
			const list = groups.get(node.type) ?? [];
			list.push(node);
			groups.set(node.type, list);
		}
		return groups;
	});

	// ── Up Next ──

	let planningNodes = $derived(allNodes.filter((n) => PLANNING_TYPES.has(n.type)));

	let leafNodes = $derived.by(() => {
		const hasChild = new Set<string>();
		for (const n of planningNodes) {
			if (n.parentId) hasChild.add(n.parentId);
		}
		return planningNodes.filter((n) => !hasChild.has(n.id));
	});

	let waveColumns = $derived(computeDependencyColumns(leafNodes, edges));

	let upNextNodes = $derived.by(() => {
		const wave0Drafts = leafNodes.filter(
			(n) => waveColumns.get(n.id) === 0 && n.status === 'draft'
		);
		if (wave0Drafts.length > 0) return wave0Drafts;
		return leafNodes.filter((n) => waveColumns.get(n.id) === 1 && n.status === 'draft');
	});

	// ── Status helpers ──

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

	function handleStatusClick(e: Event, node: Node) {
		e.stopPropagation();
		const cycle: Record<string, string> = { draft: 'active', active: 'done', done: 'draft' };
		onUpdateNode(node.id, { status: cycle[node.status] ?? 'active' });
	}

	function getProgress(node: Node): { done: number; total: number } | null {
		const p = phaseProgress(node.id, allNodes);
		return p.total > 0 ? p : null;
	}
</script>

<div class="dashboard-view">
	<!-- Active Now -->
	<div class="dashboard-section">
		<div class="section-header">
			<h3>Active Now</h3>
			<span class="section-count">{activeNodes.length}</span>
		</div>
		<div class="section-body">
			{#if activeNodes.length === 0}
				<p class="section-empty">No items currently active.</p>
			{:else}
				{#each [...activeByType.entries()] as [type, nodes] (type)}
					{@const cfg = getNodeTypeConfig(type)}
					<div class="type-group">
						<div class="type-group-label">{cfg.label} ({nodes.length})</div>
						{#each nodes as node (node.id)}
							{@const st = statusDot(node.status)}
							{@const nodeCfg = getNodeTypeConfig(node.type)}
							{@const progress = getProgress(node)}
							<div
								class="dash-row"
								role="button"
								tabindex="0"
								onclick={() => onOpenNode(node.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter') onOpenNode(node.id);
								}}
							>
								<button
									class="status-dot"
									style:color={st.color}
									onclick={(e) => handleStatusClick(e, node)}
									title="Click to change status"
								>
									{st.char}
								</button>
								<span class="type-badge" style:background={nodeCfg.badge}>
									{nodeCfg.label}
								</span>
								<span class="row-title">{node.title}</span>
								{#if progress}
									<span class="progress">{progress.done}/{progress.total}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Up Next -->
	<div class="dashboard-section">
		<div class="section-header">
			<h3>Up Next</h3>
			<span class="section-count">{upNextNodes.length}</span>
			<span class="section-hint">Unblocked, ready to start</span>
		</div>
		<div class="section-body">
			{#if upNextNodes.length === 0}
				<p class="section-empty">All unblocked items are active or done.</p>
			{:else}
				{#each upNextNodes as node (node.id)}
					{@const st = statusDot(node.status)}
					{@const cfg = getNodeTypeConfig(node.type)}
					{@const progress = getProgress(node)}
					<div
						class="dash-row"
						role="button"
						tabindex="0"
						onclick={() => onOpenNode(node.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter') onOpenNode(node.id);
						}}
					>
						<button
							class="status-dot"
							style:color={st.color}
							onclick={(e) => handleStatusClick(e, node)}
							title="Click to change status"
						>
							{st.char}
						</button>
						<span class="type-badge" style:background={cfg.badge}>
							{cfg.label}
						</span>
						<span class="row-title">{node.title}</span>
						{#if progress}
							<span class="progress">{progress.done}/{progress.total}</span>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.dashboard-view {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.dashboard-section {
		margin-bottom: 24px;
	}

	.section-header {
		display: flex;
		align-items: center;
		padding: 0 8px 8px;
	}

	.section-header h3 {
		font-size: 11px;
		font-weight: 600;
		color: #a3a3a3;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0;
	}

	.section-count {
		font-size: 10px;
		color: #525252;
		margin-left: 8px;
	}

	.section-hint {
		font-size: 10px;
		color: #404040;
		margin-left: auto;
	}

	.section-body {
		display: flex;
		flex-direction: column;
	}

	.section-empty {
		color: #404040;
		font-size: 13px;
		padding: 20px 8px;
		margin: 0;
	}

	.type-group {
		margin-bottom: 4px;
	}

	.type-group-label {
		font-size: 10px;
		color: #525252;
		padding: 8px 8px 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.dash-row {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 8px;
		border-radius: 6px;
		cursor: pointer;
		width: 100%;
		background: none;
		border: none;
		text-align: left;
		color: inherit;
	}

	.dash-row:hover {
		background: #141414;
	}

	.status-dot {
		width: 20px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 12px;
		padding: 0;
		line-height: 1;
		flex-shrink: 0;
	}

	.type-badge {
		font-size: 9px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #fff;
		flex-shrink: 0;
	}

	.row-title {
		font-size: 13px;
		color: #d4d4d4;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress {
		font-size: 10px;
		color: #525252;
		flex-shrink: 0;
	}
</style>
