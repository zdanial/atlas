<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import {
		isDemoActive,
		getDemoStep,
		getTotalSteps,
		getCurrentStep,
		nextStep,
		prevStep,
		exitDemo
	} from '$lib/demo/store.svelte';
	import { dispatchDemoAction } from '$lib/demo/actions';
	import { setActiveZone } from '$lib/stores/zone.svelte';

	let active = $derived(isDemoActive());
	let step = $derived(getCurrentStep());
	let stepIndex = $derived(getDemoStep());
	let total = $derived(getTotalSteps());

	// Track the currently highlighted element so we can remove the class on step change
	let highlightedEl: Element | null = null;

	function clearHighlight() {
		if (highlightedEl) {
			highlightedEl.classList.remove('demo-highlight');
			highlightedEl = null;
		}
	}

	function applyHighlight() {
		clearHighlight();
		if (!step?.target) return;
		const el = document.querySelector(step.target);
		if (!el) return;
		el.classList.add('demo-highlight');
		highlightedEl = el;
		// Scroll into view if needed
		el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	async function onStepChange(_idx: number) {
		if (!active || !step) return;

		// Switch zone if needed
		if (step.zone) {
			setActiveZone(step.zone);
		}

		// Allow DOM to update after zone switch
		await tick();

		// Dispatch action if defined
		if (step.action) {
			dispatchDemoAction(step.action, step.actionDetail);
		}

		// Wait for DOM to settle, then highlight
		await tick();
		setTimeout(applyHighlight, 120);
	}

	// React to step changes
	$effect(() => {
		onStepChange(stepIndex);
	});

	// Clean up highlight when demo exits
	$effect(() => {
		if (!active) {
			clearHighlight();
		}
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (!active) return;
		if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			nextStep();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			e.stopPropagation();
			prevStep();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			exitDemo();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if active && step}
	<!-- Fixed tooltip pinned to bottom-right — never moves -->
	<div class="demo-tooltip">
		<div class="demo-step-counter">
			{stepIndex + 1} / {total}
		</div>
		<h3 class="demo-title">{step.title}</h3>
		<p class="demo-description">{step.description}</p>

		<div class="demo-nav">
			<div class="demo-nav-buttons">
				{#if stepIndex > 0}
					<button class="demo-btn demo-btn-prev" onclick={prevStep}>Previous</button>
				{/if}
				{#if stepIndex < total - 1}
					<button class="demo-btn demo-btn-next" onclick={nextStep}>Next</button>
				{:else}
					<button class="demo-btn demo-btn-next" onclick={exitDemo}>Finish</button>
				{/if}
			</div>
			<button class="demo-btn demo-btn-exit" onclick={exitDemo}>Exit</button>
		</div>

		<!-- Progress bar -->
		<div class="demo-progress-bar">
			<div class="demo-progress-fill" style="width: {((stepIndex + 1) / total) * 100}%"></div>
		</div>
	</div>
{/if}

<style>
	/* Tooltip pinned to bottom-right corner */
	.demo-tooltip {
		position: fixed;
		bottom: 20px;
		right: 20px;
		width: 360px;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		padding: 18px 20px 14px;
		z-index: 9001;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		pointer-events: auto;
	}

	.demo-step-counter {
		font-size: 11px;
		color: #6366f1;
		font-weight: 600;
		letter-spacing: 0.5px;
		margin-bottom: 6px;
	}

	.demo-title {
		font-size: 15px;
		font-weight: 700;
		color: #e5e5e5;
		margin: 0 0 6px 0;
		line-height: 1.3;
	}

	.demo-description {
		font-size: 12.5px;
		color: #a3a3a3;
		line-height: 1.55;
		margin: 0 0 14px 0;
	}

	.demo-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.demo-nav-buttons {
		display: flex;
		gap: 8px;
	}

	.demo-btn {
		border: none;
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.demo-btn-prev {
		background: #2a2a2a;
		color: #a3a3a3;
	}

	.demo-btn-prev:hover {
		background: #333;
		color: #d4d4d4;
	}

	.demo-btn-next {
		background: #6366f1;
		color: white;
	}

	.demo-btn-next:hover {
		background: #7c7ff7;
	}

	.demo-btn-exit {
		background: none;
		color: #525252;
		padding: 6px 8px;
	}

	.demo-btn-exit:hover {
		color: #a3a3a3;
	}

	/* Progress bar instead of dots — cleaner at 19 steps */
	.demo-progress-bar {
		height: 3px;
		background: #1f1f1f;
		border-radius: 2px;
		overflow: hidden;
	}

	.demo-progress-fill {
		height: 100%;
		background: #6366f1;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	/*
	 * Global highlight class applied to target elements.
	 * This is injected via JS (classList.add) so it must be :global.
	 */
	:global(.demo-highlight) {
		outline: 2px solid #6366f1 !important;
		outline-offset: 4px;
		border-radius: 6px;
		animation: demo-pulse 1.5s ease-in-out infinite;
		position: relative;
		z-index: 10;
	}

	@keyframes demo-pulse {
		0%,
		100% {
			outline-color: #6366f1;
			box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
		}
		50% {
			outline-color: #818cf8;
			box-shadow: 0 0 12px 2px rgba(99, 102, 241, 0.25);
		}
	}
</style>
