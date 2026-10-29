import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Ctx } from './config';
import { docFiles as docPaths, codeFiles as sourceFiles } from './files';

// Who points at a doc file: markdown links in the docs folder (`./questions/x.md`,
// `../x.md#a`) and comments in code (`docs/questions/x.md`). Resolving a question or
// superseding a decision uses this to move the links along, or to say what is left.
export type Reference = { file: string; line: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const docFiles = (ctx: Ctx): string[] => docPaths(ctx).map((f) => join(ctx.path(ctx.config.docs.dir), f));
const codeFiles = (ctx: Ctx): string[] => sourceFiles(ctx).map((f) => ctx.path(f));

/** `target` is a path from the docs folder (`questions/x.md`). */
export function referencesTo(ctx: Ctx, target: string): Reference[] {
	const docs = ctx.config.docs.dir.replace(/\/$/, '');
	const inDocs = new RegExp(`\\]\\((?:\\.\\.?\\/)+${escape(target)}(?:#[^)\\s]*)?\\)`);
	const inCode = new RegExp(`${escape(docs)}\\/${escape(target)}`);
	const out: Reference[] = [];
	for (const [files, re] of [
		[docFiles(ctx), inDocs],
		[codeFiles(ctx), inCode]
	] as const) {
		for (const file of files) {
			if (file === join(ctx.path(docs), target)) continue;
			readFileSync(file, 'utf8')
				.split('\n')
				.forEach((line, i) => {
					if (re.test(line)) out.push({ file: relative(ctx.root, file), line: i + 1 });
				});
		}
	}
	return out;
}

/** Rewrites every link to `from` into a link to `to` (both from the docs folder); returns the files touched. */
export function repoint(ctx: Ctx, from: string, to: string): string[] {
	const docs = ctx.config.docs.dir.replace(/\/$/, '');
	const toFile = join(ctx.path(docs), to);
	const inDocs = new RegExp(`\\]\\((?:\\.\\.?\\/)+${escape(from)}(?:#[^)\\s]*)?\\)`, 'g');
	const inCode = new RegExp(`${escape(docs)}\\/${escape(from)}`, 'g');
	const touched: string[] = [];
	for (const file of docFiles(ctx)) {
		const text = readFileSync(file, 'utf8');
		const rel = relative(dirname(file), toFile);
		const next = text.replace(inDocs, `](${rel.startsWith('.') ? rel : `./${rel}`})`);
		if (next !== text) {
			writeFileSync(file, next);
			touched.push(relative(ctx.root, file));
		}
	}
	for (const file of codeFiles(ctx)) {
		const text = readFileSync(file, 'utf8');
		const next = text.replace(inCode, `${docs}/${to}`);
		if (next !== text) {
			writeFileSync(file, next);
			touched.push(relative(ctx.root, file));
		}
	}
	return touched;
}
