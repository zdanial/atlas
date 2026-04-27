<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { replaceWikilinks } from '$lib/docs/wikilinks';

	interface Props {
		content: string;
		nodes: Node[];
		onNavigate: (nodeId: string) => void;
	}

	let { content, nodes, onNavigate }: Props = $props();

	// Convert markdown-like text to basic HTML with wikilinks resolved
	let rendered = $derived.by(() => {
		let html = content;

		// Basic markdown rendering
		// Headings
		html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
		html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
		html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

		// Bold and italic
		html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

		// Inline code
		html = html.replace(/`(.+?)`/g, '<code>$1</code>');

		// Bullet lists
		html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
		html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

		// Paragraphs (wrap remaining lines)
		html = html
			.split('\n\n')
			.map((block) => {
				if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<li'))
					return block;
				return `<p>${block}</p>`;
			})
			.join('\n');

		// Resolve wikilinks
		html = replaceWikilinks(html, nodes);

		return html;
	});

	function handleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const link = target.closest('[data-node-id]');
		if (link) {
			e.preventDefault();
			const nodeId = link.getAttribute('data-node-id');
			if (nodeId) onNavigate(nodeId);
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wiki-content" onclick={handleClick}>
	{@html rendered}
</div>

<style>
	.wiki-content {
		font-size: 13px;
		color: #d4d4d4;
		line-height: 1.7;
	}

	.wiki-content :global(h1) {
		font-size: 20px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 16px 0 8px;
	}

	.wiki-content :global(h2) {
		font-size: 16px;
		font-weight: 600;
		color: #d4d4d4;
		margin: 14px 0 6px;
		border-bottom: 1px solid #1a1a1a;
		padding-bottom: 4px;
	}

	.wiki-content :global(h3) {
		font-size: 14px;
		font-weight: 600;
		color: #a3a3a3;
		margin: 10px 0 4px;
	}

	.wiki-content :global(p) {
		margin: 8px 0;
	}

	.wiki-content :global(ul) {
		list-style: disc;
		padding-left: 20px;
		margin: 8px 0;
	}

	.wiki-content :global(li) {
		margin: 2px 0;
	}

	.wiki-content :global(code) {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 12px;
		background: #1a1a1a;
		padding: 1px 4px;
		border-radius: 3px;
		color: #a78bfa;
	}

	.wiki-content :global(strong) {
		color: #e5e5e5;
	}

	.wiki-content :global(.wikilink) {
		color: #6366f1;
		cursor: pointer;
		text-decoration: none;
		border-bottom: 1px dashed #6366f180;
	}

	.wiki-content :global(.wikilink:hover) {
		color: #818cf8;
		border-color: #818cf8;
	}

	.wiki-content :global(.wikilink-broken) {
		color: #ef4444;
		border-bottom: 1px dashed #ef444480;
		cursor: help;
	}
</style>
