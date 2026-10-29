# kb

Project knowledge for humans and coding agents: **decisions**, **open questions** and **docs** as markdown in git, checked against the code.

- One file per decision and per open question, so parallel branches (and parallel agents in worktrees) add them without merge conflicts.
- Every list (decision index, open questions, docs map, sidebar, "decisions behind this page") is built when read, never committed, so it is never stale and never conflicts.
- `kb check` fails when docs drift: broken links and anchors, references from code to docs that no longer exist, stale generated blocks, one-sided supersedes, frontmatter that the YAML parser of the VitePress build rejects, a tag in the text that never closes (`/files/<id>` outside backticks: the reader never sees it, and the VitePress build fails on it), the project's part of AGENTS.md past its shape (a list item over 80 words, the whole over `agents.budget`).
- One `AGENTS.md` for every agent (Claude Code, Codex, Kimi), with `CLAUDE.md` as a symlink, and a shared rules block kb keeps current.

Requires [Bun](https://bun.sh) for the CLI. The VitePress integration runs under Node: `./config` and `./vitepress` ship compiled JS in `dist/` (built on publish), since Node loads them from `node_modules` without stripping types; Bun reads the TypeScript in `src/`.

Install from the studio's registry: `@tekne:registry=https://npm.tekne.studio` in the repo's `.npmrc`, then `bun add -d @tekne/kb` and a script `"kb": "kb"` in `package.json`, so `bun kb <command>` works.

## Commands

```
kb decision new "<title>" [--decision <text>] [--why <text>] [--rejected <text>]
                          [--lives-in <doc.md#anchor | /repo/path>]... [--supersedes <id>]...
                          [--amends <id>]... [--resolves <question-id>]... [--revisit YYYY-MM-DD]
                          [--id <short-slug>]
kb decision revisit <id> (--next YYYY-MM-DD | --done)   when to look at it again
kb decision supersede <old> --by <new>     the old one stops being current
kb decision amend <old> --by <new>         the old one stays current, changed in part
kb decision list [--all | --due] [--json]
kb decision show <id>

kb question add "<title>" --group <group> [--owner <who>] [--unblocks <what | roadmap.md#item>]
                          [--context <doc.md#anchor>]... [--details <text>] [--id <short-slug>]
kb question list [--group <group>] [--json]
kb question show <id>
kb question review <id>... [--group <group>] [--date YYYY-MM-DD]   checked with whoever unblocks it
kb question resolve <id> [--decision <id>]   links to the question move to the decision

kb roadmap [--json]                        Now in order, what blocks each item, Later by theme
kb roadmap done [--since YYYY-MM-DD] [--json]   items that left Now, from git (default: a week)

kb search <terms...> [--all] [--limit <n>] [--json]
kb why <doc.md[#anchor] | repo/path> [--json]      decisions, questions and tests behind it
kb docs [--json]

kb init        config, decision and question folders, the roadmap page, AGENTS.md with CLAUDE.md as a symlink
kb guide [<topic>] [--all]   a guide kb keeps: inside a project, the chapters for its choices
kb manual setup [--audience <text>] [--access public|private] [--auth app|password|github|other[,…]]
                [--publish app|pages|host|repo] [--site manual|all] [--screen route|tool|command]
                [--shots ci|committed] [--run <command>] [--vitepress yes|no] [--dir <folder/>]
kb manual new "<title>" --group <group> [--id <slug>] [--order <n>]   a page in the manual's shape
kb check       fails on drift (run it in CI)
kb gen         rewrites generated blocks and the shared AGENTS.md rules
kb version     the installed kb (also --version, -v)
```

Ids come from the title (`2026-10-06-refunds-within-7-days`, `who-approves-refunds`) or from `--id`; they match by exact id, prefix or fragment. Resolving a question with `--decision` rewrites every link to it (docs and code comments) into a link to the decision, and reports any reference it could not move. `kb decision new` without `--resolves` lists up to three open questions the decision may answer (shared rare words), each with whom it waits on and the command that closes it; a decision answers one only if it says what the question asks. Search matches singular and plural either way (`cupom` finds `cupons`). References are written from the docs folder (`billing.md#refunds`); a leading `/` is the repo root (`/scripts/deploy.ts`).

Guides hold what an agent reads only when it needs it (`decisions`: recording a decision or a question, from the moment it comes up to the commit; `roadmap`; `manual`), so AGENTS.md stays short: `kb guide` lists them, and `kb guide <topic>` shows the opening, the chapters for every project and the ones that fit the project's choices in `kb.config.ts` (`--all` shows every path). A chapter that fits only some projects says which in a line under its heading, `<!-- when: publish=pages -->` (several keys must all match; `a,b` matches either).

`kb manual setup` asks the questions a manual starts from (who reads it, public or private, how a reader gets in (one way or more: the team's login for the whole site and a password for the manual alone), where it is published, whether the site carries the technical docs too, what a screen is, where screenshots are built, VitePress) and writes the answers into the `manual` block of `kb.config.ts`. It says what a combination costs (a public site with the technical docs makes decisions public), and ends with the decision to record, superseding the current one about the manual. Without a terminal it lists the open questions, for an agent to ask the person one at a time. Run again with a changed answer, it shows what changes in the block.

With `manual.list` in the config (each page of the manual with the screens it covers and its screenshots, and the debt list of screens without a page), `kb gen` writes each page's `<!-- generated:screens -->` block and `kb check` fails on a screen of the product (`manual.screens`) with no page and off the debt list, on a page without an entry or a script (`manual.scripts`), and on a committed screenshot that is missing. With `file` in the list (the module's path from the repo root), each problem of the list points at the line that names the page or screen. `kb guide manual` shows how the pieces fit.

The roadmap is one page of the project's (`roadmap` in the config names it and its parts in the project's words): **Now**, what comes next in order, each item a `###` heading with its done line; **Later**, one-line wishes under themes. `kb roadmap` shows Now with what blocks each item, a question whose `--unblocks` names it (`roadmap.md#payment`, checked like `--context`); an item leaves the page in the commit that meets its done line, and `kb roadmap done --since <day>` lists from git what left. `kb check` fails on a question pointing at an item that is gone and warns on an item that does not say when it is done. `kb guide roadmap` has the method and the checkpoint.

## Files

A decision, `docs/decisions/2026-10-06-refunds-within-7-days.md`:

```markdown
---
date: 2026-10-06
lives_in:
  - billing.md#refunds
supersedes:
  - 2026-09-01-refunds-within-30-days
resolves:
  - who-approves-refunds
---

# Refunds within 7 days

**Decision:** refunds are accepted for 7 days after payment.

**Why:** consumer law sets 7 days; a longer window costs more than it brings.

**Rejected:** 30 days (chargebacks after the course starts) · no refunds (illegal).
```

The superseded file gets `superseded_by` and stays as the history of why. `amends` / `amended_by` mark a decision that stays current, changed in part.

A decision records a choice that had a plausible alternative someone would propose again, and **Rejected:** names it; without one, the why goes in a code comment or the topic doc. One choice per decision: five choices in one file are five decisions. An empty **Rejected:** warns in `kb check`, and `kb decision new` without `--rejected` says so, with where the why goes instead.

The body holds what was decided, under **Decision:**, **Why:** and **Rejected:**. Another labeled line warns in `kb check`, since a status line ("**Pending:** rename in code") goes stale while the decision stays current: work still to do goes to an open question or the roadmap, and a later change to a new decision that amends this one. A label that is part of the decision (**Cost accepted:**) goes in `decisions.extraLabels`.

A decision taken for now ("card only until boleto volume justifies it") keeps its condition in the text, where it belongs to the why, and carries `revisit: 2027-01-15` in frontmatter (`--revisit` on `kb decision new`) so someone looks again. From that day `kb check` warns and `kb decision list --due` lists it; after looking, `kb decision revisit <id> --next <date>` sets the next look, `--done` clears it, and a change of mind is a new decision that supersedes or amends it.

An open question, `docs/questions/who-approves-refunds.md`:

```markdown
---
group: client
owner: the finance lead
unblocks: refund flow
since: 2026-10-01
reviewed: 2026-10-14
context:
  - billing.md#refunds
---

# Who approves a refund?
```

An open question waits on someone's answer; a task to do goes to the roadmap, and so does a problem whose fix is known. Age alone is no problem (a client may take two months to answer); a question nobody checks is. After checking it with whoever unblocks it, `kb question review <id>` records the date in `reviewed` (`--group client` reviews a whole group, at the weekly checkpoint with the client), and `kb check` warns on a question nobody reviewed, or opened, in `questions.staleDays`.

A topic doc carries `title`, `group`, `summary` and optionally `order` in frontmatter; they build the sidebar and the docs map.

## Config

`kb.config.ts` at the repo root (`kb init` writes one):

```ts
import { defineConfig } from '@tekne/kb/config';

export default defineConfig({
	docs: { groups: ['Guides', 'Reference'], skip: ['archive'], maxLines: 200 },
	// labeled lines a decision may hold besides Decision, Why and Rejected
	decisions: { extraLabels: ['Cost accepted'] },
	questions: { groups: { client: 'With the client', tech: 'Technical' }, staleDays: 30 },
	// comments that point to docs (`docs/x.md § Section`) must point somewhere real
	code: { glob: '{src/**/*.ts,scripts/*.ts}' },
	// the roadmap page and the names of its parts, in the project's words
	roadmap: { file: 'roadmap.md', now: 'Now', later: 'Later', doneWhen: 'Done when' },
	// the shared rule modules, and the words the project's own part of AGENTS.md may hold
	agents: { modules: ['core', 'roadmap', 'manual'], budget: 1500 },
	// the manual's choices (kb manual setup writes them; kb guide manual reads them)
	manual: {
		audience: 'the client\'s team', access: 'private', auth: ['app', 'password'], publish: 'app', site: 'all', screen: 'route', shots: 'ci', run: 'bun run shots', vitepress: true,
		// the pages with their screens and screenshots, the product's screens, each page's script
		list: async () => (await import('./e2e/shots/screens')).manual,
		screens: (root) => routes(root),
		scripts: 'e2e/shots/{page}.spec.ts'
	},
	// project checks and `<!-- generated:NAME -->` blocks
	plugins: () => import('./scripts/kb-plugins')
});
```

Defaults: docs in `docs/`, decisions in `docs/decisions/`, questions in `docs/questions/`. A docs folder not created yet reads as empty, so a project with only the AGENTS.md rules (`agents` alone in the config) passes `kb check`; the first `kb decision new` or `kb question add` creates it.

A plugins module exports `generated` (`{ file, name, make }[]`: kb keeps the block between `<!-- generated:NAME -->` and `<!-- /generated:NAME -->` equal to `make()`) and `checks` (`(root) => Problem[]`).

## AGENTS.md

`AGENTS.md` holds a block between `<!-- kb:global -->` and `<!-- /kb:global -->` that `kb gen` fills from `templates/agents/<module>.md`:

- `core`: the rules every agent meets, grouped by the moment it meets them: before changing (ask why with `kb why`; one fact, one place, with the table of homes; `kb` writes decisions and questions, never by hand), while working (docs and comments in the present, short sessions with the repo as memory), before calling it done (evidence before claims, `kb check`, commits) and with the person. The commands live in `bun kb --help` and the method in `kb guide decisions`, so a rule names a command and never its flags.
- `roadmap`: three lines on where a task goes (a wish under Later, an item under Now with its done line), what waits on someone (a question with `--unblocks`) and when an item leaves, citing the project's names for the page and its parts.
- `manual`: three lines on keeping the manual true (page and script in the commit that changes a screen, screenshots from the script, `kb manual setup` and `kb guide manual`), citing the project's manual folder and its screenshot command (`manual.run`) from `kb.config.ts`.

A template may cite the project's own names as `{{page}}`, `{{run}}`, `{{roadmap}}`, `{{now}}`, `{{later}}` and `{{doneWhen}}`, filled from the config, so a rule reads `bun run shots` where the project has one. Every agent reads the block on every turn, so each rule is said once, in its shortest form, and what a kb command says at the moment it applies (a stale question, a doc past `maxLines`, missing frontmatter, the questions of `kb manual setup`) stays out of it; the method lives in `kb guide`. The opener says the block is generated and names the kb version that wrote it. Edits inside the block are overwritten: change the template and run `kb gen`. Every command that writes (`kb decision new`, `revisit`, `supersede`, `amend`, `kb question add`, `review`, `resolve`, `kb manual setup`) also rewrites a stale block and says so, so the rules of the installed kb reach the project with its next change, in the same commit. `kb check` only reads: it fails when the block is stale or when a `CLAUDE.md` is not a symlink to the `AGENTS.md` next to it.

The rest of the file is the project's, and it holds rules: one line each, what to do and never how the system is, with a link to the doc section that explains it. The test for a line: if the next agent does not read it, does it err (a rule: it stays) or only have to look something up (a description: it moves to the topic doc, and the rule links to it)? `kb check` guards the shape of this part, outside every generated block (kb's and any other tool's, `<!-- tool:block -->`…`<!-- /tool:block -->`): a list item (`- ` or `* ` at any indent, with its continuation lines) over 80 words fails, one error per item with the file, the line and its first words; the whole part over `agents.budget` words (default 1500) fails with the count, the budget and the three longest items. Words are whitespace-separated tokens, as `wc -w` counts them; a heading, a table row or a paragraph is not an item and counts only toward the budget. Each message is the task of the cleanup an agent then does: the description moves to the topic doc, and a rule with a link stays. Whether a line repeats a doc is judgment, left to whoever rewrites it; `kb gen` never stops on the shape.

## VitePress

```ts
// .vitepress/kb.data.ts
import { fileURLToPath } from 'node:url';
import config from '../../kb.config';
import { kbLoader } from '@tekne/kb/vitepress';
export default kbLoader(fileURLToPath(new URL('../..', import.meta.url)), config);

// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { withKb } from '@tekne/kb/vitepress/theme';
import { data } from '../kb.data';
export default withKb(DefaultTheme, data);

// .vitepress/config.mts
import kb from '../../kb.config';
import { kbManualOnly, kbMissingScreens, kbPageData, kbSidebar } from '@tekne/kb/vitepress';
const root = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
	transformPageData: kbPageData(kb),
	themeConfig: { sidebar: kbSidebar(root, kb) },
	// with a manual: a screenshot not written yet shows as a frame off CI; in CI the build fails naming it
	vite: { plugins: [kbMissingScreens(root, kb)] },
	// a build of the manual alone, for a public manual
	srcExclude: process.env.MANUAL_ONLY ? kbManualOnly(root, kb) : []
});
```

A test file that cites `docs/x.md § Section` in a comment is listed under that section (`kb why`, and "Tests behind this page" on the site). Then `<DecisionList />`, `<QuestionList />` and `<DocMap />` work in any page (`kb init` puts the first two in the index pages). Each decision and question page shows its status and links above the content; each topic doc lists the decisions and questions pointing at it.

## Release

`bun run release` cuts a version: the version from the Conventional Commits since the last tag (`major`, `minor` or `patch` as an argument picks it instead); the CHANGELOG's `## Unreleased` turned into the new version's entry (with none, an entry drafted from the commits), read and given a sentence on what the release is; `kb gen`, since the opener of the `AGENTS.md` block names the version; the checks (`bun run check`, `bun kb check`, `bun test`, `bun wf check`, `bun run build`), `chore: release x.y.z`, the tag `vx.y.z`, then a push of `main` and of the tag. `--dry-run` prints the plan and the draft and writes nothing; `--entry FILE` takes an entry already distilled, with no pause. It runs in the main checkout, on `main` and clean, and refuses anywhere else (`scripts/release.test.ts`). `.github/workflows/release.yml` publishes the tag to `npm.tekne.studio` from a clean checkout, after the same checks, with `prepublishOnly` building `dist/`; it needs the repository's `NPM_TOKEN` secret (`gh secret set NPM_TOKEN -R tekne-studio/tekne-kb`) and says so when it is missing. `.github/workflows/ci.yml` runs the checks on every push to `main` and every pull request. Both install `@tekne/wf` from the studio's registry with that same secret, written to `$HOME/.npmrc`, which npm reads, and to `$XDG_CONFIG_HOME/.npmrc`, the only user npmrc Bun 1.3.14 reads when that variable is set, as GitHub's Ubuntu runner sets it.
