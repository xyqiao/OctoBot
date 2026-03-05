import { tool } from "langchain";
import { z } from "zod";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runCapabilityCall, listCapabilityDefinitions } = require("./capabilityExecutor.cjs");

function createToolRunner(name, options) {
  return async (input) => {
    const onToolEvent = options?.onToolEvent;
    const startedAt = Date.now();
    onToolEvent?.({
      type: "start",
      toolName: name,
      input,
      ts: startedAt,
    });

    try {
      const result = await runCapabilityCall(name, input, {
        baseDir: options?.baseDir,
        allowedRoots: options?.allowedRoots,
        auditLogPath: options?.auditLogPath,
        runContext: options?.runContext,
        onLog: options?.onLog,
      });
      onToolEvent?.({
        type: "success",
        toolName: name,
        input,
        result,
        elapsedMs: Date.now() - startedAt,
        ts: Date.now(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onToolEvent?.({
        type: "error",
        toolName: name,
        input,
        error: message,
        elapsedMs: Date.now() - startedAt,
        ts: Date.now(),
      });
      throw error;
    }
  };
}

export function createLangChainTools(options = {}) {
  return [
    tool(createToolRunner("file_read_text", options), {
      name: "file_read_text",
      description: "读取本地文本文件，返回文本内容。",
      schema: z.object({
        path: z.string().describe("文件路径，支持绝对路径或相对路径"),
        encoding: z.string().optional().describe("文本编码，默认 utf8"),
        maxChars: z.number().int().positive().optional().describe("最大返回字符数"),
      }),
    }),
    tool(createToolRunner("file_write_text", options), {
      name: "file_write_text",
      description: "写入本地文本文件，可覆盖或追加。",
      schema: z.object({
        path: z.string().describe("文件路径"),
        content: z.string().describe("要写入的内容"),
        append: z.boolean().optional().describe("是否追加写入"),
        ensureParentDir: z.boolean().optional().describe("是否自动创建父目录"),
        encoding: z.string().optional().describe("文本编码，默认 utf8"),
      }),
    }),
    tool(createToolRunner("file_list_directory", options), {
      name: "file_list_directory",
      description: "列出目录中的文件和子目录。",
      schema: z.object({
        path: z.string().describe("目录路径"),
        recursive: z.boolean().optional().describe("是否递归列出子目录"),
        maxEntries: z.number().int().positive().optional().describe("最多返回条目数"),
      }),
    }),
    tool(createToolRunner("office_read_document", options), {
      name: "office_read_document",
      description: "读取办公文档，支持 .docx/.xlsx/.xls/.csv/.txt/.md/.json。",
      schema: z.object({
        path: z.string().describe("文档路径"),
        sheetName: z.string().optional().describe("Excel 工作表名称（可选）"),
        maxChars: z.number().int().positive().optional().describe("文本最大返回字符数"),
      }),
    }),
    tool(createToolRunner("office_write_document", options), {
      name: "office_write_document",
      description: "写入办公文档，支持 .docx/.xlsx/.xls/.csv/.txt/.md/.json。",
      schema: z.object({
        path: z.string().describe("文档路径"),
        title: z.string().optional().describe("DOCX 标题"),
        content: z.any().optional().describe("写入内容"),
        paragraphs: z.array(z.string()).optional().describe("DOCX 段落列表"),
        rows: z.array(z.any()).optional().describe("表格数据，二维数组或对象数组"),
        sheetName: z.string().optional().describe("Excel 工作表名称"),
        prettyJson: z.boolean().optional().describe("JSON 是否格式化"),
      }),
    }),
    tool(createToolRunner("browser_playwright_run", options), {
      name: "browser_playwright_run",
      description:
        "浏览器能力：默认仅打开 URL 时走系统默认浏览器；有步骤时走 Playwright 自动化，且不会自动关闭窗口。",
      schema: z.object({
        url: z.string().optional().describe("初始打开页面"),
        mode: z
          .enum(["system", "playwright"])
          .optional()
          .describe("system=系统浏览器，playwright=自动化浏览器"),
        openInSystemBrowser: z
          .boolean()
          .optional()
          .describe("是否强制使用系统默认浏览器"),
        forcePlaywright: z
          .boolean()
          .optional()
          .describe("即使只有 URL 也强制用 Playwright"),
        headless: z.boolean().optional().describe("是否无头模式，默认 true"),
        timeoutMs: z.number().int().positive().optional().describe("步骤超时时间毫秒"),
        channel: z.string().optional().describe("浏览器通道，例如 chrome"),
        executablePath: z.string().optional().describe("浏览器可执行文件路径"),
        steps: z
          .array(
            z
              .object({
                action: z.string().describe("动作名"),
              })
              .passthrough(),
          )
          .optional()
          .describe("自动化步骤列表"),
      }),
    }),
    tool(createToolRunner("social_publish_run", options), {
      name: "social_publish_run",
      description:
        "执行自媒体发布流程，支持 xiaohongshu / douyin / wechat_mp，支持保存草稿或直接发布。",
      schema: z.object({
        platform: z
          .string()
          .describe("平台：xiaohongshu|xhs|douyin|wechat_mp|公众号"),
        mode: z
          .enum(["draft", "publish"])
          .optional()
          .describe("执行模式，draft=保存草稿，publish=直接发布"),
        url: z.string().optional().describe("发布入口 URL，不传则用平台默认"),
        title: z.string().optional().describe("内容标题"),
        content: z.string().optional().describe("正文内容"),
        mediaPaths: z
          .array(z.string())
          .optional()
          .describe("待上传媒体文件路径数组"),
        waitForManualLogin: z
          .boolean()
          .optional()
          .describe("是否等待人工登录完成"),
        loginTimeoutMs: z.number().int().positive().optional().describe("登录等待超时"),
        takeScreenshot: z
          .boolean()
          .optional()
          .describe("执行后是否自动截图"),
        screenshotPath: z.string().optional().describe("截图输出路径"),
        steps: z
          .array(
            z
              .object({
                action: z.string(),
              })
              .passthrough(),
          )
          .optional()
          .describe("附加 Playwright 动作"),
      }),
    }),
  ];
}

export function listCapabilityTools() {
  return listCapabilityDefinitions();
}
