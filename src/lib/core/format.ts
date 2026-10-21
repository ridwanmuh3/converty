export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function extensionOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function baseName(name: string): string {
	const i = name.lastIndexOf('.');
	return i <= 0 ? name : name.slice(0, i);
}

export function outputName(name: string, ext: string): string {
	return `${baseName(name) || 'file'}.${ext}`;
}

/** Avoids collisions inside a ZIP without renaming the first occurrence. */
export function uniqueName(name: string, taken: Set<string>): string {
	if (!taken.has(name)) {
		taken.add(name);
		return name;
	}
	const base = baseName(name);
	const ext = extensionOf(name);
	let i = 1;
	let candidate = `${base}-${i}${ext ? `.${ext}` : ''}`;
	while (taken.has(candidate)) {
		i += 1;
		candidate = `${base}-${i}${ext ? `.${ext}` : ''}`;
	}
	taken.add(candidate);
	return candidate;
}
