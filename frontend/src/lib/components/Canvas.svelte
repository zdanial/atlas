<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import NoteCard from './NoteCard.svelte';
	import { getNodeTypeConfig, NODE_TYPES } from '$lib/node-types';
	import { NODE_TYPES as NODE_TYPE_KEYS_LIST } from '$lib/schemas/node';

	interface Props {
		nodes: Node[];
		edges?: NodeEdge[];
		gridSnap: boolean;
		gridSize?: number;
		selectedIds?: Set<string>;
		timeAxis?: boolean;
		dayWidth?: number;
		onCreateNote?: (x: number, y: number) => void;
		onMoveNote?: (id: string, x: number, y: number) => void;
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onDeleteNodes?: (ids: string[]) => void;
		onSelectNodes?: (ids: Set<string>) => void;
		onCreateEdge?: (sourceId: string, targetId: string) => void;
		onContextMenu?: (e: MouseEvent, nodeIds: string[]) => void;
		onOpenNode?: (id: string) => void;
		onIntegrate?: (id: string) => void;
		onPromote?: (ids: string[]) => void;
		onOpenChat?: (id: string) => void;
		onForkNode?: (id: string) => void;
		onOpenThread?: (id: string) => void;
		onHoverNode?: (id: string, position: { x: number; y: number }) => void;
		onLeaveNode?: (id: string) => void;
	}

	let {
		nodes,
		edges = [],
		gridSnap,
		gridSize = 20,
		selectedIds = new Set<string>(),
		timeAxis = false,
		dayWidth = 300,
		onCreateNote,
		onMoveNote,
		onUpdateNode,
		onDeleteNodes,
		onSelectNodes,
		onCreateEdge,
		onContextMenu,
		onOpenNode,
		onIntegrate,
		onPromote,
		onOpenChat,
		onForkNode,
		onOpenThread,
		onHoverNode,
		onLeaveNode
	}: Props = $props();

	// Time axis: reference date is today at midnight
	const TIME_AXIS_HEADER_HEIGHT = 32;
	const referenceDate = new Date();
	referenceDate.setHours(0, 0, 0, 0);

	function canvasXToDate(x: number): Date {
		const dayOffset = x / dayWidth;
		const d = new Date(referenceDate);
		d.setDate(d.getDate() + dayOffset);
		return d;
	}

	function dateToCanvasX(date: Date): number {
		const diffMs = date.getTime() - referenceDate.getTime();
		return (diffMs / (1000 * 60 * 60 * 24)) * dayWidth;
	}

	// Visible date range based on viewport
	let containerWidth = $state(0);
	let visibleDates = $derived.by(() => {
		if (!timeAxis) return [];
		const leftCanvasX = -panX / zoom;
		const rightCanvasX = (-panX + containerWidth) / zoom;
		const startDay = Math.floor(leftCanvasX / dayWidth) - 1;
		const endDay = Math.ceil(rightCanvasX / dayWidth) + 1;
		const dates: Array<{
			date: Date;
			x: number;
			label: string;
			isToday: boolean;
			isWeekend: boolean;
			isMonthStart: boolean;
		}> = [];
		for (let d = startDay; d <= endDay; d++) {
			const date = new Date(referenceDate);
			date.setDate(date.getDate() + d);
			const x = d * dayWidth;
			const isToday = d === 0;
			const isWeekend = date.getDay() === 0 || date.getDay() === 6;
			const isMonthStart = date.getDate() === 1;
			const label = date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			dates.push({ date, x, label, isToday, isWeekend, isMonthStart });
		}
		return dates;
	});

	// Camera state
	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);

	// Interaction state
	let isPanning = $state(false);
	let panStartX = 0;
	let panStartY = 0;
	let panStartCamX = 0;
	let panStartCamY = 0;

	// Drag note state
	let draggingNodeId = $state<string | null>(null);
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let dragStartPositions = new Map<string, { x: number; y: number }>();

	// Box-select state
	let isBoxSelecting = $state(false);
	let boxStartX = $state(0);
	let boxStartY = $state(0);
	let boxEndX = $state(0);
	let boxEndY = $state(0);

	// Edge drawing state
	let isDrawingEdge = $state(false);
	let edgeSourceId = $state<string | null>(null);
	let edgeEndX = $state(0);
	let edgeEndY = $state(0);

	// Context menu state
	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuNodeIds = $state<string[]>([]);
	let showTypeSubmenu = $state(false);

	// Zoom limits
	const MIN_ZOOM = 0.1;
	const MAX_ZOOM = 5;

	let canvasEl: HTMLDivElement;

	function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
		const rect = canvasEl.getBoundingClientRect();
		const headerOffset = timeAxis ? TIME_AXIS_HEADER_HEIGHT : 0;
		return {
			x: (screenX - rect.left - panX) / zoom,
			y: (screenY - rect.top - headerOffset - panY) / zoom
		};
	}

	function canvasToScreen(cx: number, cy: number): { x: number; y: number } {
		const headerOffset = timeAxis ? TIME_AXIS_HEADER_HEIGHT : 0;
		return {
			x: cx * zoom + panX,
			y: cy * zoom + panY + headerOffset
		};
	}

	export function snapToGrid(x: number, y: number): { x: number; y: number } {
		if (!gridSnap) return { x, y };
		return {
			x: Math.round(x / gridSize) * gridSize,
			y: Math.round(y / gridSize) * gridSize
		};
	}

	function closeContextMenu() {
		showContextMenu = false;
		showTypeSubmenu = false;
	}

	// --- Pan handlers ---
	function onPointerDown(e: PointerEvent) {
		closeContextMenu();

		// Middle-click always pans
		if (e.button === 1) {
			isPanning = true;
			panStartX = e.clientX;
			panStartY = e.clientY;
			panStartCamX = panX;
			panStartCamY = panY;
			canvasEl.setPointerCapture(e.pointerId);
			e.preventDefault();
			return;
		}

		// Left-click on canvas background
		if (e.button === 0 && e.target === canvasEl) {
			if (e.shiftKey) {
				// Start box select
				isBoxSelecting = true;
				const pos = screenToCanvas(e.clientX, e.clientY);
				boxStartX = pos.x;
				boxStartY = pos.y;
				boxEndX = pos.x;
				boxEndY = pos.y;
				canvasEl.setPointerCapture(e.pointerId);
				e.preventDefault();
			} else {
				// Pan
				isPanning = true;
				panStartX = e.clientX;
				panStartY = e.clientY;
				panStartCamX = panX;
				panStartCamY = panY;
				canvasEl.setPointerCapture(e.pointerId);
				// Clear selection
				onSelectNodes?.(new Set());
				e.preventDefault();
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (isPanning) {
			panX = panStartCamX + (e.clientX - panStartX);
			panY = panStartCamY + (e.clientY - panStartY);
			return;
		}

		if (isBoxSelecting) {
			const pos = screenToCanvas(e.clientX, e.clientY);
			boxEndX = pos.x;
			boxEndY = pos.y;
			return;
		}

		if (isDrawingEdge) {
			const pos = screenToCanvas(e.clientX, e.clientY);
			edgeEndX = pos.x;
			edgeEndY = pos.y;
			return;
		}

		if (draggingNodeId) {
			const pos = screenToCanvas(e.clientX, e.clientY);
			const snapped = snapToGrid(pos.x - dragOffsetX, pos.y - dragOffsetY);
			const dx = snapped.x - (dragStartPositions.get(draggingNodeId)?.x ?? 0);
			const dy = snapped.y - (dragStartPositions.get(draggingNodeId)?.y ?? 0);

			// Move all selected nodes
			if (selectedIds.has(draggingNodeId)) {
				for (const id of selectedIds) {
					const start = dragStartPositions.get(id);
					if (start) {
						const newPos = snapToGrid(start.x + dx, start.y + dy);
						onMoveNote?.(id, newPos.x, newPos.y);
					}
				}
			} else {
				onMoveNote?.(draggingNodeId, snapped.x, snapped.y);
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			canvasEl.releasePointerCapture(e.pointerId);
		}
		if (isBoxSelecting) {
			isBoxSelecting = false;
			canvasEl.releasePointerCapture(e.pointerId);
			// Select nodes within the box
			const minX = Math.min(boxStartX, boxEndX);
			const maxX = Math.max(boxStartX, boxEndX);
			const minY = Math.min(boxStartY, boxEndY);
			const maxY = Math.max(boxStartY, boxEndY);

			const selected = new Set<string>();
			for (const node of nodes) {
				const nx = node.positionX ?? 0;
				const ny = node.positionY ?? 0;
				if (nx >= minX && nx + 220 <= maxX + 220 && ny >= minY && ny + 60 <= maxY + 60) {
					if (nx + 110 >= minX && nx + 110 <= maxX && ny + 30 >= minY && ny + 30 <= maxY) {
						selected.add(node.id);
					}
				}
			}
			// If shift-dragged, merge with existing selection
			if (e.shiftKey) {
				const merged = new Set(selectedIds);
				for (const id of selected) merged.add(id);
				onSelectNodes?.(merged);
			} else {
				onSelectNodes?.(selected);
			}
		}
		if (isDrawingEdge && edgeSourceId) {
			// Check if we're over a note
			const pos = screenToCanvas(e.clientX, e.clientY);
			const target = nodes.find((n) => {
				const nx = n.positionX ?? 0;
				const ny = n.positionY ?? 0;
				return pos.x >= nx && pos.x <= nx + 220 && pos.y >= ny && pos.y <= ny + 100;
			});
			if (target && target.id !== edgeSourceId) {
				onCreateEdge?.(edgeSourceId, target.id);
			}
			isDrawingEdge = false;
			edgeSourceId = null;
		}
		if (draggingNodeId) {
			draggingNodeId = null;
			dragStartPositions.clear();
		}
	}

	// --- Zoom handler ---
	function onWheel(e: WheelEvent) {
		e.preventDefault();

		const isPinch = e.ctrlKey;
		const delta = isPinch ? -e.deltaY * 0.01 : -e.deltaY * 0.001;
		const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));

		const rect = canvasEl.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		panX = mx - (mx - panX) * (newZoom / zoom);
		panY = my - (my - panY) * (newZoom / zoom);
		zoom = newZoom;
	}

	// --- Double-click to create note ---
	function onDblClick(e: MouseEvent) {
		if (e.target !== canvasEl) return;
		const pos = screenToCanvas(e.clientX, e.clientY);
		const snapped = snapToGrid(pos.x, pos.y);
		onCreateNote?.(snapped.x, snapped.y);
	}

	// --- Right-click context menu ---
	function onRightClick(e: MouseEvent) {
		e.preventDefault();
		const ids = selectedIds.size > 0 ? [...selectedIds] : [];
		if (ids.length === 0) {
			// Check if right-clicking on a node
			const pos = screenToCanvas(e.clientX, e.clientY);
			const node = nodes.find((n) => {
				const nx = n.positionX ?? 0;
				const ny = n.positionY ?? 0;
				return pos.x >= nx && pos.x <= nx + 220 && pos.y >= ny && pos.y <= ny + 100;
			});
			if (node) {
				ids.push(node.id);
			}
		}
		if (ids.length > 0) {
			contextMenuX = e.clientX;
			contextMenuY = e.clientY;
			contextMenuNodeIds = ids;
			showContextMenu = true;
			showTypeSubmenu = false;
		}
	}

	function handleContextDelete() {
		onDeleteNodes?.(contextMenuNodeIds);
		closeContextMenu();
	}

	function handleContextIntegrate() {
		if (contextMenuNodeIds.length >= 1) {
			onIntegrate?.(contextMenuNodeIds[0]);
		}
		closeContextMenu();
	}

	function handleContextChangeType(type: string) {
		for (const id of contextMenuNodeIds) {
			onUpdateNode?.(id, { type });
		}
		closeContextMenu();
	}

	// --- Note interaction handlers ---
	function onNoteDragStart(nodeId: string, e: PointerEvent) {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const pos = screenToCanvas(e.clientX, e.clientY);
		dragOffsetX = pos.x - (node.positionX ?? 0);
		dragOffsetY = pos.y - (node.positionY ?? 0);
		draggingNodeId = nodeId;

		// Store starting positions for multi-drag
		dragStartPositions.clear();
		if (selectedIds.has(nodeId)) {
			for (const id of selectedIds) {
				const n = nodes.find((nd) => nd.id === id);
				if (n) dragStartPositions.set(id, { x: n.positionX ?? 0, y: n.positionY ?? 0 });
			}
		}
		dragStartPositions.set(nodeId, { x: node.positionX ?? 0, y: node.positionY ?? 0 });
		e.stopPropagation();
	}

	function onNoteClick(nodeId: string, e: MouseEvent) {
		e.stopPropagation();
		if (e.shiftKey) {
			// Toggle selection
			const next = new Set(selectedIds);
			if (next.has(nodeId)) {
				next.delete(nodeId);
			} else {
				next.add(nodeId);
			}
			onSelectNodes?.(next);
		} else if (!selectedIds.has(nodeId)) {
			onSelectNodes?.(new Set([nodeId]));
		}
	}

	function onEdgeHandleDown(nodeId: string, e: PointerEvent) {
		e.stopPropagation();
		e.preventDefault();
		isDrawingEdge = true;
		edgeSourceId = nodeId;
		const pos = screenToCanvas(e.clientX, e.clientY);
		edgeEndX = pos.x;
		edgeEndY = pos.y;
		canvasEl.setPointerCapture(e.pointerId);
	}

	// --- Keyboard shortcuts ---
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Backspace' || e.key === 'Delete') {
			if (
				selectedIds.size > 0 &&
				!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
			) {
				e.preventDefault();
				onDeleteNodes?.([...selectedIds]);
			}
		}
		if (e.key === 'Escape') {
			onSelectNodes?.(new Set());
			closeContextMenu();
		}
	}

	// Derived transform style
	let transformStyle = $derived(`translate(${panX}px, ${panY}px) scale(${zoom})`);

	// Background dot pattern offset
	let bgPosition = $derived(`${panX}px ${panY}px`);
	let bgSize = $derived(`${gridSize * zoom}px ${gridSize * zoom}px`);
	let dotSize = $derived(`${Math.max(1, zoom)}px ${Math.max(1, zoom)}px`);

	// Edge line calculations
	function getEdgePath(edge: NodeEdge): string | null {
		const source = nodes.find((n) => n.id === edge.sourceId);
		const target = nodes.find((n) => n.id === edge.targetId);
		if (!source || !target) return null;
		const sx = (source.positionX ?? 0) + 110;
		const sy = (source.positionY ?? 0) + 30;
		const tx = (target.positionX ?? 0) + 110;
		const ty = (target.positionY ?? 0) + 30;
		return `M ${sx} ${sy} L ${tx} ${ty}`;
	}

	function getEdgeColor(relationType: string): string {
		switch (relationType) {
			case 'supports':
				return '#22c55e';
			case 'contradicts':
				return '#ef4444';
			case 'blocks':
				return '#f97316';
			case 'implements':
				return '#6366f1';
			case 'duplicates':
				return '#737373';
			case 'refines':
				return '#06b6d4';
			default:
				return '#525252';
		}
	}

	// Box select rectangle (in canvas coordinates → screen via transform)
	let boxRect = $derived({
		x: Math.min(boxStartX, boxEndX),
		y: Math.min(boxStartY, boxEndY),
		w: Math.abs(boxEndX - boxStartX),
		h: Math.abs(boxEndY - boxStartY)
	});

	// Drawing edge source position
	let edgeSourcePos = $derived(() => {
		if (!edgeSourceId) return null;
		const source = nodes.find((n) => n.id === edgeSourceId);
		if (!source) return null;
		return { x: (source.positionX ?? 0) + 110, y: (source.positionY ?? 0) + 30 };
	});

	const NODE_TYPE_ENTRIES = Object.entries(NODE_TYPES);
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="canvas-container"
	class:has-time-axis={timeAxis}
	bind:this={canvasEl}
	bind:clientWidth={containerWidth}
	role="application"
	aria-label="Spatial canvas"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onwheel={onWheel}
	ondblclick={onDblClick}
	oncontextmenu={onRightClick}
	style:background-position={bgPosition}
	style:background-size={bgSize}
	style:--dot-size={dotSize}
>
	<!-- Time axis header -->
	{#if timeAxis}
		<div class="time-axis-header" style:height="{TIME_AXIS_HEADER_HEIGHT}px">
			{#each visibleDates as col}
				<div
					class="time-col-header"
					class:today={col.isToday}
					class:weekend={col.isWeekend}
					class:month-start={col.isMonthStart}
					style:left="{col.x * zoom + panX}px"
					style:width="{dayWidth * zoom}px"
				>
					<span class="time-label">{col.label}</span>
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="canvas-world"
		style:transform={transformStyle}
		style:top={timeAxis ? `${TIME_AXIS_HEADER_HEIGHT}px` : '0'}
	>
		<!-- Day column guides -->
		{#if timeAxis}
			{#each visibleDates as col}
				<div
					class="day-guide"
					class:today-guide={col.isToday}
					class:weekend-guide={col.isWeekend}
					style:left="{col.x}px"
					style:width="{dayWidth}px"
				></div>
			{/each}
		{/if}

		<!-- Edge SVG layer -->
		<svg class="edge-layer">
			{#each edges as edge (edge.id)}
				{@const path = getEdgePath(edge)}
				{#if path}
					<path
						d={path}
						stroke={getEdgeColor(edge.relationType)}
						stroke-width="2"
						fill="none"
						stroke-dasharray={edge.source === 'ai' ? '6 4' : 'none'}
						opacity="0.6"
					/>
					<!-- Hover hitbox -->
					<path d={path} stroke="transparent" stroke-width="12" fill="none">
						<title
							>{edge.relationType} ({edge.source}){edge.weight
								? ` — ${Math.round(edge.weight * 100)}%`
								: ''}</title
						>
					</path>
				{/if}
			{/each}

			<!-- Drawing edge preview -->
			{#if isDrawingEdge && edgeSourceId}
				{@const srcPos = edgeSourcePos()}
				{#if srcPos}
					<path
						d="M {srcPos.x} {srcPos.y} L {edgeEndX} {edgeEndY}"
						stroke="#6366f1"
						stroke-width="2"
						stroke-dasharray="4 4"
						fill="none"
						opacity="0.8"
					/>
				{/if}
			{/if}
		</svg>

		<!-- Box selection rectangle -->
		{#if isBoxSelecting}
			<div
				class="box-select"
				style:left="{boxRect.x}px"
				style:top="{boxRect.y}px"
				style:width="{boxRect.w}px"
				style:height="{boxRect.h}px"
			></div>
		{/if}

		<!-- Note cards -->
		{#each nodes as node (node.id)}
			<div class="note-wrapper" class:selected={selectedIds.has(node.id)}>
				<!-- Edge handle -->
				<button
					class="edge-handle edge-handle-right"
					style:left="{(node.positionX ?? 0) + 220}px"
					style:top="{(node.positionY ?? 0) + 30}px"
					onpointerdown={(e) => onEdgeHandleDown(node.id, e)}
					title="Drag to connect"
				></button>

				<NoteCard
					{node}
					isDragging={draggingNodeId === node.id}
					isSelected={selectedIds.has(node.id)}
					onDragStart={(e) => onNoteDragStart(node.id, e)}
					onClick={(e) => onNoteClick(node.id, e)}
					{onUpdateNode}
					onOpen={onOpenNode}
					onDelete={(id) => onDeleteNodes?.([id])}
					onHover={onHoverNode
						? (id, e) => {
								const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
								onHoverNode!(id, { x: rect.right + 4, y: rect.top });
							}
						: undefined}
					onLeave={onLeaveNode}
				/>
			</div>
		{/each}
	</div>

	<!-- Context Menu -->
	{#if showContextMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="context-menu-backdrop"
			onclick={closeContextMenu}
			oncontextmenu={(e) => {
				e.preventDefault();
				closeContextMenu();
			}}
		></div>
		<div class="context-menu" style:left="{contextMenuX}px" style:top="{contextMenuY}px">
			<button class="context-item" onclick={handleContextDelete}>
				<span class="context-icon">✕</span>
				Delete {contextMenuNodeIds.length > 1 ? `(${contextMenuNodeIds.length})` : ''}
			</button>
			{#if contextMenuNodeIds.length === 1 && onForkNode}
				<button
					class="context-item"
					onclick={() => {
						onForkNode?.(contextMenuNodeIds[0]);
						closeContextMenu();
					}}
				>
					<span class="context-icon">⑃</span>
					Fork
				</button>
			{/if}
			{#if contextMenuNodeIds.length === 1 && onOpenThread}
				<button
					class="context-item"
					onclick={() => {
						onOpenThread?.(contextMenuNodeIds[0]);
						closeContextMenu();
					}}
				>
					<span class="context-icon">↕</span>
					View thread
				</button>
			{/if}
			{#if contextMenuNodeIds.length >= 1 && onPromote}
				<button
					class="context-item"
					onclick={() => {
						onPromote?.(contextMenuNodeIds);
						closeContextMenu();
					}}
				>
					<span class="context-icon">⬆</span>
					Promote to plan
				</button>
			{/if}
			{#if contextMenuNodeIds.length >= 1 && onIntegrate}
				<button class="context-item" onclick={handleContextIntegrate}>
					<span class="context-icon">◈</span>
					Integrate (AI)
				</button>
			{/if}
			{#if contextMenuNodeIds.length === 1 && onOpenChat}
				<button
					class="context-item"
					onclick={() => {
						onOpenChat?.(contextMenuNodeIds[0]);
						closeContextMenu();
					}}
				>
					<span class="context-icon">💬</span>
					Chat about this
				</button>
			{/if}
			<div class="context-separator"></div>
			<button class="context-item" onclick={() => (showTypeSubmenu = !showTypeSubmenu)}>
				<span class="context-icon">◆</span>
				Change type
				<span class="context-arrow">▸</span>
			</button>
			{#if showTypeSubmenu}
				<div class="type-submenu">
					{#each NODE_TYPE_ENTRIES as [key, config]}
						<button class="context-item" onclick={() => handleContextChangeType(key)}>
							<span class="type-dot-small" style:background-color={config.badge}></span>
							{config.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.canvas-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		cursor: grab;
		background-color: #0a0a0a;
		background-image: radial-gradient(circle, #333 var(--dot-size, 1px), transparent 1px);
		touch-action: none;
	}

	.canvas-container:active {
		cursor: grabbing;
	}

	.canvas-world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.edge-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.edge-layer path {
		pointer-events: stroke;
	}

	.note-wrapper {
		position: relative;
	}

	.note-wrapper.selected :global(.note-card) {
		box-shadow:
			0 0 0 2px #6366f1,
			0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.edge-handle {
		position: absolute;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #333;
		border: 2px solid #525252;
		cursor: crosshair;
		z-index: 100;
		transform: translate(-50%, -50%);
		opacity: 0;
		transition:
			opacity 0.15s,
			background-color 0.15s;
		padding: 0;
	}

	.note-wrapper:hover .edge-handle,
	.note-wrapper.selected .edge-handle {
		opacity: 1;
	}

	.edge-handle:hover {
		background: #6366f1;
		border-color: #818cf8;
	}

	.box-select {
		position: absolute;
		border: 1px solid rgba(99, 102, 241, 0.6);
		background: rgba(99, 102, 241, 0.1);
		pointer-events: none;
		z-index: 50;
	}

	.context-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9998;
	}

	.context-menu {
		position: fixed;
		z-index: 9999;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 4px;
		min-width: 160px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}

	.context-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 12px;
		cursor: pointer;
		text-align: left;
	}

	.context-item:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.context-icon {
		font-size: 10px;
		width: 14px;
		text-align: center;
	}

	.context-arrow {
		margin-left: auto;
		font-size: 10px;
		color: #525252;
	}

	.context-separator {
		height: 1px;
		background: #262626;
		margin: 4px 0;
	}

	.type-submenu {
		border-top: 1px solid #262626;
		padding-top: 4px;
		max-height: 240px;
		overflow-y: auto;
	}

	.type-dot-small {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* Time axis */
	.time-axis-header {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 5;
		background: #0d0d0d;
		border-bottom: 1px solid #1f1f1f;
		overflow: hidden;
		pointer-events: none;
	}

	.time-col-header {
		position: absolute;
		top: 0;
		height: 100%;
		display: flex;
		align-items: center;
		padding-left: 8px;
		border-left: 1px solid #1a1a1a;
		box-sizing: border-box;
	}

	.time-col-header.today {
		border-left: 2px solid #6366f1;
		background: rgba(99, 102, 241, 0.06);
	}

	.time-col-header.weekend {
		background: rgba(255, 255, 255, 0.015);
	}

	.time-col-header.month-start {
		border-left: 2px solid #525252;
	}

	.time-label {
		font-size: 10px;
		color: #525252;
		white-space: nowrap;
		font-weight: 500;
	}

	.time-col-header.today .time-label {
		color: #818cf8;
		font-weight: 600;
	}

	.day-guide {
		position: absolute;
		top: 0;
		bottom: 0;
		height: 200000px;
		border-left: 1px solid #111;
		pointer-events: none;
		z-index: 0;
	}

	.day-guide.today-guide {
		border-left: 1px solid rgba(99, 102, 241, 0.2);
		background: rgba(99, 102, 241, 0.02);
	}

	.day-guide.weekend-guide {
		background: rgba(255, 255, 255, 0.008);
	}
</style>
