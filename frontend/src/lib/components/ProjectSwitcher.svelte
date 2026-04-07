<script lang="ts">
	let {
		projects,
		currentProjectId,
		onSwitch,
		onCreate
	}: {
		projects: Array<{ id: string; name: string; color?: string | null }>;
		currentProjectId: string;
		onSwitch: (id: string) => void;
		onCreate: () => void;
	} = $props();

	let open = $state(false);

	let currentProject = $derived(projects.find((p) => p.id === currentProjectId));

	function handleSwitch(id: string) {
		onSwitch(id);
		open = false;
	}

	function handleClickOutside(e: MouseEvent) {
		if (!(e.target as HTMLElement).closest('.project-switcher')) {
			open = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="project-switcher relative">
	<button
		class="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
		onclick={(e: MouseEvent) => {
			e.stopPropagation();
			open = !open;
		}}
	>
		{#if currentProject?.color}
			<span
				class="inline-block h-2 w-2 rounded-full"
				style="background-color: {currentProject.color}"
			></span>
		{/if}
		<span>{currentProject?.name ?? 'Project'}</span>
		<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border border-neutral-800 bg-neutral-900 py-1 shadow-xl"
			role="menu"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			{#each projects as project (project.id)}
				<button
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors
						{project.id === currentProjectId
						? 'bg-neutral-800 text-neutral-200'
						: 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300'}"
					onclick={() => handleSwitch(project.id)}
				>
					<span
						class="inline-block h-2 w-2 shrink-0 rounded-full"
						style="background-color: {project.color ?? '#737373'}"
					></span>
					<span class="truncate">{project.name}</span>
				</button>
			{/each}

			<div class="my-1 border-t border-neutral-800"></div>

			<button
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-800/50 hover:text-neutral-300"
				onclick={() => {
					onCreate();
					open = false;
				}}
			>
				<span class="text-sm">+</span>
				<span>New Project</span>
			</button>
		</div>
	{/if}
</div>
