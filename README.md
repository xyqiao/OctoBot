# Nexus AI Electron (Client-First Multi-Agent)

基于 Electron + React + Material UI 的客户端优先多智能体项目模板。

## 特性

- Electron 桌面端（无后端依赖，客户端本地运行）
- React + Material UI，三页布局对应：
  - Chat Workspace
  - Task Management
  - Personal Configuration
- `langchain` + `@langchain/langgraph` 多智能体编排（Planner/Analyst/Reporter）
- 使用 SQLite（`better-sqlite3`）持久化：聊天、任务、配置
- `pnpm` 包管理，`.npmrc` 已配置淘宝源（npmmirror）

## 环境要求

- Node.js 18+
- pnpm 10+
- Electron 二进制已存在：`~/Library/Caches/electron/`

## 安装

> 为确保优先走本地缓存，请先确认 `.npmrc` 已生效：
>
> - `registry=https://registry.npmmirror.com/`
> - `electron_cache=~/Library/Caches/electron/`

```bash
pnpm install
```

## 启动开发

```bash
pnpm dev
```

说明：

- `pnpm dev`：无端口模式（`vite build --watch` + Electron 读取 `dist`，改动后自动刷新窗口）
- `pnpm dev:hmr`：标准 HMR 模式（需要本机允许监听 `127.0.0.1:5173`）

## 构建前端资源

```bash
pnpm build
```

## 关键目录

- `electron/main.cjs`：主进程
- `electron/preload.cjs`：安全桥接 API
- `src/App.tsx`：UI 主界面（聊天/任务/设置）
- `src/agent/graphRuntime.ts`：LangGraph 多智能体运行时
- `electron/sqliteStorage.cjs`：SQLite 存储层
- `src/storage/db.ts`：渲染进程存储 API（通过 IPC 调用主进程 SQLite）

## 说明

- 若未填写 OpenAI API Key，系统会自动使用本地 Mock Agent 回复，便于离线演示。
- API Key 保存在本地 SQLite 中（默认路径：`~/Library/Application Support/<app>/nexus-ai.sqlite`）。
