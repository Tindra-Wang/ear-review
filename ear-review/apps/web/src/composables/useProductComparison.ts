import { computed, ref, watch, type Ref } from 'vue';
import { ASPECTS, type ProductStats } from '../../../../packages/contracts/index';
import { api } from '../api';
export function useProductComparison(error: Ref<string>) {
    const selectedProducts = ref<string[]>([]);
    const comparisons = ref<ProductStats[]>([]);
    const compareLoading = ref(false);
    const scenario = ref('all');
    const scenarioAspects = computed<readonly string[]>(() => ({ all: ASPECTS.map(a => a.id), commute: ['noise', 'comfort'], game: ['latency', 'sound'], long: ['comfort', 'battery'] })[scenario.value] ?? []);
    let compareRequest = 0;
    async function loadCompare() { const current = ++compareRequest; if (selectedProducts.value.length < 2) {
        comparisons.value = [];
        return;
    } compareLoading.value = true; try {
        const data = await api<ProductStats[]>(`/compare?ids=${selectedProducts.value.join(',')}`);
        if (current === compareRequest)
            comparisons.value = data;
    }
    catch (e) {
        if (current === compareRequest)
            error.value = (e as Error).message;
    }
    finally {
        if (current === compareRequest)
            compareLoading.value = false;
    } }
    watch(selectedProducts, () => void loadCompare(), { deep: true });
    return { selectedProducts, comparisons, compareLoading, scenario, scenarioAspects, loadCompare };
}
