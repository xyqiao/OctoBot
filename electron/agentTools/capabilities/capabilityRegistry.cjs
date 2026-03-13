const { toSafeString } = require("./common.cjs");
const { capabilities: taskCapabilities } = require("./taskCapabilities.cjs");
const { capabilities: filesystemCapabilities } = require("./filesystemCapabilities.cjs");
const { capabilities: officeCapabilities } = require("./officeCapabilities.cjs");

function normalizeCapabilityRegistry(registry = []) {
  const normalized = [];
  for (const item of Array.isArray(registry) ? registry : []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const name = toSafeString(item?.name, "").trim().toLowerCase();
    const description = toSafeString(item?.description, "").trim();
    const handler = typeof item?.handler === "function" ? item.handler : null;
    const aliases = Array.isArray(item?.aliases)
      ? item.aliases.map((alias) => toSafeString(alias, "").trim().toLowerCase()).filter(Boolean)
      : [];
    if (!name || !handler) {
      continue;
    }
    normalized.push({
      ...item,
      name,
      description,
      handler,
      aliases,
    });
  }
  return normalized;
}

const capabilityRegistry = normalizeCapabilityRegistry([
  ...taskCapabilities,
  ...filesystemCapabilities,
  ...officeCapabilities,
]);

module.exports = {
  capabilityRegistry,
  normalizeCapabilityRegistry,
};
