<script setup lang="ts">
import { computed } from 'vue';
import { Upload, ArrowRight, RefreshCw } from 'lucide-vue-next';
import { ASPECTS, type Product, type ProductStats, type ProductSummary } from '../../../../packages/contracts/index';
const props=defineProps<{products:Product[];productId:string;stats:ProductStats|null;summary:ProductSummary|null;ready:boolean}>();
const emit=defineEmits<{select:[id:string];refresh:[]}>();
const hasOpinions=computed(()=>props.stats?.aspects.some(a=>a.total||a.pending));
</script>
<template>
  <div class="page-heading overview-heading"><div><h1>这款耳机，大家怎么说？</h1><p>导入一批评论，用本地模型整理音质、降噪、佩戴等六项反馈。</p></div><RouterLink class="primary" to="/data"><Upload :size="17"/>导入 CSV</RouterLink></div>
  <div class="overview-toolbar"><label>查看耳机<select aria-label="查看耳机" :value="productId" @change="emit('select',($event.target as HTMLSelectElement).value)"><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><RouterLink to="/collect" class="text-button">从平台采集评论<ArrowRight :size="15"/></RouterLink><button class="text-button" @click="emit('refresh')"><RefreshCw :size="15"/>刷新结果</button></div>
  <p v-if="!ready" class="inline-note warning">本地语义模型暂未连接。可以先导入评论，连接模型后再运行批量分析。</p>
  <template v-if="stats">
    <div class="overview-context"><div><h2>{{ stats.product.name }}</h2><p>{{ stats.product.subtitle }}</p></div><div class="overview-counts"><span><strong>{{ stats.reviews }}</strong> 条评论</span><span><strong>{{ stats.analyzed }}</strong> 已分析</span><span><strong>{{ summary?.pending ?? 0 }}</strong> 项待复核</span></div></div>
    <p v-if="stats.synthetic" class="data-note">当前包含 {{ stats.synthetic }} 条教学合成样例。请导入自己的真实评论查看对应耳机的反馈。</p>
    <p v-if="stats.reviews>stats.analyzed" class="data-note">还有 {{ stats.reviews-stats.analyzed }} 条评论未成功分析。到评论导入页查看进度或失败原因。</p>
    <div v-if="!hasOpinions" class="panel empty-state"><h2>还没有可汇总的方面评价</h2><p>先导入这款耳机的 CSV，再用本地模型分析。结果会展示在这里。</p><RouterLink class="primary" to="/data">导入并分析评论</RouterLink></div>
    <template v-else>
      <section class="overview-findings" aria-label="优点与不足"><div><h2>正面反馈</h2><p class="subtle">用户认可哪些方面</p><ol v-if="summary?.strengths.length"><li v-for="point in summary.strengths.slice(0,3)" :key="point.aspect"><strong>{{ ASPECTS.find(a=>a.id===point.aspect)?.name }}</strong><span>{{ point.count }} / {{ point.total }} 条该方面评价为正面</span><blockquote v-if="point.evidence[0]">“{{ point.evidence[0].text }}”</blockquote></li></ol><p v-else class="finding-empty">暂未提取到已判定的正面反馈。</p></div><div><h2>负面反馈</h2><p class="subtle">购买前值得留意的地方</p><ol v-if="summary?.weaknesses.length"><li v-for="point in summary.weaknesses.slice(0,3)" :key="point.aspect"><strong>{{ ASPECTS.find(a=>a.id===point.aspect)?.name }}</strong><span>{{ point.count }} / {{ point.total }} 条该方面评价为负面</span><blockquote v-if="point.evidence[0]">“{{ point.evidence[0].text }}”</blockquote></li></ol><p v-else class="finding-empty">暂未提取到已判定的负面反馈。</p></div></section>
      <div class="section-heading"><h2>六项评价分布</h2><RouterLink to="/products" class="text-button">核对评论原文<ArrowRight :size="15"/></RouterLink></div>
      <section class="panel distribution-panel"><div v-for="a in stats.aspects" :key="a.aspect" class="distribution-row"><span class="distribution-name">{{ ASPECTS.find(item=>item.id===a.aspect)?.name }}</span><div class="distribution-data"><div class="stacked-bar" :aria-label="`正面${a.positive}，负面${a.negative}，中性${a.neutral}，混合${a.mixed}`"><span v-for="s in (['positive','negative','neutral','mixed'] as const)" :key="s" :class="s" :style="{width:`${a.total?a[s]/a.total*100:0}%`}"/></div><span class="distribution-caption">正面 {{ a.positive }} · 负面 {{ a.negative }} · 中性 {{ a.neutral }} · 混合 {{ a.mixed }}</span></div><span class="ratio">{{ a.positiveRatio===null?'—':`${a.positiveRatio}%` }}<small>正面占比</small></span><span class="sample-size">{{ a.total }} 条已判定<small>{{ a.total<20?'样本不足':`${a.pending} 项待复核` }}</small></span></div></section>
      <p class="overview-footnote">占比以该方面已判定评价为分母，未提及与待复核不计入；混合表示同方面存在正负反馈。上述总结来自评论统计与原文证据，不代表实测性能或购买保证。</p>
    </template>
  </template><div v-else-if="products.length" class="empty-state" role="status">正在读取评论汇总…</div><div v-else class="panel empty-state"><h2>从一款耳机开始</h2><p>创建耳机记录，上传你的评论 CSV，查看大家认可与不满的方面。</p><RouterLink class="primary" to="/data">开始导入</RouterLink></div>
</template>
