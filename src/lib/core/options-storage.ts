/**
 * Per-tool option persistence in localStorage.
 * Only option keys and string values are persisted; file data is NEVER stored.
 */

const STORAGE_PREFIX = 'converty:opt:';

export function loadStoredOptions(
	toolSlug: string,
	defaults: Record<string, string>
): Record<string, string> {
	if (typeof window === 'undefined') return { ...defaults };
	try {
		const raw = localStorage.getItem(`${STORAGE_PREFIX}${toolSlug}`);
		if (!raw) return { ...defaults };
		const parsed = JSON.parse(raw);
		if (typeof parsed === 'object' && parsed !== null) {
			return { ...defaults, ...parsed };
		}
	} catch {
		// Ignore storage errors (private browsing quota / disabled storage)
	}
	return { ...defaults };
}

export function saveStoredOptions(toolSlug: string, options: Record<string, string>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${toolSlug}`, JSON.stringify(options));
	} catch {
		// Ignore storage errors
	}
}

export function resetStoredOptions(toolSlug: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${toolSlug}`);
	} catch {
		// Ignore storage errors
	}
}

export function isOptionsCustomized(
	current: Record<string, string>,
	defaults: Record<string, string>
): boolean {
	const keys = Object.keys(defaults);
	for (const key of keys) {
		if (current[key] !== defaults[key]) return true;
	}
	return false;
}
