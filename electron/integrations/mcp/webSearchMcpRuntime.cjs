const path = require("path");
const {
  createMcpRuntime,
  toSafeString,
  normalizeObject,
} = require("./mcpRuntimeFactory.cjs");

const DEFAULT_SERVER_CONFIG = {
  command: "npx",
  args: ["--no-install", "@zhafron/mcp-web-search"],
};

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

let sdkModules = null;

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

const runtime = createMcpRuntime({
  logPrefix: "web-search",
  toolNameError: "Web search MCP tool name is required.",
  resolveServerConfig,
  loadSdkModules,
});

async function warmupWebSearchMcp(options = {}) {
  return runtime.warmupMcp(options);
}

async function listWebSearchMcpTools(options = {}) {
  return runtime.listMcpTools(options);
}

function getCachedWebSearchMcpTools() {
  return runtime.getCachedMcpTools();
}

async function callWebSearchMcpTool(name, args = {}, options = {}) {
  return runtime.callMcpTool(name, args, options);
}

async function shutdownWebSearchMcp() {
  return runtime.shutdownMcp();
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
