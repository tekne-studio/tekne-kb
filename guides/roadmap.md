# The roadmap: what comes next, in order

One page of the project's with what comes next, in order, and the wishes for later; kb reads it, shows what blocks each item and lists what left it. Read this guide when starting a roadmap, bringing one to this shape, or at a checkpoint.

## The shape

```md
## Now                                       ← what comes next: position is priority

### Payment                                  ← an item: a heading, so a question can point at it
Card and boleto checkout. Details: [payment](./payment.md).

**Done when:** a customer pays in the sandbox and the webhook confirms the order.

- [x] Customer and subscription created      ← steps, optional
- [ ] Webhook confirms

## Later                                     ← wishes: no order promised

### Catalog                                  ← a theme
- Product comparison page                    ← a wish: one line
- Filters by category
```

- `roadmap` in `kb.config.ts` names the page and its parts in the project's language: `{ file: 'roadmap.md', now: 'Now', later: 'Later', doneWhen: 'Done when' }` are the defaults. A part's heading may say more after its name (`## Now: the first release`).
- **Now** holds what comes next, in order: each item a `###` heading, a few lines on what it is with links to its docs, and its done line. Steps are optional checkboxes. A mark for work in progress is the project's.
- **Later** holds wishes, one line each, under theme headings (`###`). Adding one costs a line; their order promises nothing.
- Any other section is the project's (the goal above the page, a part reviewed with a client); kb leaves it alone.
- `kb roadmap` prints Now in order, with the steps done, the done line and the questions that block each item, then Later by theme; `--json` for agents. Agents add `roadmap` to `agents.modules` for the rules.

## The life of an item

- **Enters** as a wish under Later, or as an item under Now in its place in the order. A task always goes here, however small; a question waits on someone's answer.
- **Moves** from Later to Now when it comes next: the wish becomes a `###` item with its done line, and the order says when.
- **Blocked:** what waits on someone is an open question that names the item, `kb question add "<question>" --unblocks roadmap.md#<item>`. kb shows it under the item, on the site and in `kb why roadmap.md#<item>`; `kb check` fails if the item leaves while the question still points at it. The page keeps no blocked section: it repeated the questions.
- **Done:** the item leaves the page in the commit that meets its done line, and what it built lives in the topic doc. Nobody keeps a done table: `kb roadmap done --since <day>` lists, from git, the items that left Now, each with its commit and the doc it linked to.
- **Dropped:** a decision says why (`kb decision new`), and the item leaves in the same commit.
- **Renamed** in place: `kb roadmap done` keeps it on the page. Moved into Later as a heading, it stays too; as a one-line wish, it shows as left, and the commit says so.

## Briefs

An item too heavy for its heading (a block of ordered steps, a campaign with its own reasoning) links to a doc of its own, a brief, and keeps on the page its name, a line and the done line. `roadmap.briefs` names where briefs live: a folder (`briefs/`) or one file (`brief.md`). When the item leaves, the brief dissolves in the same commit: its shape into the topic docs, its why into decisions. `kb check` warns on a brief no item under Now links to.

## The checkpoint

At the regular look at the project (weekly with a client, say), in this order:

1. `kb roadmap done --since <the last checkpoint>`: what left the page; each commit says whether done or dropped.
2. `kb question list --group <group>`: for each question checked with whoever unblocks it, `kb question review <id>` (or `--group <group>` for all of them). An answered one becomes a decision: `kb decision new ... --resolves <id>`.
3. What came up goes to its home: a task to the roadmap, a problem without a chosen fix to a question.
4. `kb roadmap`: Now still in the order agreed, each item saying when it is done.

## Bringing a roadmap to this shape

- **Ranked tables:** each row of what comes next becomes a `###` item under Now, its cells a paragraph and a done line; steps marked inside a row become checkboxes, or a brief.
- **A blocked section:** its items go back into Now or Later, and the questions they wait on get `--unblocks roadmap.md#<item>`.
- **A done table:** it leaves the page; the checkpoint reads `kb roadmap done --since`.
- **A pool of wishes with a separate brief:** the themes go under Later as they are, and Now holds one item that links to the brief, with a done line.

## Why one page

- Read top to bottom, it is the order itself; an agent and a person read the same thing.
- One file per item would not spare merges: the conflicts measured were two branches rewriting the same wishes, which conflict as files too; and a pool of a hundred one-line wishes would become a hundred files.
- Priority is judgment and the page is prose: kb reads, checks and lists, and never writes it.
- A table row has no anchor, so a question cannot point at it, and a row grows past reading.
