// ---------------------------------------------------------------------------
// Wikilinks — parse, resolve, and replace [[wikilinks]] in text
// ---------------------------------------------------------------------------

import type { Node } from '$lib/storage/adapter';

export interface WikilinkMatch {
	raw: string; // the full [[...]] match
	title: string; // the resolved title
	anchor?: string; // optional #anchor
}

/**
 * Parse all [[wikilinks]] from a text string.
 */
export function parseWikilinks(text: string): WikilinkMatch[] {
	const regex = /\[\[([^\]]+)\]\]/g;
	const matches: WikilinkMatch[] = [];
	let match;

	while ((match = regex.exec(text)) !== null) {
		const inner = match[1];
		const [title, anchor] = inner.split('#', 2);
		matches.push({
			raw: match[0],
			title: title.trim(),
			anchor: anchor?.trim()
		});
	}

	return matches;
}

/**
 * Resolve a wikilink title to a node ID.
 * Case-insensitive title matching.
 */
export function resolveWikilink(title: string, nodes: Node[]): string | null {
	const lower = title.toLowerCase();
	const node = nodes.find((n) => n.title.toLowerCase() === lower);
	return node?.id ?? null;
}

/**
 * Replace [[wikilinks]] in text with HTML links.
 * Resolved links become clickable; unresolved links are marked as broken.
 */
export function replaceWikilinks(
	text: string,
	nodes: Node[],
	onNavigate?: string // function name for onclick, e.g. "handleNavigate"
): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
		const [title] = inner.split('#', 2);
		const trimmed = title.trim();
		const nodeId = resolveWikilink(trimmed, nodes);

		if (nodeId) {
			const clickAttr = onNavigate ? ` onclick="${onNavigate}('${nodeId}')"` : '';
			return `<a class="wikilink" data-node-id="${nodeId}"${clickAttr}>${trimmed}</a>`;
		}

		return `<span class="wikilink-broken" title="Node not found">${trimmed}</span>`;
	});
}

/**
 * Find all nodes that reference a given node via [[wikilinks]] in their body text.
 */
export function findBacklinks(nodeId: string, nodes: Node[]): Node[] {
	const target = nodes.find((n) => n.id === nodeId);
	if (!target) return [];

	const targetTitle = target.title.toLowerCase();

	return nodes.filter((n) => {
		if (n.id === nodeId) return false;
		const body = getBodyText(n);
		if (!body) return false;
		const links = parseWikilinks(body);
		return links.some((link) => link.title.toLowerCase() === targetTitle);
	});
}

function getBodyText(node: Node): string {
	if (!node.body) return '';
	if (typeof node.body === 'string') return node.body;
	// TipTap doc: extract text recursively
	return extractText(node.body as Record<string, unknown>);
}

function extractText(obj: Record<string, unknown>): string {
	if (obj.text && typeof obj.text === 'string') return obj.text;
	if (Array.isArray(obj.content)) {
		return (obj.content as Record<string, unknown>[]).map((c) => extractText(c)).join(' ');
	}
	return '';
}
