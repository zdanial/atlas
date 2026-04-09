<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { traceLineage, type LineageEntry } from '$lib/docs-lineage';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { setActiveZone } from '$lib/stores/zone.svelte';
	import { navigateToParent } from '$lib/stores/planningNav.svelte';

	interface Props {
		nodeId: string;
		allNodes: Node[];
		allEdges: NodeEdge[];
	}

	let { nodeId, allNodes, allEdges }: Props = $props();

	let lineage = $derived(traceLineage(nodeId, allNodes, allEdges));

	function statusIcon(status: string): string {
		if (status === 'done') return '\u2713';
		if (status === 'active') return '\u25CF';
		return '\u25CB';
	}

	function statusColor(status: string): string {
		if (status === 'done') return '#22c55e';
		if (status === 'active') return '#3b82f6';
		return '#525252';
	}

	function handleClick(entry: LineageEntry) {
		if (entry.layer === 5) {
			setActiveZone('notes');
		} else {
			setActiveZone('planning');
			// Navigate to the parent of this node so it's visible
			const node = allNodes.find((n) => n.id === entry.nodeId);
			if (node?.parentId) {
				navigateToParent(node.parentId, allNodes);
			}
		}
	}
</script>

{#if lineage.length > 0}
	<div class="trace-card">
		{#each lineage as entry, i}
			{@const config = getNodeTypeConfig(entry.nodeType)}
			<button class="trace-entry" onclick={() => handleClick(entry)}>
				{#if i > 0}
					<span class="trace-connector">
						{entry.relationship === 'refines' ? '\u2190(refines)' : '\u2514'}
					</span>
				{/if}
				<span class="trace-badge" style="background: {config.badge}">{config.label}</span>
				<span class="trace-title">{entry.title}</span>
				<span class="trace-status" style="color: {statusColor(entry.status)}"
					>{statusIcon(entry.status)}</span
				>
			</button>
		{/each}
	</div>
{/if}

<style>
	.trace-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		background: #111;
		border-radius: 6px;
		border: 1px solid #1a1a1a;
	}

	.trace-entry {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		border-radius: 4px;
		cursor: pointer;
		border: none;
		background: none;
		text-align: left;
		font-family: inherit;
	}

	.trace-entry:hover {
		background: #1a1a1a;
	}

	.trace-connector {
		font-size: 11px;
		color: #404040;
		min-width: 16px;
		padding-left: 4px;
		white-space: nowrap;
	}

	.trace-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: 3px;
		color: #fff;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.trace-title {
		font-size: 12px;
		color: #a3a3a3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.trace-status {
		font-size: 12px;
		flex-shrink: 0;
	}
</style>
