// ---------------------------------------------------------------------------
// YAML Frontmatter — parse/serialize markdown files with YAML frontmatter
// ---------------------------------------------------------------------------

export interface FileFrontmatter {
	id: string;
	type: string;
	title: string;
	status: string;
	parent?: string;
	tags?: string[];
	created: string;
	updated: string;
}

export interface ParsedMarkdownFile {
	frontmatter: FileFrontmatter;
	body: string;
}

/**
 * Parse a markdown file with YAML frontmatter into structured data.
 */
export function parseMarkdownFile(content: string): ParsedMarkdownFile | null {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return null;

	const yamlBlock = match[1];
	const body = match[2].trim();

	// Simple YAML parser (no dependency needed for flat key-value)
	const fm: Record<string, unknown> = {};
	for (const line of yamlBlock.split('\n')) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		const [, key, rawValue] = kv;
		let value: unknown = rawValue;

		// Handle arrays: [item1, item2]
		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			value = rawValue
				.slice(1, -1)
				.split(',')
				.map((s) => s.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		}
		// Handle quoted strings
		else if (
			(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))
		) {
			value = rawValue.slice(1, -1);
		}

		fm[key] = value;
	}

	if (!fm.id || !fm.type || !fm.title) return null;

	return {
		frontmatter: {
			id: String(fm.id),
			type: String(fm.type),
			title: String(fm.title),
			status: String(fm.status ?? 'draft'),
			parent: fm.parent ? String(fm.parent) : undefined,
			tags: Array.isArray(fm.tags) ? fm.tags : undefined,
			created: String(fm.created ?? ''),
			updated: String(fm.updated ?? '')
		},
		body
	};
}

/**
 * Serialize frontmatter + body into a markdown file string.
 */
export function serializeMarkdownFile(fm: FileFrontmatter, body: string): string {
	const lines: string[] = ['---'];

	lines.push(`id: ${fm.id}`);
	lines.push(`type: ${fm.type}`);
	lines.push(`title: "${fm.title.replace(/"/g, '\\"')}"`);
	lines.push(`status: ${fm.status}`);
	if (fm.parent) lines.push(`parent: ${fm.parent}`);
	if (fm.tags && fm.tags.length > 0) {
		lines.push(`tags: [${fm.tags.join(', ')}]`);
	}
	lines.push(`created: ${fm.created}`);
	lines.push(`updated: ${fm.updated}`);

	lines.push('---');
	lines.push('');
	lines.push(body);

	return lines.join('\n');
}
