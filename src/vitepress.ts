// VitePress side: the sidebar and every list (decisions, open questions, the docs map,
// the decisions behind a page) are built while the site builds, from the same files
// the CLI reads. Nothing derived is committed, so parallel branches never conflict on it.
// Runs under Node: no Bun APIs here or in what it imports.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type Config, context, type Ctx, type Section } from './config';
import { isActive, isDue, loadDecisions } from './decisions';
import { headingsOf } from './markdown';
import { loadPages, type Page } from './pages';
import { ageInDays, idleDays, loadQuestions } from './questions';
import { testsFor } from './refs';
import { isDocRef } from './roadmap';
import { DEFAULT_IMAGES } from './screens';

export type Ref = { ref: string; label: string; url: string | null };
export type DecisionItem = {
	id: string;
	url: string;
	date: string;
	title: string;
	active: boolean;
	livesIn: Ref[];
	supersedes: string[];
	supersededBy: string;
	amends: string[];
	amendedBy: string[];
	resolves: string[];
	/** When to look at it again (`YYYY-MM-DD`), and whether that day has come. */
	revisit: string;
	due: boolean;
};
export type QuestionItem = {
	id: string;
	url: string;
	title: string;
	group: string;
	owner: string;
	unblocks: string;
	since: string;
	reviewed: string;
	/** Days since it was opened. */
	age: number;
	/** Days since the last review (or since it was opened): stale past `staleDays`. */
	idle: number;
	context: Ref[];
};
export type KbData = {
	/** Folders of decisions and questions, from the docs folder (page paths start with them). */
	decisionsBase: string;
	questionsBase: string;
	staleDays: number;
	/** Sections with a sidebar of their own (`docs.sections`); pages under one show no kb links. */
	sections: Section[];
	decisions: DecisionItem[];
	questionGroups: { key: string; title: string; items: QuestionItem[] }[];
	docGroups: { title: string; pages: { title: string; summary: string; url: string }[] }[];
	/** Topic page (path from the docs folder) → decisions, questions (by `context` or `unblocks`) and tests pointing at it. */
	byPage: Record<string, { decisions: { id: string; title: string; url: string; section: string }[]; questions: { id: string; title: string; url: string; section: string }[]; tests: { file: string; section: string }[] }>;
};

const pageUrl = (rel: string) => `/${rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;

function refOf(ctx: Ctx, ref: string, titles: Map<string, string>): Ref {
	if (ref.startsWith('/')) return { ref, label: ref.slice(1), url: null };
	const [path, anchor] = ref.split('#');
	const doc = titles.get(path) ?? path;
	const heading = anchor && headingsOf(join(ctx.path(ctx.config.docs.dir), path)).find((h) => h.anchor === anchor)?.text;
	return { ref, label: heading ? `${doc} § ${heading}` : doc, url: `${pageUrl(path)}${anchor ? `#${anchor}` : ''}` };
}

export function kbData(root: string, config: Config): KbData {
	const ctx = context(root, config);
	const docs = ctx.path(config.docs.dir);
	const pages = loadPages(ctx);
	const titles = new Map(pages.map((p) => [p.rel, p.title]));
	const decisionsBase = relative(docs, ctx.path(config.decisions.dir));
	const questionsBase = relative(docs, ctx.path(config.questions.dir));

	const decisions = loadDecisions(ctx).map((d) => ({
		id: d.id,
		url: pageUrl(`${decisionsBase}/${d.id}.md`),
		date: d.date,
		title: d.title,
		active: isActive(d),
		livesIn: d.livesIn.map((r) => refOf(ctx, r, titles)),
		supersedes: d.supersedes,
		supersededBy: d.supersededBy,
		amends: d.amends,
		amendedBy: d.amendedBy,
		resolves: d.resolves,
		revisit: d.revisit,
		due: isDue(d)
	}));
	const questions = loadQuestions(ctx).map((q) => ({
		id: q.id,
		url: pageUrl(`${questionsBase}/${q.id}.md`),
		title: q.title,
		group: q.group,
		owner: q.owner,
		unblocks: q.unblocks,
		since: q.since,
		reviewed: q.reviewed,
		age: ageInDays(q),
		idle: idleDays(q),
		context: q.context.map((r) => refOf(ctx, r, titles))
	}));

	const byPage: KbData['byPage'] = {};
	const slot = (rel: string) => (byPage[rel] ??= { decisions: [], questions: [], tests: [] });
	for (const d of decisions.filter((d) => d.active))
		for (const r of d.livesIn.filter((r) => r.url))
			slot(r.ref.split('#')[0]).decisions.push({ id: d.id, title: d.title, url: d.url, section: r.label.split(' § ')[1] ?? '' });
	// a question about a page (context), or one that blocks a part of it (unblocks: a roadmap item), once per page
	for (const q of questions)
		for (const r of [...q.context, ...(isDocRef(q.unblocks) && !q.unblocks.startsWith('/') ? [refOf(ctx, q.unblocks, titles)] : [])].filter((r) => r.url)) {
			const list = slot(r.ref.split('#')[0]).questions;
			if (!list.some((o) => o.id === q.id)) list.push({ id: q.id, title: q.title, url: q.url, section: r.label.split(' § ')[1] ?? '' });
		}
	for (const page of pages)
		for (const t of testsFor(ctx, page.rel)) slot(page.rel).tests.push({ file: t.file, section: t.anchor ? (headingsOf(page.file).find((h) => h.anchor === t.anchor)?.text ?? '') : '' });

	return {
		decisionsBase,
		questionsBase,
		staleDays: config.questions.staleDays,
		sections: config.docs.sections,
		decisions,
		questionGroups: Object.entries(config.questions.groups).map(([key, title]) => ({ key, title, items: questions.filter((q) => q.group === key) })),
		docGroups: config.docs.groups.map((title) => ({
			title,
			pages: pages
				.filter((p) => p.group === title)
				.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
				.map((p) => ({ title: p.title, summary: p.summary, url: pageUrl(p.rel) }))
		})),
		byPage
	};
}

type SidebarItem = { text: string; link?: string; items?: SidebarItem[] };

/** The groups no section claims: the root sidebar and the root docs map. */
export const rootGroups = (config: Config) => config.docs.groups.filter((g) => !config.docs.sections.some((s) => s.groups.includes(g)));

function groupItems(pages: Page[], groups: string[]): SidebarItem[] {
	return groups
		.map((group) => ({
			text: group,
			items: pages
				.filter((p) => p.group === group)
				.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
				.map((p) => ({ text: p.title, link: pageUrl(p.rel) }))
		}))
		.filter((g) => g.items.length);
}

/**
 * VitePress `themeConfig.sidebar`: the home page, then each group with its docs in `order`.
 * With sections, one sidebar per section (its home, then its groups) keyed by the section's
 * URL prefix, and the root sidebar under `/` with the groups no section claims.
 */
export function kbSidebar(root: string, config: Config) {
	const pages = loadPages(context(root, config));
	const home = (rel: string) => {
		const page = pages.find((p) => p.rel === rel);
		return page ? [{ text: page.title, link: pageUrl(rel) }] : [];
	};
	const rootSidebar = [...home('index.md'), ...groupItems(pages, rootGroups(config))];
	if (!config.docs.sections.length) return rootSidebar;
	return Object.fromEntries([
		...config.docs.sections.map((s) => [`/${s.prefix}`, [...home(`${s.prefix}index.md`), ...groupItems(pages, s.groups)]]),
		['/', rootSidebar]
	]);
}

/** Data loader body: `export default kbLoader(root, config)` in a `*.data.ts` file. */
export const kbLoader = (root: string, config: Config) => ({
	watch: [`${root}/${config.docs.dir}/**/*.md`],
	load: () => kbData(root, config)
});

/** `transformPageData`: single decisions and questions stay out of the prev/next footer. */
export const kbPageData = (config: Config) => (pageData: { relativePath: string; frontmatter: Record<string, unknown> }) => {
	const items = [config.decisions.dir, config.questions.dir].map((d) => `${relative(config.docs.dir, d)}/`);
	if (items.some((i) => pageData.relativePath.startsWith(i)) && !pageData.relativePath.endsWith('index.md')) {
		pageData.frontmatter.prev = false;
		pageData.frontmatter.next = false;
	}
};

const MISSING = '\0kb-missing-screen:';
const xml = (t: string) => t.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Vite plugin for the docs site: off CI, a manual screenshot not written yet shows as a dashed
 * frame and the page opens whole. In CI the build fails naming every missing screenshot and the
 * command that writes them, so the published site never ships without one. Screenshots under
 * `public/` only: VitePress serves that folder from the site's root.
 */
export function kbMissingScreens(root: string, config: Config, opts: { text?: string } = {}) {
	const images = (config.manual?.images ?? DEFAULT_IMAGES).replace(/\/$/, '');
	const prefix = images.startsWith('public/') ? `/${images.slice('public/'.length)}/` : null;
	const publicDir = join(root, config.docs.dir, 'public');
	const run = config.manual?.run;
	const frame =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="360" viewBox="0 0 1280 360">' +
				'<rect x="2" y="2" width="1276" height="356" rx="12" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="3" stroke-dasharray="14 10"/>' +
				`<text x="640" y="${run ? 165 : 190}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="40" fill="#3f3f46">${xml(opts.text ?? 'Screenshot not generated yet')}</text>` +
				(run ? `<text x="640" y="225" text-anchor="middle" font-family="ui-monospace, monospace" font-size="28" fill="#71717a">${xml(run)}</text>` : '') +
				'</svg>'
		);
	const missing = new Set<string>();
	return {
		name: 'kb-missing-screens',
		enforce: 'pre' as const,
		resolveId(id: string) {
			if (!prefix || !id.startsWith(prefix) || existsSync(join(publicDir, id))) return;
			missing.add(id);
			// without the extension: ending in .png, Vite would treat the virtual id as an image file
			return MISSING + id.replace(/\.\w+$/, '');
		},
		load(id: string) {
			if (id.startsWith(MISSING)) return `export default ${JSON.stringify(frame)}`;
		},
		buildEnd(this: { warn: (message: string) => void; error: (message: string) => never }, error?: Error) {
			if (!missing.size || error) return;
			const list = `${[...missing].slice(0, 3).join(', ')}${missing.size > 3 ? '…' : ''}`;
			if (process.env.CI) this.error(`${missing.size} manual screenshot(s) missing (${run ? `\`${run}\`` : 'the screenshot script'} writes them before the build): ${list}`);
			this.warn(`${missing.size} manual screenshot(s) not generated yet${run ? ` (${run})` : ''}: ${list}`);
		}
	};
}

/**
 * `srcExclude` for a build that holds only the manual (a public manual on GitHub Pages, say):
 * every top-level entry of the docs folder but the manual's folder, `public` and `.vitepress`.
 * A manual link into the technical docs then fails the build's dead-link check.
 */
export function kbManualOnly(root: string, config: Config): string[] {
	const keep = new Set([(config.manual?.dir ?? 'manual/').split('/')[0], 'public', '.vitepress']);
	return readdirSync(join(root, config.docs.dir), { withFileTypes: true })
		.filter((e) => !keep.has(e.name))
		.map((e) => (e.isDirectory() ? `${e.name}/**` : e.name))
		.sort();
}
