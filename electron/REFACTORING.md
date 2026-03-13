# Electron 目录重构说明

## 重构日期
2026-03-13

## 重构目标
对 electron 目录下的代码进行模块化重构，提高代码可维护性和可读性。

## 重构内容

### 1. Runtime 模块拆分 (`runtime/`)
将原来的 `agentRuntime.mjs` (1115行) 拆分为多个模块：

- **`runtime/index.mjs`**: 主入口文件，包含多智能体运行逻辑
- **`runtime/modelFactory.mjs`**: 模型创建和 LangSmith 集成
- **`runtime/skillMatcher.mjs`**: 技能匹配和选择逻辑
- **`runtime/graphBuilder.mjs`**: LangGraph 构建器
- **`runtime/stallDetector.mjs`**: 停滞检测工具
- **`runtime/summaryGenerator.mjs`**: 对话摘要生成
- **`runtime/agents/`**: 智能体实现
  - `planner.mjs`: 规划智能体
  - `executor.mjs`: 执行智能体
  - `verifier.mjs`: 验证智能体
- **`runtime/utils/`**: 工具函数
  - `textUtils.mjs`: 文本处理工具
  - `eventHandlers.mjs`: 事件处理工具
  - `logger.mjs`: 日志工具

### 2. Main 模块拆分
将原来的 `main.cjs` (690行) 拆分为多个模块：

- **`ipc/`**: IPC 处理器
  - `chatHandlers.cjs`: 聊天相关 IPC 处理
  - `taskHandlers.cjs`: 任务相关 IPC 处理
  - `skillHandlers.cjs`: 技能相关 IPC 处理
  - `miscHandlers.cjs`: 其他 IPC 处理
- **`window/`**: 窗口管理
  - `windowManager.cjs`: 窗口创建和管理
- **`chat/`**: 聊天管理
  - `chatMemoryManager.cjs`: 聊天记忆和上下文管理
  - `chatContextManager.cjs`: 聊天上下文构建 (从根目录迁移)
  - `tokenCounter.cjs`: Token 计数工具 (从根目录迁移)

### 3. Storage 模块整理
- **`storage/`**: 数据存储层
  - `index.cjs`: 存储入口
  - `schema.cjs`: 数据库模式
  - `queries.cjs`: 查询函数
  - `context.cjs`: 存储上下文 (从根目录 storageContext.cjs 迁移)
  - `domains/`: 领域模型
    - `chatStorage.cjs`: 聊天存储
    - `agentRunStorage.cjs`: Agent 运行存储
    - `settingsStorage.cjs`: 设置存储
    - `taskRunStorage.cjs`: 任务运行存储
    - `taskStorage.cjs`: 任务存储
    - `taskDefinitionStorage.cjs`: 任务定义存储
  - `utils/`: 工具函数
    - `transformers.cjs`: 数据转换
    - `validators.cjs`: 数据验证
    - `common.cjs`: 通用工具
    - `cronUtils.cjs`: Cron 工具

## 最终目录结构

```
electron/
├── main.cjs                    # 主进程入口 (简化后 ~250行)
├── preload.cjs                 # 预加载脚本
├── REFACTORING.md              # 重构说明文档
├── agentTools/                 # Agent 工具集成
│   ├── toolRegistry.cjs
│   └── capabilities/
│       ├── capabilityRunner.cjs
│       ├── capabilityRegistry.cjs
│       ├── filesystemCapabilities.cjs
│       ├── officeCapabilities.cjs
│       ├── taskCapabilities.cjs
│       ├── pathPolicy.cjs
│       ├── auditLogger.cjs
│       ├── fileUtils.cjs
│       └── common.cjs
├── integrations/
│   └── mcp/
│       ├── mcpRuntimeFactory.cjs
│       ├── filesystemMcpRuntime.cjs
│       ├── playwrightMcpRuntime.cjs
│       └── webSearchMcpRuntime.cjs
├── chat/                       # 聊天管理 (新增/整理)
│   ├── chatMemoryManager.cjs  # 聊天记忆管理
│   ├── chatContextManager.cjs # 上下文构建 (迁移)
│   └── tokenCounter.cjs       # Token 计数 (迁移)
├── ipc/                        # IPC 处理器 (新增)
│   ├── chatHandlers.cjs       # 聊天 IPC
│   ├── taskHandlers.cjs       # 任务 IPC
│   ├── skillHandlers.cjs      # 技能 IPC
│   └── miscHandlers.cjs       # 其他 IPC
├── runtime/                    # 运行时模块 (新增)
│   ├── index.mjs              # 主入口
│   ├── modelFactory.mjs       # 模型工厂
│   ├── skillMatcher.mjs       # 技能匹配
│   ├── graphBuilder.mjs       # Graph 构建
│   ├── stallDetector.mjs      # 停滞检测
│   ├── summaryGenerator.mjs   # 摘要生成
│   ├── adapters/             # 框架适配
│   │   └── langchainTools.mjs # LangChain 工具封装
│   ├── agents/                # 智能体
│   │   ├── planner.mjs
│   │   ├── executor.mjs
│   │   └── verifier.mjs
│   └── utils/                 # 工具函数
│       ├── textUtils.mjs
│       ├── eventHandlers.mjs
│       └── logger.mjs
├── storage/                    # 存储层 (整理)
│   ├── index.cjs              # 存储入口
│   ├── schema.cjs             # 数据库模式
│   ├── queries.cjs            # 查询函数
│   ├── context.cjs            # 存储上下文 (迁移)
│   ├── domains/               # 领域模型
│   │   ├── chatStorage.cjs
│   │   ├── agentRunStorage.cjs
│   │   ├── settingsStorage.cjs
│   │   ├── taskRunStorage.cjs
│   │   ├── taskStorage.cjs
│   │   └── taskDefinitionStorage.cjs
│   └── utils/                 # 工具函数
│       ├── transformers.cjs
│       ├── validators.cjs
│       ├── common.cjs
│       └── cronUtils.cjs
├── taskEngine/                 # 任务引擎
│   ├── TaskScheduler.cjs
│   ├── TaskDispatcher.cjs
│   ├── WorkerManager.cjs
│   └── taskWorker.cjs
├── skillEngine/                # 技能引擎
│   ├── SkillManager.cjs
│   └── SkillInterpreter.cjs
├── skills_builtin/             # 内置技能
└── window/                     # 窗口管理 (新增)
    └── windowManager.cjs
```

## 文件迁移记录

### 从根目录迁移的文件
- `agentRuntime.mjs` → 拆分到 `runtime/` 目录
- `chatContextManager.cjs` → `chat/chatContextManager.cjs`
- `tokenCounter.cjs` → `chat/tokenCounter.cjs`
- `storageContext.cjs` → `storage/context.cjs`
- `sqliteStorage.cjs` → 已在之前重构中拆分到 `storage/` 目录

### 删除的文件
- `agentRuntime.mjs` (已拆分)
- `sqliteStorage.cjs` (已拆分)
- 所有 `.old` 和 `.bak` 备份文件

## 重构优势

1. **模块化**: 每个模块职责单一，易于理解和维护
2. **可测试性**: 独立模块更容易编写单元测试
3. **可扩展性**: 新功能可以作为独立模块添加
4. **代码复用**: 工具函数和通用逻辑可以在多处复用
5. **清晰的依赖关系**: 模块间的依赖关系更加明确
6. **目录结构清晰**: 按功能分类，易于导航和查找

## 模块职责说明

### chat/ - 聊天管理
负责聊天相关的所有逻辑，包括记忆管理、上下文构建、Token 计数等。

### ipc/ - IPC 处理器
负责主进程和渲染进程之间的通信，按功能模块分类。

### runtime/ - 运行时
负责多智能体的运行逻辑，包括模型创建、技能匹配、Graph 构建等。

### storage/ - 存储层
负责所有数据持久化操作，包括数据库模式、查询、领域模型等。

### window/ - 窗口管理
负责 Electron 窗口的创建、配置和生命周期管理。

### agentTools/ - Agent 能力与注册
负责能力实现与注册（文件/Office/任务等）以及工具注册表。

### integrations/mcp/ - MCP 集成
负责 MCP 客户端运行时与各 Server 的连接配置（filesystem/playwright/web-search）。

### taskEngine/ - 任务引擎
负责定时任务的调度、分发和执行。

### skillEngine/ - 技能引擎
负责技能的管理、解释和执行。

## 向后兼容

- ✅ 所有公共 API 保持不变
- ✅ 导出的函数签名保持一致
- ✅ 现有功能完全保留
- ✅ 所有引用路径已更新

## 测试验证

- ✅ Runtime 模块加载测试通过
- ✅ 所有新模块加载测试通过
- ✅ 所有迁移模块加载测试通过
- ✅ 应用构建成功

## 代码统计

### 重构前
- `agentRuntime.mjs`: 1115 行
- `main.cjs`: 690 行
- `chatContextManager.cjs`: 214 行
- `tokenCounter.cjs`: 115 行
- `storageContext.cjs`: 14 行
- **总计**: ~2148 行在 5 个大文件中

### 重构后
- `runtime/` 目录: 12 个模块文件
- `ipc/` 目录: 4 个处理器文件
- `chat/` 目录: 3 个管理文件
- `window/` 目录: 1 个管理文件
- `storage/` 目录: 已模块化
- `main.cjs`: ~250 行
- **总计**: ~2148 行在 30+ 个小文件中

### 改进
- 单个文件平均行数从 430 行降低到 ~70 行
- 模块数量从 5 个增加到 30+ 个
- 代码组织更清晰，职责更明确

## 后续建议

1. **添加单元测试**: 为每个独立模块编写单元测试
2. **添加 JSDoc**: 为公共 API 添加详细的文档注释
3. **性能优化**: 对高频调用的函数进行性能优化
4. **错误处理**: 统一错误处理机制
5. **日志系统**: 完善日志记录和监控

## 维护指南

### 添加新功能
1. 确定功能所属模块（chat/ipc/runtime/storage 等）
2. 在对应目录创建新文件
3. 更新相关的入口文件导出
4. 添加必要的测试

### 修改现有功能
1. 定位到对应的模块文件
2. 修改时保持单一职责原则
3. 更新相关的测试用例
4. 检查是否影响其他模块

### 重构建议
- 保持每个文件在 300 行以内
- 保持每个函数在 50 行以内
- 避免循环依赖
- 使用清晰的命名
