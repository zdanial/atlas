<script lang="ts">
	import { untrack } from 'svelte';
	import type { Node } from '$lib/storage/adapter';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		/** Currently selected parent node ID (null = root) */
		selectedId: string | null;
		/** Callback when user picks a parent */
		onSelect: (id: string | null) => void;
		/** Optional: filter which node types are valid parents for the target type */
		validParentTypes?: string[];
	}

	let { selectedId, onSelect, validParentTypes }: Props = $props();

	let allNodes = $derived(getProjectNodes());

	// Build hierarchy: only show planning nodes (L4→L1)
	let planningNodes = $derived(
		allNodes.filter((n) =>
			['feature', 'intent', 'goal', 'initiative', 'epic', 'phase', 'ticket'].includes(n.type)
		)
	);

	let expanded = $state<Set<string>>(new Set());

	function getChildren(parentId: string): Node[] {
		return planningNodes
			.filter((n) => n.parentId === parentId)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	}

	function getRoots(): Node[] {
		return planningNodes
			.filter((n) => !n.parentId || !planningNodes.some((p) => p.id === n.parentId))
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	}

	function hasChildren(id: string): boolean {
		return planningNodes.some((n) => n.parentId === id);
	}

	function toggleExpand(e: MouseEvent, id: string) {
		e.stopPropagation();
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function isValidParent(node: Node): boolean {
		if (!validParentTypes || validParentTypes.length === 0) return true;
		return validParentTypes.includes(node.type);
	}

	function statusDot(status: string): string {
		if (status === 'done') return '✓';
		if (status === 'active') return '●';
		return '○';
	}

	function statusColor(status: string): string {
		if (status === 'done') return '#22c55e';
		if (status === 'active') return '#3b82f6';
		return '#525252';
	}

	// Auto-expand the path to the selected node when selection changes
	$effect(() => {
		if (selectedId) {
			const path = untrack(() => new Set(expanded));
			let current = planningNodes.find((n) => n.id === selectedId);
			while (current && current.parentId) {
				path.add(current.parentId);
				current = planningNodes.find((n) => n.id === current!.parentId);
			}
			expanded = path;
		}
	});
</script>

<div class="tree-picker">
	<!-- Root option -->
	<button
		class="tree-node"
		class:selected={selectedId === null}
		onclick={() => onSelect(null)}
		type="button"
	>
		<span class="tree-radio">{selectedId === null ? '●' : '○'}</span>
		<span class="tree-label root-label">Root (new top-level item)</span>
	</button>

	<!-- Planning hierarchy -->
	{#each getRoots() as node}
		{@const cfg = getNodeTypeConfig(node.type)}
		{@const children = getChildren(node.id)}
		{@const valid = isValidParent(node)}
		<div class="tree-branch">
			<button
				class="tree-node"
				class:selected={selectedId === node.id}
				class:disabled={!valid}
				onclick={() => valid && onSelect(node.id)}
				type="button"
			>
				{#if hasChildren(node.id)}
					<button
						class="tree-toggle"
						onclick={(e) => toggleExpand(e, node.id)}
						type="button"
						aria-label={expanded.has(node.id) ? 'Collapse' : 'Expand'}
					>
						{expanded.has(node.id) ? '▾' : '▸'}
					</button>
				{:else}
					<span class="tree-toggle-spacer"></span>
				{/if}
				<span class="tree-radio">{selectedId === node.id ? '●' : '○'}</span>
				<span class="tree-status" style:color={statusColor(node.status)}>
					{statusDot(node.status)}
				</span>
				<span class="tree-type-badge" style:background={cfg.badge}>{cfg.label}</span>
				<span class="tree-title">{node.title}</span>
			</button>

			{#if expanded.has(node.id) && children.length > 0}
				<div class="tree-children">
					{#each children as child}
						{@const childCfg = getNodeTypeConfig(child.type)}
						{@const childChildren = getChildren(child.id)}
						{@const childValid = isValidParent(child)}
						<div class="tree-branch">
							<button
								class="tree-node"
								class:selected={selectedId === child.id}
								class:disabled={!childValid}
								onclick={() => childValid && onSelect(child.id)}
								type="button"
							>
								{#if hasChildren(child.id)}
									<button
										class="tree-toggle"
										onclick={(e) => toggleExpand(e, child.id)}
										type="button"
										aria-label={expanded.has(child.id) ? 'Collapse' : 'Expand'}
									>
										{expanded.has(child.id) ? '▾' : '▸'}
									</button>
								{:else}
									<span class="tree-toggle-spacer"></span>
								{/if}
								<span class="tree-radio">{selectedId === child.id ? '●' : '○'}</span>
								<span class="tree-status" style:color={statusColor(child.status)}>
									{statusDot(child.status)}
								</span>
								<span class="tree-type-badge" style:background={childCfg.badge}
									>{childCfg.label}</span
								>
								<span class="tree-title">{child.title}</span>
							</button>

							{#if expanded.has(child.id) && childChildren.length > 0}
								<div class="tree-children">
									{#each childChildren as grandchild}
										{@const gcCfg = getNodeTypeConfig(grandchild.type)}
										{@const gcValid = isValidParent(grandchild)}
										<button
											class="tree-node"
											class:selected={selectedId === grandchild.id}
											class:disabled={!gcValid}
											onclick={() => gcValid && onSelect(grandchild.id)}
											type="button"
										>
											<span class="tree-toggle-spacer"></span>
											<span class="tree-radio">{selectedId === grandchild.id ? '●' : '○'}</span>
											<span class="tree-status" style:color={statusColor(grandchild.status)}>
												{statusDot(grandchild.status)}
											</span>
											<span class="tree-type-badge" style:background={gcCfg.badge}
												>{gcCfg.label}</span
											>
											<span class="tree-title">{grandchild.title}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	{#if planningNodes.length === 0}
		<div class="tree-empty">No planning items yet. Item will be created at root level.</div>
	{/if}
</div>

<style>
	.tree-picker {
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 280px;
		overflow-y: auto;
		padding: 4px;
	}

	.tree-branch {
		display: flex;
		flex-direction: column;
	}

	.tree-children {
		padding-left: 20px;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		border-radius: 4px;
		border: none;
		background: none;
		color: #d4d4d4;
		font-size: 12px;
		cursor: pointer;
		transition: background 0.1s;
		width: 100%;
		text-align: left;
	}

	.tree-node:hover {
		background: #1f1f1f;
	}

	.tree-node.selected {
		background: #1e1b4b;
		color: #c7d2fe;
	}

	.tree-node.disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.tree-toggle {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: #525252;
		cursor: pointer;
		font-size: 10px;
		flex-shrink: 0;
		padding: 0;
		border-radius: 2px;
	}

	.tree-toggle:hover {
		color: #a3a3a3;
		background: #2a2a2a;
	}

	.tree-toggle-spacer {
		width: 16px;
		flex-shrink: 0;
	}

	.tree-radio {
		font-size: 10px;
		color: #6366f1;
		width: 12px;
		text-align: center;
		flex-shrink: 0;
	}

	.tree-status {
		font-size: 10px;
		flex-shrink: 0;
	}

	.tree-type-badge {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 4px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	.tree-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.root-label {
		color: #737373;
		font-style: italic;
	}

	.tree-empty {
		font-size: 11px;
		color: #525252;
		padding: 12px 8px;
		text-align: center;
	}
</style>
