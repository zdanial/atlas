<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { isDrillable } from '$lib/stores/planningNav.svelte';

	interface Props {
		parentNode: Node;
		children: Node[];
		allNodes: Node[];
		position: { x: number; y: number };
		onHoverChild?: (node: Node, position: { x: number; y: number }) => void;
		onLeaveChild?: () => void;
		onClickNode?: (id: string) => void;
		onClose: () => void;
	}

	let {
		parentNode,
		children,
		allNodes,
		position,
		onHoverChild,
		onLeaveChild,
		onClickNode,
		onClose
	}: Props = $props();

	let isHovered = $state(false);
	let closeTimeout: ReturnType<typeof setTimeout> | null = null;

	function getChildCount(nodeId: string): number {
		return allNodes.filter((n) => n.parentId === nodeId).length;
	}

	function handleMouseEnter() {
		isHovered = true;
		if (closeTimeout) {
			clearTimeout(closeTimeout);
			closeTimeout = null;
		}
	}

	function handleMouseLeave() {
		isHovered = false;
		closeTimeout = setTimeout(() => {
			onClose();
		}, 200);
	}

	function handleChildHover(child: Node, e: MouseEvent) {
		if (isDrillable(child.type) && getChildCount(child.id) > 0) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			onHoverChild?.(child, { x: rect.right + 4, y: rect.top });
		}
	}

	function handleChildLeave() {
		onLeaveChild?.();
	}

	let parentCfg = $derived(getNodeTypeConfig(parentNode.type));

	// Clamp position to viewport
	let style = $derived(
		`left: ${Math.min(position.x, window.innerWidth - 260)}px; top: ${Math.min(position.y, window.innerHeight - 300)}px`
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="popover" {style} onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave}>
	<div class="popover-header">
		<span class="popover-dot" style:background={parentCfg.badge}></span>
		<span class="popover-title">{parentNode.title}</span>
		<span class="popover-count">{children.length}</span>
	</div>
	<div class="popover-list">
		{#if children.length === 0}
			<div class="popover-empty">No children</div>
		{:else}
			{#each children as child (child.id)}
				{@const cfg = getNodeTypeConfig(child.type)}
				{@const childCount = getChildCount(child.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="popover-item"
					onclick={() => onClickNode?.(child.id)}
					onmouseenter={(e) => handleChildHover(child, e)}
					onmouseleave={handleChildLeave}
					role="button"
					tabindex="0"
				>
					<span class="item-dot" style:background={cfg.badge}></span>
					<span class="item-type">{cfg.label}</span>
					<span class="item-title">{child.title}</span>
					{#if childCount > 0}
						<span class="item-child-count">{childCount}</span>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.popover {
		position: fixed;
		z-index: 4000;
		width: 250px;
		max-height: 300px;
		background: #141414;
		border: 1px solid #333;
		border-radius: 8px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.popover-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-bottom: 1px solid #262626;
		background: #111;
	}

	.popover-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.popover-title {
		font-size: 11px;
		font-weight: 600;
		color: #d4d4d4;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.popover-count {
		font-size: 9px;
		color: #525252;
		background: #262626;
		padding: 0 5px;
		border-radius: 8px;
	}

	.popover-list {
		overflow-y: auto;
		flex: 1;
	}

	.popover-empty {
		padding: 12px;
		font-size: 11px;
		color: #404040;
		text-align: center;
	}

	.popover-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		cursor: pointer;
		transition: background 0.1s;
	}

	.popover-item:hover {
		background: #1a1a1a;
	}

	.item-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.item-type {
		font-size: 8px;
		text-transform: uppercase;
		color: #404040;
		flex-shrink: 0;
		letter-spacing: 0.03em;
	}

	.item-title {
		font-size: 11px;
		color: #a3a3a3;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-child-count {
		font-size: 9px;
		color: #404040;
		background: #1f1f1f;
		padding: 0 4px;
		border-radius: 6px;
		flex-shrink: 0;
	}
</style>
