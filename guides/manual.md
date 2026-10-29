# The manual: building and keeping one

A manual for the people who use the product, one page per feature, with screenshots that come from the code. Read it when starting a manual, changing how it is published, or adding a page; `kb manual setup` records the project's choices, and this guide then shows the chapters for them.

## The method

The same in every project, whatever the stack and wherever the manual is published.

- **For whoever uses the product, in their words.** One page per feature: what it is, step by step, what each role sees, common questions, and a closing "Screens" section. A button is named as its label reads, a status as the screen shows it. Nothing internal: where data is stored, what is a mock, what a job does.
- **The technical docs keep the inside.** How it works, the decisions and the open questions live there; the manual page links to them (when the site carries both), and the topic doc points to the manual page instead of repeating it.
- **A screenshot is a test.** One script per page walks the feature with assertions and captures each step, so a screen that drifts from what the page says fails the script. Screenshots always come from the script, never by hand.
- **Caption and image never part.** The list of each page's screenshots, with their captions, lives in code; the page's "Screens" section is a kb generated block made from that list.
- **Every screen has a page, or sits on the debt list.** A check in `kb check` compares the product's screens with the ones the pages claim: a screen with no page fails unless the debt list names it, and a claimed screen that no longer exists fails. The debt list keeps the check green without hiding what is missing.
- **Same commit.** A change to a screen the manual covers changes its page and its script with it. A new screen gets its page before merging into the integration branch, and the screenshot run passing is part of the merge.
- **Synthetic data only:** test personas, never a real person.

## The pieces

| Piece | What it holds |
|---|---|
| pages | `<docs>/<manual dir>/<page>.md`, frontmatter `title`, `group`, `summary`, `order`; groups by who uses the product. `kb manual new "<title>" --group <group>` starts one, from the project's template (`manual.template`, with `{{title}}`, `{{group}}` and `{{order}}`) or in kb's: what it is, step by step, what each role sees, common questions, Screens |
| the manual's home | `<manual dir>/index.md`: who is who (each role and what it does), the main path through the product in a few numbered steps, what is ready and what waits on someone, and the docs map of the manual |
| the screenshot list | one code module of the project: for each page (its file name without `.md`), the screens it covers and its screenshots (`id`, `caption`), and the debt list of screens without a page. The scripts import it, and `manual.list` in `kb.config.ts` hands it to kb as `{ file, pages: { <page>: { screens, shots } }, debt }`, `file` being the module's path from the repo root, where `kb check` points each problem of the list, at its line |
| the product's screens | `manual.screens` in `kb.config.ts`: a function of the project that lists them (the routes, the tools, the commands) |
| one script per page | same name as the page; it walks the feature and captures every screenshot in the list. `manual.scripts` names where they are (`e2e/shots/{page}.spec.ts`), and `kb check` fails on a page without one |
| the coverage check | `kb check`, from the list and the screens: a screen with no page and off the debt list, a claimed screen or a debt entry the product no longer has, a debt entry that has a page, a page file with no entry and an entry with no page |
| the "Screens" section | `kb gen` writes each page's `<!-- generated:screens -->` block from the list: each screenshot as an image followed by its caption in italics |
| the images | written by the script into `manual.images` (from the docs folder, default `public/screens`), one subfolder per page, `<id>.png`; with committed screenshots, `kb check` fails on a listed one that is missing |
| the screenshot command | `manual.run` (`bun run shots`): the manual's rules in AGENTS.md cite it |

A page:

```markdown
---
title: Payment
group: Student
summary: how a student pays, what confirms the payment and what the team sees
order: 3
---

# Payment

One paragraph: what it is and who it is for.

## How the student pays
## What confirms it
## What the team sees
## Common questions

## Screens

<!-- generated:screens -->
<!-- /generated:screens -->
```

## Screenshots with Playwright

A suggestion that holds for any product a browser shows. Each page's script is a Playwright test:

- **Assert, then capture.** Each step checks what the page says (a label visible, a status shown, the URL reached) before `shot(id)`. A helper `shot(id)` refuses an id the list does not have; `allTaken()` at the end fails when a listed screenshot was never taken.
- **A stable picture.** Before each capture: hide toasts, move the mouse to a corner, scroll to the top (a full-page capture otherwise shows a sticky bar in the middle). Clip to one card when the caption talks about one thing.
- **Wait for the page to be ready.** Against a dev server, the first visit to a route compiles it and a click before hydration is lost: wait for the network to settle after each navigation. Against a built app, each route is ready at once, and the run is faster: CI captures against the build.
- **Personas per script.** Each script signs in as its own synthetic people, so two scripts run side by side without touching each other's data.
- **One command runs them all** and is the merge gate (`bun run shots`, say).

## A screen is a route
<!-- when: screen=route -->

The product's screens are its route files (in SvelteKit, every `+page.svelte` under `src/routes`, without layout groups); the check lists them and compares them with the routes each page declares. Internal screens nobody uses (a component catalog) are left out by name in the check.

## A screen is a tool or a gesture
<!-- when: screen=tool -->

In a world, a game or an editor, the manual covers what a person picks up and does: a tool, an item, a gesture, a panel. The check lists them from the product's own registry (the items menu, the tools the toolbar offers) and compares them with the ones each page declares. A capture shows the tool in use, in a scene the script builds with synthetic data.

## A screen is a command
<!-- when: screen=command -->

For a command line, a "screenshot" is the command's output: the script runs it against synthetic data, asserts on the output and writes it as a text block, which the "Screens" section shows as code. The check lists the commands from the help or the command registry.

## Screenshots built in CI
<!-- when: shots=ci -->

- The images stay out of git (the folder goes in `.gitignore`): they weigh and age. CI runs the screenshot command before building the site, so the published site always shows the code of the day.
- The published site never ships without a screenshot: in CI, a missing image fails the build. On a developer's machine, a missing image shows as a placeholder and the page opens whole.
- Capturing takes minutes: publish the manual in a job beside the app's, so a broken screenshot never holds the app's deploy.
- Leaving this path for committed screenshots: take the folder out of `.gitignore`, run the command and commit the images.

## Screenshots committed
<!-- when: shots=committed -->

- For a product CI cannot render (a GPU scene, a device), or a manual GitHub shows straight from the repository.
- The script writes into the repository; the commit that changes a screen carries the new images, and the review sees the image diff.
- `kb check` cannot tell an old image from a new one: rerun the screenshot command whenever a covered screen changes, before the commit.
- Clip to the part the caption talks about: smaller files, sharper diffs.

## VitePress
<!-- when: vitepress=true -->

- **The manual as a section** of the docs site: `docs.sections: [{ prefix: 'manual/', title: 'Manual', groups: [...] }]` in `kb.config.ts`. kb's sidebar gives it a sidebar of its own, and its pages show no decisions, questions or tests. The home uses `layout: home` with one card per group and ends with `<DocMap section="manual/" />`.
- **A nav entry for each part**: `{ text: 'Manual', link: '/manual/', activeMatch: '^/manual/' }` and one for the technical docs, `activeMatch: '^/(?!manual/)'`.
- **Images** go under `<docs>/public/` (`manual.images: 'public/screens'`, the default); the Screens block links them from the root of the site (`/screens/payment/card.png`), so they work under any `base`.
- **A placeholder for a missing image**, outside CI, and a clear failure in CI: `vite: { plugins: [kbMissingScreens(root, kb)] }` in the VitePress config (from `@tekne/kb/vitepress`). A screenshot not written yet shows as a dashed frame naming `manual.run`, and the build warns how many are missing; with `process.env.CI` set the build fails, naming the missing images and `manual.run`.
- **Only the manual in the build**, for a public manual: `srcExclude: process.env.MANUAL_ONLY ? kbManualOnly(root, kb) : []`. It leaves out every top-level entry of the docs folder but the manual's folder, `public` and `.vitepress`, so the build holds the manual at `/<manual dir>/`. A manual link into the technical docs then fails the build's dead-link check, as it should: a public manual links only inside itself.

## Without VitePress
<!-- when: vitepress=false -->

The pages are markdown, so any generator works, and GitHub shows them as they are. The generated "Screens" block is plain markdown and needs nothing. What VitePress gave and now falls to the project: the sidebar by group (link the pages from the manual's home in order), the docs map and the placeholder for a missing image.

## Published by the app
<!-- when: publish=app -->

- The site builds to static files with `base` set to the path the app serves (`/docs/`); the app serves that folder through its own access check, the same one its back office uses. A static site protects nothing by itself: whoever serves it does.
- The build ships inside the app's release. A docs-only change publishes the new build without restarting the app; capturing runs in a job of its own, after the app is up.
- Leaving this path: the route that serves the folder goes, and with it any password made only for the manual.

## Published on GitHub Pages
<!-- when: publish=pages -->

- The workflow from VitePress's deploy guide (vitepress.dev/guide/deploy): build, `actions/upload-pages-artifact`, `actions/deploy-pages`; the repository's Pages source set to "GitHub Actions". With screenshots built in CI, the workflow runs the screenshot command before the build.
- `base` is `/<repository>/` unless the site has its own domain.
- A Pages site is public on the internet, even from a private repository. A private site, readable only by people with read access to the repository, needs GitHub Enterprise Cloud; Pages from a private repository needs a paid plan. Public means the build carries only the manual (see VitePress, "Only the manual in the build").
- Leaving this path: the workflow goes, and the repository's Pages are unpublished in its settings.

## Published on a static host
<!-- when: publish=host -->

The same static build goes to any host (a bucket, a CDN, a server of the studio's). The host's own settings control who reads it; `base` matches the path it serves.

## Only in the repository
<!-- when: publish=repo -->

GitHub shows the markdown straight from the repository, to whoever can read it. Screenshots are committed and linked with relative paths (`./screens/payment/card.png`, from the page). VitePress components such as `<DocMap />` show nothing there: the home links the pages by hand.

## A password that opens only the manual
<!-- when: access=private auth=password -->

For readers who should see the manual without an account (a client evaluating it). The server that serves the site checks a fixed password and keeps a cookie holding a signature of it, never the password; the cookie opens only the manual's pages and their assets. The technical docs, the site's search index (it holds every page) and the product stay behind the regular login, and their links stay on the page: whoever has an account follows them, whoever came in by the password lands on the login.

## The app's own login
<!-- when: access=private auth=app -->

The site is served behind the role that may read it (the team, say): no second password and no hosting apart. The manual's home is the link from the product's back office.

## GitHub's access
<!-- when: access=private auth=github -->

Readers are the people with read access to the repository: a private Pages site (GitHub Enterprise Cloud) or the markdown in the repository. Giving someone the manual means giving them the repository.

## Changing the setup

1. `kb manual setup` with the new answers: it shows what changes in `kb.config.ts`, prints the chapters of the new choices and proposes the decision that records them, superseding the one that chose the current setup.
2. Follow the new chapters, and each "Leaving this path" line of the old ones.
3. The screenshot command, `kb check` and the site's build pass before the merge; then the old path's pieces go, in the same branch.
