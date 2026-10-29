// VitePress theme wrapper: registers the kb components and shows, around each page,
// what kb knows about it (status of a decision, the decisions behind a doc).
// Usage in .vitepress/theme/index.ts:
//   import DefaultTheme from 'vitepress/theme';
//   import { data } from '../kb.data';
//   export default withKb(DefaultTheme, data);
import type { Theme } from 'vitepress';
import { h, type Slots } from 'vue';
import type { KbData } from '../src/vitepress';
import DecisionList from './DecisionList.vue';
import DocMap from './DocMap.vue';
import PageMeta from './PageMeta.vue';
import PageLinks from './PageLinks.vue';
import QuestionList from './QuestionList.vue';
import { KB } from './key';
import './kb.css';

export function withKb(theme: Theme, data: KbData): Theme {
	return {
		extends: theme,
		// the site's own slots pass through, so a project can add to the layout on top of kb's
		Layout: (_: unknown, { slots }: { slots: Slots }) => h(theme.Layout!, null, { ...slots, 'doc-before': () => h(PageMeta), 'doc-footer-before': () => h(PageLinks) }),
		enhanceApp(ctx) {
			ctx.app.provide(KB, data);
			ctx.app.component('DecisionList', DecisionList);
			ctx.app.component('QuestionList', QuestionList);
			ctx.app.component('DocMap', DocMap);
		}
	};
}
