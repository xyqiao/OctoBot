const { listCapabilityRegistry } = require("./capabilityExecutor.cjs");

const toolRegistry = new Map();

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeToolSpec(spec = {}) {
  const name = toSafeString(spec.name, "").trim();
  if (!name) {
    return null;
  }
  const description = toSafeString(spec.description, "").trim();
  const handler = typeof spec.handler === "function" ? spec.handler : null;
  const aliases = normalizeArray(spec.aliases)
    .map((item) => toSafeString(item, "").trim())
    .filter(Boolean);
  const scopes = normalizeArray(spec.scopes)
    .map((item) => toSafeString(item, "").trim())
    .filter(Boolean);
  const agentTypes = normalizeArray(spec.agentTypes)
    .map((item) => toSafeString(item, "").trim())
    .filter(Boolean);
  const riskLevel = toSafeString(spec.riskLevel, "low").trim() || "low";
  const schema = spec.schema ? spec.schema : null;

  return {
    name,
    description,
    handler,
    aliases,
    scopes,
    agentTypes,
    riskLevel,
    schema,
    source: toSafeString(spec.source, "capability").trim() || "capability",
  };
}

function registerTool(spec = {}) {
  const normalized = normalizeToolSpec(spec);
  if (!normalized) {
    return false;
  }

  if (toolRegistry.has(normalized.name)) {
    throw new Error(`Tool already registered: ${normalized.name}`);
  }

  toolRegistry.set(normalized.name, normalized);
  for (const alias of normalized.aliases) {
    if (!toolRegistry.has(alias)) {
      toolRegistry.set(alias, { ...normalized, name: alias });
    }
  }
  return true;
}

function ensureCapabilityToolsRegistered() {
  const capabilityTools = listCapabilityRegistry();
  for (const tool of capabilityTools) {
    const name = toSafeString(tool?.name, "").trim();
    if (!name || toolRegistry.has(name)) {
      continue;
    }
    registerTool({
      ...tool,
      riskLevel: tool.riskLevel || "low",
      scopes: tool.scopes || ["local"],
      agentTypes: tool.agentTypes || ["executor"],
      source: "capability",
    });
  }
}

function getTool(name) {
  return toolRegistry.get(name) || null;
}

function listTools({ agentType, scopes, allowedNames } = {}) {
  ensureCapabilityToolsRegistered();
  const allowedSet = new Set(
    normalizeArray(allowedNames)
      .map((item) => toSafeString(item, "").trim())
      .filter(Boolean),
  );
  const scopeSet = new Set(
    normalizeArray(scopes)
      .map((item) => toSafeString(item, "").trim())
      .filter(Boolean),
  );
  const type = toSafeString(agentType, "").trim();

  const tools = [];
  for (const tool of toolRegistry.values()) {
    if (allowedSet.size > 0 && !allowedSet.has(tool.name)) {
      continue;
    }
    if (type && tool.agentTypes.length > 0 && !tool.agentTypes.includes(type)) {
      continue;
    }
    if (scopeSet.size > 0 && tool.scopes.length > 0) {
      const intersects = tool.scopes.some((scope) => scopeSet.has(scope));
      if (!intersects) {
        continue;
      }
    }
    tools.push({ ...tool, handler: undefined });
  }
  return tools;
}

function listToolHandlers({ allowedNames } = {}) {
  ensureCapabilityToolsRegistered();
  const allowedSet = new Set(
    normalizeArray(allowedNames)
      .map((item) => toSafeString(item, "").trim())
      .filter(Boolean),
  );
  const handlers = [];
  for (const tool of toolRegistry.values()) {
    if (allowedSet.size > 0 && !allowedSet.has(tool.name)) {
      continue;
    }
    handlers.push(tool);
  }
  return handlers;
}


function clearRegistry() {
  toolRegistry.clear();
}

module.exports = {
  registerTool,
  clearRegistry,
  getTool,
  listTools,
  listToolHandlers,
  ensureCapabilityToolsRegistered,
};
