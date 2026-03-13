const path = require("path");
const os = require("os");
const { toSafeString } = require("./common.cjs");

function defaultAllowedRoots(baseDir = process.cwd()) {
  const root = path.parse(path.resolve(baseDir || process.cwd())).root;
  return [root || path.sep || "/"];
}

function parseAllowedRoots(rawAllowedRoots, baseDir = process.cwd()) {
  const fromEnv = toSafeString(process.env.AGENT_TOOL_ALLOWED_DIRS, "").trim();
  const envRoots = fromEnv
    ? fromEnv
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const roots =
    Array.isArray(rawAllowedRoots) && rawAllowedRoots.length > 0
      ? rawAllowedRoots
      : envRoots.length > 0
        ? envRoots
        : defaultAllowedRoots(baseDir);

  return roots
    .map((item) => {
      const raw = toSafeString(item, "").trim();
      if (!raw) {
        return "";
      }
      const expanded = raw.startsWith("~/")
        ? path.join(os.homedir(), raw.slice(2))
        : raw;
      const absolute = path.isAbsolute(expanded)
        ? expanded
        : path.resolve(baseDir, expanded);
      return path.resolve(absolute);
    })
    .filter(Boolean);
}

function isPathWithinRoot(targetPath, rootPath) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(rootPath);
  if (normalizedTarget === normalizedRoot) {
    return true;
  }
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertPathAllowed(targetPath, context, purpose = "file access") {
  const allowedRoots = Array.isArray(context.allowedRoots)
    ? context.allowedRoots
    : [];

  if (allowedRoots.length === 0) {
    return;
  }

  const allowed = allowedRoots.some((root) => isPathWithinRoot(targetPath, root));
  if (!allowed) {
    const rootsPreview = allowedRoots.map((root) => `"${root}"`).join(", ");
    throw new Error(
      `路径不在允许范围内: ${targetPath}. 允许目录: ${rootsPreview || "(none)"}.`,
    );
  }
}

function resolveUserPath(targetPath, context, purpose = "file access") {
  const input = toSafeString(targetPath, "").trim();
  if (!input) {
    throw new Error("必须提供路径。");
  }

  const expanded = input.startsWith("~/")
    ? path.join(os.homedir(), input.slice(2))
    : input;

  const baseDir = context?.baseDir || process.cwd();
  const absolute = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(baseDir, expanded);

  assertPathAllowed(absolute, context, purpose);
  return absolute;
}

module.exports = {
  defaultAllowedRoots,
  parseAllowedRoots,
  isPathWithinRoot,
  assertPathAllowed,
  resolveUserPath,
};
