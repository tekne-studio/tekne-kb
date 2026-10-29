---
date: 2026-10-22
lives_in:
  - /README.md#files
---

# The empty-Rejected warning states the criterion; no check on Rejected phrases

**Decision:** An empty Rejected warns in kb check, and kb decision new without --rejected says so, both with the criterion: a decision names the alternative it turned down; with none, its why goes in a code comment or the topic doc. kb reads no sentence inside Rejected.

**Why:** Measured on three projects (260 Rejected lines): one sentence saying no alternative was recorded, written to silence the old warning, which said only "missing or empty" and offered no way out but filling it.

**Rejected:** a narrow phrase check in English and Portuguese ("not recorded", "não foram registradas"): one hit today, bound to two languages, and the next filler is phrased otherwise · a heuristic on empty or "none" sentences: "none", "nenhum" and "no" sit inside real options ("no refunds (illegal)", "nenhum teste contra a API real")
