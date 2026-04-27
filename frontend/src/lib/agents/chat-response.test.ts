import { describe, it, expect } from 'vitest';
import { parseChatResponse } from './chat-response';

describe('parseChatResponse', () => {
	it('parses a valid JSON response with proposals', () => {
		const raw = JSON.stringify({
			message: 'Here are my thoughts.',
			proposals: [
				{
					summary: 'Update note body',
					rationale: 'Adding analysis',
					op: { type: 'update_node', nodeId: 'n1', changes: { body: '## Summary' } }
				}
			]
		});

		const resp = parseChatResponse(raw);

		expect(resp.message).toBe('Here are my thoughts.');
		expect(resp.proposals).toHaveLength(1);
		expect(resp.proposals[0].op.type).toBe('update_node');
	});

	it('parses JSON from a ```json code block', () => {
		const raw = `\`\`\`json
{
  "message": "Got it.",
  "proposals": []
}
\`\`\``;

		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('Got it.');
		expect(resp.proposals).toHaveLength(0);
	});

	it('extracts JSON from surrounding text', () => {
		const raw = `Sure, here's the update: {"message": "Done.", "proposals": []} Hope that helps!`;
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('Done.');
	});

	it('falls back to plain message when no JSON found', () => {
		const raw = 'Just a normal text response with no structure.';
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe(raw);
		expect(resp.proposals).toHaveLength(0);
	});

	it('parses new-format proposals correctly', () => {
		const raw = JSON.stringify({
			message: 'Here are some proposed changes.',
			proposals: [
				{
					summary: 'Create note for sub-topic A',
					rationale: 'Break out sub-topics',
					op: {
						type: 'create_node',
						data: { nodeType: 'note', layer: 5, title: 'Sub-topic A', body: '' }
					}
				},
				{
					summary: 'Activate node',
					rationale: 'Ready to work on',
					op: { type: 'update_node', nodeId: 'n1', changes: { status: 'active' } }
				}
			]
		});

		const resp = parseChatResponse(raw);

		expect(resp.proposals).toHaveLength(2);
		expect(resp.proposals[0].summary).toBe('Create note for sub-topic A');
		expect(resp.proposals[0].op.type).toBe('create_node');
		expect(resp.proposals[1].op.type).toBe('update_node');
	});

	it('resolves CURRENT nodeId to provided currentNodeId', () => {
		const raw = JSON.stringify({
			message: 'Updated.',
			proposals: [
				{
					summary: 'Update body',
					rationale: 'test',
					op: { type: 'update_node', nodeId: 'CURRENT', changes: { body: 'new' } }
				}
			]
		});

		const resp = parseChatResponse(raw, 'real-node-id');
		const op = resp.proposals[0].op;
		expect(op.type).toBe('update_node');
		if (op.type === 'update_node') {
			expect(op.nodeId).toBe('real-node-id');
		}
	});

	it('backward compat: converts old cardBody to update_node proposal', () => {
		const raw = JSON.stringify({
			message: 'Great idea!',
			cardBody: '## Purpose\nGauge community support.'
		});

		const resp = parseChatResponse(raw, 'node-123');
		expect(resp.proposals.length).toBeGreaterThan(0);
		const bodyProposal = resp.proposals.find(
			(p) => p.op.type === 'update_node' && 'changes' in p.op && p.op.changes.body
		);
		expect(bodyProposal).toBeDefined();
	});

	it('backward compat: converts old cardMeta to update_node proposal', () => {
		const raw = JSON.stringify({
			message: 'Named it for you.',
			cardMeta: {
				title: 'Public Sentiment Analysis',
				type: 'idea',
				tags: ['research', 'community']
			}
		});

		const resp = parseChatResponse(raw, 'node-123');
		const metaProposal = resp.proposals.find(
			(p) => p.op.type === 'update_node' && 'changes' in p.op && p.op.changes.title
		);
		expect(metaProposal).toBeDefined();
	});

	it('backward compat: converts old cardPayload to update_node proposal', () => {
		const raw = JSON.stringify({
			message: 'Updated the acceptance criteria.',
			cardPayload: { acceptanceCriteria: ['Login works', 'Tokens refresh'] }
		});

		const resp = parseChatResponse(raw, 'node-123');
		const payloadProposal = resp.proposals.find(
			(p) => p.op.type === 'update_node' && 'changes' in p.op && p.op.changes.payload
		);
		expect(payloadProposal).toBeDefined();
	});

	it('backward compat: converts legacy proposal items format', () => {
		const raw = JSON.stringify({
			message: 'Changes proposed.',
			proposals: [
				{
					rationale: 'Test',
					items: [{ op: 'delete_node', nodeId: 'x', _summary: 'Remove node' }]
				}
			]
		});

		const resp = parseChatResponse(raw);
		expect(resp.proposals).toHaveLength(1);
		expect(resp.proposals[0].op.type).toBe('delete_node');
	});

	it('handles empty message field', () => {
		const raw = JSON.stringify({
			proposals: []
		});

		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('');
	});

	it('handles malformed JSON gracefully', () => {
		const raw = '{"message": "incomplete';
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe(raw);
	});

	it('ignores non-object JSON (arrays, strings)', () => {
		const raw = '["not", "an", "object"]';
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe(raw);
	});
});
