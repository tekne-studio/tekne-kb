// The YAML subset kb reads and writes: `key: value` and lists (block `- item` or flow
// `[a, b]`). kb owns these files, so a tiny parser is enough to read them; VitePress reads
// the same frontmatter with full YAML, which accepts everything written here, and `kb check`
// holds hand-written frontmatter to that parser. Nested blocks (a home page's `hero` and
// `features`) are VitePress's: kb skips them.
export type Value = string | string[];
export type Data = Record<string, Value>;

export function parse(text: string): { data: Data; body: string } {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!m) return { data: {}, body: text };
	const data: Data = {};
	let list: string[] | null = null;
	for (const line of m[1].split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		if (/^\s/.test(line)) {
			const item = line.match(/^\s+-\s+(.*)$/);
			if (item && list) list.push(unquote(item[1]));
			else list = null; // nested YAML: a map, or a list of maps
			continue;
		}
		const kv = line.match(/^([\w-]+):\s*(.*)$/);
		if (!kv) throw new Error(`frontmatter: cannot read line "${line}"`);
		const [, key, raw] = kv;
		if (raw === '') {
			list = data[key] = [];
		} else if (raw.startsWith('[') && raw.endsWith(']')) {
			list = null;
			data[key] = raw
				.slice(1, -1)
				.split(',')
				.map((s) => unquote(s.trim()))
				.filter(Boolean);
		} else {
			list = null;
			data[key] = unquote(raw);
		}
	}
	// the blank line `stringify` puts after the frontmatter is layout, not body
	return { data, body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}

export function stringify(data: Data, body: string): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			if (!value.length) continue;
			lines.push(`${key}:`, ...value.map((v) => `  - ${quote(v)}`));
		} else if (value !== '') {
			lines.push(`${key}: ${quote(value)}`);
		}
	}
	return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

export const list = (v: Value | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
export const str = (v: Value | undefined): string => (v === undefined ? '' : Array.isArray(v) ? v.join(', ') : v);

function unquote(s: string): string {
	const t = s.trim();
	if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(["\\])/g, '$1');
	if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
	return t;
}

// Quote whatever YAML would read as something other than the same plain string.
function quote(s: string): string {
	const plain = /^[^\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/: |\s#|:$|\s$/.test(s) && !/^(true|false|null|yes|no|~)$/i.test(s);
	return plain ? s : `"${s.replace(/(["\\])/g, '\\$1')}"`;
}
