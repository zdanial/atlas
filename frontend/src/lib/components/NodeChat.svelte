<script lang="ts">
	import { callChat, type ChatMessage } from '$lib/agents/providers';
	import {
		parseChatResponse,
		responseFormatInstructions,
		type ChatResponse
	} from '$lib/agents/chat-response';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import { extractBodyText, getNodeTypeConfig } from '$lib/node-types';
	import type { Proposal } from '$lib/proposals';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import ProposalReview from './ProposalReview.svelte';
	import type { Node } from '$lib/storage/adapter';

	interface Props {
		node: Node;
		projectId: string;
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		showHeader?: boolean;
		allNodes?: Node[];
	}

	let { node, projectId, onUpdateNode, showHeader = true, allNodes }: Props = $props();

	const STATUSES = [
		{ key: 'draft', label: 'Draft', color: '#525252' },
		{ key: 'active', label: 'Active', color: '#3b82f6' },
		{ key: 'done', label: 'Done', color: '#22c55e' },
		{ key: 'archived', label: 'Archived', color: '#404040' }
	];

	function handleStatusChange(status: string) {
		onUpdateNode(node.id, { status });
	}

	type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string; proposals?: Proposal[] };
	let chatHistory = $derived<ChatHistoryEntry[]>(
		(node.payload?.chatHistory as ChatHistoryEntry[]) ?? []
	);
	let userInput = $state('');
	let sending = $state(false);
	let chatContainer: HTMLDivElement | undefined = $state();

	// Deep-clone payload to strip Svelte 5 proxies before writing to IndexedDB
	function savePayload(patch: Record<string, unknown>) {
		const clean = JSON.parse(JSON.stringify({ ...node.payload, ...patch }));
		onUpdateNode(node.id, { payload: clean });
	}

	// Collapsible state: track which messages are manually toggled
	let manualCollapse = $state<Map<number, boolean>>(new Map());

	function toggleCollapse(idx: number) {
		const next = new Map(manualCollapse);
		const current = next.get(idx);
		if (current === undefined) {
			// First click: collapse it
			next.set(idx, true);
		} else {
			next.set(idx, !current);
		}
		manualCollapse = next;
	}

	function isCollapsed(idx: number, total: number): boolean {
		const manual = manualCollapse.get(idx);
		if (manual !== undefined) return manual;
		// Auto-collapse all but the last 2 messages
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

		// Merge payload: tags from meta + type-specific fields from cardPayload
		const payloadMerge: Record<string, unknown> = { ...(node.payload ?? {}) };
		if (resp.cardMeta?.tags && resp.cardMeta.tags.length > 0) {
			payloadMerge.tags = resp.cardMeta.tags;
		}
		if (resp.cardPayload) {
			const { chatHistory: _ch, ...rest } = resp.cardPayload;
			Object.assign(payloadMerge, rest);
		}
		if (resp.cardMeta?.tags || resp.cardPayload) {
			patch.payload = payloadMerge;
		}

		if (Object.keys(patch).length > 0) {
			onUpdateNode(node.id, patch);
		}
	}

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

	function getHierarchyContext(): string {
		const nodes = allNodes ?? getProjectNodes();
		const lines: string[] = [];

		// Parent chain
		let current: Node | undefined = node;
		const ancestors: Node[] = [];
		while (current?.parentId) {
			const parent = nodes.find((n) => n.id === current!.parentId);
			if (!parent) break;
			ancestors.push(parent);
			current = parent;
		}
		if (ancestors.length > 0) {
			lines.push('\nParent chain:');
			for (const a of ancestors) {
				const p = a.payload as Record<string, unknown> | null;
				let detail = '';
				if (p?.objective) detail = ` — ${p.objective}`;
				else if (p?.targetOutcome) detail = ` — ${p.targetOutcome}`;
				lines.push(`  [${a.type}] "${a.title}" (${a.status})${detail}`);
			}
		}

		// Children
		const children = nodes
			.filter((n) => n.parentId === node.id)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
		if (children.length > 0) {
			lines.push(`\nChildren (${children.length}):`);
			for (const c of children) {
				const cp = c.payload as Record<string, unknown> | null;
				let detail = '';
				if (cp?.intent) detail = ` — ${cp.intent}`;
				else if (cp?.objective) detail = ` — ${cp.objective}`;
				lines.push(`  [${c.type}] "${c.title}" (${c.status}, id:${c.id})${detail}`);
			}
		}

		return lines.join('\n');
	}

	function getPayloadContext(): string {
		const p = node.payload as Record<string, unknown> | null;
		if (!p) return '';
		const lines: string[] = ['\nCurrent payload fields:'];
		const skip = new Set(['chatHistory', 'tags', 'color']);
		for (const [key, val] of Object.entries(p)) {
			if (skip.has(key) || val === undefined || val === null || val === '') continue;
			if (Array.isArray(val)) {
				if (val.length === 0) continue;
				lines.push(`  ${key}: ${JSON.stringify(val)}`);
			} else if (typeof val === 'object') {
				lines.push(`  ${key}: ${JSON.stringify(val)}`);
			} else {
				lines.push(`  ${key}: ${val}`);
			}
		}
		return lines.length > 1 ? lines.join('\n') : '';
	}

	function getPayloadFieldInstructions(): string {
		switch (node.type) {
			case 'ticket':
				return `This is a TICKET. Editable payload fields:
- intent (string): what this ticket accomplishes
- acceptanceCriteria (string[]): checklist of requirements
- filePaths (array of {path, repoId?}): files to modify
- promptPayload (string): compiled prompt for the coding agent

After EVERY response, include a payload update block:
<!--card-payload:{"intent":"...","acceptanceCriteria":["..."],"filePaths":[{"path":"..."}]}-->
Only include fields you want to change.`;

			case 'phase':
				return `This is a PHASE. Editable payload fields:
- objective (string): what this phase accomplishes
- archNotes (string): architecture decisions and notes
- verifyCriteria (string[]): how to verify this phase is complete
- complexity ('low'|'med'|'high')
- fileChanges (array of {path, action}): files affected

After EVERY response, include a payload update block:
<!--card-payload:{"objective":"...","verifyCriteria":["..."],"archNotes":"..."}-->
Only include fields you want to change.`;

			case 'epic':
				return `This is an EPIC. Editable payload fields:
- openQuestions (string[]): unresolved questions

After EVERY response, include a payload update block:
<!--card-payload:{"openQuestions":["..."]}-->
Only include fields you want to change.`;

			case 'feature':
			case 'intent':
			case 'goal':
			case 'initiative':
				return `This is a ${node.type.toUpperCase()}. Editable payload fields:
- targetOutcome (string): the desired end state
- deadline (string, ISO date): target completion date

After EVERY response, include a payload update block:
<!--card-payload:{"targetOutcome":"..."}-->
Only include fields you want to change.`;

			default:
				return '';
		}
	}

	function buildSystemPrompt(): string {
		const gc = getGlobalContext();
		const currentBody = extractBodyText(node.body as Record<string, unknown> | null, 2000);
		const projectNodes = allNodes ?? getProjectNodes();
		const plans = projectNodes
			.filter((n) => n.layer === 4)
			.map((n) => `- ${n.title}`)
			.join('\n');
		const tagContext = getTagRelatedContext();
		const isNew = node.title === 'Untitled' && chatHistory.length === 0;
		const isPlanningNode = [
			'ticket',
			'phase',
			'epic',
			'feature',
			'intent',
			'goal',
			'initiative'
		].includes(node.type);
		const hierarchyCtx = isPlanningNode ? getHierarchyContext() : '';
		const payloadCtx = isPlanningNode ? getPayloadContext() : '';
		const fieldInstructions = isPlanningNode ? getPayloadFieldInstructions() : '';

		// Build node listing for proposals context
		const planningNodes = projectNodes
			.filter((n) =>
				['feature', 'intent', 'goal', 'initiative', 'epic', 'phase', 'ticket'].includes(n.type)
			)
			.sort((a, b) => b.layer - a.layer)
			.slice(0, 40);
		const nodeListing =
			planningNodes.length > 0
				? `\nProject planning nodes:\n${planningNodes
						.map((n) => {
							const indent = '  '.repeat(Math.max(0, 4 - n.layer));
							return `${indent}[${n.type}] "${n.title}" (${n.status}, id:${n.id})`;
						})
						.join('\n')}`
				: '';

		return `You are a thinking partner helping develop ideas in Atlas, a spatial planning tool.

The user is working on a ${node.type} titled: "${node.title}"
${currentBody ? `\nDescription:\n${currentBody}` : ''}${payloadCtx}${hierarchyCtx}
${gc ? `\nProject context:\n${gc}` : ''}
${plans ? `\nExisting plans:\n${plans}` : ''}${tagContext}
${isPlanningNode && fieldInstructions ? `\n### Planning node payload fields:\n${fieldInstructions}\nInclude changed fields in "cardPayload" in your JSON response.` : ''}

${responseFormatInstructions({ projectId, isNew, isPlanningNode, nodeListing })}`;
	}

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
</script>

<div class="node-chat">
	{#if showHeader}
		<div class="chat-header">
			<div class="chat-status-row">
				{#each STATUSES as s}
					<button
						class="status-btn"
						class:active={node.status === s.key}
						style:--status-color={s.color}
						onclick={() => handleStatusChange(s.key)}
					>
						{s.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="chat-messages" bind:this={chatContainer}>
		{#if chatHistory.length === 0}
			<div class="chat-empty">
				<p>Ask about this {node.type}, explore ideas, or refine its content.</p>
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
			placeholder="Ask about this {node.type}..."
			bind:value={userInput}
			onkeydown={handleChatKeyDown}
			rows="2"
		></textarea>
		<button class="chat-send" onclick={handleSend} disabled={sending || !userInput.trim()}>
			Send
		</button>
	</div>
</div>

<style>
	.node-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.chat-header {
		padding: 8px 12px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.chat-status-row {
		display: flex;
		gap: 4px;
	}

	.status-btn {
		font-size: 10px;
		padding: 3px 8px;
		border: 1px solid #262626;
		border-radius: 4px;
		background: transparent;
		color: #525252;
		cursor: pointer;
		transition: all 0.15s;
	}

	.status-btn:hover {
		border-color: var(--status-color);
		color: var(--status-color);
	}

	.status-btn.active {
		background: color-mix(in srgb, var(--status-color) 15%, transparent);
		border-color: var(--status-color);
		color: var(--status-color);
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.chat-empty {
		color: #404040;
		font-size: 12px;
		text-align: center;
		padding: 20px;
	}

	.chat-msg {
		max-width: 100%;
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
		color: #525252;
		text-transform: uppercase;
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
		font-size: 12px;
		line-height: 1.6;
		color: #d4d4d4;
		padding: 4px 8px 8px;
		word-break: break-word;
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
		font-size: 11px;
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
		font-size: 12px;
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

	.thinking {
		color: #525252;
		font-style: italic;
	}

	.chat-input-area {
		display: flex;
		gap: 6px;
		padding: 8px;
		border-top: 1px solid #1a1a1a;
	}

	.chat-input {
		flex: 1;
		background: #0f0f0f;
		border: 1px solid #262626;
		border-radius: 6px;
		color: #d4d4d4;
		font-size: 12px;
		padding: 6px 8px;
		resize: none;
		font-family: inherit;
	}

	.chat-input:focus {
		outline: none;
		border-color: #404040;
	}

	.chat-send {
		padding: 6px 12px;
		background: #1e3a5f;
		border: none;
		border-radius: 6px;
		color: #93c5fd;
		font-size: 11px;
		cursor: pointer;
		align-self: flex-end;
	}

	.chat-send:hover:not(:disabled) {
		background: #1e4a7f;
	}

	.chat-send:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
