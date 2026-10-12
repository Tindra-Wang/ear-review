<script setup lang="ts">
import { ref, watch } from 'vue';
import { Check, CircleHelp, ArrowUpRight } from 'lucide-vue-next';
import { ASPECTS, SENTIMENT_NAMES, type Analysis, type AspectId } from '../../../../packages/contracts/index';
import EvidenceText from './EvidenceText.vue';
const props = defineProps<{ result: Analysis | null; busy?: boolean }>();
const selected = ref<AspectId | null>(null);
watch(() => props.result, () => selected.value = null);
</script>
<template>
  <section class="panel result-panel" aria-live="polite" :aria-busy="busy">
    <div class="panel-title"><h2>方面情感分析</h2><span class="subtle" v-if="result">{{ result.opinions.length }} 个方面 · {{ result.durationMs }} ms</span></div>
    <div v-if="!result" class="empty-state"><CircleHelp :size="30"/><p>输入评论后，查看每个方面的评价与原文依据。</p></div>
    <template v-else>
      <div class="aspect-list">
        <button v-for="aspect in ASPECTS" :key="aspect.id" class="aspect-row" :class="{ selected: selected === aspect.id, unmentioned: !result.opinions.some(o => o.aspect === aspect.id) }" @click="selected = selected === aspect.id ? null : aspect.id" :aria-pressed="selected === aspect.id">
          <span class="aspect-name">{{ aspect.name }}</span>
          <template v-if="result.opinions.find(o => o.aspect === aspect.id)">
            <span class="evidence-excerpt">{{ result.opinions.find(o => o.aspect === aspect.id)!.evidence.map(e => e.text).join('；') }}</span>
            <span class="badge" :class="result.opinions.find(o => o.aspect === aspect.id)!.status === 'review' ? 'pending' : result.opinions.find(o => o.aspect === aspect.id)!.sentiment">{{ result.opinions.find(o => o.aspect === aspect.id)!.status === 'review' ? '待复核' : SENTIMENT_NAMES[result.opinions.find(o => o.aspect === aspect.id)!.sentiment] }}</span>
            <ArrowUpRight :size="14" class="row-arrow"/>
          </template><template v-else><span class="evidence-excerpt">评论未涉及此方面</span><span class="not-mentioned">未提及</span><span class="row-arrow"/></template>
        </button>
      </div>
      <div class="evidence-area"><div class="panel-title"><h3>原文依据</h3><button v-if="selected" class="text-button" @click="selected = null">查看全部</button><span v-else class="subtle">点击上方方面，定位原文</span></div><p class="original-text"><EvidenceText :text="result.text" :opinions="result.opinions" :aspect="selected"/></p><div class="legend"><span><i class="positive"/>正面</span><span><i class="negative"/>负面</span><span><i class="neutral"/>中性</span><span><i class="mixed"/>混合</span></div></div>
      <p v-for="warning in result.warnings" :key="warning" class="inline-note warning"><CircleHelp :size="15"/>{{ warning }}</p>
      <div class="result-foot"><Check :size="13"/><span>证据取自输入原文 · {{ result.modelVersion }}</span></div>
    </template>
  </section>
</template>
