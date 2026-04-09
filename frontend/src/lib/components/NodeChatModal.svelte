<script lang="ts">
	import { callChat, type ChatMessage } from '$lib/agents/providers';
	import {
		parseChatResponse,
		responseFormatInstructions,
		type ChatResponse
	} from '$lib/agents/chat-response';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import { extractBodyText, getNodeTypeConfig, NODE_TYPES } from '$lib/node-types';
	import type { Proposal } from '$lib/proposals';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import ProposalReview from './ProposalReview.svelte';
	import type { Node } from '$lib/storage/adapter';

	interface Props {
		node: Node;
		projectId: string;
		layout?: 'chat-first' | 'body-first';
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		onClose: () => void;
	}

	let { node, projectId, layout = 'chat-first', onUpdateNode, onClose }: Props = $props();

	// Chat state
	type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string; proposals?: Proposal[] };
	let chatHistory = $derived<ChatHistoryEntry[]>(
		(node.payload?.chatHistory as ChatHistoryEntry[]) ?? []
	);
	let userInput = $state('');
	let sending = $state(false);
	let chatContainer: HTMLDivElement | undefined = $state();

	// Collapsible state
	let manualCollapse = $state<Map<number, boolean>>(new Map());

	function toggleCollapse(idx: number) {
		const next = new Map(manualCollapse);
		const current = next.get(idx);
		next.set(idx, current === undefined ? true : !current);
		manualCollapse = next;
	}

	function isCollapsed(idx: number, total: number): boolean {
		const manual = manualCollapse.get(idx);
		if (manual !== undefined) return manual;
		return idx < total - 2;
	}

	function renderMarkdown(text: string): string {
		const raw = marked.parse(text, { async: false }) as string;
		return DOMPurify.sanitize(raw);
	}

	function firstLine(text: string): string {
		const line = text.split('\n').find((l) => l.trim()) ?? text;
		return line.length > 120 ? line.slice(0, 120) + '...' : line;
	}

	// Deep-clone payload to strip Svelte 5 proxies before writing to IndexedDB
	function savePayload(patch: Record<string, unknown>) {
		const clean = JSON.parse(JSON.stringify({ ...node.payload, ...patch }));
		onUpdateNode(node.id, { payload: clean });
	}

	// Card preview state
	let isEditingTitle = $state(false);
	let titleInputEl = $state<HTMLInputElement>();
	let showTypeSelector = $state(false);
	let newTagInput = $state('');
	let showTagSuggestions = $state(false);

	// Integration state
	let integrated = $state(false);

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

	function tagColor(tag: string): string {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
		const palette = [
			'#6366f1',
			'#22c55e',
			'#f97316',
			'#06b6d4',
			'#ec4899',
			'#eab308',
			'#8b5cf6',
			'#14b8a6',
			'#ef4444',
			'#3b82f6'
		];
		return palette[Math.abs(hash) % palette.length];
	}

	// --- Structured response handling ---

	function applyChatResponse(resp: ChatResponse) {
		const patch: Partial<Node> = {};
		if (resp.cardMeta?.title) patch.title = resp.cardMeta.title;
		if (resp.cardMeta?.type) patch.type = resp.cardMeta.type;
		if (resp.cardBody) {
			patch.body = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: resp.cardBody }] }]
			};
		}
		if (resp.cardMeta?.tags && resp.cardMeta.tags.length > 0) {
			patch.payload = { ...(node.payload ?? {}), tags: resp.cardMeta.tags };
		}
		if (Object.keys(patch).length > 0) {
			onUpdateNode(node.id, patch);
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
		const plans = allNodes
			.filter((n) => n.layer === 4)
			.map((n) => `- ${n.title}`)
			.join('\n');
		const tagContext = getTagRelatedContext();
		const isNew = node.title === 'Untitled' && chatHistory.length === 0;
		const nodeListing = getProjectNodeListing();

		return `You are a thinking partner helping develop ideas in Atlas, a spatial planning tool.

The user is working on a note titled: "${node.title}"
${currentBody ? `\nNote content:\n${currentBody}` : ''}
${gc ? `\nProject context:\n${gc}` : ''}
${plans ? `\nExisting plans:\n${plans}` : ''}${tagContext}

${responseFormatInstructions({ projectId, isNew, isPlanningNode: false, nodeListing })}`;
	}

	// --- Chat ---

	async function handleSend() {
		const text = userInput.trim();
		if (!text || sending) return;

		sending = true;
		userInput = '';

		const newHistory = [...chatHistory, { role: 'user' as const, content: text }];
		savePayload({ chatHistory: newHistory });

		try {
			const messages: ChatMessage[] = newHistory.map((m) => ({ role: m.role, content: m.content }));
			const response = await callChat(buildSystemPrompt(), messages);

			if (response) {
				const resp = parseChatResponse(response.text);

				const entry: ChatHistoryEntry = {
					role: 'assistant',
					content: resp.message,
					...(resp.proposals && resp.proposals.length > 0 ? { proposals: resp.proposals } : {})
				};
				const withReply = [...newHistory, entry];
				savePayload({ chatHistory: withReply });
				applyChatResponse(resp);
			}
		} catch (e) {
			console.error('Chat failed:', e);
			const withError = [
				...newHistory,
				{
					role: 'assistant' as const,
					content:
						'Sorry, I encountered an error. Make sure you have an API key configured in Settings.'
				}
			];
			savePayload({ chatHistory: withError });
		} finally {
			sending = false;
			requestAnimationFrame(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	}

	function handleChatKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	// --- Integration ---

	async function handleIntegrate() {
		if (sending) return;
		const integrationMsg =
			'Integrate this note into the planning structure. You MUST include a "proposals" array in your JSON response with create_node items for features, epics, and/or tickets that capture the actionable content of this note.';

		sending = true;
		const newHistory = [...chatHistory, { role: 'user' as const, content: integrationMsg }];
		savePayload({ chatHistory: newHistory });

		try {
			const messages: ChatMessage[] = newHistory.map((m) => ({
				role: m.role,
				content: m.content
			}));
			const response = await callChat(buildSystemPrompt(), messages, 4096);

			if (response) {
				const resp = parseChatResponse(response.text);

				const entry: ChatHistoryEntry = {
					role: 'assistant',
					content: resp.message,
					...(resp.proposals && resp.proposals.length > 0 ? { proposals: resp.proposals } : {})
				};
				const withReply = [...newHistory, entry];
				savePayload({ chatHistory: withReply });
				applyChatResponse(resp);
			}
		} catch (e) {
			console.error('Integrate failed:', e);
			const withError = [
				...newHistory,
				{
					role: 'assistant' as const,
					content: 'Failed to generate integration plan. Check your API key and try again.'
				}
			];
			savePayload({ chatHistory: withError });
		} finally {
			sending = false;
			requestAnimationFrame(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	}

	// --- Escape to close ---

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !isEditingTitle) onClose();
	}

	$effect(() => {
		if (chatHistory.length && chatContainer) {
			requestAnimationFrame(() => {
				chatContainer!.scrollTop = chatContainer!.scrollHeight;
			});
		}
	});
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
					{#if !integrated}
						<button class="integrate-btn" onclick={handleIntegrate} disabled={sending}>
							{sending ? 'Thinking...' : 'Integrate'}
						</button>
					{/if}
					{#if integrated}
						<span class="integrated-badge">Integrated</span>
					{/if}
				</div>
			</div>

			<!-- Chat messages -->
			<div class="chat-messages" bind:this={chatContainer}>
				{#if chatHistory.length === 0}
					<div class="chat-empty">
						<p>Start a conversation to develop this thought.</p>
						<p class="chat-empty-hint">
							Your first message shapes the card. The AI will suggest a title, type, and tags.
						</p>
					</div>
				{/if}

				{#each chatHistory as msg, idx}
					{@const collapsed = isCollapsed(idx, chatHistory.length)}
					<div
						class="chat-msg"
						class:user={msg.role === 'user'}
						class:assistant={msg.role === 'assistant'}
						class:collapsed
					>
						<button class="msg-toggle" onclick={() => toggleCollapse(idx)}>
							<span class="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
							{#if collapsed}
								<span class="msg-preview">{firstLine(msg.content)}</span>
							{/if}
							<span class="collapse-indicator">{collapsed ? '+' : '−'}</span>
						</button>
						{#if !collapsed}
							{#if msg.role === 'user'}
								<div class="msg-content">{msg.content}</div>
							{:else}
								<div class="msg-content markdown-body">{@html renderMarkdown(msg.content)}</div>
							{/if}
							{#if msg.proposals?.length}
								<ProposalReview proposals={msg.proposals} contextNodeId={node.id} />
							{/if}
						{/if}
					</div>
				{/each}

				{#if sending}
					<div class="chat-msg assistant">
						<button class="msg-toggle" disabled>
							<span class="msg-role">AI</span>
						</button>
						<div class="msg-content thinking">Thinking...</div>
					</div>
				{/if}
			</div>

			<div class="chat-input-area">
				<textarea
					class="chat-input"
					placeholder="Type a message..."
					bind:value={userInput}
					onkeydown={handleChatKeyDown}
					disabled={sending || integrated}
					rows="2"
				></textarea>
				<button class="chat-send" onclick={handleSend} disabled={sending || !userInput.trim()}>
					{sending ? '...' : 'Send'}
				</button>
			</div>
		</div>

		<!-- Right: Card preview -->
		<div class="preview-column">
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

	.integrated-badge {
		font-size: 10px;
		color: #22c55e;
		background: #052e16;
		border: 1px solid #16a34a;
		border-radius: 4px;
		padding: 2px 8px;
		font-weight: 600;
	}

	/* Integration panel */

	/* Chat messages */
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.chat-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
	}
	.chat-empty p {
		font-size: 13px;
		color: #404040;
	}
	.chat-empty-hint {
		font-size: 11px !important;
		color: #2a2a2a !important;
		margin-top: 4px;
	}
	.chat-msg {
		display: flex;
		flex-direction: column;
	}
	.msg-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 4px;
		transition: background 0.1s;
	}
	.msg-toggle:hover {
		background: #1a1a1a;
	}
	.msg-toggle:disabled {
		cursor: default;
	}
	.msg-role {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #404040;
		flex-shrink: 0;
		width: 20px;
	}
	.msg-preview {
		font-size: 11px;
		color: #525252;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.collapse-indicator {
		font-size: 11px;
		color: #404040;
		flex-shrink: 0;
		width: 12px;
		text-align: center;
	}
	.msg-content {
		font-size: 13px;
		line-height: 1.6;
		color: #a3a3a3;
		word-break: break-word;
		padding: 4px 8px 8px;
	}
	.chat-msg.user .msg-content {
		color: #93c5fd;
	}

	/* Markdown styles */
	.msg-content.markdown-body :global(p) {
		margin: 0 0 8px;
	}
	.msg-content.markdown-body :global(p:last-child) {
		margin-bottom: 0;
	}
	.msg-content.markdown-body :global(ul),
	.msg-content.markdown-body :global(ol) {
		margin: 4px 0;
		padding-left: 20px;
	}
	.msg-content.markdown-body :global(li) {
		margin: 2px 0;
	}
	.msg-content.markdown-body :global(code) {
		background: #1a1a1a;
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 12px;
		color: #e5e5e5;
	}
	.msg-content.markdown-body :global(pre) {
		background: #111;
		border: 1px solid #262626;
		border-radius: 6px;
		padding: 8px;
		overflow-x: auto;
		margin: 6px 0;
	}
	.msg-content.markdown-body :global(pre code) {
		background: none;
		padding: 0;
	}
	.msg-content.markdown-body :global(strong) {
		color: #e5e5e5;
		font-weight: 600;
	}
	.msg-content.markdown-body :global(h1),
	.msg-content.markdown-body :global(h2),
	.msg-content.markdown-body :global(h3) {
		color: #e5e5e5;
		margin: 8px 0 4px;
		font-size: 13px;
		font-weight: 600;
	}
	.msg-content.markdown-body :global(blockquote) {
		border-left: 2px solid #333;
		padding-left: 8px;
		margin: 6px 0;
		color: #737373;
	}
	.msg-content.markdown-body :global(hr) {
		border: none;
		border-top: 1px solid #262626;
		margin: 8px 0;
	}
	.msg-content.thinking {
		color: #525252;
		font-style: italic;
	}

	.chat-input-area {
		display: flex;
		gap: 6px;
		padding: 12px 16px;
		border-top: 1px solid #1a1a1a;
		flex-shrink: 0;
	}
	.chat-input {
		flex: 1;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #d4d4d4;
		font-size: 13px;
		padding: 8px 10px;
		resize: none;
		outline: none;
		font-family: inherit;
		line-height: 1.4;
	}
	.chat-input::placeholder {
		color: #333;
	}
	.chat-input:focus {
		border-color: #3a3a3a;
	}
	.chat-send {
		background: #1f1f3a;
		border: 1px solid #2a2a4a;
		border-radius: 6px;
		color: #818cf8;
		font-size: 12px;
		padding: 4px 12px;
		cursor: pointer;
		align-self: flex-end;
	}
	.chat-send:hover:not(:disabled) {
		background: #2a2a4a;
	}
	.chat-send:disabled {
		opacity: 0.4;
		cursor: default;
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
