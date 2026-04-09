import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import KanbanView from './KanbanView.svelte';
import type { Node } from '$lib/storage/adapter';

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
		sortOrder: null,
		createdBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('KanbanView', () => {
	it('renders a column for each status', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const columns = container.querySelectorAll('.kanban-column');
		expect(columns.length).toBe(4); // draft, active, done, archived
	});

	it('shows status column titles', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const titles = Array.from(container.querySelectorAll('.column-title')).map(
			(el) => el.textContent
		);
		expect(titles).toContain('Draft');
		expect(titles).toContain('Active');
		expect(titles).toContain('Done');
		expect(titles).toContain('Archived');
	});

	it('renders nodes in the correct status columns', () => {
		const nodes = [
			makeNode({ status: 'draft', title: 'Draft Item' }),
			makeNode({ status: 'active', title: 'Active Item' }),
			makeNode({ status: 'done', title: 'Done Item' })
		];
		const { getByText } = render(KanbanView, { props: { nodes } });
		expect(getByText('Draft Item')).toBeTruthy();
		expect(getByText('Active Item')).toBeTruthy();
		expect(getByText('Done Item')).toBeTruthy();
	});

	it('shows column counts', () => {
		const nodes = [
			makeNode({ status: 'draft', title: 'Draft 1' }),
			makeNode({ status: 'draft', title: 'Draft 2' }),
			makeNode({ status: 'active', title: 'Active 1' })
		];
		const { container } = render(KanbanView, { props: { nodes } });
		const counts = container.querySelectorAll('.column-count');
		const countValues = Array.from(counts).map((el) => el.textContent);
		expect(countValues).toContain('2'); // 2 drafts
		expect(countValues).toContain('1'); // 1 active
	});

	it('shows empty placeholders for columns with no nodes', () => {
		const { container } = render(KanbanView, { props: { nodes: [] } });
		const placeholders = container.querySelectorAll('.empty-placeholder');
		expect(placeholders.length).toBe(4);
	});

	it('sorts cards by sortOrder within a column', () => {
		const nodes = [
			makeNode({ status: 'draft', title: 'Second', sortOrder: 2000 }),
			makeNode({ status: 'draft', title: 'First', sortOrder: 1000 }),
			makeNode({ status: 'draft', title: 'Third', sortOrder: 3000 })
		];
		const { container } = render(KanbanView, { props: { nodes } });
		const cards = Array.from(container.querySelectorAll('.card-title')).map((el) => el.textContent);
		expect(cards[0]).toBe('First');
		expect(cards[1]).toBe('Second');
		expect(cards[2]).toBe('Third');
	});
});
