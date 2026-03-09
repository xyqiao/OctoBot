const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 20_000;
const RELAXED_CONFIG_PATH = path.join(
  os.tmpdir(),
  "nexus-playwright-mcp-relaxed-config.json",
);
const RELAXED_CONTEXT_PERMISSIONS = [
  "clipboard-read",
  "clipboard-write",
  "geolocation",
  "notifications",
  "camera",
  "microphone",
];
const RELAXED_CHROMIUM_ARGS = [
  "--disable-web-security",
  "--allow-file-access-from-files",
  "--disable-features=PermissionsPolicyExtension,IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests",
  "--disable-site-isolation-trials",
  "--disable-popup-blocking",
];
const DEFAULT_SERVER_CONFIG = {
  command: "npx",
  args: ["--no-install", "@playwright/mcp"],
};

const runtimeState = {
  client: null,
  transport: null,
  starting: null,
  cachedTools: [],
};

let mcpSdk = null;

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

function ensureRelaxedPlaywrightConfigFile() {
  const config = {
    browser: {
      launchOptions: {
        args: RELAXED_CHROMIUM_ARGS,
      },
      contextOptions: {
        ignoreHTTPSErrors: true,
        permissions: RELAXED_CONTEXT_PERMISSIONS,
      },
    },
    allowUnrestrictedFileAccess: true,
  };

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  try {
    const existing = fs.readFileSync(RELAXED_CONFIG_PATH, "utf8");
    if (existing === serialized) {
      return RELAXED_CONFIG_PATH;
    }
  } catch {
    // Ignore read errors and rewrite below.
  }

  fs.writeFileSync(RELAXED_CONFIG_PATH, serialized, "utf8");
  return RELAXED_CONFIG_PATH;
}

function stripOption(args, optionName) {
  const source = Array.isArray(args) ? [...args] : [];
  const result = [];

  for (let index = 0; index < source.length; index += 1) {
    const current = toSafeString(source[index], "").trim();
    if (!current) {
      continue;
    }

    if (current === optionName) {
      const next = toSafeString(source[index + 1], "").trim();
      if (next && !next.startsWith("-")) {
        index += 1;
      }
      continue;
    }

    if (current.startsWith(`${optionName}=`)) {
      continue;
    }

    result.push(current);
  }

  return result;
}

function withRelaxedBrowserArgs(args) {
  const configPath = ensureRelaxedPlaywrightConfigFile();
  const nextArgs = stripOption(stripOption(Array.isArray(args) ? args : [], "--config"), "--grant-permissions");

  if (!nextArgs.includes("--no-sandbox")) {
    nextArgs.push("--no-sandbox");
  }
  if (!nextArgs.includes("--allow-unrestricted-file-access")) {
    nextArgs.push("--allow-unrestricted-file-access");
  }
  if (!nextArgs.includes("--ignore-https-errors")) {
    nextArgs.push("--ignore-https-errors");
  }

  nextArgs.push("--grant-permissions", RELAXED_CONTEXT_PERMISSIONS.join(","));
  nextArgs.push("--config", configPath);
  return nextArgs;
}

function resolveServerConfig(options = {}) {
  const configured = normalizeObject(options.mcpServers?.playwright);
  const envArgs = toSafeString(process.env.PLAYWRIGHT_MCP_ARGS, "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const command =
    toSafeString(
      configured.command,
      toSafeString(process.env.PLAYWRIGHT_MCP_COMMAND, DEFAULT_SERVER_CONFIG.command),
    ).trim() || DEFAULT_SERVER_CONFIG.command;

  const args =
    Array.isArray(configured.args) && configured.args.length > 0
      ? configured.args.map((item) => toSafeString(item, "")).filter(Boolean)
      : envArgs.length > 0
        ? envArgs
        : [...DEFAULT_SERVER_CONFIG.args];

  return { command, args: withRelaxedBrowserArgs(args) };
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
      reject(new Error(`MCP request timeout for method "${label}".`));
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

function loadMcpSdk() {
  if (mcpSdk) {
    return mcpSdk;
  }

  const mcpPackagePath = require.resolve("@playwright/mcp/package.json");
  const mcpRootDir = path.dirname(mcpPackagePath);
  const playwrightCorePackagePath = require.resolve("playwright-core/package.json", {
    paths: [mcpRootDir],
  });
  const sdkPath = path.join(
    path.dirname(playwrightCorePackagePath),
    "lib",
    "mcpBundleImpl",
    "index.js",
  );

  mcpSdk = require(sdkPath);
  return mcpSdk;
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
    const sdk = loadMcpSdk();
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
          options.onLog(`[MCP/playwright][stderr] ${text}`);
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
      `[MCP/playwright] connected: ${config.command} ${config.args.join(" ")}`,
    );

    return client;
  })();

  try {
    return await runtimeState.starting;
  } finally {
    runtimeState.starting = null;
  }
}

async function warmupPlaywrightMcp(options = {}) {
  const client = await ensureClient(options);
  const listResult = await withTimeout(client.listTools(), options.timeoutMs, "tools/list");
  const tools = Array.isArray(listResult?.tools)
    ? listResult.tools.map((item) => normalizeToolDefinition(item)).filter(Boolean)
    : [];
  runtimeState.cachedTools = tools;
  return tools;
}

async function listPlaywrightMcpTools(options = {}) {
  const tools = await warmupPlaywrightMcp(options);
  return tools.map((item) => ({ ...item }));
}

function getCachedPlaywrightMcpTools() {
  return runtimeState.cachedTools.map((item) => ({ ...item }));
}

async function callPlaywrightMcpTool(name, args = {}, options = {}) {
  const toolName = toSafeString(name, "").trim();
  if (!toolName) {
    throw new Error("Playwright MCP tool name is required.");
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

async function shutdownPlaywrightMcp() {
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
  warmupPlaywrightMcp,
  listPlaywrightMcpTools,
  getCachedPlaywrightMcpTools,
  callPlaywrightMcpTool,
  shutdownPlaywrightMcp,
};
