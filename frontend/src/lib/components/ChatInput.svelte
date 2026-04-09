<script lang="ts">
	interface Props {
		value: string;
		sending?: boolean;
		placeholder?: string;
		onSend: () => void;
	}

	let {
		value = $bindable(),
		sending = false,
		placeholder = 'Type a message...',
		onSend
	}: Props = $props();

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onSend();
		}
	}
</script>

<div class="chat-input-area">
	<textarea
		class="chat-input"
		{placeholder}
		bind:value
		onkeydown={handleKeyDown}
		disabled={sending}
		rows="2"
	></textarea>
	<button class="chat-send" onclick={onSend} disabled={sending || !value.trim()}>
		{sending ? '...' : 'Send'}
	</button>
</div>

<style>
	.chat-input-area {
		display: flex;
		gap: 6px;
		padding: 12px 16px;
		border-top: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.chat-input {
		flex: 1;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #d4d4d4;
		font-size: 13px;
		padding: 8px 10px;
		resize: none;
		outline: none;
		font-family: inherit;
		line-height: 1.4;
	}

	.chat-input::placeholder {
		color: #333;
	}

	.chat-input:focus {
		border-color: #3a3a3a;
	}

	.chat-send {
		background: #1f1f3a;
		border: 1px solid #2a2a4a;
		border-radius: 6px;
		color: #818cf8;
		font-size: 12px;
		padding: 4px 12px;
		cursor: pointer;
		align-self: flex-end;
	}

	.chat-send:hover:not(:disabled) {
		background: #2a2a4a;
	}

	.chat-send:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
