<script lang="ts">
	import {
		getProviders,
		setProviderKey,
		removeProviderKey,
		getModelPrefs,
		setModelPref,
		getDefaultModel,
		AVAILABLE_MODELS,
		CAPABILITY_LABELS,
		type ProviderConfig,
		type Capability
	} from '$lib/agents/providers';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let providers = $state<ProviderConfig[]>(getProviders());
	let anthropicKey = $state(providers.find((p) => p.name === 'anthropic')?.apiKey ?? '');
	let openaiKey = $state(providers.find((p) => p.name === 'openai')?.apiKey ?? '');
	let saved = $state(false);
	let modelPrefs = $state(getModelPrefs());

	// Capabilities shown in the model section (hide embedding — internal)
	const VISIBLE_CAPABILITIES: Array<{ key: Capability; label: string }> = [
		{ key: 'classification', label: CAPABILITY_LABELS.classification },
		{ key: 'synthesis', label: CAPABILITY_LABELS.synthesis },
		{ key: 'edge_inference', label: CAPABILITY_LABELS.edge_inference },
		{ key: 'brain_dump', label: CAPABILITY_LABELS.brain_dump }
	];

	function getModelValue(providerName: string, cap: Capability): string {
		return modelPrefs[providerName]?.[cap] ?? getDefaultModel(providerName, cap);
	}

	function handleModelChange(providerName: string, cap: Capability, modelId: string) {
		setModelPref(providerName, cap, modelId);
		modelPrefs = getModelPrefs();
	}

	function handleSave() {
		if (anthropicKey.trim()) {
			setProviderKey('anthropic', anthropicKey.trim());
		} else {
			removeProviderKey('anthropic');
		}

		if (openaiKey.trim()) {
			setProviderKey('openai', openaiKey.trim());
		} else {
			removeProviderKey('openai');
		}

		providers = getProviders();
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	let configuredProviders = $derived(providers.filter((p) => AVAILABLE_MODELS[p.name]));
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
	<div class="panel" onclick={(e) => e.stopPropagation()}>
		<div class="header">
			<h2>Settings</h2>
			<button class="close-btn" onclick={onClose}>×</button>
		</div>

		<!-- API Keys -->
		<div class="section">
			<h3>API Keys</h3>
			<p class="hint">Keys are stored in your browser's localStorage — never sent to any server.</p>

			<label class="field">
				<span class="label">Anthropic API Key</span>
				<input
					type="password"
					class="input mono"
					placeholder="sk-ant-..."
					bind:value={anthropicKey}
				/>
			</label>

			<label class="field">
				<span class="label">OpenAI API Key</span>
				<input type="password" class="input mono" placeholder="sk-..." bind:value={openaiKey} />
			</label>
		</div>

		<!-- Model selector — only shown when at least one provider is configured -->
		{#if configuredProviders.length > 0}
			<div class="section">
				<h3>Models</h3>
				<p class="hint">Choose which model handles each task. Defaults to cheapest available.</p>

				{#each configuredProviders as provider}
					<div class="provider-block">
						<div class="provider-name">
							{provider.name === 'anthropic' ? 'Anthropic' : 'OpenAI'}
						</div>
						{#each VISIBLE_CAPABILITIES as { key, label }}
							<label class="field row">
								<span class="label">{label}</span>
								<select
									class="input select"
									value={getModelValue(provider.name, key)}
									onchange={(e) => handleModelChange(provider.name, key, e.currentTarget.value)}
								>
									{#each AVAILABLE_MODELS[provider.name] as m}
										<option value={m.id}>{m.label}</option>
									{/each}
								</select>
							</label>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		<div class="actions">
			{#if saved}
				<span class="saved-msg">Saved</span>
			{/if}
			<button class="save-btn" onclick={handleSave}>Save</button>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 5000;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.panel {
		width: 480px;
		max-height: 85vh;
		overflow-y: auto;
		background: #141414;
		border: 1px solid #262626;
		border-radius: 12px;
		padding: 20px 24px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.header h2 {
		font-size: 16px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		color: #525252;
		font-size: 20px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	.close-btn:hover {
		color: #a3a3a3;
	}

	.section {
		margin-bottom: 24px;
	}

	.section h3 {
		font-size: 11px;
		font-weight: 600;
		color: #737373;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 6px;
	}

	.hint {
		font-size: 11px;
		color: #525252;
		line-height: 1.4;
		margin: 0 0 14px;
	}

	.provider-block {
		margin-bottom: 16px;
		border: 1px solid #1f1f1f;
		border-radius: 8px;
		overflow: hidden;
	}

	.provider-name {
		font-size: 10px;
		font-weight: 600;
		color: #525252;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 6px 12px;
		background: #0f0f0f;
	}

	.provider-block .field {
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		margin: 0;
	}

	.provider-block .field:last-child {
		border-bottom: none;
	}

	.field {
		display: block;
		margin-bottom: 12px;
	}

	.field.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.label {
		display: block;
		font-size: 11px;
		color: #737373;
		margin-bottom: 4px;
	}

	.field.row .label {
		margin-bottom: 0;
		flex: 1;
	}

	.input {
		width: 100%;
		padding: 7px 10px;
		font-size: 12px;
		background: #0a0a0a;
		border: 1px solid #262626;
		border-radius: 6px;
		color: #e5e5e5;
		outline: none;
	}

	.input.mono {
		font-family: monospace;
	}

	.input.select {
		width: auto;
		min-width: 180px;
		cursor: pointer;
	}

	.input:focus {
		border-color: #525252;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid #1f1f1f;
	}

	.saved-msg {
		font-size: 11px;
		color: #22c55e;
	}

	.save-btn {
		padding: 6px 16px;
		font-size: 12px;
		font-weight: 600;
		background: #6366f1;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}

	.save-btn:hover {
		background: #4f46e5;
	}
</style>
