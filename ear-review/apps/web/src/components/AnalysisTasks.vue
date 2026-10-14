<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Job } from '../../../../packages/contracts/index';
export interface DataBatch { id:number; name:string; source:string; count:number; createdAt?:string; products?:{id:string;name:string;count:number}[]; summary?:{submitted?:number;invalid?:number;duplicates?:number} }
const props=defineProps<{jobs:Job[];batches:DataBatch[];errors:Record<number,{reviewId:number;message:string}[]>}>();
const emit=defineEmits<{retry:[batchId:number];errors:[jobId:number]}>();
const history=ref(false);
const latest=computed(()=>props.jobs.filter(j=>!props.jobs.some(other=>other.batchId===j.batchId&&other.id>j.id)));
const displayed=computed(()=>history.value?props.jobs:latest.value);
const historical=(job:Job)=>!latest.value.some(j=>j.id===job.id);
const batch=(job:Job)=>props.batches.find(b=>b.id===job.batchId);
const names={queued:'等待中',running:'分析中',completed:'已完成',failed:'分析结束，存在失败'};
const method=(version:string)=>version.startsWith('ollama-')?'本地语义模型 · Qwen3':version.startsWith('mnb-')?'朴素贝叶斯 + 规则':'文本分析模型';
const time=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'时间未记录':date.toLocaleString('zh-CN',{hour12:false});};
</script>
<template>
  <div class="task-list-toolbar"><p>按数据批次展示最新任务；已尝试包含成功与失败，重试保留历史记录。</p><button v-if="jobs.length>latest.length" class="text-button" @click="history=!history">{{ history?'收起历史任务':'查看历史任务' }}</button></div>
  <div v-if="!jobs.length" class="panel empty-state compact">导入评论后，这里显示分析进度。</div>
  <div class="task-list">
    <article v-for="job in displayed" :key="job.id" class="job-row task-card" :aria-label="`分析任务 ${job.id}`">
      <header class="task-card-header"><div><h3>{{ batch(job)?.products?.map(p=>p.name).join('、') || batch(job)?.name || `评论批次 #${job.batchId}` }}</h3><p class="task-identifiers">批次 #{{ job.batchId }} · 任务 #{{ job.id }}{{ historical(job)?'（历史记录）':'（最新）' }}</p></div><span class="job-status task-status" :class="job.status">{{ names[job.status] }} · 已尝试 {{ job.processed }}/{{ job.total }}</span></header>
      <dl class="task-details"><div><dt>数据文件</dt><dd>{{ batch(job)?.name || '批次信息未加载' }}</dd></div><div><dt>数据来源</dt><dd>{{ batch(job)?.source || '来源未记录' }}</dd></div><div><dt>分析方法</dt><dd>{{ method(job.modelVersion) }}<small>{{ job.modelVersion }}</small></dd></div><div><dt>创建时间</dt><dd>{{ time(job.createdAt) }}</dd></div></dl>
      <div class="task-progress"><progress :value="job.processed" :max="Math.max(job.total,1)" :aria-label="`任务 ${job.id} 已尝试 ${job.processed} 条，共 ${job.total} 条`"/><span>{{ job.total }} 条评论 · {{ Math.max(0,job.total-job.processed) }} 条未尝试</span></div>
      <div v-if="job.error || job.status==='failed'" class="task-error"><p v-if="job.error">{{ job.error }}</p><div class="task-actions"><button v-if="!historical(job)" class="secondary small" @click="emit('retry',job.batchId)">重试</button><button class="text-button" @click="emit('errors',job.id)">查看失败评论</button></div><ul v-if="errors[job.id]?.length" class="task-error-list"><li v-for="failure in errors[job.id]" :key="failure.reviewId">评论 #{{ failure.reviewId }}：{{ failure.message }}</li></ul></div>
    </article>
  </div>
</template>
