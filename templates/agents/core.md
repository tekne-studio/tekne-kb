## Shared rules

The project section below wins where the two differ.

### Before changing: ask why, and keep one fact in one place

- `kb why <doc.md#section | path>` or `kb search <terms>` first. Each fact has one home, and the others link to it:

| Information | Home |
|---|---|
| how it is now | the topic doc |
| why, when the choice had a plausible alternative someone would propose again | a decision; otherwise a code comment or the topic doc |
| what comes next, in order; a problem with a known fix, however small | the roadmap |
| what waits on someone's answer; a problem without a chosen fix | an open question, the day it comes up |
| how agents work | AGENTS.md: rules, one line each, with a link to the doc section that explains it |
| what changed, line by line | git |

- `kb` writes decisions and questions, one file each, and builds every list when read: never edit one by hand. A change of mind is a new decision that supersedes or amends the old one. `bun kb --help` has the commands; `kb guide decisions`, the method.
- Your own memory is none of these homes: the next agent never reads it.

### While working: docs, comments and the session

- Say what the thing is and what to do; a prohibition comes with the way: "never X; use Y". Present only: the past lives in git (what) and in decisions (why).
- Comments say why; the code says what. Changed or removed code: rewrite or delete every comment and doc about it in the same commit.
- Concise: direct sentences, tables and lists when they fit. One file, one topic.
- Every turn rereads the whole conversation: `kb why` before a whole doc, a line range before a whole file, a subagent for a wide search when the harness has one.
- At the end of a task, or once the session has grown long, write what the next session needs in its home, then start fresh, or ask the person to.

### Before calling it done: evidence, kb check, the commit

- "Done", "fixed" and "passing" come after running the command in this turn and reading its output; report what it printed, and a skipped step as skipped.
- A visible change is looked at (screenshot or browser) before it is called done: tests prove only what they cover.
- Bug: reproduce it, find the cause, then fix, with a test that fails before the fix when the bug earns one. After three fixes that did not hold, question the approach.
- Review feedback: check each point against the code before applying it, and answer a wrong one with evidence. Agreement is not a reply.
- `kb check` before committing docs; `kb gen` rewrites the generated blocks.
- Conventional Commits, the description in the language the project section names; the type drives the release (`feat` minor, `fix` patch, `BREAKING CHANGE` major). `wip` never reaches the integration branch: retype or squash first.
- Commits and pull requests end at their content: no `Co-Authored-By` trailer, no "Generated with" footer.

### With the person

- A feature that replaces a process the client runs today: a portrait of that process validated with them, then a proposal in its own document, then the spec and the docs.
- A question gets an answer, the size of the question. Change something only when asked; a fix the person would obviously want, offer in one line.
- Look around what you touch: stale, duplicated, inconsistent or more complex than needed. Small and same topic: fix it in the same commit and say so; bigger: point it out and propose.
- One question at a time, with your recommendation, when the choice is genuinely theirs; otherwise pick the conventional option, say so, and go on.
- Destructive or outward-facing actions (deleting, pushing to a shared environment, sending) wait for an explicit yes.
