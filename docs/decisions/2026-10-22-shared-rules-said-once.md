---
date: 2026-10-22
lives_in:
  - /README.md#agents-md
---

# Each shared rule said once, in its shortest form; what a kb command says when it applies stays out of the block

**Decision:** The shared rules in AGENTS.md say each rule once, one sentence each, with a reason or an example only when the rule would be misread without it; what a kb command says at the moment it applies (kb check's warnings, kb manual setup's questions) and the method (kb guide) stay out of the block.

**Why:** Every agent reads the block on every turn: in one project the two generated blocks were 2816 of AGENTS.md's 4318 words. kb's core was 1415 words; its 'thoughts that mean stop' table (215) restated, row by row, rules other sections held, and three bullets restated what kb check already says when it fires.

**Rejected:** the 'thoughts that mean stop' table (each row a second copy of a rule, read on every turn) · restating kb check's messages in the block (the length limit, the frontmatter fields, how to answer a stale question): the warning reaches the agent when it applies · a word quota (past the meaning, a cut loses a rule)
