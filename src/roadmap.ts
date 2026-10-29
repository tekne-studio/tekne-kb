import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { CONFIG_FILE, type Ctx, type Problem, type Roadmap } from './config';
import { startOf, today } from './dates';
import { type Heading, headings, relativeLinks } from './markdown';
import { loadQuestions, type Question } from './questions';

// The roadmap is one page of the project's, read top to bottom. Now: what comes next, in
// order, each item a `###` heading with the line that says when it is done. Later: wishes,
// one line each, under theme headings. kb reads the page and never writes it: it shows what
// blocks each item (a question whose `unblocks` names it) and lists, from git, the items
// that left the page.

export type Item = {
	title: string;
	anchor: string;
	line: number;
	doneWhen: string;
	steps: { done: number; total: number };
	/** Docs the item links to, from the docs folder, without the anchor. */
	links: string[];
};
export type Theme = { title: string; anchor: string; wishes: number };
export type Part<T> = { heading: string; line: number; entries: T[] };
export type Page = { now: Part<Item> | null; later: Part<Theme> | null; text: string };

/** A reference to a doc, written from the docs folder (`roadmap.md#payment`): what `unblocks` may hold besides free text. */
export const isDocRef = (s: string): boolean => /^[^\s#]+\.md(#[\w-]+)?$/.test(s);

/** The page's path from the repo root. */
export const roadmapPath = (ctx: Ctx, r: Roadmap): string => join(ctx.config.docs.dir, r.file);

/** Links on the page are relative to it; kb keeps paths from the docs folder, as references are written. */
const fromDocs = (r: Roadmap, link: string) => normalize(join(dirname(r.file), link));

/** A `##` heading opens a part when it starts with the part's name (`Now`, `Now: the first release`). */
const opens = (h: Heading, name: string) => h.level === 2 && new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(h.text);

export function parsePage(text: string, r: Roadmap): Page {
	// frontmatter blanked to its line breaks: a `# comment` in it is no heading, and lines hold
	const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, (m) => m.replace(/[^\n]/g, ''));
	const lines = body.split('\n');
	const hs = headings(body);
	/** The lines under a heading, up to the next one at its level or above. */
	const under = (h: Heading) => {
		const next = hs.find((o) => o.line > h.line && o.level <= h.level);
		return lines.slice(h.line, (next?.line ?? lines.length + 1) - 1);
	};
	/** The line where a part ends: its next `##` (or higher), or past the last line. */
	const end = (part: Heading) => hs.find((o) => o.line > part.line && o.level <= 2)?.line ?? lines.length + 1;
	const inside = (part: Heading) => hs.filter((h) => h.line > part.line && h.line < end(part));
	const label = new RegExp(`\\*\\*${r.doneWhen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\*\\s*(.+)`);

	const nowHeading = hs.find((h) => opens(h, r.now));
	const now: Part<Item> | null = nowHeading
		? {
				heading: nowHeading.text,
				line: nowHeading.line,
				entries: inside(nowHeading)
					.filter((h) => h.level === 3)
					.map((h) => {
						const text = under(h).join('\n');
						const steps = text.match(/^\s*[-*+] \[[ xX]\]/gm) ?? [];
						return {
							title: h.text,
							anchor: h.anchor,
							line: h.line,
							doneWhen: text.match(label)?.[1].trim() ?? '',
							steps: { done: steps.filter((s) => /\[[xX]\]/.test(s)).length, total: steps.length },
							links: [...new Set(relativeLinks(text).map((l) => fromDocs(r, l.target.split('#')[0])))]
						};
					})
			}
		: null;

	const laterHeading = hs.find((h) => opens(h, r.later));
	let later: Part<Theme> | null = null;
	if (laterHeading) {
		// a wish is a list line at the margin; one with sub-items is still one wish
		const wishes = (h: Heading) => under(h).filter((l) => /^[-*+] /.test(l)).length;
		const themes = inside(laterHeading).filter((h) => h.level === 3);
		const loose = lines.slice(laterHeading.line, (themes[0]?.line ?? end(laterHeading)) - 1).filter((l) => /^[-*+] /.test(l)).length;
		later = {
			heading: laterHeading.text,
			line: laterHeading.line,
			entries: [...(loose ? [{ title: laterHeading.text, anchor: laterHeading.anchor, wishes: loose }] : []), ...themes.map((h) => ({ title: h.text, anchor: h.anchor, wishes: wishes(h) }))]
		};
	}
	return { now, later, text: body };
}

/** The project's roadmap block, or the error that says how to add one. */
export function roadmapOf(ctx: Ctx): Roadmap {
	const r = ctx.config.roadmap;
	if (!r) throw new Error(`no roadmap in ${CONFIG_FILE}: add roadmap: {} (or with file, now, later, doneWhen in the project's words); kb guide roadmap`);
	return r;
}

export function readRoadmap(ctx: Ctx, r = roadmapOf(ctx)): Page {
	const file = ctx.path(roadmapPath(ctx, r));
	if (!existsSync(file)) throw new Error(`${roadmapPath(ctx, r)} not found (roadmap.file in ${CONFIG_FILE})`);
	return parsePage(readFileSync(file, 'utf8'), r);
}

/** Open questions that block each Now item: their `unblocks` names it (`roadmap.md#payment`). */
export function blockers(ctx: Ctx, r: Roadmap, page: Page, open = loadQuestions(ctx)): Map<string, Question[]> {
	return new Map((page.now?.entries ?? []).map((i) => [i.anchor, open.filter((q) => q.unblocks === `${r.file}#${i.anchor}`)]));
}


/** The briefs, from the docs folder: every page in the briefs folder, or the one brief file when it exists. */
function briefFiles(ctx: Ctx, r: Roadmap): string[] {
	if (!r.briefs) return [];
	const at = ctx.path(join(ctx.config.docs.dir, r.briefs));
	if (r.briefs.endsWith('/'))
		return existsSync(at)
			? readdirSync(at)
					.filter((f) => f.endsWith('.md') && f !== 'index.md')
					.map((f) => join(r.briefs!, f))
			: [];
	return existsSync(at) ? [r.briefs] : [];
}

/** The page against its shape: the Now part is there, each item says when it is done, and each brief has its item. */
export function roadmapProblems(ctx: Ctx): Problem[] {
	const r = ctx.config.roadmap;
	if (!r) return [];
	const where = roadmapPath(ctx, r);
	if (!existsSync(ctx.path(where))) return [{ level: 'error', where, message: `missing (roadmap.file in ${CONFIG_FILE})` }];
	const page = readRoadmap(ctx, r);
	if (!page.now) return [{ level: 'error', where, message: `no "## ${r.now}" heading: what comes next goes under it (roadmap.now in ${CONFIG_FILE})` }];
	const out: Problem[] = page.now.entries
		.filter((i) => !i.doneWhen)
		.map((i) => ({ level: 'warn', where: `${where}:${i.line}`, message: `"${i.title}" has no **${r.doneWhen}:** line: say when it is done` }));
	const linked = new Set(page.now.entries.flatMap((i) => i.links));
	for (const brief of briefFiles(ctx, r))
		if (!linked.has(normalize(brief)))
			out.push({
				level: 'warn',
				where: join(ctx.config.docs.dir, brief),
				message: `no item under "## ${page.now.heading}" links to this brief: if its item is done or dropped, dissolve it (its shape into topic docs, its why into decisions)`
			});
	return out;
}

export type Left = { date: string; commit: string; subject: string; title: string; links: string[] };

/**
 * Items that left the Now part of the page since a day, newest first, read from git: an item
 * under Now in a commit's parent and nowhere on the page after it. One renamed in place (the
 * same position under Now, a title new to the page) stayed. Left is not done: the commit says
 * which (done, dropped, moved to another page).
 *
 * `since` and each date are local days, both from the commit date (when the commit reached the
 * history, which `git log --since` filters on): every date listed is on or after `since`.
 */
export function leftSince(ctx: Ctx, since: string, r = roadmapOf(ctx)): Left[] {
	const path = roadmapPath(ctx, r);
	const git = (...args: string[]) => spawnSync('git', args, { cwd: ctx.root, encoding: 'utf8' });
	// a moment, not a wall-clock time git would read in its own zone
	const log = git('log', '--no-merges', `--since=${startOf(since).toISOString()}`, '--format=%H%x1f%ct%x1f%s', '--', path);
	if (log.status !== 0) throw new Error(`git log failed: ${log.stderr.trim()}`);
	const out: Left[] = [];
	for (const entry of log.stdout.split('\n').filter(Boolean)) {
		const [commit, time, subject] = entry.split('\x1f');
		const date = today(new Date(Number(time) * 1000));
		const before = git('show', `${commit}^:${path}`);
		if (before.status !== 0) continue;
		const after = git('show', `${commit}:${path}`);
		const was = parsePage(before.stdout, r).now?.entries ?? [];
		const next = after.status === 0 ? parsePage(after.stdout, r) : null;
		const titles = new Set(next ? headings(next.text).map((h) => h.text) : []);
		const nowAfter = next?.now?.entries ?? [];
		const wasTitles = new Set(was.map((i) => i.title));
		was.forEach((item, i) => {
			if (titles.has(item.title)) return;
			const renamed = nowAfter[i] && !wasTitles.has(nowAfter[i].title);
			if (!renamed) out.push({ date, commit: commit.slice(0, 7), subject, title: item.title, links: item.links });
		});
	}
	return out;
}
