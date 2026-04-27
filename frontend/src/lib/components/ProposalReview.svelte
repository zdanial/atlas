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
		getAllEdges
	} from '$lib/stores/nodes.svelte';
	import { pushOperation } from '$lib/stores/history.svelte';
	import { updateSectionContent } from '$lib/stores/globalContext.svelte';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		proposals: Proposal[];
		contextNodeId?: string;
		onApply?: (operations: Operation[]) => void;
	}

	let { proposals, contextNodeId, onApply }: Props = $props();

	let accepted = $state<Set<number>>(new Set(proposals.map((_, i) => i)));
	let status = $state<'pending' | 'applied' | 'dismissed'>('pending');
	let error = $state('');
	let applying = $state(false);

	// --- Helpers ---

	function opBadge(op: ProposalOp): { label: string; color: string } {
		switch (op.type) {
			case 'create_node':
				return { label: '+', color: '#22c55e' };
			case 'fork_node':
				return { label: '\u2442', color: '#06b6d4' };
			case 'create_edge':
				return { label: '\u27f6', color: '#22c55e' };
			case 'update_node':
				return { label: '\u270e', color: '#3b82f6' };
			case 'update_context':
				return { label: '\u2699', color: '#a78bfa' };
			case 'delete_node':
			case 'delete_edge':
				return { label: '\u2715', color: '#ef4444' };
		}
	}

	function opLabel(op: ProposalOp): string {
		switch (op.type) {
			case 'create_node': {
				const cfg = getNodeTypeConfig(op.data.nodeType);
				return cfg?.label ?? op.data.nodeType;
			}
			case 'fork_node': {
				const parent = getNode(op.parentId);
				return parent ? `fork from "${parent.title}"` : `fork from ${op.parentId.slice(0, 8)}`;
			}
			case 'update_node': {
				const n = getNode(op.nodeId);
				return n ? n.title : op.nodeId.slice(0, 8);
			}
			case 'delete_node': {
				const n = getNode(op.nodeId);
				return n ? n.title : op.nodeId.slice(0, 8);
			}
			case 'create_edge':
				return op.data.relationType;
			case 'delete_edge':
				return `edge ${op.edgeId.slice(0, 8)}`;
			case 'update_context':
				return op.section;
		}
	}

	function getDepth(op: ProposalOp): number {
		if (op.type !== 'create_node') return 0;
		const layerMap: Record<string, number> = {
			feature: 0,
			epic: 1,
			phase: 2,
			ticket: 3,
			task: 3
		};
		return layerMap[op.data.nodeType] ?? 0;
	}

	function toggleItem(idx: number) {
		if (status !== 'pending') return;
		const next = new Set(accepted);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		accepted = next;
	}

	function dismiss() {
		status = 'dismissed';
	}

	// --- Apply ---

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

			const sortedIndices = Array.from(accepted).sort((a, b) => a - b);

			const contextNode = contextNodeId ? getNode(contextNodeId) : null;
			const baseX = contextNode?.positionX ?? 200;
			const baseY = contextNode?.positionY ?? 200;
			let createCount = 0;

			const totalCreates = sortedIndices.filter(
				(i) => proposals[i].op.type === 'create_node'
			).length;

			for (const idx of sortedIndices) {
				const op = proposals[idx].op;
				switch (op.type) {
					case 'create_node': {
						const data = { ...op.data } as Record<string, unknown>;
						if (data.parentId) {
							data.parentId = remapId(data.parentId as string, idMap);
						}
						// Map nodeType → type for createNode
						data.type = data.nodeType;
						delete data.nodeType;

						// Remove non-schema fields LLM might have added
						delete data._tempId;
						delete data.id;

						// Wrap plain string body into TipTap doc format
						if (typeof data.body === 'string') {
							data.body = {
								type: 'doc',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: data.body }]
									}
								]
							};
						}

						// Auto-position
						if (data.positionX == null || data.positionY == null) {
							const spacing = 280;
							const totalWidth = (totalCreates - 1) * spacing;
							const startX = baseX - totalWidth / 2;
							data.positionX = startX + createCount * spacing;
							data.positionY = baseY + 250;
						}

						const created = await createNode(data as unknown as Parameters<typeof createNode>[0]);
						ops.push({ type: 'create_node', node: created });

						// Auto-link to context node if no parent
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

						// Track temp ID mappings
						const rawData = op.data as unknown as Record<string, unknown>;
						if (rawData._tempId && typeof rawData._tempId === 'string') {
							idMap.set(rawData._tempId, created.id);
						}
						if (rawData.id && typeof rawData.id === 'string') {
							idMap.set(rawData.id, created.id);
						}
						break;
					}
					case 'update_node': {
						const nodeId = remapId(op.nodeId, idMap);
						const existing = getNode(nodeId);
						if (!existing) {
							console.warn(`Node ${nodeId} not found, skipping update`);
							continue;
						}
						// Convert string body to TipTap doc format
						const changes: Record<string, unknown> = { ...op.changes };
						if (typeof changes.body === 'string') {
							changes.body = {
								type: 'doc',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: changes.body }]
									}
								]
							};
						}
						const before: Partial<Node> = {};
						const existingRec = existing as unknown as Record<string, unknown>;
						for (const key of Object.keys(changes)) {
							(before as unknown as Record<string, unknown>)[key] = existingRec[key];
						}
						await updateNode(nodeId, changes as UpdateNodeInput);
						ops.push({
							type: 'update_node',
							id: nodeId,
							before,
							after: changes as Partial<Node>
						});
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
					case 'fork_node': {
						const parentId = remapId(op.parentId, idMap);
						const parentNode = getNode(parentId);
						const data = { ...op.newNode } as Record<string, unknown>;
						data.type = data.nodeType;
						delete data.nodeType;
						data.projectId = parentNode?.projectId;

						if (typeof data.body === 'string') {
							data.body = {
								type: 'doc',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: data.body }] }]
							};
						}

						// Position below parent
						data.positionX = (parentNode?.positionX ?? 200) + 250;
						data.positionY = (parentNode?.positionY ?? 200) + 150;

						const created = await createNode(data as unknown as Parameters<typeof createNode>[0]);
						ops.push({ type: 'create_node', node: created });

						// Create edge from parent to new node
						const edge = await createEdge({
							sourceId: parentId,
							targetId: created.id,
							relationType: 'supports',
							source: 'ai'
						});
						ops.push({ type: 'create_edge', edge });
						break;
					}
					case 'create_edge': {
						const data = {
							...op.data,
							sourceId: remapId(op.data.sourceId, idMap),
							targetId: remapId(op.data.targetId, idMap)
						};
						const edge = await createEdge(data);
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
			onApply?.(ops);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('Failed to apply proposals:', e);
			error = msg;
		} finally {
			applying = false;
		}
	}
</script>

<div
	class="proposal-block"
	class:applied={status === 'applied'}
	class:dismissed={status === 'dismissed'}
>
	<div class="proposal-tree">
		{#each proposals as proposal, idx}
			{@const badge = opBadge(proposal.op)}
			{@const depth = getDepth(proposal.op)}
			<label
				class="tree-item"
				class:unchecked={!accepted.has(idx)}
				style:padding-left="{depth * 16 + 4}px"
			>
				<input
					type="checkbox"
					checked={accepted.has(idx)}
					disabled={status !== 'pending'}
					onchange={() => toggleItem(idx)}
				/>
				<span class="op-badge" style:color={badge.color}>{badge.label}</span>
				{#if proposal.op.type === 'create_node'}
					{@const cfg = getNodeTypeConfig(proposal.op.data.nodeType)}
					<span class="type-badge" style:background={cfg.badge}>{cfg.label}</span>
					<span class="item-title">{proposal.op.data.title}</span>
				{:else if proposal.op.type === 'fork_node'}
					{@const cfg = getNodeTypeConfig(proposal.op.newNode.nodeType)}
					<span class="type-badge" style:background={cfg.badge}>{cfg.label}</span>
					<span class="item-title">{proposal.op.newNode.title}</span>
				{:else}
					<span class="item-title">{proposal.summary}</span>
				{/if}
				<span class="item-context">{opLabel(proposal.op)}</span>
			</label>
		{/each}
	</div>

	{#if error}
		<div class="apply-error">{error}</div>
	{/if}

	<div class="proposal-actions">
		{#if status === 'pending'}
			<button
				class="apply-btn"
				disabled={accepted.size === 0 || applying}
				onclick={() => handleApply()}
			>
				{applying ? 'Applying...' : `Accept ${accepted.size} item${accepted.size !== 1 ? 's' : ''}`}
			</button>
			<button class="dismiss-btn" onclick={() => dismiss()}>Dismiss</button>
		{:else if status === 'applied'}
			<span class="status-label applied">Changes applied</span>
		{:else}
			<span class="status-label dismissed">Dismissed</span>
		{/if}
	</div>
</div>

<style>
	.proposal-block {
		margin-top: 8px;
		border: 1px solid #262626;
		border-radius: 8px;
		padding: 10px;
		background: #111;
	}

	.proposal-block.applied {
		border-color: #1a3a2a;
		opacity: 0.7;
	}

	.proposal-block.dismissed {
		border-color: #262626;
		opacity: 0.5;
	}

	.proposal-tree {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tree-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #d4d4d4;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 4px;
		transition: background 0.1s;
	}

	.tree-item:hover {
		background: #1a1a1a;
	}

	.tree-item.unchecked {
		opacity: 0.4;
	}

	.tree-item input[type='checkbox'] {
		accent-color: #22c55e;
		cursor: pointer;
		flex-shrink: 0;
	}

	.op-badge {
		font-weight: 700;
		font-size: 13px;
		width: 14px;
		text-align: center;
		flex-shrink: 0;
	}

	.type-badge {
		font-size: 9px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	.item-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-context {
		font-size: 10px;
		color: #525252;
		flex-shrink: 0;
	}

	.apply-error {
		font-size: 11px;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 6px 10px;
		border-radius: 4px;
		margin-top: 6px;
		word-break: break-word;
	}

	.proposal-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #1a1a1a;
	}

	.apply-btn {
		padding: 4px 12px;
		background: #1a3a2a;
		border: 1px solid #22c55e40;
		border-radius: 6px;
		color: #22c55e;
		font-size: 11px;
		cursor: pointer;
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
		padding: 4px 8px;
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
