/**
 * Zone navigation store.
 *
 * Butterfly has three top-level zones:
 * - notes: raw thinking, AI-assisted fleshing out
 * - planning: hierarchical structured planning (intents -> epics -> phases -> tickets)
 * - docs: auto-maintained project/code documentation
 */

export type Zone = 'notes' | 'planning' | 'docs';

let activeZone = $state<Zone>('notes');

export function getActiveZone(): Zone {
	return activeZone;
}

export function setActiveZone(z: Zone): void {
	activeZone = z;
}
