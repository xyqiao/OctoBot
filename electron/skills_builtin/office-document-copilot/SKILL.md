---
name: Office Document Copilot
description: Analyze and generate office documents (.docx/.xlsx/.csv) with stable structure.
icon: assets/icon.svg
aliases: office copilot, doc helper, spreadsheet helper
keywords: docx, xlsx, csv, report, table
version: 1.0.0
---

# Office Document Copilot

## 用途
用于读取、汇总和生成办公文档，尤其适合报表整理、表格清洗和说明文档输出。

## 触发条件
- 用户点名技能名（例如 “用 office copilot 做”）。
- 任务明确涉及 docx/xlsx/csv 的读取、转换、写入或汇总输出。

## 执行步骤
1. 先识别文档类型和目标输出格式。
2. 读取原始文档并提取核心结构（段落、sheet、表头）。
3. 按任务要求生成新文档内容，保持结构稳定。
4. 写入后返回产物路径与关键统计信息。

## 依赖工具
- office_read_document
- office_write_document
- file_list_directory

## 失败回退
- 若文档格式不支持，输出可兼容格式建议并停止写入。
- 若写入失败，改为导出中间文本/JSON，避免任务中断。
