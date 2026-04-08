/**
 * Provider Registry for Mode A (browser-only).
 *
 * Reads API keys from localStorage. Routes requests to the best available
 * provider based on capability. Falls back gracefully when no keys are set.
 */

import { logInfo, logWarn, logError } from '$lib/stores/log.svelte';

export type Capability =
	| 'classification'
	| 'edge_inference'
	| 'embedding'
	| 'synthesis'
	| 'brain_dump';

export interface ProviderConfig {
	name: string;
	apiKey: string;
}

export interface ModelResponse {
	text: string;
	model: string;
	tokens: number;
}

const LS_KEY = 'atlas_provider_keys';
const MODEL_PREFS_KEY = 'atlas_model_prefs';

// Preferred providers by capability (first = best)
const CAPABILITY_PREFERENCE: Record<Capability, string[]> = {
	classification: ['anthropic', 'openai'],
	edge_inference: ['openai', 'anthropic'],
	embedding: ['openai', 'anthropic'],
	synthesis: ['anthropic', 'openai'],
	brain_dump: ['anthropic', 'openai']
};

// Cheapest defaults for all tasks
const DEFAULT_MODELS: Record<string, Record<Capability, string>> = {
	anthropic: {
		classification: 'claude-haiku-4-5-20251001',
		edge_inference: 'claude-haiku-4-5-20251001',
		embedding: 'claude-haiku-4-5-20251001',
		synthesis: 'claude-haiku-4-5-20251001',
		brain_dump: 'claude-haiku-4-5-20251001'
	},
	openai: {
		classification: 'gpt-4o-mini',
		edge_inference: 'gpt-4o-mini',
		embedding: 'text-embedding-3-small',
		synthesis: 'gpt-4o-mini',
		brain_dump: 'gpt-4o-mini'
	}
};

/** Available models per provider, shown in Settings. */
export const AVAILABLE_MODELS: Record<string, Array<{ id: string; label: string }>> = {
	anthropic: [
		{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (cheapest)' },
		{ id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
		{ id: 'claude-opus-4-6', label: 'Opus 4.6' }
	],
	openai: [
		{ id: 'gpt-4o-mini', label: 'GPT-4o Mini (cheapest)' },
		{ id: 'gpt-4o', label: 'GPT-4o' },
		{ id: 'o1-mini', label: 'o1 Mini' }
	]
};

/** Capability labels shown in Settings. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
	classification: 'Classify & tag notes',
	edge_inference: 'Infer edges',
	synthesis: 'Synthesize epics',
	brain_dump: 'Brain dump',
	embedding: 'Embeddings (internal)'
};

type ModelPrefs = Partial<Record<string, Partial<Record<Capability, string>>>>;

export function getModelPrefs(): ModelPrefs {
	try {
		const raw = localStorage.getItem(MODEL_PREFS_KEY);
		return raw ? (JSON.parse(raw) as ModelPrefs) : {};
	} catch {
		return {};
	}
}

export function setModelPref(provider: string, capability: Capability, modelId: string): void {
	const prefs = getModelPrefs();
	prefs[provider] ??= {};
	prefs[provider]![capability] = modelId;
	localStorage.setItem(MODEL_PREFS_KEY, JSON.stringify(prefs));
}

export function getDefaultModel(provider: string, capability: Capability): string {
	return DEFAULT_MODELS[provider]?.[capability] ?? 'unknown';
}

/** Get stored provider configs from localStorage. */
export function getProviders(): ProviderConfig[] {
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as ProviderConfig[];
	} catch {
		return [];
	}
}

/** Save a provider API key. */
export function setProviderKey(name: string, apiKey: string): void {
	const providers = getProviders().filter((p) => p.name !== name);
	providers.push({ name, apiKey });
	localStorage.setItem(LS_KEY, JSON.stringify(providers));
}

/** Remove a provider API key. */
export function removeProviderKey(name: string): void {
	const providers = getProviders().filter((p) => p.name !== name);
	localStorage.setItem(LS_KEY, JSON.stringify(providers));
}

/** Check if any provider is configured. */
export function hasProviders(): boolean {
	return getProviders().length > 0;
}

/** Find the best provider for a capability. Returns null if none available. */
export function getProviderForCapability(
	capability: Capability
): (ProviderConfig & { model: string }) | null {
	const providers = getProviders();
	if (providers.length === 0) {
		logWarn(
			'providers',
			`No API keys configured — ${capability} will use heuristics`,
			'Add a key in Settings (⚙)'
		);
		return null;
	}

	const prefs = getModelPrefs();
	const preferred = CAPABILITY_PREFERENCE[capability];
	for (const name of preferred) {
		const provider = providers.find((p) => p.name === name);
		if (provider) {
			const model = prefs[name]?.[capability] ?? DEFAULT_MODELS[name]?.[capability] ?? 'unknown';
			return { ...provider, model };
		}
	}

	// Fallback to any available provider
	const fallback = providers[0];
	const model =
		prefs[fallback.name]?.[capability] ?? DEFAULT_MODELS[fallback.name]?.[capability] ?? 'unknown';
	return { ...fallback, model };
}

/** Call the Anthropic Messages API. */
async function callAnthropic(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userMessage: string,
	maxTokens = 1024
): Promise<ModelResponse> {
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'anthropic-dangerous-direct-browser-access': 'true'
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			system: systemPrompt,
			messages: [{ role: 'user', content: userMessage }]
		})
	});

	if (!res.ok) {
		const body = await res.text();
		const err = `Anthropic API error ${res.status}: ${body}`;
		logError('providers', `Anthropic ${model} failed`, err);
		throw new Error(err);
	}

	const data = await res.json();
	const text = data.content?.[0]?.text ?? '';
	const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
	logInfo('providers', `Anthropic ${model} responded (${tokens} tokens)`);
	return { text, model, tokens };
}

/** Call the OpenAI Chat API. */
async function callOpenAI(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userMessage: string,
	maxTokens = 1024
): Promise<ModelResponse> {
	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			]
		})
	});

	if (!res.ok) {
		const body = await res.text();
		const err = `OpenAI API error ${res.status}: ${body}`;
		logError('providers', `OpenAI ${model} failed`, err);
		throw new Error(err);
	}

	const data = await res.json();
	const text = data.choices?.[0]?.message?.content ?? '';
	const tokens = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
	logInfo('providers', `OpenAI ${model} responded (${tokens} tokens)`);
	return { text, model, tokens };
}

/**
 * Call an LLM with the given system prompt and user message.
 * Routes to the best available provider for the given capability.
 * Returns null if no provider is available.
 */
export async function callModel(
	capability: Capability,
	systemPrompt: string,
	userMessage: string,
	maxTokens = 1024
): Promise<ModelResponse | null> {
	const provider = getProviderForCapability(capability);
	if (!provider) return null;

	logInfo('providers', `Calling ${provider.name} (${provider.model}) for ${capability}`);

	switch (provider.name) {
		case 'anthropic':
			return callAnthropic(provider.apiKey, provider.model, systemPrompt, userMessage, maxTokens);
		case 'openai':
			return callOpenAI(provider.apiKey, provider.model, systemPrompt, userMessage, maxTokens);
		default:
			logWarn('providers', `Unknown provider "${provider.name}" — skipping`);
			return null;
	}
}
