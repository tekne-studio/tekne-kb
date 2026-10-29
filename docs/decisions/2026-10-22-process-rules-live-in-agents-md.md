---
date: 2026-10-22
lives_in:
  - /templates/agents/core.md#before-changing-ask-why-and-keep-one-fact-in-one-place
---

# Rules on how agents work live in AGENTS.md, and docs point to them

**Decision:** How agents work (the process rules) lives in AGENTS.md: its generated blocks, the project's section, or the config they render. Docs point to it and never restate it.

**Why:** In one project, one process rule lived in 7 places and was rewritten 4 times in 80 minutes, each copy drifting from the others; the knowledge table had no row for such rules. AGENTS.md is what every agent reads at the start of every session.

**Rejected:** a process doc in the docs folder (an agent reads it only when it looks for it, and AGENTS.md would still summarize it: two places again) · decisions as the home (they hold the why; the rule as it stands would be spread over a chain of superseded files)
