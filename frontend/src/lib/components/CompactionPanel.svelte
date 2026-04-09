<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText } from '$lib/node-types';
	import { compact } from '$lib/agents/compactor';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';

	interface Props {
		nodes: Node[];
		edges: NodeEdge[];
		selectedIds?: Set<string>;
		onCompact: (result: {
			title: string;
			body: string;
			tags: string[];
			sourceNodeIds: string[];
			archiveSources: boolean;
		}) => void;
		onClose: () => void;
	}

	let { nodes, edges, selectedIds, onCompact, onClose }: Props = $props();

	let compacting = $state(false);
	let compactError = $state('');
	let preview = $state<{ title: string; body: string; tags: string[] } | null>(null);
	let archiveSources = $state(false);
	let manualSelection = $state<Set<string>>(new Set(selectedIds ?? []));
	let expandedGroup = $state<string | null>(null);

	$effect(() => {
		if (selectedIds && selectedIds.size > 0) {
			manualSelection = new Set(selectedIds);
		}
	});

	interface SuggestedGroup {
		id: string;
		title: string;
		nodeIds: string[];
	}

	// Detect suggested groups using connected components + type similarity
	let suggestedGroups = $derived<SuggestedGroup[]>(detectGroups(nodes, edges));

	function detectGroups(nodes: Node[], edges: NodeEdge[]): SuggestedGroup[] {
		if (nodes.length < 3) return [];

		const adj = new Map<string, Set<string>>();
		for (const node of nodes) adj.set(node.id, new Set());
		for (const edge of edges) {
			adj.get(edge.sourceId)?.add(edge.targetId);
			adj.get(edge.targetId)?.add(edge.sourceId);
		}

		const visited = new Set<string>();
		const groups: SuggestedGroup[] = [];

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
				const groupNodes = component.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
				groups.push({
					id: `group_${groups.length}`,
					title: `${groupNodes.length} connected notes`,
					nodeIds: component
				});
			}
		}

		return groups;
	}

	function toggleNode(id: string) {
		const next = new Set(manualSelection);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		manualSelection = next;
	}

	function selectGroup(group: SuggestedGroup) {
		manualSelection = new Set(group.nodeIds);
	}

	async function handleCompact() {
		if (manualSelection.size < 2 || compacting) return;
		compacting = true;
		preview = null;
		compactError = '';

		try {
			const sourceNodes = Array.from(manualSelection)
				.map((id) => nodes.find((n) => n.id === id)!)
				.filter(Boolean);

			const result = await compact(sourceNodes, getGlobalContext());
			preview = result;
		} catch (e) {
			console.error('Compaction failed:', e);
			compactError = `Compaction failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
		} finally {
			compacting = false;
		}
	}

	function handleConfirm() {
		if (!preview) return;
		onCompact({
			title: preview.title,
			body: preview.body,
			tags: preview.tags,
			sourceNodeIds: Array.from(manualSelection),
			archiveSources
		});
	}
</script>

<div class="compact-panel">
	<div class="panel-header">
		<h2>Compact Notes</h2>
		<button class="close-btn" onclick={onClose}>x</button>
	</div>

	<div class="panel-body">
		{#if preview}
			<!-- Preview mode -->
			<div class="preview-section">
				<div class="preview-label">Preview</div>
				<div class="preview-title">{preview.title}</div>
				<div class="preview-body">{preview.body}</div>
				{#if preview.tags.length > 0}
					<div class="preview-tags">
						{#each preview.tags as tag}
							<span class="preview-tag">{tag}</span>
						{/each}
					</div>
				{/if}
				<label class="archive-toggle">
					<input type="checkbox" bind:checked={archiveSources} />
					<span>Archive {manualSelection.size} source notes</span>
				</label>
				<div class="preview-actions">
					<button class="action-btn confirm" onclick={handleConfirm}>Confirm</button>
					<button
						class="action-btn cancel"
						onclick={() => {
							preview = null;
						}}>Back</button
					>
				</div>
			</div>
		{:else}
			<!-- Selection mode -->
			{#if suggestedGroups.length > 0}
				<div class="section-label">Suggested groups</div>
				{#each suggestedGroups as group (group.id)}
					<div class="group-card">
						<div class="group-header-row">
							<button
								class="group-header"
								onclick={() => (expandedGroup = expandedGroup === group.id ? null : group.id)}
							>
								<span class="group-count">{group.nodeIds.length}</span>
								<span class="group-title">{group.title}</span>
							</button>
							<button class="use-group-btn" onclick={() => selectGroup(group)}>Use</button>
						</div>
						{#if expandedGroup === group.id}
							<div class="group-nodes">
								{#each group.nodeIds as nodeId}
									{@const node = nodes.find((n) => n.id === nodeId)}
									{#if node}
										{@const cfg = getNodeTypeConfig(node.type)}
										<div class="group-node">
											<span class="node-dot" style:background={cfg.badge}></span>
											<span class="node-name">{node.title}</span>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}

			<div class="section-label">
				Select notes to compact ({manualSelection.size} selected)
			</div>
			<div class="node-list">
				{#each nodes as node (node.id)}
					{@const cfg = getNodeTypeConfig(node.type)}
					<label class="node-row">
						<input
							type="checkbox"
							checked={manualSelection.has(node.id)}
							onchange={() => toggleNode(node.id)}
						/>
						<span class="node-dot" style:background={cfg.badge}></span>
						<span class="node-name">{node.title}</span>
					</label>
				{/each}
			</div>

			{#if compactError}
				<div class="compact-error">{compactError}</div>
			{/if}

			<button
				class="compact-btn"
				disabled={manualSelection.size < 2 || compacting}
				onclick={handleCompact}
			>
				{compacting
					? 'Compacting...'
					: `Compact ${manualSelection.size} note${manualSelection.size !== 1 ? 's' : ''}`}
			</button>
		{/if}
	</div>
</div>

<style>
	.compact-panel {
		position: fixed;
		right: 0;
		top: 0;
		z-index: 5000;
		height: 100%;
		width: 340px;
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
		font-size: 14px;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.close-btn:hover {
		color: #a3a3a3;
		background: #1a1a1a;
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #525252;
		margin-top: 8px;
	}

	.group-card {
		background: #1a1a1a;
		border: 1px solid #262626;
		border-radius: 6px;
		overflow: hidden;
	}

	.group-header-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 8px;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		padding: 8px 10px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.group-header:hover {
		background: #222;
	}

	.group-count {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #262626;
		color: #a3a3a3;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.group-title {
		flex: 1;
		font-size: 11px;
		color: #a3a3a3;
	}

	.use-group-btn {
		background: none;
		border: 1px solid #333;
		color: #737373;
		font-size: 10px;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: pointer;
	}

	.use-group-btn:hover {
		color: #a3a3a3;
		border-color: #525252;
	}

	.group-nodes {
		padding: 4px 10px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.group-node,
	.node-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
	}

	.node-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.node-name {
		font-size: 11px;
		color: #a3a3a3;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 300px;
		overflow-y: auto;
	}

	.node-row {
		cursor: pointer;
		padding: 4px 4px;
		border-radius: 4px;
	}

	.node-row:hover {
		background: #1a1a1a;
	}

	.node-row input[type='checkbox'] {
		accent-color: #14b8a6;
	}

	.compact-error {
		font-size: 11px;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 6px 10px;
		border-radius: 4px;
	}

	.compact-btn {
		margin-top: 8px;
		padding: 8px 16px;
		background: #134e4a;
		border: 1px solid #14b8a6;
		color: #5eead4;
		font-size: 12px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.compact-btn:hover:not(:disabled) {
		background: #115e56;
	}

	.compact-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.preview-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.preview-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #14b8a6;
	}

	.preview-title {
		font-size: 14px;
		font-weight: 600;
		color: #e5e5e5;
	}

	.preview-body {
		font-size: 12px;
		color: #a3a3a3;
		line-height: 1.6;
		white-space: pre-wrap;
		max-height: 300px;
		overflow-y: auto;
	}

	.preview-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.preview-tag {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #333;
		color: #a3a3a3;
	}

	.archive-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #a3a3a3;
		cursor: pointer;
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 4px;
	}

	.archive-toggle input[type='checkbox'] {
		accent-color: #f97316;
	}

	.preview-actions {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		flex: 1;
		padding: 8px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
		border: 1px solid;
	}

	.action-btn.confirm {
		background: #134e4a;
		border-color: #14b8a6;
		color: #5eead4;
	}

	.action-btn.confirm:hover {
		background: #115e56;
	}

	.action-btn.cancel {
		background: transparent;
		border-color: #333;
		color: #737373;
	}

	.action-btn.cancel:hover {
		color: #a3a3a3;
		border-color: #525252;
	}
</style>
