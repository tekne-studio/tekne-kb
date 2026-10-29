<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed } from 'vue';
import { inline, useKb } from './key';

// Below a topic doc: the decisions that explain it and the questions still open about it.
// A page inside a section (a manual for the people who use the product) shows none: its
// readers use the product, they do not build it.
const kb = useKb();
const { page } = useData();
const inSection = computed(() => kb.sections.some((s) => page.value.relativePath.startsWith(s.prefix)));
const links = computed(() => (inSection.value ? undefined : kb.byPage[page.value.relativePath]));
</script>

<template>
	<aside v-if="links" class="kb-links vp-doc">
		<template v-if="links.decisions.length">
			<h2 id="kb-decisions">Decisions behind this page</h2>
			<ul>
				<li v-for="d in links.decisions" :key="d.id + d.section">
					<a :href="withBase(d.url)" v-html="inline(d.title)" /> <span v-if="d.section" class="kb-muted">§ {{ d.section }}</span>
				</li>
			</ul>
		</template>
		<template v-if="links.questions.length">
			<h2 id="kb-questions">Open questions</h2>
			<ul>
				<li v-for="q in links.questions" :key="q.id">
					<a :href="withBase(q.url)" v-html="inline(q.title)" /> <span v-if="q.section" class="kb-muted">§ {{ q.section }}</span>
				</li>
			</ul>
		</template>
		<template v-if="links.tests.length">
			<h2 id="kb-tests">Tests behind this page</h2>
			<ul>
				<li v-for="t in links.tests" :key="t.file + t.section"><code>{{ t.file }}</code> <span v-if="t.section" class="kb-muted">§ {{ t.section }}</span></li>
			</ul>
		</template>
	</aside>
</template>
