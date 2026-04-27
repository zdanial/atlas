<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { extractBodyText } from '$lib/node-types';

	interface Props {
		rootId: string;
		nodes: Node[];
		edges: NodeEdge[];
		onClose: () => void;
		onOpenNode: (id: string) => void;
	}

	let { rootId, nodes, edges, onClose, onOpenNode }: Props = $props();

	// Build child map: sourceId → targetIds
	let childMap: Map<string, string[]> = $derived.by(() => {
		const map = new Map<string, string[]>();
		for (const edge of edges) {
			const ch = map.get(edge.sourceId) ?? [];
			ch.push(edge.targetId);
			map.set(edge.sourceId, ch);
		}
		return map;
	});

	let nodeMap = $derived(new Map(nodes.map((n) => [n.id, n])));

	// Walk the thread: follow the longest path (or selected fork path)
	let selectedForks = $state<Map<string, string>>(new Map());

	let threadChain: Node[] = $derived.by(() => {
		const chain: Node[] = [];
		let currentId: string | null = rootId;

		const visited = new Set<string>();
		while (currentId && !visited.has(currentId)) {
			visited.add(currentId);
			const nd = nodeMap.get(currentId);
			if (!nd) break;
			chain.push(nd);

			const ch: string[] = childMap.get(currentId) ?? [];
			if (ch.length === 0) break;

			// Use selected fork or pick the first child
			const selected = selectedForks.get(currentId);
			if (selected && ch.includes(selected)) {
				currentId = selected;
			} else {
				currentId = ch[0];
			}
		}

		return chain;
	});

	// Detect fork points
	function getForkChildren(nodeId: string): string[] {
		return childMap.get(nodeId) ?? [];
	}

	function selectFork(parentId: string, childId: string) {
		const next = new Map(selectedForks);
		next.set(parentId, childId);
		selectedForks = next;
	}
</script>

<div class="thread-view">
	<div class="thread-header">
		<button class="back-btn" onclick={onClose}> &larr; Back to canvas </button>
		<span class="thread-label">Thread ({threadChain.length} nodes)</span>
	</div>

	<div class="thread-list">
		{#each threadChain as node, idx (node.id)}
			{@const colors = getNodeTypeConfig(node.type)}
			{@const bodyText = extractBodyText(node.body, 500)}
			{@const forkChildren = getForkChildren(node.id)}

			<div class="thread-node">
				<div class="thread-connector">
					{#if idx > 0}
						<div class="connector-line"></div>
					{/if}
					<div class="connector-dot" style:background={colors.badge}></div>
				</div>

				<button class="thread-card" onclick={() => onOpenNode(node.id)}>
					<div class="card-header">
						<span class="type-badge" style:background={colors.badge}>{node.type}</span>
						<span class="card-title">{node.title}</span>
						<span
							class="card-status"
							class:active={node.status === 'active'}
							class:done={node.status === 'done'}
						>
							{node.status}
						</span>
					</div>
					{#if bodyText}
						<div class="card-body">{bodyText}</div>
					{/if}
				</button>

				{#if forkChildren.length > 1}
					<div class="fork-indicator">
						<span class="fork-label">Fork ({forkChildren.length} branches)</span>
						<div class="fork-options">
							{#each forkChildren as childId}
								{@const childNode = nodeMap.get(childId)}
								{#if childNode}
									<button
										class="fork-btn"
										class:active={selectedForks.get(node.id) === childId ||
											(!selectedForks.has(node.id) && forkChildren[0] === childId)}
										onclick={() => selectFork(node.id, childId)}
									>
										{childNode.title}
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.thread-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0a0a0a;
	}

	.thread-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.back-btn {
		background: none;
		border: 1px solid #333;
		border-radius: 4px;
		color: #a3a3a3;
		font-size: 11px;
		padding: 4px 10px;
		cursor: pointer;
	}

	.back-btn:hover {
		color: #e5e5e5;
		border-color: #525252;
	}

	.thread-label {
		font-size: 11px;
		color: #525252;
	}

	.thread-list {
		flex: 1;
		overflow-y: auto;
		padding: 16px 24px;
	}

	.thread-node {
		position: relative;
		padding-left: 32px;
		margin-bottom: 4px;
	}

	.thread-connector {
		position: absolute;
		left: 8px;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.connector-line {
		width: 2px;
		height: 12px;
		background: #262626;
	}

	.connector-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.thread-card {
		width: 100%;
		text-align: left;
		background: #111;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		padding: 12px 14px;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.thread-card:hover {
		border-color: #333;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.type-badge {
		font-size: 9px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.card-title {
		flex: 1;
		font-size: 13px;
		font-weight: 600;
		color: #e5e5e5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-status {
		font-size: 10px;
		color: #525252;
		text-transform: capitalize;
	}

	.card-status.active {
		color: #22c55e;
	}

	.card-status.done {
		color: #6366f1;
	}

	.card-body {
		font-size: 12px;
		color: #737373;
		line-height: 1.5;
		max-height: 80px;
		overflow: hidden;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.fork-indicator {
		margin: 6px 0 8px;
		padding: 6px 10px;
		background: #0d0d0d;
		border: 1px dashed #262626;
		border-radius: 6px;
	}

	.fork-label {
		font-size: 10px;
		color: #525252;
		margin-bottom: 4px;
		display: block;
	}

	.fork-options {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.fork-btn {
		font-size: 10px;
		padding: 2px 8px;
		border: 1px solid #262626;
		border-radius: 4px;
		background: transparent;
		color: #737373;
		cursor: pointer;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fork-btn:hover {
		color: #a3a3a3;
		border-color: #333;
	}

	.fork-btn.active {
		background: #1a1a1a;
		color: #e5e5e5;
		border-color: #525252;
	}
</style>
