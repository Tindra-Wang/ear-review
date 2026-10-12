# 听见 · 自然语言处理课程大作业

本仓库同步“大作业”目录的项目源码、开发方案、报告说明和页面截图。

系统使用 TypeScript、Vue 3、NestJS 和 SQLite，核心为中文耳机评论的方面识别、情感分类及原文证据高亮，支持产品画像、对比、CSV 导入和人工复核。

## 本地运行

安装 Node.js 24.14 或更高版本，进入 `ear-review` 文件夹，双击 `启动系统.bat`。首次准备依赖需要网络，启动成功后自动打开浏览器。默认地址为 http://127.0.0.1:3001 。

也可以在终端执行：

```powershell
cd ear-review
npm ci
npm run build
npm start
```

管理员账号为 `admin`，首次运行密码生成在本地 `ear-review/data/runtime/admin-password.txt`，密码和运行数据库不会提交到仓库。

## 项目资料

- [启动、训练与测试说明](ear-review/README.md)
- [需求规格与详细设计](ear-review/docs/需求规格与详细设计.md)
- [软件工程课程报告底稿](ear-review/docs/软件工程课程报告底稿.md)
- [NLP 方法、数据来源与从零开发过程](ear-review/docs/NLP实现、数据来源与从零开发说明.md)
- [开发方案](方案/项目开发与软件工程报告方案.md)
- [实际页面截图](ear-review/docs/figures)

预置数据为教学合成样例。当前算法为词典规则与字符 n-gram 朴素贝叶斯的混合基线，没有调用在线或多模态大模型；真实领域性能尚需授权数据验证。

## 同步范围

源码、配置模板、模型、教学数据、方案、报告、测试源码和精选截图保存在 Git 中。`node_modules`、构建目录、运行数据库/密码、`.env` 与临时测试输出按 `.gitignore` 排除；依赖和构建可通过上述命令重建。
