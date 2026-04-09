<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText } from '$lib/node-types';
	import { getBlockers, getBlocked, phaseProgress } from '$lib/dependency-graph';
	import { compilePrompt } from '$lib/export/prompt-compiler';
	import NodeChat from './NodeChat.svelte';
	import { onMount } from 'svelte';

	interface Props {
		node: Node;
		rootNodeId: string;
		projectId: string;
		allNodes: Node[];
		edges: NodeEdge[];
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		onClose: () => void;
	}

	let { node, rootNodeId, projectId, allNodes, edges, onUpdateNode, onClose }: Props = $props();

	// Navigation history for back/forward
	let navHistory = $state<string[]>([node.id]);
	let navIndex = $state(0);

	let focusedNodeId = $derived(navHistory[navIndex]);
	let focusedNode = $derived(allNodes.find((n) => n.id === focusedNodeId) ?? node);

	function navigateTo(id: string) {
		if (id === focusedNodeId) return;
		// Trim forward history and push
		navHistory = [...navHistory.slice(0, navIndex + 1), id];
		navIndex = navHistory.length - 1;
		// Auto-expand path to the new node
		expandPathTo(id);
		// Scroll tree item into view
		requestAnimationFrame(() => scrollTreeItemIntoView(id));
	}

	function goBack() {
		if (navIndex > 0) navIndex--;
	}

	function goForward() {
		if (navIndex < navHistory.length - 1) navIndex++;
	}

	let canGoBack = $derived(navIndex > 0);
	let canGoForward = $derived(navIndex < navHistory.length - 1);

	// Tree expand/collapse state
	let expanded = $state<Set<string>>(new Set());

	function expandPathTo(nodeId: string) {
		const path = new Set(expanded);
		let current = allNodes.find((n) => n.id === nodeId);
		while (current && current.parentId) {
			path.add(current.parentId);
			current = allNodes.find((n) => n.id === current!.parentId);
		}
		expanded = path;
	}

	// On mount, expand the path to the initially focused node
	onMount(() => {
		expandPathTo(node.id);
	});

	function toggleExpand(e: MouseEvent, id: string) {
		e.stopPropagation();
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function getChildren(parentId: string): Node[] {
		return allNodes
			.filter((n) => n.parentId === parentId)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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

	// Scroll a tree item into view
	let treeNavEl = $state<HTMLDivElement>();

	function scrollTreeItemIntoView(id: string) {
		if (!treeNavEl) return;
		const el = treeNavEl.querySelector(`[data-tree-id="${id}"]`);
		el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	// Dependency info for focused node
	let blockerNodes = $derived(
		getBlockers(focusedNode.id, edges)
			.map((id) => allNodes.find((n) => n.id === id))
			.filter(Boolean) as Node[]
	);
	let blockedNodes = $derived(
		getBlocked(focusedNode.id, edges)
			.map((id) => allNodes.find((n) => n.id === id))
			.filter(Boolean) as Node[]
	);

	let progress = $derived(
		focusedNode.type === 'phase' || focusedNode.type === 'epic'
			? phaseProgress(focusedNode.id, allNodes)
			: null
	);

	let focusedConfig = $derived(getNodeTypeConfig(focusedNode.type));
	let bodyText = $derived(extractBodyText(focusedNode.body, 5000));

	// Copy prompt state
	let copyFeedback = $state<string | null>(null);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	async function handleCopyPrompt() {
		const markdown = compilePrompt(focusedNode, allNodes, edges);
		try {
			await navigator.clipboard.writeText(markdown);
			copyFeedback = 'Copied!';
		} catch {
			copyFeedback = 'Failed to copy';
		}
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copyFeedback = null;
		}, 2000);
	}

	// Root node for display at top of tree
	let rootNode = $derived(allNodes.find((n) => n.id === rootNodeId));

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		}
		if (e.key === 'ArrowLeft' && e.altKey) {
			e.preventDefault();
			goBack();
		}
		if (e.key === 'ArrowRight' && e.altKey) {
			e.preventDefault();
			goForward();
		}
		if (e.key === 'C' && e.metaKey && e.shiftKey) {
			e.preventDefault();
			handleCopyPrompt();
		}
	}

	// Flatten tree recursively for rendering
	interface TreeItem {
		node: Node;
		depth: number;
		hasChildren: boolean;
		isExpanded: boolean;
	}

	let flatTree = $derived.by(() => {
		const items: TreeItem[] = [];
		function walk(parentId: string, depth: number) {
			const children = getChildren(parentId);
			for (const child of children) {
				const hasChildren = allNodes.some((n) => n.parentId === child.id);
				const isExpanded = expanded.has(child.id);
				items.push({ node: child, depth, hasChildren, isExpanded });
				if (isExpanded && hasChildren) {
					walk(child.id, depth + 1);
				}
			}
		}
		walk(rootNodeId, 0);
		return items;
	});

	// Children of the focused node (shown in detail panel)
	let focusedChildren = $derived(getChildren(focusedNode.id));
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} role="dialog" aria-modal="true">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-container" onclick={(e) => e.stopPropagation()}>
		<!-- Header -->
		<div class="modal-header">
			<div class="nav-buttons">
				<button class="nav-btn" disabled={!canGoBack} onclick={goBack} title="Back (Alt+←)">
					←
				</button>
				<button
					class="nav-btn"
					disabled={!canGoForward}
					onclick={goForward}
					title="Forward (Alt+→)"
				>
					→
				</button>
			</div>
			<span class="modal-type" style:color={focusedConfig.badge}>{focusedConfig.label}</span>
			<span class="modal-title">{focusedNode.title}</span>
			<div class="modal-spacer"></div>
			<button class="modal-close" onclick={onClose}>×</button>
		</div>

		<div class="modal-body">
			<!-- Left: Tree Navigation -->
			<div class="tree-nav" bind:this={treeNavEl}>
				<div class="tree-nav-header">Tree</div>
				<div class="tree-nav-items">
					<!-- Root node -->
					{#if rootNode}
						{@const rootConfig = getNodeTypeConfig(rootNode.type)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="tree-item root-item"
							class:focused={rootNode.id === focusedNodeId}
							data-tree-id={rootNode.id}
							onclick={() => navigateTo(rootNode.id)}
							role="treeitem"
							tabindex="0"
						>
							<span class="tree-dot" style:color={statusColor(rootNode.status)}>
								{statusDot(rootNode.status)}
							</span>
							<span class="tree-root-badge" style:color={rootConfig.badge}>
								{rootConfig.label}
							</span>
							<span class="tree-name">{rootNode.title}</span>
						</div>
					{/if}

					<!-- Tree items -->
					{#each flatTree as item (item.node.id)}
						{@const itemConfig = getNodeTypeConfig(item.node.type)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="tree-item"
							class:focused={item.node.id === focusedNodeId}
							data-tree-id={item.node.id}
							style:padding-left="{16 + item.depth * 16}px"
							onclick={() => navigateTo(item.node.id)}
							role="treeitem"
							tabindex="0"
						>
							{#if item.hasChildren}
								<button class="tree-chevron" onclick={(e) => toggleExpand(e, item.node.id)}>
									{item.isExpanded ? '▼' : '▶'}
								</button>
							{:else}
								<span class="tree-spacer"></span>
							{/if}
							<span class="tree-dot" style:color={statusColor(item.node.status)}>
								{statusDot(item.node.status)}
							</span>
							<span class="tree-name">{item.node.title}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Center: Node Detail -->
			<div class="node-detail">
				<div class="detail-header">
					<span class="detail-type" style:color={focusedConfig.badge}>{focusedConfig.label}</span>
					<span class="detail-status" style:color={statusColor(focusedNode.status)}>
						{statusDot(focusedNode.status)}
						{focusedNode.status}
					</span>
					<div class="detail-spacer"></div>
					<button
						class="copy-prompt-btn"
						onclick={handleCopyPrompt}
						title="Copy prompt to clipboard (Cmd+Shift+C)"
					>
						{#if copyFeedback}
							{copyFeedback}
						{:else}
							Copy Prompt
						{/if}
					</button>
				</div>

				<h2 class="detail-title">{focusedNode.title}</h2>

				{#if bodyText}
					<div class="detail-section">
						<div class="detail-label">Description</div>
						<p class="detail-text">{bodyText}</p>
					</div>
				{/if}

				<!-- Type-specific payload fields -->
				{#if focusedNode.type === 'phase'}
					{@const payload = focusedNode.payload as Record<string, unknown> | null}
					{#if payload?.objective}
						<div class="detail-section">
							<div class="detail-label">Objective</div>
							<p class="detail-text">{payload.objective}</p>
						</div>
					{/if}
					{#if payload?.complexity}
						<div class="detail-section">
							<div class="detail-label">Complexity</div>
							<span class="complexity-badge complexity-{payload.complexity}"
								>{payload.complexity}</span
							>
						</div>
					{/if}
					{#if Array.isArray(payload?.verifyCriteria) && (payload.verifyCriteria as string[]).length > 0}
						<div class="detail-section">
							<div class="detail-label">Verify Criteria</div>
							<ul class="criteria-list">
								{#each payload.verifyCriteria as criterion}
									<li>{criterion}</li>
								{/each}
							</ul>
						</div>
					{/if}
				{:else if focusedNode.type === 'ticket'}
					{@const payload = focusedNode.payload as Record<string, unknown> | null}
					{#if payload?.intent}
						<div class="detail-section">
							<div class="detail-label">Intent</div>
							<p class="detail-text">{payload.intent}</p>
						</div>
					{/if}
					{#if Array.isArray(payload?.acceptanceCriteria) && (payload.acceptanceCriteria as string[]).length > 0}
						<div class="detail-section">
							<div class="detail-label">Acceptance Criteria</div>
							<ul class="criteria-list">
								{#each payload.acceptanceCriteria as criterion}
									<li>{criterion}</li>
								{/each}
							</ul>
						</div>
					{/if}
				{:else if focusedNode.type === 'epic'}
					{@const payload = focusedNode.payload as Record<string, unknown> | null}
					{#if Array.isArray(payload?.openQuestions) && (payload.openQuestions as string[]).length > 0}
						<div class="detail-section">
							<div class="detail-label">Open Questions</div>
							<ul class="criteria-list">
								{#each payload.openQuestions as q}
									<li>{q}</li>
								{/each}
							</ul>
						</div>
					{/if}
				{:else if focusedNode.type === 'feature' || focusedNode.type === 'intent' || focusedNode.type === 'goal'}
					{@const payload = focusedNode.payload as Record<string, unknown> | null}
					{#if payload?.targetOutcome}
						<div class="detail-section">
							<div class="detail-label">Target Outcome</div>
							<p class="detail-text">{payload.targetOutcome}</p>
						</div>
					{/if}
					{#if payload?.deadline}
						<div class="detail-section">
							<div class="detail-label">Deadline</div>
							<p class="detail-text">{payload.deadline}</p>
						</div>
					{/if}
				{/if}

				<!-- Progress -->
				{#if progress && progress.total > 0}
					<div class="detail-section">
						<div class="detail-label">Progress</div>
						<div class="detail-progress">
							<div class="progress-bar">
								<div
									class="progress-fill"
									style:width="{(progress.done / progress.total) * 100}%"
								></div>
							</div>
							<span class="progress-text">{progress.done}/{progress.total} done</span>
						</div>
					</div>
				{/if}

				<!-- Children list (clickable) -->
				{#if focusedChildren.length > 0}
					<div class="detail-section">
						<div class="detail-label">Children ({focusedChildren.length})</div>
						<div class="children-list">
							{#each focusedChildren as child}
								{@const childConfig = getNodeTypeConfig(child.type)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<div
									class="child-link"
									onclick={() => navigateTo(child.id)}
									role="button"
									tabindex="0"
								>
									<span class="child-dot" style:color={statusColor(child.status)}>
										{statusDot(child.status)}
									</span>
									<span class="child-type" style:color={childConfig.badge}>
										{childConfig.label}
									</span>
									<span class="child-title">{child.title}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if blockerNodes.length > 0 || blockedNodes.length > 0}
					<div class="detail-section">
						<div class="detail-label">Dependencies</div>
						{#each blockerNodes as blocker}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="dep-link incoming"
								onclick={() => navigateTo(blocker.id)}
								role="button"
								tabindex="0"
							>
								<span class="dep-arrow">←</span>
								Blocked by: {blocker.title}
							</div>
						{/each}
						{#each blockedNodes as blocked}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="dep-link outgoing"
								onclick={() => navigateTo(blocked.id)}
								role="button"
								tabindex="0"
							>
								<span class="dep-arrow">→</span>
								Blocks: {blocked.title}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right: Chat -->
			<div class="chat-panel">
				<div class="chat-panel-header">Chat</div>
				<NodeChat node={focusedNode} {projectId} {onUpdateNode} {allNodes} />
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-container {
		width: 95vw;
		max-width: 1200px;
		height: 85vh;
		background: #0f0f0f;
		border: 1px solid #262626;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.nav-buttons {
		display: flex;
		gap: 2px;
		margin-right: 4px;
	}

	.nav-btn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid #262626;
		border-radius: 4px;
		color: #737373;
		font-size: 13px;
		cursor: pointer;
	}

	.nav-btn:hover:not(:disabled) {
		color: #d4d4d4;
		border-color: #404040;
	}

	.nav-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	.modal-type {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.modal-title {
		font-size: 14px;
		font-weight: 600;
		color: #e5e5e5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.modal-spacer {
		flex: 1;
	}

	.modal-close {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid #262626;
		border-radius: 6px;
		color: #737373;
		font-size: 16px;
		cursor: pointer;
	}

	.modal-close:hover {
		color: #d4d4d4;
		border-color: #404040;
	}

	.modal-body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	/* Tree nav */
	.tree-nav {
		width: 260px;
		border-right: 1px solid #1a1a1a;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.tree-nav-header {
		font-size: 10px;
		text-transform: uppercase;
		color: #525252;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		letter-spacing: 0.05em;
	}

	.tree-nav-items {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.tree-item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 12px;
		cursor: pointer;
		font-size: 11px;
		color: #a3a3a3;
		transition: background 0.1s;
	}

	.tree-item:hover {
		background: #1a1a1a;
	}

	.tree-item.focused {
		background: #1e3a5f;
		color: #e5e5e5;
	}

	.root-item {
		border-bottom: 1px solid #1a1a1a;
		padding: 8px 12px;
		font-weight: 600;
	}

	.tree-root-badge {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.tree-chevron {
		font-size: 7px;
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: none;
		border: none;
		color: #525252;
		cursor: pointer;
		border-radius: 3px;
	}

	.tree-chevron:hover {
		color: #a3a3a3;
		background: #262626;
	}

	.tree-spacer {
		width: 14px;
		flex-shrink: 0;
	}

	.tree-dot {
		font-size: 9px;
		flex-shrink: 0;
	}

	.tree-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Node detail */
	.node-detail {
		flex: 1;
		overflow-y: auto;
		padding: 20px 24px;
		min-width: 0;
	}

	.detail-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}

	.detail-type {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detail-status {
		font-size: 11px;
	}

	.detail-spacer {
		flex: 1;
	}

	.copy-prompt-btn {
		font-size: 11px;
		padding: 4px 10px;
		background: #1a2a1f;
		border: 1px solid #16a34a;
		border-radius: 4px;
		color: #22c55e;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
		white-space: nowrap;
	}

	.copy-prompt-btn:hover {
		background: #22c55e;
		color: #0f0f0f;
	}

	.detail-title {
		font-size: 18px;
		font-weight: 600;
		color: #e5e5e5;
		margin: 0 0 16px 0;
		line-height: 1.3;
	}

	.detail-section {
		margin-bottom: 16px;
	}

	.detail-label {
		font-size: 10px;
		text-transform: uppercase;
		color: #525252;
		letter-spacing: 0.05em;
		margin-bottom: 4px;
	}

	.detail-text {
		font-size: 13px;
		color: #a3a3a3;
		line-height: 1.5;
		margin: 0;
	}

	.complexity-badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 4px;
		text-transform: capitalize;
	}

	.complexity-low {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
	}

	.complexity-med {
		background: rgba(234, 179, 8, 0.1);
		color: #eab308;
	}

	.complexity-high {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.criteria-list {
		margin: 0;
		padding-left: 16px;
		font-size: 12px;
		color: #a3a3a3;
		line-height: 1.6;
	}

	.detail-progress {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.progress-bar {
		flex: 1;
		max-width: 200px;
		height: 6px;
		background: #1a1a1a;
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: #22c55e;
		border-radius: 3px;
		transition: width 0.3s;
	}

	.progress-text {
		font-size: 11px;
		color: #525252;
	}

	.children-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.child-link {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
	}

	.child-link:hover {
		background: #1a1a1a;
	}

	.child-dot {
		font-size: 9px;
		flex-shrink: 0;
	}

	.child-type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.child-title {
		font-size: 12px;
		color: #d4d4d4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dep-link {
		font-size: 12px;
		color: #a3a3a3;
		padding: 4px 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.dep-link:hover {
		color: #e5e5e5;
	}

	.dep-arrow {
		font-size: 11px;
	}

	.dep-link.incoming .dep-arrow {
		color: #f97316;
	}

	.dep-link.outgoing .dep-arrow {
		color: #3b82f6;
	}

	/* Chat panel */
	.chat-panel {
		width: 340px;
		border-left: 1px solid #1a1a1a;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.chat-panel-header {
		font-size: 10px;
		text-transform: uppercase;
		color: #525252;
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}
</style>
