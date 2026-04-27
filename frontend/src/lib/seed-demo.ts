/**
 * Demo seed data for Butterfly — "TaskFlow" scenario.
 *
 * A startup founder planning a B2B mobile task management app.
 * This exercises every Butterfly feature with relatable, real-world data.
 *
 * Three-zone structure:
 * - Notes (L5): raw founder thoughts positioned on a time axis
 * - Planning (L4→L3→L2→L1): hierarchical plan with parentId links
 * - Docs: populated automatically from plan structure
 */

import type { StorageAdapter, CreateNode, CreateEdge } from '$lib/storage/adapter';

const DAY_WIDTH = 300; // must match Canvas dayWidth default
const DAY_MS = 86_400_000;

function body(text: string): Record<string, unknown> {
	return {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text }]
			}
		]
	};
}

/** Position a note on the time axis. daysAgo=0 means today, daysAgo=3 means 3 days ago. */
function timeX(daysAgo: number): number {
	return -daysAgo * DAY_WIDTH + 40;
}

interface SeedNode extends CreateNode {
	_key: string;
}

export async function seedDemo(storage: StorageAdapter, projectId: string) {
	const existing = await storage.listNodes({ projectId });
	if (existing.length > 0) return;

	const nodes: SeedNode[] = [
		// ═══════════════════════════════════════════════════════════
		// NOTES ZONE — L5 (founder's raw thoughts on the time axis)
		// ═══════════════════════════════════════════════════════════

		// 5 days ago — initial vision
		{
			_key: 'goal-launch',
			type: 'goal',
			layer: 5,
			projectId,
			title: 'Launch TaskFlow MVP to 100 beta users by end of Q2',
			body: body(
				'We need a working product in front of real users by June. Spans three epics: [[Core Task Engine]], [[Team Collaboration]], and [[Onboarding & Retention]]. Focus on core task management — nothing fancy, just reliable and fast.'
			),
			status: 'active',
			positionX: timeX(5),
			positionY: 40
		},
		{
			_key: 'constraint-team',
			type: 'constraint',
			layer: 5,
			projectId,
			title: 'Team is 3 engineers + 1 designer, no mobile devs',
			body: body(
				'Nobody on the team has shipped a native mobile app. We need a cross-platform solution or we hire.'
			),
			status: 'active',
			positionX: timeX(5),
			positionY: 160
		},
		{
			_key: 'decision-rn',
			type: 'decision',
			layer: 5,
			projectId,
			title: 'Go React Native for cross-platform',
			body: body(
				'RN lets us ship iOS and Android from one codebase. Tradeoff to watch: see [[RN performance on mid-range Android devices]] for the perf risk and [[Targeting both iOS and Android at launch means shipping neither well]] for the focus risk. The team knows React. Expo makes the build pipeline manageable.'
			),
			status: 'done',
			positionX: timeX(5),
			positionY: 280
		},

		// 4 days ago — market insights
		{
			_key: 'insight-simplicity',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'Existing tools overwhelm small teams — our angle is radical simplicity',
			body: body(
				'Talked to 12 small-team leads. They all use Trello or sticky notes. Asana/Monday are too complex. Our wedge is dead-simple task creation.'
			),
			status: 'active',
			positionX: timeX(4),
			positionY: 40
		},
		{
			_key: 'question-push',
			type: 'question',
			layer: 5,
			projectId,
			title: 'Build our own push notifications or use Firebase?',
			body: body(
				'Firebase is fast to set up but adds a Google dependency. Own solution gives more control but takes 2+ weeks.'
			),
			status: 'active',
			positionX: timeX(4),
			positionY: 160
		},
		{
			_key: 'risk-both-platforms',
			type: 'risk',
			layer: 5,
			projectId,
			title: 'Targeting both iOS and Android at launch means shipping neither well',
			body: body(
				'RN performance on mid-range Android is a known issue. We might need to pick one platform for beta and add the other post-launch.'
			),
			status: 'active',
			positionX: timeX(4),
			positionY: 280
		},

		// 3 days ago — feature ideas
		{
			_key: 'idea-smart-suggest',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'Smart task suggestions based on team patterns',
			body: body(
				'If the system can learn recurring tasks (standup notes, deploy checks), it could auto-suggest them. Big differentiator.'
			),
			status: 'active',
			positionX: timeX(3),
			positionY: 40
		},
		{
			_key: 'problem-churn',
			type: 'problem',
			layer: 5,
			projectId,
			title: 'User onboarding has 70% week-1 churn in similar apps',
			body: body(
				'Industry data shows most task apps lose users in the first week. Empty state is the killer — users open the app, see nothing, leave. Two angles we are exploring: [[Import from Trello/Asana as killer onboarding hook]] and [[If onboarding creates real tasks from existing workflow, retention doubles]].'
			),
			status: 'active',
			positionX: timeX(3),
			positionY: 160
		},
		{
			_key: 'hypothesis-onboard',
			type: 'hypothesis',
			layer: 5,
			projectId,
			title: 'If onboarding creates real tasks from existing workflow, retention doubles',
			body: body(
				'Instead of an empty app, import existing tasks from Trello/Asana/email. User sees immediate value — their actual work, organized.'
			),
			status: 'active',
			payload: {
				chatHistory: [
					{
						role: 'user',
						content: 'The biggest problem with task apps is the empty state. How do we solve this?'
					},
					{
						role: 'assistant',
						content:
							"Import is the answer. If a user's first experience is seeing their existing tasks organized beautifully, they'll stay. The Trello API is well-documented — we could build an import pipeline in a few days."
					}
				]
			},
			positionX: timeX(3),
			positionY: 280
		},

		// 2 days ago — scoping decisions
		{
			_key: 'decision-mvp-scope',
			type: 'decision',
			layer: 5,
			projectId,
			title: 'MVP scope: task CRUD + team sharing + notifications. No analytics, no integrations',
			body: body(
				'We keep cutting scope. Analytics and third-party integrations are post-launch. Core loop only: create, assign, complete, notify.'
			),
			status: 'done',
			positionX: timeX(2),
			positionY: 40
		},
		{
			_key: 'idea-import',
			type: 'idea',
			layer: 5,
			projectId,
			title: 'Import from Trello/Asana as killer onboarding hook',
			body: body(
				'One-click migration. Map their boards to our projects, their cards to our tasks. Instant value on first launch.'
			),
			status: 'active',
			positionX: timeX(2),
			positionY: 160
		},
		{
			_key: 'risk-android',
			type: 'risk',
			layer: 5,
			projectId,
			title: 'RN performance on mid-range Android devices',
			body: body(
				'List rendering with 200+ tasks might stutter. Need to test on Pixel 4a and Samsung A-series early, not just iPhone 14.'
			),
			status: 'active',
			positionX: timeX(2),
			positionY: 280
		},
		{
			_key: 'constraint-runway',
			type: 'constraint',
			layer: 5,
			projectId,
			title: '$50K runway — must ship in 8 weeks',
			body: body(
				'Burn rate is ~$6K/week with contractors. 8 weeks gives us a buffer, but no room for scope creep.'
			),
			status: 'active',
			positionX: timeX(2),
			positionY: 400
		},

		// 1 day ago — customer feedback
		{
			_key: 'insight-slack',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'Talked to 5 customers — they all want Slack integration first',
			body: body(
				'Every single interview mentioned Slack. "I live in Slack, I want to create tasks without leaving." This is the #1 post-MVP feature, slotted into [[Team Collaboration]].'
			),
			status: 'active',
			positionX: timeX(1),
			positionY: 40
		},
		{
			_key: 'question-web',
			type: 'question',
			layer: 5,
			projectId,
			title: 'Need web app at launch or mobile-only?',
			body: body(
				'Mobile-first is our pitch, but team leads use laptops. A basic web dashboard for task assignment might be needed day 1.'
			),
			status: 'active',
			positionX: timeX(1),
			positionY: 160
		},
		{
			_key: 'bet-mobile-first',
			type: 'bet',
			layer: 5,
			projectId,
			title: 'Mobile-first + Slack will get 100 users faster than a web app',
			body: body(
				'Bet: if we nail the mobile experience and add /taskflow Slack commands, we hit 100 users before needing a web app.'
			),
			status: 'active',
			positionX: timeX(1),
			positionY: 280
		},

		// ── Conversation tree branching off "Smart task suggestions" (showcases ThreadView + Fork) ──
		{
			_key: 'conv-question',
			type: 'question',
			layer: 5,
			projectId,
			title: 'Suggest based on history or context?',
			body: body(
				'Two paths: pattern-match what users do every Monday (history) vs infer from current task list and recent activity (context). Which signal do we build for v1?'
			),
			status: 'active',
			positionX: timeX(3) + 240,
			positionY: 40
		},
		{
			_key: 'conv-insight-history',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'History wins for routine work',
			body: body(
				'Standups, weekly reports, deploy checklists — the same items recur. Tracking the last 30 days of completions gives near-perfect suggestions for the routine 60% of work.'
			),
			status: 'active',
			positionX: timeX(3) + 480,
			positionY: -20
		},
		{
			_key: 'conv-insight-context',
			type: 'insight',
			layer: 5,
			projectId,
			title: 'Context wins for new projects',
			body: body(
				'When a user creates a new project, history is empty. Reading the project description plus the first few tasks plus similar past projects produces good first suggestions.'
			),
			status: 'active',
			positionX: timeX(3) + 480,
			positionY: 100
		},
		{
			_key: 'conv-decision',
			type: 'decision',
			layer: 5,
			projectId,
			title: 'Ship history-based v1, layer context in v2',
			body: body(
				'History is simpler to build and covers 60% of value. Context-based suggestions need an LLM and are risky for an MVP. v1 = history-only; v2 = add context layer. Closes the [[Smart task suggestions based on team patterns]] thread.'
			),
			status: 'draft',
			positionX: timeX(3) + 720,
			positionY: 40
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L4 Feature (top-level)
		// ═══════════════════════════════════════════════════════════
		{
			_key: 'feature-mvp',
			type: 'feature',
			layer: 4,
			projectId,
			title: 'TaskFlow MVP Launch',
			body: body(
				'Ship a working mobile task management app to 100 beta users. Built from three epics: [[Core Task Engine]], [[Team Collaboration]], and [[Onboarding & Retention]]. Origin: [[Launch TaskFlow MVP to 100 beta users by end of Q2]].'
			),
			status: 'active',
			payload: {
				targetOutcome: '100 active beta users with >30% weekly retention',
				deadline: '2026-06-30',
				tags: ['mobile', 'mvp', 'react-native']
			},
			positionX: 100,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L3 Epics
		// ═══════════════════════════════════════════════════════════
		{
			_key: 'epic-task-engine',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Core Task Engine',
			body: body(
				'CRUD operations, data model, API layer, and mobile UI for tasks. The foundation everything else builds on.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Should tasks support subtasks in MVP or defer to v2?'],
				tags: ['backend', 'mobile']
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'epic-collab',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Team Collaboration',
			body: body(
				'Sharing, permissions, team workspaces, and real-time updates. Users need to see changes instantly.'
			),
			status: 'active',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['WebSocket or polling for real-time updates?'],
				tags: ['backend', 'realtime']
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'epic-onboard',
			type: 'epic',
			layer: 3,
			projectId,
			title: 'Onboarding & Retention',
			body: body(
				'Import pipeline from Trello/Asana, first-run experience, and empty-state handling to reduce week-1 churn.'
			),
			status: 'draft',
			payload: {
				prd: { type: 'doc', content: [] },
				techPlan: { type: 'doc', content: [] },
				openQuestions: ['Which import source to prioritize — Trello or Asana?'],
				tags: ['growth', 'onboarding']
			},
			positionX: 620,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L2 Phases
		// ═══════════════════════════════════════════════════════════

		// Core Task Engine phases
		{
			_key: 'phase-data-api',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 1: Data Model & API',
			body: body(
				'PostgreSQL schema, REST API with Express, authentication, and task CRUD endpoints.'
			),
			status: 'done',
			payload: {
				objective: 'Stand up the backend so the mobile app has a stable API to build against',
				fileChanges: [
					{ path: 'server/models/task.ts', action: 'create' },
					{ path: 'server/routes/tasks.ts', action: 'create' },
					{ path: 'server/middleware/auth.ts', action: 'create' }
				],
				archNotes:
					'REST over GraphQL for simplicity. JWT auth with refresh tokens. PostgreSQL with Prisma ORM for type safety.',
				verifyCriteria: [
					'CRUD endpoints return correct responses',
					'Auth middleware rejects invalid tokens',
					'Database migrations run cleanly'
				],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'phase-mobile-ui',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 2: Mobile UI',
			body: body('React Native screens: task list, task detail, create/edit, and swipe actions.'),
			status: 'active',
			payload: {
				objective:
					'Build the core mobile experience — fast list rendering, smooth animations, offline-first',
				fileChanges: [
					{ path: 'mobile/screens/TaskList.tsx', action: 'create' },
					{ path: 'mobile/screens/TaskDetail.tsx', action: 'create' },
					{ path: 'mobile/components/TaskCard.tsx', action: 'create' }
				],
				archNotes:
					'FlatList with virtualization for performance. Optimistic updates for perceived speed. AsyncStorage for offline cache.',
				verifyCriteria: [
					'List renders 500 tasks without jank',
					'Swipe-to-complete works on both platforms',
					'Offline mode shows cached tasks'
				],
				complexity: 'high',
				contextBundle: []
			},
			positionX: 340,
			positionY: 60
		},

		// Team Collaboration phases
		{
			_key: 'phase-sharing',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 1: Sharing & Permissions',
			body: body('Team workspaces, invite flow, role-based access (admin/member/viewer).'),
			status: 'active',
			payload: {
				objective: 'Let teams share task boards with proper access control',
				fileChanges: [
					{ path: 'server/models/workspace.ts', action: 'create' },
					{ path: 'server/routes/invites.ts', action: 'create' }
				],
				archNotes:
					'Workspace-scoped permissions. Invite via email link. Roles stored in junction table.',
				verifyCriteria: [
					'Invite link creates pending membership',
					'Viewer cannot edit tasks',
					'Admin can manage members'
				],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'phase-slack',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 2: Slack Integration',
			body: body('/taskflow slash command, task creation from Slack, notification forwarding.'),
			status: 'draft',
			payload: {
				objective: 'Let users create and manage tasks without leaving Slack',
				fileChanges: [
					{ path: 'server/integrations/slack.ts', action: 'create' },
					{ path: 'server/routes/slack-webhook.ts', action: 'create' }
				],
				archNotes:
					'Slack Bolt SDK for slash commands. Webhook endpoint for interactive messages. OAuth2 for workspace install.',
				verifyCriteria: [
					'/taskflow create works in any channel',
					'Task updates post to linked channel',
					'OAuth install flow completes'
				],
				complexity: 'high',
				contextBundle: []
			},
			positionX: 340,
			positionY: 60
		},

		// Onboarding phases
		{
			_key: 'phase-import',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 1: Import Pipeline',
			body: body('Trello API integration, board/card mapping, progress indicator.'),
			status: 'draft',
			payload: {
				objective: 'One-click import from Trello so users start with their existing tasks',
				fileChanges: [
					{ path: 'server/integrations/trello.ts', action: 'create' },
					{ path: 'mobile/screens/Import.tsx', action: 'create' }
				],
				archNotes: 'Trello REST API with OAuth1. Map boards→projects, lists→statuses, cards→tasks.',
				verifyCriteria: [
					'OAuth flow connects Trello account',
					'100-card board imports in <30s',
					'Labels preserved as tags'
				],
				complexity: 'med',
				contextBundle: []
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'phase-fre',
			type: 'phase',
			layer: 2,
			projectId,
			title: 'Phase 2: First-Run Experience',
			body: body('Guided onboarding flow, sample project, contextual tooltips.'),
			status: 'draft',
			payload: {
				objective: 'Eliminate the empty-state problem — every new user sees value in 60 seconds',
				fileChanges: [
					{ path: 'mobile/screens/Onboarding.tsx', action: 'create' },
					{ path: 'mobile/components/Tooltip.tsx', action: 'create' }
				],
				archNotes: 'Step-based onboarding stored in user preferences. Skip-able but sticky.',
				verifyCriteria: [
					'New user sees guided flow on first launch',
					'Sample project created with 5 tasks',
					'Can skip and return later'
				],
				complexity: 'low',
				contextBundle: []
			},
			positionX: 340,
			positionY: 60
		},

		// ═══════════════════════════════════════════════════════════
		// PLANNING ZONE — L1 Tickets
		// ═══════════════════════════════════════════════════════════

		// --- Data Model & API tickets ---
		{
			_key: 'ticket-schema',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Design PostgreSQL schema for tasks and projects',
			body: body(
				'Tables: projects, tasks, users, workspace_members. Tasks have title, description, status, assignee, due_date, priority.'
			),
			status: 'done',
			payload: {
				intent: 'Define the core data model that all features build on',
				filePaths: [{ repoId: 'taskflow', path: 'server/prisma/schema.prisma' }],
				acceptanceCriteria: [
					'Migration creates all tables',
					'Indexes on frequently queried columns',
					'Foreign keys enforce referential integrity'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 4 * DAY_MS).toISOString()
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-crud-api',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Implement task CRUD REST endpoints',
			body: body(
				'GET/POST/PUT/DELETE for /api/tasks. Pagination, filtering by status/assignee. Input validation with Zod.'
			),
			status: 'done',
			payload: {
				intent: 'Provide the API layer for all task operations',
				filePaths: [{ repoId: 'taskflow', path: 'server/routes/tasks.ts' }],
				acceptanceCriteria: [
					'All CRUD operations work',
					'Pagination returns correct pages',
					'Invalid input returns 400 with details'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 3 * DAY_MS).toISOString()
			},
			positionX: 200,
			positionY: 60
		},
		{
			_key: 'ticket-auth',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'JWT authentication middleware',
			body: body(
				'Login/register endpoints, JWT with 15-min access + 7-day refresh tokens, middleware for protected routes.'
			),
			status: 'done',
			payload: {
				intent: 'Secure the API so only authenticated users can access their tasks',
				filePaths: [{ repoId: 'taskflow', path: 'server/middleware/auth.ts' }],
				acceptanceCriteria: [
					'Login returns access + refresh tokens',
					'Expired access token returns 401',
					'Refresh endpoint issues new access token'
				],
				promptPayload: '',
				completedAt: new Date(Date.now() - 3 * DAY_MS).toISOString()
			},
			positionX: 340,
			positionY: 60
		},

		// --- Mobile UI tickets ---
		{
			_key: 'ticket-task-list',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Task list screen with FlatList',
			body: body(
				'Virtualized list with pull-to-refresh, swipe actions (complete, delete), and floating create button.'
			),
			status: 'active',
			payload: {
				intent: 'Build the primary screen users interact with most',
				filePaths: [{ repoId: 'taskflow', path: 'mobile/screens/TaskList.tsx' }],
				acceptanceCriteria: [
					'Renders 500 tasks without frame drops',
					'Swipe left to complete, right to delete',
					'Pull-to-refresh syncs from server'
				],
				promptPayload: ''
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-task-detail',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Task detail and edit screen',
			body: body(
				'Full task view with edit mode. Fields: title, description, status, assignee, due date, priority, tags.'
			),
			status: 'active',
			payload: {
				intent: 'Let users view and edit all task properties',
				filePaths: [{ repoId: 'taskflow', path: 'mobile/screens/TaskDetail.tsx' }],
				acceptanceCriteria: [
					'All fields editable',
					'Save persists to server immediately',
					'Back button shows updated list'
				],
				promptPayload: ''
			},
			positionX: 200,
			positionY: 60
		},
		{
			_key: 'ticket-offline',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Offline mode with AsyncStorage cache',
			body: body(
				'Cache task list locally. Queue mutations when offline. Sync queue on reconnect with conflict resolution.'
			),
			status: 'draft',
			payload: {
				intent: 'Ensure the app works in subway/airplane/poor connectivity scenarios',
				filePaths: [{ repoId: 'taskflow', path: 'mobile/lib/offlineSync.ts' }],
				acceptanceCriteria: [
					'App shows cached tasks when offline',
					'Mutations queue and replay on reconnect',
					'Server-wins conflict resolution'
				],
				promptPayload: ''
			},
			positionX: 340,
			positionY: 60
		},
		{
			_key: 'ticket-push',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Push notifications via Firebase',
			body: body(
				'FCM setup, notification on task assignment, due-date reminders, deep link to task detail.'
			),
			status: 'draft',
			payload: {
				intent: 'Keep users engaged with timely task notifications',
				filePaths: [{ repoId: 'taskflow', path: 'server/services/notifications.ts' }],
				acceptanceCriteria: [
					'Notification sent on task assignment',
					'Due-date reminder 1 hour before',
					'Tap notification opens task'
				],
				promptPayload: ''
			},
			positionX: 480,
			positionY: 60
		},

		// --- Sharing & Permissions tickets ---
		{
			_key: 'ticket-workspace',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Workspace creation and member management',
			body: body('Create workspace, invite members by email, assign roles (admin/member/viewer).'),
			status: 'active',
			payload: {
				intent: 'Enable team-based task organization',
				filePaths: [{ repoId: 'taskflow', path: 'server/models/workspace.ts' }],
				acceptanceCriteria: [
					'Create workspace returns workspace ID',
					'Invite sends email with join link',
					'Role change takes effect immediately'
				],
				promptPayload: ''
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-rbac',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Role-based access control middleware',
			body: body(
				'Middleware that checks user role before allowing task mutations. Viewers can read, members can edit, admins can manage.'
			),
			status: 'draft',
			payload: {
				intent: 'Prevent unauthorized actions in shared workspaces',
				filePaths: [{ repoId: 'taskflow', path: 'server/middleware/rbac.ts' }],
				acceptanceCriteria: [
					'Viewer gets 403 on POST/PUT/DELETE',
					'Member can create and edit own tasks',
					'Admin can delete any task'
				],
				promptPayload: ''
			},
			positionX: 200,
			positionY: 60
		},

		// --- Import Pipeline tickets ---
		{
			_key: 'ticket-trello-oauth',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Trello OAuth flow and board listing',
			body: body('OAuth1 token exchange, list user boards with card counts, store token securely.'),
			status: 'draft',
			payload: {
				intent: "Connect to a user's Trello account to enable import",
				filePaths: [{ repoId: 'taskflow', path: 'server/integrations/trello.ts' }],
				acceptanceCriteria: [
					'OAuth redirect flow works',
					'Board list shows all user boards',
					'Token stored encrypted'
				],
				promptPayload: ''
			},
			positionX: 60,
			positionY: 60
		},
		{
			_key: 'ticket-trello-import',
			type: 'ticket',
			layer: 1,
			projectId,
			title: 'Trello card-to-task mapper',
			body: body(
				'Map Trello cards to TaskFlow tasks: title, description, labels→tags, due dates, checklists→subtasks.'
			),
			status: 'draft',
			payload: {
				intent: 'Convert Trello data into TaskFlow format preserving all metadata',
				filePaths: [{ repoId: 'taskflow', path: 'server/integrations/trello-mapper.ts' }],
				acceptanceCriteria: [
					'Card title and description preserved',
					'Labels become tags',
					'Due dates transfer correctly'
				],
				promptPayload: ''
			},
			positionX: 200,
			positionY: 60
		}
	];

	// ── Create all nodes and build ID map ──────────────────────
	const idMap = new Map<string, string>();

	for (const seed of nodes) {
		const { _key, ...input } = seed;
		const created = await storage.createNode(input);
		idMap.set(_key, created.id);
	}

	// ── Wire parent IDs ────────────────────────────────────────
	const parentLinks: [string, string][] = [
		// Epics → Feature
		['epic-task-engine', 'feature-mvp'],
		['epic-collab', 'feature-mvp'],
		['epic-onboard', 'feature-mvp'],
		// Phases → Epics
		['phase-data-api', 'epic-task-engine'],
		['phase-mobile-ui', 'epic-task-engine'],
		['phase-sharing', 'epic-collab'],
		['phase-slack', 'epic-collab'],
		['phase-import', 'epic-onboard'],
		['phase-fre', 'epic-onboard'],
		// Tickets → Phases
		['ticket-schema', 'phase-data-api'],
		['ticket-crud-api', 'phase-data-api'],
		['ticket-auth', 'phase-data-api'],
		['ticket-task-list', 'phase-mobile-ui'],
		['ticket-task-detail', 'phase-mobile-ui'],
		['ticket-offline', 'phase-mobile-ui'],
		['ticket-push', 'phase-mobile-ui'],
		['ticket-workspace', 'phase-sharing'],
		['ticket-rbac', 'phase-sharing'],
		['ticket-trello-oauth', 'phase-import'],
		['ticket-trello-import', 'phase-import']
	];
	for (const [child, parent] of parentLinks) {
		const childId = idMap.get(child);
		const parentIdVal = idMap.get(parent);
		if (childId && parentIdVal) {
			await storage.updateNode(childId, { parentId: parentIdVal });
		}
	}

	// ── Create edges ───────────────────────────────────────────
	const edges: (CreateEdge & { _src: string; _tgt: string })[] = [
		// Notes ↔ Notes relationships
		{
			_src: 'insight-simplicity',
			_tgt: 'goal-launch',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'risk-both-platforms',
			_tgt: 'decision-rn',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.8,
			source: 'ai'
		},
		{
			_src: 'hypothesis-onboard',
			_tgt: 'problem-churn',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'idea-import',
			_tgt: 'hypothesis-onboard',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.85,
			source: 'ai'
		},
		{
			_src: 'constraint-runway',
			_tgt: 'decision-mvp-scope',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.7,
			source: 'ai'
		},
		{
			_src: 'insight-slack',
			_tgt: 'bet-mobile-first',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.8,
			source: 'ai'
		},
		{
			_src: 'risk-android',
			_tgt: 'constraint-team',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.6,
			source: 'ai'
		},
		// Conversation tree edges (parent → child via 'refines'/'supports')
		{
			_src: 'idea-smart-suggest',
			_tgt: 'conv-question',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'conv-question',
			_tgt: 'conv-insight-history',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'conv-question',
			_tgt: 'conv-insight-context',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 0.9,
			source: 'ai'
		},
		{
			_src: 'conv-insight-context',
			_tgt: 'conv-decision',
			sourceId: '',
			targetId: '',
			relationType: 'supports',
			weight: 0.95,
			source: 'human'
		},
		// Plan nodes → source notes (lineage)
		{
			_src: 'epic-task-engine',
			_tgt: 'decision-mvp-scope',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-onboard',
			_tgt: 'hypothesis-onboard',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-collab',
			_tgt: 'insight-slack',
			sourceId: '',
			targetId: '',
			relationType: 'refines',
			weight: 1.0,
			source: 'human'
		},
		// Dependency edges
		{
			_src: 'phase-data-api',
			_tgt: 'phase-mobile-ui',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-schema',
			_tgt: 'ticket-crud-api',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'ticket-crud-api',
			_tgt: 'ticket-task-list',
			sourceId: '',
			targetId: '',
			relationType: 'blocks',
			weight: 1.0,
			source: 'human'
		},
		// Planning hierarchy edges
		{
			_src: 'epic-task-engine',
			_tgt: 'feature-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-collab',
			_tgt: 'feature-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		},
		{
			_src: 'epic-onboard',
			_tgt: 'feature-mvp',
			sourceId: '',
			targetId: '',
			relationType: 'implements',
			weight: 1.0,
			source: 'human'
		}
	];

	for (const edge of edges) {
		const sourceId = idMap.get(edge._src);
		const targetId = idMap.get(edge._tgt);
		if (sourceId && targetId) {
			await storage.createEdge({
				sourceId,
				targetId,
				relationType: edge.relationType,
				weight: edge.weight,
				source: edge.source
			});
		}
	}
}
