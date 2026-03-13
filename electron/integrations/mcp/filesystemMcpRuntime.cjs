const path = require("path");
const {
  createMcpRuntime,
  toSafeString,
  normalizeObject,
} = require("./mcpRuntimeFactory.cjs");

const DEFAULT_SERVER_CONFIG = {
  command: "npx",
  args: ["--no-install", "@modelcontextprotocol/server-filesystem"],
};

function defaultSystemRoot(baseDir = process.cwd()) {
  const root = path.parse(path.resolve(baseDir || process.cwd())).root;
  return root || path.sep || "/";
}

function resolveAllowedRoots(options = {}) {
  const configuredRoots = Array.isArray(options.allowedRoots)
    ? options.allowedRoots
    : [];
  const normalizedRoots = configuredRoots
    .map((item) => toSafeString(item, "").trim())
    .filter(Boolean);
  if (normalizedRoots.length > 0) {
    return normalizedRoots;
  }

  const baseDir = toSafeString(options.baseDir, "").trim() || process.cwd();
  return [defaultSystemRoot(baseDir)];
}

function resolveServerConfig(options = {}) {
  const configured = normalizeObject(options.mcpServers?.filesystem);
  const envArgs = toSafeString(process.env.FILESYSTEM_MCP_ARGS, "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const command =
    toSafeString(
      configured.command,
      toSafeString(
        process.env.FILESYSTEM_MCP_COMMAND,
        DEFAULT_SERVER_CONFIG.command,
      ),
    ).trim() || DEFAULT_SERVER_CONFIG.command;

  const args =
    Array.isArray(configured.args) && configured.args.length > 0
      ? configured.args.map((item) => toSafeString(item, "")).filter(Boolean)
      : envArgs.length > 0
        ? envArgs
        : [...DEFAULT_SERVER_CONFIG.args, ...resolveAllowedRoots(options)];

  return { command, args };
}

let sdkModules = null;

function loadSdkModules() {
  if (sdkModules) {
    return sdkModules;
  }

  const serverRoot = path.dirname(
    require.resolve("@modelcontextprotocol/server-filesystem/package.json"),
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
  logPrefix: "filesystem",
  toolNameError: "Filesystem MCP tool name is required.",
  resolveServerConfig,
  loadSdkModules,
});

async function warmupFilesystemMcp(options = {}) {
  return runtime.warmupMcp(options);
}

async function listFilesystemMcpTools(options = {}) {
  return runtime.listMcpTools(options);
}

function getCachedFilesystemMcpTools() {
  return runtime.getCachedMcpTools();
}

async function callFilesystemMcpTool(name, args = {}, options = {}) {
  return runtime.callMcpTool(name, args, options);
}

async function shutdownFilesystemMcp() {
  return runtime.shutdownMcp();
}

module.exports = {
  DEFAULT_SERVER_CONFIG,
  resolveServerConfig,
  warmupFilesystemMcp,
  listFilesystemMcpTools,
  getCachedFilesystemMcpTools,
  callFilesystemMcpTool,
  shutdownFilesystemMcp,
};
