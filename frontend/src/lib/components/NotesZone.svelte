<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import RoadmapView from '$lib/components/RoadmapView.svelte';
	import BrainDumpDialog from '$lib/components/BrainDumpDialog.svelte';
	import CompactionPanel from '$lib/components/CompactionPanel.svelte';
	import ConnectorStatus from '$lib/components/ConnectorStatus.svelte';
	import NodeChatModal from '$lib/components/NodeChatModal.svelte';
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { tagColor } from '$lib/utils/chat-helpers';
	import {
		getProjectNodes,
		getAllEdges,
		createNode,
		updateNode,
		deleteNode,
		createEdge,
		getNode
	} from '$lib/stores/nodes.svelte';
	import { pushOperation, undo, redo, canUndo, canRedo } from '$lib/stores/history.svelte';
	import { debounceClassification } from '$lib/agents/connector.svelte';
	import { dismissEdge } from '$lib/services/edge-inference';

	import type { UpdateNodeInput } from '$lib/schemas/node';

	interface Props {
		projectId: string;
	}

	let { projectId }: Props = $props();

	type ViewMode = 'canvas' | 'kanban' | 'graph' | 'roadmap';

	let view = $state<ViewMode>('canvas');
	let gridSnap = $state(true);
	let selectedNodeIds = $state<Set<string>>(new Set());
	let showBrainDump = $state(false);
	let showCompact = $state(false);
	let openNodeId = $state<string | null>(null);
	let showContext = $state(false);
	let contextDraft = $state('');

	let openNode = $derived(openNodeId ? (getNode(openNodeId) ?? null) : null);
	let selectedTags = $state<Set<string>>(new Set());

	// Filter to L5 notes only (the "thinking" types)
	const NOTES_LAYER = 5;
	let allNodes = $derived(getProjectNodes());
	let allL5Nodes = $derived(allNodes.filter((n) => n.layer === NOTES_LAYER));
	let notesNodes = $derived.by(() => {
		if (selectedTags.size === 0) return allL5Nodes;
		return allL5Nodes.filter((n) => {
			const t = n.payload?.tags;
			if (!Array.isArray(t)) return false;
			return (t as string[]).some((tag) => selectedTags.has(tag));
		});
	});

	let allProjectTags = $derived.by(() => {
		const tagSet = new Set<string>();
		for (const n of allNodes) {
			const t = n.payload?.tags;
			if (Array.isArray(t)) {
				for (const tag of t) tagSet.add(tag as string);
			}
		}
		return Array.from(tagSet).sort();
	});

	function toggleTag(tag: string) {
		const next = new Set(selectedTags);
		if (next.has(tag)) next.delete(tag);
		else next.add(tag);
		selectedTags = next;
	}
	let projectEdges = $derived(getAllEdges());

	function handleOpenNode(id: string) {
		openNodeId = id;
	}

	async function handleCreateNote(x: number, y: number) {
		const node = await createNode({
			type: 'note',
			layer: NOTES_LAYER,
			projectId,
			title: 'Untitled',
			status: 'draft',
			positionX: x,
			positionY: y
		});
		pushOperation({ type: 'create_node', node });
	}

	async function handleAcceptEdge(sourceId: string, targetId: string, relationType: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType,
			source: 'ai'
		});
		pushOperation({ type: 'create_edge', edge });
	}

	function handleDismissEdge(sourceId: string, targetId: string) {
		dismissEdge(sourceId, targetId);
	}

	async function handleMoveNote(id: string, x: number, y: number) {
		await updateNode(id, { positionX: x, positionY: y });
	}

	async function handleUpdateNode(id: string, patch: Partial<Node>) {
		const existing = getNode(id);
		const allowed: UpdateNodeInput = {};
		if (patch.type !== undefined) allowed.type = patch.type as UpdateNodeInput['type'];
		if (patch.title !== undefined) allowed.title = patch.title;
		if (patch.body !== undefined) allowed.body = patch.body;
		if (patch.payload !== undefined) allowed.payload = patch.payload;
		if (patch.status !== undefined) allowed.status = patch.status as UpdateNodeInput['status'];
		if (patch.positionX !== undefined) allowed.positionX = patch.positionX;
		if (patch.positionY !== undefined) allowed.positionY = patch.positionY;
		if (patch.parentId !== undefined) allowed.parentId = patch.parentId;

		const before: Partial<Node> = {};
		if (existing) {
			const existingAny = existing as unknown as Record<string, unknown>;
			for (const key of Object.keys(allowed) as (keyof UpdateNodeInput)[]) {
				(before as Record<string, unknown>)[key] = existingAny[key];
			}
		}

		await updateNode(id, allowed);
		pushOperation({ type: 'update_node', id, before, after: allowed });

		if (allowed.title !== undefined || allowed.body !== undefined) {
			debounceClassification(id);
		}
	}

	async function handleDeleteNodes(ids: string[]) {
		const ops = [];
		for (const id of ids) {
			const node = getNode(id);
			if (node) {
				ops.push({ type: 'delete_node' as const, node });
				await deleteNode(id);
			}
		}
		if (ops.length > 0) {
			pushOperation(ops.length === 1 ? ops[0] : { type: 'batch', operations: ops });
		}
		selectedNodeIds = new Set();
	}

	async function handleCreateEdge(sourceId: string, targetId: string) {
		const edge = await createEdge({
			sourceId,
			targetId,
			relationType: 'supports',
			source: 'human'
		});
		pushOperation({ type: 'create_edge', edge });
	}

	async function handleCompaction(result: {
		title: string;
		body: string;
		tags: string[];
		sourceNodeIds: string[];
		archiveSources: boolean;
	}) {
		try {
			// Build a plain-JSON body (avoid non-cloneable objects for IndexedDB)
			const bodyDoc = JSON.parse(
				JSON.stringify({
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: result.body }] }]
				})
			);

			// Create the compacted summary note
			const summaryNode = await createNode({
				type: 'note',
				layer: NOTES_LAYER,
				projectId,
				title: result.title,
				body: bodyDoc,
				payload: { tags: Array.from(result.tags) },
				status: 'active',
				positionX: 200,
				positionY: 200
			});

			pushOperation({ type: 'create_node', node: summaryNode });

			// Link summary to source notes with "compacts" edges
			for (const sourceId of result.sourceNodeIds) {
				await createEdge({
					sourceId: summaryNode.id,
					targetId: sourceId,
					relationType: 'compacts',
					source: 'ai'
				});
			}

			// Optionally archive source notes
			if (result.archiveSources) {
				for (const sourceId of result.sourceNodeIds) {
					await updateNode(sourceId, { status: 'archived' });
				}
			}

			selectedNodeIds = new Set([summaryNode.id]);
			openNodeId = summaryNode.id;
			showCompact = false;
		} catch (e) {
			console.error('Compaction failed:', e);
			alert(`Compaction failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	function handleSelectNodes(ids: Set<string>) {
		selectedNodeIds = ids;
	}
</script>

<div class="notes-zone">
	<!-- Notes toolbar -->
	<div class="notes-toolbar">
		<span class="zone-title">Notes</span>
		<span class="separator">|</span>

		{#each ['canvas', 'kanban', 'graph', 'roadmap'] as v}
			<button class="tb-btn" class:active={view === v} onclick={() => (view = v as ViewMode)}>
				{v}
			</button>
		{/each}

		{#if view === 'canvas'}
			<span class="separator">|</span>
			<button class="tb-btn" class:active={gridSnap} onclick={() => (gridSnap = !gridSnap)}>
				Grid snap
			</button>
		{/if}

		<span class="separator">|</span>

		<button
			class="tb-btn"
			class:compact-active={showCompact}
			onclick={() => (showCompact = !showCompact)}
		>
			Compact
		</button>

		<button class="tb-btn" onclick={() => (showBrainDump = true)}> Import </button>

		{#if allProjectTags.length > 0}
			<span class="separator">|</span>
			<div class="tag-filters">
				{#each allProjectTags as tag}
					<button
						class="tag-filter-chip"
						class:active={selectedTags.has(tag)}
						style:--tag-color={tagColor(tag)}
						onclick={() => toggleTag(tag)}
					>
						<span class="tag-filter-dot"></span>
						{tag}
					</button>
				{/each}
			</div>
		{/if}

		<span class="separator">|</span>

		<ConnectorStatus onAcceptEdge={handleAcceptEdge} onDismissEdge={handleDismissEdge} />

		{#if selectedNodeIds.size >= 1}
			<button
				class="tb-btn integrate-sel"
				onclick={() => {
					const firstId = [...selectedNodeIds][0];
					openNodeId = firstId;
				}}
				title="Open note and integrate into plan"
			>
				Integrate ({selectedNodeIds.size})
			</button>
		{/if}
		{#if selectedNodeIds.size >= 2}
			<button
				class="tb-btn compact-sel"
				onclick={() => (showCompact = true)}
				title="Compact selected notes into summary"
			>
				Compact ({selectedNodeIds.size})
			</button>
		{/if}
	</div>

	<!-- Main content area -->
	<div class="notes-content">
		<div class="notes-main">
			{#if notesNodes.length === 0 && view === 'canvas'}
				<div class="empty-hint">
					<p>Double-click to create a note</p>
				</div>
			{/if}

			{#if view === 'canvas'}
				<Canvas
					nodes={notesNodes}
					edges={projectEdges}
					{gridSnap}
					timeAxis={true}
					selectedIds={selectedNodeIds}
					onCreateNote={handleCreateNote}
					onMoveNote={handleMoveNote}
					onUpdateNode={handleUpdateNode}
					onDeleteNodes={handleDeleteNodes}
					onSelectNodes={handleSelectNodes}
					onCreateEdge={handleCreateEdge}
					onOpenNode={handleOpenNode}
					onIntegrate={handleOpenNode}
					onOpenChat={handleOpenNode}
				/>
			{:else if view === 'kanban'}
				<KanbanView
					nodes={notesNodes}
					onUpdateNode={handleUpdateNode}
					onOpenNode={handleOpenNode}
				/>
			{:else if view === 'graph'}
				<GraphView
					nodes={notesNodes}
					edges={projectEdges}
					selectedIds={selectedNodeIds}
					onSelectNode={(id) => (selectedNodeIds = new Set([id]))}
					onOpenNode={handleOpenNode}
				/>
			{:else if view === 'roadmap'}
				<RoadmapView
					nodes={notesNodes}
					edges={projectEdges}
					{allNodes}
					onUpdateNode={handleUpdateNode}
					onOpenNode={handleOpenNode}
				/>
			{/if}
		</div>

		{#if openNode}
			<NodeChatModal
				node={openNode}
				{projectId}
				onUpdateNode={handleUpdateNode}
				onClose={() => (openNodeId = null)}
			/>
		{/if}
	</div>

	<!-- Floating panels -->
	{#if showCompact}
		<CompactionPanel
			nodes={notesNodes}
			edges={projectEdges}
			selectedIds={selectedNodeIds.size >= 2 ? selectedNodeIds : undefined}
			onCompact={handleCompaction}
			onClose={() => (showCompact = false)}
		/>
	{/if}

	{#if showBrainDump}
		<BrainDumpDialog {projectId} onClose={() => (showBrainDump = false)} />
	{/if}
</div>

<style>
	.notes-zone {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative;
	}

	.notes-toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
		flex-shrink: 0;
		z-index: 10;
	}

	.zone-title {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
		letter-spacing: 0.02em;
	}

	.separator {
		color: #2a2a2a;
		font-size: 12px;
	}

	.tb-btn {
		background: none;
		border: none;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 11px;
		color: #525252;
		cursor: pointer;
		text-transform: capitalize;
		transition: all 0.15s;
	}

	.tb-btn:hover {
		color: #a3a3a3;
	}

	.tb-btn.active {
		background: #1f1f1f;
		color: #d4d4d4;
	}

	.tb-btn.compact-active {
		background: #134e4a;
		color: #5eead4;
	}

	.tb-btn.compact-sel {
		color: #14b8a6;
		border: 1px solid #134e4a;
	}

	.tb-btn.integrate-sel {
		color: #22c55e;
		border: 1px solid #14532d;
	}

	.notes-content {
		flex: 1;
		display: flex;
		min-height: 0;
		position: relative;
	}

	.notes-main {
		flex: 1;
		position: relative;
		min-width: 0;
	}

	.empty-hint {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 1;
	}

	.empty-hint p {
		font-size: 13px;
		color: #404040;
	}

	.tag-filters {
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		flex-shrink: 1;
		min-width: 0;
	}

	.tag-filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid #2a2a2a;
		background: transparent;
		color: #525252;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.tag-filter-chip:hover {
		color: #a3a3a3;
		border-color: #3a3a3a;
	}

	.tag-filter-chip.active {
		background: rgba(255, 255, 255, 0.06);
		color: #d4d4d4;
		border-color: var(--tag-color);
	}

	.tag-filter-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--tag-color);
		flex-shrink: 0;
	}
</style>
