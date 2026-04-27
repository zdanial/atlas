import { describe, it, expect } from 'vitest';
import { compilePrompt } from './prompt-compiler';
import type { Node, NodeEdge } from '$lib/storage/adapter';

function makeNode(overrides: Partial<Node> & { id: string; type: string; title: string }): Node {
	return {
		layer: 0,
		projectId: 'proj-1',
		parentId: null,
		body: null,
		payload: null,
		status: 'draft',
		positionX: null,
		positionY: null,
		positionLocked: false,
		sortOrder: null,
		createdBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

function makeEdge(sourceId: string, targetId: string, relationType: string = 'blocks'): NodeEdge {
	return {
		id: `edge-${sourceId}-${targetId}`,
		sourceId,
		targetId,
		relationType,
		weight: 1,
		source: 'human',
		createdAt: new Date()
	};
}

describe('compilePrompt', () => {
	it('ticket includes all sections', () => {
		const feature = makeNode({
			id: 'f1',
			type: 'feature',
			title: 'Auth System',
			layer: 4,
			payload: { targetOutcome: 'Users can log in' }
		});
		const epic = makeNode({
			id: 'e1',
			type: 'epic',
			title: 'OAuth Epic',
			layer: 3,
			parentId: 'f1'
		});
		const phase = makeNode({
			id: 'p1',
			type: 'phase',
			title: 'Backend Phase',
			layer: 2,
			parentId: 'e1',
			payload: { objective: 'Set up OAuth endpoints' }
		});
		const ticket = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Add login route',
			layer: 1,
			parentId: 'p1',
			payload: {
				intent: 'Create POST /api/login endpoint',
				filePaths: [{ path: 'src/routes/login.rs' }],
				acceptanceCriteria: ['Returns JWT on success', 'Returns 401 on bad creds']
			}
		});
		const sibling = makeNode({
			id: 't2',
			type: 'ticket',
			title: 'Add logout route',
			layer: 1,
			parentId: 'p1',
			status: 'active'
		});

		const allNodes = [feature, epic, phase, ticket, sibling];
		const edges: NodeEdge[] = [];

		const result = compilePrompt(ticket, allNodes, edges);

		expect(result).toContain('# Ticket: Add login route');
		expect(result).toContain('## Intent');
		expect(result).toContain('Create POST /api/login endpoint');
		expect(result).toContain('## Files to Touch');
		expect(result).toContain('src/routes/login.rs');
		expect(result).toContain('## Acceptance Criteria');
		expect(result).toContain('- [ ] Returns JWT on success');
		expect(result).toContain('## Upstream Context');
		expect(result).toContain('### Phase: Backend Phase');
		expect(result).toContain('Set up OAuth endpoints');
		expect(result).toContain('### Epic: OAuth Epic');
		expect(result).toContain('### Feature: Auth System');
		expect(result).toContain('Target outcome: Users can log in');
		expect(result).toContain('## Sibling Tickets');
		expect(result).toContain('Add logout route (active)');
		expect(result).toContain('## Branch Convention');
		expect(result).toContain('butterfly/');
		expect(result).toContain('## Butterfly Reference');
		expect(result).toContain('butterfly-ref: t1');
	});

	it('ticket includes dependencies', () => {
		const t1 = makeNode({ id: 't1', type: 'ticket', title: 'DB schema', status: 'done' });
		const t2 = makeNode({
			id: 't2',
			type: 'ticket',
			title: 'API handler',
			payload: { intent: 'Handle requests' }
		});
		const edges = [makeEdge('t1', 't2')];
		const result = compilePrompt(t2, [t1, t2], edges);

		expect(result).toContain('## Dependencies');
		expect(result).toContain('Blocked by: DB schema (done)');
	});

	it('phase batches tickets by dependency wave', () => {
		const phase = makeNode({
			id: 'p1',
			type: 'phase',
			title: 'Build Phase',
			layer: 2,
			payload: { objective: 'Build the thing' }
		});
		const t1 = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Schema',
			parentId: 'p1',
			payload: { intent: 'Create tables' }
		});
		const t2 = makeNode({
			id: 't2',
			type: 'ticket',
			title: 'API',
			parentId: 'p1',
			payload: { intent: 'Build endpoints' }
		});
		const t3 = makeNode({
			id: 't3',
			type: 'ticket',
			title: 'UI',
			parentId: 'p1',
			payload: { intent: 'Build frontend' }
		});
		// t1 blocks t2, t2 blocks t3
		const edges = [makeEdge('t1', 't2'), makeEdge('t2', 't3')];
		const allNodes = [phase, t1, t2, t3];

		const result = compilePrompt(phase, allNodes, edges);

		expect(result).toContain('# Phase: Build Phase (3 tickets)');
		expect(result).toContain('## Objective');
		expect(result).toContain('Build the thing');
		expect(result).toContain('## Execution Order');
		expect(result).toContain('Wave 1 (no dependencies)');
		expect(result).toContain('Wave 2 (after wave 1)');
		expect(result).toContain('Wave 3 (after wave 2)');

		// Verify ordering: Schema in wave 1, API in wave 2, UI in wave 3
		const schemaIdx = result.indexOf('Schema');
		const apiIdx = result.indexOf('API');
		const uiIdx = result.indexOf('#### 3. UI');
		expect(schemaIdx).toBeLessThan(apiIdx);
		expect(apiIdx).toBeLessThan(uiIdx);
	});

	it('epic includes full phase and ticket detail', () => {
		const epic = makeNode({ id: 'e1', type: 'epic', title: 'My Epic', layer: 3 });
		const p1 = makeNode({
			id: 'p1',
			type: 'phase',
			title: 'Phase 1',
			parentId: 'e1',
			status: 'done',
			payload: { objective: 'First step' }
		});
		const p2 = makeNode({
			id: 'p2',
			type: 'phase',
			title: 'Phase 2',
			parentId: 'e1',
			status: 'active',
			payload: { objective: 'Second step' }
		});
		const t1 = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Done ticket',
			parentId: 'p2',
			status: 'done',
			payload: { intent: 'Finish the thing' }
		});
		const t2 = makeNode({
			id: 't2',
			type: 'ticket',
			title: 'Open ticket',
			parentId: 'p2',
			status: 'draft',
			payload: { intent: 'Start the other thing', acceptanceCriteria: ['It works'] }
		});

		const result = compilePrompt(epic, [epic, p1, p2, t1, t2], []);

		expect(result).toContain('# Epic: My Epic');
		expect(result).toContain('## Phases');
		// Full phase detail
		expect(result).toContain('Phase: Phase 1 (done)');
		expect(result).toContain('Phase: Phase 2 (active)');
		expect(result).toContain('1/2 done');
		// Full ticket detail within phases
		expect(result).toContain('Done ticket');
		expect(result).toContain('**Intent:** Finish the thing');
		expect(result).toContain('Open ticket');
		expect(result).toContain('**Intent:** Start the other thing');
		expect(result).toContain('- [ ] It works');
	});

	it('feature includes full epic, phase, and ticket detail', () => {
		const feature = makeNode({
			id: 'f1',
			type: 'feature',
			title: 'Payments',
			layer: 4,
			payload: { targetOutcome: 'Accept payments' }
		});
		const epic = makeNode({
			id: 'e1',
			type: 'epic',
			title: 'Stripe',
			parentId: 'f1',
			status: 'active',
			payload: { openQuestions: ['Which plan?'] }
		});
		const phase = makeNode({
			id: 'p1',
			type: 'phase',
			title: 'Backend',
			parentId: 'e1',
			status: 'active',
			payload: { objective: 'Build API' }
		});
		const ticket = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Add webhook',
			parentId: 'p1',
			status: 'draft',
			payload: { intent: 'Handle Stripe events', acceptanceCriteria: ['Verifies signature'] }
		});

		const result = compilePrompt(feature, [feature, epic, phase, ticket], []);

		expect(result).toContain('# Feature: Payments');
		expect(result).toContain('## Target Outcome');
		expect(result).toContain('Accept payments');
		// Full epic detail
		expect(result).toContain('Epic: Stripe (active)');
		expect(result).toContain('Which plan?');
		// Full phase detail within epic
		expect(result).toContain('Phase: Backend (active)');
		expect(result).toContain('**Objective:** Build API');
		// Full ticket detail within phase
		expect(result).toContain('Add webhook');
		expect(result).toContain('**Intent:** Handle Stripe events');
		expect(result).toContain('- [ ] Verifies signature');
	});

	it('canvas note uses generic fallback', () => {
		const note = makeNode({
			id: 'n1',
			type: 'note',
			title: 'Random thought',
			body: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some idea' }] }]
			}
		});

		const result = compilePrompt(note, [note], []);

		expect(result).toContain('# Note: Random thought');
		expect(result).toContain('Some idea');
		expect(result).toContain('## Butterfly Reference');
		expect(result).not.toContain('## Upstream Context');
	});

	it('butterfly ref block contains valid JSON', () => {
		const ticket = makeNode({
			id: 'abc-123',
			type: 'ticket',
			title: 'Test ticket'
		});

		const result = compilePrompt(ticket, [ticket], []);
		const match = result.match(/<!-- butterfly-ref: ({.*?}) -->/);

		expect(match).not.toBeNull();
		const parsed = JSON.parse(match![1]);
		expect(parsed.nodeId).toBe('abc-123');
		expect(parsed.type).toBe('ticket');
		expect(parsed.title).toBe('Test ticket');
		expect(parsed.path).toBeInstanceOf(Array);
	});

	it('handles null payload without crashing', () => {
		const ticket = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Empty ticket',
			payload: null
		});

		const result = compilePrompt(ticket, [ticket], []);

		expect(result).toContain('# Ticket: Empty ticket');
		expect(result).toContain('## Butterfly Reference');
	});

	it('handles missing parent gracefully', () => {
		const ticket = makeNode({
			id: 't1',
			type: 'ticket',
			title: 'Orphan ticket',
			parentId: 'nonexistent'
		});

		const result = compilePrompt(ticket, [ticket], []);

		expect(result).toContain('# Ticket: Orphan ticket');
		expect(result).not.toContain('## Upstream Context');
		expect(result).toContain('## Butterfly Reference');
	});
});
