<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';
import { useKb } from './key';

// The docs map: with `section` (a prefix from `docs.sections`), that section's groups;
// without it, the groups no section claims. Each home shows its own part of the site.
const props = defineProps<{ section?: string }>();
const kb = useKb();
const groups = computed(() => {
	const section = kb.sections.find((s) => s.prefix === props.section);
	const titles = section ? section.groups : kb.sections.length ? kb.docGroups.map((g) => g.title).filter((t) => !kb.sections.some((s) => s.groups.includes(t))) : kb.docGroups.map((g) => g.title);
	return kb.docGroups.filter((g) => g.pages.length && titles.includes(g.title));
});
</script>

<template>
	<section v-for="g in groups" :key="g.title">
		<h3>{{ g.title }}</h3>
		<table class="kb-table">
			<thead>
				<tr><th>Doc</th><th>Contents</th></tr>
			</thead>
			<tbody>
				<tr v-for="p in g.pages" :key="p.url">
					<td><a :href="withBase(p.url)">{{ p.title }}</a></td>
					<td>{{ p.summary }}</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>
