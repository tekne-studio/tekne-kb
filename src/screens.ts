import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CONFIG_FILE, type Ctx, type ManualList, type Problem } from './config';

// The manual's pieces kb reads from the list in kb.config.ts (`manual.list`): each page's
// "Screens" block, and the check that pages, list and the product's screens agree, so a new
// screen without a page fails instead of passing in silence (guides/manual.md § The method).

export const DEFAULT_IMAGES = 'public/screens';

/** Where a problem of the list points: its file at the line naming the page or screen (quoted, or a key), else the config. */
function listAt(ctx: Ctx, list: ManualList): (name?: string) => string {
	if (!list.file) return () => `manual.list (${CONFIG_FILE})`;
	const file = list.file;
	const lines = existsSync(ctx.path(file)) ? readFileSync(ctx.path(file), 'utf8').split('\n') : [];
	return (name) => {
		if (!name) return file;
		const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`(['"\`])${n}\\1|^\\s*${n}\\s*:`);
		const at = lines.findIndex((l) => re.test(l));
		return at < 0 ? file : `${file}:${at + 1}`;
	};
}

const err = (where: string, message: string): Problem => ({ level: 'error', where, message });

/** The manual's folder, from the repo root, without a trailing slash. */
export const manualDir = (ctx: Ctx) => join(ctx.config.docs.dir, ctx.config.manual?.dir ?? 'manual/').replace(/\/$/, '');

/** The page files of the manual, by name, home left out. */
function pageFiles(ctx: Ctx): string[] {
	const dir = ctx.path(manualDir(ctx));
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md') && f !== 'index.md' && !f.startsWith('.'))
		.map((f) => f.replace(/\.md$/, ''));
}

/** Where a page's screenshot is: from the site's root under VitePress's `public/`, else relative to the page. */
export function shotUrl(ctx: Ctx, page: string, id: string): string {
	const images = (ctx.config.manual?.images ?? DEFAULT_IMAGES).replace(/\/$/, '');
	if (ctx.config.manual?.vitepress && images.startsWith('public/')) return `/${images.slice('public/'.length)}/${page}/${id}.png`;
	const to = relative(ctx.path(manualDir(ctx)), ctx.path(join(ctx.config.docs.dir, images, page, `${id}.png`))).split('\\').join('/');
	return to.startsWith('.') ? to : `./${to}`;
}

/** The screenshot file a page's shot is written to, from the repo root. */
const shotFile = (ctx: Ctx, page: string, id: string) => join(ctx.config.docs.dir, ctx.config.manual?.images ?? DEFAULT_IMAGES, page, `${id}.png`);

/** Each page's "Screens" block: the image, then its caption in italics. */
export async function screensBlocks(ctx: Ctx): Promise<{ file: string; name: string; make: () => string }[]> {
	const list = await ctx.config.manual?.list?.();
	if (!list) return [];
	const alt = (s: string) => s.replace(/[[\]]/g, '\\$&');
	return Object.entries(list.pages)
		.filter(([page, p]) => existsSync(ctx.path(join(manualDir(ctx), `${page}.md`))) && p.shots.length)
		.map(([page, p]) => ({
			file: join(manualDir(ctx), `${page}.md`),
			name: 'screens',
			make: () => p.shots.map((s) => `![${alt(s.caption)}](${shotUrl(ctx, page, s.id)})\n\n*${s.caption}*`).join('\n\n')
		}));
}

/** Pages against the list, the list against the product's screens, and each page's script and screenshots. */
export async function manualProblems(ctx: Ctx): Promise<Problem[]> {
	const manual = ctx.config.manual;
	const list = await manual?.list?.();
	if (!manual || !list) return [];
	const out: Problem[] = [];
	const at = listAt(ctx, list);
	if (list.file && !existsSync(ctx.path(list.file))) out.push(err(`manual.list (${CONFIG_FILE})`, `file ${list.file} does not exist`));
	const files = pageFiles(ctx);
	const pageFile = (page: string) => join(manualDir(ctx), `${page}.md`);
	for (const page of files) if (!list.pages[page]) out.push(err(pageFile(page), `no entry in the manual's list, ${at()}`));
	for (const page of Object.keys(list.pages)) if (!files.includes(page)) out.push(err(at(page), `page "${page}" has no file ${pageFile(page)}`));

	const claimed = new Map<string, string>();
	for (const [page, p] of Object.entries(list.pages)) for (const s of p.screens) claimed.set(s, page);
	if (manual.screens) {
		const product = new Set(await manual.screens(ctx.root));
		for (const s of product) if (!claimed.has(s) && !list.debt.includes(s)) out.push(err(at(), `screen \`${s}\` has no page in the manual: claim it in a page's screens, or put it on the debt list`));
		for (const [s, page] of claimed) if (!product.has(s)) out.push(err(at(s), `screen \`${s}\`, claimed by "${page}", is not in the product`));
		for (const s of list.debt) if (!product.has(s)) out.push(err(at(s), `screen \`${s}\` on the debt list is not in the product`));
	}
	for (const s of list.debt) if (claimed.has(s)) out.push(err(at(s), `screen \`${s}\` on the debt list has a page ("${claimed.get(s)}"): take it off the debt list`));

	for (const page of files.filter((p) => list.pages[p])) {
		const script = manual.scripts?.replaceAll('{page}', page);
		if (script && !existsSync(ctx.path(script))) out.push(err(pageFile(page), `no script ${script}`));
		if (manual.shots !== 'committed') continue;
		for (const s of list.pages[page].shots) {
			const file = shotFile(ctx, page, s.id);
			if (!existsSync(ctx.path(file))) out.push(err(pageFile(page), `screenshot ${file} is missing (${manual.run ?? 'the screenshot script'} writes it)`));
		}
	}
	return out;
}
