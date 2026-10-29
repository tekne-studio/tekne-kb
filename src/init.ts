import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globalBlock, OPENER } from './agents';
import { CONFIG_FILE, type Config, type Ctx, context, defineConfig, type Roadmap } from './config';
import { stringify } from './frontmatter';

// `kb init`: everything a project needs to start, created only where missing, so it
// is safe to run again on a repo that already has part of it.

const DECISIONS_INDEX = (group: string) =>
	stringify(
		{ title: 'Decisions', group, summary: 'Why a choice was made over the alternatives it turned down, one file per decision', order: '90' },
		`# Decisions

Why a choice was made over the alternatives it turned down. The current state lives in the doc each decision points to; a superseded decision stays, linked to the one that replaced it.

Agents: \`kb search <terms>\` finds a decision, \`kb decision new "<title>"\` records one (\`kb --help\`).

<DecisionList />
`
	);

const QUESTIONS_INDEX = (group: string) =>
	stringify(
		{ title: 'Open questions', group, summary: 'Questions without an answer and problems without a chosen fix, with who unblocks them', order: '91' },
		`# Open questions

Questions without an answer and problems without a chosen fix. Work already decided goes to the roadmap; an answered question becomes a decision and leaves this list.

Agents: \`kb question add "<title>" --group <group>\` records one, \`kb question review <id>\` records that it was checked with whoever unblocks it, \`kb question resolve <id> --decision <id>\` closes it (\`kb --help\`).

<QuestionList />
`
	);

const ROADMAP = (group: string, r: Roadmap) =>
	stringify(
		{ title: 'Roadmap', group, summary: 'What comes next, in order, and the wishes for later', order: '1' },
		`# Roadmap

What comes next, in order: each item says when it is done and leaves the page in the commit that does it. What waits on someone is an open question that names the item; what was built lives in the topic docs.

Agents: \`kb roadmap\` shows it with what blocks each item; \`kb guide roadmap\` has the method.

## ${r.now}

## ${r.later}
`
	);

/** The decision and question folders, each with its index page, and the roadmap page when the config has one. */
export function scaffold(ctx: Ctx): string[] {
	const made: string[] = [];
	const group = ctx.config.docs.groups[0] ?? '';
	const r = ctx.config.roadmap;
	for (const [file, page] of [
		[join(ctx.config.decisions.dir, 'index.md'), DECISIONS_INDEX(group)],
		[join(ctx.config.questions.dir, 'index.md'), QUESTIONS_INDEX(group)],
		...(r ? [[join(ctx.config.docs.dir, r.file), ROADMAP(group, r)]] : [])
	]) {
		if (existsSync(ctx.path(file))) continue;
		mkdirSync(dirname(ctx.path(file)), { recursive: true });
		writeFileSync(ctx.path(file), page);
		made.push(file);
	}
	return made;
}

const CONFIG = `import { defineConfig } from '@tekne/kb/config';

export default defineConfig({
	docs: { groups: ['Guides', 'Reference'] },
	questions: { groups: { client: 'With the client', tech: 'Technical' } },
	// the roadmap page and the names of its parts, in the project's words (kb guide roadmap)
	roadmap: { file: 'roadmap.md', now: 'Now', later: 'Later', doneWhen: 'Done when' },
	agents: { modules: ['core', 'roadmap'] }
});
`;

const AGENTS = (config: Config, project: string) => `# Agent instructions

${OPENER}
${globalBlock(config.agents?.modules ?? ['core'], config)}
<!-- /kb:global -->

# This project

${project.trim() || 'What the project is, how to run it, and the rules only it has.'}
`;

export async function init(root: string): Promise<string[]> {
	const made: string[] = [];
	if (!existsSync(join(root, CONFIG_FILE))) {
		writeFileSync(join(root, CONFIG_FILE), CONFIG);
		made.push(CONFIG_FILE);
	}
	const config = defineConfig(existsSync(join(root, CONFIG_FILE)) ? (await import(join(root, CONFIG_FILE))).default : {});
	const ctx = context(root, config);
	made.push(...scaffold(ctx));
	const agents = join(root, 'AGENTS.md');
	const claude = join(root, 'CLAUDE.md');
	if (!existsSync(agents)) {
		// An existing CLAUDE.md becomes the project part of AGENTS.md, then a symlink to it.
		const project = existsSync(claude) ? readFileSync(claude, 'utf8').replace(/^# .*\n/, '') : '';
		writeFileSync(agents, AGENTS(ctx.config, project));
		made.push('AGENTS.md');
		if (existsSync(claude)) renameSync(claude, `${claude}.bak`);
	}
	if (!existsSync(claude)) {
		symlinkSync('AGENTS.md', claude);
		made.push('CLAUDE.md → AGENTS.md');
	}
	return made;
}
