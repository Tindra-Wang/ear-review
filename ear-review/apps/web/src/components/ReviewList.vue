<script setup lang="ts">
import { ref } from 'vue';
import { ASPECTS, SENTIMENT_NAMES, type Review, type AspectId, type Sentiment } from '../../../../packages/contracts/index';
import EvidenceText from './EvidenceText.vue';
import { api } from '../api';
const props = defineProps<{ reviews: Review[]; admin: boolean }>();
const emit = defineEmits<{ updated: [] }>();
const editing = ref<number | null>(null); const error = ref(''); const saving = ref(false);
const form = ref({ aspect: 'sound' as AspectId, sentiment: 'positive' as Sentiment, evidence: '', reason: '' });
function edit(review: Review) { editing.value = review.id; const opinion = review.opinions[0]; form.value = { aspect: opinion?.aspect ?? 'sound', sentiment: opinion?.sentiment ?? 'neutral', evidence: opinion?.evidence[0]?.text ?? review.text, reason: '' }; error.value = ''; }
async function save(review: Review) { saving.value = true; error.value = ''; try { await api(`/reviews/${review.id}/correction`, { method: 'PATCH', body: JSON.stringify(form.value) }); editing.value = null; emit('updated'); } catch (e) { error.value = (e as Error).message; } finally { saving.value = false; } }
</script>
<template>
  <div v-if="!reviews.length" class="empty-state"><p>没有符合条件的评论。试试其他筛选条件。</p></div>
  <article v-for="review in reviews" :key="review.id" class="review-entry">
    <div class="review-meta"><span>{{ review.externalId }} · {{ review.isSynthetic ? '教学合成样例' : review.source }}</span><button v-if="admin && review.analyzed" class="text-button" @click="edit(review)">人工复核</button></div>
    <p class="review-text"><EvidenceText :text="review.text" :opinions="review.opinions"/></p>
    <div class="review-tags"><span v-for="opinion in review.opinions" :key="opinion.aspect" class="badge" :class="opinion.status === 'review' ? 'pending' : opinion.sentiment">{{ ASPECTS.find(a => a.id === opinion.aspect)?.name }} · {{ opinion.status === 'review' ? '待复核' : SENTIMENT_NAMES[opinion.sentiment] }}{{ opinion.corrected ? ' · 已复核' : '' }}</span><span v-if="!review.analyzed" class="subtle">尚未分析</span><span v-else-if="!review.opinions.length" class="subtle">未识别到固定评价方面</span></div>
    <details v-if="review.opinions.some(o => o.rationale)" class="semantic-details"><summary>查看上下文分析与模型版本</summary><p class="subtle">{{ review.modelVersion }}</p><p v-for="o in review.opinions.filter(o => o.rationale)" :key="o.aspect">{{ ASPECTS.find(a => a.id === o.aspect)?.name }}：{{ o.rationale }}</p></details>
    <details v-if="review.opinions.some(o => o.corrected)" class="history-detail"><summary>查看原始模型判断</summary><p v-for="opinion in review.opinions.filter(o => o.corrected)" :key="opinion.aspect">{{ ASPECTS.find(a => a.id === opinion.aspect)?.name }}：{{ opinion.original ? SENTIMENT_NAMES[opinion.original.sentiment] : '原模型未识别' }} → {{ SENTIMENT_NAMES[opinion.sentiment] }}</p></details>
    <form v-if="editing === review.id" class="correction-form" @submit.prevent="save(review)"><h3>复核评论</h3><div class="form-grid"><label>评价方面<select v-model="form.aspect"><option v-for="a in ASPECTS" :value="a.id" :key="a.id">{{ a.name }}</option></select></label><label>情感标签<select v-model="form.sentiment"><option v-for="(name, value) in SENTIMENT_NAMES" :value="value" :key="value">{{ name }}</option></select></label></div><label>原文证据<input v-model="form.evidence" required :maxlength="1000"/></label><label>复核理由<input v-model="form.reason" required maxlength="300" placeholder="说明原判断需要调整的原因"/></label><p v-if="error" class="error-text" role="alert">{{ error }}</p><div class="actions"><button class="primary" :disabled="saving">{{ saving ? '保存中…' : '保存复核' }}</button><button type="button" class="secondary" @click="editing = null">取消</button></div></form>
  </article>
</template>
