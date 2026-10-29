// Heading anchors exactly as VitePress builds them (@mdit-vue/shared slugify), so a
// link that passes `kb check` also works on the rendered site.
const COMBINING = /[̀-ͯ]/g;
const CONTROL = /[\u0000-\u001f]/g;
const SPECIAL = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;

export function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(COMBINING, '')
		.replace(CONTROL, '')
		.replace(SPECIAL, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/^(\d)/, '_$1')
		.toLowerCase();
}

/** Heading text as rendered: links become their label, code and emphasis marks go. */
export function headingText(raw: string): string {
	return raw
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[`*]/g, '')
		.trim();
}

/** Short, readable id fragment for file names: ASCII, hyphenated, cut on a word boundary. */
export function fileSlug(text: string, max = 60): string {
	const s = text
		.normalize('NFKD')
		.replace(COMBINING, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (s.length <= max) return s;
	const cut = s.slice(0, max + 1);
	return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : max).replace(/-+$/, '');
}
