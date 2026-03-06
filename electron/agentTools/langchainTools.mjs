import { tool } from "langchain";
import { z } from "zod";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  runCapabilityCall,
  listCapabilityDefinitions,
} = require("./capabilityExecutor.cjs");
const {
  listPlaywrightMcpTools,
  getCachedPlaywrightMcpTools,
  callPlaywrightMcpTool,
} = require("./playwrightMcpRuntime.cjs");

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

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

export async function createLangChainTools(options = {}) {
  const tools = [
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
  ];

  try {
    const mcpTools = await listPlaywrightMcpTools({
      mcpServers: options?.mcpServers,
      onLog: options?.onLog,
      timeoutMs: options?.mcpTimeoutMs,
    });

    const existingNames = new Set(tools.map((item) => item.name));
    for (const definition of mcpTools) {
      const toolName = toSafeString(definition?.name, "").trim();
      if (!toolName || existingNames.has(toolName)) {
        continue;
      }
      existingNames.add(toolName);

      tools.push(
        tool(
          async (input) => {
            const result = await callPlaywrightMcpTool(
              toolName,
              normalizeObject(input),
              {
                mcpServers: options?.mcpServers,
                onLog: options?.onLog,
                timeoutMs: options?.mcpTimeoutMs,
              },
            );
            return {
              server: "playwright",
              toolName,
              result,
            };
          },
          {
            name: toolName,
            description:
              toSafeString(definition?.description, "").trim() ||
              `Playwright MCP tool: ${toolName}`,
            schema: z.object({}).passthrough(),
          },
        ),
      );
    }
  } catch (error) {
    options?.onLog?.(
      `[MCP/playwright] Failed to load tool definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const allowed = Array.isArray(options?.allowedToolNames)
    ? options.allowedToolNames
    : [];
  const allowedSet = new Set(
    allowed
      .map((item) => String(item).trim())
      .filter(Boolean),
  );

  if (allowedSet.size === 0) {
    return tools;
  }

  const filtered = tools.filter((toolItem) => allowedSet.has(toolItem.name));
  if (filtered.length > 0) {
    return filtered;
  }

  options?.onLog?.(
    `Allowed tool names were provided but no registered tools matched: ${Array.from(
      allowedSet,
    ).join(", ")}`,
  );
  return tools;
}

export function listCapabilityTools() {
  const baseTools = listCapabilityDefinitions().filter(
    (item) =>
      item.name !== "browser_playwright_run" &&
      item.name !== "social_publish_run",
  );

  const mcpTools = getCachedPlaywrightMcpTools().map((item) => ({
    name: item.name,
    description:
      toSafeString(item.description, "").trim() ||
      `Playwright MCP tool: ${item.name}`,
  }));

  return [...baseTools, ...mcpTools];
}
