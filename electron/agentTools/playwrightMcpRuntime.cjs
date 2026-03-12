const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createMcpRuntime,
  toSafeString,
  normalizeObject,
} = require("./mcpRuntimeFactory.cjs");
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
let mcpSdk = null;
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
  const nextArgs = stripOption(
    stripOption(Array.isArray(args) ? args : [], "--config"),
    "--grant-permissions",
  );
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
      toSafeString(
        process.env.PLAYWRIGHT_MCP_COMMAND,
        DEFAULT_SERVER_CONFIG.command,
      ),
    ).trim() || DEFAULT_SERVER_CONFIG.command;
  const args =
    Array.isArray(configured.args) && configured.args.length > 0
      ? configured.args.map((item) => toSafeString(item, "")).filter(Boolean)
      : envArgs.length > 0
        ? envArgs
        : [...DEFAULT_SERVER_CONFIG.args];
  return { command, args: withRelaxedBrowserArgs(args) };
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
const runtime = createMcpRuntime({
  logPrefix: "playwright",
  toolNameError: "Playwright MCP tool name is required.",
  resolveServerConfig,
  loadSdkModules: loadMcpSdk,
});
async function warmupPlaywrightMcp(options = {}) {
  return runtime.warmupMcp(options);
}
async function listPlaywrightMcpTools(options = {}) {
  return runtime.listMcpTools(options);
}
function getCachedPlaywrightMcpTools() {
  return runtime.getCachedMcpTools();
}
async function callPlaywrightMcpTool(name, args = {}, options = {}) {
  return runtime.callMcpTool(name, args, options);
}
async function shutdownPlaywrightMcp() {
  return runtime.shutdownMcp();
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
