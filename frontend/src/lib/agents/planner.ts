/**
 * Planner agent — uses Claude Code container for plan generation.
 *
 * Composes planning-specific prompts using existing context utilities,
 * calls the Claude Code service, and parses the response into proposals.
 */

import { callClaudeCode, type ClaudeModel } from '$lib/services/claude-code';
import { compileContextForLLM } from '$lib/context-compiler';
import { getStructuredContext } from '$lib/stores/globalContext.svelte';
import { responseFormatInstructions, parseChatResponse, type ChatResponse } from './chat-response';

export interface PlanRequest {
	projectId: string;
	currentNodeId: string;
	userPrompt: string;
	/** Formatted listing of existing planning nodes for context */
	nodeListing?: string;
	/** Override the default model (sonnet) */
	model?: ClaudeModel;
	/** Is this a planning node (decomposition) or a note (exploration)? */
	isPlanningNode?: boolean;
}

/**
 * Generate a plan using the Claude Code container service.
 * Returns a ChatResponse with message + proposals[].
 */
export async function generatePlan(opts: PlanRequest): Promise<ChatResponse> {
	const ctx = getStructuredContext();
	const compiledContext = compileContextForLLM(ctx);

	const formatInstructions = responseFormatInstructions({
		projectId: opts.projectId,
		currentNodeId: opts.currentNodeId,
		isNew: false,
		isPlanningNode: opts.isPlanningNode ?? true,
		nodeListing: opts.nodeListing
	});

	const preamble = opts.isPlanningNode
		? 'You are a planning decomposition assistant. Break work into concrete, actionable pieces. Always propose the next level of breakdown.'
		: 'You are a thinking partner helping explore and organize ideas. Identify distinct threads that deserve their own nodes.';

	const systemPrompt = [preamble, '## Project Context', compiledContext, formatInstructions]
		.filter(Boolean)
		.join('\n\n');

	const output = await callClaudeCode({
		systemPrompt,
		userPrompt: opts.userPrompt,
		model: opts.model ?? 'sonnet'
	});

	return parseChatResponse(output, opts.currentNodeId);
}

/**
 * Process a brain dump through Claude Code.
 * Takes raw text and returns structured proposals for nodes to create.
 */
export async function processBrainDump(opts: {
	text: string;
	projectId: string;
	model?: ClaudeModel;
}): Promise<ChatResponse> {
	const ctx = getStructuredContext();
	const compiledContext = compileContextForLLM(ctx);

	const systemPrompt = [
		'You are a brain dump processor. The user has shared raw thoughts, ideas, and notes.',
		'Your job is to identify distinct concepts and propose creating structured nodes for each one.',
		'Classify each into the right type: goal, problem, hypothesis, idea, constraint, decision, question, risk, insight, reference, or note.',
		'',
		'## Project Context',
		compiledContext,
		'',
		responseFormatInstructions({
			projectId: opts.projectId,
			currentNodeId: '',
			isNew: true,
			isPlanningNode: false
		})
	].join('\n');

	const output = await callClaudeCode({
		systemPrompt,
		userPrompt: opts.text,
		model: opts.model ?? 'sonnet'
	});

	return parseChatResponse(output);
}
