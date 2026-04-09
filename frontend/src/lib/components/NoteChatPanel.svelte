<script lang="ts">
	import { callChat, type ChatMessage } from '$lib/agents/providers';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';
	import { getProjectNodes, createNode, createEdge } from '$lib/stores/nodes.svelte';
	import { pushOperation } from '$lib/stores/history.svelte';
	import { extractBodyText } from '$lib/node-types';
	import { getNodeTypeConfig } from '$lib/node-types';
	import { setActiveZone } from '$lib/stores/zone.svelte';
	import { navigateToParent } from '$lib/stores/planningNav.svelte';
	import type { Node } from '$lib/storage/adapter';

	interface IntegrationAction {
		action: 'create' | 'link';
		nodeType: 'feature' | 'goal' | 'initiative' | 'intent' | 'epic' | 'phase' | 'ticket';
		title: string;
		body: string;
		parentId?: string;
		approved: boolean;
	}

	interface Props {
		node: Node;
		projectId: string;
		onUpdateNode: (id: string, patch: Partial<Node>) => void;
		onClose: () => void;
	}

	let { node, projectId, onUpdateNode, onClose }: Props = $props();

	let chatHistory = $derived<Array<{ role: 'user' | 'assistant'; content: string }>>(
		(node.payload?.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) ?? []
	);

	let userInput = $state('');
	let sending = $state(false);
	let chatContainer: HTMLDivElement | undefined = $state();

	// Integration state
	let integrating = $state(false);
	let proposedActions = $state<IntegrationAction[]>([]);
	let showIntegrate = $state(false);
	let integrateError = $state('');
	let integrated = $state(false);

	const LAYER_MAP: Record<string, number> = {
		feature: 4,
		goal: 4,
		initiative: 4,
		intent: 4,
		epic: 3,
		phase: 2,
		ticket: 1
	};

	// Get nodes related by overlapping tags
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

	function buildSystemPrompt(): string {
		const gc = getGlobalContext();
		const bodyText = extractBodyText(node.body as Record<string, unknown> | null, 2000);
		const allNodes = getProjectNodes();
		const plans = allNodes
			.filter((n) => n.layer === 4)
			.map((n) => `- ${n.title}`)
			.join('\n');
		const tagContext = getTagRelatedContext();

		return `You are a thinking partner helping develop ideas in Atlas, a spatial planning tool.

The user is working on a note titled: "${node.title}"
${bodyText ? `\nNote content:\n${bodyText}` : ''}
${gc ? `\nProject context:\n${gc}` : ''}
${plans ? `\nExisting plans:\n${plans}` : ''}${tagContext}

Your role:
- Help the user develop and refine this thought
- Ask clarifying questions to sharpen the idea
- Challenge assumptions constructively
- Suggest connections to existing plans or concepts
- Keep responses concise and conversational

When the user feels the idea is ready, they can integrate it into the planning center.`;
	}

	function buildIntegratePrompt(): string {
		const gc = getGlobalContext();
		const bodyText = extractBodyText(node.body as Record<string, unknown> | null, 2000);
		const allNodes = getProjectNodes();

		const nodeTags = (n: { payload?: Record<string, unknown> | null }): string => {
			const t = n.payload?.tags;
			return Array.isArray(t) && t.length > 0 ? ` (tags: ${(t as string[]).join(', ')})` : '';
		};

		const plans = allNodes
			.filter((n) => n.layer === 4)
			.map((n) => `  - [id:${n.id}] "${n.title}" [${n.type}]${nodeTags(n)}`)
			.join('\n');
		const epics = allNodes
			.filter((n) => n.layer === 3)
			.map((n) => {
				const parent = allNodes.find((p) => p.id === n.parentId);
				return `  - [id:${n.id}] "${n.title}" under [id:${parent?.id ?? 'none'}] "${parent?.title ?? 'none'}"${nodeTags(n)}`;
			})
			.join('\n');

		const chatTranscript = chatHistory
			.map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
			.join('\n\n');

		const tagContext = getTagRelatedContext();

		return `You are a planning integration assistant for Atlas.

A user has been developing a thought through conversation and is now ready to integrate it into their structured plan.

## The Note
Title: "${node.title}"
${bodyText ? `Content: ${bodyText}` : ''}

## Chat History
${chatTranscript}

## Current Plan Structure
Features / Goals (L4 - top-level plans):
${plans || '  (none)'}

Epics (L3 - major work packages):
${epics || '  (none)'}
${gc ? `\nProject context: ${gc}` : ''}${tagContext}

## Your Task
Analyze this note and its chat history. Propose concrete actions to integrate it into the plan. Return ONLY a JSON array of actions:

[
  {
    "action": "create",
    "nodeType": "feature" | "goal" | "epic" | "ticket" | "phase",
    "title": "short action-oriented title",
    "body": "1-2 sentence description",
    "parentId": "id of existing node to nest under, or null for top-level"
  }
]

Rules:
- Prefer adding to existing features/goals/epics over creating new ones
- Use "ticket" for concrete tasks, "epic" for large feature areas, "phase" for implementation stages
- Only create a new "feature" or "goal" if the note represents a genuinely new direction
- Use the node's id (from the [id:...] prefix) for parentId — NOT the title
- Keep titles concise and action-oriented
- 1-4 actions is ideal, don't over-decompose
- parentId must be a valid id from the plan structure above, or null for new top-level items
- If no existing parent fits, you may propose creating a new feature/goal as a separate action (with parentId: null)`;
	}

	async function handleSend() {
		const text = userInput.trim();
		if (!text || sending) return;

		sending = true;
		userInput = '';

		const newHistory = [...chatHistory, { role: 'user' as const, content: text }];
		onUpdateNode(node.id, {
			payload: { ...node.payload, chatHistory: newHistory }
		});

		try {
			const messages: ChatMessage[] = newHistory.map((m) => ({
				role: m.role,
				content: m.content
			}));

			const response = await callChat(buildSystemPrompt(), messages);

			if (response) {
				const withReply = [...newHistory, { role: 'assistant' as const, content: response.text }];
				onUpdateNode(node.id, {
					payload: { ...node.payload, chatHistory: withReply }
				});
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
			onUpdateNode(node.id, {
				payload: { ...node.payload, chatHistory: withError }
			});
		} finally {
			sending = false;
			requestAnimationFrame(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			});
		}
	}

	async function handleIntegrate() {
		integrating = true;
		integrateError = '';
		proposedActions = [];
		showIntegrate = true;

		try {
			const messages: ChatMessage[] = [
				{ role: 'user', content: 'Please analyze this note and propose integration actions.' }
			];
			const response = await callChat(buildIntegratePrompt(), messages, 2048);

			if (!response) {
				integrateError = 'No AI provider configured. Add an API key in Settings.';
				return;
			}

			const jsonMatch = response.text.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				integrateError = 'Could not parse integration plan. Try again.';
				return;
			}

			const parsed = JSON.parse(jsonMatch[0]) as Array<{
				action: string;
				nodeType: string;
				title: string;
				body: string;
				parentId?: string | null;
			}>;

			proposedActions = parsed.map((a) => ({
				action: a.action as 'create' | 'link',
				nodeType: a.nodeType as IntegrationAction['nodeType'],
				title: a.title,
				body: a.body || a.title,
				parentId: a.parentId ?? undefined,
				approved: true
			}));
		} catch (e) {
			console.error('Integrate failed:', e);
			integrateError = 'Failed to generate integration plan. Check your API key and try again.';
		} finally {
			integrating = false;
		}
	}

	let confirming = $state(false);

	async function handleConfirmIntegrate() {
		const approved = proposedActions.filter((a) => a.approved);
		if (approved.length === 0) {
			showIntegrate = false;
			return;
		}

		confirming = true;
		integrateError = '';

		try {
			const allNodes = getProjectNodes();
			const createdNodes: Node[] = [];
			let lastParentId: string | undefined = undefined;

			// Sort: highest layer first so parents are created before children
			const sorted = [...approved].sort(
				(a, b) => (LAYER_MAP[b.nodeType] ?? 0) - (LAYER_MAP[a.nodeType] ?? 0)
			);

			for (const action of sorted) {
				const layer = LAYER_MAP[action.nodeType] ?? 1;
				const bodyText = action.body || action.title;

				// Resolve parent by ID — check existing nodes AND nodes we just created
				let resolvedParentId: string | undefined = undefined;
				if (action.parentId) {
					const allCandidates = [...allNodes, ...createdNodes];
					const parent = allCandidates.find((n) => n.id === action.parentId);
					if (parent) resolvedParentId = parent.id;
				}

				// Non-L4 nodes without a parent would be invisible.
				// Attach to the first existing L4 node as fallback.
				if (!resolvedParentId && layer < 4) {
					const l4Nodes = [...allNodes, ...createdNodes].filter((n) => n.layer === 4);
					if (l4Nodes.length > 0) {
						resolvedParentId = l4Nodes[0].id;
					}
				}

				// Smart positioning: place after existing siblings
				let posX = 100 + createdNodes.length * 250;
				let posY = 200;
				if (resolvedParentId) {
					const siblings = allNodes.filter((n) => n.parentId === resolvedParentId);
					if (siblings.length > 0) {
						const maxX = Math.max(...siblings.map((n) => n.positionX ?? 0));
						posX = maxX + 250;
						posY = siblings[0].positionY ?? 200;
					}
				}

				const created = await createNode({
					type: action.nodeType,
					layer,
					projectId,
					title: action.title,
					body: {
						type: 'doc',
						content: [
							{
								type: 'paragraph',
								content: [{ type: 'text', text: bodyText }]
							}
						]
					},
					parentId: resolvedParentId,
					status: 'draft',
					positionX: posX,
					positionY: posY
				});
				pushOperation({ type: 'create_node', node: created });
				createdNodes.push(created);
				if (resolvedParentId) lastParentId = resolvedParentId;

				// Link back to source note
				await createEdge({
					sourceId: created.id,
					targetId: node.id,
					relationType: 'refines',
					source: 'ai'
				});
			}

			// Mark the note as integrated
			onUpdateNode(node.id, { status: 'done' });

			integrated = true;
			showIntegrate = false;

			// Navigate to Planning zone, drilled into the parent so nodes are visible
			onClose();
			if (lastParentId) {
				navigateToParent(lastParentId, [...allNodes, ...createdNodes]);
			}
			setActiveZone('planning');
		} catch (e) {
			console.error('Integration failed:', e);
			integrateError =
				e instanceof Error ? e.message : 'Failed to create nodes. Check console for details.';
		} finally {
			confirming = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	$effect(() => {
		if (chatHistory.length && chatContainer) {
			requestAnimationFrame(() => {
				chatContainer!.scrollTop = chatContainer!.scrollHeight;
			});
		}
	});
</script>

<div class="chat-panel">
	<div class="chat-header">
		<div class="chat-header-info">
			<span class="chat-title">Chat</span>
			<span class="chat-note-title">{node.title}</span>
		</div>
		<div class="chat-header-actions">
			{#if chatHistory.length >= 2 && !integrated}
				<button
					class="integrate-btn"
					onclick={handleIntegrate}
					disabled={integrating || sending}
					title="Integrate this note into the plan"
				>
					{integrating ? 'Analyzing...' : 'Integrate'}
				</button>
			{/if}
			{#if integrated}
				<span class="integrated-badge">Integrated</span>
			{/if}
			<button class="chat-close" onclick={onClose}>x</button>
		</div>
	</div>

	<!-- Integration proposal overlay -->
	{#if showIntegrate}
		<div class="integrate-panel">
			<div class="integrate-header">
				<span class="integrate-title">Integration Plan</span>
				{#if integrateError}
					<span class="integrate-error">{integrateError}</span>
				{/if}
			</div>

			{#if integrating}
				<div class="integrate-loading">
					<p>Analyzing note against existing plan...</p>
				</div>
			{:else if proposedActions.length > 0}
				<div class="integrate-actions">
					{#each proposedActions as action, i}
						{@const typeConfig = getNodeTypeConfig(action.nodeType)}
						<div class="action-card" class:rejected={!action.approved}>
							<div class="action-head">
								<label class="action-check">
									<input type="checkbox" bind:checked={proposedActions[i].approved} />
								</label>
								<span class="action-badge" style:background={typeConfig.badge}>
									{action.nodeType}
								</span>
								<span class="action-title">{action.title}</span>
							</div>
							<p class="action-body">{action.body}</p>
							{#if action.parentId}
								{@const parentNode = getProjectNodes().find((n) => n.id === action.parentId)}
								<p class="action-parent">
									Under: {parentNode?.title ?? action.parentId}
								</p>
							{/if}
						</div>
					{/each}
				</div>

				<div class="integrate-footer">
					<button
						class="integrate-cancel"
						onclick={() => (showIntegrate = false)}
						disabled={confirming}
					>
						Cancel
					</button>
					<button
						class="integrate-confirm"
						onclick={handleConfirmIntegrate}
						disabled={!proposedActions.some((a) => a.approved) || confirming}
					>
						{#if confirming}
							Creating...
						{:else}
							Create {proposedActions.filter((a) => a.approved).length} item{proposedActions.filter(
								(a) => a.approved
							).length === 1
								? ''
								: 's'}
						{/if}
					</button>
				</div>
			{:else if integrateError}
				<div class="integrate-footer">
					<button class="integrate-cancel" onclick={() => (showIntegrate = false)}> Close </button>
					<button class="integrate-confirm" onclick={handleIntegrate}> Retry </button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Normal chat view -->
		<div class="chat-messages" bind:this={chatContainer}>
			{#if chatHistory.length === 0}
				<div class="chat-empty">
					<p>Start a conversation to develop this thought.</p>
					<p class="chat-empty-hint">Ask questions, explore implications, refine the idea.</p>
				</div>
			{/if}

			{#each chatHistory as msg}
				<div
					class="chat-msg"
					class:user={msg.role === 'user'}
					class:assistant={msg.role === 'assistant'}
				>
					<span class="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
					<div class="msg-content">{msg.content}</div>
				</div>
			{/each}

			{#if sending}
				<div class="chat-msg assistant">
					<span class="msg-role">AI</span>
					<div class="msg-content thinking">Thinking...</div>
				</div>
			{/if}
		</div>

		<div class="chat-input-area">
			<textarea
				class="chat-input"
				placeholder="Type a message..."
				bind:value={userInput}
				onkeydown={handleKeyDown}
				disabled={sending || integrated}
				rows="2"
			></textarea>
			<button class="chat-send" onclick={handleSend} disabled={sending || !userInput.trim()}>
				{sending ? '...' : 'Send'}
			</button>
		</div>
	{/if}
</div>

<style>
	.chat-panel {
		width: 360px;
		height: 100%;
		background: #0f0f0f;
		border-left: 1px solid #1a1a1a;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.chat-header-info {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		flex: 1;
	}

	.chat-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.chat-title {
		font-size: 11px;
		font-weight: 600;
		color: #a3a3a3;
		flex-shrink: 0;
	}

	.chat-note-title {
		font-size: 11px;
		color: #525252;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chat-close {
		background: none;
		border: none;
		color: #525252;
		cursor: pointer;
		font-size: 14px;
		padding: 2px 6px;
	}

	.chat-close:hover {
		color: #a3a3a3;
	}

	.integrate-btn {
		background: #1a2a1a;
		border: 1px solid #16a34a;
		border-radius: 4px;
		color: #22c55e;
		font-size: 11px;
		padding: 3px 10px;
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
	.integrate-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.integrate-header {
		padding: 12px 14px;
		border-bottom: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.integrate-title {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.integrate-error {
		display: block;
		font-size: 11px;
		color: #ef4444;
		margin-top: 6px;
	}

	.integrate-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.integrate-loading p {
		font-size: 12px;
		color: #525252;
		font-style: italic;
	}

	.integrate-actions {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.action-card {
		background: #141414;
		border: 1px solid #1f1f1f;
		border-radius: 6px;
		padding: 10px;
		transition: opacity 0.15s;
	}

	.action-card.rejected {
		opacity: 0.35;
	}

	.action-head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}

	.action-check input {
		cursor: pointer;
		accent-color: #22c55e;
	}

	.action-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #fff;
		padding: 1px 5px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.action-title {
		font-size: 12px;
		font-weight: 500;
		color: #d4d4d4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-body {
		font-size: 11px;
		color: #737373;
		line-height: 1.4;
		margin: 0;
	}

	.action-parent {
		font-size: 10px;
		color: #404040;
		margin: 4px 0 0;
		font-style: italic;
	}

	.integrate-footer {
		display: flex;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid #1a1a1a;
		flex-shrink: 0;
	}

	.integrate-cancel {
		flex: 1;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		color: #737373;
		font-size: 12px;
		padding: 6px;
		cursor: pointer;
	}

	.integrate-cancel:hover {
		background: #222;
	}

	.integrate-confirm {
		flex: 1;
		background: #052e16;
		border: 1px solid #16a34a;
		border-radius: 6px;
		color: #22c55e;
		font-size: 12px;
		font-weight: 500;
		padding: 6px;
		cursor: pointer;
	}

	.integrate-confirm:hover:not(:disabled) {
		background: #064e3b;
	}

	.integrate-confirm:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Chat messages */
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
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
		font-size: 11px;
		color: #2a2a2a;
		margin-top: 4px;
	}

	.chat-msg {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.msg-role {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #404040;
	}

	.msg-content {
		font-size: 13px;
		line-height: 1.5;
		color: #a3a3a3;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.chat-msg.user .msg-content {
		color: #d4d4d4;
		background: #1a1a2e;
		border-radius: 8px;
		padding: 8px 10px;
	}

	.chat-msg.assistant .msg-content {
		color: #a3a3a3;
		background: #141414;
		border-radius: 8px;
		padding: 8px 10px;
	}

	.msg-content.thinking {
		color: #525252;
		font-style: italic;
	}

	.chat-input-area {
		display: flex;
		gap: 6px;
		padding: 10px 12px;
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
</style>
