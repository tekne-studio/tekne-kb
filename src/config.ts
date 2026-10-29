import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type Level = 'error' | 'warn';
export type Problem = { level: Level; where: string; message: string };

/** Project-specific pieces: blocks copied from code and checks only that repo needs. */
export type Plugins = {
	/** `<!-- generated:NAME -->` blocks: file (from the repo root) → name → content maker. */
	generated?: { file: string; name: string; make: () => string }[];
	checks?: ((root: string) => Problem[] | Promise<Problem[]>)[];
};

export type UserConfig = {
	docs?: {
		/** Docs folder, from the repo root. Default `docs`. */
		dir?: string;
		/** Sidebar and map groups, in order. Each doc names its group in frontmatter. */
		groups?: string[];
		/**
		 * Sections of the site with a sidebar of their own: the docs under `prefix` (a folder
		 * inside the docs folder, like `manual/`) show only `groups`; the groups no section
		 * claims form the root sidebar. A section's `index.md` is its home.
		 */
		sections?: Section[];
		/** Folders inside the docs folder that are not topic docs (frozen notes, client material). */
		skip?: string[];
		/** Docs above this many lines get a warning: split by topic. Default 200. */
		maxLines?: number;
	};
	decisions?: {
		/** One file per decision, `YYYY-MM-DD-slug.md`. Default `<docs>/decisions`. */
		dir?: string;
		/**
		 * Labeled lines (`**Cost accepted:**`) a decision may hold besides Decision, Why and
		 * Rejected. Any other label warns: a status line ("Pending: ...") goes stale.
		 */
		extraLabels?: string[];
	};
	questions?: {
		/** One file per open question, `slug.md`. Default `<docs>/questions`. */
		dir?: string;
		/** Group key → title shown on the index page (who unblocks it, or what kind of problem). */
		groups?: Record<string, string>;
		/** Questions nobody reviewed (`kb question review`) or opened in this many days get a warning. Default 30. */
		staleDays?: number;
	};
	/** Source files whose `docs/...` references must exist (Bun glob, from the repo root). */
	code?: { glob: string; ignore?: string[] };
	/**
	 * Shared agent rules that `kb gen` writes into AGENTS.md (templates/agents/<module>.md), and
	 * `budget`: the words the project's own part may hold (default 1500), which `kb check` guards.
	 */
	agents?: { file?: string; modules?: string[]; budget?: number };
	/** The manual's choices, which `kb manual setup` asks; `kb guide manual` shows the chapters for them. */
	manual?: Partial<Omit<Manual, 'auth'>> & { auth?: Auth | Auth[] };
	/** The roadmap page and the names of its parts, in the project's language (`kb guide roadmap`). */
	roadmap?: Partial<Roadmap>;
	plugins?: () => Promise<Plugins>;
};

export type Roadmap = {
	/** The page, from the docs folder. Default `roadmap.md`. */
	file: string;
	/** The `##` heading of what comes next, in order; each item is a `###` under it. Default `Now`. */
	now: string;
	/** The `##` heading of the wishes, one line each under theme headings. Default `Later`. */
	later: string;
	/** The label of an item's line that says when it is done (`**Done when:** …`). Default `Done when`. */
	doneWhen: string;
	/** Where briefs live, from the docs folder: a folder (`briefs/`) or one file (`brief.md`). A brief holds the inside of an item too heavy for its heading. */
	briefs?: string;
};

/** The answers each choice of the manual takes, in the order `kb manual setup` asks them. */
export const MANUAL_OPTIONS = {
	access: ['public', 'private'],
	auth: ['app', 'password', 'github', 'other'],
	publish: ['app', 'pages', 'host', 'repo'],
	site: ['manual', 'all'],
	screen: ['route', 'tool', 'command'],
	shots: ['ci', 'committed']
} as const;

type Option<K extends keyof typeof MANUAL_OPTIONS> = (typeof MANUAL_OPTIONS)[K][number];
export type Auth = Option<'auth'>;

export type Manual = {
	/** Folder of the manual's pages, inside the docs folder. Default `manual/`. */
	dir: string;
	/** Who reads it, in a few words. */
	audience: string;
	access: Option<'access'>;
	/**
	 * How a reader of a private manual gets in, one way or more: the app's own login, a password
	 * that opens only the manual, the GitHub organization's access.
	 */
	auth?: Auth[];
	/** Served by the app, on GitHub Pages, on a static host of its own, or only in the repository as markdown. */
	publish: Option<'publish'>;
	/** The published site carries only the manual, or the technical docs too. */
	site: Option<'site'>;
	/** What counts as a screen: a route, a tool or gesture, a command. */
	screen: Option<'screen'>;
	/** Screenshots built in CI, or on a machine and committed. */
	shots: Option<'shots'>;
	/** The command that writes every screenshot (`bun run shots`); the manual's rules in AGENTS.md cite it. */
	run?: string;
	vitepress: boolean;
	/**
	 * Each page of the manual with the screens it covers and its screenshots, and the debt list.
	 * The project's screenshot scripts import the same module; with it, `kb gen` writes each page's
	 * `<!-- generated:screens -->` block and `kb check` holds pages, list and screens together.
	 */
	list?: () => ManualList | Promise<ManualList>;
	/** The product's screens, named as the pages claim them (a route, a tool, a command): the project lists them from the repo root it gets. */
	screens?: (root: string) => string[] | Promise<string[]>;
	/** Each page's script, from the repo root, with `{page}` for the page (`e2e/shots/{page}.spec.ts`). */
	scripts?: string;
	/** Folder of the screenshots, from the docs folder, one subfolder per page. Default `public/screens`. */
	images?: string;
	/** The project's page template for `kb manual new`, from the repo root, with `{{title}}`, `{{group}}` and `{{order}}`. */
	template?: string;
};

/** A manual page is its file name inside the manual's folder, without `.md`. */
export type ManualList = {
	/** The module that writes the list, from the repo root (`e2e/shots/screens.ts`): `kb check` points its problems at the line that names the page or screen. */
	file?: string;
	pages: Record<string, { screens: string[]; shots: { id: string; caption: string }[] }>;
	/** The product's screens with no page yet: explicit, so the check stays green without hiding them. */
	debt: string[];
};

export type Section = { prefix: string; title: string; groups: string[] };

export type Config = {
	docs: { dir: string; groups: string[]; sections: Section[]; skip: string[]; maxLines: number };
	decisions: { dir: string; extraLabels: string[] };
	questions: { dir: string; groups: Record<string, string>; staleDays: number };
	code?: { glob: string; ignore?: string[] };
	agents?: { file: string; modules: string[]; budget: number };
	manual?: Partial<Manual> & { dir: string };
	roadmap?: Roadmap;
	plugins?: () => Promise<Plugins>;
};

/** Decision body sections, in order. Fixed so every project reads the same way. */
export const LABELS = ['Decision', 'Why', 'Rejected'] as const;

export function defineConfig(c: UserConfig = {}): Config {
	const dir = c.docs?.dir ?? 'docs';
	return {
		docs: { dir, groups: c.docs?.groups ?? [], sections: c.docs?.sections ?? [], skip: c.docs?.skip ?? [], maxLines: c.docs?.maxLines ?? 200 },
		decisions: { dir: c.decisions?.dir ?? `${dir}/decisions`, extraLabels: c.decisions?.extraLabels ?? [] },
		questions: { dir: c.questions?.dir ?? `${dir}/questions`, groups: c.questions?.groups ?? { open: 'Open' }, staleDays: c.questions?.staleDays ?? 30 },
		code: c.code,
		agents: c.agents ? { file: c.agents.file ?? 'AGENTS.md', modules: c.agents.modules ?? ['core'], budget: c.agents.budget ?? 1500 } : undefined,
		manual: c.manual ? { ...c.manual, dir: c.manual.dir ?? 'manual/', auth: c.manual.auth === undefined ? undefined : [c.manual.auth].flat() } : undefined,
		roadmap: c.roadmap ? { file: 'roadmap.md', now: 'Now', later: 'Later', doneWhen: 'Done when', ...c.roadmap } : undefined,
		plugins: c.plugins
	};
}

export type Ctx = { root: string; config: Config; path: (rel: string) => string };

export const CONFIG_FILE = 'kb.config.ts';

/** Finds kb.config.ts from `start` upwards; the folder holding it is the repo root. */
export async function loadConfig(start = process.cwd()): Promise<Ctx> {
	let dir = resolve(start);
	while (!existsSync(join(dir, CONFIG_FILE))) {
		const up = dirname(dir);
		if (up === dir) throw new Error(`${CONFIG_FILE} not found here or above (kb init creates one)`);
		dir = up;
	}
	// through defineConfig again: a plain object, or one an older kb made, gets this version's defaults
	const config = defineConfig((await import(join(dir, CONFIG_FILE))).default as UserConfig);
	return context(dir, config);
}

export const context = (root: string, config: Config): Ctx => ({ root, config, path: (rel) => join(root, rel) });
