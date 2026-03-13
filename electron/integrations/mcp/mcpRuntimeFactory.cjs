const DEFAULT_TIMEOUT_MS = 20_000;

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

function toTimeoutMs(timeoutMs, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(timeoutMs);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1_000, Math.floor(numeric));
}

function withTimeout(promise, timeoutMs, label, fallbackTimeoutMs = DEFAULT_TIMEOUT_MS) {
  const ms = toTimeoutMs(timeoutMs, fallbackTimeoutMs);
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

function createMcpRuntime({
  logPrefix = "mcp",
  toolNameError = "MCP tool name is required.",
  resolveServerConfig,
  loadSdkModules,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof resolveServerConfig !== "function") {
    throw new Error("resolveServerConfig is required.");
  }
  if (typeof loadSdkModules !== "function") {
    throw new Error("loadSdkModules is required.");
  }

  const runtimeState = {
    client: null,
    transport: null,
    starting: null,
    cachedTools: [],
  };

  async function ensureClient(options = {}) {
    if (runtimeState.client && runtimeState.transport) {
      return runtimeState.client;
    }

    if (runtimeState.starting) {
      return runtimeState.starting;
    }

    runtimeState.starting = (async () => {
      const sdk = loadSdkModules();
      const config = resolveServerConfig(options);
      const client = new sdk.Client(
        {
          name: "nexus-ai-electron",
          version: "0.1.0",
        },
        {
          capabilities: {},
        },
      );
      const transport = new sdk.StdioClientTransport({
        command: config.command,
        args: config.args,
        stderr: "pipe",
      });

      if (transport.stderr?.on && typeof options.onLog === "function") {
        transport.stderr.on("data", (chunk) => {
          const text = toSafeString(chunk?.toString("utf8"), "").trim();
          if (text) {
            options.onLog(`[MCP/${logPrefix}][stderr] ${text}`);
          }
        });
      }

      try {
        await withTimeout(
          client.connect(transport),
          options.timeoutMs,
          "initialize",
          defaultTimeoutMs,
        );
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
        `[MCP/${logPrefix}] connected: ${config.command} ${config.args.join(" ")}`,
      );
      return client;
    })();

    try {
      return await runtimeState.starting;
    } finally {
      runtimeState.starting = null;
    }
  }

  async function warmupMcp(options = {}) {
    const client = await ensureClient(options);
    const listResult = await withTimeout(
      client.listTools(),
      options.timeoutMs,
      "tools/list",
      defaultTimeoutMs,
    );
    const tools = Array.isArray(listResult?.tools)
      ? listResult.tools.map((item) => normalizeToolDefinition(item)).filter(Boolean)
      : [];
    runtimeState.cachedTools = tools;
    return tools;
  }

  async function listMcpTools(options = {}) {
    const tools = await warmupMcp(options);
    return tools.map((item) => ({ ...item }));
  }

  function getCachedMcpTools() {
    return runtimeState.cachedTools.map((item) => ({ ...item }));
  }

  async function callMcpTool(name, args = {}, options = {}) {
    const toolName = toSafeString(name, "").trim();
    if (!toolName) {
      throw new Error(toolNameError);
    }

    const client = await ensureClient(options);
    return withTimeout(
      client.callTool({
        name: toolName,
        arguments: normalizeObject(args),
      }),
      options.timeoutMs,
      `tools/call:${toolName}`,
      defaultTimeoutMs,
    );
  }

  async function shutdownMcp() {
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

  return {
    warmupMcp,
    listMcpTools,
    getCachedMcpTools,
    callMcpTool,
    shutdownMcp,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  toSafeString,
  normalizeObject,
  toTimeoutMs,
  withTimeout,
  normalizeToolDefinition,
  createMcpRuntime,
};
