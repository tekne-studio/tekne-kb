import { inject } from 'vue';
import type { KbData } from '../src/vitepress';

// From the global registry: `vitepress dev` pre-bundles the theme with its own copy of this
// module while the .vue files load the source, and both copies must provide and inject one key.
export const KB = Symbol.for('@tekne/kb:data');
export const useKb = () => inject(KB) as KbData;

/** Titles are markdown: escape, then turn `code` spans into <code> (the only markup they use). */
export const inline = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/`([^`]+)`/g, '<code>$1</code>');
