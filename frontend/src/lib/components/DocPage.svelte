<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getNodeTypeConfig, extractBodyText } from '$lib/node-types';
	import { findBacklinks } from '$lib/docs/wikilinks';
	import WikiRenderer from './WikiRenderer.svelte';

	interface Props {
		node: Node;
		allNodes: Node[];
		edges: NodeEdge[];
		onNavigate: (nodeId: string) => void;
		onEdit: (nodeId: string) => void;
	}

	let { node, allNodes, edges, onNavigate, onEdit }: Props = $props();

	let colors = $derived(getNodeTypeConfig(node.type));
	let bodyText = $derived(extractBodyText(node.body, 10000));

	// Children
	let children = $derived.by(() => {
		const childIds = new Set(edges.filter((e) => e.sourceId === node.id).map((e) => e.targetId));
		return allNodes.filter((n) => childIds.has(n.id));
	});

	// Backlinks (nodes that reference this one via wikilinks)
	let backlinks = $derived(findBacklinks(node.id, allNodes));

	// Related (connected via edges, excluding children)
	let related = $derived.by(() => {
		const relatedIds = new Set<string>();
		for (const e of edges) {
			if (e.sourceId === node.id) relatedIds.add(e.targetId);
			if (e.targetId === node.id) relatedIds.add(e.sourceId);
		}
		// Remove children
		for (const c of children) relatedIds.delete(c.id);
		relatedIds.delete(node.id);
		return allNodes.filter((n) => relatedIds.has(n.id));
	});

	// Breadcrumb path
	let breadcrumb = $derived.by(() => {
		const path: Node[] = [];
		let current = allNodes.find((n) => n.id === node.parentId);
		while (current) {
			path.unshift(current);
			current = allNodes.find((n) => n.id === current!.parentId);
		}
		return path;
	});
</script>

<div class="doc-page">
	<!-- Breadcrumb -->
	{#if breadcrumb.length > 0}
		<div class="breadcrumb">
			{#each breadcrumb as ancestor, i}
				<button class="breadcrumb-link" onclick={() => onNavigate(ancestor.id)}>
					{ancestor.title}
				</button>
				{#if i < breadcrumb.length - 1}
					<span class="breadcrumb-sep">/</span>
				{/if}
			{/each}
			<span class="breadcrumb-sep">/</span>
			<span class="breadcrumb-current">{node.title}</span>
		</div>
	{/if}

	<!-- Header -->
	<div class="doc-header">
		<span class="type-badge" style:background={colors.badge}>{node.type}</span>
		<h1 class="doc-title">{node.title}</h1>
		<div class="doc-meta">
			<span
				class="status-badge"
				class:active={node.status === 'active'}
				class:done={node.status === 'done'}
			>
				{node.status}
			</span>
			<span class="meta-item">Layer {node.layer}</span>
			<span class="meta-item">
				{node.createdAt instanceof Date ? node.createdAt.toLocaleDateString() : ''}
			</span>
			<button class="edit-btn" onclick={() => onEdit(node.id)}>Edit</button>
		</div>
	</div>

	<!-- Body -->
	<div class="doc-body">
		{#if bodyText}
			<WikiRenderer content={bodyText} nodes={allNodes} {onNavigate} />
		{:else}
			<p class="empty-body">No content yet.</p>
		{/if}
	</div>

	<!-- Sidebar sections -->
	<div class="doc-sidebar">
		{#if children.length > 0}
			<div class="sidebar-section">
				<h3 class="sidebar-title">Children ({children.length})</h3>
				{#each children as child}
					{@const cfg = getNodeTypeConfig(child.type)}
					<button class="sidebar-link" onclick={() => onNavigate(child.id)}>
						<span class="link-dot" style:background={cfg.badge}></span>
						{child.title}
					</button>
				{/each}
			</div>
		{/if}

		{#if backlinks.length > 0}
			<div class="sidebar-section">
				<h3 class="sidebar-title">Backlinks ({backlinks.length})</h3>
				{#each backlinks as bl}
					{@const cfg = getNodeTypeConfig(bl.type)}
					<button class="sidebar-link" onclick={() => onNavigate(bl.id)}>
						<span class="link-dot" style:background={cfg.badge}></span>
						{bl.title}
					</button>
				{/each}
			</div>
		{/if}

		{#if related.length > 0}
			<div class="sidebar-section">
				<h3 class="sidebar-title">Related ({related.length})</h3>
				{#each related as rel}
					{@const cfg = getNodeTypeConfig(rel.type)}
					<button class="sidebar-link" onclick={() => onNavigate(rel.id)}>
						<span class="link-dot" style:background={cfg.badge}></span>
						{rel.title}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.doc-page {
		padding: 20px 24px;
		max-width: 800px;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 16px;
		font-size: 11px;
	}

	.breadcrumb-link {
		color: #6366f1;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-size: 11px;
		font-family: inherit;
	}

	.breadcrumb-link:hover {
		text-decoration: underline;
	}

	.breadcrumb-sep {
		color: #333;
	}

	.breadcrumb-current {
		color: #737373;
	}

	.doc-header {
		margin-bottom: 20px;
	}

	.type-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 6px;
		border-radius: 3px;
		color: #fff;
		display: inline-block;
		margin-bottom: 8px;
	}

	.doc-title {
		font-size: 22px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 0 0 8px;
		line-height: 1.3;
	}

	.doc-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		color: #525252;
	}

	.status-badge {
		padding: 2px 8px;
		border-radius: 10px;
		border: 1px solid #333;
		text-transform: capitalize;
	}

	.status-badge.active {
		color: #22c55e;
		border-color: #22c55e40;
	}

	.status-badge.done {
		color: #6366f1;
		border-color: #6366f140;
	}

	.meta-item {
		color: #404040;
	}

	.edit-btn {
		margin-left: auto;
		background: none;
		border: 1px solid #333;
		border-radius: 4px;
		color: #737373;
		font-size: 11px;
		padding: 3px 10px;
		cursor: pointer;
	}

	.edit-btn:hover {
		color: #a3a3a3;
		border-color: #525252;
	}

	.doc-body {
		margin-bottom: 24px;
		padding-bottom: 24px;
		border-bottom: 1px solid #1a1a1a;
	}

	.empty-body {
		color: #404040;
		font-style: italic;
		font-size: 13px;
	}

	.doc-sidebar {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sidebar-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sidebar-title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #525252;
		margin: 0 0 4px;
	}

	.sidebar-link {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: #a3a3a3;
		font-size: 12px;
		padding: 3px 0;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
	}

	.sidebar-link:hover {
		color: #e5e5e5;
	}

	.link-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
