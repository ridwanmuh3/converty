import type { DropNotice } from './route-files';

export interface PendingHandoff {
	files: File[];
	targetToolSlug?: string;
	preselectedOptions?: Record<string, string>;
	/** Files the universal entry refused, surfaced on the destination page. */
	notices?: DropNotice[];
}

let pending: PendingHandoff | null = null;
let waiting: File[] = [];

/**
 * Stores transient files in memory for handoff to a tool page.
 * Never writes to localStorage or IndexedDB.
 */
export function setPendingHandoff(handoff: PendingHandoff): void {
	pending = handoff;
}

/**
 * Retrieves and clears the pending files.
 */
export function consumePendingHandoff(): PendingHandoff | null {
	const current = pending;
	pending = null;
	return current;
}

/**
 * Inspects pending files without consuming them.
 */
export function peekPendingHandoff(): PendingHandoff | null {
	return pending;
}

/**
 * Clears pending files without consuming.
 */
export function clearPendingHandoff(): void {
	pending = null;
}

/**
 * Keeps the files of a mixed drop that need a different converter. They stay in
 * memory so the home page can offer them again once the first group is done.
 */
export function setWaitingFiles(files: File[]): void {
	waiting = files;
}

/** Returns the waiting files and clears them; the caller takes ownership. */
export function takeWaitingFiles(): File[] {
	const current = waiting;
	waiting = [];
	return current;
}

export function waitingFileCount(): number {
	return waiting.length;
}

let pendingDrop: File[] = [];

/** Files dropped somewhere other than a dropzone, waiting for the home router. */
export function setPendingDrop(files: File[]): void {
	pendingDrop = files;
}

/** Returns the pending drop and clears it; the caller takes ownership. */
export function takePendingDrop(): File[] {
	const current = pendingDrop;
	pendingDrop = [];
	return current;
}
