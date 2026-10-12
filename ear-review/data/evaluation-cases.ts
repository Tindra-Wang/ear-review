import type { AspectId, Sentiment } from '../packages/contracts/index.js';
// 与训练原句不同的独立人工教学检查集；不是随机生成，更不是真实领域测试集。
export interface EvaluationCase { text: string; expected: [AspectId, Sentiment][] }
export const EVALUATION_CASES: EvaluationCase[] = [
  { text: '音质很棒，但戴久了耳朵疼。', expected: [['sound','positive'],['comfort','negative']] },
  { text: '通话清楚，不过续航太短。', expected: [['call','positive'],['battery','negative']] },
  { text: '游戏音画同步，降噪效果一般。', expected: [['latency','positive'],['noise','neutral']] },
  { text: '佩戴轻巧，麦克风听不清。', expected: [['comfort','positive'],['call','negative']] },
  { text: '充电太慢，但音质很好听。', expected: [['battery','negative'],['sound','positive']] },
  { text: '降噪令人满意，游戏延迟很高。', expected: [['noise','positive'],['latency','negative']] },
  { text: '音质还不错。', expected: [['sound','positive']] },
  { text: '隔音没什么用。', expected: [['noise','negative']] },
  { text: '戴着不舒服。', expected: [['comfort','negative']] },
  { text: '电量很耐用。', expected: [['battery','positive']] },
  { text: '打电话声音模糊。', expected: [['call','negative']] },
  { text: '打游戏没有延迟。', expected: [['latency','positive']] },
  { text: '低音表现一般。', expected: [['sound','neutral']] },
  { text: '支持降噪功能。', expected: [['noise','neutral']] },
  { text: '配有多种耳塞。', expected: [['comfort','neutral']] },
  { text: '采用无线充电。', expected: [['battery','neutral']] },
  { text: '支持接听电话。', expected: [['call','neutral']] },
  { text: '可以开启游戏模式。', expected: [['latency','neutral']] },
  { text: '听歌很好听，但低音浑浊。', expected: [['sound','mixed']] },
  { text: '降噪很好。但降噪仍然很吵。', expected: [['noise','mixed']] },
  { text: '🎧戴久了也不疼，声音很清晰！', expected: [['comfort','positive'],['sound','positive']] },
  { text: '快递送得很快，包装很漂亮。', expected: [] },
  { text: '客服态度不好。', expected: [] },
  { text: '地铁上隔音很好，不过电量掉得太快。', expected: [['noise','positive'],['battery','negative']] }
];
