<script setup lang="ts">
import { computed } from 'vue';
import type { Opinion, AspectId } from '../../../../packages/contracts/index';
const props = defineProps<{ text: string; opinions: Opinion[]; aspect?: AspectId | null }>();
const segments = computed(() => {
  const spans = props.opinions.filter(o => !props.aspect || o.aspect === props.aspect).flatMap(o => o.evidence.map(e => ({ ...e, sentiment: o.status === 'review' ? 'pending' : o.sentiment })));
  const points = [...new Set([0, props.text.length, ...spans.flatMap(s => [s.start, s.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => { const end = points[i + 1]!; const hit = spans.find(s => s.start <= start && s.end >= end); return { text: props.text.slice(start, end), sentiment: hit?.sentiment }; });
});
</script>
<template><span class="evidence-text"><template v-for="(segment, i) in segments" :key="i"><mark v-if="segment.sentiment" :class="segment.sentiment">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span></template>
