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
const {
  listFilesystemMcpTools,
  getCachedFilesystemMcpTools,
  callFilesystemMcpTool,
} = require("./filesystemMcpRuntime.cjs");

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

function normalizeToolDescription(value, fallbackPrefix, name) {
  return (
    toSafeString(value, "").trim() || `${fallbackPrefix} tool: ${toSafeString(name, "")}`
  );
}

function toPrefixedMcpToolName(serverName, toolName) {
  const server = toSafeString(serverName, "").trim().toLowerCase();
  const name = toSafeString(toolName, "").trim();
  if (!server || !name) {
    return name;
  }
  return `${server}_mcp_${name}`;
}

async function appendMcpTools(tools, loader) {
  const existingNames = new Set(tools.map((item) => item.name));
  const definitions = await loader.list();

  for (const definition of definitions) {
    const rawToolName = toSafeString(definition?.name, "").trim();
    const toolName = toPrefixedMcpToolName(loader.server, rawToolName);
    if (!rawToolName || !toolName || existingNames.has(toolName)) {
      continue;
    }
    existingNames.add(toolName);

    tools.push(
      tool(
        async (input) => {
          const result = await loader.call(rawToolName, normalizeObject(input));
          return {
            server: loader.server,
            toolName,
            result,
          };
        },
        {
          name: toolName,
          description: normalizeToolDescription(
            definition?.description,
            loader.label,
            rawToolName,
          ),
          schema: z.object({}).passthrough(),
        },
      ),
    );
  }
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
    await appendMcpTools(tools, {
      server: "filesystem",
      label: "Filesystem MCP",
      list: () =>
        listFilesystemMcpTools({
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
          baseDir: options?.baseDir,
          allowedRoots: options?.allowedRoots,
        }),
      call: (toolName, input) =>
        callFilesystemMcpTool(toolName, input, {
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
          baseDir: options?.baseDir,
          allowedRoots: options?.allowedRoots,
        }),
    });
  } catch (error) {
    options?.onLog?.(
      `[MCP/filesystem] Failed to load tool definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    await appendMcpTools(tools, {
      server: "playwright",
      label: "Playwright MCP",
      list: () =>
        listPlaywrightMcpTools({
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
        }),
      call: (toolName, input) =>
        callPlaywrightMcpTool(toolName, input, {
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
        }),
    });
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
      item.name !== "file_read_text" &&
      item.name !== "file_write_text" &&
      item.name !== "file_list_directory",
  );

  const filesystemTools = getCachedFilesystemMcpTools().map((item) => ({
    name: toPrefixedMcpToolName("filesystem", item.name),
    description: normalizeToolDescription(
      item.description,
      "Filesystem MCP",
      item.name,
    ),
  }));
  const playwrightTools = getCachedPlaywrightMcpTools().map((item) => ({
    name: toPrefixedMcpToolName("playwright", item.name),
    description: normalizeToolDescription(
      item.description,
      "Playwright MCP",
      item.name,
    ),
  }));

  const merged = [...baseTools, ...filesystemTools, ...playwrightTools];
  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.name || seen.has(item.name)) {
      return false;
    }
    seen.add(item.name);
    return true;
  });
}
