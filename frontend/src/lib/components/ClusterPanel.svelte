<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		onClose: () => void;
	}

	let { nodes, edges, onClose }: Props = $props();

	interface Cluster {
		id: string;
		title: string;
		summary: string;
		nodeIds: string[];
		contradictions: Array<{ a: string; b: string; reason: string }>;
		duplicates: Array<{ a: string; b: string }>;
	}

	// Simple cluster detection based on shared edges + type similarity
	let clusters = $derived<Cluster[]>(detectClusters(nodes, edges));

	function detectClusters(nodes: Node[], edges: NodeEdge[]): Cluster[] {
		if (nodes.length < 3) return [];

		// Build adjacency list
		const adj = new Map<string, Set<string>>();
		for (const node of nodes) adj.set(node.id, new Set());
		for (const edge of edges) {
			adj.get(edge.sourceId)?.add(edge.targetId);
			adj.get(edge.targetId)?.add(edge.sourceId);
		}

		// Find connected components using BFS
		const visited = new Set<string>();
		const components: string[][] = [];

		for (const node of nodes) {
			if (visited.has(node.id)) continue;
			const component: string[] = [];
			const queue = [node.id];
			while (queue.length > 0) {
				const id = queue.shift()!;
				if (visited.has(id)) continue;
				visited.add(id);
				component.push(id);
				for (const neighbor of adj.get(id) ?? []) {
					if (!visited.has(neighbor)) queue.push(neighbor);
				}
			}
			if (component.length >= 3 && component.length <= 15) {
				components.push(component);
			}
		}

		// Also group by type similarity for unconnected nodes
		const ungrouped = nodes.filter(
			(n) => !visited.has(n.id) || components.every((c) => !c.includes(n.id))
		);
		const typeGroups = new Map<string, string[]>();
		for (const n of ungrouped) {
			const group = typeGroups.get(n.type) ?? [];
			group.push(n.id);
			typeGroups.set(n.type, group);
		}
		for (const [type, ids] of typeGroups) {
			if (ids.length >= 3 && ids.length <= 15) {
				components.push(ids);
			}
		}

		// Build cluster objects
		const nodeMap = new Map(nodes.map((n) => [n.id, n]));
		return components.map((ids, i) => {
			const clusterNodes = ids.map((id) => nodeMap.get(id)!).filter(Boolean);
			const types = new Set(clusterNodes.map((n) => n.type));
			const title =
				types.size === 1
					? `${getNodeTypeConfig(clusterNodes[0].type).label} cluster`
					: `Mixed cluster (${clusterNodes.length} notes)`;

			// Detect contradictions (edges with 'contradicts' type)
			const contradictions = edges
				.filter(
					(e) =>
						e.relationType === 'contradicts' && ids.includes(e.sourceId) && ids.includes(e.targetId)
				)
				.map((e) => ({
					a: nodeMap.get(e.sourceId)?.title ?? e.sourceId,
					b: nodeMap.get(e.targetId)?.title ?? e.targetId,
					reason: 'These notes appear to contradict each other'
				}));

			// Detect potential duplicates (same type + very similar titles)
			const duplicates: Array<{ a: string; b: string }> = [];
			for (let i = 0; i < clusterNodes.length; i++) {
				for (let j = i + 1; j < clusterNodes.length; j++) {
					const a = clusterNodes[i];
					const b = clusterNodes[j];
					if (a.type === b.type && similarity(a.title, b.title) > 0.7) {
						duplicates.push({ a: a.title, b: b.title });
					}
				}
			}

			return {
				id: `cluster_${i}`,
				title,
				summary: `${clusterNodes.length} notes related to: ${clusterNodes
					.slice(0, 3)
					.map((n) => n.title)
					.join(', ')}`,
				nodeIds: ids,
				contradictions,
				duplicates
			};
		});
	}

	function similarity(a: string, b: string): number {
		const aLower = a.toLowerCase();
		const bLower = b.toLowerCase();
		if (aLower === bLower) return 1;

		const aWords = new Set(aLower.split(/\s+/));
		const bWords = new Set(bLower.split(/\s+/));
		let shared = 0;
		for (const w of aWords) {
			if (bWords.has(w)) shared++;
		}
		return (2 * shared) / (aWords.size + bWords.size);
	}

	let expandedCluster = $state<string | null>(null);
</script>

<div class="cluster-panel">
	<div class="panel-header">
		<h2>Clusters</h2>
		<button class="close-btn" onclick={onClose}>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	<div class="panel-body">
		{#if clusters.length === 0}
			<p class="empty">No clusters detected. Add more notes and edges to see clusters emerge.</p>
		{:else}
			{#each clusters as cluster (cluster.id)}
				<div class="cluster-card">
					<button
						class="cluster-header"
						onclick={() => (expandedCluster = expandedCluster === cluster.id ? null : cluster.id)}
					>
						<span class="cluster-count">{cluster.nodeIds.length}</span>
						<div class="cluster-info">
							<span class="cluster-title">{cluster.title}</span>
							<span class="cluster-summary">{cluster.summary}</span>
						</div>
						<span class="expand-icon">{expandedCluster === cluster.id ? '▾' : '▸'}</span>
					</button>

					{#if expandedCluster === cluster.id}
						<div class="cluster-detail">
							<!-- Notes in cluster -->
							{#each cluster.nodeIds as nodeId}
								{@const node = nodes.find((n) => n.id === nodeId)}
								{#if node}
									{@const cfg = getNodeTypeConfig(node.type)}
									<div class="cluster-node">
										<span class="node-dot" style:background-color={cfg.badge}></span>
										<span class="node-title">{node.title}</span>
										<span class="node-type">{node.type}</span>
									</div>
								{/if}
							{/each}

							{#if cluster.contradictions.length > 0}
								<div class="alert contradiction">
									<span class="alert-icon">⚠</span>
									<div>
										<strong>Contradictions detected:</strong>
										{#each cluster.contradictions as c}
											<p>"{c.a}" vs "{c.b}"</p>
										{/each}
									</div>
								</div>
							{/if}

							{#if cluster.duplicates.length > 0}
								<div class="alert duplicate">
									<span class="alert-icon">◎</span>
									<div>
										<strong>Potential duplicates:</strong>
										{#each cluster.duplicates as d}
											<p>"{d.a}" ≈ "{d.b}"</p>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.cluster-panel {
		position: fixed;
		right: 0;
		top: 0;
		z-index: 50;
		height: 100%;
		width: 320px;
		display: flex;
		flex-direction: column;
		background: #111;
		border-left: 1px solid #262626;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #262626;
	}

	.panel-header h2 {
		font-size: 13px;
		font-weight: 600;
		color: #d4d4d4;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: #525252;
		padding: 4px;
		border-radius: 4px;
	}

	.close-btn:hover {
		color: #a3a3a3;
		background: #1a1a1a;
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.empty {
		color: #404040;
		font-size: 12px;
		text-align: center;
		padding: 32px 16px;
	}

	.cluster-card {
		background: #1a1a1a;
		border: 1px solid #262626;
		border-radius: 8px;
		margin-bottom: 8px;
		overflow: hidden;
	}

	.cluster-header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.cluster-header:hover {
		background: #222;
	}

	.cluster-count {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #262626;
		color: #a3a3a3;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.cluster-info {
		flex: 1;
		min-width: 0;
	}

	.cluster-title {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: #d4d4d4;
	}

	.cluster-summary {
		display: block;
		font-size: 10px;
		color: #525252;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.expand-icon {
		color: #525252;
		font-size: 10px;
		flex-shrink: 0;
	}

	.cluster-detail {
		padding: 0 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.cluster-node {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
	}

	.node-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.node-title {
		font-size: 11px;
		color: #a3a3a3;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-type {
		font-size: 9px;
		color: #525252;
		text-transform: uppercase;
	}

	.alert {
		display: flex;
		gap: 8px;
		padding: 8px;
		border-radius: 6px;
		margin-top: 8px;
		font-size: 11px;
	}

	.alert strong {
		display: block;
		margin-bottom: 2px;
	}

	.alert p {
		margin: 2px 0;
	}

	.alert-icon {
		flex-shrink: 0;
		font-size: 14px;
	}

	.contradiction {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.duplicate {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.2);
		color: #fcd34d;
	}
</style>
