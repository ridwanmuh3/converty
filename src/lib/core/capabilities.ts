/**
 * Device capability checks for the conversion scheduler.
 *
 * These are heuristics, not guarantees: the point is to never run two heavy
 * conversions on a phone, and to use a second lane only on a machine that has
 * memory and cores to spare.
 */
export function isNarrowViewport(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(max-width: 767px)').matches;
}

/** Effective RAM hint in GB; Safari and Firefox do not expose `deviceMemory`. */
export function deviceMemoryGb(): number {
	if (typeof navigator === 'undefined') return 4;
	const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
	return typeof value === 'number' && value > 0 ? value : 4;
}

export function hardwareConcurrency(): number {
	if (typeof navigator === 'undefined') return 4;
	return Math.max(1, navigator.hardwareConcurrency || 4);
}

/**
 * 2 lanes only on a desktop-class machine (≥ 8 GB, ≥ 4 cores) that is not a
 * narrow viewport. Everything else stays serial so peak memory stays flat.
 */
export function maxConcurrency(): number {
	if (isNarrowViewport()) return 1;
	return deviceMemoryGb() >= 8 && hardwareConcurrency() >= 4 ? 2 : 1;
}

/** Weighted lanes run alone: a PDF→JPG or video job already saturates memory. */
export function concurrencyFor(memoryWeight: 1 | 2 | 3): number {
	if (memoryWeight >= 2) return 1;
	return maxConcurrency();
}
