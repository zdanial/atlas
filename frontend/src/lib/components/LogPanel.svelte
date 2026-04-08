<script lang="ts">
	import { getLogEntries, clearLog, type LogEntry } from '$lib/stores/log.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let entries = $derived(getLogEntries());
	let filterLevel = $state<'all' | 'info' | 'success' | 'warn' | 'error'>('all');
	let filterSource = $state('');

	let filtered = $derived(
		entries.filter((e) => {
			if (filterLevel !== 'all' && e.level !== filterLevel) return false;
			if (filterSource && !e.source.includes(filterSource)) return false;
			return true;
		})
	);

	function levelColor(level: LogEntry['level']): string {
		switch (level) {
			case 'success':
				return '#22c55e';
			case 'warn':
				return '#eab308';
			case 'error':
				return '#ef4444';
			default:
				return '#737373';
		}
	}

	function levelIcon(level: LogEntry['level']): string {
		switch (level) {
			case 'success':
				return '✓';
			case 'warn':
				return '⚠';
			case 'error':
				return '✕';
			default:
				return '·';
		}
	}

	function formatTime(d: Date): string {
		return d.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	let expandedId = $state<string | null>(null);
</script>

<div class="log-panel">
	<div class="log-header">
		<span class="log-title">Activity Log</span>
		<div class="log-controls">
			<select bind:value={filterLevel} class="level-filter">
				<option value="all">All</option>
				<option value="info">Info</option>
				<option value="success">Success</option>
				<option value="warn">Warn</option>
				<option value="error">Error</option>
			</select>
			<input class="source-filter" placeholder="source…" bind:value={filterSource} />
			<button class="clear-btn" onclick={() => clearLog()} title="Clear log">Clear</button>
			<button class="close-btn" onclick={onClose}>×</button>
		</div>
	</div>

	<div class="log-body">
		{#if filtered.length === 0}
			<div class="log-empty">
				No entries{filterLevel !== 'all' || filterSource ? ' matching filters' : ''}
			</div>
		{:else}
			{#each filtered as entry (entry.id)}
				<div
					class="log-entry"
					class:has-detail={!!entry.detail}
					onclick={() => (expandedId = expandedId === entry.id ? null : entry.id)}
				>
					<span class="entry-icon" style:color={levelColor(entry.level)}
						>{levelIcon(entry.level)}</span
					>
					<span class="entry-time">{formatTime(entry.timestamp)}</span>
					<span class="entry-source">{entry.source}</span>
					<span class="entry-message">{entry.message}</span>
					{#if entry.detail}
						<span class="entry-expand">{expandedId === entry.id ? '▲' : '▼'}</span>
					{/if}
				</div>
				{#if expandedId === entry.id && entry.detail}
					<div class="entry-detail">{entry.detail}</div>
				{/if}
			{/each}
		{/if}
	</div>

	<div class="log-footer">
		{filtered.length} / {entries.length} entries
	</div>
</div>

<style>
	.log-panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 240px;
		background: #0a0a0a;
		border-top: 1px solid #262626;
		display: flex;
		flex-direction: column;
		z-index: 5000;
		font-family: 'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace;
	}

	.log-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.log-title {
		font-size: 11px;
		font-weight: 600;
		color: #737373;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex: 1;
	}

	.log-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.level-filter,
	.source-filter {
		background: #141414;
		border: 1px solid #262626;
		color: #a3a3a3;
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		outline: none;
	}

	.source-filter {
		width: 80px;
	}

	.level-filter:focus,
	.source-filter:focus {
		border-color: #404040;
	}

	.clear-btn {
		background: none;
		border: 1px solid #262626;
		color: #525252;
		font-size: 10px;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: pointer;
	}

	.clear-btn:hover {
		color: #a3a3a3;
		border-color: #404040;
	}

	.close-btn {
		background: none;
		border: none;
		color: #525252;
		font-size: 16px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	.close-btn:hover {
		color: #a3a3a3;
	}

	.log-body {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.log-empty {
		padding: 24px;
		text-align: center;
		font-size: 11px;
		color: #404040;
	}

	.log-entry {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 2px 12px;
		font-size: 11px;
		line-height: 1.6;
		border-bottom: 1px solid #0f0f0f;
		cursor: default;
	}

	.log-entry.has-detail {
		cursor: pointer;
	}

	.log-entry.has-detail:hover {
		background: #111111;
	}

	.entry-icon {
		font-size: 10px;
		flex-shrink: 0;
		width: 10px;
		text-align: center;
	}

	.entry-time {
		color: #404040;
		flex-shrink: 0;
		font-size: 10px;
	}

	.entry-source {
		color: #525252;
		flex-shrink: 0;
		min-width: 70px;
		font-size: 10px;
	}

	.entry-message {
		color: #a3a3a3;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entry-expand {
		color: #404040;
		font-size: 8px;
		flex-shrink: 0;
	}

	.entry-detail {
		padding: 4px 12px 8px 46px;
		font-size: 10px;
		color: #525252;
		white-space: pre-wrap;
		word-break: break-all;
		background: #0d0d0d;
		border-bottom: 1px solid #1a1a1a;
	}

	.log-footer {
		padding: 3px 12px;
		font-size: 10px;
		color: #404040;
		border-top: 1px solid #1a1a1a;
		flex-shrink: 0;
	}
</style>
