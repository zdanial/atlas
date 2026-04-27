<script lang="ts">
	import { onMount } from 'svelte';
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		currentView: string;
		onAction: (action: string, payload?: unknown) => void;
		onClose: () => void;
	}

	let { nodes, currentView, onAction, onClose }: Props = $props();

	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl: HTMLInputElement;

	interface Command {
		id: string;
		label: string;
		category: 'action' | 'view' | 'node';
		action: string;
		payload?: unknown;
		icon?: string;
		badge?: string;
		badgeColor?: string;
	}

	const BASE_COMMANDS: Command[] = [
		{ id: 'new_note', label: 'New Note', category: 'action', action: 'new_note', icon: '+' },
		{
			id: 'view_canvas',
			label: 'Switch to Canvas',
			category: 'view',
			action: 'switch_view',
			payload: 'canvas',
			icon: '◻'
		},
		{
			id: 'view_kanban',
			label: 'Switch to Kanban',
			category: 'view',
			action: 'switch_view',
			payload: 'kanban',
			icon: '⊞'
		},
		{
			id: 'view_graph',
			label: 'Switch to Graph',
			category: 'view',
			action: 'switch_view',
			payload: 'graph',
			icon: '◎'
		},
		{
			id: 'view_roadmap',
			label: 'Switch to Roadmap',
			category: 'view',
			action: 'switch_view',
			payload: 'roadmap',
			icon: '▬'
		},
		{
			id: 'toggle_intents',
			label: 'Toggle Intents Panel',
			category: 'action',
			action: 'toggle_intents',
			icon: '◆'
		},
		{ id: 'import', label: 'Import / Brain Dump', category: 'action', action: 'import', icon: '↓' },
		{ id: 'undo', label: 'Undo', category: 'action', action: 'undo', icon: '↺' },
		{ id: 'redo', label: 'Redo', category: 'action', action: 'redo', icon: '↻' }
	];

	let nodeCommands = $derived<Command[]>(
		nodes.map((n) => {
			const cfg = getNodeTypeConfig(n.type);
			return {
				id: `node_${n.id}`,
				label: n.title,
				category: 'node' as const,
				action: 'select_node',
				payload: n.id,
				badge: n.type,
				badgeColor: cfg.badge
			};
		})
	);

	let allCommands = $derived([...BASE_COMMANDS, ...nodeCommands]);

	let filteredCommands = $derived(() => {
		if (!query.trim()) return BASE_COMMANDS.slice(0, 10);
		const q = query.toLowerCase();
		return allCommands
			.filter((cmd) => {
				const label = cmd.label.toLowerCase();
				// Fuzzy match: every character in query appears in order
				let qi = 0;
				for (let i = 0; i < label.length && qi < q.length; i++) {
					if (label[i] === q[qi]) qi++;
				}
				return qi === q.length;
			})
			.slice(0, 15);
	});

	function handleSelect(cmd: Command) {
		// Save to recent
		saveRecent(cmd.id);
		onAction(cmd.action, cmd.payload);
	}

	function handleKeyDown(e: KeyboardEvent) {
		const cmds = filteredCommands();
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, cmds.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (cmds[selectedIndex]) {
				handleSelect(cmds[selectedIndex]);
			}
		} else if (e.key === 'Escape') {
			onClose();
		}
	}

	function saveRecent(id: string) {
		try {
			const recent = JSON.parse(
				localStorage.getItem('butterfly_recent_commands') ?? '[]'
			) as string[];
			const updated = [id, ...recent.filter((r) => r !== id)].slice(0, 5);
			localStorage.setItem('butterfly_recent_commands', JSON.stringify(updated));
		} catch {
			// ignore
		}
	}

	$effect(() => {
		// Reset selection when query changes
		query;
		selectedIndex = 0;
	});

	onMount(() => {
		inputEl?.focus();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="palette-backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="palette" data-demo="command-palette" onclick={(e) => e.stopPropagation()}>
		<div class="palette-input-row">
			<span class="palette-icon">⌘</span>
			<input
				bind:this={inputEl}
				bind:value={query}
				class="palette-input"
				placeholder="Type a command or search notes..."
				onkeydown={handleKeyDown}
			/>
		</div>

		<div class="palette-results">
			{#each filteredCommands() as cmd, i (cmd.id)}
				<button
					class="palette-item"
					class:selected={i === selectedIndex}
					onclick={() => handleSelect(cmd)}
					onmouseenter={() => (selectedIndex = i)}
				>
					{#if cmd.icon}
						<span class="item-icon">{cmd.icon}</span>
					{/if}
					<span class="item-label">{cmd.label}</span>
					{#if cmd.badge}
						<span class="item-badge" style:background-color={cmd.badgeColor}>{cmd.badge}</span>
					{/if}
					{#if cmd.category === 'view'}
						<span class="item-hint">View</span>
					{/if}
				</button>
			{/each}
			{#if filteredCommands().length === 0}
				<div class="palette-empty">No results</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.palette-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		padding-top: 20vh;
	}

	.palette {
		width: 480px;
		max-height: 400px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.palette-input-row {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid #262626;
		gap: 10px;
	}

	.palette-icon {
		color: #525252;
		font-size: 14px;
		flex-shrink: 0;
	}

	.palette-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: #e5e5e5;
		font-size: 14px;
	}

	.palette-input::placeholder {
		color: #525252;
	}

	.palette-results {
		overflow-y: auto;
		padding: 4px;
	}

	.palette-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #a3a3a3;
		font-size: 13px;
		cursor: pointer;
		text-align: left;
	}

	.palette-item.selected {
		background: #262626;
		color: #e5e5e5;
	}

	.item-icon {
		width: 18px;
		text-align: center;
		font-size: 12px;
		color: #525252;
		flex-shrink: 0;
	}

	.item-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 5px;
		border-radius: 3px;
		color: white;
	}

	.item-hint {
		font-size: 10px;
		color: #525252;
	}

	.palette-empty {
		text-align: center;
		color: #404040;
		font-size: 12px;
		padding: 20px;
	}
</style>
