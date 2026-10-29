import { existsSync, globSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import type { Ctx } from './config';

// The files kb reads, with `node:fs` alone so they come out the same under Bun and
// Node (VitePress loads kb under Node).

/**
 * Every markdown file under the docs folder, from it. None while the folder does not exist:
 * a project with only the AGENTS.md rules gets it with its first decision or question.
 */
export function docFiles(ctx: Ctx): string[] {
	const docs = ctx.path(ctx.config.docs.dir);
	if (!existsSync(docs)) return [];
	return (readdirSync(docs, { recursive: true }) as string[]).filter((rel) => rel.endsWith('.md') && !rel.includes('node_modules/') && !rel.startsWith('.vitepress/'));
}

// Source files named by `config.code.glob`. Braces are expanded here because Bun's
// globSync does not take them.
export function expandBraces(pattern: string): string[] {
	const m = pattern.match(/\{([^{}]*)\}/);
	if (!m) return [pattern];
	return m[1].split(',').flatMap((alt) => expandBraces(pattern.slice(0, m.index) + alt + pattern.slice(m.index! + m[0].length)));
}

export function codeFiles(ctx: Ctx): string[] {
	const code = ctx.config.code;
	if (!code) return [];
	const out = new Set<string>();
	for (const pattern of expandBraces(code.glob)) {
		for (const hit of globSync(pattern, { cwd: ctx.root })) {
			const rel = hit.startsWith('/') ? relative(ctx.root, hit) : hit;
			if (rel.includes('node_modules') || code.ignore?.some((i) => rel.includes(i))) continue;
			out.add(rel);
		}
	}
	return [...out].sort();
}

export const isTestFile = (rel: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
