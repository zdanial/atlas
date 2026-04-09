<script lang="ts">
	import {
		getPlanningBreadcrumbs,
		drillUp,
		resetNav,
		type NavEntry
	} from '$lib/stores/planningNav.svelte';

	let crumbs = $derived(getPlanningBreadcrumbs());
</script>

<nav class="breadcrumb">
	<button class="crumb" class:active={crumbs.length === 0} onclick={() => resetNav()}>
		All Plans
	</button>
	{#each crumbs as crumb, i}
		<span class="separator">/</span>
		<button
			class="crumb"
			class:active={i === crumbs.length - 1}
			onclick={() => {
				if (i < crumbs.length - 1) drillUp(i + 1);
			}}
		>
			{crumb.title}
		</button>
	{/each}
</nav>

<style>
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
		overflow: hidden;
	}

	.separator {
		color: #333;
		font-size: 11px;
		flex-shrink: 0;
	}

	.crumb {
		background: none;
		border: none;
		font-size: 11px;
		color: #525252;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 3px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 180px;
	}

	.crumb:hover {
		color: #a3a3a3;
		background: #1a1a1a;
	}

	.crumb.active {
		color: #d4d4d4;
		cursor: default;
	}

	.crumb.active:hover {
		background: none;
	}
</style>
