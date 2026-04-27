<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { promoteNote, getPromoteTargets, getValidParentTypes } from '$lib/promote';
	import HierarchyTreePicker from './HierarchyTreePicker.svelte';

	interface Props {
		/** The note(s) to promote */
		notes: Node[];
		projectId: string;
		onClose: () => void;
		/** Called after successful promotion with the new node */
		onPromoted?: (newNode: Node) => void;
	}

	let { notes, projectId, onClose, onPromoted }: Props = $props();

	const targets = getPromoteTargets();
	let selectedType = $state(targets[0].type);
	let selectedParentId = $state<string | null>(null);
	let archiveSource = $state(false);
	let promoting = $state(false);
	let error = $state('');

	let validParentTypes = $derived(getValidParentTypes(selectedType));
	let sourceNote = $derived(notes[0]);
	let sourceCfg = $derived(getNodeTypeConfig(sourceNote.type));
	let targetCfg = $derived(getNodeTypeConfig(selectedType));

	async function handlePromote() {
		if (promoting || !sourceNote) return;
		promoting = true;
		error = '';

		try {
			const newNode = await promoteNote({
				note: sourceNote,
				targetType: selectedType,
				parentId: selectedParentId,
				archiveSource
			});
			onPromoted?.(newNode);
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			promoting = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="promote-overlay" onclick={onClose}>
	<div class="promote-dialog" onclick={(e) => e.stopPropagation()}>
		<div class="promote-header">
			<h3 class="promote-title">Promote to Plan</h3>
			<button class="promote-close" onclick={onClose} type="button">✕</button>
		</div>

		<!-- Source note info -->
		<div class="promote-source">
			<span class="source-badge" style:background={sourceCfg.badge}>{sourceCfg.label}</span>
			<span class="source-title">{sourceNote.title}</span>
		</div>

		<!-- Target type selector -->
		<div class="promote-section">
			<label class="section-label">Promote to</label>
			<div class="type-grid">
				{#each targets as target}
					{@const cfg = getNodeTypeConfig(target.type)}
					<button
						class="type-option"
						class:selected={selectedType === target.type}
						onclick={() => (selectedType = target.type)}
						type="button"
					>
						<span class="type-badge-sm" style:background={cfg.badge}>{cfg.label}</span>
						<span class="type-layer">L{target.layer}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Parent picker -->
		<div class="promote-section">
			<label class="section-label">Place under</label>
			<HierarchyTreePicker
				selectedId={selectedParentId}
				onSelect={(id) => (selectedParentId = id)}
				{validParentTypes}
			/>
		</div>

		<!-- Archive option -->
		<label class="archive-option">
			<input type="checkbox" bind:checked={archiveSource} />
			<span>Archive source note after promoting</span>
		</label>

		{#if error}
			<div class="promote-error">{error}</div>
		{/if}

		<!-- Actions -->
		<div class="promote-actions">
			<button class="btn-cancel" onclick={onClose} type="button">Cancel</button>
			<button class="btn-create" onclick={handlePromote} disabled={promoting} type="button">
				{#if promoting}
					Creating...
				{:else}
					Create {targetCfg.label}
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.promote-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 5000;
	}

	.promote-dialog {
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		width: 440px;
		max-height: 80vh;
		overflow-y: auto;
		padding: 20px;
	}

	.promote-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.promote-title {
		font-size: 15px;
		font-weight: 600;
		color: #e5e5e5;
		margin: 0;
	}

	.promote-close {
		background: none;
		border: none;
		color: #525252;
		cursor: pointer;
		font-size: 14px;
		padding: 4px;
	}

	.promote-close:hover {
		color: #a3a3a3;
	}

	.promote-source {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #0f0f0f;
		border: 1px solid #1f1f1f;
		border-radius: 6px;
		margin-bottom: 16px;
	}

	.source-badge {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	.source-title {
		font-size: 12px;
		color: #a3a3a3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.promote-section {
		margin-bottom: 14px;
	}

	.section-label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: #737373;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.type-grid {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.type-option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		background: #0f0f0f;
		color: #a3a3a3;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.type-option:hover {
		border-color: #3a3a3a;
		background: #1a1a1a;
	}

	.type-option.selected {
		border-color: #6366f1;
		background: #1e1b4b;
		color: #c7d2fe;
	}

	.type-badge-sm {
		font-size: 8px;
		font-weight: 600;
		padding: 1px 4px;
		border-radius: 3px;
		color: #000;
		text-transform: uppercase;
	}

	.type-layer {
		font-size: 10px;
		color: #525252;
	}

	.archive-option {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #737373;
		cursor: pointer;
		margin-bottom: 14px;
		padding: 0 4px;
	}

	.archive-option input {
		accent-color: #6366f1;
	}

	.promote-error {
		font-size: 11px;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 6px 10px;
		border-radius: 4px;
		margin-bottom: 14px;
	}

	.promote-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid #1f1f1f;
	}

	.btn-cancel {
		padding: 6px 14px;
		background: none;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #737373;
		font-size: 12px;
		cursor: pointer;
	}

	.btn-cancel:hover {
		border-color: #3a3a3a;
		color: #a3a3a3;
	}

	.btn-create {
		padding: 6px 16px;
		background: #6366f1;
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-create:hover:not(:disabled) {
		background: #7c7ff7;
	}

	.btn-create:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
