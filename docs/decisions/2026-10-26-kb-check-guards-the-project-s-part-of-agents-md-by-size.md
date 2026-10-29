---
date: 2026-10-26
lives_in:
  - /README.md#agents-md
---

# kb check guards the project's part of AGENTS.md by size, never by a restatement heuristic

**Decision:** AGENTS.md holds rules: one line each, what to do and never how the system is, with a link to the doc section that explains it. kb check fails on a list item of the project's part (outside every generated block) over 80 words and on the part over agents.budget words (default 1500), naming the file, the lines and the first words; the message is the task of the cleanup.

**Why:** One project's part grew from 338 to 4,287 words in 73 commits: every feature adds its paragraph to the file every task reads first, and nothing checked that part. Size catches the shape and names what to rewrite; whether a line repeats a doc is judgment, done by whoever rewrites the failing item, and a rule with a link survives the cut.

**Rejected:** a heuristic that flags a bullet repeating a doc (judgment kb cannot make; the size limit does the same work) · a budget on the shared block (its length is kb's, in the templates, said once: decision 2026-10-22-shared-rules-said-once) · a warning instead of an error (the part kept growing while nothing failed)
