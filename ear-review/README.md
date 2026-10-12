# 听见 · 耳机评论分析

TypeScript + Vue 3 + NestJS + SQLite。本地分析六项评价方面，展示情感和原文依据，支持导入、批量分析、复核、画像与对比。

## 一键启动

双击 **`启动系统.bat`**：检查 Node.js，缺失或过旧时使用 Windows `winget` 安装 Node.js LTS；安装锁定的 npm 依赖，构建后打开网页。首次需要网络，系统安装可能出现管理员权限或安装器提示。没有 winget 时，启动器会提示从 [Node.js 官网](https://nodejs.org/en/download)安装。

仅安装/检查环境：双击 **`安装环境.bat`**，或在项目目录运行：

```powershell
.\安装环境.bat
```

已安装 Node.js 24.14 或更高版本时：

```powershell
npm run setup
npm start
```

`npm run setup` 检查依赖是否匹配锁文件，缺失时执行 `npm ci`，源码变化时重新构建；已准备好的环境不会每次重装。手动安装也可执行 `npm ci`、`npm run build`、`npm start`。

默认地址：http://127.0.0.1:3001 。启动窗口保留运行；Ctrl+C 停止。已运行时复用现有服务。若自动打开浏览器失败，复制地址访问；日志在 `data/runtime/launcher.log`。

账号为 `admin`，首次生成的密码在 `data/runtime/admin-password.txt`。配置模板为 `.env.example`，可复制为 `.env`；设置方法见开发指南。

## 开发与测试

```powershell
npm run dev          # 前端 5173，后端 3001；先停止已有生产服务
npm test             # 核心测试
npm run setup:tests  # 需要浏览器测试时，安装 Chromium
npm run test:e2e     # 独立 3002 端口与隔离测试数据库
npm run train        # 导出教学模型
npm run evaluate     # 教学检查集评价
```

环境清单见 [`requirements.txt`](requirements.txt)。这是 **Node.js 项目说明，不是 Python 的 pip 文件**；完整可重建依赖以 `package.json` 和 `package-lock.json` 为准，实际由 npm 安装。无需 Python、GPU、独立数据库服务或在线模型密钥。

## 开发文档

- [开发指南](docs/开发指南.md)：目录、环境、需求、接口、数据库、界面规范与协作。
- [NLP 原理与数据](docs/NLP原理与数据.md)：数据网站、CSV、训练与实际分析流程。
- [课程报告](docs/课程报告.md)：需求分析、设计、实现、测试与展示底稿。

预置评论和训练语料为教学合成数据，不代表真实消费者评论效果。导入 CSV 只运行已有模型，不会自动训练。
