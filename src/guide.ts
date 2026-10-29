import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guides hold what an agent reads only when it needs it (how to build a manual, say), so the
// AGENTS.md every session reads stays short. A chapter is a `## ` section; one that fits only
// some projects says which in a `<!-- when: key=value[,value] key=value -->` line under its
// heading, matched against the project's choices in kb.config.ts (`manual: { publish: 'pages' }`).
export const GUIDES = fileURLToPath(new URL('../guides/', import.meta.url));

type Chapter = { heading: string; text: string; when: Record<string, string[]> | null };

const WHEN = /^<!-- when:\s*(.*?)\s*-->\s*$/;

/** The guides kb ships, each with the first sentence of its opening. */
export function topics(dir = GUIDES): { topic: string; summary: string }[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort()
		.map((f) => ({ topic: f.replace(/\.md$/, ''), summary: firstSentence(split(readFileSync(join(dir, f), 'utf8')).intro) }));
}

export function readGuide(topic: string, dir = GUIDES): string {
	const file = join(dir, `${topic}.md`);
	if (!/^[a-z0-9-]+$/.test(topic) || !existsSync(file)) throw new Error(`no guide "${topic}" (kb guide lists them)`);
	return readFileSync(file, 'utf8');
}

/**
 * The guide for these choices: the opening, the chapters for every project and the ones whose
 * `when` matches, then the headings left out. Without choices, or with `all`, the whole guide.
 */
export function render(text: string, topic: string, choices?: Record<string, unknown>, all = false): string {
	const { intro, chapters } = split(text);
	const shown = all || !choices ? chapters : chapters.filter((c) => matches(c.when, choices));
	const left = chapters.filter((c) => !shown.includes(c));
	const parts = [intro, ...shown.map((c) => c.text)].map((p) => p.trim()).filter(Boolean);
	if (left.length) parts.push(`other paths (kb guide ${topic} --all): ${left.map((c) => c.heading).join(', ')}`);
	return `${parts.join('\n\n')}\n`;
}

/**
 * Every key must match; a key the project has not chosen yet matches, since every path is still
 * open. A choice of several values (two ways into a manual) matches when one of them is listed.
 */
function matches(when: Chapter['when'], choices: Record<string, unknown>): boolean {
	if (!when) return true;
	return Object.entries(when).every(([key, values]) => choices[key] === undefined || [choices[key]].flat().some((v) => values.includes(asValue(v))));
}

// a boolean choice matches `true` or `yes` (`false` or `no`)
const asValue = (v: unknown): string => (v === true ? 'true' : v === false ? 'false' : String(v));

function split(text: string): { intro: string; chapters: Chapter[] } {
	// a `## ` line inside a fenced code block is an example, not a chapter
	const blocks: string[][] = [[]];
	let fence = '';
	for (const line of text.split('\n')) {
		const mark = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
		if (mark && (!fence || mark.startsWith(fence))) fence = fence ? '' : mark;
		if (!fence && !mark && line.startsWith('## ')) blocks.push([]);
		blocks[blocks.length - 1].push(line);
	}
	const [intro, ...rest] = blocks;
	const chapters = rest.map(([first, second = '', ...body]): Chapter => {
		const when = second.match(WHEN);
		return {
			heading: first.replace(/^## /, '').trim(),
			text: (when ? [first, ...body] : [first, second, ...body]).join('\n'),
			when: when ? parseWhen(when[1]) : null
		};
	});
	return { intro: intro.join('\n'), chapters };
}

function parseWhen(spec: string): Record<string, string[]> {
	const when: Record<string, string[]> = {};
	for (const pair of spec.split(/\s+/).filter(Boolean)) {
		const [key, values = ''] = pair.split('=');
		when[key] = values.split(',').map((v) => (v === 'yes' ? 'true' : v === 'no' ? 'false' : v));
	}
	return when;
}

function firstSentence(intro: string): string {
	const para = intro.replace(/^# .*$/m, '').trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ') ?? '';
	return para.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? para;
}
