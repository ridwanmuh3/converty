/**
 * A tiny in-memory channel for files dropped anywhere on the page.
 *
 * The global drag overlay lives in the layout, but only the page knows what to
 * do with files (add to its queue, or run the universal router). Each page
 * registers one handler while it is mounted; the overlay asks whether anyone
 * accepted the drop before falling back to routing.
 */
export type IntakeHandler = (files: File[]) => void | Promise<void>;

const handlers = new Set<IntakeHandler>();

/** Registers the current page's handler and returns an unregister function. */
export function registerIntake(handler: IntakeHandler): () => void {
	handlers.add(handler);
	return () => {
		handlers.delete(handler);
	};
}

/** Delivers files to the mounted page. Returns false when no page accepted them. */
export function deliverFiles(files: File[]): boolean {
	if (handlers.size === 0) return false;
	for (const handler of handlers) void handler(files);
	return true;
}
