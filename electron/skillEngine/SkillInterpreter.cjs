const fs = require("fs/promises");
const path = require("path");

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function slugifySkillName(value) {
  const normalized = toSafeString(value, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "skill";
}

function normalizeSectionKey(value) {
  return toSafeString(value, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function splitListValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => toSafeString(item, "").trim())
      .filter(Boolean);
  }

  const raw = toSafeString(value, "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\n,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontmatterValue(raw) {
  const value = raw.trim();
  if (!value) {
    return "";
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (!Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseFrontmatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return {
      data: {},
      body: markdown,
    };
  }

  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    return {
      data: {},
      body: markdown,
    };
  }

  const data = {};
  for (const rawLine of lines.slice(1, endIndex)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf(":");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();
    if (!key) {
      continue;
    }
    data[key] = parseFrontmatterValue(value);
  }

  return {
    data,
    body: lines.slice(endIndex + 1).join("\n"),
  };
}

function parseMarkdownSections(markdownBody) {
  const lines = markdownBody.split(/\r?\n/);
  const sections = new Map();
  let currentHeading = "__preamble__";
  let firstHeading = "";

  sections.set(currentHeading, []);

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
      if (!firstHeading) {
        firstHeading = currentHeading;
      }
      if (!sections.has(currentHeading)) {
        sections.set(currentHeading, []);
      }
      continue;
    }

    sections.get(currentHeading).push(line);
  }

  return {
    sections,
    firstHeading,
  };
}

function sectionContentToList(content) {
  return toSafeString(content, "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
        .trim(),
    )
    .filter(Boolean);
}

function resolveSectionContent(sections, aliases = []) {
  const normalizedAliases = aliases.map((item) => normalizeSectionKey(item));

  for (const [heading, lines] of sections.entries()) {
    if (heading === "__preamble__") {
      continue;
    }

    const normalizedHeading = normalizeSectionKey(heading);
    const matched = normalizedAliases.some((alias) => {
      if (!alias) {
        return false;
      }
      return (
        normalizedHeading === alias ||
        normalizedHeading.includes(alias) ||
        alias.includes(normalizedHeading)
      );
    });

    if (!matched) {
      continue;
    }

    const text = lines.join("\n").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function extractFirstParagraph(content) {
  const blocks = toSafeString(content, "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  return blocks[0] || "";
}

function isPathWithinRoot(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveSkillRelativePath(skillRoot, relativePath) {
  const raw = toSafeString(relativePath, "").trim();
  if (!raw) {
    return null;
  }

  if (path.isAbsolute(raw)) {
    throw new Error(`技能路径必须相对于技能根目录: ${raw}`);
  }

  const absolute = path.resolve(skillRoot, raw);
  if (!isPathWithinRoot(skillRoot, absolute)) {
    throw new Error(`技能路径越过了技能根目录: ${raw}`);
  }

  return absolute;
}

function uniqueStrings(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const text = toSafeString(item, "").trim();
    if (!text) {
      continue;
    }
    if (seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }

  return result;
}

function normalizePolicyValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSafeString(item, "").trim()).filter(Boolean);
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return value;
}

function normalizePolicySection(sectionText) {
  if (!sectionText) {
    return {};
  }
  const lines = sectionText.split(/\r?\n/);
  const policy = {};
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) {
      continue;
    }
    const match = raw.match(/^[\-*+]\s*([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const key = normalizeSectionKey(match[1]);
    const value = parseFrontmatterValue(match[2]);
    policy[key] = normalizePolicyValue(value);
  }
  return policy;
}

async function parseSkillDirectory(skillRoot, options = {}) {
  const strict = options.strict !== false;
  const normalizedRoot = path.resolve(skillRoot);
  const skillMarkdownPath = path.join(normalizedRoot, "SKILL.md");

  const markdown = await fs.readFile(skillMarkdownPath, { encoding: "utf8" });
  const { data: metadata, body } = parseFrontmatter(markdown);
  const { sections, firstHeading } = parseMarkdownSections(body);

  const purpose = resolveSectionContent(sections, [
    "用途",
    "purpose",
    "overview",
    "简介",
    "目标",
  ]);
  const trigger = resolveSectionContent(sections, [
    "触发条件",
    "trigger",
    "triggers",
    "启用条件",
  ]);
  const steps = resolveSectionContent(sections, [
    "执行步骤",
    "步骤",
    "workflow",
    "steps",
    "执行流程",
  ]);
  const tools = resolveSectionContent(sections, [
    "依赖工具",
    "tools",
    "dependencies",
    "工具依赖",
  ]);
  const fallback = resolveSectionContent(sections, [
    "失败回退",
    "fallback",
    "回退",
    "异常处理",
  ]);

  const policySection = resolveSectionContent(sections, [
    "策略",
    "policy",
    "policies",
  ]);
  const policyFromSection = normalizePolicySection(policySection);
  const policy = {
    allowedTools: normalizePolicyValue(metadata.allowedTools || metadata.allowed_tools || policyFromSection.allowedtools),
    requiredSteps: normalizePolicyValue(metadata.requiredSteps || metadata.required_steps || policyFromSection.requiredsteps),
    fallbackStrategy: normalizePolicyValue(metadata.fallbackStrategy || metadata.fallback_strategy || policyFromSection.fallbackstrategy),
    agentConstraints: normalizePolicyValue(metadata.agentConstraints || metadata.agent_constraints || policyFromSection.agentconstraints),
  };

  if (strict) {
    const missing = [];
    if (!purpose.trim()) missing.push("用途 / purpose");
    if (!trigger.trim()) missing.push("触发条件 / triggers");
    if (!steps.trim()) missing.push("执行步骤 / steps");
    if (!tools.trim()) missing.push("依赖工具 / tools");
    if (!fallback.trim()) missing.push("失败回退 / fallback");

    if (missing.length > 0) {
      throw new Error(
        `SKILL.md 无效，路径 ${skillMarkdownPath}，缺少章节: ${missing.join(", ")}`,
      );
    }
  }

  const displayName = toSafeString(
    metadata.name,
    firstHeading || path.basename(normalizedRoot),
  ).trim();
  const description = toSafeString(
    metadata.description,
    extractFirstParagraph(purpose || trigger),
  ).trim();
  const iconRelativePath = toSafeString(
    metadata.icon || metadata.iconPath || metadata.icon_path,
    "",
  ).trim();
  const iconPath = iconRelativePath
    ? resolveSkillRelativePath(normalizedRoot, iconRelativePath)
    : null;

  if (iconPath) {
    try {
      await fs.access(iconPath);
    } catch {
      throw new Error(`技能图标不存在: ${iconRelativePath}`);
    }
  }

  const aliases = uniqueStrings([
    ...splitListValue(metadata.aliases),
    displayName,
    slugifySkillName(displayName),
  ]);
  const keywords = uniqueStrings([
    ...splitListValue(metadata.keywords),
    ...sectionContentToList(trigger),
  ]);

  return {
    skillRoot: normalizedRoot,
    skillMarkdownPath,
    name: displayName,
    skillName: slugifySkillName(displayName),
    description: description || displayName,
    iconPath,
    iconRelativePath: iconRelativePath || null,
    version: toSafeString(metadata.version, "").trim() || null,
    purpose: purpose.trim(),
    trigger: trigger.trim(),
    steps: sectionContentToList(steps),
    tools: sectionContentToList(tools),
    fallback: sectionContentToList(fallback),
    policy,
    triggers: {
      aliases,
      keywords,
    },
  };
}

module.exports = {
  parseSkillDirectory,
  resolveSkillRelativePath,
  slugifySkillName,
};
