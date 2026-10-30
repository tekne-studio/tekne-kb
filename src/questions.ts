import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Ctx } from './config';
import { DATE, daysSince, today } from './dates';
import { find as findDecision, loadDecisions, write as writeDecision } from './decisions';
import { type Data, list, parse, str, stringify } from './frontmatter';
import { referencesTo, repoint, type Reference } from './links';
import { fileSlug } from './slug';

// An open question is one file, `slug.md`. Resolving it deletes the file: the answer
// lives in a decision (which records the question id) and in the topic doc.
export type Question = {
	id: string;
	file: string;
	title: string;
	group: string;
	owner: string;
	unblocks: string;
	since: string;
	/** Last time someone checked it with whoever unblocks it (`kb question review`); the stale warning counts from here. */
	reviewed: string;
	/** Where the context is, written like `lives_in` in decisions (`billing.md#refunds`, `/e2e/checkout.test.ts`). */
	context: string[];
	body: string;
};

export function loadQuestions(ctx: Ctx): Question[] {
	const dir = ctx.path(ctx.config.questions.dir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md') && f !== 'index.md')
		.map((f) => read(join(dir, f)))
		.sort((a, b) => a.group.localeCompare(b.group) || a.since.localeCompare(b.since) || a.id.localeCompare(b.id));
}

export function read(file: string): Question {
	const { data, body } = parse(readFileSync(file, 'utf8'));
	return {
		id: file.split(/[\\/]/).pop()!.replace(/\.md$/, ''),
		file,
		title: body.match(/^#\s+(.+)$/m)?.[1].trim() ?? '',
		group: str(data.group),
		owner: str(data.owner),
		unblocks: str(data.unblocks),
		since: str(data.since),
		reviewed: str(data.reviewed),
		context: list(data.context),
		body
	};
}

export function write(q: Question): void {
	const data: Data = { group: q.group, owner: q.owner, unblocks: q.unblocks, since: q.since, reviewed: q.reviewed, context: q.context };
	writeFileSync(q.file, stringify(data, q.body));
}

export function find(all: Question[], ref: string): Question {
	const hits = [all.filter((q) => q.id === ref), all.filter((q) => q.id.startsWith(ref)), all.filter((q) => q.id.includes(ref))].find(
		(h) => h.length
	);
	if (!hits) throw new Error(`no open question matches "${ref}"`);
	if (hits.length > 1) throw new Error(`"${ref}" matches ${hits.length} questions:\n${hits.map((q) => `  ${q.id}`).join('\n')}`);
	return hits[0];
}

export type NewQuestion = { title: string; group: string; id?: string; owner?: string; unblocks?: string; context?: string[]; details?: string; since?: string };

export function add(ctx: Ctx, input: NewQuestion): Question {
	const groups = Object.keys(ctx.config.questions.groups);
	if (!groups.includes(input.group)) throw new Error(`group must be one of: ${groups.join(', ')}`);
	const dir = ctx.path(ctx.config.questions.dir);
	mkdirSync(dir, { recursive: true });
	// a short id given by hand reads better in links and on the command line
	const base = fileSlug(input.id ?? input.title, input.id ? 60 : 50);
	if (!base) throw new Error('the id (or the title) must have at least one letter or digit');
	let id = base;
	for (let n = 2; existsSync(join(dir, `${id}.md`)); n++) id = `${base}-${n}`;
	const q: Question = {
		id,
		file: join(dir, `${id}.md`),
		title: input.title,
		group: input.group,
		owner: input.owner ?? '',
		unblocks: input.unblocks ?? '',
		since: input.since ?? today(),
		reviewed: '',
		context: input.context ?? [],
		body: `# ${input.title}\n${input.details ? `\n${input.details.trim()}\n` : ''}`
	};
	write(q);
	return q;
}

export type Resolved = { question: Question; repointed: string[]; left: Reference[] };

/**
 * Closes a question. With a decision, the decision keeps the question id in
 * `resolves` and every link to the question now leads to the decision; without
 * one, the links that remain are returned for whoever closes it to fix.
 */
export function resolve(ctx: Ctx, ref: string, decisionRef?: string): Resolved {
	const q = find(loadQuestions(ctx), ref);
	const docs = ctx.path(ctx.config.docs.dir);
	const from = relative(docs, q.file);
	let repointed: string[] = [];
	if (decisionRef) {
		const d = findDecision(loadDecisions(ctx), decisionRef);
		if (!d.resolves.includes(q.id)) d.resolves.push(q.id);
		writeDecision(d);
		repointed = repoint(ctx, from, relative(docs, d.file));
	}
	const left = referencesTo(ctx, from);
	rmSync(q.file);
	return { question: q, repointed, left };
}

/**
 * Records that the questions were checked with whoever unblocks them: the ones named,
 * plus every question of `group` (the weekly checkpoint with the client reviews a group).
 */
export function review(ctx: Ctx, input: { ids?: string[]; group?: string; date?: string }): Question[] {
	const groups = Object.keys(ctx.config.questions.groups);
	if (input.group && !groups.includes(input.group)) throw new Error(`group must be one of: ${groups.join(', ')}`);
	const date = input.date ?? today();
	if (!DATE.test(date)) throw new Error('the date must be YYYY-MM-DD');
	const open = loadQuestions(ctx);
	const picked = new Map([...(input.ids ?? []).map((ref) => find(open, ref)), ...open.filter((q) => q.group === input.group)].map((q) => [q.id, q]));
	if (!picked.size) throw new Error(input.group ? `no open question in group ${input.group}` : 'name a question id or --group <group>');
	for (const q of picked.values()) {
		q.reviewed = date;
		write(q);
	}
	return [...picked.values()];
}

/** Days since the question was opened. */
export const ageInDays = (q: Question, now = new Date()): number => daysSince(q.since, now);

/** Days since someone last looked at it: the last review, or the day it was opened. */
export const idleDays = (q: Question, now = new Date()): number => daysSince(q.reviewed || q.since, now);
