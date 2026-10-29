# Decisions and open questions: the method

Decisions and open questions are one file each, written by `kb` and read through `kb why` and `kb search`; every list of them is built when read. Read this guide before recording one, when a choice changes, or at a checkpoint. The shape of the files and every command with its flags: the README and `bun kb --help`.

## Before changing something

- `kb why <doc.md#section | path>` lists the decisions, questions and tests behind a doc, a section or a file; `kb search <terms>` finds them by words. What they say is the state to build on: a change of mind is a new decision, never a rewrite of the old one.

## Recording a decision

- **When:** the choice had a plausible alternative someone would propose again, and Rejected names it. Without one, the why goes in a code comment or the topic doc. One choice per decision: five choices are five decisions.
- **How:** the title states the choice; the body is three to six lines: `kb decision new "<title>" --decision "<what>" --why "<why>" --rejected "<the alternatives and why not>" --lives-in <doc.md#section>`. Without `--resolves`, it lists the open questions it may answer.
- **Three places at most,** each saying only its own fact and linking to the others, all in the commit of the change: the topic doc holds the new state, the decision the why, and the roadmap or a question what is still to do.
- **Change of mind:** `kb decision new ... --supersedes <old id>`, or `--amends <old id>` when the old one stays partly true. A decision taken for now carries `--revisit YYYY-MM-DD`; from that day `kb check` warns until `kb decision revisit <id> --next <date> | --done`.

## Opening a question

- **The day it comes up:** `kb question add "<question>" --group <group> --owner <who> --unblocks "<what waits on it>" --context <doc.md#section>`. What blocks a roadmap item: `--unblocks roadmap.md#<item>`, and `kb roadmap` shows it under the item.
- **Checked with whoever unblocks it:** `kb question review <id>` (or `--group <group>` at the checkpoint with them) records the date; `kb check` warns on one nobody reviewed in `questions.staleDays`.
- **Answered:** `kb decision new ... --resolves <question id>` deletes the question and moves every link to it to the decision; the new state goes into the topic doc.

## Before committing

- `kb check` fails on a broken link or anchor, a reference from code to a doc that is gone, a stale generated block and a one-sided supersedes; `kb gen` rewrites the generated blocks, the shared AGENTS.md rules among them.
