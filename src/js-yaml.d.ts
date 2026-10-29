// js-yaml 3 has no types of its own; this declares the one call kb makes.
declare module 'js-yaml' {
	export type YAMLException = Error & { reason: string; mark?: { line: number; column: number } };
	export function safeLoad(text: string): unknown;
}
