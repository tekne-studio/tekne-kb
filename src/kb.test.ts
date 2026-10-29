import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from './check';
import { context, type Ctx, defineConfig } from './config';
import * as decisions from './decisions';
import { parse, stringify } from './frontmatter';
import { headings } from './markdown';
import * as questions from './questions';
import * as guides from './guide';
import { answerable, search, why } from './search';
import { slugify } from './slug';
import { kbData, kbManualOnly, kbMissingScreens, kbSidebar } from './vitepress';
import { globalBlock, OPENER } from './agents';
import { blockers, parsePage, readRoadmap } from './roadmap';
import { addDays, today } from './dates';
import { scaffold } from './init';
import { createApp } from 'vue';

let root: string;
let ctx: Ctx;

const write = (rel: string, text: string) => {
	mkdirSync(join(root, rel, '..'), { recursive: true });
	writeFileSync(join(root, rel), text);
};
const doc = (title: string, group: string, body: string) => `---\ntitle: ${title}\ngroup: ${group}\nsummary: about ${title}\n---\n\n${body}`;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'kb-'));
	ctx = context(root, defineConfig({ docs: { groups: ['Product'] }, questions: { groups: { client: 'With the client', tech: 'Technical' } } }));
	write('docs/index.md', '---\ntitle: Home\nsummary: start here\n---\n\n# Home\n');
	write('docs/billing.md', doc('Billing', 'Product', '# Billing\n\n## Refunds\n\nWithin 7 days.\n\n## Invoices\n\nMonthly, see [refunds](./billing.md#refunds).\n'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('slug', () => {
	test('matches VitePress anchors: accents, punctuation, leading digit', () => {
		expect(slugify('Papel e permissões')).toBe('papel-e-permissoes');
		expect(slugify('Gateway: configuração (sandbox)')).toBe('gateway-configuracao-sandbox');
		expect(slugify('2026 plano')).toBe('_2026-plano');
	});
	test('repeated headings are numbered, code marks and links dropped', () => {
		const hs = headings('# A\n\n## `events`\n\n## Notes\n\n## Notes\n\n## [Link](./x.md) here\n\n```\n## not a heading\n```\n');
		expect(hs.map((h) => h.anchor)).toEqual(['a', 'events', 'notes', 'notes-1', 'link-here']);
	});
	test('a heading after a code block keeps its line', () => {
		expect(headings('# A\n\n```\n## code\n```\n\n## B\n').map((h) => [h.text, h.line])).toEqual([
			['A', 1],
			['B', 7]
		]);
	});
});

describe('frontmatter', () => {
	test('round trip keeps strings, lists and quoting', () => {
		const data = { date: '2026-10-06', lives_in: ['billing.md#refunds', '/scripts/x.ts'], owner: 'Finance: the director', empty: [] as string[] };
		const { data: back, body } = parse(stringify(data, '# T\n'));
		expect(back).toEqual({ date: '2026-10-06', lives_in: ['billing.md#refunds', '/scripts/x.ts'], owner: 'Finance: the director' });
		expect(body).toBe('# T\n');
	});
	test('reads flow lists', () => {
		expect(parse('---\ntags: [a, "b c"]\n---\nx').data.tags).toEqual(['a', 'b c']);
	});
	test('skips nested blocks (a VitePress home page) and keeps the flat keys around them', () => {
		const { data } = parse('---\nlayout: home\ntitle: Manual\nhero:\n  name: Manual\n  actions:\n    - theme: brand\n      link: /x\nfeatures:\n  - title: A\n    details: a\nsummary: for the team\n---\n');
		expect(data.title).toBe('Manual');
		expect(data.summary).toBe('for the team');
		expect(data.layout).toBe('home');
	});
});

describe('decisions', () => {
	test('new decision: dated id, fixed labels, lives_in', () => {
		const d = decisions.create(ctx, {
			title: 'Refunds within 7 days',
			date: '2026-10-01',
			livesIn: ['billing.md#refunds'],
			fields: ['7 days.', 'Consumer law.', '30 days (too long).']
		});
		expect(d.id).toBe('2026-10-01-refunds-within-7-days');
		expect(d.body).toContain('**Decision:** 7 days.\n\n**Why:** Consumer law.\n\n**Rejected:** 30 days (too long).');
		expect(decisions.loadDecisions(ctx).map((x) => x.id)).toEqual([d.id]);
	});

	test('same title on the same day gets a suffix instead of overwriting', () => {
		const a = decisions.create(ctx, { title: 'Same', date: '2026-10-01' });
		const b = decisions.create(ctx, { title: 'Same', date: '2026-10-01' });
		expect([a.id, b.id]).toEqual(['2026-10-01-same', '2026-10-01-same-2']);
	});

	test('supersede writes both sides; the old one leaves the current list and search', () => {
		const old = decisions.create(ctx, { title: 'Refunds within 30 days', date: '2026-09-01', livesIn: ['billing.md#refunds'] });
		const next = decisions.create(ctx, { title: 'Refunds within 7 days', date: '2026-10-01', livesIn: ['billing.md#refunds'], supersedes: [old.id] });
		const all = decisions.loadDecisions(ctx);
		expect(decisions.find(all, old.id).supersededBy).toBe(next.id);
		expect(decisions.find(all, next.id).supersedes).toEqual([old.id]);
		expect(why(ctx, 'docs/billing.md#refunds').decisions.map((d) => d.id)).toEqual([next.id]);
		expect(search(ctx, ['refunds']).filter((h) => h.kind === 'decision').map((h) => h.id)).toEqual([next.id]);
		expect(search(ctx, ['refunds'], { all: true }).filter((h) => h.kind === 'decision')).toHaveLength(2);
	});

	test('find by prefix or fragment, and refuses an ambiguous one', () => {
		decisions.create(ctx, { title: 'Refunds within 7 days', date: '2026-10-01' });
		decisions.create(ctx, { title: 'Refunds by card', date: '2026-10-02' });
		const all = decisions.loadDecisions(ctx);
		expect(decisions.find(all, 'by-card').id).toBe('2026-10-02-refunds-by-card');
		expect(() => decisions.find(all, 'refunds')).toThrow('matches 2 decisions');
	});
});

describe('questions', () => {
	test('add, then resolve through a decision that records it', () => {
		const q = questions.add(ctx, { title: 'Who signs the invoices?', group: 'client', owner: 'the finance lead', unblocks: 'invoicing', context: ['billing.md#invoices'] });
		expect(q.id).toBe('who-signs-the-invoices');
		expect(() => questions.add(ctx, { title: 'x', group: 'nope' })).toThrow('group must be one of');
		const d = decisions.create(ctx, { title: 'Finance signs invoices', date: '2026-10-03' });
		questions.resolve(ctx, q.id, d.id);
		expect(existsSync(q.file)).toBe(false);
		expect(decisions.find(decisions.loadDecisions(ctx), d.id).resolves).toEqual([q.id]);
	});
});

describe('check', () => {
	const errors = async () => (await check(ctx)).filter((p) => p.level === 'error').map((p) => `${p.where}: ${p.message}`);

	test('a clean project passes', async () => {
		decisions.create(ctx, { title: 'Refunds', date: '2026-10-01', livesIn: ['billing.md#refunds'], fields: ['a', 'b', 'c'] });
		expect(await errors()).toEqual([]);
	});

	test('broken link, missing anchor, bad lives_in and missing frontmatter fail', async () => {
		write('docs/billing.md', doc('Billing', 'Product', '# Billing\n\nSee [x](./nope.md) and [y](./index.md#gone).\n'));
		write('docs/loose.md', '# Loose\n');
		decisions.create(ctx, { title: 'Refunds', date: '2026-10-01', livesIn: ['billing.md#refunds'] });
		const out = await errors();
		expect(out).toContain('docs/billing.md:9: broken link: ./nope.md');
		expect(out).toContain('docs/billing.md:9: no heading for anchor: ./index.md#gone');
		expect(out.some((e) => e.includes('lives_in billing.md#refunds: no heading'))).toBe(true);
		expect(out.some((e) => e.startsWith('docs/loose.md') && e.includes('`title` missing'))).toBe(true);
	});

	test('frontmatter that strict YAML rejects fails, as it fails the VitePress build', async () => {
		write('docs/billing.md', '---\ntitle: Billing\ngroup: Product\nsummary: Gateway: card and boleto\n---\n\n# Billing\n');
		write('docs/questions/dup.md', '---\ngroup: tech\nsince: 2026-10-01\nsince: 2026-10-02\n---\n\n# Dup\n');
		const out = await errors();
		expect(out.some((e) => e.startsWith('docs/billing.md:4: frontmatter is not valid YAML'))).toBe(true);
		expect(out.some((e) => e.startsWith('docs/questions/dup.md:4: frontmatter is not valid YAML') && e.includes('duplicated mapping key'))).toBe(true);
	});

	test('a tag that never closes, or closes nothing, fails, as it fails the VitePress build', async () => {
		const body = [
			'# Billing',
			'',
			'Refunds go to /refunds/<id>, see <DecisionList /> and <QuestionList group="client" />.<br>',
			'',
			'<details><summary>Old <b>flow</b></summary>',
			'',
			'Kept as `<id>`, ``a `<x>` b``, <https://example.com>, <someone@example.com> and \\<raw>.',
			'</details>',
			'<!-- <draft> -->',
			'```ts',
			'const a: Array<string> = [];',
			'```',
			'<script setup>const n = ref<number>(0)</script>',
			'Stray </div> here, and <img src="x.png"> stays.',
			''
		].join('\n');
		write('docs/billing.md', doc('Billing', 'Product', body));
		decisions.create(ctx, { title: 'Files under /files/<record>', date: '2026-10-01', livesIn: ['billing.md'], fields: ['a', 'b', 'c'] });
		const found = (why: string) => [
			`docs/billing.md:9: <id> opens a tag that never closes: ${why}. Text in angle brackets goes in backticks`,
			`docs/billing.md:20: </div> closes no open tag: ${why}. Text in angle brackets goes in backticks`,
			`docs/decisions/2026-10-01-files-under-files-record.md:7: <record> opens a tag that never closes: ${why}. Text in angle brackets goes in backticks`
		];
		// without VitePress, a warning: the text only goes missing
		const tags = async (level: string) => (await check(ctx)).filter((p) => p.level === level && p.message.includes(' tag')).map((p) => `${p.where}: ${p.message}`);
		expect(await tags('warn')).toEqual(found('markdown reads it as HTML and the reader never sees it'));
		write('docs/.vitepress/config.mts', '');
		expect(await tags('error')).toEqual(found('VitePress compiles each page as a Vue template and the build fails on it'));
	});

	test('what kb writes in frontmatter is valid YAML', async () => {
		const tricky = ['Finance: the director', 'a #tag', '@team', '`code` first', '"quoted" then', '50% off', '%done', '*star', 'yes', 'ends with:', '- dash', '[x] box'];
		write('docs/questions/tricky.md', stringify({ group: 'tech', since: '2026-10-01', owner: tricky.join(' '), context: tricky }, '# Tricky\n'));
		for (const [i, owner] of tricky.entries()) write(`docs/questions/t${i}.md`, stringify({ group: 'tech', since: '2026-10-01', owner }, '# T\n'));
		expect((await errors()).filter((e) => e.includes('YAML'))).toEqual([]);
	});

	test('one-sided supersede fails', async () => {
		const old = decisions.create(ctx, { title: 'Old', date: '2026-09-01' });
		const d = decisions.read(old.file);
		d.supersededBy = '2026-10-01-ghost';
		decisions.write(d);
		expect((await errors()).some((e) => e.includes('superseded_by 2026-10-01-ghost'))).toBe(true);
	});

	test('code that points to a missing doc fails', async () => {
		ctx = context(root, { ...ctx.config, code: { glob: 'src/**/*.ts' } });
		write('src/a.ts', '// see docs/billing.md § Refunds and docs/decisions/2026-01-01-gone.md\n');
		const out = await errors();
		expect(out).toEqual(['src/a.ts:1: docs/decisions/2026-01-01-gone.md does not exist']);
	});

	test('AGENTS.md: CLAUDE.md must be a symlink and the shared block current', async () => {
		ctx = context(root, { ...ctx.config, agents: { file: 'AGENTS.md', modules: ['core'], budget: 1500 } });
		spawn('git', ['init', '-q']);
		write('AGENTS.md', '# Agents\n\n<!-- kb:global -->\nold\n<!-- /kb:global -->\n');
		write('CLAUDE.md', 'a copy');
		const out = await errors();
		expect(out).toContain('CLAUDE.md: must be a symlink to AGENTS.md (ln -sf AGENTS.md CLAUDE.md)');
		expect(out).toContain('AGENTS.md: shared block differs from the kb templates (kb gen, or any kb command that writes, updates it)');
		rmSync(join(root, 'CLAUDE.md'));
		symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
		await check(ctx, 'gen');
		expect(await errors()).toEqual([]);
		const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
		expect(agents).toContain('### Before changing: ask why, and keep one fact in one place');
		// the opener names the kb that wrote the block
		const { version } = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8'));
		expect(agents).toContain(`<!-- kb:global · generated by kb ${version} -->`);
	});

	test('a module kb does not have fails in kb.config.ts, and the block holds the rest', async () => {
		ctx = context(root, { ...ctx.config, agents: { file: 'AGENTS.md', modules: ['core', 'worktrees', 'cor'], budget: 1500 } });
		write('AGENTS.md', '# Agents\n\n<!-- kb:global -->\n<!-- /kb:global -->\n');
		await check(ctx, 'gen');
		expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('### Before changing: ask why, and keep one fact in one place');
		expect(await errors()).toEqual([
			'kb.config.ts: agents.modules: kb has no module "worktrees": parallel agents in worktrees are @tekne/wf\'s (bun add -d @tekne/wf, then bun wf init); take it out of agents.modules',
			'kb.config.ts: agents.modules: kb has no module "cor" (it has core, manual, roadmap); take it out of agents.modules'
		]);
	});

	test('AGENTS.md: a list item of the project\'s part over 80 words fails, and the part over agents.budget fails naming the longest', async () => {
		ctx = context(root, { ...ctx.config, agents: { file: 'AGENTS.md', modules: ['core'], budget: 120 } });
		const words = (n: number, start = 'w') => Array.from({ length: n }, (_, i) => `${start}${i + 1}`).join(' ');
		const generated = `${OPENER}\n${globalBlock(['core'])}\n<!-- /kb:global -->\n\n<!-- wf:rules · generated by wf gen -->\n- ${words(300, 'wf')}\n<!-- /wf:rules -->`;
		// a rule and a link: 20 words; a nested one: 5; a continuation line joins its item
		const rules = `- Run the gates first, then \`bun kb check\` and only then commit: [the method](README.md#check) says why and in which order ok.\n  - a nested item of five words\n- a rule that goes on\n  to the next line`;
		write('AGENTS.md', `# Agents\n\n${generated}\n\n## This project\n\n${rules}\n`);
		symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
		expect(await errors()).toEqual([]);

		// one item of 81 words; a heading, a table and a paragraph count only toward the budget
		const long = `- ${words(81)}`;
		const text = `# Agents\n\n${generated}\n\n## This project\n\n${rules}\n${long}\n\n| a | b |\n|---|---|\n| ${words(3, 't')} | x |\n\n${words(10, 'p')}\n`;
		write('AGENTS.md', text);
		const at = (start: string) => text.split('\n').findIndex((l) => l.startsWith(start)) + 1;
		// 149 tokens: the two headings, the bullets with their markers, the table with its pipes, the paragraph
		expect(await errors()).toEqual([
			`AGENTS.md:${at('- w1')}: list item of 81 words, over 80: "w1 w2 w3 w4 w5 w6…". A rule is one line, what to do, with a link to the doc section that explains it; what describes the system moves to that section`,
			`AGENTS.md: the project's part has 149 words, over agents.budget 120. Move what describes the system to the topic docs and leave one line per rule, with a link; the longest items: line ${at('- w1')} (81 words) "w1 w2 w3 w4 w5 w6…", line ${at('- Run')} (21 words) "Run the gates first, then \`bun…", line ${at('- a rule')} (9 words) "a rule that goes on to…"`
		]);
		// gen never blocks on the shape
		expect((await check(ctx, 'gen')).filter((p) => p.level === 'error')).toEqual([]);
	});

	test('a project with only the AGENTS.md rules, and no docs folder yet, passes', async () => {
		rmSync(join(root, 'docs'), { recursive: true });
		ctx = context(root, defineConfig({ agents: { modules: ['core'] } }));
		write('AGENTS.md', '# Agents\n\n<!-- kb:global -->\n<!-- /kb:global -->\n');
		await check(ctx, 'gen');
		expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('### Before changing: ask why, and keep one fact in one place');
		expect(await errors()).toEqual([]);
	});
});

describe('vitepress', () => {
	test('sidebar and data come from frontmatter and files', () => {
		const old = decisions.create(ctx, { title: 'Old', date: '2026-09-01', livesIn: ['billing.md#refunds'] });
		decisions.create(ctx, { title: 'New', date: '2026-10-01', livesIn: ['billing.md#refunds'], supersedes: [old.id] });
		questions.add(ctx, { title: 'Who signs?', group: 'client', context: ['billing.md'] });
		expect(kbSidebar(root, ctx.config)).toEqual([
			{ text: 'Home', link: '/' },
			{ text: 'Product', items: [{ text: 'Billing', link: '/billing' }] }
		]);
		const data = kbData(root, ctx.config);
		expect(data.byPage['billing.md'].decisions.map((d) => [d.title, d.section])).toEqual([['New', 'Refunds']]);
		expect(data.byPage['billing.md'].questions.map((q) => q.title)).toEqual(['Who signs?']);
		expect(data.decisions.find((d) => d.title === 'Old')?.active).toBe(false);
		expect(data.questionGroups.map((g) => [g.key, g.items.length])).toEqual([
			['client', 1],
			['tech', 0]
		]);
	});
	test('a section gets a sidebar of its own, keyed by its prefix; the root keeps the rest', () => {
		const config = defineConfig({ docs: { groups: ['Student', 'Product'], sections: [{ prefix: 'manual/', title: 'Manual', groups: ['Student'] }] } });
		write('docs/manual/index.md', '---\ntitle: Manual\nsummary: for the team\n---\n\n# Manual\n');
		write('docs/manual/signup.md', doc('Signup', 'Student', '# Signup\n'));
		expect(kbSidebar(root, config)).toEqual({
			'/manual/': [
				{ text: 'Manual', link: '/manual/' },
				{ text: 'Student', items: [{ text: 'Signup', link: '/manual/signup' }] }
			],
			'/': [
				{ text: 'Home', link: '/' },
				{ text: 'Product', items: [{ text: 'Billing', link: '/billing' }] }
			]
		});
		expect(kbData(root, config).sections).toEqual(config.docs.sections);
	});
	test('the data the theme provides reaches components holding another copy of the key module', async () => {
		// `vitepress dev` pre-bundles the theme with its own copy of vitepress/key.ts, while the .vue files load the source
		const theme = await import('../vitepress/key');
		const copy = '../vitepress/key.ts?copy';
		const source = (await import(copy)) as typeof theme;
		expect(source).not.toBe(theme);
		const data = kbData(root, ctx.config);
		expect(createApp({}).provide(theme.KB, data).runWithContext(source.useKb)).toBe(data);
	});
});

function spawn(cmd: string, args: string[]) {
	Bun.spawnSync([cmd, ...args], { cwd: root });
}

describe('ids and links', () => {
	test('--id gives a short file name; an id without letters is refused', () => {
		const q = questions.add(ctx, { title: 'Who signs the invoices, and when?', group: 'client', id: 'invoice-signer' });
		expect(q.id).toBe('invoice-signer');
		const d = decisions.create(ctx, { title: 'Finance signs invoices', date: '2026-10-03', id: 'Invoice Signing' });
		expect(d.id).toBe('2026-10-03-invoice-signing');
		expect(() => questions.add(ctx, { title: '???', group: 'client' })).toThrow('at least one letter');
	});

	test('resolving through a decision moves the links in docs and code; without one, reports what is left', () => {
		ctx = context(root, { ...ctx.config, code: { glob: 'src/**/*.ts' } });
		const q = questions.add(ctx, { title: 'Who signs?', group: 'client', id: 'who-signs' });
		write('docs/billing.md', doc('Billing', 'Product', '# Billing\n\n## Refunds\n\nOpen: [who signs](./questions/who-signs.md).\n'));
		write('src/a.ts', '// see docs/questions/who-signs.md\n');
		const d = decisions.create(ctx, { title: 'Finance signs', date: '2026-10-03', id: 'finance-signs' });
		const r = questions.resolve(ctx, q.id, d.id);
		expect(r.repointed.sort()).toEqual(['docs/billing.md', 'src/a.ts']);
		expect(r.left).toEqual([]);
		expect(readFileSync(join(root, 'docs/billing.md'), 'utf8')).toContain('[who signs](./decisions/2026-10-03-finance-signs.md)');
		expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toContain('docs/decisions/2026-10-03-finance-signs.md');

		const q2 = questions.add(ctx, { title: 'Moot', group: 'tech', id: 'moot' });
		write('src/b.ts', '// docs/questions/moot.md\n');
		const r2 = questions.resolve(ctx, q2.id);
		expect(r2.left).toEqual([{ file: 'src/b.ts', line: 1 }]);
	});

	test('search tolerates singular and plural, both ways', () => {
		decisions.create(ctx, { title: 'Cupons por loja', date: '2026-10-01', fields: ['a', 'b', 'c'], livesIn: ['billing.md'] });
		decisions.create(ctx, { title: 'Decisão sobre reembolso', date: '2026-10-02', fields: ['a', 'b', 'c'], livesIn: ['billing.md'] });
		const ids = (q: string) => search(ctx, [q]).filter((h) => h.kind === 'decision').map((h) => h.id);
		expect(ids('cupom')).toEqual(['2026-10-01-cupons-por-loja']);
		expect(ids('decisoes')).toEqual(['2026-10-02-decisao-sobre-reembolso']);
		expect(ids('reembolsos')).toEqual(['2026-10-02-decisao-sobre-reembolso']);
	});

	test('a current decision that lives nowhere gets a warning', async () => {
		decisions.create(ctx, { title: 'Nowhere', date: '2026-10-01', fields: ['a', 'b', 'c'] });
		const warns = (await check(ctx)).filter((p) => p.level === 'warn').map((p) => p.message);
		expect(warns.some((w) => w.startsWith('lives_in is empty'))).toBe(true);
	});
});

describe('decision body', () => {
	const warnings = async () => (await check(ctx)).filter((p) => p.level === 'warn').map((p) => `${p.where}: ${p.message}`);

	test('a label the project allows passes; any other label warns at its line', async () => {
		ctx = context(root, { ...ctx.config, decisions: { ...ctx.config.decisions, extraLabels: ['Cost accepted'] } });
		const d = decisions.create(ctx, { title: 'Refunds', date: '2026-10-01', livesIn: ['billing.md#refunds'], fields: ['a', 'b', 'c'] });
		writeFileSync(d.file, `${readFileSync(d.file, 'utf8')}\n**cost accepted:** chargebacks.\n\n**Pending:** rename in code.\n\n\`\`\`\n**Example:** in code\n\`\`\`\n`);
		const out = (await warnings()).filter((w) => w.includes('decision label'));
		expect(out).toHaveLength(1);
		expect(out[0]).toStartWith(`docs/decisions/${d.id}.md:17: **Pending:** is not a decision label`);
		expect(out[0]).toContain('kb question add');
	});

	test('a superseded decision is history: its labels pass', async () => {
		const old = decisions.create(ctx, { title: 'Old', date: '2026-09-01', livesIn: ['billing.md#refunds'], fields: ['a', 'b', 'c'] });
		writeFileSync(old.file, `${readFileSync(old.file, 'utf8')}\n**Status:** proposed.\n`);
		expect((await warnings()).some((w) => w.includes('**Status:**'))).toBe(true);
		decisions.create(ctx, { title: 'New', date: '2026-10-01', livesIn: ['billing.md#refunds'], fields: ['a', 'b', 'c'], supersedes: [old.id] });
		expect((await warnings()).some((w) => w.includes('**Status:**'))).toBe(false);
	});

	// a warning that only said "empty" got filled with "the alternatives were not recorded"
	test('an empty Rejected says where the why goes when there was no alternative, in kb check and in kb decision new', async () => {
		const d = decisions.create(ctx, { title: 'Refunds', date: '2026-10-01', livesIn: ['billing.md#refunds'], fields: ['a', 'b'] });
		const said = 'a decision names the alternative it turned down; with none, its why goes in a code comment or the topic doc, not a decision';
		expect(await warnings()).toContain(`docs/decisions/${d.id}.md: **Rejected:** missing or empty: ${said}`);
		write('kb.config.ts', `export default ${JSON.stringify({ docs: { groups: ['Product'] } })};\n`);
		const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'decision', 'new', ...args], { cwd: root }).stdout.toString();
		expect(run('Invoices monthly', '--decision', 'a', '--why', 'b', '--lives-in', 'billing.md#invoices')).toContain(`Rejected: ${said}`);
		expect(run('Invoices by email', '--decision', 'a', '--why', 'b', '--rejected', 'by post (slow)', '--lives-in', 'billing.md#invoices')).not.toContain(said);
	});
});

describe('dates', () => {
	test('addDays counts calendar days, across a month, a year and a daylight-saving change', () => {
		expect([addDays('2026-03-02', -7), addDays('2026-01-03', -7), addDays('2025-12-31', 1)]).toEqual(['2026-02-23', '2025-12-27', '2026-01-01']);
		// bun test runs in UTC: the change needs a zone that has one
		const code = `import { addDays } from ${JSON.stringify(join(import.meta.dir, 'dates.ts'))}; console.log(addDays('2026-04-01', -7), addDays('2026-10-25', 1));`;
		const berlin = Bun.spawnSync(['bun', '-e', code], { env: { ...process.env, TZ: 'Europe/Berlin' } });
		expect(berlin.stdout.toString()).toBe('2026-03-25 2026-10-26\n');
	});
});

describe('question review', () => {
	const daysAgo = (n: number) => addDays(today(), -n);
	const stale = async () => (await check(ctx)).filter((p) => p.level === 'warn' && p.where.startsWith('docs/questions/')).map((p) => `${p.where}: ${p.message}`);

	test('review writes the date, and the stale warning counts from it', async () => {
		const q = questions.add(ctx, { title: 'Who signs?', group: 'client', owner: 'the finance lead', id: 'who-signs', since: daysAgo(60) });
		expect(await stale()).toEqual(['docs/questions/who-signs.md: open for 60 days, never reviewed (the finance lead): check it with whoever unblocks it, then kb question review who-signs']);

		questions.review(ctx, { ids: ['who-signs'] });
		expect(readFileSync(q.file, 'utf8')).toContain(`since: ${daysAgo(60)}\nreviewed: ${daysAgo(0)}\n`);
		expect(await stale()).toEqual([]);
		expect(kbData(root, ctx.config).questionGroups[0].items[0]).toMatchObject({ since: daysAgo(60), reviewed: daysAgo(0), age: 60, idle: 0 });

		questions.review(ctx, { ids: ['who-signs'], date: daysAgo(45) });
		expect((await stale())[0]).toContain(`last reviewed ${daysAgo(45)}, 45 days ago (the finance lead)`);
	});

	test('a group is reviewed at once; a bad group or date is refused', () => {
		questions.add(ctx, { title: 'Who signs?', group: 'client', id: 'a' });
		questions.add(ctx, { title: 'Which card?', group: 'client', id: 'b' });
		questions.add(ctx, { title: 'Which queue?', group: 'tech', id: 'c' });
		expect(questions.review(ctx, { group: 'client', date: '2026-10-14' }).map((q) => q.id)).toEqual(['a', 'b']);
		expect(questions.loadQuestions(ctx).map((q) => [q.id, q.reviewed])).toEqual([
			['a', '2026-10-14'],
			['b', '2026-10-14'],
			['c', '']
		]);
		expect(() => questions.review(ctx, { group: 'nope' })).toThrow('group must be one of');
		expect(() => questions.review(ctx, { ids: ['c'], date: '14/10/2026' })).toThrow('YYYY-MM-DD');
		expect(() => questions.review(ctx, {})).toThrow('name a question id or --group');
	});
});

describe('questions a decision may answer', () => {
	const ask = () => {
		questions.add(ctx, {
			title: 'Coupon: its use counter never moves; the checkout must count uses atomically',
			group: 'tech',
			id: 'coupon-uses',
			owner: 'the tech lead',
			unblocks: 'coupon limits',
			context: ['billing.md#invoices'],
			details: 'The use counter of a coupon starts at 0 and nothing increments it, so its limit never refuses a use. Two people at the same instant must not pass the limit.'
		});
		questions.add(ctx, { title: 'Who signs the invoices?', group: 'client', id: 'who-signs', context: ['billing.md#invoices'], details: 'Finance or the director: the invoice template needs a name.' });
		questions.add(ctx, { title: 'Which font does the public site use?', group: 'tech', id: 'site-font', details: 'The designer sent two options; the header looks heavy with the current one.' });
	};
	const counting = {
		title: 'The coupon counts a use at submission, in one atomic update',
		date: '2026-10-03',
		id: 'coupon-counted',
		livesIn: ['billing.md#refunds'],
		fields: ['Submitting counts one use of the coupon with an atomic update, so two people at once never pass its limit.', 'Counting at payment lets the limit overflow between submission and payment.', 'Count at payment · read and write the counter in the app.']
	};

	test('finds the open question that shares the decision subject, and leaves the rest', () => {
		ask();
		const d = decisions.create(ctx, counting);
		expect(answerable(ctx, d).map((c) => c.question.id)).toEqual(['coupon-uses']);
	});

	test('a decision that builds around the answer, in the same doc section, is no answer to it', () => {
		ask();
		const d = decisions.create(ctx, { title: 'Each invoice shows who signs it, from a field in the backoffice', date: '2026-10-03', livesIn: ['billing.md#invoices'], fields: ['a', 'b', 'c'] });
		expect(answerable(ctx, d)).toEqual([]);
	});

	test('kb decision new prints the command that closes it; with --resolves it does not', () => {
		ask();
		write('kb.config.ts', `export default ${JSON.stringify({ docs: { groups: ['Product'] }, questions: { groups: { client: 'c', tech: 't' } } })};\n`);
		const cli = join(import.meta.dir, 'cli.ts');
		const run = (...args: string[]) => Bun.spawnSync(['bun', cli, ...args], { cwd: root }).stdout.toString();
		const fields = ['--decision', counting.fields[0], '--why', counting.fields[1], '--rejected', counting.fields[2]];
		const out = run('decision', 'new', counting.title, '--date', '2026-10-03', '--id', 'coupon-counted', ...fields);
		expect(out).toContain('open questions this decision may answer. It answers one only if it says what the question asks; one that builds around the answer leaves it open:');
		expect(out).toContain('  coupon-uses · waits on the tech lead · unblocks coupon limits\n');
		expect(out).toContain('kb question resolve coupon-uses --decision 2026-10-03-coupon-counted');
		expect(out).not.toContain('site-font');
		const linked = run('decision', 'new', counting.title, '--date', '2026-10-04', '--resolves', 'coupon-uses', ...fields);
		expect(linked).toContain('resolved coupon-uses');
		expect(linked).not.toContain('may answer');
	});
});

describe('decision revisit', () => {
	const due = async () => (await check(ctx)).filter((p) => p.message.includes('revisit')).map((p) => `${p.level} ${p.where}: ${p.message}`);
	const base = { livesIn: ['billing.md#refunds'], fields: ['a', 'b (until the volume justifies it)', 'c'] };

	test('--revisit writes the date; kb check warns from that day on, never on a superseded decision', async () => {
		const later = decisions.create(ctx, { ...base, title: 'Later', date: '2026-10-01', revisit: '2999-01-01' });
		expect(readFileSync(later.file, 'utf8')).toStartWith('---\ndate: 2026-10-01\nrevisit: 2999-01-01\n');
		const old = decisions.create(ctx, { ...base, title: 'Old', date: '2026-07-01', revisit: '2026-07-28' });
		const out = await due();
		expect(out).toHaveLength(1);
		expect(out[0]).toStartWith(`warn docs/decisions/${old.id}.md: revisit date 2026-07-28 has come (`);
		expect(out[0]).toContain(`kb decision revisit ${old.id} --next <date> (or --done)`);
		expect(decisions.loadDecisions(ctx).filter((d) => decisions.isDue(d)).map((d) => d.id)).toEqual([old.id]);

		decisions.create(ctx, { ...base, title: 'Replaced', date: '2026-10-02', supersedes: [old.id] });
		expect(await due()).toEqual([]);
	});

	test('revisit moves the date or clears it; a bad date is refused', async () => {
		const d = decisions.create(ctx, { ...base, title: 'Card only', date: '2026-07-01', revisit: '2026-07-28' });
		expect(decisions.revisit(ctx, d.id, '2999-01-01').revisit).toBe('2999-01-01');
		expect(await due()).toEqual([]);
		decisions.revisit(ctx, d.id, '');
		expect(readFileSync(d.file, 'utf8')).not.toContain('revisit');
		expect(() => decisions.revisit(ctx, d.id, 'next year')).toThrow('YYYY-MM-DD');
		expect(() => decisions.create(ctx, { ...base, title: 'X', revisit: '28/07' })).toThrow('YYYY-MM-DD');
		write(`docs/decisions/${d.id}.md`, readFileSync(d.file, 'utf8').replace('date: 2026-07-01', 'date: 2026-07-01\nrevisit: soon'));
		expect(await due()).toEqual([`error docs/decisions/${d.id}.md: \`revisit\` must be YYYY-MM-DD`]);
	});

	test('kb decision list --due shows only the decisions whose day has come', () => {
		decisions.create(ctx, { ...base, title: 'Due one', date: '2026-07-01', revisit: '2026-07-28' });
		decisions.create(ctx, { ...base, title: 'Not yet', date: '2026-07-02', revisit: '2999-01-01' });
		decisions.create(ctx, { ...base, title: 'No date', date: '2026-07-03' });
		write('kb.config.ts', 'export default {};\n');
		const out = Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'decision', 'list', '--due'], { cwd: root }).stdout.toString();
		expect(out).toBe('2026-07-01-due-one\n  Due one\n  → billing.md#refunds · revisit 2026-07-28 (due)\n');
	});
});

describe('cli', () => {
	test('--version, version, --help and no command work outside a project; a missing config is one line', () => {
		const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], { cwd: root });
		const { version } = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8'));
		expect(run('--version').stdout.toString()).toBe(`kb ${version}\n`);
		expect(run('version').stdout.toString()).toBe(`kb ${version}\n`);
		expect(run('--help').stdout.toString()).toStartWith('kb: project knowledge');
		expect(run().stdout.toString()).toStartWith('kb: project knowledge');
		const missing = run('decision', 'list');
		expect(missing.exitCode).toBe(1);
		expect(missing.stderr.toString()).toBe('kb: kb.config.ts not found here or above (kb init creates one)\n');
	});
	test('a bad flag or a failing init is one line, never a stack trace', () => {
		const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], { cwd: root });
		const unknown = run('--foo');
		expect(unknown.exitCode).toBe(1);
		expect(unknown.stderr.toString()).toBe('kb: unknown option --foo (kb --help)\n');
		expect(run('question', 'add', 'x', '--group').stderr.toString()).toBe("kb: option '--group <value>' argument missing (kb --help)\n");
		// a config that fails to load makes init fail
		write('kb.config.ts', 'throw new Error("broken config");\n');
		const init = run('init');
		expect(init.exitCode).toBe(1);
		expect(init.stderr.toString()).toBe('kb: broken config\n');
	});
	test('a command that writes brings the shared rules up to date; one that reads leaves them', () => {
		const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], { cwd: root });
		const stale = '# Agents\n\n<!-- kb:global -->\nold\n<!-- /kb:global -->\n\n# This project\n';
		const agents = () => readFileSync(join(root, 'AGENTS.md'), 'utf8');
		write('kb.config.ts', "export default { questions: { groups: { client: 'With the client' } }, agents: { modules: ['core'] } };\n");
		write('AGENTS.md', stale);
		expect(run('question', 'list').exitCode).toBe(0);
		expect(run('search', 'refunds').exitCode).toBe(0);
		expect(agents()).toBe(stale);

		const added = run('question', 'add', 'Who approves a refund?', '--group', 'client');
		expect(added.stdout.toString()).toContain('AGENTS.md: shared rules updated');
		expect(agents()).toContain('### Before changing: ask why, and keep one fact in one place');
		expect(agents()).toEndWith('<!-- /kb:global -->\n\n# This project\n');
		// current already: nothing to say
		expect(run('question', 'review', 'who-approves').stdout.toString()).not.toContain('AGENTS.md');
		// a command that fails writes nothing
		write('AGENTS.md', stale);
		expect(run('question', 'review', 'nobody-asked-this').exitCode).toBe(1);
		expect(agents()).toBe(stale);
	});
});

describe('guide', () => {
	const GUIDE = `# Manual

How to build a manual. More after this.

## The page

Every project.

## GitHub Pages
<!-- when: publish=pages -->

A workflow publishes it.

## Behind a login
<!-- when: access=private auth=app,password -->

The app serves it.

## With VitePress
<!-- when: vitepress=true -->

A section of the site:

\`\`\`md
## Not a chapter
\`\`\`

## Without VitePress
<!-- when: vitepress=no -->

Plain markdown.
`;
	const show = (choices?: Record<string, unknown>, all = false) => guides.render(GUIDE, 'manual', choices, all);

	test('shows the chapters for every project and the ones whose when matches; names the rest', () => {
		const out = show({ publish: 'pages', access: 'public', vitepress: false });
		expect(out).toContain('## The page');
		expect(out).toContain('## GitHub Pages\n\nA workflow publishes it.');
		expect(out).not.toContain('## Behind a login');
		expect(out).not.toContain('## With VitePress');
		expect(out).not.toContain('<!-- when');
		expect(out).toContain('## Without VitePress');
		expect(out).not.toContain('## Not a chapter');
		expect(out).toEndWith('other paths (kb guide manual --all): Behind a login, With VitePress\n');
	});
	test('a list of values matches any of them; every key must match; an unchosen key matches', () => {
		expect(show({ access: 'private', auth: 'password', publish: 'app' })).toContain('## Behind a login');
		expect(show({ access: 'private', auth: 'github', publish: 'app' })).not.toContain('## Behind a login');
		expect(show({ access: 'public', auth: 'app', publish: 'app' })).not.toContain('## Behind a login');
		expect(show({ publish: 'app', vitepress: true })).toContain('## With VitePress');
		expect(show({ publish: 'app', vitepress: true })).toContain('```md\n## Not a chapter\n```');
		expect(show({ publish: 'app', vitepress: true })).not.toContain('## Without VitePress');
		expect(show({ publish: 'app' })).toContain('## Behind a login');
	});
	test('a choice of several values matches when one of them is listed', () => {
		expect(show({ access: 'private', auth: ['github', 'password'] })).toContain('## Behind a login');
		expect(show({ access: 'private', auth: ['github', 'other'] })).not.toContain('## Behind a login');
	});
	test('without choices, or with --all, the whole guide without the markers', () => {
		for (const out of [show(), show({ publish: 'app' }, true)]) {
			expect(out).toContain('## GitHub Pages');
			expect(out).toContain('## Behind a login');
			expect(out).not.toContain('<!-- when');
			expect(out).not.toContain('other paths');
		}
	});
	test('the list of guides carries the first sentence of each', () => {
		write('guides/manual.md', GUIDE);
		expect(guides.topics(join(root, 'guides'))).toEqual([{ topic: 'manual', summary: 'How to build a manual.' }]);
		expect(() => guides.readGuide('nope', join(root, 'guides'))).toThrow('no guide "nope" (kb guide lists them)');
	});
	test('kb guide works outside a project', () => {
		const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], { cwd: root });
		expect(run('guide').exitCode).toBe(0);
		const unknown = run('guide', 'nope');
		expect(unknown.exitCode).toBe(1);
		expect(unknown.stderr.toString()).toBe('kb: no guide "nope" (kb guide lists them)\n');
	});
});

describe('core rules', () => {
	test('each section names the moment an agent meets its rules; the flags stay in --help and the method in a guide', () => {
		const block = globalBlock(['core']);
		expect(block.split('\n').filter((l) => l.startsWith('### '))).toEqual([
			'### Before changing: ask why, and keep one fact in one place',
			'### While working: docs, comments and the session',
			'### Before calling it done: evidence, kb check, the commit',
			'### With the person'
		]);
		expect(block).toContain('`bun kb --help` has the commands; `kb guide decisions`, the method');
		expect(block).not.toMatch(/--(?!help)[a-z]/);
		expect(guides.readGuide('decisions')).toContain('--rejected "<the alternatives and why not>" --lives-in <doc.md#section>');
	});
});

describe('manual rules', () => {
	test('cite the project\'s manual folder and screenshot command; without them, the general words', () => {
		expect(globalBlock(['manual'])).toContain('changes its page and its script in the same commit');
		expect(globalBlock(['manual'])).toContain('- Screenshots come from the script, with assertions');
		const config = defineConfig({ docs: { dir: 'site' }, manual: { dir: 'help', run: 'bun run shots' } });
		expect(globalBlock(['manual'], config)).toBe(`### Manual

- A change to a screen the manual covers changes its page in \`site/help/\` and its script in the same commit; a new screen gets its page before the merge, or goes on the debt list.
- Screenshots come from \`bun run shots\`, with assertions and synthetic data; never by hand.
- Starting the manual or changing how it is published: ask the person the questions of \`kb manual setup\`, then run it. How the pieces fit: \`kb guide manual\`.`);
		expect(globalBlock(['core', 'manual'], config)).not.toContain('{{');
	});
	test('kb manual setup writes the block, and the rules come along with its names', () => {
		write('kb.config.ts', "export default {\n\tdocs: { groups: ['Product'] },\n\tagents: { modules: ['core', 'manual'] }\n};\n");
		write('AGENTS.md', '# Agents\n\n<!-- kb:global -->\nold\n<!-- /kb:global -->\n');
		const flags = ['--audience', 'the team', '--access', 'public', '--publish', 'pages', '--site', 'manual', '--screen', 'route', '--shots', 'ci', '--run', 'bun run shots', '--vitepress', 'yes'];
		const out = Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'manual', 'setup', ...flags], { cwd: root }).stdout.toString();
		expect(readFileSync(join(root, 'kb.config.ts'), 'utf8')).toContain("\t\trun: 'bun run shots',\n");
		expect(out).toContain('AGENTS.md: shared rules updated');
		expect(out).not.toContain("agents.modules in kb.config.ts gets 'manual'");
		const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
		expect(agents).toContain('changes its page in `docs/manual/` and its script');
		expect(agents).toContain('Screenshots come from `bun run shots`');
	});
});

describe('manual pieces', () => {
	const PAGE = (body = '') => doc('Payment', 'Product', `# Payment\n\n## Screens\n\n<!-- generated:screens -->\n<!-- /generated:screens -->\n${body}`);
	const LIST = { pages: { payment: { screens: ['/pay'], shots: [{ id: 'card', caption: 'The card form' }, { id: 'pix', caption: 'Pix [QR]' }] } }, debt: [] as string[] };
	const manualCtx = (manual: Record<string, unknown>) => context(root, defineConfig({ docs: { groups: ['Product'] }, manual: { list: () => LIST, ...manual } }));
	const problems = async (c: Ctx) => (await check(c)).filter((p) => p.level === 'error').map((p) => `${p.where}: ${p.message}`);
	const page = () => readFileSync(join(root, 'docs/manual/payment.md'), 'utf8');

	test('kb gen writes each page\'s Screens block from the list: site root under VitePress, relative without it', async () => {
		write('docs/manual/payment.md', PAGE());
		await check(manualCtx({ vitepress: true }), 'gen');
		expect(page()).toContain('<!-- generated:screens -->\n![The card form](/screens/payment/card.png)\n\n*The card form*\n\n![Pix \\[QR\\]](/screens/payment/pix.png)\n\n*Pix [QR]*\n<!-- /generated:screens -->');
		write('docs/manual/payment.md', PAGE());
		await check(manualCtx({ vitepress: false, images: 'manual/screens' }), 'gen');
		expect(page()).toContain('![The card form](./screens/payment/card.png)');
		write('docs/manual/payment.md', PAGE());
		expect(await problems(manualCtx({ vitepress: true }))).toContain('docs/manual/payment.md: block "screens" is out of date (run kb gen)');
		write('docs/manual/payment.md', doc('Payment', 'Product', '# Payment\n'));
		expect(await problems(manualCtx({ vitepress: true }))).toContain('docs/manual/payment.md: marker <!-- generated:screens --> missing');
	});
	test('kb check holds pages, list and the product\'s screens together', async () => {
		write('docs/manual/payment.md', PAGE());
		write('docs/manual/stray.md', doc('Stray', 'Product', '# Stray\n'));
		const list = { pages: { ...LIST.pages, ghost: { screens: ['/ghost'], shots: [] } }, debt: ['/later', '/gone', '/pay'] };
		const c = context(root, defineConfig({ docs: { groups: ['Product'] }, manual: { vitepress: true, list: async () => list, screens: (from) => (from === root ? ['/pay', '/new', '/later'] : []), scripts: 'e2e/shots/{page}.spec.ts' } }));
		await check(c, 'gen');
		const out = await problems(c);
		const LIST_AT = 'manual.list (kb.config.ts)';
		expect(out).toContain("docs/manual/stray.md: no entry in the manual's list, manual.list (kb.config.ts)");
		expect(out).toContain(`${LIST_AT}: page "ghost" has no file docs/manual/ghost.md`);
		expect(out).toContain(`${LIST_AT}: screen \`/new\` has no page in the manual: claim it in a page's screens, or put it on the debt list`);
		expect(out).toContain(`${LIST_AT}: screen \`/ghost\`, claimed by "ghost", is not in the product`);
		expect(out).toContain(`${LIST_AT}: screen \`/gone\` on the debt list is not in the product`);
		expect(out).toContain(`${LIST_AT}: screen \`/pay\` on the debt list has a page ("payment"): take it off the debt list`);
		expect(out).not.toContain(`${LIST_AT}: screen \`/later\` has no page in the manual: claim it in a page's screens, or put it on the debt list`);
		expect(out).toContain('docs/manual/payment.md: no script e2e/shots/payment.spec.ts');
		write('e2e/shots/payment.spec.ts', '');
		expect((await problems(c)).some((e) => e.includes('no script'))).toBe(false);
	});
	test('with the file the list says it lives in, problems point at the line that names the page or screen', async () => {
		write('docs/manual/payment.md', PAGE());
		write('docs/manual/stray.md', doc('Stray', 'Product', '# Stray\n'));
		const file = 'e2e/shots/screens.ts';
		write(file, "export const debt = ['/later', '/gone', '/pay'];\nexport const pages = {\n\tpayment: { screens: ['/pay'], shots: [] },\n\t'ghost': { screens: ['/ghost'], shots: [] }\n};\n");
		const list = { file, pages: { ...LIST.pages, ghost: { screens: ['/ghost'], shots: [] } }, debt: ['/later', '/gone', '/pay'] };
		const c = context(root, defineConfig({ docs: { groups: ['Product'] }, manual: { vitepress: true, list: () => list, screens: () => ['/pay', '/new', '/later'] } }));
		await check(c, 'gen');
		expect((await problems(c)).filter((e) => !e.includes('no script'))).toEqual([
			`docs/manual/stray.md: no entry in the manual's list, ${file}`,
			`${file}:4: page "ghost" has no file docs/manual/ghost.md`,
			`${file}: screen \`/new\` has no page in the manual: claim it in a page's screens, or put it on the debt list`,
			`${file}:4: screen \`/ghost\`, claimed by "ghost", is not in the product`,
			`${file}:1: screen \`/gone\` on the debt list is not in the product`,
			`${file}:1: screen \`/pay\` on the debt list has a page ("payment"): take it off the debt list`
		]);
		list.file = 'e2e/shots/moved.ts';
		expect(await problems(c)).toContain('manual.list (kb.config.ts): file e2e/shots/moved.ts does not exist');
	});
	test('committed screenshots must be there', async () => {
		write('docs/manual/payment.md', PAGE());
		const c = manualCtx({ vitepress: true, shots: 'committed', run: 'bun run shots' });
		await check(c, 'gen');
		expect(await problems(c)).toContain('docs/manual/payment.md: screenshot docs/public/screens/payment/card.png is missing (bun run shots writes it)');
		write('docs/public/screens/payment/card.png', 'png');
		write('docs/public/screens/payment/pix.png', 'png');
		expect(await problems(c)).toEqual([]);
	});
	test('a missing screenshot shows as a frame off CI; in CI the build fails naming it and the command', () => {
		const config = defineConfig({ docs: { groups: ['Product'] }, manual: { run: 'bun run shots' } });
		write('docs/public/screens/payment/card.png', 'png');
		const ci = process.env.CI;
		try {
			delete process.env.CI;
			const plugin = kbMissingScreens(root, config);
			expect(plugin.resolveId('/screens/payment/card.png')).toBeUndefined();
			expect(plugin.resolveId('/logo.png')).toBeUndefined();
			const id = plugin.resolveId('/screens/payment/pix.png');
			expect(id).toBe('\0kb-missing-screen:/screens/payment/pix');
			const svg = decodeURIComponent(JSON.parse(plugin.load(id as string)!.replace('export default ', '')));
			expect(svg).toContain('Screenshot not generated yet');
			expect(svg).toContain('bun run shots');
			const warned: string[] = [];
			const context = {
				warn: (m: string) => void warned.push(m),
				error: (m: string): never => {
					throw new Error(m);
				}
			};
			plugin.buildEnd.call(context);
			expect(warned).toEqual(['1 manual screenshot(s) not generated yet (bun run shots): /screens/payment/pix.png']);
			process.env.CI = 'true';
			const inCi = kbMissingScreens(root, config);
			for (const page of ['pix', 'boleto', 'card']) inCi.resolveId(`/screens/payment/${page}.png`);
			expect(() => inCi.buildEnd.call(context)).toThrow('2 manual screenshot(s) missing (`bun run shots` writes them before the build): /screens/payment/pix.png, /screens/payment/boleto.png');
			// a build that already failed says only why it did
			expect(() => inCi.buildEnd.call(context, new Error('other'))).not.toThrow();
		} finally {
			if (ci === undefined) delete process.env.CI;
			else process.env.CI = ci;
		}
	});
	test('a build of the manual alone leaves out every other top-level entry of the docs', () => {
		write('docs/manual/payment.md', PAGE());
		write('docs/public/logo.png', 'png');
		write('docs/.vitepress/config.mts', '');
		write('docs/decisions/index.md', '# Decisions\n');
		expect(kbManualOnly(root, defineConfig({ manual: {} }))).toEqual(['billing.md', 'decisions/**', 'index.md']);
	});
});

describe('manual new', () => {
	const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'manual', 'new', ...args], { cwd: root });
	const CONFIG = (manual: string) =>
		`export default {\n\tdocs: { groups: ['Student', 'Product'], sections: [{ prefix: 'manual/', title: 'Manual', groups: ['Student'] }] },\n\tagents: { modules: ['core', 'manual'] },\n\tmanual: { ${manual} }\n};\n`;

	test('starts a page in kb\'s shape, in one of the manual\'s groups, with the next step', () => {
		write('kb.config.ts', CONFIG("scripts: 'e2e/shots/{page}.spec.ts'"));
		write('docs/manual/signup.md', doc('Signup', 'Student', '# Signup\n'));
		write('AGENTS.md', '# Agents\n\n<!-- kb:global -->\nold\n<!-- /kb:global -->\n');
		const r = run('Paying by card', '--group', 'Student');
		expect(r.exitCode).toBe(0);
		expect(r.stdout.toString()).toStartWith(
			'created docs/manual/paying-by-card.md\nnext: fill in its summary (frontmatter) and sections; add "paying-by-card" to the manual\'s list with its screens and shots; write its script e2e/shots/paying-by-card.spec.ts\n'
		);
		expect(r.stdout.toString()).toContain('AGENTS.md: shared rules updated');
		const text = readFileSync(join(root, 'docs/manual/paying-by-card.md'), 'utf8');
		expect(text).toStartWith('---\ntitle: Paying by card\ngroup: Student\norder: 2\n---\n\n# Paying by card\n');
		expect(text).toContain('## Common questions\n\n## Screens\n\n<!-- generated:screens -->\n<!-- /generated:screens -->\n');
		expect(run('Paying by card', '--group', 'Student').stderr.toString()).toBe('kb: docs/manual/paying-by-card.md already exists\n');
		expect(run('Refunds', '--group', 'Product').stderr.toString()).toBe('kb: --group must be one of: Student\n');
	});
	test('takes the project\'s template when it has one', () => {
		write('kb.config.ts', CONFIG("template: 'docs/manual/.page.md'"));
		write('docs/manual/.page.md', '---\ntitle: {{title}}\ngroup: {{group}}\norder: {{order}}\n---\n\n# {{title}}\n\n## Passo a passo\n');
		expect(run('Pagamento', '--group', 'Student', '--id', 'pagamento', '--order', '3').exitCode).toBe(0);
		expect(readFileSync(join(root, 'docs/manual/pagamento.md'), 'utf8')).toBe('---\ntitle: Pagamento\ngroup: Student\norder: 3\n---\n\n# Pagamento\n\n## Passo a passo\n');
	});
	test('needs the manual block', () => {
		write('kb.config.ts', "export default { docs: { groups: ['Student'] } };\n");
		expect(run('Signup', '--group', 'Student').stderr.toString()).toBe('kb: no manual block in kb.config.ts (kb manual setup writes one)\n');
	});
});

describe('manual setup', () => {
	const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'manual', 'setup', ...args], { cwd: root });
	const config = () => readFileSync(join(root, 'kb.config.ts'), 'utf8');
	const ALL = ['--audience', 'the team', '--access', 'private', '--auth', 'app', '--publish', 'app', '--site', 'all', '--screen', 'route', '--shots', 'ci', '--vitepress', 'yes'];
	const PLAIN = "export default {\n\tdocs: { groups: ['Product'] }\n};\n";
	const WITH_MANUAL = "export default {\n\tmanual: { audience: 'the team', access: 'private', auth: 'app', publish: 'app', site: 'all', screen: 'route', shots: 'ci', vitepress: true },\n\tdocs: { groups: ['Product'] }\n};\n";

	test('without a terminal, lists the open questions for the agent to ask and writes nothing', () => {
		write('kb.config.ts', PLAIN);
		const r = run('--access', 'public');
		expect(r.exitCode).toBe(0);
		const out = r.stdout.toString();
		expect(out).toStartWith('Who reads the manual?  --audience "<text>"\n');
		expect(out).not.toContain('How does a reader get in?');
		expect(out).toContain('Where is it published?  --publish app|pages|host|repo\n  app: served by the app');
		expect(out).toContain('The command that writes every screenshot? (optional: the rules cite it)  --run "<command>"');
		expect(out).toEndWith('an agent asks the person these, one at a time with its recommendation, then runs kb manual setup with the answers\n');
		expect(config()).toBe(PLAIN);
	});
	test('with every answer, writes the block into a config without one, and proposes the decision', () => {
		write('kb.config.ts', PLAIN);
		const out = run(...ALL).stdout.toString();
		expect(out).toContain('kb.config.ts: manual block written');
		expect(config()).toBe(
			"export default {\n\tmanual: {\n\t\tdir: 'manual/',\n\t\taudience: 'the team',\n\t\taccess: 'private',\n\t\tauth: 'app',\n\t\tpublish: 'app',\n\t\tsite: 'all',\n\t\tscreen: 'route',\n\t\tshots: 'ci',\n\t\tvitepress: true\n\t},\n\tdocs: { groups: ['Product'] }\n};\n"
		);
		expect(out).toContain("docs.sections in kb.config.ts gets the manual: { prefix: 'manual/'");
		expect(out).toContain(`kb decision new "The manual is private, behind the app's login, served by the app"`);
		expect(out).toContain('--lives-in manual/index.md');
	});
	test('with a manual block, shows what changes and writes nothing; the decision it replaces is proposed', () => {
		write('kb.config.ts', WITH_MANUAL);
		write('docs/decisions/2026-10-06-the-manual-is-served-by-the-app.md', '---\ndate: 2026-10-06\nlives_in:\n  - manual/index.md\n---\n\n# The manual is served by the app\n');
		const out = run('--publish', 'pages', '--access', 'public', '--site', 'manual').stdout.toString();
		expect(out).toContain('  access: private → public\n  auth: app → (none)\n  publish: app → pages\n  site: all → manual\n');
		expect(out).toContain('replace the manual block in kb.config.ts with this:');
		expect(out).toContain('--supersedes 2026-10-06-the-manual-is-served-by-the-app');
		expect(config()).toBe(WITH_MANUAL);
		expect(run().stdout.toString()).toBe('kb.config.ts: the manual block already holds these answers\n');
		write('kb.config.ts', WITH_MANUAL.replace("vitepress: true }", "vitepress: true, scripts: 'e2e/{page}.ts' }"));
		expect(run('--publish', 'pages').stdout.toString()).toContain('keeping scripts as they are\n');
	});
	test('a private manual opens one way or more: one is written as a string, several as a list', () => {
		expect(defineConfig({ manual: { auth: 'app' } }).manual?.auth).toEqual(['app']);
		expect(defineConfig({ manual: {} }).manual?.auth).toBeUndefined();
		write('kb.config.ts', PLAIN);
		const both = ALL.map((a, i) => (ALL[i - 1] === '--auth' ? 'app,password' : a));
		const out = run(...both).stdout.toString();
		expect(config()).toContain("\t\tauth: ['app', 'password'],\n");
		expect(out).toContain(`kb decision new "The manual is private, behind the app's login or a password that opens only it, served by the app"`);
		write('kb.config.ts', PLAIN);
		run(...ALL);
		expect(config()).toContain("\t\tauth: 'app',\n");
		const bad = run('--auth', 'app,ftp');
		expect(bad.exitCode).toBe(1);
		expect(bad.stderr.toString()).toBe('kb: --auth must be one or more of app, password, github, other\n');
	});
	test('warns on a combination that costs something; refuses a value outside the options', () => {
		write('kb.config.ts', PLAIN);
		expect(run(...ALL, '--access', 'public').stdout.toString()).toContain('! a public site with the technical docs makes decisions and open questions public');
		write('kb.config.ts', PLAIN);
		const bad = run('--publish', 'ftp');
		expect(bad.exitCode).toBe(1);
		expect(bad.stderr.toString()).toBe('kb: --publish must be one of app, pages, host, repo\n');
		expect(run('--vitepress', 'maybe').stderr.toString()).toBe('kb: --vitepress must be one of yes, no\n');
	});
	test('kb guide manual shows the chapters for the choices in the config', () => {
		write('kb.config.ts', WITH_MANUAL);
		const out = Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'guide', 'manual'], { cwd: root }).stdout.toString();
		expect(out).toContain('## Published by the app');
		expect(out).not.toContain('## Published on GitHub Pages');
		expect(out).toContain('other paths (kb guide manual --all):');
		expect(out).not.toContain('<!-- when');
	});
});

describe('roadmap', () => {
	const PAGE = [
		'---',
		'title: Roadmap',
		'group: Product',
		'summary: what comes next',
		'---',
		'',
		'# Roadmap',
		'',
		'## Next: the first release',
		'',
		'### Payment',
		'Card and boleto checkout. Details: [billing](./billing.md#refunds).',
		'',
		'**Done when:** a customer pays in the sandbox.',
		'',
		'- [x] Customer created',
		'- [ ] Webhook confirms',
		'',
		'### Filters',
		'',
		'No line that says when.',
		'',
		'## Later',
		'',
		'- A loose wish',
		'',
		'### Catalog',
		'- Comparison page',
		'  - with a sub-item',
		'- Filters by category',
		'',
		'### Avatars',
		'- Hats',
		''
	].join('\n');
	const roadmap = { file: 'roadmap.md', now: 'Next', later: 'Later', doneWhen: 'Done when' };
	const config = { docs: { groups: ['Product'] }, questions: { groups: { client: 'With the client', tech: 'Technical' } }, roadmap: { now: 'Next' } };
	const cli = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], { cwd: root });

	test('Now holds the items in order, each with its done line, steps and links; Later counts wishes by theme', () => {
		const page = parsePage(PAGE, roadmap);
		expect(page.now).toEqual({
			heading: 'Next: the first release',
			line: 9,
			entries: [
				{ title: 'Payment', anchor: 'payment', line: 11, doneWhen: 'a customer pays in the sandbox.', steps: { done: 1, total: 2 }, links: ['billing.md'] },
				{ title: 'Filters', anchor: 'filters', line: 19, doneWhen: '', steps: { done: 0, total: 0 }, links: [] }
			]
		});
		expect(page.later?.entries).toEqual([
			{ title: 'Later', anchor: 'later', wishes: 1 },
			{ title: 'Catalog', anchor: 'catalog', wishes: 2 },
			{ title: 'Avatars', anchor: 'avatars', wishes: 1 }
		]);
	});

	test('kb roadmap shows Now in order with what blocks each item, then Later by theme', () => {
		write('docs/roadmap.md', PAGE);
		write('kb.config.ts', `export default ${JSON.stringify(config)};\n`);
		const c = context(root, defineConfig(config));
		questions.add(c, { title: 'Which acquirer takes boleto?', group: 'client', owner: 'the finance lead', unblocks: 'roadmap.md#payment', id: 'acquirer' });
		questions.add(c, { title: 'Unrelated', group: 'tech', unblocks: 'the catalog', id: 'unrelated' });
		expect([...blockers(c, c.config.roadmap!, readRoadmap(c)).entries()].map(([a, qs]) => [a, qs.map((q) => q.id)])).toEqual([
			['payment', ['acquirer']],
			['filters', []]
		]);
		expect(cli('roadmap').stdout.toString()).toBe(
			[
				'docs/roadmap.md',
				'',
				'## Next: the first release',
				'  1. Payment  (1/2 steps)',
				'     done when: a customer pays in the sandbox.',
				'     waits on acquirer (the finance lead): Which acquirer takes boleto?',
				'  2. Filters',
				'     no done when line',
				'',
				'## Later: 4 wishes',
				'  Later 1 · Catalog 2 · Avatars 1',
				''
			].join('\n')
		);
		const json = JSON.parse(cli('roadmap', '--json').stdout.toString());
		expect(json.now.entries[0].blockedBy).toEqual([{ id: 'acquirer', title: 'Which acquirer takes boleto?', owner: 'the finance lead' }]);
	});

	test('unblocks names an item: kb question add checks it, kb check fails when the item is gone, kb why and the site show it', async () => {
		write('docs/roadmap.md', PAGE);
		write('kb.config.ts', `export default ${JSON.stringify(config)};\n`);
		const added = cli('question', 'add', 'Which acquirer takes boleto?', '--group', 'client', '--unblocks', 'docs/roadmap.md#payment', '--id', 'acquirer');
		expect(added.exitCode).toBe(0);
		const c = context(root, defineConfig(config));
		expect(questions.loadQuestions(c).find((q) => q.id === 'acquirer')?.unblocks).toBe('roadmap.md#payment');
		const typo = cli('question', 'add', 'Other', '--group', 'client', '--unblocks', 'roadmap.md#paymnet');
		expect(typo.exitCode).toBe(1);
		expect(typo.stderr.toString()).toBe('kb: --unblocks roadmap.md#paymnet: no heading with that anchor\n');
		expect(why(c, 'roadmap.md#payment').questions.map((q) => q.id)).toEqual(['acquirer']);
		expect(kbData(root, c.config).byPage['roadmap.md'].questions).toEqual([{ id: 'acquirer', title: 'Which acquirer takes boleto?', url: '/questions/acquirer', section: 'Payment' }]);
		// the item leaves the page: the question points nowhere (a new process: headings are read once per run)
		write('docs/roadmap.md', PAGE.replace('### Payment', '### Card payment'));
		expect(cli('check').stderr.toString()).toContain(
			'✗ docs/questions/acquirer.md: unblocks roadmap.md#payment: no heading with that anchor; point it at what waits on it now, or resolve the question'
		);
	});

	test('kb check: the Now part must be there, each item says when it is done, and each brief has its item', async () => {
		write('docs/roadmap.md', PAGE);
		write('docs/briefs/payment.md', doc('Payment brief', 'Product', '# Payment brief\n'));
		write('docs/briefs/avatars.md', doc('Avatars brief', 'Product', '# Avatars brief\n'));
		const c = (r: Record<string, string>) => context(root, defineConfig({ ...config, roadmap: r }));
		const found = async (r: Record<string, string>) => (await check(c(r))).filter((p) => /roadmap|briefs|plan\.md/.test(p.where)).map((p) => `${p.level} ${p.where}: ${p.message}`);
		expect(await found({ now: 'Next' })).toEqual(['warn docs/roadmap.md:19: "Filters" has no **Done when:** line: say when it is done']);
		write('docs/roadmap.md', PAGE.replace('Details: [billing](./billing.md#refunds)', 'Brief: [payment](./briefs/payment.md)'));
		expect(await found({ now: 'Next', briefs: 'briefs/' })).toEqual([
			'warn docs/roadmap.md:19: "Filters" has no **Done when:** line: say when it is done',
			'warn docs/briefs/avatars.md: no item under "## Next: the first release" links to this brief: if its item is done or dropped, dissolve it (its shape into topic docs, its why into decisions)'
		]);
		expect(await found({ now: 'Soon' })).toEqual(['error docs/roadmap.md: no "## Soon" heading: what comes next goes under it (roadmap.now in kb.config.ts)']);
		expect(await found({ now: 'Next', file: 'plan.md' })).toEqual(['error docs/plan.md: missing (roadmap.file in kb.config.ts)']);
	});

	test('kb roadmap done lists, from git, the items that left Now; one renamed in place stayed', () => {
		const git = (env: Record<string, string>, ...args: string[]) =>
			Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, env: { ...process.env, ...env } });
		const at = (date: string) => ({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
		// the reader's zone comes in TZ, the commits carry their own: the result never depends on the machine or the hour
		const done = (TZ: string, ...args: string[]) =>
			Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), 'roadmap', 'done', ...args], { cwd: root, env: { ...process.env, TZ } }).stdout.toString();
		const titles = (TZ: string, ...args: string[]) => JSON.parse(done(TZ, ...args, '--json')).map((l: { title: string }) => l.title);
		write('kb.config.ts', `export default ${JSON.stringify(config)};\n`);
		write('docs/roadmap.md', PAGE);
		git({}, 'init', '-q');
		git({}, 'add', '-A');
		git(at('2025-10-20T12:00:00-03:00'), 'commit', '-qm', 'docs: the roadmap');
		write('docs/roadmap.md', PAGE.replace('### Filters', '### Filters by area'));
		git(at('2025-10-20T12:05:00-03:00'), 'commit', '-qam', 'docs: filters get a clearer name');
		// written on the 19th, rebased on the 21st at 22:30 in São Paulo: already the 22nd in Shanghai
		write('docs/roadmap.md', PAGE.replace('### Filters', '### Filters by area').replace(/### Payment[\s\S]*?(?=### Filters)/, ''));
		git({ GIT_AUTHOR_DATE: '2025-10-19T10:00:00-03:00', GIT_COMMITTER_DATE: '2025-10-21T22:30:00-03:00' }, 'commit', '-qam', 'feat: payment confirms by webhook');
		expect(done('Asia/Shanghai', '--since', '2025-10-22')).toMatch(
			/^left "Next" in docs\/roadmap\.md since 2025-10-22; each commit says whether done or dropped:\n {2}2025-10-22 {2}Payment {2}→ billing\.md\n {14}[0-9a-f]{7} feat: payment confirms by webhook\n$/
		);
		expect(done('Asia/Shanghai', '--since', '2025-10-23')).toBe('nothing left "Next" in docs/roadmap.md since 2025-10-23\n');
		expect(done('America/Sao_Paulo', '--since', '2025-10-22')).toBe('nothing left "Next" in docs/roadmap.md since 2025-10-22\n');
		expect(JSON.parse(done('America/Sao_Paulo', '--since', '2025-10-21', '--json')).map((l: { date: string }) => l.date)).toEqual(['2025-10-21']);
		expect(titles('Asia/Shanghai')).toEqual([]);
		// a commit of now is in the last week in any zone, at any hour
		write('docs/roadmap.md', PAGE.replace(/### Payment[\s\S]*?(?=## Later)/, ''));
		git({}, 'commit', '-qam', 'feat: filters by area');
		for (const zone of ['Pacific/Kiritimati', 'UTC', 'Pacific/Pago_Pago']) expect(titles(zone)).toEqual(['Filters by area']);
		expect(titles('UTC', '--since', '2000-01-01')).toEqual(['Filters by area', 'Payment']);
	});

	test('kb init starts the roadmap page in the project\'s words, and the rules name them', async () => {
		const c = context(root, defineConfig({ ...config, roadmap: { now: 'A fazer', later: 'Depois', doneWhen: 'Pronto quando' } }));
		expect(scaffold(c)).toContain('docs/roadmap.md');
		const page = parsePage(readFileSync(join(root, 'docs/roadmap.md'), 'utf8'), c.config.roadmap!);
		expect([page.now?.heading, page.later?.heading]).toEqual(['A fazer', 'Depois']);
		expect((await check(c)).filter((p) => p.where.includes('roadmap'))).toEqual([]);
		const rules = globalBlock(['roadmap'], c.config);
		expect(rules).toContain('a wish is one line under `## Depois`; what comes next is a `###` item under `## A fazer`');
		expect(rules).toContain('`--unblocks roadmap.md#<item>`');
	});

	test('without a roadmap block, kb roadmap says how to add one', () => {
		write('kb.config.ts', `export default ${JSON.stringify({ ...config, roadmap: undefined })};\n`);
		const out = cli('roadmap');
		expect(out.exitCode).toBe(1);
		expect(out.stderr.toString()).toStartWith('kb: no roadmap in kb.config.ts: add roadmap: {}');
	});
});
