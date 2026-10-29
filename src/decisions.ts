import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Ctx, LABELS } from './config';
import { DATE, daysSince, today } from './dates';
import { type Data, list, parse, str, stringify } from './frontmatter';
import { fileSlug } from './slug';

// A decision is one file, `YYYY-MM-DD-slug.md`: the date and title in the name keep ids
// unique across parallel branches, where a running number would collide.
export type Decision = {
	id: string;
	file: string;
	date: string;
	title: string;
	/** Where the resulting state is described, from the docs folder (`pessoa.md#acesso`); a leading `/` is the repo root (`/scripts/dev.ts`). */
	livesIn: string[];
	supersedes: string[];
	supersededBy: string;
	amends: string[];
	amendedBy: string[];
	/** Ids of the open questions this decision closed. */
	resolves: string[];
	/** When to look at it again: the condition stays in the text, the date makes it come due. */
	revisit: string;
	body: string;
	data: Data;
};

export const ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

/** Said wherever Rejected is empty: a choice with no alternative to name is no decision. */
export const NO_ALTERNATIVE = 'a decision names the alternative it turned down; with none, its why goes in a code comment or the topic doc, not a decision';

export function loadDecisions(ctx: Ctx): Decision[] {
	const dir = ctx.path(ctx.config.decisions.dir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md') && f !== 'index.md')
		.map((f) => read(join(dir, f)))
		.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function read(file: string): Decision {
	const { data, body } = parse(readFileSync(file, 'utf8'));
	const id = file.split('/').pop()!.replace(/\.md$/, '');
	return {
		id,
		file,
		date: str(data.date) || id.slice(0, 10),
		title: body.match(/^#\s+(.+)$/m)?.[1].trim() ?? '',
		livesIn: list(data.lives_in),
		supersedes: list(data.supersedes),
		supersededBy: str(data.superseded_by),
		amends: list(data.amends),
		amendedBy: list(data.amended_by),
		resolves: list(data.resolves),
		revisit: str(data.revisit),
		body,
		data
	};
}

export const isActive = (d: Decision) => !d.supersededBy;

/** A current decision whose revisit date has come. */
export const isDue = (d: Decision, now = new Date()): boolean => isActive(d) && !!d.revisit && daysSince(d.revisit, now) >= 0;

/** Sets when to look at the decision again, or clears it (`''`) once it was looked at and holds. */
export function revisit(ctx: Ctx, ref: string, date: string): Decision {
	if (date && !DATE.test(date)) throw new Error('the date must be YYYY-MM-DD');
	const d = find(loadDecisions(ctx), ref);
	d.revisit = date;
	write(d);
	return d;
}

/** Lines that open with a bold label (`**Why:**`), outside the frontmatter and code, numbered in the file. */
export function labeledLines(text: string): { label: string; line: number }[] {
	const lines = text.split(/\r?\n/);
	const start = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
	const out: { label: string; line: number }[] = [];
	let fence = false;
	for (let i = start; i < lines.length; i++) {
		if (/^(```|~~~)/.test(lines[i])) fence = !fence;
		const m = !fence && lines[i].match(/^\*\*([^*]+?):\*\*/);
		if (m) out.push({ label: m[1].trim(), line: i + 1 });
	}
	return out;
}

export function write(d: Decision): void {
	const data: Data = {
		date: d.date,
		revisit: d.revisit,
		lives_in: d.livesIn,
		supersedes: d.supersedes,
		superseded_by: d.supersededBy,
		amends: d.amends,
		amended_by: d.amendedBy,
		resolves: d.resolves
	};
	writeFileSync(d.file, stringify(data, d.body));
}

/** Exact id, then id prefix, then a fragment of the id: one match or an error naming the options. */
export function find(all: Decision[], ref: string): Decision {
	const hits = [all.filter((d) => d.id === ref), all.filter((d) => d.id.startsWith(ref)), all.filter((d) => d.id.includes(ref))].find(
		(h) => h.length
	);
	if (!hits) throw new Error(`no decision matches "${ref}"`);
	if (hits.length > 1) throw new Error(`"${ref}" matches ${hits.length} decisions:\n${hits.map((d) => `  ${d.id}`).join('\n')}`);
	return hits[0];
}

export type NewDecision = {
	title: string;
	/** Short slug for the file name instead of the one made from the title. */
	id?: string;
	date?: string;
	livesIn?: string[];
	/** Decision, Why and Rejected, in that order (missing ones stay empty to fill in). */
	fields?: string[];
	supersedes?: string[];
	amends?: string[];
	resolves?: string[];
	revisit?: string;
};

export function create(ctx: Ctx, input: NewDecision): Decision {
	const dir = ctx.path(ctx.config.decisions.dir);
	mkdirSync(dir, { recursive: true });
	const date = input.date ?? today();
	if (input.revisit && !DATE.test(input.revisit)) throw new Error('--revisit must be YYYY-MM-DD');
	const base = fileSlug(input.id ?? input.title);
	if (!base) throw new Error('the id (or the title) must have at least one letter or digit');
	let id = `${date}-${base}`;
	for (let n = 2; existsSync(join(dir, `${id}.md`)); n++) id = `${date}-${base}-${n}`;
	const fields = LABELS.map((label, i) => `**${label}:** ${input.fields?.[i] ?? ''}`.trimEnd());
	const d: Decision = {
		id,
		file: join(dir, `${id}.md`),
		date,
		title: input.title,
		livesIn: input.livesIn ?? [],
		supersedes: [],
		supersededBy: '',
		amends: [],
		amendedBy: [],
		resolves: input.resolves ?? [],
		revisit: input.revisit ?? '',
		body: `# ${input.title}\n\n${fields.join('\n\n')}\n`,
		data: {}
	};
	write(d);
	for (const old of input.supersedes ?? []) link(ctx, old, d.id, 'supersede');
	for (const old of input.amends ?? []) link(ctx, old, d.id, 'amend');
	return read(d.file);
}

/** Records both sides at once: the new decision names the old, the old points to the new. */
export function link(ctx: Ctx, oldRef: string, newRef: string, kind: 'supersede' | 'amend'): void {
	const all = loadDecisions(ctx);
	const old = find(all, oldRef);
	const next = find(all, newRef);
	if (old.id === next.id) throw new Error('a decision cannot replace itself');
	if (kind === 'supersede') {
		if (old.supersededBy && old.supersededBy !== next.id) throw new Error(`${old.id} is already superseded by ${old.supersededBy}`);
		old.supersededBy = next.id;
		if (!next.supersedes.includes(old.id)) next.supersedes.push(old.id);
	} else {
		if (!old.amendedBy.includes(next.id)) old.amendedBy.push(next.id);
		if (!next.amends.includes(old.id)) next.amends.push(old.id);
	}
	write(old);
	write(next);
}
