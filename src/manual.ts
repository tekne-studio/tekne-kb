import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { type Auth, CONFIG_FILE, type Ctx, type Manual, MANUAL_OPTIONS } from './config';
import { isActive, loadDecisions } from './decisions';
import { parse, stringify } from './frontmatter';
import { manualDir } from './screens';
import { slugify } from './slug';

// `kb manual setup`: the questions a manual starts from (who reads it, how they get in, where
// it is published), asked again to change one. The answers go into kb.config.ts, where
// `kb guide manual` reads them to show the chapters for these choices.

type Key = 'audience' | keyof typeof MANUAL_OPTIONS | 'vitepress' | 'run';
type Answers = Partial<Manual>;

// a question with no options takes text; an optional one never holds the block back
const QUESTIONS: { key: Key; ask: string; options: [string, string][]; text?: string; optional?: true }[] = [
	{ key: 'audience', ask: 'Who reads the manual?', options: [] },
	{ key: 'access', ask: 'Public or private?', options: [['public', ''], ['private', '']] },
	{ key: 'auth', ask: 'How does a reader get in? (one or more, comma-separated)', options: [['app', "the app's own login"], ['password', 'a password that opens only the manual'], ['github', "the GitHub organization's access"], ['other', '']] },
	{ key: 'publish', ask: 'Where is it published?', options: [['app', 'served by the app'], ['pages', 'GitHub Pages'], ['host', 'a static host of its own'], ['repo', 'only in the repository, as markdown on GitHub']] },
	{ key: 'site', ask: 'Does the published site carry only the manual, or the technical docs too?', options: [['manual', 'only the manual'], ['all', 'the technical docs too']] },
	{ key: 'screen', ask: 'What is a screen in this product?', options: [['route', ''], ['tool', 'a tool or gesture'], ['command', '']] },
	{ key: 'shots', ask: 'Screenshots built in CI, or on a machine and committed?', options: [['ci', 'built in CI'], ['committed', 'built on a machine and committed']] },
	{ key: 'vitepress', ask: 'VitePress?', options: [['yes', ''], ['no', '']] },
	{ key: 'run', ask: 'The command that writes every screenshot? (optional: the rules cite it)', options: [], text: 'command', optional: true }
];

const ORDER = ['dir', 'audience', 'access', 'auth', 'publish', 'site', 'screen', 'shots', 'run', 'vitepress'] as const;

/** The answers given as flags, checked against the options each choice takes. */
export function fromFlags(flags: Partial<Record<Key | 'dir', string>>): Answers {
	const out: Answers = {};
	for (const [key, options] of Object.entries(MANUAL_OPTIONS) as [keyof typeof MANUAL_OPTIONS, readonly string[]][]) {
		const v = flags[key];
		if (v === undefined) continue;
		// a private manual may open more than one way: the team's login, and a password for the manual alone
		const values = key === 'auth' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [v];
		const bad = values.find((x) => !options.includes(x));
		if (bad !== undefined || !values.length) throw new Error(`--${key} must be ${key === 'auth' ? 'one or more of' : 'one of'} ${options.join(', ')}`);
		(out as Record<string, unknown>)[key] = key === 'auth' ? [...new Set(values)] : v;
	}
	if (flags.vitepress !== undefined) {
		const v = flags.vitepress.toLowerCase();
		if (!['yes', 'no', 'true', 'false'].includes(v)) throw new Error('--vitepress must be one of yes, no');
		out.vitepress = v === 'yes' || v === 'true';
	}
	if (flags.audience !== undefined) out.audience = flags.audience;
	if (flags.run !== undefined) out.run = flags.run;
	if (flags.dir !== undefined) out.dir = flags.dir.endsWith('/') ? flags.dir : `${flags.dir}/`;
	return out;
}

/** The questions still without an answer; how a reader gets in only matters for a private manual. */
function open(a: Answers, optional = false) {
	return QUESTIONS.filter((q) => !!q.optional === optional && (q.key !== 'auth' || a.access !== 'public') && a[q.key] === undefined);
}

function describeQuestion(q: (typeof QUESTIONS)[number], a: Answers): string {
	const flag = q.options.length ? `--${q.key} ${q.options.map(([v]) => v).join('|')}` : `--${q.key} "<${q.text ?? 'text'}>"`;
	const lines = [`${q.ask}${q.key === 'auth' && !a.access ? ' (private only)' : ''}  ${flag}`];
	for (const [v, what] of q.options) if (what) lines.push(`  ${v}: ${what}`);
	return lines.join('\n');
}

async function ask(a: Answers): Promise<Answers> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		for (let q = open(a)[0]; q; q = open(a)[0]) {
			const reply = (await rl.question(`\n${describeQuestion(q, a)}\n> `)).trim();
			try {
				Object.assign(a, q.key === 'audience' ? { audience: reply || undefined } : fromFlags({ [q.key]: reply }));
			} catch (e) {
				console.log((e as Error).message);
			}
		}
		for (const q of open(a, true)) {
			const reply = (await rl.question(`\n${describeQuestion(q, a)}\n> `)).trim();
			if (reply) Object.assign(a, { [q.key]: reply });
		}
	} finally {
		rl.close();
	}
	return a;
}

/** What each combination costs, said before it is written. */
export function warnings(m: Answers): string[] {
	const out: string[] = [];
	if (m.access === 'public' && m.site === 'all') out.push('a public site with the technical docs makes decisions and open questions public: --site manual publishes only the manual');
	if (m.publish === 'pages' && m.access === 'private')
		out.push('GitHub Pages restricts access only on GitHub Enterprise Cloud; on other plans anyone with the URL reads it, and Pages from a private repository needs a paid plan');
	if (m.publish === 'repo' && m.shots === 'ci') out.push('GitHub shows the markdown straight from the repository, so the screenshots must be committed (--shots committed)');
	if (m.access === 'public' && m.auth?.length) out.push('a public manual needs no way in: auth is ignored');
	return out;
}

const quote = (s: string) => (s.includes("'") ? JSON.stringify(s) : `'${s.replace(/\\/g, '\\\\')}'`);
const shell = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
// one way in is written as a string, several as a list
const asText = (v: unknown): string => (Array.isArray(v) ? (v.length === 1 ? asText(v[0]) : `[${v.map(asText).join(', ')}]`) : typeof v === 'string' ? quote(v) : String(v));
const shown = (v: unknown): string => (v === undefined ? '(none)' : Array.isArray(v) ? v.join(', ') : String(v));

function block(m: Answers, unit: string): string {
	const lines = ORDER.filter((k) => m[k] !== undefined).map((k) => `${unit}${unit}${k}: ${asText(m[k])},`);
	return `${unit}manual: {\n${lines.join('\n').replace(/,$/, '')}\n${unit}},\n`;
}

const AUTH: Record<Auth, string> = { app: "the app's login", password: 'a password that opens only it', github: "the GitHub organization's access", other: 'an access of its own' };
const PUBLISH = { app: 'served by the app', pages: 'published on GitHub Pages', host: 'published on a static host of its own', repo: 'kept in the repository as markdown' };
const SCREEN = { route: 'a route', tool: 'a tool or gesture', command: 'a command' };

function decisionCommand(ctx: Ctx, m: Manual): string[] {
	const title = `The manual is ${m.access === 'private' ? `private, behind ${(m.auth?.length ? m.auth : ['other' as const]).map((a) => AUTH[a]).join(' or ')}` : 'public'}, ${PUBLISH[m.publish]}`;
	const said = `For ${m.audience}: the published site carries ${m.site === 'manual' ? 'only the manual' : 'the manual and the technical docs'}; a screen is ${SCREEN[m.screen]}; screenshots are ${m.shots === 'ci' ? 'built in CI' : 'built on a machine and committed'}; ${m.vitepress ? 'the site is VitePress' : 'no VitePress'}.`;
	// a current decision about the manual is the one a change of setup replaces
	const about = loadDecisions(ctx).filter((d) => isActive(d) && d.livesIn.some((ref) => ref.startsWith(m.dir)));
	const cmd = `kb decision new ${shell(title)} --decision ${shell(said)} --why "<fill in>" --rejected "<fill in>" --lives-in ${m.dir}index.md${about.length === 1 ? ` --supersedes ${about[0].id}` : ''}`;
	const out = ['record the choice:', `  ${cmd}`];
	if (about.length > 1) out.push('current decisions about the manual; add --supersedes (or --amends) for the one this replaces:', ...about.map((d) => `  ${d.id}`));
	return out;
}

/** Asks what is still open, then writes the manual block, or shows what changes when there is one. The manual it wrote, if it wrote. */
export async function setup(ctx: Ctx, flags: Partial<Record<Key | 'dir', string>>, interactive = !!process.stdin.isTTY): Promise<Manual | null> {
	const given = fromFlags(flags);
	const before = ctx.config.manual;
	let a: Answers = { ...before, ...given };
	if (open(a).length) {
		if (!interactive) {
			console.log(`${[...open(a), ...open(a, true)].map((q) => describeQuestion(q, a)).join('\n\n')}\n\nan agent asks the person these, one at a time with its recommendation, then runs kb manual setup with the answers`);
			return null;
		}
		a = await ask(a);
	}
	for (const w of warnings(a)) console.log(`! ${w}`);
	const m = { ...a, dir: a.dir ?? 'manual/' } as Manual;
	if (m.access === 'public') delete m.auth;

	const file = ctx.path(CONFIG_FILE);
	const text = readFileSync(file, 'utf8');
	let wrote = false;
	if (!before) {
		const at = text.match(/^.*(defineConfig\(\{|export default \{)\s*\n/m);
		const unit = at ? (text.slice(at.index! + at[0].length).match(/^[ \t]+/)?.[0] ?? '\t') : '\t';
		if (at) {
			const end = at.index! + at[0].length;
			writeFileSync(file, `${text.slice(0, end)}${block(m, unit)}${text.slice(end)}`);
			console.log(`${CONFIG_FILE}: manual block written`);
			wrote = true;
		} else console.log(`add this block to ${CONFIG_FILE}:\n\n${block(m, unit).trimEnd()}`);
	} else {
		const changed = ORDER.filter((k) => String(before[k]) !== String(m[k]));
		if (!changed.length) {
			console.log(`${CONFIG_FILE}: the manual block already holds these answers`);
			return null;
		}
		console.log(changed.map((k) => `  ${k}: ${shown(before[k])} → ${shown(m[k])}`).join('\n'));
		console.log(`\nreplace the manual block in ${CONFIG_FILE} with this:\n\n${block(m, '\t').trimEnd()}`);
		// what the project wrote by hand, which setup never asks
		const kept = (['list', 'screens', 'scripts', 'images', 'template'] as const).filter((k) => before[k] !== undefined);
		if (kept.length) console.log(`keeping ${kept.join(', ')} as they are`);
	}
	if (m.vitepress && m.site === 'all' && !ctx.config.docs.sections.some((s) => s.prefix === m.dir))
		console.log(`\ndocs.sections in ${CONFIG_FILE} gets the manual: { prefix: ${quote(m.dir)}, title: 'Manual', groups: [/* the manual's groups */] }`);
	if (ctx.config.agents && !ctx.config.agents.modules.includes('manual')) console.log(`\nagents.modules in ${CONFIG_FILE} gets 'manual': the manual's rules in AGENTS.md`);
	console.log(`\nnext: kb guide manual (the chapters for these choices)\n${decisionCommand(ctx, m).join('\n')}`);
	return wrote ? m : null;
}

// a page in the shape of guides/manual.md § The pieces; the comments guide whoever fills it and never render
const PAGE = (title: string) => `# ${title}

<!-- what it is and who it is for, in one paragraph -->

## Step by step

## What each role sees

## Common questions

## Screens

<!-- generated:screens -->
<!-- /generated:screens -->
`;

/** `kb manual new`: a page of the manual, from the project's template or kb's, in one of the manual's groups. */
export function newPage(ctx: Ctx, o: { title: string; group: string; id?: string; order?: string }): { file: string; page: string } {
	const manual = ctx.config.manual;
	if (!manual) throw new Error(`no manual block in ${CONFIG_FILE} (kb manual setup writes one)`);
	const groups = ctx.config.docs.sections.find((s) => s.prefix === manual.dir)?.groups ?? ctx.config.docs.groups;
	if (groups.length && !groups.includes(o.group)) throw new Error(`--group must be one of: ${groups.join(', ')}`);
	const page = o.id ?? slugify(o.title);
	const dir = manualDir(ctx);
	const file = join(dir, `${page}.md`);
	if (existsSync(ctx.path(file))) throw new Error(`${file} already exists`);
	// the next place in its group, after the pages already there
	const order =
		o.order ??
		String(
			(existsSync(ctx.path(dir)) ? readdirSync(ctx.path(dir)).filter((f) => f.endsWith('.md') && f !== 'index.md' && !f.startsWith('.')) : []).filter(
				(f) => groupOf(ctx.path(join(dir, f))) === o.group
			).length + 1
		);
	const text = manual.template
		? readFileSync(ctx.path(manual.template), 'utf8').replace(/\{\{(title|group|order)\}\}/g, (_, key: 'title' | 'group' | 'order') => ({ title: o.title, group: o.group, order })[key])
		: stringify({ title: o.title, group: o.group, order }, PAGE(o.title));
	mkdirSync(ctx.path(dir), { recursive: true });
	writeFileSync(ctx.path(file), text);
	return { file, page };
}

function groupOf(file: string): unknown {
	try {
		return parse(readFileSync(file, 'utf8')).data.group;
	} catch {
		// frontmatter kb's reader cannot take (VitePress's own blocks) is kb check's to report
		return undefined;
	}
}
