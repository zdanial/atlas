/**
 * Activity Log Store
 *
 * Captures all significant events across the app — classification results,
 * errors, edge inferences, API calls — and surfaces them in the UI.
 */

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
	id: string;
	timestamp: Date;
	level: LogLevel;
	source: string; // e.g. "connector", "classifier", "storage"
	message: string;
	detail?: string; // extra context, shown on expand
}

let entries = $state<LogEntry[]>([]);

/** Add a log entry. */
export function log(level: LogLevel, source: string, message: string, detail?: string): LogEntry {
	const entry: LogEntry = {
		id: crypto.randomUUID(),
		timestamp: new Date(),
		level,
		source,
		message,
		detail
	};
	// Keep last 200 entries
	entries = [entry, ...entries.slice(0, 199)];
	return entry;
}

export const logInfo = (source: string, message: string, detail?: string) =>
	log('info', source, message, detail);

export const logSuccess = (source: string, message: string, detail?: string) =>
	log('success', source, message, detail);

export const logWarn = (source: string, message: string, detail?: string) =>
	log('warn', source, message, detail);

export const logError = (source: string, message: string, detail?: string) =>
	log('error', source, message, detail);

export function getLogEntries(): LogEntry[] {
	return entries;
}

export function clearLog() {
	entries = [];
}
