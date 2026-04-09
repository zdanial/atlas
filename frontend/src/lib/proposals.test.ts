import { describe, it, expect } from 'vitest';
import { parseProposals } from './proposals';

describe('parseProposals', () => {
	it('parses a valid proposals block', () => {
		const text = `Here are my suggestions.
<!--proposals:[{"rationale":"Auth refactor","items":[{"op":"update_node","nodeId":"abc","patch":{"title":"New Title"},"_summary":"Rename node"}]}]-->`;

		const { displayText, proposals } = parseProposals(text);

		expect(proposals).toHaveLength(1);
		expect(proposals[0].id).toBe('proposal_0');
		expect(proposals[0].rationale).toBe('Auth refactor');
		expect(proposals[0].items).toHaveLength(1);
		expect(proposals[0].items[0].op).toBe('update_node');
		expect(proposals[0].items[0]._summary).toBe('Rename node');
		expect(displayText).toBe('Here are my suggestions.');
	});

	it('strips proposals block from displayText', () => {
		const text = `Before.<!--proposals:[{"rationale":"","items":[]}]-->After.`;
		const { displayText } = parseProposals(text);
		expect(displayText).toBe('Before.After.');
	});

	it('returns empty array when no block present', () => {
		const text = 'Just a normal response with no proposals.';
		const { displayText, proposals } = parseProposals(text);

		expect(proposals).toHaveLength(0);
		expect(displayText).toBe(text);
	});

	it('handles malformed JSON gracefully', () => {
		const text = '<!--proposals:[{invalid json}]-->';
		const { displayText, proposals } = parseProposals(text);

		expect(proposals).toHaveLength(0);
		expect(displayText).toBe('');
	});

	it('handles multiple proposals in array', () => {
		const text = `<!--proposals:[
			{"rationale":"Option A","items":[{"op":"create_node","data":{"type":"ticket","layer":1,"projectId":"p1","title":"T1"},"_summary":"Create T1"}]},
			{"rationale":"Option B","items":[{"op":"delete_node","nodeId":"x","_summary":"Remove X"}]}
		]-->`;

		const { proposals } = parseProposals(text);

		expect(proposals).toHaveLength(2);
		expect(proposals[0].id).toBe('proposal_0');
		expect(proposals[0].rationale).toBe('Option A');
		expect(proposals[1].id).toBe('proposal_1');
		expect(proposals[1].rationale).toBe('Option B');
	});

	it('handles all ProposalItem op variants', () => {
		const text = `<!--proposals:[{"rationale":"Full test","items":[
			{"op":"create_node","data":{"type":"ticket","layer":1,"projectId":"p1","title":"New"},"_summary":"Create ticket"},
			{"op":"update_node","nodeId":"n1","patch":{"status":"active"},"_summary":"Activate node"},
			{"op":"delete_node","nodeId":"n2","_summary":"Remove node"},
			{"op":"create_edge","data":{"sourceId":"a","targetId":"b","relationType":"blocks"},"_summary":"Add edge"},
			{"op":"delete_edge","edgeId":"e1","_summary":"Remove edge"}
		]}]-->`;

		const { proposals } = parseProposals(text);
		expect(proposals[0].items).toHaveLength(5);
		expect(proposals[0].items.map((i) => i.op)).toEqual([
			'create_node',
			'update_node',
			'delete_node',
			'create_edge',
			'delete_edge'
		]);
	});

	it('composes with card-meta/card-payload blocks', () => {
		const text = `Response text.
<!--card-meta:{"title":"Updated"}-->
<!--card-payload:{"intent":"Do stuff"}-->
<!--proposals:[{"rationale":"Also update children","items":[{"op":"update_node","nodeId":"c1","patch":{"title":"Child"},"_summary":"Update child"}]}]-->`;

		const { displayText, proposals } = parseProposals(text);

		// proposals block is stripped, but card-meta/card-payload remain (handled by parseStructuredResponse)
		expect(proposals).toHaveLength(1);
		expect(displayText).toContain('<!--card-meta:');
		expect(displayText).toContain('<!--card-payload:');
		expect(displayText).not.toContain('<!--proposals:');
	});

	it('defaults missing _summary to "Change"', () => {
		const text = `<!--proposals:[{"rationale":"","items":[{"op":"delete_node","nodeId":"x"}]}]-->`;
		const { proposals } = parseProposals(text);

		expect(proposals[0].items[0]._summary).toBe('Change');
	});
});
