<script setup lang="ts">
import type { ColumnMapping, ImportColumns } from '../../../../packages/contracts/index';
defineProps<{ columns: ImportColumns; modelValue: ColumnMapping }>();
const emit = defineEmits<{ 'update:modelValue': [ColumnMapping] }>();
const fields = { text: '评论正文（必选）', reviewId: '评论编号（可自动生成）', productId: '产品 ID（可统一指定）', source: '数据来源（可统一填写）' };
</script>
<template>
  <div class="column-mapping">
    <p class="subtle">识别到 {{ columns.total }} 条记录。确认原始列的含义；商品型号、评分不能作为情感真值。</p>
    <div class="form-grid"><label v-for="(label, key) in fields" :key="key">{{ label }}<select :aria-label="label" :value="modelValue[key] || ''" @change="emit('update:modelValue', { ...modelValue, [key]: ($event.target as HTMLSelectElement).value })"><option value="">{{ key === 'text' ? '请选择正文列' : '不使用此列' }}</option><option v-for="header in columns.headers" :key="header" :value="header">{{ header }}</option></select></label></div>
    <details><summary>核对原始文件前 3 行</summary><div class="table-scroll"><table><thead><tr><th v-for="h in columns.headers" :key="h">{{ h }}</th></tr></thead><tbody><tr v-for="(row, i) in columns.sample" :key="i"><td v-for="h in columns.headers" :key="h">{{ row[h] }}</td></tr></tbody></table></div></details>
  </div>
</template>
