import { defineConfig } from '@tekne/kb/config';

export default defineConfig({
	docs: { groups: ['Project'] },
	roadmap: {},
	agents: { modules: ['core', 'roadmap'] }
});
