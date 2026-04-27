// ---------------------------------------------------------------------------
// TipTap JSON ↔ Markdown conversion
//
// Lightweight converter for the TipTap document format used by Butterfly.
// Handles: paragraphs, headings, bullet lists, ordered lists, code blocks,
// blockquotes, bold, italic, code, links.
// ---------------------------------------------------------------------------

type TipTapNode = {
	type: string;
	content?: TipTapNode[];
	text?: string;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	attrs?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// TipTap → Markdown
// ---------------------------------------------------------------------------

function renderMarks(text: string, marks?: TipTapNode['marks']): string {
	if (!marks || marks.length === 0) return text;

	let result = text;
	for (const mark of marks) {
		switch (mark.type) {
			case 'bold':
				result = `**${result}**`;
				break;
			case 'italic':
				result = `*${result}*`;
				break;
			case 'code':
				result = `\`${result}\``;
				break;
			case 'link':
				result = `[${result}](${mark.attrs?.href ?? ''})`;
				break;
		}
	}
	return result;
}

function renderInline(nodes?: TipTapNode[]): string {
	if (!nodes) return '';
	return nodes.map((n) => renderMarks(n.text ?? '', n.marks)).join('');
}

function renderNode(node: TipTapNode, indent = ''): string {
	switch (node.type) {
		case 'doc':
			return (node.content ?? []).map((c) => renderNode(c, indent)).join('\n\n');

		case 'paragraph':
			return indent + renderInline(node.content);

		case 'heading': {
			const level = (node.attrs?.level as number) ?? 1;
			const prefix = '#'.repeat(level);
			return `${prefix} ${renderInline(node.content)}`;
		}

		case 'bulletList':
			return (node.content ?? [])
				.map((li) => {
					const text = (li.content ?? []).map((c) => renderNode(c, '')).join('\n');
					return `${indent}- ${text}`;
				})
				.join('\n');

		case 'orderedList':
			return (node.content ?? [])
				.map((li, i) => {
					const text = (li.content ?? []).map((c) => renderNode(c, '')).join('\n');
					return `${indent}${i + 1}. ${text}`;
				})
				.join('\n');

		case 'codeBlock': {
			const lang = (node.attrs?.language as string) ?? '';
			const code = renderInline(node.content);
			return `\`\`\`${lang}\n${code}\n\`\`\``;
		}

		case 'blockquote':
			return (node.content ?? []).map((c) => `> ${renderNode(c, '')}`).join('\n');

		case 'horizontalRule':
			return '---';

		case 'text':
			return renderMarks(node.text ?? '', node.marks);

		default:
			// Unknown node — render children if any
			if (node.content) {
				return node.content.map((c) => renderNode(c, indent)).join('\n');
			}
			return node.text ?? '';
	}
}

/**
 * Convert a TipTap JSON document to Markdown.
 */
export function tiptapToMarkdown(doc: Record<string, unknown>): string {
	return renderNode(doc as TipTapNode);
}

// ---------------------------------------------------------------------------
// Markdown → TipTap
// ---------------------------------------------------------------------------

/**
 * Convert Markdown text to a simple TipTap document.
 * This is a basic converter — wraps each paragraph into TipTap paragraph nodes.
 */
export function markdownToTiptap(md: string): Record<string, unknown> {
	const lines = md.split('\n');
	const content: TipTapNode[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Empty line — skip
		if (line.trim() === '') {
			i++;
			continue;
		}

		// Heading
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			content.push({
				type: 'heading',
				attrs: { level: headingMatch[1].length },
				content: [{ type: 'text', text: headingMatch[2] }]
			});
			i++;
			continue;
		}

		// Code block
		if (line.startsWith('```')) {
			const lang = line.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith('```')) {
				codeLines.push(lines[i]);
				i++;
			}
			content.push({
				type: 'codeBlock',
				attrs: { language: lang },
				content: [{ type: 'text', text: codeLines.join('\n') }]
			});
			i++; // skip closing ```
			continue;
		}

		// Horizontal rule
		if (/^---+$/.test(line.trim())) {
			content.push({ type: 'horizontalRule' });
			i++;
			continue;
		}

		// Blockquote
		if (line.startsWith('> ')) {
			content.push({
				type: 'blockquote',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: line.slice(2) }]
					}
				]
			});
			i++;
			continue;
		}

		// Bullet list item
		if (/^\s*[-*]\s/.test(line)) {
			const items: TipTapNode[] = [];
			while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
				const text = lines[i].replace(/^\s*[-*]\s+/, '');
				items.push({
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
				});
				i++;
			}
			content.push({ type: 'bulletList', content: items });
			continue;
		}

		// Ordered list item
		if (/^\s*\d+\.\s/.test(line)) {
			const items: TipTapNode[] = [];
			while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
				const text = lines[i].replace(/^\s*\d+\.\s+/, '');
				items.push({
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
				});
				i++;
			}
			content.push({ type: 'orderedList', content: items });
			continue;
		}

		// Regular paragraph
		content.push({
			type: 'paragraph',
			content: [{ type: 'text', text: line }]
		});
		i++;
	}

	return { type: 'doc', content };
}
