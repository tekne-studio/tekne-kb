#!/usr/bin/env bun
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { refreshRules } from './agents';
import { check, refProblem } from './check';
import { type Ctx, loadConfig } from './config';
import * as guides from './guide';
import { version as VERSION } from '../package.json';
import { init } from './init';
import * as decisions from './decisions';
import * as manual from './manual';
import { loadPages } from './pages';
import * as questions from './questions';
import { blockers, isDocRef, leftSince, readRoadmap, roadmapOf, roadmapPath } from './roadmap';
import { answerable, describe, refKey, search, why } from './search';
import { addDays, DATE, today } from './dates';

const HELP = `kb: project knowledge (decisions, open questions, docs) kept as markdown in git.

Decisions (one file each, YYYY-MM-DD-slug.md)
  kb decision new "<title>" [--decision <text>] [--why <text>] [--rejected <text>]
                            [--lives-in <doc.md#anchor | /repo/path>]... [--supersedes <id>]...
                            [--amends <id>]... [--resolves <question-id>]... [--revisit YYYY-MM-DD]
                            [--id <short-slug>]
                            without --resolves, lists the open questions it may answer
  kb decision revisit <id> (--next YYYY-MM-DD | --done)   when to look at it again; --done clears it
  kb decision supersede <old> --by <new>     the old one stops being current
  kb decision amend <old> --by <new>         the old one stays current, changed in part
  kb decision list [--all | --due] [--json]  current decisions, newest first; --due: revisit date has come
  kb decision show <id>                      ids match by prefix or fragment

Open questions (one file each; resolving deletes it)
  kb question add "<title>" --group <group> [--owner <who>] [--unblocks <what | roadmap.md#item>]
                            [--context <doc.md#anchor>]... [--details <text>] [--id <short-slug>]
  kb question list [--group <group>] [--json]
  kb question show <id>
  kb question review <id>... [--group <group>] [--date YYYY-MM-DD]
                            after checking with whoever unblocks it: records the date
  kb question resolve <id> [--decision <id>]   links to the question move to the decision

Roadmap (one page: Now in order, each item a ### heading with its done-when line; Later, one-line wishes)
  kb roadmap [--json]                     Now in order, what blocks each item, Later by theme
  kb roadmap done [--since YYYY-MM-DD] [--json]
                                          items that left Now since the day (default: a week ago), from git

Finding things
  kb search <terms...> [--all] [--limit <n>] [--json]   decisions, questions and doc sections
  kb why <doc.md[#anchor] | repo/path> [--json]          decisions, questions and tests behind a doc or section
  kb docs [--json]                                       the docs map, one line per doc

Setting up
  kb init       config, decision and question folders, the roadmap page, AGENTS.md with CLAUDE.md as a symlink
  kb guide [<topic>] [--all]   a guide kb keeps; inside a project, the chapters for its choices
  kb manual setup [--audience <text>] [--access public|private] [--auth app|password|github|other[,…]]
                  [--publish app|pages|host|repo] [--site manual|all] [--screen route|tool|command]
                  [--shots ci|committed] [--run <command>] [--vitepress yes|no] [--dir <folder/>]
                the manual's choices into kb.config.ts; asks what is missing; again to change one
  kb manual new "<title>" --group <group> [--id <slug>] [--order <n>]
                a page of the manual, from the project's template (manual.template) or kb's

Keeping docs true
  kb check      fails on broken links, refs, invalid frontmatter, unclosed tags or stale generated blocks (CI runs it)
  kb gen        rewrites generated blocks and the shared AGENTS.md rules
  kb version    the installed kb (also --version, -v); answers outside a project

References are written from the docs folder (pessoa.md#acesso); a leading / is the repo root.`;

// read inside main, so a bad flag ends in the one-line error like every other failure
function readFlags() {
	try {
		return parseArgs({
			args: process.argv.slice(2),
			allowPositionals: true,
			options: {
				id: { type: 'string' },
				version: { type: 'boolean', short: 'v' },
				'lives-in': { type: 'string', multiple: true },
				decision: { type: 'string' },
				why: { type: 'string' },
				rejected: { type: 'string' },
				supersedes: { type: 'string', multiple: true },
				amends: { type: 'string', multiple: true },
				resolves: { type: 'string', multiple: true },
				revisit: { type: 'string' },
				next: { type: 'string' },
				done: { type: 'boolean' },
				due: { type: 'boolean' },
				by: { type: 'string' },
				group: { type: 'string' },
				owner: { type: 'string' },
				unblocks: { type: 'string' },
				context: { type: 'string', multiple: true },
				details: { type: 'string' },
				date: { type: 'string' },
				all: { type: 'boolean' },
				json: { type: 'boolean' },
				limit: { type: 'string' },
				dir: { type: 'string' },
				audience: { type: 'string' },
				access: { type: 'string' },
				auth: { type: 'string' },
				publish: { type: 'string' },
				site: { type: 'string' },
				screen: { type: 'string' },
				shots: { type: 'string' },
				vitepress: { type: 'string' },
				run: { type: 'string' },
				order: { type: 'string' },
				since: { type: 'string' },
				help: { type: 'boolean', short: 'h' }
			}
		});
	} catch (e) {
		const { code, message } = e as Error & { code?: string };
		if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw new Error(`unknown option ${message.match(/'([^']+)'/)?.[1]} (kb --help)`);
		throw new Error(`${message.charAt(0).toLowerCase()}${message.slice(1)} (kb --help)`);
	}
}

const rel = (file: string) => relative(process.cwd(), file);
const cut = (s: string, n = 100) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const json = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const need = (v: string | undefined, what: string): string => {
	if (!v) throw new Error(`missing ${what} (kb --help)`);
	return v;
};

function report(r: questions.Resolved, decision?: string): void {
	console.log(`resolved ${r.question.id}${decision ? ` (recorded in ${decision})` : ''}; deleted ${rel(r.question.file)}`);
	if (r.repointed.length) console.log(`links now lead to the decision in: ${r.repointed.join(', ')}`);
	if (r.left.length) {
		console.log(`still pointing at the question (fix by hand${decision ? '' : ', or resolve with --decision'}):`);
		for (const ref of r.left) console.log(`  ${ref.file}:${ref.line}`);
	} else if (!decision) console.log('no decision given: if the question was answered, record it with kb decision new ... --resolves');
}

type Flags = ReturnType<typeof readFlags>['values'];

/** The commands that write to the project. */
const WRITES = ['decision new', 'decision revisit', 'decision supersede', 'decision amend', 'question add', 'question review', 'question resolve', 'manual new'];

async function main(): Promise<number> {
	const { values: opt, positionals: args } = readFlags();
	const [cmd, sub] = args;
	if (opt.version || cmd === 'version') return void console.log(`kb ${VERSION}`), 0;
	if (!cmd || opt.help || cmd === 'help') return void console.log(HELP), 0;
	if (cmd === 'init') {
		const made = await init(process.cwd());
		console.log(made.length ? made.map((m) => `created ${m}`).join('\n') : 'nothing to do: kb is already set up here');
		console.log(`\nNext: fill AGENTS.md, add frontmatter (title, group, summary) to each doc, run kb check.
VitePress: see the README of @tekne/kb § VitePress.`);
		return 0;
	}
	if (cmd === 'guide') return guide(sub, opt.all);
	// after the flags, so --version and --help answer outside a project too
	const ctx = await loadConfig();
	const code = await run(ctx, opt, args);
	// the rules follow the installed kb: a command that writes brings them along
	if (code === 0 && WRITES.includes(`${cmd} ${sub}`)) refreshed(ctx);
	return code;
}

function refreshed(ctx: Ctx): void {
	if (refreshRules(ctx)) console.log(`\nAGENTS.md: shared rules updated (kb ${VERSION}); commit it with this change`);
}

/** Works outside a project; inside one, a guide shows the chapters for the project's choices. */
async function guide(topic: string | undefined, all = false): Promise<number> {
	if (!topic) {
		const list = guides.topics();
		if (!list.length) console.log('no guides');
		for (const t of list) console.log(`${t.topic.padEnd(12)} ${t.summary}`);
		return 0;
	}
	const text = guides.readGuide(topic);
	const ctx = await loadConfig().catch((e: Error) => {
		if (e.message.includes('not found')) return undefined;
		throw e;
	});
	const choices = (ctx?.config as Record<string, unknown> | undefined)?.[topic];
	process.stdout.write(guides.render(text, topic, typeof choices === 'object' && choices ? (choices as Record<string, unknown>) : undefined, all));
	return 0;
}

async function run(ctx: Ctx, opt: Flags, args: string[]): Promise<number> {
	const [cmd, sub, ...rest] = args;

	if (cmd === 'decision') {
		const all = () => decisions.loadDecisions(ctx);
		if (sub === 'new') {
			const refs = (opt['lives-in'] ?? []).map((r) => refKey(ctx, r));
			for (const q of opt.resolves ?? []) questions.find(questions.loadQuestions(ctx), q);
			const d = decisions.create(ctx, {
				title: need(rest.join(' '), 'title'),
				id: opt.id,
				date: opt.date,
				livesIn: refs,
				fields: [opt.decision, opt.why, opt.rejected].map((f) => f ?? ''),
				supersedes: opt.supersedes,
				amends: opt.amends,
				revisit: opt.revisit
			});
			console.log(`created ${rel(d.file)}`);
			for (const q of opt.resolves ?? []) report(questions.resolve(ctx, q, d.id), d.id);
			if (!opt.decision || !opt.why || !opt.rejected) console.log('fill in the empty fields of the body');
			if (!opt.rejected) console.log(`Rejected: ${decisions.NO_ALTERNATIVE}`);
			// a decision recorded without --resolves left a question it answered open for weeks
			const maybe = opt.resolves?.length ? [] : answerable(ctx, d);
			if (maybe.length) console.log('\nopen questions this decision may answer. It answers one only if it says what the question asks; one that builds around the answer leaves it open:');
			for (const { question: q } of maybe) {
				const about = [q.id, q.owner && `waits on ${q.owner}`, q.unblocks && `unblocks ${q.unblocks}`].filter(Boolean).join(' · ');
				console.log(`  ${about}\n    ${cut(q.title)}\n    kb question resolve ${q.id} --decision ${d.id}`);
			}
			return 0;
		}
		if (sub === 'supersede' || sub === 'amend') {
			decisions.link(ctx, need(rest[0], 'the old decision id'), need(opt.by, '--by <new id>'), sub);
			console.log(`${rest[0]} ${sub === 'supersede' ? 'superseded' : 'amended'} by ${opt.by}`);
			return 0;
		}
		if (sub === 'revisit') {
			if (!opt.next === !opt.done) throw new Error('give --next YYYY-MM-DD or --done');
			const d = decisions.revisit(ctx, need(rest[0], 'decision id'), opt.next ?? '');
			console.log(d.revisit ? `${d.id}: revisit on ${d.revisit}` : `${d.id}: no revisit date`);
			return 0;
		}
		if (sub === 'list') {
			const list = all().filter((d) => (opt.due ? decisions.isDue(d) : opt.all || decisions.isActive(d)));
			if (opt.json) return json(list.map(({ body, data, file, ...d }) => ({ ...d, file: rel(file) }))), 0;
			for (const d of list) console.log(`${d.id}\n  ${cut(d.title)}${describe(d) ? `\n  ${describe(d)}` : ''}`);
			return 0;
		}
		if (sub === 'show') {
			const d = decisions.find(all(), need(rest[0], 'decision id'));
			if (opt.json) return json({ ...d, file: rel(d.file) }), 0;
			console.log(`${rel(d.file)}${d.supersededBy ? `  (superseded by ${d.supersededBy})` : ''}\n`);
			console.log(d.body.trim());
			if (d.livesIn.length) console.log(`\nlives in: ${d.livesIn.join(' · ')}`);
			return 0;
		}
	}

	if (cmd === 'question') {
		const all = () => questions.loadQuestions(ctx);
		if (sub === 'add') {
			// a doc reference (`roadmap.md#item`) is checked like --context; anything else is free text
			const unblocks = opt.unblocks && isDocRef(opt.unblocks) ? refKey(ctx, opt.unblocks) : opt.unblocks;
			const wrong = unblocks && isDocRef(unblocks) && refProblem(ctx, unblocks);
			if (wrong) throw new Error(`--unblocks ${wrong}`);
			const q = questions.add(ctx, {
				title: need(rest.join(' '), 'title'),
				id: opt.id,
				group: need(opt.group, `--group (${Object.keys(ctx.config.questions.groups).join(' | ')})`),
				owner: opt.owner,
				unblocks,
				context: (opt.context ?? []).map((r) => refKey(ctx, r)),
				details: opt.details,
				since: opt.date
			});
			console.log(`created ${rel(q.file)}`);
			return 0;
		}
		if (sub === 'list') {
			const list = all().filter((q) => !opt.group || q.group === opt.group);
			if (opt.json) return json(list.map(({ body, file, ...q }) => ({ ...q, file: rel(file) }))), 0;
			for (const q of list) {
				const meta = [q.group, q.owner, q.since && `since ${q.since}`, q.reviewed && `reviewed ${q.reviewed}`, q.unblocks && `unblocks: ${q.unblocks}`].filter(Boolean).join(' · ');
				console.log(`${q.id}\n  ${cut(q.title)}\n  ${meta}`);
			}
			return 0;
		}
		if (sub === 'show') {
			const q = questions.find(all(), need(rest[0], 'question id'));
			if (opt.json) return json({ ...q, file: rel(q.file) }), 0;
			console.log(`${rel(q.file)}  (${[q.group, q.owner, q.since && `since ${q.since}`, q.reviewed && `reviewed ${q.reviewed}`].filter(Boolean).join(' · ')})\n`);
			console.log(q.body.trim());
			if (q.unblocks) console.log(`\nunblocks: ${q.unblocks}`);
			if (q.context.length) console.log(`context: ${q.context.join(' · ')}`);
			return 0;
		}
		if (sub === 'review') {
			for (const q of questions.review(ctx, { ids: rest, group: opt.group, date: opt.date })) console.log(`reviewed ${q.id} (${q.reviewed})`);
			return 0;
		}
		if (sub === 'resolve') {
			report(questions.resolve(ctx, need(rest[0], 'question id'), opt.decision), opt.decision);
			return 0;
		}
	}

	if (cmd === 'manual' && sub === 'new') {
		const { file, page } = manual.newPage(ctx, { title: need(rest.join(' '), 'title'), group: need(opt.group, '--group'), id: opt.id, order: opt.order });
		const script = ctx.config.manual?.scripts?.replaceAll('{page}', page);
		console.log(`created ${file}\nnext: fill in its summary (frontmatter) and sections; add "${page}" to the manual's list with its screens and shots; write its script${script ? ` ${script}` : ''}`);
		return 0;
	}

	if (cmd === 'manual' && sub === 'setup') {
		const { dir, audience, access, auth, publish, site, screen, shots, vitepress } = opt;
		// it writes only once every answer is in: the rules come along then, with the new block's names
		const written = await manual.setup(ctx, { dir, audience, access, auth, publish, site, screen, shots, run: opt.run, vitepress });
		if (written) refreshed({ ...ctx, config: { ...ctx.config, manual: written } });
		return 0;
	}

	if (cmd === 'roadmap') {
		const r = roadmapOf(ctx);
		const file = roadmapPath(ctx, r);
		if (sub === 'done') {
			const since = opt.since ?? addDays(today(), -7);
			if (!DATE.test(since)) throw new Error('--since must be YYYY-MM-DD');
			const left = leftSince(ctx, since, r);
			if (opt.json) return json(left), 0;
			console.log(left.length ? `left "${r.now}" in ${file} since ${since}; each commit says whether done or dropped:` : `nothing left "${r.now}" in ${file} since ${since}`);
			for (const l of left) console.log(`  ${l.date}  ${l.title}${l.links.length ? `  → ${l.links.join(', ')}` : ''}\n              ${l.commit} ${cut(l.subject, 80)}`);
			return 0;
		}
		if (sub) throw new Error(`unknown command: roadmap ${sub} (kb --help)`);
		const page = readRoadmap(ctx, r);
		if (!page.now) throw new Error(`no "## ${r.now}" heading in ${file} (roadmap.now in kb.config.ts)`);
		const blocked = blockers(ctx, r, page);
		const waits = (anchor: string) => (blocked.get(anchor) ?? []).map((q) => ({ id: q.id, title: q.title, owner: q.owner }));
		if (opt.json) return json({ file, now: { ...page.now, entries: page.now.entries.map((i) => ({ ...i, blockedBy: waits(i.anchor) })) }, later: page.later }), 0;
		console.log(`${file}\n\n## ${page.now.heading}`);
		if (!page.now.entries.length) console.log('  nothing: what comes next is a ### item under it');
		// numbers right-aligned, so item 10 lines up with item 9
		const width = String(page.now.entries.length).length;
		const pad = ' '.repeat(width + 4);
		page.now.entries.forEach((i, n) => {
			console.log(`  ${String(n + 1).padStart(width)}. ${i.title}${i.steps.total ? `  (${i.steps.done}/${i.steps.total} steps)` : ''}`);
			console.log(`${pad}${i.doneWhen ? `${r.doneWhen.toLowerCase()}: ${cut(i.doneWhen, 120)}` : `no ${r.doneWhen.toLowerCase()} line`}`);
			for (const q of waits(i.anchor)) console.log(`${pad}waits on ${q.id}${q.owner ? ` (${q.owner})` : ''}: ${cut(q.title, 90)}`);
		});
		if (page.later) {
			const wishes = page.later.entries.reduce((n, t) => n + t.wishes, 0);
			console.log(`\n## ${page.later.heading}: ${wishes} wish${wishes === 1 ? '' : 'es'}`);
			// wishes straight under the part count under its own name; alone, they need no line
			const alone = page.later.entries.length === 1 && page.later.entries[0].title === page.later.heading;
			if (page.later.entries.length && !alone) console.log(`  ${page.later.entries.map((t) => `${t.title} ${t.wishes}`).join(' · ')}`);
		}
		return 0;
	}

	if (cmd === 'search') {
		const hits = search(ctx, [sub, ...rest].filter(Boolean), { all: opt.all }).slice(0, Number(opt.limit) || 20);
		if (opt.json) return json(hits), 0;
		if (!hits.length) console.log('nothing found');
		for (const h of hits) console.log(`${h.kind.padEnd(8)} ${h.id}${h.active ? '' : '  (superseded)'}\n         ${cut(h.title)}${h.detail ? `\n         ${cut(h.detail, 140)}` : ''}`);
		return 0;
	}

	if (cmd === 'why') {
		const r = why(ctx, need(sub, 'a doc, section or path'));
		if (opt.json) return json({ decisions: r.decisions.map((d) => ({ id: d.id, title: d.title, livesIn: d.livesIn })), questions: r.questions.map((q) => ({ id: q.id, title: q.title })), tests: r.tests.map((t) => ({ file: t.file, line: t.line, section: t.anchor })) }), 0;
		if (!r.decisions.length && !r.questions.length && !r.tests.length) console.log('no decision, question or test points here');
		for (const d of r.decisions) console.log(`decision ${d.id}\n         ${cut(d.title)}`);
		for (const q of r.questions) console.log(`question ${q.id}\n         ${cut(q.title)}`);
		for (const t of r.tests) console.log(`test     ${t.file}:${t.line}${t.anchor ? `  § ${t.anchor}` : ''}`);
		return 0;
	}

	if (cmd === 'docs') {
		const pages = loadPages(ctx).sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order);
		if (opt.json) return json(pages.map(({ text, headings, file, ...p }) => p)), 0;
		for (const p of pages) console.log(`${p.rel.padEnd(28)} ${p.title}: ${p.summary}`);
		return 0;
	}

	if (cmd === 'check' || cmd === 'gen') {
		const problems = await check(ctx, cmd);
		const errors = problems.filter((p) => p.level === 'error');
		for (const p of problems) console[p.level === 'error' ? 'error' : 'log'](`${p.level === 'error' ? '✗' : '!'} ${p.where}: ${p.message}`);
		if (errors.length) {
			console.error(`\n${errors.length} error(s)${problems.length > errors.length ? `, ${problems.length - errors.length} warning(s)` : ''}`);
			return 1;
		}
		console.log(`${problems.length ? '\n' : ''}✓ ${cmd === 'gen' ? 'generated and checked' : 'docs match the code'}${problems.length ? ` (${problems.length} warning(s))` : ''}`);
		return 0;
	}

	console.error(`unknown command: ${args.join(' ')}\n\n${HELP}`);
	return 1;
}

try {
	process.exit(await main());
} catch (e) {
	console.error(`kb: ${(e as Error).message}`);
	process.exit(1);
}
