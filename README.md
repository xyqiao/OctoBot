# Nexus AI Electron (客户端优先多智能体平台)

此仓库实现了一个**基于 Electron 的桌面多智能体客户端**，前端采用 React + Material UI，后端通过 LangChain/ LangGraph 进行智能体编排，所有业务逻辑、存储和工具运行都在本地完成，无需外部服务器。

---

## 🚀 核心特性

- **纯客户端架构**：Electron 应用，前/后端同在本地运行，数据存储于 SQLite。
- **多智能体框架**：内置 Planner/Analyst/Reporter，由 `@langchain/langgraph` 驱动；支持本地 mock agent 方便离线使用。
- **三大功能页**
  1. 聊天工作区（Chat）：会话管理、消息记录、上下文摘要。
  2. 任务管理（Tasks）：定义/调度/执行自动化任务，附详尽日志。
  3. 技能市场（Skills）：安装、启用、禁用、上传自定义技能。
  4. 配置页（Settings）：模型参数、主题、LangSmith、通知等。
- **扩展能力**：通过 MCP 工具访问网络搜索、文件系统和 Playwright 浏览器。
- **本地存储**：使用 `better-sqlite3` 持久化会话、记忆、任务、技能与设置。
- **TypeScript + Vite**：前端使用 TS 类型安全，Vite 提供快速构建与 HMR。
- **pnpm** 管理与国内镜像支持，electron 二进制缓存配置简化安装。

---

## 🛠 环境要求

- Node.js 18 或更高
- pnpm 10 或更高
- Electron 二进制在 `~/Library/Caches/electron/`（可通过 `pnpm install` 自动拉取）

---

## 📦 安装依赖

在仓库根目录运行：

```bash
pnpm install
```

> 😊 建议先确保 `.npmrc` 生效：
>
> ```text
> registry=https://registry.npmmirror.com/
> electron_cache=~/Library/Caches/electron/
> ```

---

## 🏁 开发与调试

```bash
pnpm dev             # 无端口模式：vite build --watch + Electron 读取 dist
pnpm dev:hmr          # 标准 HMR（需允许监听 127.0.0.1:5173）
pnpm start            # 启动已打包的 Electron 应用（需先 build）
pnpm preview          # 仅预览前端
pnpm typecheck        # ts 类型检查
pnpm rebuild:native   # 重建 native 依赖（better-sqlite3）
```

开发脚本使用 `concurrently` 和 `wait-on` 协调 renderer 与 Electron 两端。

---

## 🏗 构建

```bash
pnpm build           # 仅构建前端资源
```

---

## 📁 目录结构亮点

```
electron/               # Electron 主进程与工具
  ├─ main.cjs           # 主进程入口
  ├─ preload.cjs        # 安全 IPC 桥接
  ├─ agentTools/        # MCP 工具 runtime（搜索、fs、playwright）
  ├─ storage/           # SQLite 封装与上下文
  ├─ taskEngine/        # 定时 & 分发逻辑
  ├─ skillEngine/       # 技能管理

src/                    # 渲染进程 (React)
  ├─ components/        # UI 组件
  ├─ pages/             # Chat/Tasks/Skills/Settings
  ├─ agent/             # LangGraph runtime
  ├─ storage/db.ts      # IPC API
  ├─ theme.tsx          # 主题 & 暗/亮模式
  ├─ App.tsx            # 应用 shell
  ├─ types.ts           # TypeScript 类型定义

tests/                  # 单元/集成测试（若有）
```

---

## 🔍 关键实现说明

- **聊天上下文**：`chatContextManager.cjs` 负责截断历史、生成摘要并组合 prompt；`main.cjs` 在发送给智能体前调用。
- **任务系统**：定义、调度与执行在 `taskEngine`；前端定期刷新状态，支持手动触发与取消。
- **技能管理**：`SkillManager` 扫描 `skills_builtin` 与用户目录，前端通过 RPC 安装/启用/禁用。
- **MCP 工具**：`agentTools/*` 封装 Model Context Protocol 服务，允许智能体利用网络搜索、文件操作和浏览器。
- **存储层**：主进程使用 `better-sqlite3`，通过 IPC 暴露 CRUD API 至渲染进程。

---

## ℹ️ 存储位置

默认数据库位于：

```
~/Library/Application Support/<app>/nexus-ai.sqlite
```

包含聊天会话、消息、记忆、任务定义/运行/日志、技能信息、用户设置等。

---

## 🧠 离线模式

若未在设置中填写 `API Key`，系统会自动使用内置的 **本地 Mock Agent**，适合展示或演示离线功能。

---

## 📋 备注

- 模型配置字段：`modelName`、`baseUrl`、`apiKey`。
- 可通过环境变量或配置调整 MCP 服务器启动命令。
- 安装 `pnpm` 后若遇编译原生模块请运行 `pnpm rebuild:native`。

---

脚本与模块之间通过 IPC、MCP 以及 LangChain runtime 严密衔接，构建了一个可扩展、完全本地运行的智能体平台。

欢迎在此基础上自定义技能、编写任务或改造 UI！
