import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import NoteCard from './NoteCard.svelte';
import type { Node } from '$lib/storage/adapter';
import { extractBodyText, getNodeTypeConfig, NODE_TYPE_KEYS } from '$lib/node-types';

function makeNode(overrides: Partial<Node> = {}): Node {
	return {
		id: 'test-1',
		type: 'idea',
		layer: 5,
		projectId: 'proj-1',
		parentId: null,
		title: 'Test Note',
		body: null,
		payload: null,
		status: 'draft',
		positionX: 100,
		positionY: 200,
		createdBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

// --- Grid snapping ---
describe('grid snapping', () => {
	function snapToGrid(
		x: number,
		y: number,
		gridSnap: boolean,
		gridSize = 20
	): { x: number; y: number } {
		if (!gridSnap) return { x, y };
		return {
			x: Math.round(x / gridSize) * gridSize,
			y: Math.round(y / gridSize) * gridSize
		};
	}

	it('snaps coordinates to grid when enabled', () => {
		expect(snapToGrid(13, 27, true, 20)).toEqual({ x: 20, y: 20 });
		expect(snapToGrid(30, 50, true, 20)).toEqual({ x: 40, y: 60 });
	});

	it('returns exact coordinates when grid snap disabled', () => {
		expect(snapToGrid(13, 27, false)).toEqual({ x: 13, y: 27 });
	});

	it('handles negative coordinates', () => {
		expect(snapToGrid(-13, -27, true, 20)).toEqual({ x: -20, y: -20 });
	});

	it('handles zero', () => {
		expect(snapToGrid(0, 0, true, 20)).toEqual({ x: 0, y: 0 });
	});

	it('works with custom grid size', () => {
		expect(snapToGrid(17, 33, true, 10)).toEqual({ x: 20, y: 30 });
	});
});

// --- Screen-to-canvas coordinate transform ---
describe('screen to canvas coordinate transform', () => {
	function screenToCanvas(
		screenX: number,
		screenY: number,
		panX: number,
		panY: number,
		zoom: number,
		rectLeft = 0,
		rectTop = 0
	): { x: number; y: number } {
		return {
			x: (screenX - rectLeft - panX) / zoom,
			y: (screenY - rectTop - panY) / zoom
		};
	}

	it('converts screen coords to canvas coords at default zoom/pan', () => {
		expect(screenToCanvas(100, 200, 0, 0, 1)).toEqual({ x: 100, y: 200 });
	});

	it('accounts for pan offset', () => {
		expect(screenToCanvas(150, 250, 50, 50, 1)).toEqual({ x: 100, y: 200 });
	});

	it('accounts for zoom', () => {
		const result = screenToCanvas(200, 400, 0, 0, 2);
		expect(result.x).toBeCloseTo(100);
		expect(result.y).toBeCloseTo(200);
	});

	it('accounts for both pan and zoom', () => {
		const result = screenToCanvas(300, 500, 100, 100, 2);
		expect(result.x).toBeCloseTo(100);
		expect(result.y).toBeCloseTo(200);
	});
});

// --- extractBodyText ---
describe('extractBodyText', () => {
	it('returns empty string for null body', () => {
		expect(extractBodyText(null)).toBe('');
	});

	it('extracts text from TipTap JSON doc', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Hello world' }]
				}
			]
		};
		expect(extractBodyText(doc)).toBe('Hello world');
	});

	it('joins text from multiple paragraphs', () => {
		const doc = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }
			]
		};
		expect(extractBodyText(doc)).toBe('First Second');
	});

	it('truncates to maxLength', () => {
		const doc = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(200) }] }]
		};
		expect(extractBodyText(doc, 50)).toHaveLength(50);
	});

	it('handles legacy { text } format', () => {
		expect(extractBodyText({ text: 'Legacy body' })).toBe('Legacy body');
	});

	it('handles empty doc content', () => {
		expect(extractBodyText({ type: 'doc', content: [] })).toBe('');
	});

	it('handles blocks without content (e.g. horizontal rule)', () => {
		const doc = {
			type: 'doc',
			content: [
				{ type: 'horizontalRule' },
				{ type: 'paragraph', content: [{ type: 'text', text: 'After rule' }] }
			]
		};
		expect(extractBodyText(doc)).toBe('After rule');
	});
});

// --- getNodeTypeConfig ---
describe('getNodeTypeConfig', () => {
	it('returns config for known types', () => {
		const config = getNodeTypeConfig('idea');
		expect(config.label).toBe('Idea');
		expect(config.badge).toBe('#6366f1');
	});

	it('returns default config for unknown types', () => {
		const config = getNodeTypeConfig('unknown_type');
		expect(config.label).toBe('Unknown');
	});

	it('has configs for all node types', () => {
		expect(NODE_TYPE_KEYS.length).toBeGreaterThanOrEqual(16);
		for (const type of NODE_TYPE_KEYS) {
			const config = getNodeTypeConfig(type);
			expect(config.label).toBeTruthy();
			expect(config.badge).toBeTruthy();
		}
	});
});

// --- NoteCard rendering ---
describe('NoteCard', () => {
	it('renders the note title', () => {
		const node = makeNode({ title: 'My Idea' });
		const { getByText } = render(NoteCard, {
			props: { node, isDragging: false, onDragStart: () => {} }
		});
		expect(getByText('My Idea')).toBeTruthy();
	});

	it('renders the type badge', () => {
		const node = makeNode({ type: 'question' });
		const { getByText } = render(NoteCard, {
			props: { node, isDragging: false, onDragStart: () => {} }
		});
		expect(getByText('question')).toBeTruthy();
	});

	it('positions the card using positionX and positionY', () => {
		const node = makeNode({ positionX: 150, positionY: 300 });
		const { container } = render(NoteCard, {
			props: { node, isDragging: false, onDragStart: () => {} }
		});
		const card = container.querySelector('.note-card') as HTMLElement;
		expect(card.style.left).toBe('150px');
		expect(card.style.top).toBe('300px');
	});

	it('applies dragging class when isDragging is true', () => {
		const node = makeNode();
		const { container } = render(NoteCard, {
			props: { node, isDragging: true, onDragStart: () => {} }
		});
		const card = container.querySelector('.note-card') as HTMLElement;
		expect(card.classList.contains('dragging')).toBe(true);
	});

	it('renders body preview from TipTap JSON', () => {
		const body = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich text preview' }] }]
		};
		const node = makeNode({ body });
		const { getByText } = render(NoteCard, {
			props: { node, isDragging: false, onDragStart: () => {} }
		});
		expect(getByText('Rich text preview')).toBeTruthy();
	});

	it('renders body preview from legacy text format', () => {
		const node = makeNode({ body: { text: 'Some preview text here' } });
		const { getByText } = render(NoteCard, {
			props: { node, isDragging: false, onDragStart: () => {} }
		});
		expect(getByText('Some preview text here')).toBeTruthy();
	});

	it('handles all node types without error', () => {
		for (const type of NODE_TYPE_KEYS) {
			cleanup();
			const node = makeNode({ type });
			const { getByText } = render(NoteCard, {
				props: { node, isDragging: false, onDragStart: () => {} }
			});
			expect(getByText(type)).toBeTruthy();
		}
	});
});
