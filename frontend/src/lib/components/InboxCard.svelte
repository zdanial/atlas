<script lang="ts">
	import ProposalPanel from './ProposalPanel.svelte';
	import { removeInboxItem, type InboxItem } from '$lib/stores/inboxStore.svelte';
	import { getNode } from '$lib/stores/nodes.svelte';
	import { extractBodyText } from '$lib/node-types';

	interface Props {
		item: InboxItem;
		onAccepted: (itemId: string) => void;
		onRejected: (itemId: string) => void;
	}

	let { item, onAccepted, onRejected }: Props = $props();

	let expanded = $state(false);

	let sourceNode = $derived(getNode(item.sourceNodeId));
	let sourceBody = $derived(sourceNode ? extractBodyText(sourceNode.body, 200) : '');

	let proposalCount = $derived(item.proposals.length);

	function relativeTime(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(ms / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	async function handleApplied() {
		await removeInboxItem(item.id);
		onAccepted(item.id);
	}

	async function handleDismissed() {
		await removeInboxItem(item.id);
		onRejected(item.id);
	}
</script>

<div class="inbox-card" class:expanded>
	<!-- Collapsed header — always visible -->
	<button class="card-header" onclick={() => (expanded = !expanded)}>
		<span
			class="origin-badge"
			class:manual={item.origin === 'manual'}
			class:ai={item.origin === 'llm-suggested'}
		>
			{item.origin === 'manual' ? 'Manual' : 'AI'}
		</span>
		<span class="source-title">{item.sourceTitle}</span>
		<span class="item-count">{proposalCount} item{proposalCount === 1 ? '' : 's'}</span>
		<span class="timestamp">{relativeTime(item.createdAt)}</span>
		<span class="chevron">{expanded ? '▼' : '▶'}</span>
	</button>

	<!-- Expanded body -->
	{#if expanded}
		<div class="card-body">
			{#if sourceBody}
				<div class="source-context">
					<span class="context-label">Source note:</span>
					<p class="context-text">{sourceBody}</p>
				</div>
			{/if}

			<ProposalPanel
				proposals={item.proposals}
				contextNodeId={item.sourceNodeId}
				onApplied={handleApplied}
				onDismiss={handleDismissed}
			/>
		</div>
	{/if}
</div>

<style>
	.inbox-card {
		background: #141414;
		border: 1px solid #1f1f1f;
		border-radius: 8px;
		overflow: hidden;
		transition: border-color 0.15s;
	}

	.inbox-card:hover {
		border-color: #2a2a2a;
	}

	.inbox-card.expanded {
		border-color: #333;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 12px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: #a3a3a3;
	}

	.card-header:hover {
		background: #1a1a1a;
	}

	.origin-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 6px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.origin-badge.manual {
		background: #134e4a;
		color: #5eead4;
	}

	.origin-badge.ai {
		background: #1e3a5f;
		color: #93c5fd;
	}

	.source-title {
		font-size: 12px;
		color: #d4d4d4;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-count {
		font-size: 10px;
		color: #525252;
		flex-shrink: 0;
	}

	.timestamp {
		font-size: 10px;
		color: #404040;
		flex-shrink: 0;
	}

	.chevron {
		font-size: 8px;
		color: #525252;
		flex-shrink: 0;
		width: 12px;
		text-align: center;
	}

	.card-body {
		border-top: 1px solid #1f1f1f;
		padding: 12px;
	}

	.source-context {
		margin-bottom: 12px;
		padding: 8px 10px;
		background: #0d0d0d;
		border-radius: 6px;
		border: 1px solid #1a1a1a;
	}

	.context-label {
		font-size: 10px;
		font-weight: 600;
		color: #525252;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.context-text {
		font-size: 12px;
		color: #737373;
		line-height: 1.5;
		margin: 4px 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
