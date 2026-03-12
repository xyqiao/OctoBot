const path = require("path");

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SERVER_CONFIG = {
  command: "npx",
  args: ["--no-install", "@zhafron/mcp-web-search"],
};

const runtimeState = {
  client: null,
  transport: null,
  starting: null,
  cachedTools: [],
};

let sdkModules = null;

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

function resolveServerConfig(options = {}) {
  const configured = normalizeObject(options.mcpServers?.webSearch);
  const envArgs = toSafeString(process.env.WEB_SEARCH_MCP_ARGS, "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const command =
    toSafeString(
      configured.command,
      toSafeString(
        process.env.WEB_SEARCH_MCP_COMMAND,
        DEFAULT_SERVER_CONFIG.command,
      ),
    ).trim() || DEFAULT_SERVER_CONFIG.command;

  const args =
    Array.isArray(configured.args) && configured.args.length > 0
      ? configured.args.map((item) => toSafeString(item, "")).filter(Boolean)
      : envArgs.length > 0
        ? envArgs
        : [...DEFAULT_SERVER_CONFIG.args];

  return { command, args };
}

function toTimeoutMs(timeoutMs) {
  const numeric = Number(timeoutMs);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1_000, Math.floor(numeric));
}

function withTimeout(promise, timeoutMs, label) {
  const ms = toTimeoutMs(timeoutMs);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MCP 方法 "${label}" 请求超时。`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function loadSdkModules() {
  if (sdkModules) {
    return sdkModules;
  }

  const serverRoot = path.dirname(
    require.resolve("@zhafron/mcp-web-search/package.json"),
  );
  const clientModulePath = require.resolve(
    "@modelcontextprotocol/sdk/client/index.js",
    {
      paths: [serverRoot],
    },
  );
  const stdioModulePath = require.resolve(
    "@modelcontextprotocol/sdk/client/stdio.js",
    {
      paths: [serverRoot],
    },
  );

  const { Client } = require(clientModulePath);
  const { StdioClientTransport } = require(stdioModulePath);
  sdkModules = { Client, StdioClientTransport };
  return sdkModules;
}

function normalizeToolDefinition(raw) {
  const source = normalizeObject(raw);
  const name = toSafeString(source.name, "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    description: toSafeString(source.description, "").trim(),
    inputSchema: normalizeObject(source.inputSchema),
  };
}

async function ensureClient(options = {}) {
  if (runtimeState.client && runtimeState.transport) {
    return runtimeState.client;
  }

  if (runtimeState.starting) {
    return runtimeState.starting;
  }

  runtimeState.starting = (async () => {
    const { Client, StdioClientTransport } = loadSdkModules();
    const config = resolveServerConfig(options);
    const client = new Client(
      {
        name: "nexus-ai-electron",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      stderr: "pipe",
    });

    if (transport.stderr?.on && typeof options.onLog === "function") {
      transport.stderr.on("data", (chunk) => {
        const text = toSafeString(chunk?.toString("utf8"), "").trim();
        if (text) {
          options.onLog(`[MCP/web-search][stderr] ${text}`);
        }
      });
    }

    try {
      await withTimeout(client.connect(transport), options.timeoutMs, "initialize");
    } catch (error) {
      try {
        await transport.close();
      } catch {
        // Ignore close errors when startup already failed.
      }
      throw error;
    }

    runtimeState.client = client;
    runtimeState.transport = transport;
    options.onLog?.(
      `[MCP/web-search] connected: ${config.command} ${config.args.join(" ")}`,
    );
    return client;
  })();

  try {
    return await runtimeState.starting;
  } finally {
    runtimeState.starting = null;
  }
}

async function warmupWebSearchMcp(options = {}) {
  const client = await ensureClient(options);
  const listResult = await withTimeout(
    client.listTools(),
    options.timeoutMs,
    "tools/list",
  );
  const tools = Array.isArray(listResult?.tools)
    ? listResult.tools.map((item) => normalizeToolDefinition(item)).filter(Boolean)
    : [];
  runtimeState.cachedTools = tools;
  return tools;
}

async function listWebSearchMcpTools(options = {}) {
  const tools = await warmupWebSearchMcp(options);
  return tools.map((item) => ({ ...item }));
}

function getCachedWebSearchMcpTools() {
  return runtimeState.cachedTools.map((item) => ({ ...item }));
}

async function callWebSearchMcpTool(name, args = {}, options = {}) {
  const toolName = toSafeString(name, "").trim();
  if (!toolName) {
    throw new Error("Web search MCP tool name is required.");
  }

  const client = await ensureClient(options);
  return withTimeout(
    client.callTool({
      name: toolName,
      arguments: normalizeObject(args),
    }),
    options.timeoutMs,
    `tools/call:${toolName}`,
  );
}

async function shutdownWebSearchMcp() {
  const transport = runtimeState.transport;
  runtimeState.client = null;
  runtimeState.transport = null;
  runtimeState.starting = null;
  runtimeState.cachedTools = [];

  if (!transport) {
    return;
  }

  await transport.close();
}

module.exports = {
  DEFAULT_SERVER_CONFIG,
  resolveServerConfig,
  warmupWebSearchMcp,
  listWebSearchMcpTools,
  getCachedWebSearchMcpTools,
  callWebSearchMcpTool,
  shutdownWebSearchMcp,
};
