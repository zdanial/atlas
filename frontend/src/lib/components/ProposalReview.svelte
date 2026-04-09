<script lang="ts">
	import type { Proposal, ProposalItem } from '$lib/proposals';
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
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		proposals: Proposal[];
		contextNodeId?: string;
		onApply?: (operations: Operation[]) => void;
	}

	let { proposals, contextNodeId, onApply }: Props = $props();

	interface ReviewState {
		accepted: Set<number>;
		status: 'pending' | 'applied' | 'dismissed';
		error: string;
	}

	let reviewStates = $state<ReviewState[]>(
		proposals.map((p) => ({
			accepted: new Set(p.items.map((_, i) => i)),
			status: 'pending' as const,
			error: ''
		}))
	);

	let applying = $state(false);

	// --- Tree building ---

	interface TreeNode {
		idx: number;
		item: ProposalItem;
		children: TreeNode[];
	}

	function buildTree(items: ProposalItem[]): { roots: TreeNode[]; flat: TreeNode[] } {
		const nodes: TreeNode[] = items.map((item, idx) => ({ idx, item, children: [] }));
		const roots: TreeNode[] = [];

		// For create_node items, collect their indices by any ID hint the LLM may have used
		// (parentId references within the same proposal)
		const createNodesByParentId = new Map<string, TreeNode[]>();

		// First pass: identify create_node items and group by parentId
		for (const tn of nodes) {
			if (tn.item.op === 'create_node') {
				const parentId = tn.item.data.parentId;
				if (parentId) {
					if (!createNodesByParentId.has(parentId)) {
						createNodesByParentId.set(parentId, []);
					}
					createNodesByParentId.get(parentId)!.push(tn);
				} else {
					roots.push(tn);
				}
			} else {
				roots.push(tn);
			}
		}

		// Second pass: try to attach children to create_node parents within the proposal
		// The LLM may use placeholder IDs like "temp_feature_1" — match by looking at
		// create_node items whose data might be referenced as parentId
		for (const tn of nodes) {
			if (tn.item.op !== 'create_node') continue;
			const data = tn.item.data;
			// Check if any items have this node's placeholder/data as parentId
			// Since create_nodes don't have IDs yet, the LLM might put a placeholder
			// that matches another item's parentId. We check all parentId groups.
			// For now, use a simple heuristic: if the parentId matches an existing real node,
			// it's a root-level child of that existing node. Otherwise, try to match
			// to another create_node in this proposal by checking data fields.
		}

		// Attach orphaned children (parentId references real existing nodes) as roots
		for (const [parentId, children] of createNodesByParentId) {
			// Check if parentId matches another create_node in this proposal
			// (LLM sometimes uses temp IDs or references between items)
			let attached = false;
			for (const tn of nodes) {
				if (tn.item.op === 'create_node') {
					// The LLM might reference a placeholder. Check if any create_node
					// in the proposal has a matching temp ID in its data
					const itemData = tn.item.data as unknown as Record<string, unknown>;
					if (itemData._tempId === parentId || itemData.id === parentId) {
						tn.children.push(...children);
						attached = true;
						break;
					}
				}
			}
			if (!attached) {
				// parentId references an existing node — these are top-level items
				roots.push(...children);
			}
		}

		return { roots, flat: nodes };
	}

	function getDepth(item: ProposalItem): number {
		if (item.op !== 'create_node') return 0;
		const layerMap: Record<string, number> = {
			feature: 0,
			epic: 1,
			phase: 2,
			ticket: 3,
			task: 3
		};
		return layerMap[item.data.type] ?? 0;
	}

	// --- Badge + context ---

	function opBadge(item: ProposalItem): { label: string; color: string } {
		switch (item.op) {
			case 'create_node':
				return { label: '+', color: '#22c55e' };
			case 'create_edge':
				return { label: '⟶', color: '#22c55e' };
			case 'update_node':
				return { label: '✎', color: '#3b82f6' };
			case 'delete_node':
			case 'delete_edge':
				return { label: '✕', color: '#ef4444' };
		}
	}

	function itemLabel(item: ProposalItem): string {
		switch (item.op) {
			case 'create_node': {
				const cfg = getNodeTypeConfig(item.data.type);
				return cfg?.label ?? item.data.type;
			}
			case 'update_node': {
				const n = getNode(item.nodeId);
				return n ? n.title : item.nodeId.slice(0, 8);
			}
			case 'delete_node': {
				const n = getNode(item.nodeId);
				return n ? n.title : item.nodeId.slice(0, 8);
			}
			case 'create_edge':
				return item.data.relationType;
			case 'delete_edge':
				return `edge ${item.edgeId.slice(0, 8)}`;
		}
	}

	function toggleItem(proposalIdx: number, itemIdx: number) {
		const state = reviewStates[proposalIdx];
		if (state.status !== 'pending') return;
		const next = new Set(state.accepted);
		if (next.has(itemIdx)) next.delete(itemIdx);
		else next.add(itemIdx);
		reviewStates[proposalIdx] = { ...state, accepted: next };
	}

	function dismiss(proposalIdx: number) {
		reviewStates[proposalIdx] = { ...reviewStates[proposalIdx], status: 'dismissed' };
	}

	// --- Apply with ID remapping ---

	function remapId(id: string, idMap: Map<string, string>): string {
		return idMap.get(id) ?? id;
	}

	async function handleApply(proposalIdx: number) {
		const state = reviewStates[proposalIdx];
		const proposal = proposals[proposalIdx];
		if (state.status !== 'pending' || applying) return;

		applying = true;
		reviewStates[proposalIdx] = { ...state, error: '' };

		try {
			const ops: Operation[] = [];
			// Map from placeholder/temp IDs to real created IDs
			const idMap = new Map<string, string>();

			// Process in order (important: parents before children)
			const sortedIndices = Array.from(state.accepted).sort((a, b) => a - b);

			// Get parent node position for spreading new nodes around it
			const contextNode = contextNodeId ? getNode(contextNodeId) : null;
			const baseX = contextNode?.positionX ?? 200;
			const baseY = contextNode?.positionY ?? 200;
			let createCount = 0;

			// Count total create_node items to calculate spread
			const totalCreates = sortedIndices.filter(
				(i) => proposal.items[i].op === 'create_node'
			).length;

			for (const idx of sortedIndices) {
				const item = proposal.items[idx];
				switch (item.op) {
					case 'create_node': {
						const data = { ...item.data };
						// Remap parentId if it was a placeholder
						if (data.parentId) {
							data.parentId = remapId(data.parentId, idMap);
						}
						// Remove non-schema fields LLM might have added
						const cleanData = { ...data };
						delete (cleanData as unknown as Record<string, unknown>)['_tempId'];
						delete (cleanData as unknown as Record<string, unknown>)['id'];

						// Auto-position: spread new nodes in a fan below the parent
						if (cleanData.positionX == null || cleanData.positionY == null) {
							const spacing = 280;
							const totalWidth = (totalCreates - 1) * spacing;
							const startX = baseX - totalWidth / 2;
							cleanData.positionX = startX + createCount * spacing;
							cleanData.positionY = baseY + 250;
						}

						const created = await createNode(cleanData);
						ops.push({ type: 'create_node', node: created });

						// Auto-link: create edge from new node to context note
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

						// Track ID mapping: if the LLM gave a temp ID, map it to the real one
						const rawData = item.data as unknown as Record<string, unknown>;
						if (rawData._tempId && typeof rawData._tempId === 'string') {
							idMap.set(rawData._tempId, created.id);
						}
						if (rawData.id && typeof rawData.id === 'string') {
							idMap.set(rawData.id, created.id);
						}
						break;
					}
					case 'update_node': {
						const nodeId = remapId(item.nodeId, idMap);
						const existing = getNode(nodeId);
						if (!existing) {
							console.warn(`Node ${nodeId} not found, skipping update`);
							continue;
						}
						const before: Partial<Node> = {};
						const existingRec = existing as unknown as Record<string, unknown>;
						for (const key of Object.keys(item.patch)) {
							(before as unknown as Record<string, unknown>)[key] = existingRec[key];
						}
						await updateNode(nodeId, item.patch as UpdateNodeInput);
						ops.push({
							type: 'update_node',
							id: nodeId,
							before,
							after: item.patch
						});
						break;
					}
					case 'delete_node': {
						const nodeId = remapId(item.nodeId, idMap);
						const existing = getNode(nodeId);
						if (!existing) continue;
						await deleteNode(nodeId);
						ops.push({ type: 'delete_node', node: existing });
						break;
					}
					case 'create_edge': {
						const data = {
							...item.data,
							sourceId: remapId(item.data.sourceId, idMap),
							targetId: remapId(item.data.targetId, idMap)
						};
						const edge = await createEdge(data);
						ops.push({ type: 'create_edge', edge });
						break;
					}
					case 'delete_edge': {
						const edges = getAllEdges();
						const edge = edges.find((e) => e.id === item.edgeId);
						if (!edge) continue;
						await deleteEdge(item.edgeId);
						ops.push({ type: 'delete_edge', edge });
						break;
					}
				}
			}

			if (ops.length > 0) {
				pushOperation({ type: 'batch', operations: ops });
			}

			reviewStates[proposalIdx] = { ...state, status: 'applied', error: '' };
			onApply?.(ops);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('Failed to apply proposals:', e);
			reviewStates[proposalIdx] = { ...reviewStates[proposalIdx], error: msg };
		} finally {
			applying = false;
		}
	}
</script>

{#each proposals as proposal, pIdx}
	{@const state = reviewStates[pIdx]}
	{@const tree = buildTree(proposal.items)}
	<div
		class="proposal-block"
		class:applied={state.status === 'applied'}
		class:dismissed={state.status === 'dismissed'}
	>
		{#if proposal.rationale}
			<div class="proposal-rationale">{proposal.rationale}</div>
		{/if}

		<div class="proposal-tree">
			{#each tree.roots as tn}
				{@const badge = opBadge(tn.item)}
				{@const depth = getDepth(tn.item)}
				<label
					class="tree-item"
					class:unchecked={!state.accepted.has(tn.idx)}
					style:padding-left="{depth * 16 + 4}px"
				>
					<input
						type="checkbox"
						checked={state.accepted.has(tn.idx)}
						disabled={state.status !== 'pending'}
						onchange={() => toggleItem(pIdx, tn.idx)}
					/>
					<span class="op-badge" style:color={badge.color}>{badge.label}</span>
					{#if tn.item.op === 'create_node'}
						{@const cfg = getNodeTypeConfig(tn.item.data.type)}
						<span class="type-badge" style:background={cfg.badge}>{cfg.label}</span>
					{/if}
					<span class="item-title">
						{#if tn.item.op === 'create_node'}
							{tn.item.data.title}
						{:else}
							{tn.item._summary}
						{/if}
					</span>
					<span class="item-context">{itemLabel(tn.item)}</span>
				</label>
				{#each tn.children as child}
					{@const cbadge = opBadge(child.item)}
					<label
						class="tree-item"
						class:unchecked={!state.accepted.has(child.idx)}
						style:padding-left="{(depth + 1) * 16 + 4}px"
					>
						<input
							type="checkbox"
							checked={state.accepted.has(child.idx)}
							disabled={state.status !== 'pending'}
							onchange={() => toggleItem(pIdx, child.idx)}
						/>
						<span class="op-badge" style:color={cbadge.color}>{cbadge.label}</span>
						{#if child.item.op === 'create_node'}
							{@const cfg = getNodeTypeConfig(child.item.data.type)}
							<span class="type-badge" style:background={cfg.badge}>{cfg.label}</span>
							<span class="item-title">{child.item.data.title}</span>
						{:else}
							<span class="item-title">{child.item._summary}</span>
						{/if}
					</label>
				{/each}
			{/each}
		</div>

		{#if state.error}
			<div class="apply-error">{state.error}</div>
		{/if}

		<div class="proposal-actions">
			{#if state.status === 'pending'}
				<button
					class="apply-btn"
					disabled={state.accepted.size === 0 || applying}
					onclick={() => handleApply(pIdx)}
				>
					{applying
						? 'Applying...'
						: `Accept ${state.accepted.size} item${state.accepted.size !== 1 ? 's' : ''}`}
				</button>
				<button class="dismiss-btn" onclick={() => dismiss(pIdx)}>Dismiss</button>
			{:else if state.status === 'applied'}
				<span class="status-label applied">Changes applied</span>
			{:else}
				<span class="status-label dismissed">Dismissed</span>
			{/if}
		</div>
	</div>
{/each}

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

	.proposal-rationale {
		font-size: 11px;
		color: #737373;
		margin-bottom: 8px;
		font-style: italic;
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
