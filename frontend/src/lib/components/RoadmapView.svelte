<script lang="ts">
	import type { Node } from '$lib/storage/adapter';
	import { getNodeTypeConfig } from '$lib/node-types';

	interface Props {
		nodes: Node[];
		onUpdateNode?: (id: string, patch: Partial<Node>) => void;
		onOpenNode?: (id: string) => void;
	}

	let { nodes, onUpdateNode, onOpenNode }: Props = $props();

	// Extract intents and their child epics
	let intents = $derived(nodes.filter((n) => n.type === 'intent'));
	let epics = $derived(nodes.filter((n) => n.type === 'epic'));

	interface IntentRow {
		intent: Node;
		epics: Node[];
		startDate: Date;
		endDate: Date;
	}

	let rows = $derived<IntentRow[]>(
		intents.map((intent) => {
			const intentEpics = epics.filter((e) => e.parentId === intent.id);
			const payload = (intent.payload ?? {}) as { deadline?: string; timeHorizon?: string };
			const start = intent.createdAt;
			const end = payload.deadline
				? new Date(payload.deadline)
				: addHorizon(start, payload.timeHorizon);
			return { intent, epics: intentEpics, startDate: start, endDate: end };
		})
	);

	function addHorizon(date: Date, horizon?: string): Date {
		const d = new Date(date);
		switch (horizon) {
			case 'week':
				d.setDate(d.getDate() + 7);
				break;
			case 'month':
				d.setMonth(d.getMonth() + 1);
				break;
			case 'quarter':
				d.setMonth(d.getMonth() + 3);
				break;
			case 'year':
				d.setFullYear(d.getFullYear() + 1);
				break;
			default:
				d.setMonth(d.getMonth() + 3);
				break;
		}
		return d;
	}

	// Timeline range
	let timelineStart = $derived.by(() => {
		if (rows.length === 0) return new Date();
		const earliest = rows.reduce(
			(min, r) => (r.startDate < min ? r.startDate : min),
			rows[0].startDate
		);
		const d = new Date(earliest);
		d.setDate(d.getDate() - 7);
		return d;
	});

	let timelineEnd = $derived.by(() => {
		if (rows.length === 0) {
			const d = new Date();
			d.setMonth(d.getMonth() + 6);
			return d;
		}
		const latest = rows.reduce((max, r) => (r.endDate > max ? r.endDate : max), rows[0].endDate);
		const d = new Date(latest);
		d.setDate(d.getDate() + 14);
		return d;
	});

	let totalDays = $derived.by(() => {
		const ms = timelineEnd.getTime() - timelineStart.getTime();
		return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
	});

	function dayOffset(date: Date): number {
		const ms = date.getTime() - timelineStart.getTime();
		return Math.max(0, ms / (1000 * 60 * 60 * 24));
	}

	function dayWidth(start: Date, end: Date): number {
		const ms = end.getTime() - start.getTime();
		return Math.max(20, ms / (1000 * 60 * 60 * 24));
	}

	// Generate month markers
	let months = $derived.by(() => {
		const result: Array<{ label: string; offset: number }> = [];
		const start = timelineStart;
		const end = timelineEnd;
		const d = new Date(start.getFullYear(), start.getMonth(), 1);
		while (d <= end) {
			result.push({
				label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
				offset: dayOffset(d)
			});
			d.setMonth(d.getMonth() + 1);
		}
		return result;
	});

	const STATUS_COLORS: Record<string, string> = {
		active: '#3b82f6',
		done: '#22c55e',
		draft: '#737373',
		archived: '#ef4444'
	};

	const PIX_PER_DAY = 4;

	let todayOffset = $derived(dayOffset(new Date()));

	// Drag state
	let draggingIntent = $state<string | null>(null);
	let dragStartX = 0;
	let dragOrigOffset = 0;

	function handleDragStart(intentId: string, e: PointerEvent) {
		draggingIntent = intentId;
		dragStartX = e.clientX;
		const row = rows.find((r) => r.intent.id === intentId);
		if (row) dragOrigOffset = dayOffset(row.startDate);
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleDragMove(e: PointerEvent) {
		if (!draggingIntent) return;
		// This is a placeholder—actual reschedule would update deadline
	}

	function handleDragEnd(e: PointerEvent) {
		draggingIntent = null;
	}
</script>

<div class="roadmap-container">
	{#if rows.length === 0}
		<div class="empty-state">
			<p>No intents found. Create intents from the Intents panel to see them on the roadmap.</p>
		</div>
	{:else}
		<!-- Header with month markers -->
		<div class="roadmap-header">
			<div class="label-col">Intents</div>
			<div class="timeline-header" style:width="{totalDays * PIX_PER_DAY}px">
				{#each months as month}
					<div class="month-marker" style:left="{month.offset * PIX_PER_DAY}px">
						{month.label}
					</div>
				{/each}
				<!-- Today line (in header) -->
				<div class="today-marker-header" style:left="{todayOffset * PIX_PER_DAY}px"></div>
			</div>
		</div>

		<!-- Rows -->
		<div class="roadmap-body">
			{#each rows as row (row.intent.id)}
				{@const statusColor = STATUS_COLORS[row.intent.status] ?? STATUS_COLORS.draft}
				<div class="roadmap-row">
					<div class="label-col">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="intent-label clickable" onclick={() => onOpenNode?.(row.intent.id)}>
							<span class="status-dot" style:background-color={statusColor}></span>
							<span class="intent-title">{row.intent.title}</span>
						</div>
					</div>
					<div class="timeline-row" style:width="{totalDays * PIX_PER_DAY}px">
						<!-- Today line -->
						<div class="today-line" style:left="{todayOffset * PIX_PER_DAY}px"></div>

						<!-- Intent bar -->
						<div
							class="intent-bar"
							style:left="{dayOffset(row.startDate) * PIX_PER_DAY}px"
							style:width="{dayWidth(row.startDate, row.endDate) * PIX_PER_DAY}px"
							style:background-color="{statusColor}33"
							style:border-color={statusColor}
							onpointerdown={(e) => handleDragStart(row.intent.id, e)}
							onpointermove={handleDragMove}
							onpointerup={handleDragEnd}
							ondblclick={() => onOpenNode?.(row.intent.id)}
							role="button"
							tabindex="0"
						>
							<span class="bar-label">{row.intent.title}</span>
						</div>

						<!-- Epic blocks -->
						{#each row.epics as epic}
							{@const epicStart = epic.createdAt}
							{@const epicEnd = row.endDate}
							{@const epicCfg = getNodeTypeConfig(epic.type)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="epic-bar clickable"
								style:left="{dayOffset(epicStart) * PIX_PER_DAY}px"
								style:width="{Math.max(20, dayWidth(epicStart, epicEnd) * PIX_PER_DAY * 0.5)}px"
								style:background-color={epicCfg.badge}
								title={epic.title}
								onclick={() => onOpenNode?.(epic.id)}
							>
								{epic.title}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.roadmap-container {
		width: 100%;
		height: 100%;
		overflow: auto;
		background: #0a0a0a;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #525252;
		font-size: 13px;
	}

	.roadmap-header {
		display: flex;
		border-bottom: 1px solid #262626;
		position: sticky;
		top: 0;
		z-index: 10;
		background: #0a0a0a;
	}

	.label-col {
		width: 200px;
		flex-shrink: 0;
		padding: 10px 12px;
		font-size: 11px;
		font-weight: 600;
		color: #737373;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-right: 1px solid #262626;
	}

	.timeline-header {
		position: relative;
		height: 36px;
		min-width: 100%;
	}

	.month-marker {
		position: absolute;
		top: 0;
		height: 100%;
		border-left: 1px solid #1a1a1a;
		padding: 10px 8px;
		font-size: 10px;
		color: #525252;
		white-space: nowrap;
	}

	.today-marker-header {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		background: #ef4444;
		opacity: 0.5;
	}

	.roadmap-body {
		display: flex;
		flex-direction: column;
	}

	.roadmap-row {
		display: flex;
		border-bottom: 1px solid #1a1a1a;
		min-height: 56px;
	}

	.roadmap-row .label-col {
		display: flex;
		align-items: center;
		font-weight: 400;
		font-size: 12px;
		color: #d4d4d4;
		text-transform: none;
		letter-spacing: normal;
	}

	.intent-label {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.clickable {
		cursor: pointer;
	}

	.clickable:hover {
		opacity: 0.85;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.intent-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-row {
		position: relative;
		padding: 8px 0;
		min-width: 100%;
	}

	.today-line {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		background: #ef4444;
		opacity: 0.3;
		z-index: 1;
	}

	.intent-bar {
		position: absolute;
		top: 8px;
		height: 20px;
		border: 1px solid;
		border-radius: 4px;
		display: flex;
		align-items: center;
		padding: 0 6px;
		cursor: grab;
		z-index: 2;
		overflow: hidden;
	}

	.intent-bar:active {
		cursor: grabbing;
	}

	.bar-label {
		font-size: 10px;
		color: #e5e5e5;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.epic-bar {
		position: absolute;
		top: 32px;
		height: 14px;
		border-radius: 3px;
		opacity: 0.7;
		display: flex;
		align-items: center;
		padding: 0 4px;
		font-size: 9px;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
