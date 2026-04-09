/**
 * Planning zone navigation store.
 * Tracks drill-down through the hierarchy:
 * Intents (L4) → Epics (L3) → Phases (L2) → Tickets (L1)
 */

export interface NavEntry {
	nodeId: string;
	nodeType: string;
	title: string;
}

let navStack = $state<NavEntry[]>([]);

export function getPlanningLevel(): number {
	return navStack.length;
}

export function getCurrentParentId(): string | null {
	return navStack.length > 0 ? navStack[navStack.length - 1].nodeId : null;
}

export function drillDown(node: { id: string; type: string; title: string }): void {
	navStack = [...navStack, { nodeId: node.id, nodeType: node.type, title: node.title }];
}

export function drillUp(index?: number): void {
	if (index !== undefined) {
		navStack = navStack.slice(0, index);
	} else {
		navStack = navStack.slice(0, -1);
	}
}

export function resetNav(): void {
	navStack = [];
}

export function getPlanningBreadcrumbs(): NavEntry[] {
	return navStack;
}

/** Determine the default type of node to create at the current drill-down level. */
export function getCreateConfig(level: number): { type: string; layer: number; label: string } {
	switch (level) {
		case 0:
			return { type: 'feature', layer: 4, label: 'Feature' };
		case 1:
			return { type: 'epic', layer: 3, label: 'Epic' };
		case 2:
			return { type: 'phase', layer: 2, label: 'Phase' };
		default:
			return { type: 'ticket', layer: 1, label: 'Ticket' };
	}
}

/** All valid types that can be created at a given level. Default is first, rest are alternatives. */
export function getCreateOptions(
	level: number
): Array<{ type: string; layer: number; label: string }> {
	const all = [
		{ type: 'feature', layer: 4, label: 'Feature' },
		{ type: 'goal', layer: 4, label: 'Goal' },
		{ type: 'initiative', layer: 4, label: 'Initiative' },
		{ type: 'epic', layer: 3, label: 'Epic' },
		{ type: 'phase', layer: 2, label: 'Phase' },
		{ type: 'ticket', layer: 1, label: 'Ticket' }
	];
	// Put the default for this level first, then all others
	const defaultType = getCreateConfig(level).type;
	return [all.find((o) => o.type === defaultType)!, ...all.filter((o) => o.type !== defaultType)];
}

/** Types that can be drilled into (have children). */
const DRILLABLE_TYPES = new Set(['intent', 'feature', 'goal', 'initiative', 'epic', 'phase']);

export function isDrillable(type: string): boolean {
	return DRILLABLE_TYPES.has(type);
}

/**
 * Navigate to a specific parent node by building the drill-down path from root.
 * Walks up the parentId chain to build the breadcrumb, then drills down each level.
 */
export function navigateToParent(
	targetParentId: string,
	allNodes: Array<{ id: string; type: string; title: string; parentId: string | null }>
): void {
	// Build the path from target up to root
	const path: Array<{ id: string; type: string; title: string }> = [];
	let current = allNodes.find((n) => n.id === targetParentId);
	while (current) {
		path.unshift({ id: current.id, type: current.type, title: current.title });
		if (!current.parentId) break;
		current = allNodes.find((n) => n.id === current!.parentId);
	}

	// Reset and drill down each level
	navStack = [];
	for (const entry of path) {
		navStack = [...navStack, { nodeId: entry.id, nodeType: entry.type, title: entry.title }];
	}
}
