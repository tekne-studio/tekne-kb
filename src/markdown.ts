import { existsSync, readFileSync } from 'node:fs';
import { headingText, slugify } from './slug';

/** Markdown without fenced code, where headings and links are not real; each block keeps its line breaks, so line numbers hold. */
export const withoutCode = (text: string): string => text.replace(/^(```|~~~)[\s\S]*?^\1/gm, (m) => m.replace(/[^\n]/g, ''));

export type Heading = { level: number; text: string; anchor: string; line: number };

/** Headings with the anchors VitePress gives them, repeated titles numbered like it does. */
export function headings(text: string): Heading[] {
	const seen = new Map<string, number>();
	const out: Heading[] = [];
	withoutCode(text)
		.split('\n')
		.forEach((line, i) => {
			const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
			if (!m) return;
			const text = headingText(m[2]);
			const base = slugify(text);
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			out.push({ level: m[1].length, text, anchor: n ? `${base}-${n}` : base, line: i + 1 });
		});
	return out;
}

const cache = new Map<string, Heading[]>();
export function headingsOf(file: string): Heading[] {
	if (!cache.has(file)) cache.set(file, existsSync(file) ? headings(readFileSync(file, 'utf8')) : []);
	return cache.get(file)!;
}

export type Link = { target: string; line: number };

/** Relative links (`./x.md#a`, `../y.md`) on each line; absolute URLs are someone else's. */
export function relativeLinks(text: string): Link[] {
	const out: Link[] = [];
	const lines = text.split('\n');
	let fence = false;
	lines.forEach((line, i) => {
		if (/^(```|~~~)/.test(line)) fence = !fence;
		if (fence) return;
		for (const m of line.matchAll(/\]\((\.{1,2}\/[^)\s]+)\)/g)) out.push({ target: m[1], line: i + 1 });
	});
	return out;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// a match blanked to its line breaks, so what follows keeps its line number
const blank = (m: string) => m.replace(/[^\n]/g, '');

export type StrayTag = { tag: string; line: number };

/**
 * Tags outside code that never close (`/files/<id>` in a title) or close nothing. Markdown passes
 * `<word>` through as HTML, and VitePress compiles each page as a Vue template, which fails on them.
 * Void elements, self-closed tags (`<DecisionList />`), comments, autolinks, escaped `\<` and
 * script or style blocks are fine.
 */
export function strayTags(text: string): StrayTag[] {
	const clean = text
		.replace(/^---\r?\n[\s\S]*?\r?\n---/, blank)
		.replace(/^(```|~~~)[\s\S]*?^\1/gm, blank)
		.replace(/<!--[\s\S]*?-->/g, blank)
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, blank)
		// code spans end with the same run of backticks, inside one paragraph
		.replace(/(`+)(?!`)(?:(?!\n\s*\n)[\s\S])*?[^`]\1(?!`)/g, blank)
		.replace(/\\</g, '');
	const lineAt = (i: number) => clean.slice(0, i).split('\n').length;
	const open: StrayTag[] = [];
	const out: StrayTag[] = [];
	for (const m of clean.matchAll(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
		const [, closing, tag, self] = m;
		if (self || VOID.has(tag.toLowerCase())) continue;
		if (!closing) {
			open.push({ tag, line: lineAt(m.index) });
			continue;
		}
		const at = open.map((o) => o.tag).lastIndexOf(tag);
		if (at < 0) out.push({ tag: `/${tag}`, line: lineAt(m.index) });
		// what opened after it and is still open never closes
		else out.push(...open.splice(at).slice(1));
	}
	return [...out, ...open].sort((a, b) => a.line - b.line);
}

/** First paragraph under the title, flattened: a section summary for search results. */
export function firstLine(text: string): string {
	return (
		text
			.split('\n')
			.map((l) => l.trim())
			.find((l) => l && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('<') && !l.startsWith('>')) ?? ''
	);
}
