<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import PlanView from '$lib/components/PlanView.svelte';
	import DashboardView from '$lib/components/DashboardView.svelte';
	import PlanningInbox from '$lib/components/PlanningInbox.svelte';
	import NodeDetailPanel from '$lib/components/NodeDetailPanel.svelte';
	import PlanningBreadcrumb from '$lib/components/PlanningBreadcrumb.svelte';
	import TreeExplorer from '$lib/components/TreeExplorer.svelte';
	import PlanTreeModal from '$lib/components/PlanTreeModal.svelte';
	import NodeChatModal from '$lib/components/NodeChatModal.svelte';
	import type { Node } from '$lib/storage/adapter';
	import type { UpdateNodeInput } from '$lib/schemas/node';
	import {
		getProjectNodes,
		getAllEdges,
		createNode,
		updateNode,
		deleteNode,
		createEdge,
		getNode
	} from '$lib/stores/nodes.svelte';
	import { pushOperation } from '$lib/stores/history.svelte';
	import {
		getPlanningLevel,
		getCurrentParentId,
		drillDown,
		getCreateConfig,
		getCreateOptions,
		isDrillable
	} from '$lib/stores/planningNav.svelte';
	import { getInboxCount } from '$lib/stores/inboxStore.svelte';
	import { onDemoAction } from '$lib/demo/actions';

	// Demo event listeners
	let demoCleanups: Array<() => void> = [];
	onMount(() => {
		demoCleanups = [
			onDemoAction('demo:drill-feature', () => {
				// Drill into the first L4 feature node
				const feature = allNodes.find((n) => n.layer === 4);
				if (feature) {
					handleDrillIn(feature.id);
				}
			}),
			onDemoAction('demo:switch-view', (detail) => {
				const v = detail?.view;
				if (v === 'plan' || v === 'dashboard') activeView = v;
			})
		];
	});
	onDestroy(() => {
		demoCleanups.forEach((fn) => fn());
	});

	interface Props {
		projectId: string;
	}

	let { projectId }: Props = $props();

	let activeView = $state<'plan' | 'dashboard'>('plan');
	let detailNodeId = $state<string | null>(null);
	let selectedTags = $state<Set<string>>(new Set());
	let showInbox = $state(false);

	let inboxCount = $derived(getInboxCount(projectId));
	let showCreateMenu = $state(false);

	let detailNode = $derived(detailNodeId ? (getNode(detailNodeId) ?? null) : null);

	// Hover-to-explore state (single tree explorer panel)
	let hoverNodeId = $state<string | null>(null);
	let hoverPosition = $state<{ x: number; y: number } | null>(null);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

	// Modal state for click-to-view
	let modalNodeId = $state<string | null>(null);
	let modalNode = $derived(modalNodeId ? (getNode(modalNodeId) ?? null) : null);
	let planTreeModalNodeId = $state<string | null>(null);
	let planTreeModalNode = $derived(
		planTreeModalNodeId ? (getNode(planTreeModalNodeId) ?? null) : null
	);

	let allNodes = $derived(getProjectNodes());
	let level = $derived(getPlanningLevel());
	let parentId = $derived(getCurrentParentId());
	let createConfig = $derived(getCreateConfig(level));
	let createOptions = $derived(getCreateOptions(level));

	// All unique tags across the project
	let allProjectTags = $derived.by(() => {
		const tagSet = new Set<string>();
		for (const n of allNodes) {
			const t = n.payload?.tags;
			if (Array.isArray(t)) {
				for (const tag of t) tagSet.add(tag as string);
			}
		}
		return Array.from(tagSet).sort();
	});

	function tagColor(tag: string): string {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
		const colors = [
			'#6366f1',
			'#22c55e',
			'#f97316',
			'#06b6d4',
			'#ec4899',
			'#eab308',
			'#8b5cf6',
			'#14b8a6',
			'#ef4444',
			'#3b82f6'
		];
		return colors[Math.abs(hash) % colors.length];
	}

	function toggleTag(tag: string) {
		const next = new Set(selectedTags);
		if (next.has(tag)) next.delete(tag);
		else next.add(tag);
		selectedTags = next;
	}

	let projectEdges = $derived(getAllEdges());

	// IDs of nodes linked to current parent via belongs-to edges
	let linkedNodeIds = $derived.by(() => {
		if (!parentId) return new Set<string>();
		const ids = new Set<string>();
		for (const edge of projectEdges) {
			if (edge.relationType !== 'belongs-to') continue;
			if (edge.targetId === parentId) ids.add(edge.sourceId);
			if (edge.sourceId === parentId) ids.add(edge.targetId);
		}
		return ids;
	});

	// Filter nodes based on current drill-down + belongs-to edges + tag filter
	let visibleNodes = $derived.by(() => {
		let nodes: typeof allNodes;
		if (level === 0) {
			nodes = allNodes.filter((n) => n.layer === 4);
		} else {
			nodes = allNodes.filter((n) => n.parentId === parentId || linkedNodeIds.has(n.id));
		}
		if (selectedTags.size > 0) {
			nodes = nodes.filter((n) => {
				const t = n.payload?.tags;
				if (!Array.isArray(t)) return false;
				return (t as string[]).some((tag) => selectedTags.has(tag));
			});
		}
		return nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	});

	// Count children per node for display
	let childCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const node of allNodes) {
			if (node.parentId) {
				counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
			}
		}
		return counts;
	});

	function handleOpenNode(id: string) {
		// Click opens plan tree modal for planning nodes, chat modal for notes
		hoverNodeId = null;
		hoverPosition = null;
		const node = getNode(id);
		if (
			node &&
			['feature', 'intent', 'goal', 'initiative', 'epic', 'phase', 'ticket'].includes(node.type)
		) {
			planTreeModalNodeId = id;
		} else {
			modalNodeId = id;
		}
	}

	function handleDrillIn(id: string) {
		const node = getNode(id);
		if (node && isDrillable(node.type)) {
			drillDown({ id: node.id, type: node.type, title: node.title });
			detailNodeId = null;
			hoverNodeId = null;
			hoverPosition = null;
		}
	}

	function handleHoverNode(id: string, position: { x: number; y: number }) {
		const node = getNode(id);
		if (!node || !isDrillable(node.type)) return;
		const childCount = allNodes.filter((n) => n.parentId === id).length;
		if (childCount === 0) return;

		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		hoverNodeId = id;
		hoverPosition = position;
	}

	function handleLeaveNode(_id: string) {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		hoverTimeout = setTimeout(() => {
			hoverNodeId = null;
			hoverPosition = null;
		}, 300);
	}

	function handleTreeExplorerEnter() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
	}

	function handleTreeExplorerLeave() {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		hoverTimeout = setTimeout(() => {
			hoverNodeId = null;
			hoverPosition = null;
		}, 300);
	}

	function handleTreeExplorerClickNode(id: string) {
		hoverNodeId = null;
		hoverPosition = null;
		planTreeModalNodeId = id;
	}

	function findTreeRoot(nodeId: string): string {
		let currentId = nodeId;
		let current = getNode(currentId);
		while (current && current.parentId) {
			const parent = getNode(current.parentId);
			if (!parent) break;
			currentId = parent.id;
			current = parent;
		}
		return currentId;
	}

	async function handleCreateItem(config?: { type: string; layer: number; label: string }) {
		const c = config ?? createConfig;
		const node = await createNode({
			type: c.type,
			layer: c.layer,
			projectId,
			title: `New ${c.label}`,
			status: 'draft',
			parentId: parentId,
			positionX: 200,
			positionY: 200
		});
		pushOperation({ type: 'create_node', node });
		detailNodeId = node.id;
		showCreateMenu = false;
	}

	async function handleUpdateNode(id: string, patch: Partial<Node>) {
		const existing = getNode(id);
		const allowed: UpdateNodeInput = {};
		if (patch.type !== undefined) allowed.type = patch.type as UpdateNodeInput['type'];
		if (patch.title !== undefined) allowed.title = patch.title;
		if (patch.body !== undefined) allowed.body = patch.body;
		if (patch.payload !== undefined) allowed.payload = patch.payload;
		if (patch.status !== undefined) allowed.status = patch.status as UpdateNodeInput['status'];
		if (patch.positionX !== undefined) allowed.positionX = patch.positionX;
		if (patch.positionY !== undefined) allowed.positionY = patch.positionY;
		if (patch.parentId !== undefined) allowed.parentId = patch.parentId;
		if (patch.sortOrder !== undefined) allowed.sortOrder = patch.sortOrder;

		const before: Partial<Node> = {};
		if (existing) {
			const existingAny = existing as unknown as Record<string, unknown>;
			for (const key of Object.keys(allowed) as (keyof UpdateNodeInput)[]) {
				(before as Record<string, unknown>)[key] = existingAny[key];
			}
		}

		await updateNode(id, allowed);
		pushOperation({ type: 'update_node', id, before, after: allowed });
	}

	async function handleDeleteNodes(ids: string[]) {
		const ops = [];
		for (const id of ids) {
			const node = getNode(id);
			if (node) {
				ops.push({ type: 'delete_node' as const, node });
				await deleteNode(id);
			}
		}
		if (ops.length > 0) {
			pushOperation(ops.length === 1 ? ops[0] : { type: 'batch', operations: ops });
		}
	}

	async function handleLinkNode(sourceId: string, targetId: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType: 'belongs-to',
			source: 'human'
		});
		pushOperation({ type: 'create_edge', edge });
	}

	async function handleCreateEdge(sourceId: string, targetId: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType: 'supports',
			source: 'human'
		});
		pushOperation({ type: 'create_edge', edge });
	}
</script>

<div class="planning-zone">
	<div class="planning-toolbar">
		<span class="zone-title">Planning</span>

		<div class="view-toggle" data-demo="planning-views">
			<button
				class="tb-btn"
				class:active={activeView === 'plan'}
				onclick={() => (activeView = 'plan')}>Plan</button
			>
			<button
				class="tb-btn"
				class:active={activeView === 'dashboard'}
				onclick={() => (activeView = 'dashboard')}>Dashboard</button
			>
		</div>

		<span class="tb-sep">|</span>

		<PlanningBreadcrumb />

		<div class="toolbar-spacer"></div>

		<span class="tb-sep">|</span>

		{#if createOptions.length <= 1}
			<button
				class="tb-btn create-btn"
				data-demo="planning-create"
				onclick={() => handleCreateItem()}
			>
				+ {createConfig.label}
			</button>
		{:else}
			<div class="create-dropdown">
				<button
					class="tb-btn create-btn"
					data-demo="planning-create"
					onclick={() => handleCreateItem()}
				>
					+ {createConfig.label}
				</button>
				<button class="tb-btn create-caret" onclick={() => (showCreateMenu = !showCreateMenu)}>
					▾
				</button>
				{#if showCreateMenu}
					<div class="create-menu">
						{#each createOptions as opt}
							<button class="create-option" onclick={() => handleCreateItem(opt)}>
								+ {opt.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<span class="tb-sep">|</span>
		<button
			class="tb-btn inbox-btn"
			class:has-items={inboxCount > 0}
			onclick={() => (showInbox = !showInbox)}
		>
			Inbox
			{#if inboxCount > 0}
				<span class="inbox-badge">{inboxCount}</span>
			{/if}
		</button>

		{#if allProjectTags.length > 0}
			<span class="tb-sep">|</span>
			<div class="tag-filters">
				{#each allProjectTags as tag}
					<button
						class="tag-filter-chip"
						class:active={selectedTags.has(tag)}
						style:--tag-color={tagColor(tag)}
						onclick={() => toggleTag(tag)}
					>
						<span class="tag-filter-dot"></span>
						{tag}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="planning-content">
		{#if activeView === 'plan'}
			{#if visibleNodes.length === 0}
				<div class="empty-state">
					{#if level === 0}
						<p>No plans yet. Create your first feature or goal to start planning.</p>
					{:else}
						<p>No items here yet. Add a {createConfig.label.toLowerCase()} to get started.</p>
					{/if}
					<button class="empty-create" onclick={() => handleCreateItem()}>
						+ New {createConfig.label}
					</button>
				</div>
			{/if}

			<div class="planning-main">
				<PlanView
					nodes={visibleNodes}
					edges={projectEdges}
					{allNodes}
					onOpenNode={handleOpenNode}
					onUpdateNode={handleUpdateNode}
					onCreateEdge={handleCreateEdge}
					onDrillIn={handleDrillIn}
					onHoverNode={handleHoverNode}
					onLeaveNode={handleLeaveNode}
				/>
			</div>
		{:else}
			<DashboardView
				{allNodes}
				edges={projectEdges}
				onOpenNode={handleOpenNode}
				onUpdateNode={handleUpdateNode}
			/>
		{/if}

		{#if showInbox}
			<PlanningInbox {projectId} onClose={() => (showInbox = false)} />
		{/if}

		{#if detailNode}
			<NodeDetailPanel
				node={detailNode}
				onUpdateNode={handleUpdateNode}
				onCreateEdge={handleLinkNode}
				onClose={() => (detailNodeId = null)}
			/>
		{/if}
	</div>

	<!-- Tree explorer for hover-to-explore -->
	{#if hoverNodeId && hoverPosition}
		{@const hNode = getNode(hoverNodeId)}
		{#if hNode}
			<TreeExplorer
				rootNode={hNode}
				{allNodes}
				edges={projectEdges}
				position={hoverPosition}
				onClickNode={handleTreeExplorerClickNode}
				onMouseEnter={handleTreeExplorerEnter}
				onMouseLeave={handleTreeExplorerLeave}
			/>
		{/if}
	{/if}

	<!-- Plan tree modal for planning nodes -->
	{#if planTreeModalNode}
		{@const rootId = findTreeRoot(planTreeModalNode.id)}
		<PlanTreeModal
			node={planTreeModalNode}
			rootNodeId={rootId}
			{projectId}
			{allNodes}
			edges={projectEdges}
			onUpdateNode={handleUpdateNode}
			onClose={() => (planTreeModalNodeId = null)}
		/>
	{/if}

	<!-- Chat modal for notes zone nodes -->
	{#if modalNode}
		<NodeChatModal
			node={modalNode}
			{projectId}
			layout="body-first"
			onUpdateNode={handleUpdateNode}
			onClose={() => (modalNodeId = null)}
		/>
	{/if}
</div>

<style>
	.planning-zone {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative;
	}

	.planning-toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
		flex-shrink: 0;
		z-index: 10;
	}

	.view-toggle {
		display: flex;
		gap: 2px;
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 5px;
		padding: 2px;
	}

	.zone-title {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
		flex-shrink: 0;
	}

	.tb-sep {
		color: #2a2a2a;
		font-size: 12px;
		flex-shrink: 0;
	}

	.toolbar-spacer {
		flex: 1;
	}

	.tb-btn {
		background: none;
		border: none;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 11px;
		color: #525252;
		cursor: pointer;
		text-transform: capitalize;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.tb-btn:hover {
		color: #a3a3a3;
	}

	.tb-btn.active {
		background: #1f1f1f;
		color: #d4d4d4;
	}

	.inbox-btn.has-items {
		color: #14b8a6;
	}

	.inbox-badge {
		font-size: 10px;
		font-weight: 700;
		background: #14b8a6;
		color: #000;
		padding: 1px 6px;
		border-radius: 10px;
		line-height: 1.4;
		margin-left: 4px;
	}

	.create-dropdown {
		position: relative;
		display: flex;
		align-items: center;
	}

	.create-btn {
		color: #14b8a6;
		border: 1px solid #134e4a;
	}

	.create-btn:hover {
		background: #134e4a;
		color: #5eead4;
	}

	.create-caret {
		color: #14b8a6;
		border: 1px solid #134e4a;
		border-left: none;
		border-radius: 0 4px 4px 0;
		padding: 3px 4px;
		font-size: 9px;
	}

	.create-caret:hover {
		background: #134e4a;
		color: #5eead4;
	}

	.create-dropdown .create-btn {
		border-radius: 4px 0 0 4px;
	}

	.create-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px;
		min-width: 130px;
		z-index: 100;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}

	.create-option {
		display: block;
		width: 100%;
		padding: 5px 10px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
	}

	.create-option:hover {
		background: #262626;
		color: #5eead4;
	}

	.planning-content {
		flex: 1;
		display: flex;
		min-height: 0;
		position: relative;
	}

	.planning-main {
		flex: 1;
		position: relative;
		min-width: 0;
	}

	.empty-state {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 1;
		pointer-events: none;
	}

	.empty-state p {
		font-size: 13px;
		color: #404040;
		margin-bottom: 12px;
	}

	.empty-create {
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #a3a3a3;
		font-size: 12px;
		padding: 6px 16px;
		cursor: pointer;
		pointer-events: auto;
	}

	.empty-create:hover {
		background: #1f1f1f;
		border-color: #3a3a3a;
	}

	.tag-filters {
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		flex-shrink: 1;
		min-width: 0;
	}

	.tag-filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid #2a2a2a;
		background: transparent;
		color: #525252;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.tag-filter-chip:hover {
		color: #a3a3a3;
		border-color: #3a3a3a;
	}

	.tag-filter-chip.active {
		background: rgba(255, 255, 255, 0.06);
		color: #d4d4d4;
		border-color: var(--tag-color);
	}

	.tag-filter-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--tag-color);
		flex-shrink: 0;
	}
</style>
