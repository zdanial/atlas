/**
 * Demo walkthrough step definitions.
 *
 * Each step describes what to highlight, what text to show, and what
 * programmatic action to execute (if any) when entering the step.
 */

import type { Zone } from '$lib/stores/zone.svelte';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface DemoStep {
	/** Step title shown in tooltip */
	title: string;
	/** Step description shown in tooltip */
	description: string;
	/**
	 * CSS selector for the element to spotlight.
	 * null = full-screen overlay (no spotlight cutout).
	 */
	target: string | null;
	/** Preferred tooltip position relative to spotlight */
	tooltipPosition: TooltipPosition;
	/** Zone to switch to before this step (if any) */
	zone?: Zone;
	/** CustomEvent name to dispatch when entering this step */
	action?: string;
	/** Detail payload for the CustomEvent */
	actionDetail?: Record<string, unknown>;
}

export const DEMO_STEPS: DemoStep[] = [
	// ═══════════════════════════════════════════════════════════
	// Phase 1: Introduction
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Welcome to Butterfly',
		description:
			'Butterfly turns messy thinking into structured plans. You\'re looking at "TaskFlow" — a sample project. Let\'s walk through how it works.',
		target: null,
		tooltipPosition: 'bottom'
	},
	{
		title: 'Three Zones',
		description:
			'Notes for raw thinking, Planning for structured hierarchy, Docs for auto-generated documentation. Switch between them here.',
		target: '.zone-nav',
		tooltipPosition: 'right'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 2: Notes Zone basics
	// ═══════════════════════════════════════════════════════════
	{
		title: 'The Canvas',
		description:
			'Each card is a classified note — goals, decisions, risks, insights — laid out on a timeline. Scroll to explore.',
		target: '.canvas-container',
		tooltipPosition: 'bottom',
		zone: 'notes'
	},
	{
		title: 'Brain Dump',
		description:
			'Paste raw text and Butterfly classifies each thought into typed notes on the timeline.',
		target: '[data-demo="import-btn"]',
		tooltipPosition: 'bottom',
		zone: 'notes'
	},
	{
		title: 'AI Connector',
		description:
			'The background agent classifies new notes and infers relationships. Configure your API key in Settings to enable it.',
		target: '[data-demo="connector"]',
		tooltipPosition: 'left',
		zone: 'notes'
	},
	{
		title: 'Note Types',
		description:
			'Each note has a type badge — Goal, Decision, Risk, etc. Click any card to chat with AI and develop the idea.',
		target: '.note-card',
		tooltipPosition: 'right',
		zone: 'notes',
		action: 'demo:select-note'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 3: Conversation Trees (M5)
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Branching ideas',
		description:
			'Notes can branch into conversations. The "Smart task suggestions" idea forks into a question, two competing insights, and a final decision — preserving the full reasoning trail.',
		target: '.canvas-container',
		tooltipPosition: 'top',
		zone: 'notes',
		action: 'demo:select-note',
		actionDetail: { title: 'smart task suggestions' }
	},
	{
		title: 'Thread view',
		description:
			'Open a focused thread to walk a conversation top-to-bottom. Forks let you switch between alternative branches without losing either path.',
		target: '.thread-view',
		tooltipPosition: 'left',
		zone: 'notes',
		action: 'demo:open-thread',
		actionDetail: { title: 'smart task suggestions' }
	},
	{
		title: 'AI sees the whole thread',
		description:
			'When you chat with a node deep in a branch, the system prompt walks the ancestor chain so the AI has full conversation context — no copy-paste needed.',
		target: null,
		tooltipPosition: 'bottom',
		zone: 'notes'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 4: Compaction (flat + branch)
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Compaction',
		description:
			'Select multiple notes and click Compact to merge them into a single synthesized summary. Originals can be archived to keep the canvas clean.',
		target: '[data-demo="compact-btn"]',
		tooltipPosition: 'bottom',
		zone: 'notes'
	},
	{
		title: 'Branch compaction',
		description:
			'Switch to Branch mode to pick a conversation root — the entire subtree is summarized into one node, with originals archived but still traceable.',
		target: '.compaction-panel',
		tooltipPosition: 'left',
		zone: 'notes',
		action: 'demo:open-compact'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 5: Context + Promote
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Context Panel',
		description:
			'Global context (goals, constraints, tech stack) feeds into every AI call. Keep it current for better results.',
		target: '[data-demo="context-btn"]',
		tooltipPosition: 'bottom',
		action: 'demo:open-context-panel'
	},
	{
		title: 'Promote to Plan',
		description:
			'Select a note and click Promote to manually turn it into a feature, epic, or ticket in the planning hierarchy.',
		target: '[data-demo="promote-btn"]',
		tooltipPosition: 'bottom',
		zone: 'notes',
		action: 'demo:select-note'
	},
	{
		title: 'AI Integration',
		description:
			'Click Promote to Plan inside a node chat to have AI analyze your note against the existing plan and propose where it fits.',
		target: '[data-demo="integrate-btn"]',
		tooltipPosition: 'bottom',
		zone: 'notes',
		action: 'demo:open-node-chat',
		actionDetail: { title: 'smart task suggestions' }
	},
	{
		title: 'Review Proposals',
		description:
			'AI proposals appear in a tree view merged with your existing plan. Accept, edit, or dismiss each item individually.',
		target: null,
		tooltipPosition: 'bottom'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 6: Planning Zone
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Planning Hierarchy',
		description:
			'Work is organized into Features → Epics → Phases → Tickets. Click any item to drill deeper.',
		target: '.planning-toolbar',
		tooltipPosition: 'bottom',
		zone: 'planning'
	},
	{
		title: 'Drill Down',
		description:
			'Click "TaskFlow MVP Launch" to see its epics: Core Task Engine, Team Collaboration, Onboarding.',
		target: '.canvas-container',
		tooltipPosition: 'bottom',
		zone: 'planning',
		action: 'demo:drill-feature'
	},
	{
		title: 'Dashboard view',
		description:
			'Toggle to Dashboard for a top-down progress view across features, epics, and phases.',
		target: '[data-demo="planning-views"]',
		tooltipPosition: 'bottom',
		zone: 'planning',
		action: 'demo:switch-view',
		actionDetail: { view: 'dashboard' }
	},
	{
		title: 'Plan Tree Modal',
		description:
			'Click any planning item to see its full hierarchy, edit descriptions, set targets, and manage children.',
		target: '.canvas-container',
		tooltipPosition: 'bottom',
		zone: 'planning',
		action: 'demo:switch-view',
		actionDetail: { view: 'plan' }
	},
	{
		title: 'Export for Agents',
		description:
			'In the Plan Tree modal, click the copy button to compile the full context chain into an executable Claude Code command.',
		target: '.planning-toolbar',
		tooltipPosition: 'bottom',
		zone: 'planning'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 7: Docs Zone
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Auto-Generated Docs',
		description:
			'Docs are generated from your plan structure — feature progress, status summaries, and recently completed work.',
		target: '[data-demo="docs-tabs"]',
		tooltipPosition: 'bottom',
		zone: 'docs'
	},
	{
		title: 'Project Health',
		description: 'Feature progress bars and status counts give you a quick project health check.',
		target: '.docs-content',
		tooltipPosition: 'top',
		zone: 'docs'
	},
	{
		title: 'Decisions & Questions',
		description:
			'The Decisions tab collects all decisions. The Questions tab gathers open questions. Nothing falls through the cracks.',
		target: '[data-demo="docs-decisions-tab"]',
		tooltipPosition: 'bottom',
		zone: 'docs',
		action: 'demo:switch-doc-tab',
		actionDetail: { tab: 'decisions' }
	},
	{
		title: 'Wiki view',
		description:
			'The Wiki tab renders any node as a document. [[Wikilinks]] in node bodies become navigable cross-references, and the sidebar shows backlinks automatically.',
		target: '.wiki-layout',
		tooltipPosition: 'top',
		zone: 'docs',
		action: 'demo:switch-doc-tab',
		actionDetail: { tab: 'wiki' }
	},
	{
		title: 'Wiki — backlinks & navigation',
		description:
			'Click a wikilink to jump to the linked node. The right sidebar lists every node that references this one — a knowledge graph for free.',
		target: '.wiki-main',
		tooltipPosition: 'left',
		zone: 'docs',
		action: 'demo:select-wiki-node',
		actionDetail: { title: 'taskflow mvp launch' }
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 8: Power features
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Command Palette',
		description:
			'Press ⌘K (or Ctrl+K) anywhere to open the command palette. Search for any node, switch zones, or trigger actions without touching the mouse.',
		target: '[data-demo="command-palette"]',
		tooltipPosition: 'bottom',
		action: 'demo:open-command-palette'
	},
	{
		title: 'Global Context',
		description:
			'The context panel has structured sections and auto-suggestions from your notes. It compiles into every AI prompt.',
		target: '.context-panel',
		tooltipPosition: 'left',
		action: 'demo:open-context-panel'
	},

	// ═══════════════════════════════════════════════════════════
	// Phase 9: Close
	// ═══════════════════════════════════════════════════════════
	{
		title: 'Try It Yourself',
		description:
			"That's Butterfly: dump thoughts → classify → structure → execute. Double-click the canvas to create a note, or click Import to brain-dump. Happy thinking!",
		target: null,
		tooltipPosition: 'bottom'
	}
];
