import { tool } from "langchain";
import { z } from "zod";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { listTools, listToolHandlers } = require("../../agentTools/toolRegistry.cjs");

const { runCapabilityCall } = require("../../agentTools/capabilities/capabilityRunner.cjs");
const {
  listPlaywrightMcpTools,
  getCachedPlaywrightMcpTools,
  callPlaywrightMcpTool,
} = require("../../integrations/mcp/playwrightMcpRuntime.cjs");
const {
  listFilesystemMcpTools,
  getCachedFilesystemMcpTools,
  callFilesystemMcpTool,
} = require("../../integrations/mcp/filesystemMcpRuntime.cjs");
const {
  listWebSearchMcpTools,
  getCachedWebSearchMcpTools,
  callWebSearchMcpTool,
} = require("../../integrations/mcp/webSearchMcpRuntime.cjs");

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
    toSafeString(value, "").trim() ||
    `${fallbackPrefix} tool: ${toSafeString(name, "")}`
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
  const tools = [];
  const allowed = Array.isArray(options?.allowedToolNames)
    ? options.allowedToolNames
    : [];

  const toolHandlers = listToolHandlers({
    allowedNames: allowed,
  }).filter((item) => item?.handler);

  for (const entry of toolHandlers) {
    tools.push(
      tool(createToolRunner(entry.name, options), {
        name: entry.name,
        description: entry.description || `Tool: ${entry.name}`,
        schema: z.object({}).passthrough(),
      }),
    );
  }

  if (!tools.some((item) => item.name === "task_create_definition")) {
    tools.push(
      tool(createToolRunner("task_create_definition", options), {
        name: "task_create_definition",
        description: "Create an agent_task definition from a prompt.",
        schema: z.object({}).passthrough(),
      }),
    );
  }

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
      `[MCP/filesystem] 加载工具定义失败: ${
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
      `[MCP/playwright] 加载工具定义失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  try {
    await appendMcpTools(tools, {
      server: "web_search",
      label: "Web Search MCP",
      list: () =>
        listWebSearchMcpTools({
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
        }),
      call: (toolName, input) =>
        callWebSearchMcpTool(toolName, input, {
          mcpServers: options?.mcpServers,
          onLog: options?.onLog,
          timeoutMs: options?.mcpTimeoutMs,
        }),
    });
  } catch (error) {
    options?.onLog?.(
      `[MCP/web-search] 加载工具定义失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (allowed.length === 0) {
    return tools;
  }

  const allowedSet = new Set(
    allowed.map((item) => String(item).trim()).filter(Boolean),
  );

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
  const baseTools = listTools({});

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
  const webSearchTools = getCachedWebSearchMcpTools().map((item) => ({
    name: toPrefixedMcpToolName("web_search", item.name),
    description: normalizeToolDescription(
      item.description,
      "Web Search MCP",
      item.name,
    ),
  }));

  const merged = [
    ...baseTools,
    ...filesystemTools,
    ...playwrightTools,
    ...webSearchTools,
  ];
  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.name || seen.has(item.name)) {
      return false;
    }
    seen.add(item.name);
    return true;
  });
}
