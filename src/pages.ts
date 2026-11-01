import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Ctx } from './config';
import { docFiles } from './files';
import { list, parse, str } from './frontmatter';
import { type Heading, headings } from './markdown';

// Topic docs: every markdown file under `docs.dir` except the `skip` folders and the
// single decisions and questions (their folders count only by the index page). Each
// says in frontmatter how it shows up in the sidebar and the map.
export type Page = {
	/** Path from the docs folder, as VitePress and relative links see it. */
	rel: string;
	file: string;
	title: string;
	group: string;
	summary: string;
	order: number;
	lines: number;
	headings: Heading[];
	text: string;
	tags: string[];
};

export function pageFiles(ctx: Ctx): string[] {
	const docs = ctx.path(ctx.config.docs.dir);
	const skip = (ctx.config.docs.skip ?? []).map((s) => `${s.replace(/\/$/, '')}/`);
	const items = [ctx.config.decisions.dir, ctx.config.questions.dir].map((d) => `${relative(docs, ctx.path(d)).replace(/\\/g, '/')}/`);
	return docFiles(ctx)
		.filter((rel) => !skip.some((s) => rel.startsWith(s)))
		.filter((rel) => !items.some((d) => rel.startsWith(d) && rel !== `${d}index.md`))
		.sort();
}

export function loadPages(ctx: Ctx): Page[] {
	const docs = ctx.path(ctx.config.docs.dir);
	return pageFiles(ctx).map((rel) => {
		const file = join(docs, rel);
		const raw = readFileSync(file, 'utf8');
		const { data, body } = parse(raw);
		return {
			rel,
			file,
			title: str(data.title),
			group: str(data.group),
			summary: str(data.summary),
			order: Number(str(data.order)) || 99,
			lines: raw.split('\n').length,
			headings: headings(body),
			text: body,
			tags: list(data.tags)
		};
	});
}

/** Sections of a page (by its `##` and `###` headings), for search and backlinks. */
export function sections(page: Page): { anchor: string; heading: string; text: string }[] {
	const lines = page.text.split('\n');
	const marks = page.headings.filter((h) => h.level >= 2 && h.level <= 3);
	return marks.map((h, i) => ({
		anchor: h.anchor,
		heading: h.text,
		text: lines.slice(h.line, (marks[i + 1]?.line ?? lines.length + 1) - 1).join('\n')
	}));
}
