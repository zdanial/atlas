/**
 * Connector Classifier Agent
 *
 * Takes a note's title (and optional body text) and returns a classified type
 * with confidence. Uses LLM when available, falls back to heuristic rules.
 */

import { callModel, type ModelResponse } from './providers';
import type { NodeType } from '$lib/schemas/node';
import { NODE_TYPES } from '$lib/schemas/node';
import { logInfo, logWarn, logError } from '$lib/stores/log.svelte';

export interface ClassificationResult {
	type: NodeType;
	confidence: number;
	reason: string;
	tags: string[];
	body?: string | null;
	source: 'ai' | 'heuristic';
	model?: string;
	tokens?: number;
}

// Canvas-level types the classifier should output (not structural types like intent/epic/phase/ticket)
const CLASSIFIABLE_TYPES: NodeType[] = [
	'goal',
	'problem',
	'hypothesis',
	'idea',
	'constraint',
	'decision',
	'question',
	'risk',
	'insight',
	'reference',
	'bet',
	'note'
];

function buildSystemPrompt(
	hasBody: boolean,
	globalContext?: string,
	existingTags?: string[]
): string {
	const contextSection = globalContext?.trim()
		? `\nProject context (for background):\n${globalContext.trim()}\n`
		: '';

	const bodyInstruction = hasBody
		? 'Set "body" to null (the note already has content).'
		: `If the body is empty, write a 1-2 sentence body appropriate for the type:
- goal: describe the desired outcome and what success looks like
- problem: describe the issue and its impact
- idea: describe the approach and key benefit
- hypothesis: frame as "We believe X will result in Y"
- constraint: state what is limited and why
- decision: state what was decided and the key reason
- question: clarify what needs answering and why it matters
- risk: describe what could go wrong and the potential impact
- insight: state the realization and what it implies
- reference: describe what the resource covers
- bet: frame as "We bet X will lead to Y because Z"
- note: brief description of the content`;

	return `You are a note processor for Atlas, a spatial thinking canvas.${contextSection}

Given a note's title and optional existing body, you must:
1. Classify into ONE of: goal, problem, hypothesis, idea, constraint, decision, question, risk, insight, reference, bet, note
2. Generate 2-5 short lowercase tags (single words or hyphenated phrases) representing project areas.${existingTags && existingTags.length > 0 ? ` Prefer tags from this existing list: [${existingTags.join(', ')}]. Only create new tags if none fit.` : ''}
3. ${bodyInstruction}

Respond with ONLY a JSON object (no markdown):
{"type": "<type>", "confidence": <0.0-1.0>, "reason": "<one sentence>", "tags": ["tag1", "tag2"], "body": "<text or null>"}`;
}

export interface ClassifyOptions {
	globalContext?: string;
	existingTags?: string[];
}

/**
 * Classify a note using LLM (preferred) or heuristic fallback.
 * When LLM is available and body is empty, also generates body content.
 */
export async function classifyNote(
	title: string,
	bodyText?: string,
	opts: ClassifyOptions = {}
): Promise<ClassificationResult> {
	const hasBody = !!bodyText?.trim();

	// Try LLM classification first
	try {
		const result = await classifyWithLLM(
			title,
			bodyText,
			hasBody,
			opts.globalContext,
			opts.existingTags
		);
		if (result) {
			logInfo(
				'classifier',
				`LLM → "${title}" = ${result.type} (${Math.round(result.confidence * 100)}%)`,
				result.reason
			);
			return result;
		}
		// null means no provider configured — fall through silently
	} catch (e) {
		logError('classifier', `LLM classification failed for "${title}"`, String(e));
	}

	// Heuristic fallback
	const result = classifyWithHeuristics(title, bodyText);
	logInfo(
		'classifier',
		`Heuristic → "${title}" = ${result.type} (${Math.round(result.confidence * 100)}%)`,
		result.reason
	);
	return result;
}

/**
 * LLM-based classification + body generation. Returns null if no provider available.
 */
async function classifyWithLLM(
	title: string,
	bodyText?: string,
	hasBody = false,
	globalContext?: string,
	existingTags?: string[]
): Promise<ClassificationResult | null> {
	const systemPrompt = buildSystemPrompt(hasBody, globalContext, existingTags);
	const userMessage = bodyText ? `Title: ${title}\nBody: ${bodyText}` : `Title: ${title}`;

	const response = await callModel('classification', systemPrompt, userMessage, 512);
	if (!response) return null;

	return parseClassificationResponse(response);
}

function parseClassificationResponse(response: ModelResponse): ClassificationResult | null {
	try {
		// Extract JSON from response (handle potential markdown wrapping)
		let text = response.text.trim();
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) text = jsonMatch[0];

		const parsed = JSON.parse(text);

		// Validate type
		const type = parsed.type as NodeType;
		if (!CLASSIFIABLE_TYPES.includes(type)) {
			logWarn(
				'classifier',
				`LLM returned unknown type "${parsed.type}" — discarding`,
				response.text.slice(0, 200)
			);
			return null;
		}

		const rawTags = parsed.tags;
		const tags: string[] = Array.isArray(rawTags)
			? rawTags
					.map((t: unknown) => String(t).toLowerCase().trim().replace(/\s+/g, '-'))
					.filter((t: string) => t.length > 0 && t.length <= 40)
					.slice(0, 8)
			: [];

		const body =
			typeof parsed.body === 'string' && parsed.body.trim().length > 0 ? parsed.body.trim() : null;

		return {
			type,
			confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
			reason: String(parsed.reason || 'AI classification'),
			tags,
			body,
			source: 'ai',
			model: response.model,
			tokens: response.tokens
		};
	} catch (e) {
		logError(
			'classifier',
			'Failed to parse LLM response',
			`${String(e)}\nRaw: ${response.text.slice(0, 200)}`
		);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Heuristic classifier (no API key needed)
// ---------------------------------------------------------------------------

interface HeuristicRule {
	type: NodeType;
	patterns: RegExp[];
	confidence: number;
	tags: string[];
}

const HEURISTIC_RULES: HeuristicRule[] = [
	{
		type: 'idea',
		patterns: [
			/\bwhat if\b/i,
			/\b(idea|could|maybe|how about|suggest|proposal|approach|try|consider)\b/i
		],
		confidence: 0.65,
		tags: ['idea', 'proposal']
	},
	{
		type: 'question',
		patterns: [
			/^\?/,
			/\?$/,
			/^(how|why|when|where|which|should|can|is|are|do|does)\b/i,
			/^what\b(?!\s+if)/i
		],
		confidence: 0.85,
		tags: ['question', 'open-question']
	},
	{
		type: 'goal',
		patterns: [/\b(goal|objective|target|aim|want to|need to|must|achieve|ship|launch|deliver)\b/i],
		confidence: 0.7,
		tags: ['goal', 'outcome']
	},
	{
		type: 'problem',
		patterns: [
			/\b(problem|issue|bug|broken|failing|pain|blocker|doesn't work|can't|crash|error)\b/i
		],
		confidence: 0.75,
		tags: ['problem', 'blocker']
	},
	{
		type: 'risk',
		patterns: [/\b(risk|danger|threat|could fail|might break|worried|concern|vulnerability)\b/i],
		confidence: 0.75,
		tags: ['risk', 'concern']
	},
	{
		type: 'decision',
		patterns: [/\b(decid|decision|chose|choice|pick|selected|go with|use .+ (not|instead|over))/i],
		confidence: 0.7,
		tags: ['decision', 'resolved']
	},
	{
		type: 'constraint',
		patterns: [/\b(constraint|limitation|must not|cannot|required|mandatory|compliance|legal)\b/i],
		confidence: 0.75,
		tags: ['constraint', 'requirement']
	},
	{
		type: 'hypothesis',
		patterns: [
			/\b(hypothes|if we|assume|predict|expect|theory|believe that|suppose)\b/i,
			/^(if|assuming)\b/i
		],
		confidence: 0.7,
		tags: ['hypothesis', 'assumption']
	},
	{
		type: 'insight',
		patterns: [
			/\b(insight|realized|learned|discovered|turns out|actually|interesting|aha|key finding)\b/i,
			/^!/
		],
		confidence: 0.7,
		tags: ['insight', 'learning']
	},
	{
		type: 'reference',
		patterns: [/\bhttps?:\/\//, /\b(reference|see also|link|doc|resource|article|paper)\b/i],
		confidence: 0.8,
		tags: ['reference', 'external']
	},
	{
		type: 'bet',
		patterns: [/\b(bet|wager|gamble|stake|bet that|betting on)\b/i],
		confidence: 0.7,
		tags: ['bet', 'strategy']
	}
];

/**
 * Classify using keyword/pattern matching. Always returns a result.
 */
export function classifyWithHeuristics(title: string, bodyText?: string): ClassificationResult {
	const text = bodyText ? `${title} ${bodyText}` : title;

	let bestMatch: { type: NodeType; confidence: number; reason: string; tags: string[] } | null =
		null;

	for (const rule of HEURISTIC_RULES) {
		for (const pattern of rule.patterns) {
			if (pattern.test(text)) {
				if (!bestMatch || rule.confidence > bestMatch.confidence) {
					bestMatch = {
						type: rule.type,
						confidence: rule.confidence,
						reason: `Matched pattern: ${pattern.source}`,
						tags: rule.tags
					};
				}
				break; // Only need one match per rule
			}
		}
	}

	if (bestMatch) {
		return { ...bestMatch, source: 'heuristic' };
	}

	// Default to 'note' if nothing matches
	return {
		type: 'note',
		confidence: 0.3,
		reason: 'No strong pattern match — defaulting to note',
		tags: ['unclassified'],
		source: 'heuristic'
	};
}
