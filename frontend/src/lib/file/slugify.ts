// ---------------------------------------------------------------------------
// Slugify — convert titles to filesystem-safe kebab-case slugs
// ---------------------------------------------------------------------------

/**
 * Convert a title string to a kebab-case slug suitable for filenames.
 */
export function slugify(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^\w\s-]/g, '') // remove non-word chars except spaces and hyphens
			.replace(/\s+/g, '-') // spaces to hyphens
			.replace(/-+/g, '-') // collapse multiple hyphens
			.replace(/^-|-$/g, '') // trim leading/trailing hyphens
			.slice(0, 80) || // limit length
		'untitled'
	);
}

/**
 * Generate a unique slug by appending a suffix if needed.
 */
export function uniqueSlug(title: string, existingSlugs: Set<string>): string {
	const base = slugify(title);
	if (!existingSlugs.has(base)) return base;

	let i = 2;
	while (existingSlugs.has(`${base}-${i}`)) i++;
	return `${base}-${i}`;
}
