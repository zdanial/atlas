/**
 * Client for the Claude Code container service.
 *
 * Calls the Rust backend proxy, which forwards to the containerized
 * Claude Code CLI wrapper. Used for planning, braindump, and chat.
 */

export type ClaudeModel = 'haiku' | 'sonnet' | 'opus';

export interface ClaudeCodeRequest {
	systemPrompt?: string;
	userPrompt: string;
	model?: ClaudeModel;
}

/**
 * Call the Claude Code container service via the backend proxy.
 * Returns the raw text output from Claude Code.
 */
export async function callClaudeCode(req: ClaudeCodeRequest): Promise<string> {
	const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:6100';
	const res = await fetch(`${apiUrl}/api/claude-code/prompt`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			system_prompt: req.systemPrompt,
			user_prompt: req.userPrompt,
			model: req.model
		})
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
		throw new Error(err.error || `Claude Code error: ${res.status}`);
	}

	const data = await res.json();
	return data.output;
}

/**
 * Check if the Claude Code service is available.
 */
export async function isClaudeCodeAvailable(): Promise<boolean> {
	try {
		const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:6100';
		const res = await fetch(`${apiUrl}/api/claude-code/prompt`, {
			method: 'OPTIONS'
		});
		return res.ok || res.status === 405; // 405 = endpoint exists but wrong method
	} catch {
		return false;
	}
}
