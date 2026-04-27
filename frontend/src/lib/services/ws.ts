/**
 * Single global WebSocket connection to the backend.
 * Subscribers register handlers per event `type`.
 *
 * Auto-reconnect with exponential backoff (capped at 30s).
 */

import { logInfo, logSuccess, logWarn, logError } from '$lib/stores/log.svelte';

type Handler = (msg: Record<string, unknown>) => void;

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let backoffMs = 500;
let stopped = false;

function wsUrl(): string {
	if (typeof window === 'undefined') return '';
	const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
	return `${proto}://${window.location.host}/ws`;
}

function connect() {
	if (typeof window === 'undefined' || stopped) return;
	try {
		socket = new WebSocket(wsUrl());
	} catch (e) {
		logError('ws', 'WebSocket construction failed', String(e));
		scheduleReconnect();
		return;
	}

	socket.onopen = () => {
		backoffMs = 500;
		logInfo('ws', 'Connected');
	};

	socket.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data as string) as Record<string, unknown>;
			const type = typeof msg.type === 'string' ? msg.type : '';
			const set = handlers.get(type);
			if (set) for (const h of set) h(msg);
		} catch {
			// ignore
		}
	};

	socket.onclose = () => {
		if (!stopped) scheduleReconnect();
	};

	socket.onerror = () => {
		// onclose will fire afterwards and trigger reconnect
	};
}

function scheduleReconnect() {
	const delay = Math.min(backoffMs, 30_000);
	backoffMs = Math.min(backoffMs * 2, 30_000);
	setTimeout(connect, delay);
}

export function startWs() {
	if (socket) return;
	stopped = false;
	connect();
}

export function stopWs() {
	stopped = true;
	socket?.close();
	socket = null;
}

export function onWsEvent(type: string, handler: Handler): () => void {
	let set = handlers.get(type);
	if (!set) {
		set = new Set();
		handlers.set(type, set);
	}
	set.add(handler);
	return () => set!.delete(handler);
}

/**
 * Wire common backend events to the activity log.
 * Call once on app boot.
 */
export function pipeWsToActivityLog() {
	onWsEvent('analysis.progress', (msg) => {
		const status = String(msg.status ?? '');
		const message = String(msg.message ?? 'Cartographer progress');
		const detail = msg.findings_count != null ? `${msg.findings_count} findings` : undefined;
		if (status === 'done') logSuccess('cartographer', message, detail);
		else if (status === 'error') logError('cartographer', message);
		else logInfo('cartographer', message);
	});

	onWsEvent('cartographer.tool', (msg) => {
		const tool = String(msg.tool ?? 'tool');
		const summary = String(msg.summary ?? '');
		if (tool === 'tool_error' || tool === 'claude_error' || tool === 'claude_exit') {
			// Surface stderr in the message itself so it's visible without expanding
			const head = summary.length > 160 ? summary.slice(0, 160) + '…' : summary;
			logError('cartographer', `${tool}: ${head || '(no stderr)'}`, summary);
		} else {
			logInfo('cartographer', `${tool}: ${summary}`);
		}
	});

	onWsEvent('cartographer.finding', (msg) => {
		const finding = msg.finding as Record<string, unknown> | undefined;
		const title = (finding?.title as string) ?? '(untitled finding)';
		const type = (finding?.node_type as string) ?? 'note';
		logSuccess('cartographer', `+ ${type}: ${title}`);
	});

	onWsEvent('file.changed', (msg) => {
		logInfo('files', `${String(msg.action)} ${String(msg.path)}`);
	});

	onWsEvent('node.created', (msg) => {
		logInfo('backend', `Node created`, String(msg.node_id ?? ''));
	});
}
