import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import KanbanView from './KanbanView.svelte';
import type { Node } from '$lib/storage/adapter';
import { NODE_TYPE_KEYS } from '$lib/node-types';

function makeNode(overrides: Partial<Node> = {}): Node {
	return {
		id: crypto.randomUUID(),
		type: 'idea',
		layer: 5,
		projectId: 'proj-1',
		parentId: null,
		title: 'Test Note',
		body: null,
		payload: null,
		status: 'draft',
		positionX: 0,
		positionY: 0,
		createdBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('KanbanView', () => {
	it('renders a column for each node type', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const columns = container.querySelectorAll('.kanban-column');
		expect(columns.length).toBe(NODE_TYPE_KEYS.length);
	});

	it('shows column titles', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const titles = Array.from(container.querySelectorAll('.column-title')).map(
			(el) => el.textContent
		);
		expect(titles).toContain('Idea');
		expect(titles).toContain('Note');
		expect(titles).toContain('Question');
		expect(titles).toContain('Task');
	});

	it('renders notes in the correct columns', () => {
		const nodes = [
			makeNode({ type: 'idea', title: 'My Idea' }),
			makeNode({ type: 'task', title: 'My Task' }),
			makeNode({ type: 'idea', title: 'Another Idea' })
		];
		const { getByText } = render(KanbanView, { props: { nodes } });
		expect(getByText('My Idea')).toBeTruthy();
		expect(getByText('My Task')).toBeTruthy();
		expect(getByText('Another Idea')).toBeTruthy();
	});

	it('shows column counts', () => {
		const nodes = [
			makeNode({ type: 'idea', title: 'Idea 1' }),
			makeNode({ type: 'idea', title: 'Idea 2' }),
			makeNode({ type: 'task', title: 'Task 1' })
		];
		const { container } = render(KanbanView, { props: { nodes } });
		const counts = container.querySelectorAll('.column-count');
		// Find the idea column count
		const countValues = Array.from(counts).map((el) => el.textContent);
		expect(countValues).toContain('2'); // 2 ideas
		expect(countValues).toContain('1'); // 1 task
	});

	it('shows empty placeholders for columns with no notes', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const placeholders = container.querySelectorAll('.empty-placeholder');
		expect(placeholders.length).toBe(NODE_TYPE_KEYS.length);
	});

	it('renders body preview on cards', () => {
		const nodes = [
			makeNode({
				type: 'idea',
				title: 'With Body',
				body: {
					type: 'doc',
					content: [
						{ type: 'paragraph', content: [{ type: 'text', text: 'Card preview text' }] }
					]
				}
			})
		];
		const { getByText } = render(KanbanView, { props: { nodes } });
		expect(getByText('Card preview text')).toBeTruthy();
	});
});
