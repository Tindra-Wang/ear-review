import { ref, watch, type Ref } from 'vue';
import { type ProductStats, type Review, type AspectId, type ProductSummary } from '../../../../packages/contracts/index';
import { api, download } from '../api';
export function useProductReviews(error: Ref<string>, notice: Ref<string>, onComparisonRefresh: () => Promise<void>) {
    const summary = ref<ProductSummary | null>(null);
    const productId = ref('');
    const stats = ref<ProductStats | null>(null);
    const pure = ref(false);
    const filters = ref({ aspect: '', sentiment: '', search: '', pending: false, corrected: false });
    const reviews = ref<Review[]>([]);
    const page = ref(1);
    const total = ref(0);
    const loadingReviews = ref(false);
    let reviewRequest = 0;
    let statsRequest = 0;
    function reviewQuery() { return new URLSearchParams({ productId: productId.value, aspect: filters.value.aspect, sentiment: filters.value.sentiment, search: filters.value.search, pending: String(filters.value.pending), corrected: String(filters.value.corrected), pure: String(pure.value), page: String(page.value), size: '8' }).toString(); }
    async function loadReviews() { const current = ++reviewRequest; loadingReviews.value = true; try {
        const data = await api<{
            rows: Review[];
            total: number;
        }>(`/reviews?${reviewQuery()}`);
        if (current === reviewRequest) {
            reviews.value = data.rows;
            total.value = data.total;
        }
    }
    catch (e) {
        if (current === reviewRequest)
            error.value = (e as Error).message;
    }
    finally {
        if (current === reviewRequest)
            loadingReviews.value = false;
    } }
    async function loadStats() { if (!productId.value)
        return; const current = ++statsRequest; try {
        const [data, points] = await Promise.all([api<ProductStats>(`/products/${productId.value}/stats?pure=${pure.value}`), api<ProductSummary>(`/products/${productId.value}/summary?pure=${pure.value}`)]);
        if (current === statsRequest) {
            stats.value = data;
            summary.value = points;
        }
    }
    catch (e) {
        error.value = (e as Error).message;
    } }
    async function refreshed() { await Promise.all([loadReviews(), loadStats(), onComparisonRefresh()]); notice.value = '复核已保存，画像与对比已同步更新。'; }
    watch([productId, pure], () => { page.value = 1; void loadStats(); void loadReviews(); });
    watch(page, () => void loadReviews());
    function applyFilters() { page.value = 1; void loadReviews(); }
    function selectAspect(aspect: AspectId) { filters.value.aspect = filters.value.aspect === aspect ? '' : aspect; applyFilters(); }
    async function exportReviews() { try {
        await download(`/export?${reviewQuery()}`, '耳机评论分析结果.csv');
    }
    catch (e) {
        error.value = (e as Error).message;
    } }
    return { summary, productId, stats, pure, filters, reviews, page, total, loadingReviews, loadReviews, loadStats, refreshed, applyFilters, selectAspect, exportReviews };
}
