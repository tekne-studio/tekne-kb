// Dates in frontmatter are calendar days, YYYY-MM-DD, read in the local time zone.

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function today(now = new Date()): string {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The moment `date` starts in the local time zone. */
export const startOf = (date: string): Date => {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(y, m - 1, d);
};

/** The day `days` calendar days after `date` (before it when negative), so a daylight-saving change never shifts it. */
export const addDays = (date: string, days: number): string => {
	const [y, m, d] = date.split('-').map(Number);
	return today(new Date(y, m - 1, d + days));
};

/** Calendar days from `date` to today (negative before it), so a daylight-saving change never shifts the count. */
export const daysSince = (date: string, now = new Date()): number =>
	date ? Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) : 0;
