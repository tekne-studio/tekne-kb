<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';
import { inline, useKb } from './key';

const props = defineProps<{ group?: string }>();
const kb = useKb();
const groups = computed(() => kb.questionGroups.filter((g) => !props.group || g.key === props.group));
</script>

<template>
	<section v-for="g in groups" :key="g.key">
		<h2 v-if="!props.group" :id="g.key">{{ g.title }}</h2>
		<ul v-if="g.items.length" class="kb-list">
			<li v-for="q in g.items" :key="q.id">
				<a :href="withBase(q.url)" v-html="inline(q.title)" />
				<div class="kb-muted">
					<template v-if="q.unblocks">unblocks {{ q.unblocks }} · </template>
					<template v-if="q.owner">{{ q.owner }} · </template>
					<span :class="{ 'kb-stale': q.idle > kb.staleDays }">since {{ q.since }} ({{ q.age }} days)<template v-if="q.reviewed"> · reviewed {{ q.reviewed }}</template></span>
				</div>
			</li>
		</ul>
		<p v-else class="kb-muted">Nothing open.</p>
	</section>
</template>
