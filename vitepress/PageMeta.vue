<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed } from 'vue';
import { inline, useKb } from './key';

// Above a decision or question page: its status and links, read from frontmatter.
const kb = useKb();
const { page } = useData();
const id = (base: string) => {
	const rel = page.value.relativePath;
	return rel.startsWith(`${base}/`) && !rel.endsWith('index.md') ? rel.slice(base.length + 1, -3) : '';
};
const byId = new Map(kb.decisions.map((d) => [d.id, d]));
const decision = computed(() => byId.get(id(kb.decisionsBase)));
const question = computed(() => kb.questionGroups.flatMap((g) => g.items).find((q) => q.id === id(kb.questionsBase)));
const groupTitle = computed(() => kb.questionGroups.find((g) => g.key === question.value?.group)?.title);
const link = (ids: string[]) => ids.map((i) => byId.get(i)).filter(Boolean);
</script>

<template>
	<div v-if="decision" class="kb-meta vp-doc" :class="{ 'kb-meta-old': !decision.active }">
		<p>
			<strong>{{ decision.active ? (decision.amendedBy.length ? 'Current, amended' : 'Current') : 'Superseded' }}</strong>
			· {{ decision.date }}
			<template v-if="decision.active && decision.revisit">
				· <span :class="{ 'kb-stale': decision.due }">revisit {{ decision.due ? 'due since' : 'on' }} {{ decision.revisit }}</span>
			</template>
			<template v-if="decision.supersededBy">
				· replaced by <a :href="withBase(byId.get(decision.supersededBy)?.url ?? '')" v-html="inline(byId.get(decision.supersededBy)?.title ?? '')" />
			</template>
		</p>
		<p v-if="decision.livesIn.length">
			Lives in:
			<template v-for="(r, i) in decision.livesIn" :key="r.ref">
				<a v-if="r.url" :href="withBase(r.url)">{{ r.label }}</a><code v-else>{{ r.label }}</code><span v-if="i < decision.livesIn.length - 1"> · </span>
			</template>
		</p>
		<p v-for="[label, ids] in [['Supersedes', decision.supersedes], ['Amends', decision.amends], ['Amended by', decision.amendedBy]] as const" v-show="ids.length" :key="label">
			{{ label }}:
			<template v-for="(d, i) in link([...ids])" :key="d!.id">
				<a :href="withBase(d!.url)" v-html="inline(d!.title)" /><span v-if="i < ids.length - 1"> · </span>
			</template>
		</p>
		<p v-if="decision.resolves.length">Answers: <code v-for="q in decision.resolves" :key="q">{{ q }}</code></p>
	</div>
	<div v-else-if="question" class="kb-meta vp-doc">
		<p>
			<strong>Open question</strong> · {{ groupTitle }}<template v-if="question.owner"> · {{ question.owner }}</template>
			· since {{ question.since }} ({{ question.age }} days)<template v-if="question.reviewed"> · reviewed {{ question.reviewed }}</template>
		</p>
		<p v-if="question.unblocks">Unblocks: {{ question.unblocks }}</p>
		<p v-if="question.context.length">
			Context:
			<template v-for="(r, i) in question.context" :key="r.ref">
				<a v-if="r.url" :href="withBase(r.url)">{{ r.label }}</a><code v-else>{{ r.label }}</code><span v-if="i < question.context.length - 1"> · </span>
			</template>
		</p>
	</div>
</template>
