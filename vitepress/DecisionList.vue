<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';
import { inline, useKb } from './key';

const kb = useKb();
const query = ref('');
const all = ref(false);
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byId = new Map(kb.decisions.map((d) => [d.id, d]));

const shown = computed(() => {
	const terms = fold(query.value).split(/\s+/).filter(Boolean);
	return kb.decisions.filter((d) => (all.value || d.active) && terms.every((t) => fold(d.title).includes(t)));
});
const months = computed(() => {
	const out = new Map<string, typeof kb.decisions>();
	for (const d of shown.value) out.set(d.date.slice(0, 7), [...(out.get(d.date.slice(0, 7)) ?? []), d]);
	return [...out];
});
</script>

<template>
	<div class="kb-filter">
		<input v-model="query" type="search" placeholder="Filter by title" aria-label="Filter decisions by title" />
		<label><input v-model="all" type="checkbox" /> Include superseded</label>
		<span class="kb-muted">{{ shown.length }} of {{ kb.decisions.length }}</span>
	</div>
	<section v-for="[month, items] in months" :key="month">
		<h3 class="kb-month">{{ month }}</h3>
		<ul class="kb-list">
			<li v-for="d in items" :key="d.id" :class="{ 'kb-superseded': !d.active }">
				<a :href="withBase(d.url)" v-html="inline(d.title)" />
				<div class="kb-muted">
					{{ d.date }}
					<template v-if="d.active && d.revisit">· <span :class="{ 'kb-stale': d.due }">revisit {{ d.revisit }}</span></template>
					<template v-if="d.supersededBy">
						· superseded by <a :href="withBase(byId.get(d.supersededBy)?.url ?? '')" v-html="inline(byId.get(d.supersededBy)?.title ?? '')" />
					</template>
					<template v-for="r in d.livesIn" :key="r.ref">
						· <a v-if="r.url" :href="withBase(r.url)">{{ r.label }}</a><code v-else>{{ r.label }}</code>
					</template>
				</div>
			</li>
		</ul>
	</section>
</template>
