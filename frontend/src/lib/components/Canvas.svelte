<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import NoteCard from './NoteCard.svelte';

	interface Props {
		nodes: Node[];
		gridSnap: boolean;
		gridSize?: number;
		onCreateNote?: (x: number, y: number) => void;
		onMoveNote?: (id: string, x: number, y: number) => void;
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
	}

	let { nodes, gridSnap, gridSize = 20, onCreateNote, onMoveNote, onUpdateNode }: Props = $props();

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

	// Zoom limits
	const MIN_ZOOM = 0.1;
	const MAX_ZOOM = 5;

	let canvasEl: HTMLDivElement;

	function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
		const rect = canvasEl.getBoundingClientRect();
		return {
			x: (screenX - rect.left - panX) / zoom,
			y: (screenY - rect.top - panY) / zoom
		};
	}

	export function snapToGrid(x: number, y: number): { x: number; y: number } {
		if (!gridSnap) return { x, y };
		return {
			x: Math.round(x / gridSize) * gridSize,
			y: Math.round(y / gridSize) * gridSize
		};
	}

	// --- Pan handlers ---
	function onPointerDown(e: PointerEvent) {
		// Only pan on middle-click or left-click on canvas background
		if (e.button === 1 || (e.button === 0 && e.target === canvasEl)) {
			isPanning = true;
			panStartX = e.clientX;
			panStartY = e.clientY;
			panStartCamX = panX;
			panStartCamY = panY;
			canvasEl.setPointerCapture(e.pointerId);
			e.preventDefault();
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (isPanning) {
			panX = panStartCamX + (e.clientX - panStartX);
			panY = panStartCamY + (e.clientY - panStartY);
			return;
		}

		if (draggingNodeId) {
			const pos = screenToCanvas(e.clientX, e.clientY);
			const snapped = snapToGrid(pos.x - dragOffsetX, pos.y - dragOffsetY);
			onMoveNote?.(draggingNodeId, snapped.x, snapped.y);
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			canvasEl.releasePointerCapture(e.pointerId);
		}
		if (draggingNodeId) {
			draggingNodeId = null;
		}
	}

	// --- Zoom handler ---
	function onWheel(e: WheelEvent) {
		e.preventDefault();

		// Detect pinch gesture (ctrlKey is set for pinch-to-zoom on trackpads)
		const isPinch = e.ctrlKey;
		const delta = isPinch ? -e.deltaY * 0.01 : -e.deltaY * 0.001;

		const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));

		// Zoom toward cursor position
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

	// --- Note drag handlers ---
	function onNoteDragStart(nodeId: string, e: PointerEvent) {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const pos = screenToCanvas(e.clientX, e.clientY);
		dragOffsetX = pos.x - (node.positionX ?? 0);
		dragOffsetY = pos.y - (node.positionY ?? 0);
		draggingNodeId = nodeId;
		e.stopPropagation();
	}

	// Derived transform style
	let transformStyle = $derived(`translate(${panX}px, ${panY}px) scale(${zoom})`);

	// Background dot pattern offset
	let bgPosition = $derived(`${panX}px ${panY}px`);
	let bgSize = $derived(`${gridSize * zoom}px ${gridSize * zoom}px`);
	let dotSize = $derived(`${Math.max(1, zoom)}px ${Math.max(1, zoom)}px`);
</script>

<div
	class="canvas-container"
	bind:this={canvasEl}
	role="application"
	aria-label="Spatial canvas"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onwheel={onWheel}
	ondblclick={onDblClick}
	style:background-position={bgPosition}
	style:background-size={bgSize}
	style:--dot-size={dotSize}
>
	<div class="canvas-world" style:transform={transformStyle}>
		{#each nodes as node (node.id)}
			<NoteCard
				{node}
				isDragging={draggingNodeId === node.id}
				onDragStart={(e) => onNoteDragStart(node.id, e)}
				{onUpdateNode}
			/>
		{/each}
	</div>
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
</style>
