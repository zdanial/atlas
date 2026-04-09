import { describe, it, expect } from 'vitest';
import { parseChatResponse } from './chat-response';

describe('parseChatResponse', () => {
	it('parses a valid JSON response', () => {
		const raw = JSON.stringify({
			message: 'Here are my thoughts.',
			cardBody: '## Summary\n- Point one\n- Point two'
		});

		const resp = parseChatResponse(raw);

		expect(resp.message).toBe('Here are my thoughts.');
		expect(resp.cardBody).toBe('## Summary\n- Point one\n- Point two');
		expect(resp.proposals).toBeUndefined();
	});

	it('parses JSON from a ```json code block', () => {
		const raw = `\`\`\`json
{
  "message": "Got it.",
  "cardBody": "Updated content."
}
\`\`\``;

		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('Got it.');
		expect(resp.cardBody).toBe('Updated content.');
	});

	it('extracts JSON from surrounding text', () => {
		const raw = `Sure, here's the update: {"message": "Done.", "cardBody": "New body"} Hope that helps!`;
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('Done.');
		expect(resp.cardBody).toBe('New body');
	});

	it('falls back to plain message when no JSON found', () => {
		const raw = 'Just a normal text response with no structure.';
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe(raw);
		expect(resp.cardBody).toBeUndefined();
		expect(resp.proposals).toBeUndefined();
	});

	it('parses proposals correctly', () => {
		const raw = JSON.stringify({
			message: 'Here are some proposed changes.',
			cardBody: 'Updated note.',
			proposals: [
				{
					rationale: 'Break out sub-topics',
					items: [
						{
							op: 'create_node',
							data: { type: 'note', layer: 5, projectId: 'p1', title: 'Sub-topic A' },
							_summary: 'Create note for sub-topic A'
						},
						{
							op: 'update_node',
							nodeId: 'n1',
							patch: { status: 'active' },
							_summary: 'Activate node'
						}
					]
				}
			]
		});

		const resp = parseChatResponse(raw);

		expect(resp.proposals).toHaveLength(1);
		expect(resp.proposals![0].id).toBe('proposal_0');
		expect(resp.proposals![0].rationale).toBe('Break out sub-topics');
		expect(resp.proposals![0].items).toHaveLength(2);
		expect(resp.proposals![0].items[0].op).toBe('create_node');
		expect(resp.proposals![0].items[1].op).toBe('update_node');
	});

	it('parses cardMeta for new notes', () => {
		const raw = JSON.stringify({
			message: 'Great idea! I named it for you.',
			cardMeta: {
				title: 'Public Sentiment Analysis',
				type: 'idea',
				tags: ['research', 'community']
			},
			cardBody: '## Purpose\nGauge community support.'
		});

		const resp = parseChatResponse(raw);

		expect(resp.cardMeta?.title).toBe('Public Sentiment Analysis');
		expect(resp.cardMeta?.type).toBe('idea');
		expect(resp.cardMeta?.tags).toEqual(['research', 'community']);
	});

	it('parses cardPayload for planning nodes', () => {
		const raw = JSON.stringify({
			message: 'Updated the acceptance criteria.',
			cardBody: 'Implement OAuth flow.',
			cardPayload: { acceptanceCriteria: ['Login works', 'Tokens refresh'] }
		});

		const resp = parseChatResponse(raw);
		expect(resp.cardPayload).toEqual({ acceptanceCriteria: ['Login works', 'Tokens refresh'] });
	});

	it('defaults _summary to "Change" when missing', () => {
		const raw = JSON.stringify({
			message: 'Changes proposed.',
			proposals: [
				{
					rationale: 'Test',
					items: [{ op: 'delete_node', nodeId: 'x' }]
				}
			]
		});

		const resp = parseChatResponse(raw);
		expect(resp.proposals![0].items[0]._summary).toBe('Change');
	});

	it('handles empty message field', () => {
		const raw = JSON.stringify({
			cardBody: 'Content without message.'
		});

		const resp = parseChatResponse(raw);
		expect(resp.message).toBe('');
		expect(resp.cardBody).toBe('Content without message.');
	});

	it('handles malformed JSON gracefully', () => {
		const raw = '{"message": "incomplete';
		const resp = parseChatResponse(raw);
		// Falls back to treating as plain text
		expect(resp.message).toBe(raw);
	});

	it('ignores non-object JSON (arrays, strings)', () => {
		const raw = '["not", "an", "object"]';
		const resp = parseChatResponse(raw);
		expect(resp.message).toBe(raw);
	});
});
