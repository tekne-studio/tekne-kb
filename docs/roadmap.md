---
title: Roadmap
group: Project
summary: What comes next, in order, and the wishes for later
order: 1
---

# Roadmap

What comes next, in order: each item says when it is done and leaves the page in the commit that does it. What waits on someone is an open question that names the item; what was built lives in the topic docs.

Agents: `kb roadmap` shows it with what blocks each item; `kb guide roadmap` has the method.

## Now

### kb upgrade

A project moves to the newest kb in one command, and learns when one is out.

**Done when:** `kb upgrade` installs the newest published kb and rewrites the generated blocks, and a kb command says, at most once a day, when a newer version is published.

### kb review

The checkpoint ([the roadmap guide](../guides/roadmap.md#the-checkpoint)) on one screen.

**Done when:** `kb review --since <day>` shows what left the roadmap, the open questions by group with when each was last reviewed, and the decisions whose revisit date has come.

## Later

### Decisions

- `kb check` warns on a Rejected line that says no alternative was recorded: worth it only if such filler shows up again ([the decision](decisions/2026-10-22-empty-rejected-warning-states-the-criterion.md)).

### Questions

- `unblocks` takes a list, for a question that blocks several items.
- A question or decision title with a markdown link shows as a link on the site (`inline()` in `vitepress/key.ts` turns only code spans into markup).

### With wf

- `kb roadmap --json` feeds the orchestrator's choice of the next task, and `wf spawn` names the item a task meets.

### Site

- The VitePress theme draws task lists (`- [x]`) as checkboxes; today a step shows as "[x] staging" (seen in the platform's docs on 2026-10-22).

### Plans

- A plan for a roadmap item that spans several tasks: `docs/plans/<slug>.md`, linked from the item, holding the design the task files share; it leaves the repo in the commit that takes the item off Now, its result living in the topic docs by then, and `kb check` fails on a plan whose item is gone. A front of one task keeps its design in the task file (Marlus, 2026-10-26).

### Release

- The version bump runs `bun kb gen`, so the block in AGENTS.md names the version and `kb check` passes on kb's own repo.
