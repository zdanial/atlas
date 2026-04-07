export interface NodeTypeConfig {
	label: string;
	bg: string;
	badge: string;
	border: string;
}

export const NODE_TYPES: Record<string, NodeTypeConfig> = {
	idea: { label: 'Idea', bg: '#1a1a2e', badge: '#6366f1', border: '#4f46e5' },
	note: { label: 'Note', bg: '#1a1a1a', badge: '#737373', border: '#525252' },
	question: { label: 'Question', bg: '#1a2420', badge: '#22c55e', border: '#16a34a' },
	constraint: { label: 'Constraint', bg: '#2a1a1a', badge: '#ef4444', border: '#dc2626' },
	risk: { label: 'Risk', bg: '#2a1f1a', badge: '#f97316', border: '#ea580c' },
	decision: { label: 'Decision', bg: '#1a1a2e', badge: '#8b5cf6', border: '#7c3aed' },
	goal: { label: 'Goal', bg: '#1a2a2a', badge: '#06b6d4', border: '#0891b2' },
	problem: { label: 'Problem', bg: '#2a1a1a', badge: '#e11d48', border: '#be123c' },
	hypothesis: { label: 'Hypothesis', bg: '#1f1a2a', badge: '#a855f7', border: '#9333ea' },
	insight: { label: 'Insight', bg: '#1a2a1f', badge: '#10b981', border: '#059669' },
	reference: { label: 'Reference', bg: '#1a1f2a', badge: '#3b82f6', border: '#2563eb' },
	bet: { label: 'Bet', bg: '#2a1a2a', badge: '#ec4899', border: '#db2777' },
	task: { label: 'Task', bg: '#1f1f1a', badge: '#eab308', border: '#ca8a04' },
	intent: { label: 'Intent', bg: '#1a2a2a', badge: '#14b8a6', border: '#0d9488' },
	epic: { label: 'Epic', bg: '#1a1f2a', badge: '#6366f1', border: '#4f46e5' },
	phase: { label: 'Phase', bg: '#1a1a2a', badge: '#818cf8', border: '#6366f1' },
	ticket: { label: 'Ticket', bg: '#1f1f1a', badge: '#facc15', border: '#eab308' }
};

export const NODE_TYPE_KEYS = Object.keys(NODE_TYPES);

const DEFAULT_CONFIG: NodeTypeConfig = {
	label: 'Unknown',
	bg: '#1a1a1a',
	badge: '#737373',
	border: '#525252'
};

export function getNodeTypeConfig(type: string): NodeTypeConfig {
	return NODE_TYPES[type] ?? DEFAULT_CONFIG;
}

/**
 * Extract plain text from a TipTap JSON document for preview purposes.
 */
export function extractBodyText(body: Record<string, unknown> | null, maxLength = 120): string {
	if (!body) return '';

	// TipTap JSON format: { type: 'doc', content: [...] }
	if (body.type === 'doc' && Array.isArray(body.content)) {
		const parts: string[] = [];
		for (const block of body.content) {
			if (block && typeof block === 'object' && 'content' in block && Array.isArray(block.content)) {
				for (const inline of block.content) {
					if (inline && typeof inline === 'object' && 'text' in inline) {
						parts.push(String(inline.text));
					}
				}
			}
		}
		const text = parts.join(' ');
		return text.length > maxLength ? text.slice(0, maxLength) : text;
	}

	// Legacy format: { text: string }
	if ('text' in body) {
		const text = String(body.text);
		return text.length > maxLength ? text.slice(0, maxLength) : text;
	}

	// Fallback
	const str = JSON.stringify(body);
	if (str.length <= 2) return '';
	return str.length > maxLength ? str.slice(0, maxLength) : str;
}
