---
date: 2026-10-26
lives_in:
  - /README.md#release
---

# kb cuts releases as wf does: a script, a CHANGELOG and an Action on the tag

**Decision:** bun run release takes the version from the Conventional Commits since the last tag, turns the CHANGELOG's ## Unreleased into the new version's entry and waits while the person reads it, runs the checks, commits chore: release x.y.z, tags vx.y.z and pushes the commit, then the tag. .github/workflows/release.yml builds from a clean checkout of the tag, runs the checks again and publishes to npm.tekne.studio. The scripts are tekne-wf's, adapted only where kb differs: the package, kb gen after the bump (the AGENTS.md block's opener names the version) and bun run build among the checks.

**Why:** What reaches the registry is exactly what the tag holds; whoever upgrades reads an entry with its Upgrading lines; the studio's tools release one way; and an agent session that may not publish can still push a tag. Marlus, 2026-10-26: "vale a pena padronizar? faça isso".

**Rejected:** npm version and bun publish from the working copy (the registry can carry what was never committed; no changelog for whoever upgrades; a publish from an agent session is blocked, while a tag push is not)
