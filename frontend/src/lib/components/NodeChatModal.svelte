<script lang="ts">
	import { callChat, hasProviders, type ChatMessage } from '$lib/agents/providers';
	import { parseChatResponse, responseFormatInstructions } from '$lib/agents/chat-response';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';
	import { getProjectNodes, getAllEdges as getProjectEdges } from '$lib/stores/nodes.svelte';
	import { walkThread, buildThreadPrompt } from '$lib/agents/thread-context';
	import { addInboxItem } from '$lib/stores/inboxStore.svelte';
	import { extractBodyText, getNodeTypeConfig, NODE_TYPES } from '$lib/node-types';
	import { savePayload, tagColor, type ChatHistoryEntry } from '$lib/utils/chat-helpers';
	import ChatMessages from './ChatMessages.svelte';
	import ChatInput from './ChatInput.svelte';
	import ProposalPanel from './ProposalPanel.svelte';
	import type { Node } from '$lib/storage/adapter';
	import type { Proposal } from '$lib/proposals';

	interface Props {
		node: Node;
		projectId: string;
		layout?: 'chat-first' | 'body-first';
		autoIntegrate?: boolean;
		onIntegrateStarted?: () => void;
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		onClose: () => void;
	}

	let {
		node,
		projectId,
		layout = 'chat-first',
		autoIntegrate = false,
		onIntegrateStarted,
		onUpdateNode,
		onClose
	}: Props = $props();

	// Chat state
	let chatHistory = $derived<ChatHistoryEntry[]>(
		(node.payload?.chatHistory as ChatHistoryEntry[]) ?? []
	);
	let userInput = $state('');
	let sending = $state(false);

	// Mounted guard — prevents state updates after component unmounts
	let mounted = true;
	$effect(() => {
		return () => {
			mounted = false;
		};
	});

	// Auto-trigger integrate when opened with autoIntegrate=true
	$effect(() => {
		if (autoIntegrate && !sending) {
			onIntegrateStarted?.();
			handleIntegrate();
		}
	});

	// Active proposals — from the latest assistant message, excluding auto-applied and inbox-routed
	const PLANNING_TYPES = ['feature', 'epic', 'phase', 'ticket', 'goal', 'initiative'];
	let activeProposals = $derived.by((): Proposal[] => {
		for (let i = chatHistory.length - 1; i >= 0; i--) {
			if (chatHistory[i].role === 'assistant' && chatHistory[i].proposals?.length) {
				return chatHistory[i].proposals!.filter((p) => {
					// Filter out auto-applied update_node on current node
					if (p.op?.type === 'update_node' && p.op.nodeId === node.id) return false;
					// Filter out planning-type create_node (sent to inbox)
					if (p.op?.type === 'create_node' && PLANNING_TYPES.includes(p.op.data.nodeType))
						return false;
					return true;
				});
			}
		}
		return [];
	});

	// Card preview state
	let isEditingTitle = $state(false);
	let titleInputEl = $state<HTMLInputElement>();
	let showTypeSelector = $state(false);
	let newTagInput = $state('');
	let showTagSuggestions = $state(false);

	// Derived
	let colors = $derived(getNodeTypeConfig(node.type));
	let bodyText = $derived(extractBodyText(node.body, 5000));
	let tags = $derived<string[]>(
		Array.isArray(node.payload?.tags) ? (node.payload!.tags as string[]) : []
	);
	let allProjectTags = $derived.by(() => {
		const tagSet = new Set<string>();
		for (const n of getProjectNodes()) {
			const t = n.payload?.tags;
			if (Array.isArray(t)) {
				for (const tag of t) tagSet.add(tag as string);
			}
		}
		return Array.from(tagSet).sort();
	});
	let tagSuggestions = $derived.by(() => {
		const q = newTagInput.trim().toLowerCase();
		if (!q) return allProjectTags.filter((t) => !tags.includes(t));
		return allProjectTags.filter((t) => t.includes(q) && !tags.includes(t));
	});

	// --- Structured response handling ---

	function autoApplyCurrentNodeProposals(proposals: Proposal[]) {
		// Auto-apply update_node proposals targeting the current node
		for (const proposal of proposals) {
			if (proposal.op.type === 'update_node' && proposal.op.nodeId === node.id) {
				const changes = proposal.op.changes;
				const patch: Partial<Node> = {};

				if (changes.title) patch.title = changes.title;
				if (changes.type) patch.type = changes.type;
				if (changes.status) patch.status = changes.status;
				if (changes.body) {
					patch.body = {
						type: 'doc',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: changes.body }] }]
					};
				}
				if (changes.payload) {
					const { chatHistory: _ch, ...rest } = changes.payload;
					patch.payload = { ...(node.payload ?? {}), ...rest };
				}

				if (Object.keys(patch).length > 0) {
					onUpdateNode(node.id, patch);
				}
			}
		}
	}

	// --- Tag handlers ---

	function handleRemoveTag(tag: string) {
		onUpdateNode(node.id, {
			payload: { ...(node.payload ?? {}), tags: tags.filter((t) => t !== tag) }
		});
	}

	function handleAddTag() {
		const tag = newTagInput.trim().toLowerCase().replace(/\s+/g, '-');
		if (!tag || tags.includes(tag)) {
			newTagInput = '';
			return;
		}
		onUpdateNode(node.id, { payload: { ...(node.payload ?? {}), tags: [...tags, tag] } });
		newTagInput = '';
	}

	function handleSelectTag(tag: string) {
		if (!tags.includes(tag)) {
			onUpdateNode(node.id, { payload: { ...(node.payload ?? {}), tags: [...tags, tag] } });
		}
		newTagInput = '';
		showTagSuggestions = false;
	}

	// --- Title / type / status handlers ---

	function handleTitleDblClick() {
		isEditingTitle = true;
		requestAnimationFrame(() => titleInputEl?.select());
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onUpdateNode(node.id, { title: (e.target as HTMLInputElement).value });
			isEditingTitle = false;
		} else if (e.key === 'Escape') {
			isEditingTitle = false;
		}
	}

	function handleTitleBlur(e: FocusEvent) {
		onUpdateNode(node.id, { title: (e.target as HTMLInputElement).value });
		isEditingTitle = false;
	}

	function handleTypeSelect(type: string) {
		onUpdateNode(node.id, { type });
		showTypeSelector = false;
	}

	function handleStatusChange(status: string) {
		onUpdateNode(node.id, { status });
	}

	// --- Tag context for LLM ---

	function getTagRelatedContext(): string {
		const noteTags: string[] = Array.isArray(node.payload?.tags)
			? (node.payload!.tags as string[])
			: [];
		if (noteTags.length === 0) return '';
		const allNodes = getProjectNodes();
		const related = allNodes.filter(
			(n) =>
				n.id !== node.id &&
				Array.isArray(n.payload?.tags) &&
				(n.payload!.tags as string[]).some((t) => noteTags.includes(t))
		);
		if (related.length === 0) return '';
		const lines = related
			.slice(0, 10)
			.map((n) => `- [${n.type}] "${n.title}" (tags: ${(n.payload!.tags as string[]).join(', ')})`)
			.join('\n');
		return `\nRelated items (same tags: ${noteTags.join(', ')}):\n${lines}`;
	}

	// --- System prompt ---

	function getProjectNodeListing(): string {
		const allNodes = getProjectNodes();
		if (allNodes.length === 0) return '';

		const planningNodes = allNodes.filter((n) =>
			['feature', 'intent', 'goal', 'initiative', 'epic', 'phase', 'ticket'].includes(n.type)
		);
		if (planningNodes.length === 0) return '';

		const lines = planningNodes
			.sort((a, b) => b.layer - a.layer)
			.slice(0, 40)
			.map((n) => {
				const indent = '  '.repeat(Math.max(0, 4 - n.layer));
				return `${indent}[${n.type}] "${n.title}" (${n.status}, id:${n.id})`;
			});
		return `\nProject planning nodes:\n${lines.join('\n')}`;
	}

	function buildSystemPrompt(): string {
		const gc = getGlobalContext();
		const currentBody = extractBodyText(node.body as Record<string, unknown> | null, 2000);
		const allNodes = getProjectNodes();
		const allEdges = getProjectEdges();
		const plans = allNodes
			.filter((n) => n.layer === 4)
			.map((n) => `- ${n.title}`)
			.join('\n');
		const tagContext = getTagRelatedContext();
		const isNew = node.title === 'Untitled' && chatHistory.length === 0;
		const nodeListing = getProjectNodeListing();

		// Build thread context (ancestor chain)
		const threadChain = walkThread(node.id, allNodes, allEdges);
		const threadContext = buildThreadPrompt(threadChain);

		return `You are a thinking partner in Butterfly, a spatial planning tool. Your job is to help explore ideas AND identify distinct threads, sub-topics, questions, and risks that deserve their own cards. When an idea has multiple facets, propose the primary thread as an update to the current note body, and propose separate notes for the rest.

The user is working on a note titled: "${node.title}" (id: ${node.id})
${currentBody ? `\nNote content:\n${currentBody}` : ''}
${threadContext ? `\n${threadContext}` : ''}
${gc ? `\nGlobal project context (use this to align your responses):\n${gc}` : ''}
${plans ? `\nExisting plans:\n${plans}` : ''}${tagContext}

${responseFormatInstructions({ projectId, currentNodeId: node.id, isNew, isPlanningNode: false, nodeListing })}`;
	}

	// --- Chat ---

	async function handleSend() {
		const text = userInput.trim();
		if (!text || sending) return;

		sending = true;
		userInput = '';

		const newHistory = [...chatHistory, { role: 'user' as const, content: text }];
		savePayload(node, { chatHistory: newHistory }, onUpdateNode);

		try {
			const messages: ChatMessage[] = newHistory.map((m) => ({ role: m.role, content: m.content }));
			const response = await callChat(buildSystemPrompt(), messages);
			if (!mounted) return;

			if (response) {
				const resp = parseChatResponse(response.text, node.id);
				autoApplyCurrentNodeProposals(resp.proposals);

				// Auto-queue planning-type proposals to inbox
				const planningTypes = ['feature', 'epic', 'phase', 'ticket', 'goal', 'initiative'];
				const planningProposals = resp.proposals.filter(
					(p) => p.op.type === 'create_node' && planningTypes.includes(p.op.data.nodeType)
				);
				if (planningProposals.length > 0) {
					await addInboxItem({
						projectId,
						sourceNodeId: node.id,
						sourceTitle: node.title,
						proposals: planningProposals,
						origin: 'llm-suggested'
					});
				}

				const entry: ChatHistoryEntry = {
					role: 'assistant',
					content: resp.message,
					...(resp.proposals && resp.proposals.length > 0 ? { proposals: resp.proposals } : {})
				};
				const withReply = [...newHistory, entry];
				savePayload(node, { chatHistory: withReply }, onUpdateNode);
			}
		} catch (e) {
			if (!mounted) return;
			console.error('Chat failed:', e);
			const withError = [
				...newHistory,
				{
					role: 'assistant' as const,
					content:
						'Sorry, I encountered an error. Make sure you have an API key configured in Settings.'
				}
			];
			savePayload(node, { chatHistory: withError }, onUpdateNode);
		} finally {
			if (mounted) sending = false;
		}
	}

	// --- Integration ---

	async function handleIntegrate() {
		if (sending) return;

		if (!hasProviders()) {
			alert('No AI provider configured. Add an API key in Settings to use Promote.');
			return;
		}

		const nodeListing = getProjectNodeListing();
		const integrationMsg = `Integrate this note into the planning structure.

- Look at the existing plan and identify where this content fits
- If the note has multiple concerns, break into separate items
- Avoid duplicating existing items — extend or refine instead
- Propose features (L4), epics (L3), phases (L2), or tickets (L1) as appropriate
- Every item must have body content and payload

You MUST include a "proposals" array with create_node items.

${nodeListing}`;

		sending = true;
		const newHistory = [...chatHistory, { role: 'user' as const, content: integrationMsg }];
		savePayload(node, { chatHistory: newHistory }, onUpdateNode);

		try {
			const messages: ChatMessage[] = newHistory.map((m) => ({
				role: m.role,
				content: m.content
			}));
			const response = await callChat(buildSystemPrompt(), messages, 4096);
			if (!mounted) return;

			if (response) {
				const resp = parseChatResponse(response.text, node.id);

				// Auto-apply update_node on current note
				autoApplyCurrentNodeProposals(resp.proposals);

				// Route remaining proposals to inbox
				const remaining = resp.proposals.filter(
					(p) => !(p.op.type === 'update_node' && p.op.nodeId === node.id)
				);
				if (remaining.length > 0) {
					await addInboxItem({
						projectId,
						sourceNodeId: node.id,
						sourceTitle: node.title,
						proposals: remaining,
						origin: 'manual'
					});
				}

				// Add confirmation to chat
				const confirmMsg =
					remaining.length > 0
						? `${resp.message}\n\n_Sent ${remaining.length} item${remaining.length === 1 ? '' : 's'} to the Planning inbox for review._`
						: resp.message;

				const entry: ChatHistoryEntry = {
					role: 'assistant',
					content: confirmMsg,
					...(resp.proposals && resp.proposals.length > 0 ? { proposals: resp.proposals } : {})
				};
				const withReply = [...newHistory, entry];
				savePayload(node, { chatHistory: withReply }, onUpdateNode);
			}
		} catch (e) {
			if (!mounted) return;
			console.error('Integrate failed:', e);
			const withError = [
				...newHistory,
				{
					role: 'assistant' as const,
					content: 'Failed to generate integration plan. Check your API key and try again.'
				}
			];
			savePayload(node, { chatHistory: withError }, onUpdateNode);
		} finally {
			if (mounted) sending = false;
		}
	}

	// --- Escape to close ---

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !isEditingTitle) onClose();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
	<div
		class="modal-container"
		class:body-first={layout === 'body-first'}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Close button -->
		<button class="modal-close" onclick={onClose}>x</button>

		<!-- Left: Chat -->
		<div class="chat-column">
			<div class="chat-header">
				<span class="chat-label">Chat</span>
				<div class="chat-actions">
					<button
						class="integrate-btn"
						data-demo="integrate-btn"
						onclick={handleIntegrate}
						disabled={sending}
					>
						{sending ? 'Thinking...' : 'Promote to Plan'}
					</button>
				</div>
			</div>

			<ChatMessages
				{chatHistory}
				{sending}
				contextNodeId={node.id}
				emptyText="Start a conversation to develop this thought."
				emptyHint="Your first message shapes the card. The AI will suggest a title, type, and tags."
			/>

			<ChatInput bind:value={userInput} {sending} onSend={handleSend} />
		</div>

		<!-- Right: Proposals + Card preview -->
		<div class="preview-column">
			{#if activeProposals.length > 0}
				<div class="proposals-section">
					<ProposalPanel proposals={activeProposals} contextNodeId={node.id} />
				</div>
			{/if}

			<div class="preview-header">
				<div class="type-area">
					<button
						class="type-badge"
						style:background-color={colors.badge}
						onclick={() => (showTypeSelector = !showTypeSelector)}
					>
						{node.type}
					</button>
					{#if showTypeSelector}
						<div class="type-selector">
							{#each Object.entries(NODE_TYPES) as [key, config]}
								<button
									class="type-option"
									class:active={node.type === key}
									onclick={() => handleTypeSelect(key)}
								>
									<span class="type-dot" style:background-color={config.badge}></span>
									{config.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<div class="status-pills">
					{#each ['draft', 'active', 'done'] as s}
						<button
							class="status-pill"
							class:active={node.status === s}
							onclick={() => handleStatusChange(s)}>{s}</button
						>
					{/each}
				</div>
			</div>

			<!-- Title -->
			<div class="preview-title-area">
				{#if isEditingTitle}
					<input
						bind:this={titleInputEl}
						class="title-input"
						value={node.title}
						onblur={handleTitleBlur}
						onkeydown={handleTitleKeydown}
					/>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<h2 class="preview-title" ondblclick={handleTitleDblClick}>{node.title}</h2>
				{/if}
			</div>

			<!-- Tags -->
			<div class="preview-tags">
				{#each tags as tag}
					<span class="tag-chip">
						<span class="tag-dot" style:background={tagColor(tag)}></span>
						{tag}
						<button class="tag-remove" onclick={() => handleRemoveTag(tag)}>x</button>
					</span>
				{/each}
				<div class="tag-input-wrap">
					<input
						class="tag-input"
						placeholder="+ tag"
						bind:value={newTagInput}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleAddTag();
							} else if (e.key === 'Escape') {
								newTagInput = '';
								showTagSuggestions = false;
							}
						}}
						onfocus={() => (showTagSuggestions = true)}
						onblur={() => {
							setTimeout(() => (showTagSuggestions = false), 150);
							handleAddTag();
						}}
					/>
					{#if showTagSuggestions && tagSuggestions.length > 0}
						<div class="tag-suggestions">
							{#each tagSuggestions.slice(0, 8) as suggestion}
								<button
									class="tag-suggestion"
									onmousedown={(e) => {
										e.preventDefault();
										handleSelectTag(suggestion);
									}}
								>
									<span class="tag-dot" style:background={tagColor(suggestion)}></span>
									{suggestion}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Body -->
			<div class="preview-body">
				{#if bodyText}
					<div class="body-content">{bodyText}</div>
				{:else}
					<div class="body-placeholder">Card body will appear here as you chat...</div>
				{/if}
			</div>

			<!-- Meta -->
			<div class="preview-meta">
				<span>Layer {node.layer}</span>
				<span
					>Created {node.createdAt instanceof Date ? node.createdAt.toLocaleDateString() : ''}</span
				>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 5000;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-container {
		width: 90vw;
		max-width: 1100px;
		height: 80vh;
		background: #111;
		border: 1px solid #262626;
		border-radius: 12px;
		display: flex;
		overflow: hidden;
		position: relative;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
	}

	.modal-container.body-first {
		flex-direction: row-reverse;
	}

	.modal-close {
		position: absolute;
		top: 10px;
		right: 14px;
		z-index: 10;
		background: none;
		border: none;
		color: #525252;
		font-size: 18px;
		cursor: pointer;
		padding: 2px 6px;
	}

	.modal-close:hover {
		color: #a3a3a3;
	}

	/* Chat column */
	.chat-column {
		flex: 3;
		display: flex;
		flex-direction: column;
		border-right: 1px solid #1a1a1a;
		min-width: 0;
	}

	.modal-container.body-first .chat-column {
		border-right: none;
		border-left: 1px solid #1a1a1a;
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.chat-label {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.chat-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.integrate-btn {
		background: #1a2a1a;
		border: 1px solid #16a34a;
		border-radius: 4px;
		color: #22c55e;
		font-size: 11px;
		padding: 4px 12px;
		cursor: pointer;
		font-weight: 500;
	}
	.integrate-btn:hover:not(:disabled) {
		background: #1a3a1a;
	}
	.integrate-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.proposals-section {
		margin-bottom: 16px;
		flex-shrink: 0;
	}

	/* Preview column */
	.preview-column {
		flex: 2;
		display: flex;
		flex-direction: column;
		padding: 20px 24px;
		overflow-y: auto;
		background: #0d0d0d;
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.type-area {
		position: relative;
	}

	.type-badge {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 3px 8px;
		border-radius: 4px;
		color: white;
		border: none;
		cursor: pointer;
	}
	.type-badge:hover {
		opacity: 0.85;
	}

	.type-selector {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 130px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		max-height: 300px;
		overflow-y: auto;
	}

	.type-option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}
	.type-option:hover {
		background: #262626;
		color: #e5e5e5;
	}
	.type-option.active {
		background: #262626;
		color: #e5e5e5;
	}

	.type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-pills {
		display: flex;
		gap: 4px;
	}
	.status-pill {
		padding: 2px 8px;
		font-size: 10px;
		border-radius: 10px;
		border: 1px solid #333;
		background: transparent;
		color: #737373;
		cursor: pointer;
		text-transform: capitalize;
	}
	.status-pill.active {
		background: #262626;
		color: #e5e5e5;
		border-color: #525252;
	}
	.status-pill:hover {
		color: #a3a3a3;
	}

	.preview-title-area {
		margin-bottom: 12px;
	}
	.preview-title {
		font-size: 18px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 0;
		line-height: 1.3;
		cursor: text;
	}
	.title-input {
		font-size: 18px;
		font-weight: 700;
		color: #e5e5e5;
		background: transparent;
		border: none;
		border-bottom: 1px solid #525252;
		outline: none;
		width: 100%;
		padding: 0 0 4px;
		line-height: 1.3;
	}

	.preview-tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 16px;
		min-height: 24px;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #333;
		color: #a3a3a3;
	}
	.tag-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.tag-remove {
		background: none;
		border: none;
		color: #525252;
		font-size: 12px;
		padding: 0;
		cursor: pointer;
		line-height: 1;
	}
	.tag-remove:hover {
		color: #ef4444;
	}

	.tag-input-wrap {
		position: relative;
	}
	.tag-input {
		background: none;
		border: none;
		border-bottom: 1px dashed #333;
		color: #737373;
		font-size: 11px;
		padding: 2px 4px;
		outline: none;
		width: 60px;
	}
	.tag-input::placeholder {
		color: #404040;
	}
	.tag-input:focus {
		border-color: #525252;
		color: #a3a3a3;
	}

	.tag-suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px;
		min-width: 140px;
		max-height: 200px;
		overflow-y: auto;
		z-index: 100;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}
	.tag-suggestion {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #a3a3a3;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
	}
	.tag-suggestion:hover {
		background: #262626;
		color: #e5e5e5;
	}

	.preview-body {
		flex: 1;
		min-height: 100px;
		margin-bottom: 16px;
	}

	.body-content {
		font-size: 13px;
		color: #a3a3a3;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.body-placeholder {
		font-size: 13px;
		color: #333;
		font-style: italic;
	}

	.preview-meta {
		display: flex;
		gap: 16px;
		font-size: 10px;
		color: #404040;
		border-top: 1px solid #1f1f1f;
		padding-top: 12px;
		margin-top: auto;
	}
</style>
