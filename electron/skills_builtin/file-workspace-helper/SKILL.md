---
name: File Workspace Helper
description: Read, inspect, and update local workspace files with explicit safety checks.
icon: assets/icon.svg
aliases: file helper, workspace files, local files
keywords: file read, file write, directory list, workspace
version: 1.0.0
---

# File Workspace Helper

## 用途
帮助智能体在本地工作区内执行文件读取、写入、目录扫描和文本落盘，优先复用已有文件而不是临时重写。

## 触发条件
- 用户明确点名使用该技能（例如 “用 file helper 处理”）。
- 任务目标包含文件读写、批量改名、日志采集、目录分析等明显文件操作语义。

## 执行步骤
1. 先列目录确认目标文件或目录是否存在。
2. 读取目标文件，做最小增量编辑，不覆盖无关内容。
3. 写回前记录关键变更摘要，避免误改。
4. 写回后再次读取关键片段验证结果。

## 依赖工具
- file_list_directory
- file_read_text
- file_write_text

## 失败回退
- 如果路径不存在，先返回可选路径并请求确认，不盲目创建新文件。
- 如果写入失败，保留原始文件并输出失败原因与建议重试步骤。
