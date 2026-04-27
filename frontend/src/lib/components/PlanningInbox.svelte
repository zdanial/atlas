<script lang="ts">
	import InboxCard from './InboxCard.svelte';
	import { getInboxItems } from '$lib/stores/inboxStore.svelte';

	interface Props {
		projectId: string;
		onClose: () => void;
	}

	let { projectId, onClose }: Props = $props();

	let items = $derived(getInboxItems(projectId));
</script>

<div class="planning-inbox">
	<div class="inbox-header">
		<span class="inbox-title">
			Inbox
			{#if items.length > 0}
				<span class="inbox-count">{items.length}</span>
			{/if}
		</span>
		<button class="inbox-close" onclick={onClose}>×</button>
	</div>

	<div class="inbox-body">
		{#if items.length === 0}
			<div class="inbox-empty">
				<p>No items pending.</p>
				<p class="inbox-empty-hint">Promote notes from Brainstorming to queue items here.</p>
			</div>
		{:else}
			<div class="inbox-list">
				{#each items as item (item.id)}
					<InboxCard {item} onAccepted={() => {}} onRejected={() => {}} />
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.planning-inbox {
		width: 380px;
		min-width: 380px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid #1a1a1a;
		background: #0a0a0a;
		height: 100%;
		overflow: hidden;
	}

	.inbox-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.inbox-title {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.inbox-count {
		font-size: 10px;
		font-weight: 700;
		background: #14b8a6;
		color: #000;
		padding: 1px 6px;
		border-radius: 10px;
		line-height: 1.4;
	}

	.inbox-close {
		background: none;
		border: none;
		color: #525252;
		font-size: 18px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	.inbox-close:hover {
		color: #a3a3a3;
	}

	.inbox-body {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.inbox-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 16px;
		text-align: center;
	}

	.inbox-empty p {
		font-size: 13px;
		color: #404040;
		margin: 0;
	}

	.inbox-empty-hint {
		margin-top: 8px;
		font-size: 11px;
		color: #333;
	}

	.inbox-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
