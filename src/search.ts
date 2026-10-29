import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Ctx } from './config';
import { type Decision, isActive, isDue, loadDecisions } from './decisions';
import { firstLine } from './markdown';
import { loadPages, sections } from './pages';
import { loadQuestions, type Question } from './questions';
import { testsFor } from './refs';
import { isDocRef } from './roadmap';

export type Hit = { kind: 'decision' | 'question' | 'doc'; id: string; title: string; detail: string; active: boolean; score: number };

const fold = (s: string) =>
	s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

/** The forms a term may take in the text: singular and plural, either way round. */
function forms(term: string): string[] {
	const out = new Set([term]);
	if (term.length < 4) return [...out];
	if (term.endsWith('s')) out.add(term.slice(0, -1));
	if (term.endsWith('ns')) out.add(`${term.slice(0, -2)}m`);
	if (term.endsWith('oes')) out.add(`${term.slice(0, -3)}ao`);
	if (term.endsWith('ais')) out.add(`${term.slice(0, -3)}al`);
	if (term.endsWith('eis')) out.add(`${term.slice(0, -3)}el`);
	if (term.endsWith('m')) out.add(`${term.slice(0, -1)}ns`);
	if (term.endsWith('ao')) out.add(`${term.slice(0, -2)}oes`);
	if (term.endsWith('al')) out.add(`${term.slice(0, -2)}ais`);
	if (term.endsWith('el')) out.add(`${term.slice(0, -2)}eis`);
	return [...out];
}

/** Every term must appear (in some form); a term in the title weighs more than one in the body. */
function score(terms: string[], title: string, body: string): number {
	const t = fold(title);
	const b = fold(body);
	let total = 0;
	for (const term of terms) {
		const hit = (text: string) => forms(term).some((f) => text.includes(f));
		if (hit(t)) total += 3;
		else if (hit(b)) total += 1;
		else return 0;
	}
	return total;
}

export function search(ctx: Ctx, query: string[], opts: { all?: boolean } = {}): Hit[] {
	const terms = query.map(fold).filter(Boolean);
	if (!terms.length) return [];
	const hits: Hit[] = [];
	const decisions = loadDecisions(ctx);

	for (const d of decisions) {
		if (!opts.all && !isActive(d)) continue;
		const s = score(terms, d.title, d.body);
		if (s) hits.push({ kind: 'decision', id: d.id, title: d.title, detail: describe(d), active: isActive(d), score: s + 0.5 });
	}
	for (const q of loadQuestions(ctx)) {
		const s = score(terms, q.title, `${q.body} ${q.owner} ${q.unblocks}`);
		const who = [q.owner, q.since && `since ${q.since}`].filter(Boolean).join(' · ');
		if (s) hits.push({ kind: 'question', id: q.id, title: q.title, detail: `${q.group}${who ? ` · ${who}` : ''}`, active: true, score: s + 0.5 });
	}
	for (const page of loadPages(ctx)) {
		for (const sec of sections(page)) {
			const s = score(terms, `${page.title} ${sec.heading}`, sec.text);
			if (s) hits.push({ kind: 'doc', id: `${page.rel}#${sec.anchor}`, title: sec.heading, detail: firstLine(sec.text).slice(0, 140), active: true, score: s });
		}
	}
	return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1));
}

export function describe(d: Decision): string {
	if (d.supersededBy) return `superseded by ${d.supersededBy}`;
	const parts = d.livesIn.length ? [`→ ${d.livesIn.join(' · ')}`] : [];
	if (d.amendedBy.length) parts.push(`amended by ${d.amendedBy.join(', ')}`);
	if (d.revisit) parts.push(`revisit ${d.revisit}${isDue(d) ? ' (due)' : ''}`);
	return parts.join(' · ');
}

/** Decisions and questions that point at a doc, a section of it, or a repo path. */
export function why(ctx: Ctx, target: string) {
	const [path, anchor] = refKey(ctx, target).split('#');
	const tests = path.startsWith('/') ? [] : testsFor(ctx, path, anchor);
	const matches = (ref: string) => {
		const [p, a] = ref.split('#');
		return p === path && (!anchor || a === anchor);
	};
	return {
		decisions: loadDecisions(ctx).filter((d) => isActive(d) && d.livesIn.some(matches)),
		questions: loadQuestions(ctx).filter((q) => q.context.some(matches) || (isDocRef(q.unblocks) && matches(q.unblocks))),
		tests
	};
}

/** Any way of naming a target (`docs/x.md`, `x.md#a`, `scripts/dev.ts`) → the form `lives_in` uses. */
export function refKey(ctx: Ctx, target: string): string {
	const docs = ctx.config.docs.dir.replace(/\/$/, '');
	const t = target.replace(/^\.\//, '');
	if (t.startsWith(`${docs}/`)) return t.slice(docs.length + 1);
	if (t.startsWith(`/${docs}/`)) return t.slice(docs.length + 2);
	if (t.startsWith('/')) return t;
	return existsSync(join(ctx.path(docs), t.split('#')[0])) ? t : `/${t}`;
}

/** Words worth comparing: folded, three letters or more, not bare numbers. */
const words = (text: string): Set<string> => new Set(fold(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));

/** The same word in another form: singular or plural, or a long enough shared start (`atomico`, `atomica`). */
function sameWord(a: string, b: string): boolean {
	if (a === b || forms(a).includes(b) || forms(b).includes(a)) return true;
	const n = Math.min(a.length, b.length);
	if (n < 5) return false;
	let i = 0;
	while (i < n && a[i] === b[i]) i++;
	return i >= Math.max(5, n - 2);
}

export type Candidate = { question: Question; score: number };

/**
 * Open questions a new decision may answer, best first. A question word the decision also
 * uses weighs by how rare it is among the questions and decisions, so common words weigh
 * next to nothing in any language, and double in the question's title. The sum is scaled by
 * the square root of the share of the question it covers: neither a long question sharing many
 * loose words nor a short one sharing one word ranks high alone. A shared doc section adds
 * nothing: there the decision that builds the mechanism meets the question that asks someone
 * for the content, and in a real project's history it only lifted questions the decision left
 * open. The threshold comes from real decisions that answered questions.
 */
export function answerable(ctx: Ctx, decision: { id: string; title: string; body: string }, limit = 3): Candidate[] {
	const open = loadQuestions(ctx);
	if (!open.length) return [];
	const docs = [...open.map((q) => words(`${q.title} ${q.body} ${q.unblocks}`)), ...loadDecisions(ctx).filter((d) => isActive(d) && d.id !== decision.id).map((d) => words(d.body))];
	const said = words(`${decision.title} ${decision.body}`);

	// every word of the corpus, by its first two letters: forms of a word share them
	const postings = new Map<string, number[]>();
	docs.forEach((doc, i) => doc.forEach((w) => listAt(postings, w).push(i)));
	const byStart = new Map<string, string[]>();
	for (const w of new Set([...postings.keys(), ...said])) listAt(byStart, w.slice(0, 2)).push(w);
	const variants = memo((w: string) => (byStart.get(w.slice(0, 2)) ?? []).filter((v) => sameWord(w, v)));
	// 1 for a word only one text uses, near 0 for a word they all use
	const rarest = Math.log((docs.length + 1) / 2);
	const weight = memo((w: string) => Math.log((docs.length + 1) / (new Set(variants(w).flatMap((v) => postings.get(v) ?? [])).size + 1)) / rarest);
	const isSaid = memo((w: string) => variants(w).some((v) => said.has(v)));

	const out: Candidate[] = [];
	for (const q of open) {
		const title = words(q.title);
		let shared = 0;
		let whole = 0;
		for (const w of words(`${q.title} ${q.body} ${q.unblocks}`)) {
			const x = weight(w) * (title.has(w) ? 2 : 1);
			whole += x;
			if (isSaid(w)) shared += x;
		}
		const score = whole ? shared * Math.sqrt(shared / whole) : 0;
		if (score >= MIN_SCORE) out.push({ question: q, score });
	}
	return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Below it, a question shares words with the decision more than its subject: in a real project's history the questions decisions answered scored 6.6 to 23. */
const MIN_SCORE = 5.5;

const listAt = <T>(map: Map<string, T[]>, key: string): T[] => map.get(key) ?? map.set(key, []).get(key)!;

function memo<T>(f: (w: string) => T): (w: string) => T {
	const cache = new Map<string, T>();
	return (w) => {
		if (!cache.has(w)) cache.set(w, f(w));
		return cache.get(w)!;
	};
}
