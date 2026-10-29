import type { Config } from '@tekne/wf/config';

export default {
	integration: 'main',
	// runs in each new worktree and after each merge of main; must be idempotent
	prepare: 'bun install',
	// cheap ones are rerun when checking a report; wf ship runs them all, in order
	gates: { cheap: ['bun wf check', 'bun kb check', 'bun run check', 'bun test', 'bun run build'], expensive: [] }
} satisfies Config;
