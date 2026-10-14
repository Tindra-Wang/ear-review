# 本地文本模型与自行训练分类器对照实验报告

实验完成日期：2026年10月13日星期二 GMT+8 16:52:25。本报告由实际运行结果生成；命令教程另在交付回复提供。

## 1. 实验目标与边界

比较本地预训练文本模型与项目自行训练分类器，验证CSV业务所用分析模块的质量、证据和耗时。Qwen3只推理，没有微调；MNB由126条教学合成样例训练。参考标签和测试评论由开发助手编写，不是真实消费者数据，未经过双人独立标注；该结果只能作为实现检查和复杂表达探针，不能宣称领域准确率或模型最优性。

同一测试集共42条：24条原有教学检查，18条新增复杂表达。测试在本地语义结果出现前固定，未据此调提示或模型。数据SHA256：6aa3cfb909b1592db370188ae4d4e9cea81a68ee2212608a7ccfe9cb990acb4e。没有训练/测试相同的完整评论，不代表语料来源独立或不存在风格泄漏。

## 2. 实现与运行条件

CSV经编码解码、字段映射、校验、去重和事务入库；批次Worker调用同一分析模块，持久化版本化意见；证据必须逐字存在于原文，不满足则请求失败，失败不会改用基线。此次质量评价直接调用分析模块，另以实际Web导入检查验证业务闭环。

Qwen3标签qwen3:4b；digest 359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7；下载文件大小2497293931字节；运行时{"version":"0.40.3"}；提示版本absa-v1。权重目录为D:\NLP\大作业\模型权重。

设备：Intel(R) Core(TM) Ultra 9 275HX，内存31.43GiB；NVIDIA GeForce RTX 5060 Laptop GPU, 8151 MiB, 592.01。加载设备信息保存于原始JSON的device字段。2秒采样整卡已用显存最大值4984MiB，包含其他进程，不是隔离模型显存。

解码：非思考模式，temperature=0，上下文16384，输出上限4096。预热请求约285ms，加载约7.07ms；该预热样例不参与质量评分。

## 3. 分类器训练

字符1/2/3gram和方面标记形成1172项词表，三类各42条，使用多项式朴素贝叶斯与加一平滑。当前训练函数耗时2.004ms，只含内存计数，不含启动/文件IO；没有epoch、优化器或梯度loss。训练模型保存在D:\NLP\大作业\模型权重\classifiers\mnb-8a862b69.json，51217字节，版本mnb-8a862b69，模型SHA256为ff9243a0c7005f2132043f22ffea591bbb76ef6067bde942fb5e091552b725fd。

纯MNB与hybrid共享词典方面识别和分句；纯MNB关闭情感规则及分差拒判，对检测到的片段直接分类；hybrid保留规则与拒判。两者都无法通过方面词典检测到未命中表达，需与Qwen3完整上下文抽取区分。

## 4. 同一测试集的结果

### 自行训练MNB（不加情感规则）

全体：方面micro-F1 98.04%；方面—情感micro-F1 78.43%；支持类别macro-F1 77.01%；整评论标签集合完全匹配 76.19%。
教学24条：方面—情感F1 93.33%；复杂18条：方面—情感F1 57.14%。
全体TP/FP/FN=40/11/11，失败0条，待复核0条方面意见。成功分析p50/p95=0.2/0.47ms。

### MNB＋领域规则（当前基线）

全体：方面micro-F1 98.04%；方面—情感micro-F1 79.55%；支持类别macro-F1 75.39%；整评论标签集合完全匹配 66.67%。
教学24条：方面—情感F1 98.31%；复杂18条：方面—情感F1 41.38%。
全体TP/FP/FN=35/2/16，失败0条，待复核14条方面意见。成功分析p50/p95=0.15/0.64ms。

### 规则决策对照

全体：方面micro-F1 98.04%；方面—情感micro-F1 76.74%；支持类别macro-F1 73.09%；整评论标签集合完全匹配 61.90%。
教学24条：方面—情感F1 98.31%；复杂18条：方面—情感F1 29.63%。
全体TP/FP/FN=33/2/18，失败0条，待复核16条方面意见。成功分析p50/p95=0.13/0.46ms。

### 本地Qwen3-4B（预训练推理）

全体：方面micro-F1 82.00%；方面—情感micro-F1 0.00%；支持类别macro-F1 0.00%；整评论标签集合完全匹配 4.76%。
教学24条：方面—情感F1 0.00%；复杂18条：方面—情感F1 0.00%。
全体TP/FP/FN=0/0/51，失败4条，待复核49条方面意见。成功分析p50/p95=1996/3648ms。

## 5. 评分口径

方面F1比较固定类别集合；方面—情感F1同时要求类别与情感正确。待复核不进入已判定预测，但真值仍计漏判；失败请求保留在质量评分中；错误标签产生FP及FN。macro-F1按该子集中存在真值的情感类别平均；逐类支持数在原始JSON。p50/p95仅来自成功函数调用，基线为进程内计时，Qwen3包含HTTP和生成，不包括Web入库/画像，因此不能当成相同服务端端到端时延。

原文子串有效率只说明位置与内容一致，不能证明情感和理由语义正确。强度不是置信度。一次低温运行不证明生成确定性；不同权重、运行时、提示或设备应重新测试。

## 6. 逐条差异与错误

完整逐条预测、证据、理由、拒判和请求失败见 [逐条模型对照.csv](实验结果/absa-v1/逐条模型对照.csv)，原始结果见 [模型对照结果.json](实验结果/absa-v1/模型对照结果.json)。下面列出复杂样例差异，不只选成功案例：

- challenge-01（反讽）：“降噪真厉害，开了之后旁边装修的电钻声还是一清二楚，真是谢谢你。” 参考=noise:negative；纯MNB=noise:negative；Qwen3=noise:positive（待复核）。
- challenge-02（反讽）：“这续航真让我感动，充满电还没到公司就关机了。” 参考=battery:negative；纯MNB=battery:negative；Qwen3=battery:negative（待复核）。
- challenge-03（隐含通话评价）：“戴着这副耳机开会，对方让我把同一句话重复了三遍才听明白。” 参考=call:negative；纯MNB=comfort:positive；call:negative；Qwen3=无固定方面。
- challenge-04（隐含舒适度）：“十分钟就得摘下来揉一揉耳朵，听一张专辑要休息好几次。” 参考=comfort:negative；纯MNB=comfort:negative；Qwen3=comfort:negative（待复核）。
- challenge-05（隐含续航）：“每天上下班都用，周一充完一直撑到周五，省得每天找插座。” 参考=battery:positive；纯MNB=无固定方面；Qwen3=无固定方面。
- challenge-06（同方面情境冲突）：“办公室里降噪不错，上地铁却压不住轰鸣，两种场合差别很大。” 参考=noise:mixed；纯MNB=noise:positive；Qwen3=失败：模型返回未知或重复方面。
- challenge-07（同方面正负混合）：“音质的人声部分很清晰，低音却糊成一团，听不同曲子感受完全不同。” 参考=sound:mixed；纯MNB=sound:mixed；Qwen3=sound:mixed（待复核）。
- challenge-08（跨方面相反）：“听歌的细节让我很满意，就是每次戴半小时都压得耳朵疼。” 参考=sound:positive；comfort:negative；纯MNB=sound:positive；comfort:negative；Qwen3=sound:positive（待复核）；comfort:negative（待复核）。
- challenge-09（双重否定）：“音质并不是不好，只是低音不够震撼；人声通透这一点我还是喜欢的。” 参考=sound:mixed；纯MNB=sound:mixed；Qwen3=sound:mixed（待复核）。
- challenge-10（否定负面）：“戴了一下午也没有夹耳，耳朵不疼，终于能安心听完一整张专辑。” 参考=comfort:positive；纯MNB=comfort:mixed；Qwen3=无固定方面。
- challenge-11（比较评价）：“和上一副相比，这副的麦克风糟糕太多了，现在打电话对方总说声音含糊。” 参考=call:negative；纯MNB=call:mixed；Qwen3=call:negative（待复核）。
- challenge-12（比较评价）：“以前玩游戏总是画面先动声音才到，这副已经基本同步，我很满意。” 参考=latency:positive；纯MNB=latency:positive；Qwen3=latency:positive（待复核）。
- challenge-13（指代与转折）：“降噪和续航都试了。前者隔绝地铁轰鸣很出色，后者撑不到两小时，太失望了。” 参考=noise:positive；battery:negative；纯MNB=noise:negative；battery:positive；Qwen3=noise:positive（待复核）；battery:negative（待复核）。
- challenge-14（指代）：“佩戴和通话是我最在意的两项。前者舒服，后者让我听见对方不断抱怨听不清。” 参考=comfort:positive；call:negative；纯MNB=comfort:neutral；call:mixed；Qwen3=comfort:positive（待复核）；call:negative（待复核）。
- challenge-15（客观功能）：“说明书写着支持主动降噪和无线充电，我还没有试用效果。” 参考=noise:neutral；battery:neutral；纯MNB=noise:neutral；battery:neutral；Qwen3=无固定方面。
- challenge-16（领域外抱怨）：“快递迟到三天，客服一直不回复，耳机还没拆封，暂时不知道好不好。” 参考=无固定方面；纯MNB=无固定方面；Qwen3=sound:neutral（待复核）；noise:neutral（待复核）；comfort:neutral（待复核）；battery:neutral（待复核）；call:neutral（待复核）；latency:neutral（待复核）。
- challenge-17（emoji与口语）：“🎧 声音闷得像蒙了层被子，唱什么都糊，真的受不了。” 参考=sound:negative；纯MNB=sound:negative；Qwen3=失败：模型生成了原文不存在的证据，本条分析失败，请重试或人工复核。
- challenge-18（程度与情境）：“刷视频音画还算同步，打游戏却慢得没法玩，这延迟表现有好有坏。” 参考=latency:mixed；纯MNB=latency:positive；Qwen3=latency:negative（待复核）。

## 7. 结论与局限

该固定合成检查集上，Qwen3相对纯MNB的方面—情感F1差值为-78.43个百分点。该差值是本次实测，不外推其他数据或将报告写成预设优胜结论。是否适合真实耳机评论，还需授权数据、独立人工标注、验证/测试划分及多次测量。

模型适配已经完成本地实际运行和同一输入对照；统计界面、人工复核和CSV导入提供业务闭环。真实训练语料扩充、神经网络微调、跨型号泛化和全规模5000条性能验收仍未完成。

结果文件的complete=true表示42条全部尝试并完成结果汇总，不表示每条模型请求都成功。失败数量按上文和原始JSON如实报告。


## 8. 暂停与恢复记录

实验按用户要求暂停后恢复，保留原有22条预测与耗时，继续剩余测试。恢复前核对固定测试集、训练集、分析源码、提示、解码配置、模型权重digest、分类器SHA256及Ollama版本一致。预热不计入评分，恢复记录见原始JSON的resumptions。显存最大值仅覆盖恢复阶段，不是整场实验峰值。
