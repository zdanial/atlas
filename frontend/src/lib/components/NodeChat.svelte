<script lang="ts">
	import { callChat, type ChatMessage } from '$lib/agents/providers';
	import { parseChatResponse, responseFormatInstructions } from '$lib/agents/chat-response';
	import type { Proposal, ProposalOp } from '$lib/proposals';
	import { getGlobalContext } from '$lib/stores/globalContext.svelte';
	import { getProjectNodes } from '$lib/stores/nodes.svelte';
	import { extractBodyText } from '$lib/node-types';
	import { savePayload, type ChatHistoryEntry } from '$lib/utils/chat-helpers';
	import ChatMessages from './ChatMessages.svelte';
	import ChatInput from './ChatInput.svelte';
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

	let chatHistory = $derived<ChatHistoryEntry[]>(
		(node.payload?.chatHistory as ChatHistoryEntry[]) ?? []
	);
	let userInput = $state('');
	let sending = $state(false);

	// --- Structured response handling ---

	function autoApplyCurrentNodeProposals(proposals: Proposal[]) {
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

	function getTagRelatedContext(): string {
		const noteTags: string[] = Array.isArray(node.payload?.tags)
			? (node.payload!.tags as string[])
			: [];
		if (noteTags.length === 0) return '';
		const allProjectNodes = getProjectNodes();
		const related = allProjectNodes.filter(
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

		const preamble = isPlanningNode
			? `You are a planning decomposition assistant in Butterfly, a spatial planning tool. Your job is to help break down work into concrete, actionable pieces. When discussing a ${node.type}, always think about what the next level of breakdown should be and propose those as new nodes.`
			: `You are a thinking partner in Butterfly, a spatial planning tool. Your job is to help explore ideas AND identify distinct threads, sub-topics, questions, and risks that deserve their own cards.`;

		return `${preamble}

The user is working on a ${node.type} titled: "${node.title}" (id: ${node.id})
${currentBody ? `\nDescription:\n${currentBody}` : ''}${payloadCtx}${hierarchyCtx}
${gc ? `\nGlobal project context (use this to align your responses):\n${gc}` : ''}
${plans ? `\nExisting plans:\n${plans}` : ''}${tagContext}
${isPlanningNode && fieldInstructions ? `\n### Planning node payload fields:\n${fieldInstructions}\nUpdate these via update_node proposals with changes.payload.` : ''}

${responseFormatInstructions({ projectId, currentNodeId: node.id, isNew, isPlanningNode, nodeListing })}`;
	}

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

			if (response) {
				const resp = parseChatResponse(response.text, node.id);

				const entry: ChatHistoryEntry = {
					role: 'assistant',
					content: resp.message,
					...(resp.proposals && resp.proposals.length > 0 ? { proposals: resp.proposals } : {})
				};
				const withReply = [...newHistory, entry];
				savePayload(node, { chatHistory: withReply }, onUpdateNode);
				autoApplyCurrentNodeProposals(resp.proposals);
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
			savePayload(node, { chatHistory: withError }, onUpdateNode);
		} finally {
			sending = false;
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

	<ChatMessages
		{chatHistory}
		{sending}
		contextNodeId={node.id}
		emptyText="Ask about this {node.type}, explore ideas, or refine its content."
	/>

	<ChatInput
		bind:value={userInput}
		{sending}
		placeholder="Ask about this {node.type}..."
		onSend={handleSend}
	/>
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
</style>
