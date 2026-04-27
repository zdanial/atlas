<script lang="ts">
	import type { Proposal, ProposalOp } from '$lib/proposals';
	import type { Node } from '$lib/storage/adapter';
	import type { Operation } from '$lib/stores/history.svelte';
	import type { UpdateNodeInput } from '$lib/schemas/node';
	import {
		createNode,
		updateNode,
		deleteNode,
		createEdge,
		deleteEdge,
		getNode,
		getProjectNodes,
		getAllEdges
	} from '$lib/stores/nodes.svelte';
	import { pushOperation } from '$lib/stores/history.svelte';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { updateSectionContent } from '$lib/stores/globalContext.svelte';

	interface Props {
		proposals: Proposal[];
		contextNodeId?: string;
		onApplied?: (operations: Operation[]) => void;
		onDismiss?: () => void;
	}

	let { proposals, contextNodeId, onApplied, onDismiss }: Props = $props();

	// --- Enriched tree: existing plan + proposed additions ---

	interface EnrichedNode {
		id: string;
		title: string;
		type: string;
		layer: number;
		status: string;
		isProposal: boolean;
		proposalIdx?: number;
		parentId: string | null;
		children: EnrichedNode[];
	}

	// Which proposals are accepted
	let accepted = $state<Set<number>>(initAccepted());
	let status = $state<'pending' | 'applied' | 'dismissed'>('pending');
	let applying = $state(false);
	let error = $state('');

	// Editing overrides
	let titleOverrides = $state<Map<number, string>>(new Map());
	let typeOverrides = $state<Map<number, string>>(new Map());
	let editingIdx = $state<number | null>(null);
	let editTitle = $state('');
	let editType = $state('');

	function initAccepted(): Set<number> {
		const keys = new Set<number>();
		for (let i = 0; i < proposals.length; i++) {
			keys.add(i);
		}
		return keys;
	}

	// Non-tree proposals (update_context, delete_node, create_edge, etc.)
	let nonTreeProposals = $derived.by(() => {
		return proposals
			.map((p, i) => ({ proposal: p, idx: i }))
			.filter(({ proposal }) => {
				const t = proposal.op.type;
				return t !== 'create_node' && t !== 'update_node';
			});
	});

	// Build enriched tree for create_node proposals
	let enrichedTree = $derived.by(() => {
		const allNodes = getProjectNodes();
		const planningNodes = allNodes.filter((n) =>
			['feature', 'goal', 'initiative', 'intent', 'epic', 'phase', 'ticket'].includes(n.type)
		);

		const nodeMap = new Map<string, EnrichedNode>();
		for (const n of planningNodes) {
			nodeMap.set(n.id, {
				id: n.id,
				title: n.title,
				type: n.type,
				layer: n.layer,
				status: n.status,
				isProposal: false,
				parentId: n.parentId ?? null,
				children: []
			});
		}

		const layerMap: Record<string, number> = {
			feature: 4,
			goal: 4,
			initiative: 4,
			intent: 4,
			epic: 3,
			phase: 2,
			ticket: 1
		};

		for (let i = 0; i < proposals.length; i++) {
			const p = proposals[i];
			if (p.op.type !== 'create_node') continue;

			const data = p.op.data;
			const effectiveType = typeOverrides.get(i) ?? data.nodeType;
			const key = `p_${i}`;
			nodeMap.set(key, {
				id: key,
				title: titleOverrides.get(i) ?? data.title,
				type: effectiveType,
				layer: layerMap[effectiveType] ?? 5,
				status: data.status ?? 'draft',
				isProposal: true,
				proposalIdx: i,
				parentId: data.parentId ?? null,
				children: []
			});
		}

		// Build tree
		const roots: EnrichedNode[] = [];
		for (const node of nodeMap.values()) {
			if (node.parentId && nodeMap.has(node.parentId)) {
				nodeMap.get(node.parentId)!.children.push(node);
			} else {
				roots.push(node);
			}
		}

		const sortNodes = (nodes: EnrichedNode[]) => {
			nodes.sort((a, b) => {
				if (a.isProposal !== b.isProposal) return a.isProposal ? 1 : -1;
				return b.layer - a.layer;
			});
			for (const n of nodes) sortNodes(n.children);
		};
		sortNodes(roots);

		return roots;
	});

	// Flatten tree for display
	let visibleTree = $derived.by(() => {
		interface FlatItem {
			node: EnrichedNode;
			depth: number;
		}

		function hasProposalDescendant(node: EnrichedNode): boolean {
			if (node.isProposal) return true;
			return node.children.some(hasProposalDescendant);
		}

		const flat: FlatItem[] = [];
		function walk(nodes: EnrichedNode[], depth: number) {
			for (const node of nodes) {
				if (!hasProposalDescendant(node) && !node.isProposal) continue;
				flat.push({ node, depth });
				walk(node.children, depth + 1);
			}
		}
		walk(enrichedTree, 0);
		return flat;
	});

	let acceptedCount = $derived(accepted.size);

	function toggleItem(idx: number) {
		if (status !== 'pending') return;
		const next = new Set(accepted);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		accepted = next;
	}

	function startEdit(node: EnrichedNode) {
		if (node.proposalIdx == null) return;
		editingIdx = node.proposalIdx;
		editTitle = node.title;
		editType = node.type;
	}

	function saveEdit() {
		if (editingIdx == null) return;
		titleOverrides = new Map(titleOverrides).set(editingIdx, editTitle);
		typeOverrides = new Map(typeOverrides).set(editingIdx, editType);
		editingIdx = null;
	}

	function cancelEdit() {
		editingIdx = null;
	}

	function opLabel(op: ProposalOp): string {
		switch (op.type) {
			case 'create_node':
				return `Create ${op.data.nodeType}`;
			case 'fork_node':
				return `Fork: ${op.newNode.title}`;
			case 'update_node':
				return 'Update node';
			case 'delete_node':
				return 'Delete node';
			case 'create_edge':
				return `Link: ${op.data.relationType}`;
			case 'delete_edge':
				return 'Remove link';
			case 'update_context':
				return `Update context: ${op.section}`;
		}
	}

	// --- Apply logic ---

	function remapId(id: string, idMap: Map<string, string>): string {
		return idMap.get(id) ?? id;
	}

	async function handleApply() {
		if (status !== 'pending' || applying) return;
		applying = true;
		error = '';

		try {
			const ops: Operation[] = [];
			const idMap = new Map<string, string>();

			const contextNode = contextNodeId ? getNode(contextNodeId) : null;
			const baseX = contextNode?.positionX ?? 200;
			const baseY = contextNode?.positionY ?? 200;
			let createCount = 0;

			const acceptedProposals = proposals
				.map((p, i) => ({ proposal: p, idx: i }))
				.filter(({ idx }) => accepted.has(idx));

			const totalCreates = acceptedProposals.filter(
				({ proposal }) => proposal.op.type === 'create_node'
			).length;

			for (const { proposal, idx } of acceptedProposals) {
				const op = proposal.op;

				switch (op.type) {
					case 'create_node': {
						const data = op.data;
						const effectiveTitle = titleOverrides.get(idx) ?? data.title;
						const effectiveType = typeOverrides.get(idx) ?? data.nodeType;

						const layerMap: Record<string, number> = {
							feature: 4,
							goal: 4,
							initiative: 4,
							intent: 4,
							epic: 3,
							phase: 2,
							ticket: 1
						};

						const createData: Record<string, unknown> = {
							type: effectiveType,
							layer: layerMap[effectiveType] ?? 5,
							projectId: contextNode?.projectId ?? data.parentId,
							title: effectiveTitle,
							body:
								typeof data.body === 'string'
									? {
											type: 'doc',
											content: [
												{
													type: 'paragraph',
													content: [{ type: 'text', text: data.body }]
												}
											]
										}
									: data.body,
							status: data.status ?? 'draft',
							payload: data.payload ?? null,
							parentId: data.parentId ? remapId(data.parentId, idMap) : null
						};

						// Auto-position
						if (!createData.positionX || !createData.positionY) {
							const spacing = 280;
							const totalWidth = (totalCreates - 1) * spacing;
							const startX = baseX - totalWidth / 2;
							createData.positionX = startX + createCount * spacing;
							createData.positionY = baseY + 250;
						}

						const created = await createNode(
							createData as unknown as Parameters<typeof createNode>[0]
						);
						ops.push({ type: 'create_node', node: created });

						if (contextNodeId && !data.parentId) {
							const edge = await createEdge({
								sourceId: contextNodeId,
								targetId: created.id,
								relationType: 'supports',
								source: 'ai'
							});
							ops.push({ type: 'create_edge', edge });
						}

						createCount++;
						idMap.set(`p_${idx}`, created.id);
						break;
					}
					case 'update_node': {
						const nodeId = remapId(op.nodeId, idMap);
						const existing = getNode(nodeId);
						if (!existing) continue;

						const patch: Partial<Node> = {};
						const changes = op.changes;
						if (changes.title) patch.title = changes.title;
						if (changes.type) patch.type = changes.type;
						if (changes.status) patch.status = changes.status;
						if (changes.parentId) patch.parentId = remapId(changes.parentId, idMap);
						if (changes.body) {
							patch.body = {
								type: 'doc',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: changes.body }]
									}
								]
							};
						}
						if (changes.payload) {
							patch.payload = { ...(existing.payload ?? {}), ...changes.payload };
						}

						const before: Partial<Node> = {};
						for (const key of Object.keys(patch)) {
							(before as Record<string, unknown>)[key] = (
								existing as unknown as Record<string, unknown>
							)[key];
						}
						await updateNode(nodeId, patch as UpdateNodeInput);
						ops.push({ type: 'update_node', id: nodeId, before, after: patch });
						break;
					}
					case 'delete_node': {
						const nodeId = remapId(op.nodeId, idMap);
						const existing = getNode(nodeId);
						if (!existing) continue;
						await deleteNode(nodeId);
						ops.push({ type: 'delete_node', node: existing });
						break;
					}
					case 'create_edge': {
						const edge = await createEdge({
							sourceId: remapId(op.data.sourceId, idMap),
							targetId: remapId(op.data.targetId, idMap),
							relationType: op.data.relationType,
							source: 'ai'
						});
						ops.push({ type: 'create_edge', edge });
						break;
					}
					case 'delete_edge': {
						const edges = getAllEdges();
						const edge = edges.find((e) => e.id === op.edgeId);
						if (!edge) continue;
						await deleteEdge(op.edgeId);
						ops.push({ type: 'delete_edge', edge });
						break;
					}
					case 'update_context': {
						updateSectionContent(op.section, op.content);
						break;
					}
				}
			}

			if (ops.length > 0) {
				pushOperation({ type: 'batch', operations: ops });
			}

			status = 'applied';
			onApplied?.(ops);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			console.error('Failed to apply proposals:', e);
		} finally {
			applying = false;
		}
	}

	function handleDismiss() {
		status = 'dismissed';
		onDismiss?.();
	}
</script>

<div
	class="proposal-panel"
	class:applied={status === 'applied'}
	class:dismissed={status === 'dismissed'}
>
	<div class="panel-header">
		<span class="panel-title">Proposed Changes</span>
		<span class="panel-count">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''}</span>
	</div>

	<!-- Tree view for create_node proposals -->
	{#if visibleTree.length > 0}
		<div class="tree-view">
			{#each visibleTree as { node, depth }}
				{@const isEditing = editingIdx === node.proposalIdx}
				{@const cfg = getNodeTypeConfig(node.type)}

				<div
					class="tree-row"
					class:proposal={node.isProposal}
					class:existing={!node.isProposal}
					class:unchecked={node.isProposal &&
						node.proposalIdx != null &&
						!accepted.has(node.proposalIdx)}
					style:padding-left="{depth * 20 + 8}px"
				>
					{#if node.isProposal && node.proposalIdx != null && status === 'pending'}
						<input
							type="checkbox"
							class="item-check"
							checked={accepted.has(node.proposalIdx)}
							onchange={() => toggleItem(node.proposalIdx!)}
						/>
						<span class="add-indicator">+</span>
					{:else if !node.isProposal}
						<span class="existing-dot">·</span>
					{/if}

					<span class="row-type-badge" style:background={cfg.badge}>{cfg.label}</span>

					{#if isEditing}
						<input
							class="edit-title-input"
							bind:value={editTitle}
							onkeydown={(e) => {
								if (e.key === 'Enter') saveEdit();
								if (e.key === 'Escape') cancelEdit();
							}}
						/>
						<select class="edit-type-select" bind:value={editType}>
							{#each ['feature', 'epic', 'phase', 'ticket', 'note', 'question', 'risk', 'decision'] as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
						<button class="edit-save" onclick={saveEdit}>✓</button>
						<button class="edit-cancel" onclick={cancelEdit}>✕</button>
					{:else}
						<span class="row-title" class:proposal-title={node.isProposal}>
							{node.title}
						</span>
						{#if !node.isProposal}
							<span class="row-status">{node.status}</span>
						{/if}
						{#if node.isProposal && status === 'pending'}
							<button class="edit-btn" onclick={() => startEdit(node)} title="Edit">✎</button>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Non-tree proposals (update_context, create_edge, etc.) -->
	{#if nonTreeProposals.length > 0}
		<div class="other-proposals">
			{#each nonTreeProposals as { proposal, idx }}
				<div class="other-row" class:unchecked={!accepted.has(idx)}>
					{#if status === 'pending'}
						<input
							type="checkbox"
							class="item-check"
							checked={accepted.has(idx)}
							onchange={() => toggleItem(idx)}
						/>
					{/if}
					<span class="op-badge">{opLabel(proposal.op)}</span>
					<span class="op-summary">{proposal.summary}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if visibleTree.length === 0 && nonTreeProposals.length === 0}
		<div class="empty-tree">No changes proposed</div>
	{/if}

	{#if error}
		<div class="apply-error">{error}</div>
	{/if}

	<div class="panel-actions">
		{#if status === 'pending'}
			<button class="apply-btn" disabled={acceptedCount === 0 || applying} onclick={handleApply}>
				{applying ? 'Applying...' : `Accept ${acceptedCount} item${acceptedCount !== 1 ? 's' : ''}`}
			</button>
			<button class="dismiss-btn" onclick={handleDismiss}>Dismiss</button>
		{:else if status === 'applied'}
			<span class="status-label applied">Changes applied</span>
		{:else}
			<span class="status-label dismissed">Dismissed</span>
		{/if}
	</div>
</div>

<style>
	.proposal-panel {
		border: 1px solid #1a3a2a;
		border-radius: 8px;
		background: #0d1a0d;
		overflow: hidden;
	}

	.proposal-panel.applied {
		opacity: 0.7;
		border-color: #1a3a2a;
	}

	.proposal-panel.dismissed {
		opacity: 0.5;
		border-color: #262626;
		background: #111;
	}

	.panel-header {
		padding: 10px 12px;
		border-bottom: 1px solid #1a2a1a;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.panel-title {
		font-size: 11px;
		font-weight: 600;
		color: #4ade80;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.panel-count {
		font-size: 10px;
		color: #525252;
	}

	.tree-view {
		max-height: 300px;
		overflow-y: auto;
		padding: 6px 0;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		font-size: 12px;
		min-height: 28px;
	}

	.tree-row.existing {
		color: #525252;
	}

	.tree-row.proposal {
		color: #d4d4d4;
	}

	.tree-row.unchecked {
		opacity: 0.4;
	}

	.item-check {
		accent-color: #22c55e;
		cursor: pointer;
		flex-shrink: 0;
	}

	.add-indicator {
		color: #22c55e;
		font-weight: 700;
		font-size: 14px;
		flex-shrink: 0;
		width: 12px;
		text-align: center;
	}

	.existing-dot {
		color: #333;
		font-size: 16px;
		flex-shrink: 0;
		width: 12px;
		text-align: center;
	}

	.row-type-badge {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 4px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	.row-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.proposal-title {
		color: #e5e5e5;
	}

	.row-status {
		font-size: 10px;
		color: #404040;
		flex-shrink: 0;
	}

	.edit-btn {
		background: none;
		border: none;
		color: #525252;
		cursor: pointer;
		font-size: 12px;
		padding: 2px 4px;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.tree-row:hover .edit-btn {
		opacity: 1;
	}

	.edit-btn:hover {
		color: #a3a3a3;
	}

	.edit-title-input {
		flex: 1;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 3px;
		color: #e5e5e5;
		font-size: 12px;
		padding: 2px 6px;
		outline: none;
	}

	.edit-title-input:focus {
		border-color: #22c55e;
	}

	.edit-type-select {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 3px;
		color: #a3a3a3;
		font-size: 10px;
		padding: 2px 4px;
		outline: none;
	}

	.edit-save {
		background: none;
		border: none;
		color: #22c55e;
		cursor: pointer;
		font-size: 14px;
		padding: 2px;
	}

	.edit-cancel {
		background: none;
		border: none;
		color: #ef4444;
		cursor: pointer;
		font-size: 14px;
		padding: 2px;
	}

	.other-proposals {
		border-top: 1px solid #1a2a1a;
		padding: 6px 0;
	}

	.other-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px;
		font-size: 12px;
		min-height: 28px;
	}

	.other-row.unchecked {
		opacity: 0.4;
	}

	.op-badge {
		font-size: 9px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 3px;
		background: #2563eb;
		color: #fff;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	.op-summary {
		flex: 1;
		color: #d4d4d4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-tree {
		padding: 16px;
		text-align: center;
		font-size: 12px;
		color: #404040;
	}

	.apply-error {
		font-size: 11px;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 6px 10px;
		margin: 0 12px;
		border-radius: 4px;
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-top: 1px solid #1a2a1a;
	}

	.apply-btn {
		padding: 5px 14px;
		background: #1a3a2a;
		border: 1px solid #22c55e40;
		border-radius: 6px;
		color: #22c55e;
		font-size: 11px;
		cursor: pointer;
		font-weight: 500;
		transition: all 0.15s;
	}

	.apply-btn:hover:not(:disabled) {
		background: #1a4a2a;
	}

	.apply-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.dismiss-btn {
		padding: 5px 10px;
		background: transparent;
		border: none;
		color: #525252;
		font-size: 11px;
		cursor: pointer;
	}

	.dismiss-btn:hover {
		color: #737373;
	}

	.status-label {
		font-size: 11px;
	}

	.status-label.applied {
		color: #22c55e;
	}

	.status-label.dismissed {
		color: #525252;
	}
</style>
