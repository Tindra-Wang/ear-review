import { computed, ref, watch, type Ref } from 'vue';
import { type Analysis } from '../../../../packages/contracts/index';
import { post } from '../api';
export function useSingleAnalysis(error: Ref<string>) {
    const busy = ref(false);
    const text = ref('音质很清晰，降噪效果不错。但戴久了耳朵疼，打游戏声音慢半拍。');
    const examples = ['音质很清晰，降噪效果不错。但戴久了耳朵疼，打游戏声音慢半拍。', '降噪真厉害，开了之后地铁广播听得一清二楚，真是谢谢你。', '昨天戴着它开会，对方让我重复了三遍。回家听歌倒是很享受。', '安静办公室里降噪挺舒服，到了地铁上却完全压不住。'];
    const mode = ref('hybrid');
    const maxChars = computed(() => mode.value === 'semantic' ? 5000 : 1000);
    const result = ref<Analysis | null>(null);
    const chars = computed(() => Array.from(text.value).length);
    watch(mode, () => { result.value = null; });
    async function runAnalysis() { if (busy.value)
        return; busy.value = true; error.value = ''; try {
        result.value = await post<Analysis>('/analyze', { text: text.value, mode: mode.value });
    }
    catch (e) {
        error.value = (e as Error).message;
    }
    finally {
        busy.value = false;
    } }
    function sample(index: number) { text.value = examples[index]!; void runAnalysis(); }
    return { busy, text, examples, mode, maxChars, result, chars, runAnalysis, sample };
}
