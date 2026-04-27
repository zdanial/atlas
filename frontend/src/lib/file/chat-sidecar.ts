// ---------------------------------------------------------------------------
// Chat Sidecar — read/write .chat.md companion files for node conversations
// ---------------------------------------------------------------------------

export interface ChatSidecarMessage {
	timestamp: string;
	role: 'user' | 'assistant';
	content: string;
}

/**
 * Parse a chat sidecar markdown file into structured messages.
 */
export function parseChatSidecar(content: string): ChatSidecarMessage[] {
	const messages: ChatSidecarMessage[] = [];
	const sections = content.split(/^## /m).filter(Boolean);

	for (const section of sections) {
		// Skip the header comment
		if (section.startsWith('<!--')) continue;

		const headerMatch = section.match(/^(\S+)\s+—\s+(user|assistant)\s*\n([\s\S]*)$/);
		if (!headerMatch) continue;

		messages.push({
			timestamp: headerMatch[1],
			role: headerMatch[2] as 'user' | 'assistant',
			content: headerMatch[3].trim()
		});
	}

	return messages;
}

/**
 * Serialize chat messages into a sidecar markdown file.
 */
export function serializeChatSidecar(nodeId: string, messages: ChatSidecarMessage[]): string {
	const lines: string[] = [`<!-- chat sidecar for node ${nodeId} -->`];

	for (const msg of messages) {
		lines.push('');
		lines.push(`## ${msg.timestamp} — ${msg.role}`);
		lines.push(msg.content);
	}

	return lines.join('\n');
}
