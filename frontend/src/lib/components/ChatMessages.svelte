<script lang="ts">
	import { renderMarkdown, firstLine, type ChatHistoryEntry } from '$lib/utils/chat-helpers';
	import ProposalReview from './ProposalReview.svelte';

	interface Props {
		chatHistory: ChatHistoryEntry[];
		sending: boolean;
		contextNodeId?: string;
		emptyText?: string;
		emptyHint?: string;
	}

	let {
		chatHistory,
		sending,
		contextNodeId,
		emptyText = 'Start a conversation.',
		emptyHint
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();

	// Collapse management
	let manualCollapse = $state<Map<number, boolean>>(new Map());

	function toggleCollapse(idx: number) {
		const next = new Map(manualCollapse);
		const current = next.get(idx);
		next.set(idx, current === undefined ? true : !current);
		manualCollapse = next;
	}

	function isCollapsed(idx: number, total: number): boolean {
		const manual = manualCollapse.get(idx);
		if (manual !== undefined) return manual;
		return idx < total - 2;
	}

	// Auto-scroll on new messages
	$effect(() => {
		if ((chatHistory.length || sending) && container) {
			requestAnimationFrame(() => {
				container!.scrollTop = container!.scrollHeight;
			});
		}
	});
</script>

<div class="chat-messages" bind:this={container}>
	{#if chatHistory.length === 0}
		<div class="chat-empty">
			<p>{emptyText}</p>
			{#if emptyHint}
				<p class="chat-empty-hint">{emptyHint}</p>
			{/if}
		</div>
	{/if}

	{#each chatHistory as msg, idx}
		{@const collapsed = isCollapsed(idx, chatHistory.length)}
		<div
			class="chat-msg"
			class:user={msg.role === 'user'}
			class:assistant={msg.role === 'assistant'}
			class:collapsed
		>
			<button class="msg-toggle" onclick={() => toggleCollapse(idx)}>
				<span class="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
				{#if collapsed}
					<span class="msg-preview">{firstLine(msg.content)}</span>
				{/if}
				<span class="collapse-indicator">{collapsed ? '+' : '−'}</span>
			</button>
			{#if !collapsed}
				{#if msg.role === 'user'}
					<div class="msg-content">{msg.content}</div>
				{:else}
					<div class="msg-content markdown-body">{@html renderMarkdown(msg.content)}</div>
				{/if}
				{#if msg.proposals?.length}
					<ProposalReview proposals={msg.proposals} {contextNodeId} />
				{/if}
			{/if}
		</div>
	{/each}

	{#if sending}
		<div class="chat-msg assistant">
			<button class="msg-toggle" disabled>
				<span class="msg-role">AI</span>
			</button>
			<div class="msg-content thinking">Thinking...</div>
		</div>
	{/if}
</div>

<style>
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.chat-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
	}

	.chat-empty p {
		font-size: 13px;
		color: #404040;
	}

	.chat-empty-hint {
		font-size: 11px !important;
		color: #2a2a2a !important;
		margin-top: 4px;
	}

	.chat-msg {
		display: flex;
		flex-direction: column;
	}

	.msg-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 4px;
		transition: background 0.1s;
	}

	.msg-toggle:hover {
		background: #1a1a1a;
	}

	.msg-toggle:disabled {
		cursor: default;
	}

	.msg-role {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #404040;
		flex-shrink: 0;
		width: 20px;
	}

	.msg-preview {
		font-size: 11px;
		color: #525252;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.collapse-indicator {
		font-size: 11px;
		color: #404040;
		flex-shrink: 0;
		width: 12px;
		text-align: center;
	}

	.msg-content {
		font-size: 13px;
		line-height: 1.6;
		color: #a3a3a3;
		word-break: break-word;
		padding: 4px 8px 8px;
	}

	.chat-msg.user .msg-content {
		color: #93c5fd;
	}

	/* Markdown styles */
	.msg-content.markdown-body :global(p) {
		margin: 0 0 8px;
	}
	.msg-content.markdown-body :global(p:last-child) {
		margin-bottom: 0;
	}
	.msg-content.markdown-body :global(ul),
	.msg-content.markdown-body :global(ol) {
		margin: 4px 0;
		padding-left: 20px;
	}
	.msg-content.markdown-body :global(li) {
		margin: 2px 0;
	}
	.msg-content.markdown-body :global(code) {
		background: #1a1a1a;
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 12px;
		color: #e5e5e5;
	}
	.msg-content.markdown-body :global(pre) {
		background: #111;
		border: 1px solid #262626;
		border-radius: 6px;
		padding: 8px;
		overflow-x: auto;
		margin: 6px 0;
	}
	.msg-content.markdown-body :global(pre code) {
		background: none;
		padding: 0;
	}
	.msg-content.markdown-body :global(strong) {
		color: #e5e5e5;
		font-weight: 600;
	}
	.msg-content.markdown-body :global(h1),
	.msg-content.markdown-body :global(h2),
	.msg-content.markdown-body :global(h3) {
		color: #e5e5e5;
		margin: 8px 0 4px;
		font-size: 13px;
		font-weight: 600;
	}
	.msg-content.markdown-body :global(blockquote) {
		border-left: 2px solid #333;
		padding-left: 8px;
		margin: 6px 0;
		color: #737373;
	}
	.msg-content.markdown-body :global(hr) {
		border: none;
		border-top: 1px solid #262626;
		margin: 8px 0;
	}

	.thinking {
		color: #525252;
		font-style: italic;
	}
</style>
