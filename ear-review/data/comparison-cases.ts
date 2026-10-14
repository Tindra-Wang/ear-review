import type { AspectId, Sentiment } from '../packages/contracts/index.js';
import { EVALUATION_CASES } from './evaluation-cases.js';
export interface ComparisonCase { id: string; group: 'teaching' | 'challenge'; kind: string; text: string; expected: [AspectId, Sentiment][] }
// Frozen before local model execution. Assistant-authored task probes, not consumer reviews or independent human gold.
export const COMPARISON_CASES: ComparisonCase[] = [
  ...EVALUATION_CASES.map((r, i) => ({ ...r, id: `teaching-${String(i+1).padStart(2,'0')}`, group: 'teaching' as const, kind: '教学检查' })),
  { id: 'challenge-01', group: 'challenge', kind: '反讽', text: '降噪真厉害，开了之后旁边装修的电钻声还是一清二楚，真是谢谢你。', expected: [['noise','negative']] },
  { id: 'challenge-02', group: 'challenge', kind: '反讽', text: '这续航真让我感动，充满电还没到公司就关机了。', expected: [['battery','negative']] },
  { id: 'challenge-03', group: 'challenge', kind: '隐含通话评价', text: '戴着这副耳机开会，对方让我把同一句话重复了三遍才听明白。', expected: [['call','negative']] },
  { id: 'challenge-04', group: 'challenge', kind: '隐含舒适度', text: '十分钟就得摘下来揉一揉耳朵，听一张专辑要休息好几次。', expected: [['comfort','negative']] },
  { id: 'challenge-05', group: 'challenge', kind: '隐含续航', text: '每天上下班都用，周一充完一直撑到周五，省得每天找插座。', expected: [['battery','positive']] },
  { id: 'challenge-06', group: 'challenge', kind: '同方面情境冲突', text: '办公室里降噪不错，上地铁却压不住轰鸣，两种场合差别很大。', expected: [['noise','mixed']] },
  { id: 'challenge-07', group: 'challenge', kind: '同方面正负混合', text: '音质的人声部分很清晰，低音却糊成一团，听不同曲子感受完全不同。', expected: [['sound','mixed']] },
  { id: 'challenge-08', group: 'challenge', kind: '跨方面相反', text: '听歌的细节让我很满意，就是每次戴半小时都压得耳朵疼。', expected: [['sound','positive'],['comfort','negative']] },
  { id: 'challenge-09', group: 'challenge', kind: '双重否定', text: '音质并不是不好，只是低音不够震撼；人声通透这一点我还是喜欢的。', expected: [['sound','mixed']] },
  { id: 'challenge-10', group: 'challenge', kind: '否定负面', text: '戴了一下午也没有夹耳，耳朵不疼，终于能安心听完一整张专辑。', expected: [['comfort','positive']] },
  { id: 'challenge-11', group: 'challenge', kind: '比较评价', text: '和上一副相比，这副的麦克风糟糕太多了，现在打电话对方总说声音含糊。', expected: [['call','negative']] },
  { id: 'challenge-12', group: 'challenge', kind: '比较评价', text: '以前玩游戏总是画面先动声音才到，这副已经基本同步，我很满意。', expected: [['latency','positive']] },
  { id: 'challenge-13', group: 'challenge', kind: '指代与转折', text: '降噪和续航都试了。前者隔绝地铁轰鸣很出色，后者撑不到两小时，太失望了。', expected: [['noise','positive'],['battery','negative']] },
  { id: 'challenge-14', group: 'challenge', kind: '指代', text: '佩戴和通话是我最在意的两项。前者舒服，后者让我听见对方不断抱怨听不清。', expected: [['comfort','positive'],['call','negative']] },
  { id: 'challenge-15', group: 'challenge', kind: '客观功能', text: '说明书写着支持主动降噪和无线充电，我还没有试用效果。', expected: [['noise','neutral'],['battery','neutral']] },
  { id: 'challenge-16', group: 'challenge', kind: '领域外抱怨', text: '快递迟到三天，客服一直不回复，耳机还没拆封，暂时不知道好不好。', expected: [] },
  { id: 'challenge-17', group: 'challenge', kind: 'emoji与口语', text: '🎧 声音闷得像蒙了层被子，唱什么都糊，真的受不了。', expected: [['sound','negative']] },
  { id: 'challenge-18', group: 'challenge', kind: '程度与情境', text: '刷视频音画还算同步，打游戏却慢得没法玩，这延迟表现有好有坏。', expected: [['latency','mixed']] }
];
