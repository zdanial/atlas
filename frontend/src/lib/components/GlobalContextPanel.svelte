<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getStructuredContext,
		setStructuredContext,
		setContextMode,
		updateSectionContent,
		setFreeformOverride,
		acceptSuggestion,
		dismissSuggestion
	} from '$lib/stores/globalContext.svelte';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import { scanForSuggestions } from '$lib/context-compiler';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let ctx = $derived(getStructuredContext());
	let mode = $derived(ctx.mode);

	// Scan for suggestions once on mount (not in $effect to avoid infinite loop)
	onMount(() => {
		if (getStructuredContext().mode === 'structured') {
			const allNodes = getProjectNodes();
			const updated = scanForSuggestions(allNodes, getStructuredContext());
			setStructuredContext(updated);
		}
	});

	let expandedSections = $state<Set<string>>(new Set(['goals', 'constraints']));

	function toggleSection(id: string) {
		const next = new Set(expandedSections);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedSections = next;
	}

	function handleModeSwitch(newMode: 'structured' | 'freeform') {
		setContextMode(newMode);
	}

	function handleSectionInput(sectionId: string, value: string) {
		updateSectionContent(sectionId, value);
	}

	function handleFreeformInput(value: string) {
		setFreeformOverride(value);
	}

	function handleAcceptSuggestion(sectionId: string, sourceNodeId: string) {
		acceptSuggestion(sectionId, sourceNodeId);
	}

	function handleDismissSuggestion(sectionId: string, sourceNodeId: string) {
		dismissSuggestion(sectionId, sourceNodeId);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="context-panel">
	<div class="context-header">
		<span class="context-title">Global Context</span>
		<span class="context-hint">Passed to every AI call as background</span>
		<div class="mode-tabs">
			<button
				class="mode-tab"
				class:active={mode === 'structured'}
				onclick={() => handleModeSwitch('structured')}
			>
				Structured
			</button>
			<button
				class="mode-tab"
				class:active={mode === 'freeform'}
				onclick={() => handleModeSwitch('freeform')}
			>
				Freeform
			</button>
		</div>
		<button class="context-close" onclick={onClose}>Save & close</button>
	</div>

	{#if mode === 'freeform'}
		<textarea
			class="context-freeform"
			placeholder="Describe your project, goals, constraints, key decisions... This is sent as background context to every AI call."
			value={ctx.freeformOverride}
			oninput={(e) => handleFreeformInput(e.currentTarget.value)}
		></textarea>
	{:else}
		<div class="sections-list">
			{#each ctx.sections as section}
				{@const pendingSuggestions = section.autoSuggestions.filter(
					(s) => !s.accepted && !s.dismissed
				)}
				<div class="section-item" class:has-suggestions={pendingSuggestions.length > 0}>
					<button class="section-header" onclick={() => toggleSection(section.id)}>
						<span class="section-chevron">{expandedSections.has(section.id) ? '▾' : '▸'}</span>
						<span class="section-label">{section.label}</span>
						{#if pendingSuggestions.length > 0}
							<span class="suggestion-badge">{pendingSuggestions.length}</span>
						{/if}
						{#if section.content.trim()}
							<span class="section-filled">●</span>
						{/if}
					</button>

					{#if expandedSections.has(section.id)}
						<div class="section-body">
							<textarea
								class="section-textarea"
								placeholder="Add {section.label.toLowerCase()}..."
								value={section.content}
								oninput={(e) => handleSectionInput(section.id, e.currentTarget.value)}
								rows={Math.max(2, section.content.split('\n').length)}
							></textarea>

							{#if pendingSuggestions.length > 0}
								<div class="suggestions-area">
									{#each pendingSuggestions as suggestion}
										{@const cfg = getNodeTypeConfig(suggestion.sourceType)}
										<div class="suggestion-item">
											<div class="suggestion-source">
												<span class="suggestion-type-badge" style:background={cfg.badge}>
													{cfg.label}
												</span>
												<span class="suggestion-title">{suggestion.sourceTitle}</span>
											</div>
											<div class="suggestion-snippet">{suggestion.snippet}</div>
											<div class="suggestion-actions">
												<button
													class="sug-btn accept"
													onclick={() =>
														handleAcceptSuggestion(section.id, suggestion.sourceNodeId)}
												>
													Accept
												</button>
												<button
													class="sug-btn dismiss"
													onclick={() =>
														handleDismissSuggestion(section.id, suggestion.sourceNodeId)}
												>
													Dismiss
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							{#if section.autoSuggestions.filter((s) => s.accepted).length > 0}
								<div class="accepted-list">
									{#each section.autoSuggestions.filter((s) => s.accepted) as accepted}
										<div class="accepted-item">
											<span class="accepted-check">✓</span>
											<span class="accepted-text">{accepted.snippet}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.context-panel {
		position: fixed;
		top: 80px;
		right: 16px;
		width: 420px;
		max-height: calc(100vh - 100px);
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		z-index: 4000;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}

	.context-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid #1f1f1f;
		flex-shrink: 0;
	}

	.context-title {
		font-size: 13px;
		font-weight: 600;
		color: #e5e5e5;
	}

	.context-hint {
		font-size: 10px;
		color: #525252;
		flex: 1;
	}

	.mode-tabs {
		display: flex;
		gap: 2px;
		background: #0a0a0a;
		border-radius: 4px;
		padding: 2px;
	}

	.mode-tab {
		font-size: 10px;
		padding: 3px 8px;
		border: none;
		border-radius: 3px;
		background: transparent;
		color: #525252;
		cursor: pointer;
	}

	.mode-tab.active {
		background: #1f1f1f;
		color: #d4d4d4;
	}

	.context-close {
		font-size: 11px;
		padding: 4px 10px;
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		background: none;
		color: #737373;
		cursor: pointer;
	}

	.context-close:hover {
		border-color: #3a3a3a;
		color: #a3a3a3;
	}

	.context-freeform {
		flex: 1;
		min-height: 200px;
		max-height: 60vh;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: #a3a3a3;
		font-size: 12px;
		font-family: inherit;
		line-height: 1.6;
		resize: none;
		outline: none;
	}

	.context-freeform::placeholder {
		color: #333;
	}

	.sections-list {
		overflow-y: auto;
		max-height: 60vh;
		padding: 8px 0;
	}

	.section-item {
		border-bottom: 1px solid #1a1a1a;
	}

	.section-item:last-child {
		border-bottom: none;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 8px 16px;
		background: none;
		border: none;
		color: #a3a3a3;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
	}

	.section-header:hover {
		background: rgba(255, 255, 255, 0.02);
	}

	.section-chevron {
		font-size: 10px;
		color: #525252;
		width: 12px;
		flex-shrink: 0;
	}

	.section-label {
		flex: 1;
	}

	.suggestion-badge {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 8px;
		background: #1a2a3a;
		color: #60a5fa;
		font-weight: 600;
	}

	.section-filled {
		font-size: 6px;
		color: #22c55e;
	}

	.section-body {
		padding: 0 16px 12px;
	}

	.section-textarea {
		width: 100%;
		min-height: 48px;
		padding: 8px 10px;
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 6px;
		color: #a3a3a3;
		font-size: 12px;
		font-family: inherit;
		line-height: 1.5;
		resize: vertical;
		outline: none;
	}

	.section-textarea:focus {
		border-color: #333;
	}

	.section-textarea::placeholder {
		color: #333;
	}

	.suggestions-area {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.suggestion-item {
		background: #0f1520;
		border: 1px solid #1a2a3a;
		border-radius: 6px;
		padding: 8px 10px;
	}

	.suggestion-source {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.suggestion-type-badge {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 4px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
	}

	.suggestion-title {
		font-size: 11px;
		color: #8ba3bf;
	}

	.suggestion-snippet {
		font-size: 11px;
		color: #60a5fa;
		margin-bottom: 6px;
		line-height: 1.4;
	}

	.suggestion-actions {
		display: flex;
		gap: 6px;
	}

	.sug-btn {
		font-size: 10px;
		padding: 2px 8px;
		border-radius: 3px;
		border: none;
		cursor: pointer;
		font-weight: 500;
	}

	.sug-btn.accept {
		background: #14532d;
		color: #4ade80;
	}

	.sug-btn.accept:hover {
		background: #166534;
	}

	.sug-btn.dismiss {
		background: #1f1f1f;
		color: #737373;
	}

	.sug-btn.dismiss:hover {
		background: #2a2a2a;
		color: #a3a3a3;
	}

	.accepted-list {
		margin-top: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.accepted-item {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 11px;
		color: #525252;
		padding: 2px 0;
	}

	.accepted-check {
		color: #22c55e;
		font-size: 10px;
		flex-shrink: 0;
	}

	.accepted-text {
		line-height: 1.4;
	}
</style>
