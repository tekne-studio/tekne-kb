import { existsSync, readFileSync } from 'node:fs';
import type { Ctx } from './config';
import { codeFiles, isTestFile } from './files';
import { headingsOf } from './markdown';
import { slugify } from './slug';

// Where code points at docs: `docs/x.md § Section` (and bare `docs/x.md`) in comments.
// `kb check` wants them real; `kb why` and the site show the tests behind a section.
export type DocRef = { file: string; line: number; doc: string; section: string; anchor: string; exists: boolean; found: boolean; test: boolean };

export function docRefsInCode(ctx: Ctx): DocRef[] {
	const docs = ctx.config.docs.dir.replace(/\/$/, '');
	const file = new RegExp(`${docs}\\/([\\w/.-]+?\\.md)`, 'g');
	const section = new RegExp(`${docs}\\/([\\w/.-]+?\\.md)\\s*§\\s*([^\\n.)\\]*\`]+)`, 'g');
	const out: DocRef[] = [];
	for (const path of codeFiles(ctx)) {
		readFileSync(ctx.path(path), 'utf8')
			.split('\n')
			.forEach((text, i) => {
				const sections = new Map<string, string>();
				for (const m of text.matchAll(section)) {
					// prose may run on after the section name; another reference on the same line ends it
					sections.set(m[1], m[2].split(new RegExp(`\\s${docs}\\/`))[0].trim());
				}
				for (const m of text.matchAll(file)) {
					const doc = m[1];
					const target = ctx.path(`${docs}/${doc}`);
					const exists = existsSync(target);
					const sec = sections.get(doc) ?? '';
					const want = slugify(sec);
					const heading = exists && sec ? headingsOf(target).find((h) => want.startsWith(h.anchor) || h.anchor.startsWith(want.slice(0, 18))) : undefined;
					out.push({ file: path, line: i + 1, doc: `${docs}/${doc}`, section: sec, anchor: heading?.anchor ?? '', exists, found: !!heading, test: isTestFile(path) });
				}
			});
	}
	return out;
}

/** Test files that cite a doc (and, with `anchor`, that section). `rel` is the doc path from the docs folder. */
export function testsFor(ctx: Ctx, rel: string, anchor?: string): DocRef[] {
	const docs = ctx.config.docs.dir.replace(/\/$/, '');
	const seen = new Set<string>();
	return docRefsInCode(ctx).filter((r) => {
		if (!r.test || r.doc !== `${docs}/${rel}` || (anchor && r.anchor !== anchor)) return false;
		const key = `${r.file}#${r.anchor}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
