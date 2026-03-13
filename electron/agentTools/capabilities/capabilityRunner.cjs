const { toSafeString, normalizeObject } = require("./common.cjs");
const { parseAllowedRoots } = require("./pathPolicy.cjs");
const {
  DEFAULT_AUDIT_LOG_PATH,
  summarizeForAudit,
  appendAuditRecord,
} = require("./auditLogger.cjs");
const { assertNotAborted } = require("./context.cjs");
const { capabilityRegistry } = require("./capabilityRegistry.cjs");

function buildCapabilityLookup(registry) {
  const handlers = Object.create(null);
  const definitions = [];

  for (const item of registry) {
    const name = toSafeString(item?.name, "").trim().toLowerCase();
    const description = toSafeString(item?.description, "").trim();
    const handler = typeof item?.handler === "function" ? item.handler : null;
    const aliases = Array.isArray(item?.aliases) ? item.aliases : [];

    if (!name || !handler) {
      continue;
    }
    if (handlers[name]) {
      throw new Error(`能力名称重复: ${name}`);
    }

    handlers[name] = handler;
    definitions.push({
      name,
      description,
    });

    for (const aliasValue of aliases) {
      const alias = toSafeString(aliasValue, "").trim().toLowerCase();
      if (!alias) {
        continue;
      }
      if (handlers[alias]) {
        throw new Error(`能力别名重复: ${alias}`);
      }
      handlers[alias] = handler;
    }
  }

  return {
    handlers,
    definitions,
  };
}

const { handlers: capabilityHandlers, definitions: capabilityDefinitions } =
  buildCapabilityLookup(capabilityRegistry);

async function runCapabilityCall(name, args = {}, options = {}) {
  const normalizedName = toSafeString(name, "").trim().toLowerCase();
  const handler = capabilityHandlers[normalizedName];
  if (!handler) {
    throw new Error(`不支持的能力: ${normalizedName || "<empty>"}`);
  }

  const baseDir = options.baseDir || process.cwd();
  const context = {
    baseDir,
    isAborted: options.isAborted,
    onLog: options.onLog,
    allowedRoots: parseAllowedRoots(options.allowedRoots, baseDir),
    runContext: normalizeObject(options.runContext),
    auditLogPath: toSafeString(options.auditLogPath, DEFAULT_AUDIT_LOG_PATH),
  };

  const normalizedArgs = args && typeof args === "object" ? args : {};
  const startedAt = Date.now();

  await appendAuditRecord(context, {
    event: "capability_start",
    capability: normalizedName,
    args: summarizeForAudit(normalizedArgs),
    runContext: context.runContext,
  });

  try {
    const result = await handler(normalizedArgs, context);
    await appendAuditRecord(context, {
      event: "capability_success",
      capability: normalizedName,
      elapsedMs: Date.now() - startedAt,
      result: summarizeForAudit(result),
      runContext: context.runContext,
    });
    return result;
  } catch (error) {
    await appendAuditRecord(context, {
      event: "capability_error",
      capability: normalizedName,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      runContext: context.runContext,
    });
    throw error;
  }
}

function normalizeCapabilityCall(call) {
  const source = call && typeof call === "object" ? call : {};
  const name = toSafeString(source.name || source.capability || source.tool, "").trim();
  const nestedArgs =
    source.args && typeof source.args === "object" ? source.args : {};
  const args =
    Object.keys(nestedArgs).length > 0
      ? nestedArgs
      : (() => {
          const {
            name: _name,
            capability: _capability,
            tool: _tool,
            args: _args,
            ...rest
          } = source;
          return rest && typeof rest === "object" ? rest : {};
        })();
  return {
    name,
    args,
  };
}

async function runCapabilityCalls(calls = [], options = {}) {
  const normalizedCalls = Array.isArray(calls) ? calls : [];
  const results = [];
  for (const rawCall of normalizedCalls) {
    assertNotAborted(options);
    const call = normalizeCapabilityCall(rawCall);
    if (!call.name) {
      continue;
    }
    const result = await runCapabilityCall(call.name, call.args, options);
    results.push({
      name: call.name,
      args: call.args,
      result,
    });
  }
  return results;
}

function listCapabilityDefinitions() {
  return capabilityDefinitions.map((item) => ({ ...item }));
}

function listCapabilityRegistry() {
  return capabilityRegistry.map((item) => ({
    ...item,
    handler: undefined,
  }));
}

module.exports = {
  runCapabilityCall,
  runCapabilityCalls,
  listCapabilityDefinitions,
  listCapabilityRegistry,
};
