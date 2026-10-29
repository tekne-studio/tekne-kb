import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { safeLoad, type YAMLException } from 'js-yaml';
import { agentsProblems } from './agents';
import { type Ctx, LABELS, type Plugins, type Problem } from './config';
import { DATE, daysSince } from './dates';
import { ID, isDue, labeledLines, loadDecisions, NO_ALTERNATIVE } from './decisions';
import { docFiles } from './files';
import { headingsOf, relativeLinks, strayTags } from './markdown';
import { loadPages } from './pages';
import { ageInDays, idleDays, loadQuestions } from './questions';
import { docRefsInCode } from './refs';
import { manualProblems, screensBlocks } from './screens';
import { isDocRef, roadmapProblems } from './roadmap';

// `kb check` (CI) and `kb gen`: docs that drift from the code or from each other fail
// here instead of misleading the next reader. Errors fail; warnings only report.
export async function check(ctx: Ctx, mode: 'check' | 'gen' = 'check'): Promise<Problem[]> {
	const plugins: Plugins = (await ctx.config.plugins?.()) ?? {};
	const blocks = [...(plugins.generated ?? []), ...(await screensBlocks(ctx))];
	const problems: Problem[] = [
		...generated(ctx, blocks, mode),
		...agentsProblems(ctx, mode),
		...links(ctx),
		...frontmatter(ctx),
		...tags(ctx),
		...pages(ctx),
		...decisions(ctx),
		...questions(ctx),
		...codeRefs(ctx),
		...(await manualProblems(ctx)),
		...roadmapProblems(ctx)
	];
	for (const run of plugins.checks ?? []) problems.push(...(await run(ctx.root)));
	return problems;
}

const err = (where: string, message: string): Problem => ({ level: 'error', where, message });
const warn = (where: string, message: string): Problem => ({ level: 'warn', where, message });

/** A `lives_in` / `context` reference: from the docs folder, or the repo root with a leading `/`. */
export function refProblem(ctx: Ctx, ref: string): string | null {
	const [path, anchor] = ref.split('#');
	const file = path.startsWith('/') ? ctx.path(path.slice(1)) : join(ctx.path(ctx.config.docs.dir), path);
	if (!existsSync(file)) return `${ref}: file not found`;
	if (anchor && file.endsWith('.md') && !headingsOf(file).some((h) => h.anchor === anchor)) return `${ref}: no heading with that anchor`;
	return null;
}

function generated(ctx: Ctx, blocks: NonNullable<Plugins['generated']>, mode: 'check' | 'gen'): Problem[] {
	const out: Problem[] = [];
	for (const g of blocks) {
		const file = ctx.path(g.file);
		const text = readFileSync(file, 'utf8');
		const re = new RegExp(`(<!-- generated:${g.name} -->)[\\s\\S]*?(<!-- /generated:${g.name} -->)`);
		if (!re.test(text)) {
			out.push(err(g.file, `marker <!-- generated:${g.name} --> missing`));
			continue;
		}
		const next = text.replace(re, (_, open, close) => `${open}\n${g.make()}\n${close}`);
		if (next === text) continue;
		if (mode === 'gen') writeFileSync(file, next);
		else out.push(err(g.file, `block "${g.name}" is out of date (run kb gen)`));
	}
	return out;
}

const markdownFiles = (ctx: Ctx): string[] => docFiles(ctx).map((f) => join(ctx.path(ctx.config.docs.dir), f));

function links(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	for (const file of markdownFiles(ctx)) {
		const where = relative(ctx.root, file);
		for (const { target, line } of relativeLinks(readFileSync(file, 'utf8'))) {
			const [path, anchor] = target.split('#');
			const full = join(dirname(file), decodeURI(path));
			if (!existsSync(full)) out.push(err(`${where}:${line}`, `broken link: ${target}`));
			else if (anchor && full.endsWith('.md') && !headingsOf(full).some((h) => h.anchor === anchor.toLowerCase()))
				out.push(err(`${where}:${line}`, `no heading for anchor: ${target}`));
		}
	}
	return out;
}

/**
 * kb reads frontmatter with a forgiving parser of its own; VitePress reads it with js-yaml 3
 * (through gray-matter) and fails the build on what that rejects. Same parser here, so the
 * check fails first.
 */
function frontmatter(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	for (const file of markdownFiles(ctx)) {
		const yaml = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
		if (yaml === undefined) continue;
		try {
			safeLoad(yaml);
		} catch (e) {
			const { reason, mark, message } = e as YAMLException;
			const line = Math.min((mark?.line ?? 0) + 2, yaml.split('\n').length + 1);
			out.push(
				err(
					`${relative(ctx.root, file)}:${line}`,
					`frontmatter is not valid YAML (the VitePress build fails on it): ${reason ?? message}. A value holding ": " or starting with @ \` % * & ! | > [ { goes in double quotes`
				)
			);
		}
	}
	return out;
}

/**
 * `<word>` outside code is HTML to markdown: the reader never sees it, and under VitePress (a
 * `.vitepress` folder in the docs) a tag that never closes fails the build.
 */
function tags(ctx: Ctx): Problem[] {
	const vitepress = existsSync(join(ctx.path(ctx.config.docs.dir), '.vitepress'));
	const why = vitepress ? 'VitePress compiles each page as a Vue template and the build fails on it' : 'markdown reads it as HTML and the reader never sees it';
	return markdownFiles(ctx).flatMap((file) =>
		strayTags(readFileSync(file, 'utf8')).map(({ tag, line }) =>
			(vitepress ? err : warn)(
				`${relative(ctx.root, file)}:${line}`,
				`<${tag}> ${tag.startsWith('/') ? 'closes no open tag' : 'opens a tag that never closes'}: ${why}. Text in angle brackets goes in backticks`
			)
		)
	);
}

function pages(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	const { groups, sections, maxLines } = ctx.config.docs;
	// the root home and each section's home sit above the groups
	const homes = ['index.md', ...sections.map((s) => `${s.prefix}index.md`)];
	for (const p of loadPages(ctx)) {
		const where = `${ctx.config.docs.dir}/${p.rel}`;
		if (!p.title) out.push(err(where, 'frontmatter `title` missing (the name in the sidebar and the map)'));
		if (!p.summary) out.push(err(where, 'frontmatter `summary` missing (one line: what this doc holds)'));
		if (!homes.includes(p.rel) && !groups.includes(p.group)) out.push(err(where, `frontmatter \`group\` must be one of: ${groups.join(', ')}`));
		if (p.lines > maxLines) out.push(warn(where, `${p.lines} lines (over ${maxLines}): move a topic to its own doc; never summarize to fit`));
	}
	return out;
}

function decisions(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	const all = loadDecisions(ctx);
	const byId = new Map(all.map((d) => [d.id, d]));
	const allowed = new Set([...LABELS, ...ctx.config.decisions.extraLabels].map((l) => l.toLowerCase()));
	for (const d of all) {
		const where = relative(ctx.root, d.file);
		if (!ID.test(d.id)) out.push(err(where, 'file name must be YYYY-MM-DD-slug.md'));
		if (d.date !== d.id.slice(0, 10)) out.push(err(where, `date ${d.date} differs from the file name`));
		if (!d.title) out.push(err(where, 'no `# title`'));
		for (const label of LABELS)
			if (!new RegExp(`\\*\\*${label}:\\*\\*\\s*\\S`).test(d.body))
				out.push(warn(where, `**${label}:** missing or empty${label === 'Rejected' ? `: ${NO_ALTERNATIVE}` : ''}`));
		// a superseded decision is history, read as it was written
		for (const { label, line } of d.supersededBy ? [] : labeledLines(readFileSync(d.file, 'utf8')))
			if (!allowed.has(label.toLowerCase()))
				out.push(
					warn(
						`${where}:${line}`,
						`**${label}:** is not a decision label. Work still to do goes to a question (kb question add) or the roadmap, and a later change to a new decision with --amends; the decision keeps only what was decided. A label that is part of the decision goes in decisions.extraLabels (kb.config.ts)`
					)
				);
		if (d.supersededBy && !byId.get(d.supersededBy)?.supersedes.includes(d.id))
			out.push(err(where, `superseded_by ${d.supersededBy}, which does not list it in supersedes`));
		for (const s of d.supersedes)
			if (byId.get(s)?.supersededBy !== d.id) out.push(err(where, `supersedes ${s}, which does not point back in superseded_by`));
		for (const a of d.amendedBy) if (!byId.get(a)?.amends.includes(d.id)) out.push(err(where, `amended_by ${a}, which does not list it in amends`));
		for (const a of d.amends) if (!byId.get(a)?.amendedBy.includes(d.id)) out.push(err(where, `amends ${a}, which does not point back in amended_by`));
		if (!d.supersededBy && !d.livesIn.length) out.push(warn(where, 'lives_in is empty: where is the state this decision produced described?'));
		if (d.revisit && !DATE.test(d.revisit)) out.push(err(where, '`revisit` must be YYYY-MM-DD'));
		else if (isDue(d)) {
			const days = daysSince(d.revisit);
			out.push(
				warn(
					where,
					`revisit date ${d.revisit} has come${days ? ` (${days} days ago)` : ''}: read the decision's condition again; if it holds, kb decision revisit ${d.id} --next <date> (or --done); if not, a new decision that supersedes or amends it`
				)
			);
		}
		// a superseded decision is history: what it pointed at may be gone
		for (const ref of d.supersededBy ? [] : d.livesIn) {
			const p = refProblem(ctx, ref);
			if (p) out.push(err(where, `lives_in ${p}`));
		}
	}
	return out;
}

function questions(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	const { staleDays } = ctx.config.questions;
	const groups = Object.keys(ctx.config.questions.groups);
	for (const q of loadQuestions(ctx)) {
		const where = relative(ctx.root, q.file);
		if (!q.title) out.push(err(where, 'no `# title`'));
		if (!groups.includes(q.group)) out.push(err(where, `group must be one of: ${groups.join(', ')}`));
		if (!DATE.test(q.since)) out.push(err(where, '`since` must be YYYY-MM-DD'));
		else if (q.reviewed && !DATE.test(q.reviewed)) out.push(err(where, '`reviewed` must be YYYY-MM-DD'));
		else if (idleDays(q) > staleDays) {
			// age alone is no problem (a client may take two months); a question nobody checks is
			const last = q.reviewed ? `last reviewed ${q.reviewed}, ${idleDays(q)} days ago` : `open for ${ageInDays(q)} days, never reviewed`;
			out.push(warn(where, `${last}${q.owner ? ` (${q.owner})` : ''}: check it with whoever unblocks it, then kb question review ${q.id}`));
		}
		for (const ref of q.context) {
			const p = refProblem(ctx, ref);
			if (p) out.push(err(where, `context ${p}`));
		}
		const gone = isDocRef(q.unblocks) && refProblem(ctx, q.unblocks);
		if (gone) out.push(err(where, `unblocks ${gone}; point it at what waits on it now, or resolve the question`));
	}
	return out;
}

/** Comments that point at docs (`docs/x.md § Section`, `docs/decisions/<id>.md`) must point somewhere real. */
function codeRefs(ctx: Ctx): Problem[] {
	const out: Problem[] = [];
	for (const { file, line, doc, section, exists, found } of docRefsInCode(ctx)) {
		if (!exists) out.push(err(`${file}:${line}`, `${doc} does not exist`));
		else if (section && !found) out.push(err(`${file}:${line}`, `${doc} § ${section} not found`));
	}
	return out;
}
