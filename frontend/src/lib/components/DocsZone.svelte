<script lang="ts">
	import type { Node, NodeEdge } from '$lib/storage/adapter';
	import { getProjectNodes, getAllEdges, getNode } from '$lib/stores/nodes.svelte';
	import { getNodeTypeConfig, extractBodyText } from '$lib/node-types';
	import { getFeatureProgress, getSourceNotes } from '$lib/docs-lineage';
	import { phaseProgress } from '$lib/dependency-graph';
	import { setActiveZone } from '$lib/stores/zone.svelte';
	import { navigateToParent } from '$lib/stores/planningNav.svelte';
	import DocsTraceCard from './DocsTraceCard.svelte';

	interface Props {
		projectId: string;
	}

	let { projectId }: Props = $props();

	type DocsTab = 'overview' | 'built' | 'planned' | 'decisions' | 'questions';
	let activeTab = $state<DocsTab>('overview');

	let allNodes = $derived(getProjectNodes());
	let allEdges = $derived(getAllEdges());

	// ── Derived data slices ──────────────────────────────────────

	let features = $derived(allNodes.filter((n) => n.layer === 4));
	let tickets = $derived(allNodes.filter((n) => n.type === 'ticket'));
	let phases = $derived(allNodes.filter((n) => n.type === 'phase'));
	let epics = $derived(allNodes.filter((n) => n.type === 'epic'));

	let doneTickets = $derived(
		tickets
			.filter((n) => n.status === 'done')
			.sort((a, b) => {
				const aTime = (a.payload as Record<string, string>)?.completedAt ?? '';
				const bTime = (b.payload as Record<string, string>)?.completedAt ?? '';
				return bTime.localeCompare(aTime); // most recent first
			})
	);

	let activeTickets = $derived(tickets.filter((n) => n.status === 'active'));
	let draftTickets = $derived(tickets.filter((n) => n.status === 'draft'));

	// Blocked = active/draft tickets that have unresolved blockers
	let blockedTickets = $derived.by(() => {
		const blockedIds = new Set<string>();
		for (const edge of allEdges) {
			if (edge.relationType !== 'blocks') continue;
			const blocker = allNodes.find((n) => n.id === edge.sourceId);
			if (blocker && blocker.status !== 'done') {
				blockedIds.add(edge.targetId);
			}
		}
		return tickets.filter((n) => blockedIds.has(n.id) && n.status !== 'done');
	});

	// Decisions: L5 decision nodes (not archived) + archNotes from phases
	let decisionNodes = $derived(
		allNodes.filter((n) => n.type === 'decision' && n.status !== 'archived')
	);

	let archNotesEntries = $derived.by(() => {
		const entries: Array<{ phase: Node; archNotes: string }> = [];
		for (const phase of phases) {
			const arch = (phase.payload as Record<string, string>)?.archNotes;
			if (arch && arch.trim()) {
				entries.push({ phase, archNotes: arch });
			}
		}
		return entries;
	});

	// Questions: L5 question nodes (not done) + openQuestions from epic payloads
	let questionNodes = $derived(
		allNodes.filter((n) => n.type === 'question' && n.status !== 'done')
	);

	let epicQuestions = $derived.by(() => {
		const entries: Array<{ epic: Node; questions: string[] }> = [];
		for (const epic of epics) {
			const qs = (epic.payload as Record<string, string[]>)?.openQuestions;
			if (qs && qs.length > 0) {
				entries.push({ epic, questions: qs });
			}
		}
		return entries;
	});

	// ── Helpers ──────────────────────────────────────────────────

	function timeAgo(isoDate: string): string {
		const ms = Date.now() - new Date(isoDate).getTime();
		const minutes = Math.floor(ms / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days === 1) return '1 day ago';
		return `${days} days ago`;
	}

	function progressPercent(done: number, total: number): number {
		return total === 0 ? 0 : Math.round((done / total) * 100);
	}

	function getAncestorPath(nodeId: string): string {
		const parts: string[] = [];
		let current = allNodes.find((n) => n.id === nodeId);
		while (current?.parentId) {
			current = allNodes.find((n) => n.id === current!.parentId);
			if (current) parts.unshift(current.title);
		}
		return parts.join(' > ');
	}

	function navigateTo(node: Node) {
		if (node.layer === 5) {
			setActiveZone('notes');
		} else {
			setActiveZone('planning');
			if (node.parentId) {
				navigateToParent(node.parentId, allNodes);
			}
		}
	}

	function statusDot(status: string): string {
		if (status === 'done') return '\u2713';
		if (status === 'active') return '\u25CF';
		return '\u25CB';
	}

	function statusColor(status: string): string {
		if (status === 'done') return '#22c55e';
		if (status === 'active') return '#3b82f6';
		return '#525252';
	}

	// Expanded state for built/planned tree
	let expandedIds = $state<Set<string>>(new Set());

	function toggleExpand(id: string) {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	function childrenOf(parentId: string): Node[] {
		return allNodes.filter((n) => n.parentId === parentId);
	}
</script>

<div class="docs-zone">
	<div class="docs-toolbar">
		<span class="zone-title">Docs</span>
		<span class="separator">|</span>
		<div class="tab-bar">
			{#each ['overview', 'built', 'planned', 'decisions', 'questions'] as tab}
				<button
					class="tab"
					class:active={activeTab === tab}
					onclick={() => (activeTab = tab as DocsTab)}
				>
					{tab === 'overview'
						? 'Overview'
						: tab === 'built'
							? 'Built'
							: tab === 'planned'
								? 'Planned'
								: tab === 'decisions'
									? 'Decisions'
									: 'Questions'}
				</button>
			{/each}
		</div>
	</div>

	<div class="docs-content">
		<!-- ═══ OVERVIEW TAB ═══ -->
		{#if activeTab === 'overview'}
			<div class="docs-scroll">
				<section class="section">
					<h2 class="section-title">Project Health</h2>
					{#each features as feature}
						{@const prog = getFeatureProgress(feature.id, allNodes)}
						<button class="feature-row" onclick={() => navigateTo(feature)}>
							<span class="feature-name">{feature.title}</span>
							<div class="progress-bar-container">
								<div
									class="progress-bar"
									style="width: {progressPercent(prog.done, prog.total)}%"
								></div>
							</div>
							<span class="progress-label"
								>{prog.done}/{prog.total} ({progressPercent(prog.done, prog.total)}%)</span
							>
						</button>
					{/each}
				</section>

				{#if doneTickets.length > 0}
					<section class="section">
						<h2 class="section-title">Recently Completed</h2>
						{#each doneTickets.slice(0, 8) as ticket}
							{@const completedAt = (ticket.payload as Record<string, string>)?.completedAt}
							<button class="completed-row" onclick={() => navigateTo(ticket)}>
								<span class="status-icon" style="color: #22c55e">{'\u2713'}</span>
								<span class="completed-title">{ticket.title}</span>
								{#if completedAt}
									<span class="completed-time">{timeAgo(completedAt)}</span>
								{/if}
							</button>
							<div class="completed-path">{getAncestorPath(ticket.id)}</div>
						{/each}
					</section>
				{/if}

				<section class="section">
					<h2 class="section-title">Status Summary</h2>
					<div class="summary-pills">
						<button class="pill active-pill" onclick={() => (activeTab = 'planned')}>
							Active <span class="pill-count">{activeTickets.length}</span>
						</button>
						<button class="pill draft-pill" onclick={() => (activeTab = 'planned')}>
							Draft <span class="pill-count">{draftTickets.length}</span>
						</button>
						<button class="pill blocked-pill" onclick={() => (activeTab = 'planned')}>
							Blocked <span class="pill-count">{blockedTickets.length}</span>
						</button>
					</div>
				</section>
			</div>

			<!-- ═══ BUILT TAB ═══ -->
		{:else if activeTab === 'built'}
			<div class="docs-scroll">
				{#each features as feature}
					{@const prog = getFeatureProgress(feature.id, allNodes)}
					{@const featureEpics = childrenOf(feature.id)}
					<section class="section">
						<button class="tree-row depth-0" onclick={() => toggleExpand(feature.id)}>
							<span class="chevron">{expandedIds.has(feature.id) ? '\u25BC' : '\u25B6'}</span>
							<span class="tree-title">{feature.title}</span>
							<span class="tree-progress">{prog.done}/{prog.total} done</span>
						</button>

						{#if expandedIds.has(feature.id)}
							{#each featureEpics as epic}
								{@const epicChildren = childrenOf(epic.id)}
								{@const epicConfig = getNodeTypeConfig(epic.type)}
								<button class="tree-row depth-1" onclick={() => toggleExpand(epic.id)}>
									<span class="chevron">{expandedIds.has(epic.id) ? '\u25BC' : '\u25B6'}</span>
									<span class="tree-badge" style="background: {epicConfig.badge}"
										>{epicConfig.label}</span
									>
									<span class="tree-title">{epic.title}</span>
									<span class="tree-status" style="color: {statusColor(epic.status)}"
										>{statusDot(epic.status)} {epic.status}</span
									>
								</button>

								{#if expandedIds.has(epic.id)}
									{#each epicChildren as phase}
										{@const phaseChildren = childrenOf(phase.id)}
										{@const pProg = phaseProgress(phase.id, allNodes)}
										{@const phaseConfig = getNodeTypeConfig(phase.type)}
										{@const arch = (phase.payload as Record<string, string>)?.archNotes}
										<button class="tree-row depth-2" onclick={() => toggleExpand(phase.id)}>
											<span class="chevron">{expandedIds.has(phase.id) ? '\u25BC' : '\u25B6'}</span>
											<span class="tree-badge" style="background: {phaseConfig.badge}"
												>{phaseConfig.label}</span
											>
											<span class="tree-title">{phase.title}</span>
											{#if phase.status === 'done'}
												<span class="tree-done-badge">DONE</span>
											{:else}
												<span class="tree-progress">{pProg.done}/{pProg.total}</span>
											{/if}
										</button>

										{#if expandedIds.has(phase.id)}
											{#if arch}
												<div class="arch-note depth-3">
													<span class="arch-label">Architecture:</span>
													{arch}
												</div>
											{/if}

											{#each phaseChildren.filter((t) => t.status === 'done') as ticket}
												{@const filePaths =
													(ticket.payload as Record<string, Array<{ path: string }>>)?.filePaths ??
													[]}
												<div class="ticket-row depth-3">
													<span class="status-icon" style="color: #22c55e">{'\u2713'}</span>
													<span class="ticket-title">{ticket.title}</span>
												</div>
												{#if filePaths.length > 0}
													<div class="file-paths depth-4">
														{#each filePaths as fp}
															<span class="file-path">{fp.path}</span>
														{/each}
													</div>
												{/if}
												{@const sources = getSourceNotes(ticket.id, allNodes, allEdges)}
												{#if sources.length > 0}
													<div class="source-notes depth-4">
														<span class="source-label">From:</span>
														{#each sources as src}
															<button class="source-link" onclick={() => navigateTo(src)}>
																{src.title}
															</button>
														{/each}
													</div>
												{/if}
											{/each}

											{#each phaseChildren.filter((t) => t.status !== 'done') as ticket}
												{@const tConfig = getNodeTypeConfig(ticket.type)}
												<div class="ticket-row depth-3">
													<span class="status-icon" style="color: {statusColor(ticket.status)}"
														>{statusDot(ticket.status)}</span
													>
													<span class="ticket-title muted">{ticket.title}</span>
												</div>
											{/each}
										{/if}
									{/each}
								{/if}
							{/each}
						{/if}
					</section>
				{/each}

				{#if features.length === 0}
					<div class="empty-state">No features in the plan yet.</div>
				{/if}
			</div>

			<!-- ═══ PLANNED TAB ═══ -->
		{:else if activeTab === 'planned'}
			<div class="docs-scroll">
				{#each features as feature}
					{@const featureEpics = childrenOf(feature.id).filter(
						(e) => e.status === 'active' || e.status === 'draft'
					)}
					{#if featureEpics.length > 0}
						<section class="section">
							<h2 class="section-title">{feature.title}</h2>
							{#each featureEpics as epic}
								{@const epicConfig = getNodeTypeConfig(epic.type)}
								{@const epicPhases = childrenOf(epic.id).filter((p) => p.status !== 'done')}
								<div class="planned-epic">
									<div class="planned-epic-header">
										<span class="tree-badge" style="background: {epicConfig.badge}"
											>{epicConfig.label}</span
										>
										<span class="planned-epic-title">{epic.title}</span>
										<span class="tree-status" style="color: {statusColor(epic.status)}"
											>{statusDot(epic.status)} {epic.status}</span
										>
									</div>

									{#each epicPhases as phase}
										{@const payload = phase.payload as Record<string, unknown> | null}
										{@const objective = (payload?.objective as string) ?? ''}
										{@const complexity = (payload?.complexity as string) ?? ''}
										{@const pProg = phaseProgress(phase.id, allNodes)}
										<div class="planned-phase">
											<div class="planned-phase-header">
												<span class="status-icon" style="color: {statusColor(phase.status)}"
													>{statusDot(phase.status)}</span
												>
												<span class="planned-phase-title">{phase.title}</span>
												{#if complexity}
													<span
														class="complexity-badge"
														class:high={complexity === 'high'}
														class:med={complexity === 'med'}
														class:low={complexity === 'low'}
													>
														{complexity}
													</span>
												{/if}
												<span class="tree-progress">{pProg.done}/{pProg.total}</span>
											</div>
											{#if objective}
												<div class="planned-objective">{objective}</div>
											{/if}
										</div>
									{/each}
								</div>
							{/each}
						</section>
					{/if}
				{/each}
			</div>

			<!-- ═══ DECISIONS TAB ═══ -->
		{:else if activeTab === 'decisions'}
			<div class="docs-scroll">
				{#if decisionNodes.length > 0}
					<section class="section">
						<h2 class="section-title">Decisions</h2>
						{#each decisionNodes as decision}
							{@const config = getNodeTypeConfig(decision.type)}
							{@const bodyText = extractBodyText(decision.body)}
							<div class="decision-card">
								<div class="decision-header">
									<span class="tree-badge" style="background: {config.badge}">{config.label}</span>
									<button class="decision-title" onclick={() => navigateTo(decision)}>
										{decision.title}
									</button>
									<span class="tree-status" style="color: {statusColor(decision.status)}"
										>{statusDot(decision.status)}</span
									>
								</div>
								{#if bodyText}
									<div class="decision-body">{bodyText}</div>
								{/if}
								<DocsTraceCard nodeId={decision.id} {allNodes} {allEdges} />
							</div>
						{/each}
					</section>
				{/if}

				{#if archNotesEntries.length > 0}
					<section class="section">
						<h2 class="section-title">Architecture Notes</h2>
						{#each archNotesEntries as { phase, archNotes }}
							<div class="arch-card">
								<button class="arch-card-header" onclick={() => navigateTo(phase)}>
									<span class="tree-badge" style="background: {getNodeTypeConfig(phase.type).badge}"
										>Phase</span
									>
									{phase.title}
								</button>
								<div class="arch-card-body">{archNotes}</div>
							</div>
						{/each}
					</section>
				{/if}

				{#if decisionNodes.length === 0 && archNotesEntries.length === 0}
					<div class="empty-state">No decisions or architecture notes recorded yet.</div>
				{/if}
			</div>

			<!-- ═══ QUESTIONS TAB ═══ -->
		{:else if activeTab === 'questions'}
			<div class="docs-scroll">
				{#if questionNodes.length > 0}
					<section class="section">
						<h2 class="section-title">Open Questions</h2>
						{#each questionNodes as question}
							{@const config = getNodeTypeConfig(question.type)}
							{@const bodyText = extractBodyText(question.body)}
							<div class="question-card">
								<div class="question-header">
									<span class="tree-badge" style="background: {config.badge}">{config.label}</span>
									<button class="question-title" onclick={() => navigateTo(question)}>
										{question.title}
									</button>
								</div>
								{#if bodyText}
									<div class="question-body">{bodyText}</div>
								{/if}
							</div>
						{/each}
					</section>
				{/if}

				{#if epicQuestions.length > 0}
					<section class="section">
						<h2 class="section-title">Epic Open Questions</h2>
						{#each epicQuestions as { epic, questions }}
							<div class="epic-question-group">
								<button class="epic-question-header" onclick={() => navigateTo(epic)}>
									<span class="tree-badge" style="background: {getNodeTypeConfig(epic.type).badge}"
										>Epic</span
									>
									{epic.title}
								</button>
								<ul class="question-list">
									{#each questions as q}
										<li>{q}</li>
									{/each}
								</ul>
							</div>
						{/each}
					</section>
				{/if}

				{#if questionNodes.length === 0 && epicQuestions.length === 0}
					<div class="empty-state">No open questions at the moment.</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.docs-zone {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.docs-toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-bottom: 1px solid #1a1a1a;
		background: #0a0a0a;
		flex-shrink: 0;
	}

	.zone-title {
		font-size: 12px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.separator {
		color: #2a2a2a;
		font-size: 12px;
	}

	.tab-bar {
		display: flex;
		gap: 2px;
	}

	.tab {
		font-size: 11px;
		padding: 3px 10px;
		border-radius: 4px;
		border: none;
		background: none;
		color: #525252;
		cursor: pointer;
		font-family: inherit;
	}

	.tab:hover {
		color: #a3a3a3;
		background: #1a1a1a;
	}

	.tab.active {
		color: #e5e5e5;
		background: #1f1f1f;
	}

	.docs-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.docs-scroll {
		height: 100%;
		overflow-y: auto;
		padding: 16px 20px;
	}

	/* ── Sections ── */

	.section {
		margin-bottom: 24px;
	}

	.section-title {
		font-size: 13px;
		font-weight: 600;
		color: #737373;
		margin-bottom: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* ── Overview: Feature Progress ── */

	.feature-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 6px;
		border: none;
		background: none;
		width: 100%;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.feature-row:hover {
		background: #111;
	}

	.feature-name {
		font-size: 13px;
		color: #d4d4d4;
		min-width: 200px;
		flex-shrink: 0;
	}

	.progress-bar-container {
		flex: 1;
		height: 8px;
		background: #1a1a1a;
		border-radius: 4px;
		overflow: hidden;
		min-width: 100px;
	}

	.progress-bar {
		height: 100%;
		background: #22c55e;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-label {
		font-size: 11px;
		color: #525252;
		min-width: 80px;
		text-align: right;
		white-space: nowrap;
	}

	/* ── Overview: Recently completed ── */

	.completed-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		border: none;
		background: none;
		width: 100%;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.completed-row:hover {
		background: #111;
		border-radius: 4px;
	}

	.status-icon {
		font-size: 12px;
		flex-shrink: 0;
	}

	.completed-title {
		font-size: 13px;
		color: #a3a3a3;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.completed-time {
		font-size: 11px;
		color: #404040;
		flex-shrink: 0;
	}

	.completed-path {
		font-size: 11px;
		color: #333;
		padding-left: 30px;
		margin-bottom: 4px;
	}

	/* ── Overview: Summary pills ── */

	.summary-pills {
		display: flex;
		gap: 8px;
	}

	.pill {
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid #1a1a1a;
		background: #111;
		font-size: 12px;
		color: #a3a3a3;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
	}

	.pill:hover {
		border-color: #2a2a2a;
	}

	.pill-count {
		font-weight: 600;
		color: #d4d4d4;
	}

	.active-pill .pill-count {
		color: #3b82f6;
	}

	.draft-pill .pill-count {
		color: #525252;
	}

	.blocked-pill .pill-count {
		color: #f97316;
	}

	/* ── Tree view (Built & Planned) ── */

	.tree-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		border-radius: 4px;
		border: none;
		background: none;
		width: 100%;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.tree-row:hover {
		background: #151515;
	}

	.depth-0 {
		padding-left: 4px;
	}
	.depth-1 {
		padding-left: 20px;
	}
	.depth-2 {
		padding-left: 40px;
	}
	.depth-3 {
		padding-left: 60px;
	}
	.depth-4 {
		padding-left: 76px;
	}

	.chevron {
		font-size: 10px;
		color: #404040;
		width: 14px;
		flex-shrink: 0;
	}

	.tree-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: 3px;
		color: #fff;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tree-title {
		font-size: 13px;
		color: #a3a3a3;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree-status {
		font-size: 11px;
		flex-shrink: 0;
	}

	.tree-progress {
		font-size: 11px;
		color: #404040;
		flex-shrink: 0;
	}

	.tree-done-badge {
		font-size: 9px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 3px;
		background: #052e16;
		color: #22c55e;
		flex-shrink: 0;
	}

	/* ── Built: ticket rows ── */

	.ticket-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
	}

	.ticket-title {
		font-size: 12px;
		color: #a3a3a3;
	}

	.ticket-title.muted {
		color: #404040;
	}

	.file-paths {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 2px 8px;
	}

	.file-path {
		font-size: 10px;
		color: #404040;
		background: #111;
		padding: 1px 6px;
		border-radius: 3px;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.source-notes {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		flex-wrap: wrap;
	}

	.source-label {
		font-size: 10px;
		color: #333;
	}

	.source-link {
		font-size: 10px;
		color: #6366f1;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.source-link:hover {
		text-decoration: underline;
	}

	.arch-note {
		font-size: 12px;
		color: #525252;
		padding: 4px 8px;
		line-height: 1.5;
		font-style: italic;
	}

	.arch-label {
		color: #6366f1;
		font-style: normal;
		font-weight: 500;
		margin-right: 4px;
	}

	/* ── Planned tab ── */

	.planned-epic {
		margin-bottom: 16px;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		overflow: hidden;
	}

	.planned-epic-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: #0f0f0f;
	}

	.planned-epic-title {
		font-size: 13px;
		color: #d4d4d4;
		flex: 1;
	}

	.planned-phase {
		padding: 8px 12px;
		border-top: 1px solid #1a1a1a;
	}

	.planned-phase-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.planned-phase-title {
		font-size: 12px;
		color: #a3a3a3;
		flex: 1;
	}

	.complexity-badge {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.complexity-badge.high {
		background: #2a1a1a;
		color: #ef4444;
	}

	.complexity-badge.med {
		background: #2a1f1a;
		color: #f97316;
	}

	.complexity-badge.low {
		background: #1a2a1f;
		color: #22c55e;
	}

	.planned-objective {
		font-size: 11px;
		color: #404040;
		margin-top: 4px;
		padding-left: 20px;
		line-height: 1.5;
	}

	/* ── Decisions tab ── */

	.decision-card {
		padding: 12px;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		margin-bottom: 10px;
		background: #0f0f0f;
	}

	.decision-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.decision-title {
		font-size: 13px;
		color: #d4d4d4;
		flex: 1;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		padding: 0;
		font-family: inherit;
	}

	.decision-title:hover {
		text-decoration: underline;
	}

	.decision-body {
		font-size: 12px;
		color: #525252;
		line-height: 1.5;
		margin-bottom: 8px;
	}

	/* ── Architecture notes cards ── */

	.arch-card {
		padding: 10px 12px;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		margin-bottom: 8px;
	}

	.arch-card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #a3a3a3;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		margin-bottom: 6px;
		font-family: inherit;
		text-align: left;
	}

	.arch-card-header:hover {
		color: #d4d4d4;
	}

	.arch-card-body {
		font-size: 12px;
		color: #525252;
		line-height: 1.5;
	}

	/* ── Questions tab ── */

	.question-card {
		padding: 10px 12px;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		margin-bottom: 8px;
	}

	.question-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.question-title {
		font-size: 13px;
		color: #d4d4d4;
		flex: 1;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		padding: 0;
		font-family: inherit;
	}

	.question-title:hover {
		text-decoration: underline;
	}

	.question-body {
		font-size: 12px;
		color: #525252;
		line-height: 1.5;
	}

	.epic-question-group {
		margin-bottom: 12px;
	}

	.epic-question-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #a3a3a3;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		margin-bottom: 6px;
		font-family: inherit;
		text-align: left;
	}

	.epic-question-header:hover {
		color: #d4d4d4;
	}

	.question-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.question-list li {
		font-size: 12px;
		color: #525252;
		padding: 3px 0 3px 20px;
		position: relative;
	}

	.question-list li::before {
		content: '?';
		position: absolute;
		left: 4px;
		color: #22c55e;
		font-weight: 600;
	}

	/* ── Empty state ── */

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		font-size: 13px;
		color: #404040;
	}
</style>
