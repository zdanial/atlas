/**
 * Demo action dispatching.
 *
 * Uses CustomEvent on window for loose coupling between the demo
 * walkthrough and zone components. Zone components add listeners
 * for the events they handle.
 */

export function dispatchDemoAction(action: string, detail?: Record<string, unknown>): void {
	window.dispatchEvent(new CustomEvent(action, { detail }));
}

/**
 * Register a demo event listener. Returns a cleanup function.
 */
export function onDemoAction(
	action: string,
	handler: (detail?: Record<string, unknown>) => void
): () => void {
	const listener = (e: Event) => {
		handler((e as CustomEvent).detail);
	};
	window.addEventListener(action, listener);
	return () => window.removeEventListener(action, listener);
}
