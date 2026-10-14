import { ref, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { type Product, type ImportPreview, type Job, type ImportColumns, type ColumnMapping, type DataBatch } from '../../../../packages/contracts/index';
import { api, post, download } from '../api';
export function useDataWorkspace(admin: Ref<boolean>, error: Ref<string>, notice: Ref<string>, productId: Ref<string>, products: Ref<Product[]>) {
    const router = useRouter();
    const csv = ref('');
    const importName = ref('评论导入.csv');
    const importSource = ref('');
    const isSynthetic = ref(false);
    const preview = ref<ImportPreview | null>(null);
    const importBusy = ref(false);
    const importError = ref('');
    const columns = ref<ImportColumns | null>(null);
    const mapping = ref<ColumnMapping>({});
    const fallbackProduct = ref('');
    const encoding = ref('utf-8');
    const batchMode = ref('semantic');
    const fileBytes = ref<ArrayBuffer | null>(null);
    const batches = ref<DataBatch[]>([]);
    const jobs = ref<Job[]>([]);
    watch([csv, importSource, isSynthetic, importName, fallbackProduct, mapping], () => preview.value = null, { deep: true });
    watch(csv, () => { columns.value = null; mapping.value = {}; });
    watch(encoding, () => decodeFile());
    function decodeFile() { if (!fileBytes.value)
        return; try {
        csv.value = new TextDecoder(encoding.value, { fatal: true }).decode(fileBytes.value);
        importError.value = '';
    }
    catch {
        csv.value = '';
        importError.value = '文件编码不匹配，请改选 UTF-8 或 GB18030 后重试';
    } }
    async function inspectColumns() { importError.value = ''; importBusy.value = true; try {
        columns.value = await post<ImportColumns>('/imports/columns', { csv: csv.value });
        mapping.value = { ...columns.value.mapping };
    }
    catch (e) {
        importError.value = (e as Error).message;
    }
    finally {
        importBusy.value = false;
    } }
    const jobErrors = ref<Record<number, {
        reviewId: number;
        message: string;
    }[]>>({});
    async function loadJobErrors(jobId: number) { try {
        jobErrors.value[jobId] = await api(`/jobs/${jobId}/errors`);
    }
    catch (e) {
        error.value = (e as Error).message;
    } }
    async function readFile(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file)
        return; if (file.size > 5 * 1024 * 1024) {
        importError.value = '文件不能超过 5 MB';
        return;
    } fileBytes.value = await file.arrayBuffer(); importName.value = file.name; decodeFile(); if (csv.value)
        await inspectColumns(); }
    async function previewImport() { importBusy.value = true; importError.value = ''; try {
        preview.value = await post<ImportPreview>('/imports/preview', { csv: csv.value, name: importName.value, source: importSource.value, isSynthetic: isSynthetic.value, ...(columns.value ? { mapping: mapping.value } : {}), productId: fallbackProduct.value });
    }
    catch (e) {
        importError.value = (e as Error).message;
    }
    finally {
        importBusy.value = false;
    } }
    async function commitImport() { if (!preview.value)
        return; importBusy.value = true; importError.value = ''; try {
        const selected = preview.value.rows.find(r => r.valid && !r.duplicate)?.productId;
        const data = await post<{
            batchId: number;
            inserted: number;
        }>('/imports/commit', { token: preview.value.token });
        if (selected)
            productId.value = selected;
        preview.value = null;
        notice.value = `已保存 ${data.inserted} 条评论。`;
        products.value = await api<Product[]>('/products');
        await loadData();
        await post('/jobs', { batchId: data.batchId, mode: batchMode.value });
        notice.value = `已导入 ${data.inserted} 条评论，分析任务已创建。`;
        products.value = await api<Product[]>('/products');
        await loadData();
    }
    catch (e) {
        importError.value = (e as Error).message;
    }
    finally {
        importBusy.value = false;
    } }
    async function loadData() { if (!admin.value)
        return; try {
        const [b, j] = await Promise.all([api<typeof batches.value>('/batches'), api<Job[]>('/jobs')]);
        batches.value = b;
        jobs.value = j;
    }
    catch (e) {
        error.value = (e as Error).message;
    } }
    async function analyzeBatch(batchId: number) { try {
        await post('/jobs', { batchId, mode: batchMode.value });
        await loadData();
    }
    catch (e) {
        error.value = (e as Error).message;
    } }
    function templateDownload() { const blob = new Blob(['\uFEFFproductId,reviewId,text,source\nqingxing,example-001,"音质很好，但戴久了耳朵疼。",人工编写合成示例\n'], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '评论导入模板.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function useCollection(data: {
        csv: string;
        productId: string;
        url: string;
        platform: string;
    }) { csv.value = data.csv; fileBytes.value = null; encoding.value = 'utf-8'; fallbackProduct.value = data.productId; importSource.value = data.url; isSynthetic.value = false; importName.value = '平台评论.csv'; await router.push('/data'); await inspectColumns(); notice.value = '采集结果已载入，请核对列映射与耳机，再预览导入。'; }
    function clearData() { preview.value = null; jobs.value = []; batches.value = []; }
    return { csv, importName, importSource, isSynthetic, preview, importBusy, importError, columns, mapping, fallbackProduct, encoding, batchMode, batches, jobs, inspectColumns, jobErrors, loadJobErrors, readFile, previewImport, commitImport, loadData, analyzeBatch, templateDownload, useCollection, clearData };
}
