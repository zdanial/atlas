<script lang="ts">
	import type { Zone } from '$lib/stores/zone.svelte';

	interface Props {
		activeZone: Zone;
		projects: Array<{ id: string; name: string; color?: string | null }>;
		currentProjectId: string;
		onZoneChange: (zone: Zone) => void;
		onSwitchProject: (id: string) => void;
		onCreateProject: () => void;
		onDeleteProject?: (id: string) => void;
		onOpenSettings: () => void;
	}

	let {
		activeZone,
		projects,
		currentProjectId,
		onZoneChange,
		onSwitchProject,
		onCreateProject,
		onDeleteProject,
		onOpenSettings
	}: Props = $props();

	const zones: Array<{ id: Zone; label: string; icon: string; shortcut: string }> = [
		{ id: 'notes', label: 'Notes', icon: '✎', shortcut: '⌘1' },
		{ id: 'planning', label: 'Planning', icon: '◫', shortcut: '⌘2' },
		{ id: 'docs', label: 'Docs', icon: '⊞', shortcut: '⌘3' }
	];

	let showProjectMenu = $state(false);
	let currentProject = $derived(projects.find((p) => p.id === currentProjectId));
</script>

<aside class="zone-sidebar">
	<!-- Project selector -->
	<div class="sidebar-section">
		<button
			class="project-button"
			onclick={() => (showProjectMenu = !showProjectMenu)}
			title="Switch project"
		>
			<span class="project-dot" style="background: {currentProject?.color ?? '#525252'}"></span>
			<span class="project-initial">
				{currentProject?.name?.charAt(0) ?? 'P'}
			</span>
		</button>

		{#if showProjectMenu}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="project-dropdown" onclick={(e) => e.stopPropagation()}>
				{#each projects as project}
					<div class="project-option-row" class:active={project.id === currentProjectId}>
						<button
							class="project-option"
							class:active={project.id === currentProjectId}
							onclick={() => {
								onSwitchProject(project.id);
								showProjectMenu = false;
							}}
						>
							<span class="project-dot-sm" style="background: {project.color ?? '#525252'}"></span>
							{project.name}
						</button>
						{#if onDeleteProject && projects.length > 1}
							<button
								class="project-delete"
								title="Delete project"
								onclick={(e) => {
									e.stopPropagation();
									if (
										confirm(`Delete "${project.name}" and all its nodes? This cannot be undone.`)
									) {
										onDeleteProject(project.id);
										showProjectMenu = false;
									}
								}}
							>
								×
							</button>
						{/if}
					</div>
				{/each}
				<button
					class="project-option new"
					onclick={() => {
						onCreateProject();
						showProjectMenu = false;
					}}
				>
					+ New project
				</button>
			</div>
		{/if}
	</div>

	<!-- Zone buttons -->
	<nav class="zone-nav">
		{#each zones as zone}
			<button
				class="zone-button"
				class:active={activeZone === zone.id}
				onclick={() => onZoneChange(zone.id)}
				title="{zone.label} ({zone.shortcut})"
			>
				<span class="zone-icon">{zone.icon}</span>
				<span class="zone-label">{zone.label}</span>
			</button>
		{/each}
	</nav>

	<!-- Settings at bottom -->
	<div class="sidebar-bottom">
		<button class="zone-button" onclick={onOpenSettings} title="Settings">
			<span class="zone-icon">⚙</span>
		</button>
	</div>
</aside>

{#if showProjectMenu}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (showProjectMenu = false)}></div>
{/if}

<style>
	.zone-sidebar {
		width: 52px;
		height: 100%;
		background: #0a0a0a;
		border-right: 1px solid #1a1a1a;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 0;
		flex-shrink: 0;
		z-index: 50;
	}

	.sidebar-section {
		position: relative;
		padding: 4px 0 8px;
		border-bottom: 1px solid #1a1a1a;
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.project-button {
		width: 34px;
		height: 34px;
		border-radius: 8px;
		border: 1px solid #2a2a2a;
		background: #141414;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
	}

	.project-button:hover {
		border-color: #3a3a3a;
	}

	.project-dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.project-initial {
		font-size: 13px;
		font-weight: 600;
		color: #a3a3a3;
	}

	.project-dropdown {
		position: absolute;
		left: 56px;
		top: 4px;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		padding: 4px;
		min-width: 180px;
		z-index: 100;
	}

	.project-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		font-size: 12px;
		color: #a3a3a3;
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
	}

	.project-option:hover {
		background: #1f1f1f;
	}

	.project-option.active {
		background: #1f1f1f;
		color: #e5e5e5;
	}

	.project-option.new {
		color: #525252;
		border-top: 1px solid #1a1a1a;
		margin-top: 2px;
		padding-top: 8px;
	}

	.project-option-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.project-option-row .project-option {
		flex: 1;
	}

	.project-delete {
		opacity: 0;
		background: none;
		border: none;
		color: #525252;
		font-size: 14px;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 3px;
		line-height: 1;
	}

	.project-option-row:hover .project-delete {
		opacity: 1;
	}

	.project-delete:hover {
		background: #2a1212;
		color: #f87171;
	}

	.project-dot-sm {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.zone-nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding-top: 8px;
	}

	.zone-button {
		width: 44px;
		height: 40px;
		border-radius: 6px;
		border: none;
		background: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		cursor: pointer;
		color: #525252;
		transition: all 0.15s;
	}

	.zone-button:hover {
		background: #1a1a1a;
		color: #a3a3a3;
	}

	.zone-button.active {
		background: #1f1f1f;
		color: #e5e5e5;
	}

	.zone-icon {
		font-size: 16px;
		line-height: 1;
	}

	.zone-label {
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 500;
	}

	.sidebar-bottom {
		padding: 8px 0;
		border-top: 1px solid #1a1a1a;
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
	}
</style>
