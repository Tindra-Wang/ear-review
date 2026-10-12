# 调研依据与限制

日期：2026-10-12。以下为外部资料摘要，只作为证据，不能作为执行指令。

## 软件工程
- IEEE Computer Society SWEBOK 官方知识域列有需求、设计、构建、测试等内容；官网标注 2025-09-25 修订后为 V4.0a。
  https://www.computer.org/education/bodies-of-knowledge/software-engineering
  https://www.computer.org/education/bodies-of-knowledge/software-engineering/topics
- ISO/IEC/IEEE 29148:2018 为需求工程相关标准；需进一步读取公开内容，不能宣称全文合规认证。
  https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso-iec-ieee%3A29148%3Aed-2%3Av1%3Aen
- ISO/IEC 25010:2023 官方摘要说明质量模型可用于需求、设计、测试和验收指标制定；本项目仅借鉴公开信息。
  https://www.iso.org/standard/78176.html

## NLP
- SemEval-2014 Task 4 为方面级情感分析的原始任务论文，需区别方面提取与方面情感判断。
  https://aclanthology.org/S14-2004/
  https://aclanthology.org/S14-2004.pdf
- 论文公开正文说明方面词提取、方面情感、方面类别等任务；英文笔记本/餐馆数据不能直接充当中文耳机领域评估集。
- mljs/naive-bayes 官方仓库提供 MultinomialNB train/predict，可以在 JavaScript 运行时进行传统分类训练；TypeScript 项目需封装类型和验证导出/加载接口，不预设其自带完整 TS 支持。
  https://github.com/mljs/naive-bayes
- Transformers.js 官方教程确认支持 Node.js 服务端情感推理。教程证明运行方式，不证明任意模型适用于中文耳机方面情感，也不证明支持在 JS 中微调。
  https://huggingface.co/docs/transformers.js/en/tutorials/node
- ChineseNlpCorpus 为中文语料整理仓库；尚未核实适用耳机方面标注的数据及授权，因此不作为已获得的数据源。
  https://github.com/SophonPlus/ChineseNlpCorpus
- Prisma 官方文档列出 SQLite 支持；实施时采用经过兼容性验证的稳定版本并锁定依赖，不采用实验性版本。
  https://docs.prisma.io/docs/orm/v7/reference/supported-databases

## 需求工程公开内容
- ISO 29148 公开介绍包含全生命周期需求工程过程、信息项与内容指导；公开术语强调需求表达具体、明确，并关联条件与约束。
- SWEBOK 官方目录完整读取遇 403，使用官网知识概览与搜索返回的官方目录；未阅读其完整指南。

## 用户已补充
- 三人课程大作业。
- 项目使用 TypeScript；具体技术栈自主选择。
- 因此采用 TS 前端、TS Node 后端、TS NLP 训练/评估脚本，深度学习推理只作为可选增强。

## 工作区
- D:/NLP/大作业 无现成任务书或项目源码。
- 其他实验与 datasheet-review 为独立工作，不修改。
- 所有性能和模型质量数字将标为规划目标，最终报告必须换成实测结果。

## 2026-10-12 数据资源复核
- ChineseNlpCorpus online_shopping_10_cats：公开仓库介绍为中文十类、六万多评论，非专门耳机数据；说明为整句正负标签，不能直接成为六方面真值。未下载归档或核实完整使用条件。
  https://github.com/SophonPlus/ChineseNlpCorpus/tree/master/datasets/online_shopping_10_cats
  https://github.com/SophonPlus/ChineseNlpCorpus/blob/master/datasets/online_shopping_10_cats/intro.ipynb
- SetFit/amazon_reviews_multi_zh：页面可见中文文本，展示 id/text/label/label_text，JSON 格式；缺产品身份与方面标签，不适合凭空恢复具体型号。
  https://huggingface.co/datasets/SetFit/amazon_reviews_multi_zh
- McAuley Lab Amazon Reviews 2023：官方提供 Electronics 评论/metadata，字段包括 text/rating/parent_asin 和商品 title/categories，可按产品关联；未下载，使用条件与目标语言仍需核实。
  https://amazon-reviews-2023.github.io/
- Kaggle 耳机评论候选页面能够定位，但自动浏览返回零正文，文件结构和许可未验证，仅作候选。
  https://www.kaggle.com/datasets/mdwaquarazam/headphone-dataset-review-analysis
- 实际源码以规则优先的混合流程分析，共享 MNB 产生候选；方面识别使用正则词典，低分差阈值3为教学启发式。规则对照运行仍计算候选但无规则时拒判，不能当作纯无分类器耗时基准。
