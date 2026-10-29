---
date: 2026-10-22
lives_in:
  - /guides/decisions.md#recording-a-decision
---

# A decision only for a choice with a plausible alternative, which Rejected names

**Decision:** Record a decision only when the choice had a plausible alternative someone would propose again, and Rejected names it; without one, the why goes in a code comment or the topic doc. One choice per decision.

**Why:** The test it replaces, record it if someone could ask "why?" in six months, passes for any choice. In one project's review (2026-10-22), 19 decisions came in one day: 3 dispensable, one holding five choices in 470 words. A decision is permanent and every later agent reads it through kb why, so the extra ones hide the ones that matter.

**Rejected:** the six-months "why?" test (every choice passes it) · a cap on decisions per day or per task (the count is a symptom: the dispensable ones had no alternative, and a cap cuts the needed ones too) · several choices in one decision when they come together (the five-choice one was rewritten twice in 6 minutes, and kb why cannot point at one of its choices)
