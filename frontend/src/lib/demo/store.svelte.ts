/**
 * Demo mode state store.
 *
 * Manages the walkthrough lifecycle: active flag, current step index,
 * and navigation methods (next, prev, exit).
 */

import { DEMO_STEPS } from './steps';

let active = $state(false);
let stepIndex = $state(0);

export function isDemoActive(): boolean {
	return active;
}

export function getDemoStep(): number {
	return stepIndex;
}

export function getTotalSteps(): number {
	return DEMO_STEPS.length;
}

export function getCurrentStep() {
	return DEMO_STEPS[stepIndex] ?? null;
}

export function startDemo(): void {
	stepIndex = 0;
	active = true;
}

export function exitDemo(): void {
	active = false;
	stepIndex = 0;
}

export function nextStep(): void {
	if (stepIndex < DEMO_STEPS.length - 1) {
		stepIndex += 1;
	} else {
		exitDemo();
	}
}

export function prevStep(): void {
	if (stepIndex > 0) {
		stepIndex -= 1;
	}
}

export function goToStep(index: number): void {
	if (index >= 0 && index < DEMO_STEPS.length) {
		stepIndex = index;
	}
}
