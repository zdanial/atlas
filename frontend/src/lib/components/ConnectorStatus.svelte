<script lang="ts">
	import {
		getQueue,
		getActiveNodeId,
		getRecentResults,
		getPendingSuggestions,
		isConnectorRunning,
		clearSuggestion
	} from '$lib/agents/connector.svelte';
	import { getNodeTypeConfig } from '$lib/node-types';
	import type { InferredRelation } from '$lib/services/edge-inference';

	interface Props {
		onAcceptEdge?: (sourceId: string, targetId: string, relationType: string) => void;
		onDismissEdge?: (sourceId: string, targetId: string) => void;
	}

	let { onAcceptEdge, onDismissEdge }: Props = $props();

	let showSuggestions = $state(false);

	let running = $derived(isConnectorRunning());
	let activeNode = $derived(getActiveNodeId());
	let queueLen = $derived(getQueue().length);
	let suggestions = $derived(getPendingSuggestions());
	let recent = $derived(getRecentResults());

	function handleAccept(s: InferredRelation) {
		onAcceptEdge?.(s.sourceId, s.targetId, s.relationType);
		clearSuggestion(s.sourceId, s.targetId);
	}

	function handleDismiss(s: InferredRelation) {
		onDismissEdge?.(s.sourceId, s.targetId);
		clearSuggestion(s.sourceId, s.targetId);
	}
</script>

{#if running}
	<div class="connector-status">
		{#if activeNode}
			<span class="status-indicator classifying"></span>
			<span class="status-text">Classifying...</span>
		{:else if queueLen > 0}
			<span class="status-indicator queued"></span>
			<span class="status-text">{queueLen} pending</span>
		{:else}
			<span class="status-indicator ready"></span>
			<span class="status-text">Ready</span>
		{/if}

		{#if suggestions.length > 0}
			<button class="suggestion-badge" onclick={() => (showSuggestions = !showSuggestions)}>
				{suggestions.length} edge{suggestions.length === 1 ? '' : 's'}
			</button>
		{/if}

		{#if recent.length > 0}
			{@const latest = recent[0]}
			{@const cfg = getNodeTypeConfig(latest.result.type)}
			<span class="recent-badge" style:background-color={cfg.badge} title={latest.result.reason}>
				{latest.result.type}
			</span>
		{/if}
	</div>
{/if}

{#if showSuggestions && suggestions.length > 0}
	<div class="suggestions-panel">
		<div class="suggestions-header">
			<span>Suggested Edges</span>
			<button class="close-btn" onclick={() => (showSuggestions = false)}>×</button>
		</div>
		{#each suggestions as suggestion}
			<div class="suggestion-row">
				<span
					class="rel-type"
					class:supports={suggestion.relationType === 'supports'}
					class:contradicts={suggestion.relationType === 'contradicts'}
					class:blocks={suggestion.relationType === 'blocks'}
					class:implements={suggestion.relationType === 'implements'}
					class:refines={suggestion.relationType === 'refines'}
					class:duplicates={suggestion.relationType === 'duplicates'}
				>
					{suggestion.relationType}
				</span>
				<span class="suggestion-reason">{suggestion.reason}</span>
				<span class="confidence">{Math.round(suggestion.confidence * 100)}%</span>
				<button class="accept-btn" onclick={() => handleAccept(suggestion)} title="Accept">✓</button
				>
				<button class="dismiss-btn" onclick={() => handleDismiss(suggestion)} title="Dismiss"
					>✕</button
				>
			</div>
		{/each}
	</div>
{/if}

<style>
	.connector-status {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.status-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-indicator.ready {
		background: #22c55e;
	}

	.status-indicator.queued {
		background: #eab308;
	}

	.status-indicator.classifying {
		background: #6366f1;
		animation: pulse 1s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.status-text {
		font-size: 10px;
		color: #525252;
	}

	.suggestion-badge {
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 8px;
		background: #1e3a5f;
		color: #60a5fa;
		border: 1px solid #2563eb33;
		cursor: pointer;
	}

	.suggestion-badge:hover {
		background: #1e40af33;
	}

	.recent-badge {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 4px;
		color: white;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.suggestions-panel {
		position: fixed;
		bottom: 12px;
		right: 12px;
		width: 340px;
		max-height: 300px;
		overflow-y: auto;
		background: #141414;
		border: 1px solid #262626;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		z-index: 4000;
	}

	.suggestions-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		border-bottom: 1px solid #262626;
		font-size: 11px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.close-btn {
		background: none;
		border: none;
		color: #525252;
		font-size: 16px;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.close-btn:hover {
		color: #a3a3a3;
	}

	.suggestion-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		font-size: 11px;
	}

	.rel-type {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.rel-type.supports {
		background: #22c55e22;
		color: #22c55e;
	}
	.rel-type.contradicts {
		background: #ef444422;
		color: #ef4444;
	}
	.rel-type.blocks {
		background: #f9731622;
		color: #f97316;
	}
	.rel-type.implements {
		background: #6366f122;
		color: #6366f1;
	}
	.rel-type.refines {
		background: #06b6d422;
		color: #06b6d4;
	}
	.rel-type.duplicates {
		background: #73737322;
		color: #737373;
	}

	.suggestion-reason {
		flex: 1;
		color: #737373;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.confidence {
		font-size: 10px;
		color: #525252;
		flex-shrink: 0;
	}

	.accept-btn,
	.dismiss-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 12px;
		padding: 2px;
		line-height: 1;
	}

	.accept-btn {
		color: #22c55e;
	}

	.accept-btn:hover {
		color: #4ade80;
	}

	.dismiss-btn {
		color: #525252;
	}

	.dismiss-btn:hover {
		color: #ef4444;
	}
</style>
