---
name: 小红书发布助手
description: 通过 Playwright MCP 自动化小红书网页版图文发布流程，支持登录检测、人工登录等待、上传素材、填写内容并发布或存草稿。
icon: assets/icon.svg
aliases: xiaohongshu publisher, xiaohongshu playwright publisher, 小红书发布助手, 小红书发布, 小红书发帖助手, 小红书发笔记, 小红书图文发布
keywords: 小红书, 发, 发布, 发帖, 发笔记, 发布笔记, 笔记, 图文, 小红书图文, 图文发布, 发布内容, 创作者中心, 小红书创作者中心, 种草, 登录检测, 手动登录等待, playwright mcp, playwright_mcp_browser_snapshot
version: 1.0.0
---

# 小红书 Playwright 发布助手

## 用途

使用 Playwright MCP 自动化执行小红书创作者网页版图文发布流程。在同一浏览器会话里完成登录状态检测、素材上传、标题正文填写、标签设置，以及最终发布或存草稿。

## 触发条件

- 用户明确点名该技能（例如“用小红书发布助手发这条笔记”）。
- 任务语义明显是小红书网页端发帖、发布笔记、发布图文、种草内容发布或保存草稿。
- 需要在浏览器里处理登录闸门，并在用户手动登录后继续发布流程。
- 用户表达接近“发一条小红书”“帮我发帖到小红书”“去小红书创作者中心发布内容”“发笔记/发图文/种草”时也应触发。

## 执行步骤

1. 启动并固定同一个浏览器标签页，访问 `https://creator.xiaohongshu.com/publish/publish`。
2. 用 `playwright_mcp_browser_snapshot` 检查是否已登录；若未登录，提示用户在页面手动登录并每 5 秒轮询一次快照。
3. 收集并校验发布输入：标题、正文、素材绝对路径（可选）、话题标签（可选）、最终动作（发布或存草稿）。
4. 进入编辑器后按需上传素材，填写标题和正文，补齐话题标签和其他元数据。
5. 操作前后都重新抓取快照，检查上传进度、必填项缺失、风控弹窗等异常。
6. 根据用户选择执行最终动作：点击发布，或点击存草稿。
7. 同一步骤最多重试 2 次；若仍失败或明显需要人工介入，立即停止自动重试并汇报阻塞原因。
8. 返回简要结果：登录处理状态、填写字段摘要、最终动作和待人工处理项。

## 依赖工具

- playwright_mcp_browser_snapshot
- playwright_mcp_browser_navigate
- playwright_mcp_browser_click
- playwright_mcp_browser_fill_form
- playwright_mcp_browser_type
- playwright_mcp_browser_file_upload
- playwright_mcp_browser_wait_for

## 失败回退

- 未登录且长时间（例如 10 分钟）未完成手动登录：报告超时并询问是否继续等待。
- 找不到目标控件：优先参考 `references/xiaohongshu-ui-cues.md` 的可见文案重试，再给出可操作报错。
- 遇到弹窗或风险确认：先关闭或处理弹窗，再回到上一步继续；不要直接跳过校验。
- 同一步骤连续失败 2 次后停止自动重试，直接输出当前进展、阻塞原因和建议的人工下一步。
- 严禁向用户索要密码、短信验证码或二维码密钥，也不尝试任何绕过登录的行为。
