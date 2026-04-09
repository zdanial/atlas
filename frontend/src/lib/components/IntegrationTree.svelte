<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface IntegrationAction {
		action: 'create' | 'link';
		nodeType: string;
		title: string;
		body: string;
		parentId?: string;
		approved: boolean;
	}

	interface Props {
		actions: IntegrationAction[];
		allNodes: Node[];
	}

	let { actions, allNodes }: Props = $props();

	interface TreeNode {
		id: string;
		type: string;
		title: string;
		isNew: boolean;
		children: TreeNode[];
		depth: number;
	}

	let tree = $derived.by(() => {
		const approvedActions = actions.filter((a) => a.approved);
		if (approvedActions.length === 0) return [];

		// Collect all parent IDs we need to show
		const nodeMap = new Map<string, Node>();
		for (const n of allNodes) nodeMap.set(n.id, n);

		// Build ancestor chains for each action
		const roots: TreeNode[] = [];
		const seen = new Map<string, TreeNode>();

		function getOrCreateExistingNode(id: string, depth: number): TreeNode | null {
			if (seen.has(id)) return seen.get(id)!;
			const n = nodeMap.get(id);
			if (!n) return null;
			const treeNode: TreeNode = {
				id: n.id,
				type: n.type,
				title: n.title,
				isNew: false,
				children: [],
				depth
			};
			seen.set(id, treeNode);
			return treeNode;
		}

		for (const action of approvedActions) {
			const actionNode: TreeNode = {
				id: `new_${action.title}`,
				type: action.nodeType,
				title: action.title,
				isNew: true,
				children: [],
				depth: 0
			};

			if (action.parentId) {
				// Walk up the parent chain to build the path
				const chain: string[] = [];
				let currentId: string | null = action.parentId;
				while (currentId) {
					if (chain.includes(currentId)) break; // prevent cycles
					chain.push(currentId);
					const parent = nodeMap.get(currentId);
					currentId = parent?.parentId ?? null;
				}

				// Build tree from root down
				chain.reverse();
				let parentTreeNode: TreeNode | null = null;
				for (let i = 0; i < chain.length; i++) {
					const existingNode = getOrCreateExistingNode(chain[i], i);
					if (!existingNode) continue;
					existingNode.depth = i;

					if (i === 0 && !roots.some((r) => r.id === existingNode.id)) {
						roots.push(existingNode);
					}
					if (parentTreeNode && !parentTreeNode.children.some((c) => c.id === existingNode.id)) {
						parentTreeNode.children.push(existingNode);
					}
					parentTreeNode = existingNode;
				}

				// Attach action node under last existing parent
				if (parentTreeNode) {
					actionNode.depth = parentTreeNode.depth + 1;
					parentTreeNode.children.push(actionNode);
				} else {
					roots.push(actionNode);
				}
			} else {
				roots.push(actionNode);
			}
		}

		return roots;
	});

	function flattenTree(nodes: TreeNode[]): TreeNode[] {
		const result: TreeNode[] = [];
		function walk(n: TreeNode) {
			result.push(n);
			for (const child of n.children) walk(child);
		}
		for (const root of nodes) walk(root);
		return result;
	}

	let flatNodes = $derived(flattenTree(tree));
</script>

{#if flatNodes.length > 0}
	<div class="integration-tree">
		<div class="tree-label">Plan placement</div>
		{#each flatNodes as node}
			{@const config = getNodeTypeConfig(node.type)}
			<div class="tree-node" style:padding-left="{node.depth * 20 + 8}px">
				{#if node.depth > 0}
					<span class="tree-connector"></span>
				{/if}
				<span class="tree-dot" style:background={config.badge}></span>
				<span class="tree-type">{config.label}</span>
				<span class="tree-title" class:new={node.isNew}>{node.title}</span>
				{#if node.isNew}
					<span class="tree-new-badge">new</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.integration-tree {
		background: #0d0d0d;
		border: 1px solid #1f1f1f;
		border-radius: 6px;
		padding: 10px 0;
		margin-bottom: 8px;
	}

	.tree-label {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #404040;
		padding: 0 12px 8px;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		position: relative;
	}

	.tree-connector {
		position: absolute;
		left: calc(var(--depth-offset, 0px) - 12px);
		width: 8px;
		height: 1px;
		background: #262626;
	}

	.tree-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tree-type {
		font-size: 9px;
		text-transform: uppercase;
		color: #525252;
		flex-shrink: 0;
	}

	.tree-title {
		font-size: 11px;
		color: #737373;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree-title.new {
		color: #d4d4d4;
	}

	.tree-new-badge {
		font-size: 8px;
		font-weight: 600;
		text-transform: uppercase;
		color: #22c55e;
		background: #052e16;
		border: 1px solid #16a34a;
		padding: 0 4px;
		border-radius: 3px;
		flex-shrink: 0;
	}
</style>
