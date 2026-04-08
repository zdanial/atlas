import { describe, it, expect } from 'vitest';
import { classifyWithHeuristics } from './classifier';

describe('classifyWithHeuristics', () => {
	it('classifies questions by ? prefix', () => {
		const result = classifyWithHeuristics('?Should we use React or Svelte');
		expect(result.type).toBe('question');
		expect(result.confidence).toBeGreaterThanOrEqual(0.7);
		expect(result.source).toBe('heuristic');
	});

	it('classifies questions by trailing ?', () => {
		const result = classifyWithHeuristics('Which database should we use?');
		expect(result.type).toBe('question');
	});

	it('classifies questions by interrogative words', () => {
		const result = classifyWithHeuristics('How do we handle authentication');
		expect(result.type).toBe('question');
	});

	it('classifies goals', () => {
		const result = classifyWithHeuristics('Ship the MVP by June');
		expect(result.type).toBe('goal');
	});

	it('classifies goals with "launch"', () => {
		const result = classifyWithHeuristics('Launch payments v1');
		expect(result.type).toBe('goal');
	});

	it('classifies problems', () => {
		const result = classifyWithHeuristics('Login page is broken on mobile');
		expect(result.type).toBe('problem');
	});

	it('classifies risks', () => {
		const result = classifyWithHeuristics('Risk of LLM costs exploding');
		expect(result.type).toBe('risk');
	});

	it('classifies decisions', () => {
		const result = classifyWithHeuristics('Decided to use Svelte 5 runes');
		expect(result.type).toBe('decision');
	});

	it('classifies constraints', () => {
		const result = classifyWithHeuristics('Must stay AGPLv3 for compliance');
		expect(result.type).toBe('constraint');
	});

	it('classifies hypotheses', () => {
		const result = classifyWithHeuristics('If we cluster notes, users will find hidden themes');
		expect(result.type).toBe('hypothesis');
	});

	it('classifies ideas with "what if"', () => {
		const result = classifyWithHeuristics('What if the canvas auto-arranged notes');
		expect(result.type).toBe('idea');
	});

	it('classifies ideas with "maybe"', () => {
		const result = classifyWithHeuristics('Maybe add a drag-and-drop import flow');
		expect(result.type).toBe('idea');
	});

	it('classifies insights', () => {
		const result = classifyWithHeuristics('Realized brain dump is the killer onboarding flow');
		expect(result.type).toBe('insight');
	});

	it('classifies insights with ! prefix', () => {
		const result = classifyWithHeuristics('!This changes everything');
		expect(result.type).toBe('insight');
	});

	it('classifies references with URLs', () => {
		const result = classifyWithHeuristics('https://svelte.dev/blog/runes');
		expect(result.type).toBe('reference');
	});

	it('classifies bets', () => {
		const result = classifyWithHeuristics('Bet that open-source will win over proprietary');
		expect(result.type).toBe('bet');
	});

	it('defaults to note for unclassifiable text', () => {
		const result = classifyWithHeuristics('Random thought about stuff');
		expect(result.type).toBe('note');
		expect(result.confidence).toBeLessThan(0.5);
	});

	it('uses body text for classification when title is ambiguous', () => {
		const result = classifyWithHeuristics('Important note', 'This is a major risk to the project');
		expect(result.type).toBe('risk');
	});
});
