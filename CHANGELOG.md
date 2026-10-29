# Changelog

Versions follow semver; the commit type is the bump (`feat` minor, `fix`
patch, a breaking change minor while below 1.0). Entries are distilled from
the commits. Before 0.6.0, the tags and `git log` hold the changes.

## 0.6.1

The first version the release Action publishes: `bun run release` cuts a version from the commits, and a `v*` tag publishes from a clean checkout. Coming from 0.5.0, read 0.6.0's Upgrading below too.

### Upgrading

- `bun kb gen` after upgrading: the block names the kb version.

### Added

- `bun run release [major|minor|patch] [--dry-run] [--entry FILE]`: the version from the commits since the last tag, `## Unreleased` turned into the entry, `kb gen`, the gates, `chore: release x.y.z`, the tag and the push; the GitHub Action publishes from the tag. CHANGELOG.md starts at 0.6.0.

## 0.6.0

The shared rules meet an agent at the moment it needs them, and `kb check` keeps the project's part of `AGENTS.md` to rules.

### Upgrading

- After upgrading, `bun kb gen`: the shared rules block changed, and `bun kb check` fails until it is rewritten.
- `bun kb check` fails on the project's part of `AGENTS.md` past its shape: rewrite a list item over 80 words as a rule with a link to the doc section that explains it, and bring the part under `agents.budget` (default 1500 words), or set a budget of the project's own in `kb.config.ts`.

### Added

- `kb check` guards the project's part of `AGENTS.md`, outside every generated block: a list item over 80 words and the whole over `agents.budget` fail, naming the file, the lines and the first words. `kb gen` writes the block whatever the part holds.
- The shared rules come in four sections, one per moment an agent meets them: before changing, while working, before calling it done, and with the person. The flags of every command live in `bun kb --help` and the method for decisions and questions in `kb guide decisions`, so the block with the roadmap module goes from 1040 to 773 words.
