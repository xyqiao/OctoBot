const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const { Document, HeadingLevel, Packer, Paragraph } = require("docx");
const { callFilesystemMcpTool } = require("./filesystemMcpRuntime.cjs");

const DEFAULT_TEXT_LIMIT = 120_000;
const DEFAULT_MAX_LIST_ENTRIES = 200;
const DEFAULT_AUDIT_LOG_PATH = path.resolve(
  process.cwd(),
  "logs",
  "agent-tools-audit.ndjson",
);

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function toFiniteInt(
  value,
  fallback,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function normalizeObject(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return {};
}

function clipText(text, maxChars = DEFAULT_TEXT_LIMIT) {
  const source = toSafeString(text, "");
  const limit = toFiniteInt(maxChars, DEFAULT_TEXT_LIMIT, {
    min: 512,
    max: 2_000_000,
  });
  if (source.length <= limit) {
    return {
      text: source,
      truncated: false,
      totalChars: source.length,
    };
  }

  return {
    text: `${source.slice(0, limit)}\n\n...[truncated]`,
    truncated: true,
    totalChars: source.length,
  };
}

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

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function extractMcpTextContent(result) {
  const structured = toSafeString(result?.structuredContent?.content, "");
  if (structured) {
    return structured;
  }

  const contentParts = Array.isArray(result?.content) ? result.content : [];
  return contentParts
    .map((part) => toSafeString(part?.text, "").trim())
    .filter(Boolean)
    .join("\n");
}

function assertMcpToolSuccess(result, toolName) {
  if (!result || typeof result !== "object") {
    return;
  }
  if (!result.isError) {
    return;
  }

  const text = extractMcpTextContent(result);
  throw new Error(
    text ||
      `Filesystem MCP 工具 "${toSafeString(toolName, "unknown")}" 返回了错误。`,
  );
}

async function callFilesystemTool(toolName, args, context) {
  const result = await callFilesystemMcpTool(toolName, args, {
    baseDir: context?.baseDir,
    allowedRoots: context?.allowedRoots,
    onLog: context?.onLog,
  });
  assertMcpToolSuccess(result, toolName);
  return result;
}

function parseListDirectoryText(rawText, dirPath) {
  const lines = toSafeString(rawText, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = [];
  for (const line of lines) {
    const match = line.match(/^\[(FILE|DIR)\]\s+(.+)$/i);
    if (!match) {
      continue;
    }
    const type = match[1].toUpperCase() === "DIR" ? "directory" : "file";
    const name = toSafeString(match[2], "").trim();
    if (!name) {
      continue;
    }
    entries.push({
      name,
      path: path.join(dirPath, name),
      type,
    });
  }
  return entries;
}

function flattenDirectoryTree(nodes, parentPath, entries, maxEntries) {
  const queue = Array.isArray(nodes)
    ? nodes.map((node) => ({ node, parentPath }))
    : [];

  while (queue.length > 0 && entries.length < maxEntries) {
    const current = queue.shift();
    const item = current?.node && typeof current.node === "object" ? current.node : {};
    const name = toSafeString(item.name, "").trim();
    if (!name) {
      continue;
    }

    const itemPath = path.join(current.parentPath, name);
    const rawType = toSafeString(item.type, "").trim().toLowerCase();
    const type = rawType === "directory" ? "directory" : rawType === "file" ? "file" : "other";

    entries.push({
      name,
      path: itemPath,
      type,
    });

    if (entries.length >= maxEntries) {
      break;
    }

    if (type === "directory" && Array.isArray(item.children)) {
      for (const child of item.children) {
        queue.push({
          node: child,
          parentPath: itemPath,
        });
      }
    }
  }
}

function createAbortError() {
  const error = new Error("RUN_ABORTED");
  error.code = "RUN_ABORTED";
  return error;
}

function assertNotAborted(context) {
  if (context?.isAborted?.()) {
    throw createAbortError();
  }
}

function emitToolLog(context, message, meta = {}) {
  if (typeof context?.onLog === "function") {
    context.onLog(message, meta);
  }
}

function summarizeForAudit(value, depth = 0) {
  if (depth > 3) {
    return "[MaxDepth]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > 240) {
      return `${value.slice(0, 240)}...(truncated)`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeForAudit(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 30);
    const result = {};
    for (const [key, item] of entries) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("apikey")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = summarizeForAudit(item, depth + 1);
      }
    }
    return result;
  }

  return toSafeString(value, "");
}

async function appendAuditRecord(context, record) {
  const logPath = toSafeString(context?.auditLogPath, DEFAULT_AUDIT_LOG_PATH);
  const payload = {
    ts: Date.now(),
    ...record,
  };

  try {
    await ensureParentDirectory(logPath);
    await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8" });
  } catch {
    // Do not break tool execution due to audit file IO errors.
  }
}

async function fileReadText(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(
    args.path,
    context,
    "file_read_text",
  );
  const encoding = toSafeString(args.encoding, "utf8");
  if (encoding.toLowerCase() !== "utf8") {
    emitToolLog(
      context,
      `filesystem MCP read_text_file uses UTF-8. Requested encoding "${encoding}" will be ignored.`,
    );
  }

  const result = await callFilesystemTool(
    "read_text_file",
    {
      path: targetPath,
    },
    context,
  );
  const content = extractMcpTextContent(result);
  const clipped = clipText(content, args.maxChars);
  return {
    path: targetPath,
    encoding,
    content: clipped.text,
    truncated: clipped.truncated,
    totalChars: clipped.totalChars,
  };
}

async function fileWriteText(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(
    args.path,
    context,
    "file_write_text",
  );
  const append = toBoolean(args.append, false);
  const ensureParentDir = toBoolean(args.ensureParentDir, true);
  const content = toSafeString(args.content, "");
  const encoding = toSafeString(args.encoding, "utf8");

  if (encoding.toLowerCase() !== "utf8") {
    emitToolLog(
      context,
      `filesystem MCP write_file uses UTF-8. Requested encoding "${encoding}" will be ignored.`,
    );
  }

  if (ensureParentDir) {
    await callFilesystemTool(
      "create_directory",
      {
        path: path.dirname(targetPath),
      },
      context,
    );
  }

  let nextContent = content;
  if (append) {
    let existing = "";
    try {
      const readResult = await callFilesystemTool(
        "read_text_file",
        {
          path: targetPath,
        },
        context,
      );
      existing = extractMcpTextContent(readResult);
    } catch (error) {
      const message = toSafeString(error?.message, "").toLowerCase();
      if (
        !message.includes("enoent") &&
        !message.includes("no such file") &&
        !message.includes("not found")
      ) {
        throw error;
      }
    }
    nextContent = `${existing}${content}`;
  }

  await callFilesystemTool(
    "write_file",
    {
      path: targetPath,
      content: nextContent,
    },
    context,
  );

  return {
    path: targetPath,
    bytesWritten: Buffer.byteLength(content, "utf8"),
    append,
    encoding,
  };
}

async function fileListDirectory(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(
    args.path,
    context,
    "file_list_directory",
  );
  const recursive = toBoolean(args.recursive, false);
  const maxEntries = toFiniteInt(args.maxEntries, DEFAULT_MAX_LIST_ENTRIES, {
    min: 1,
    max: 10_000,
  });

  let entries = [];
  if (recursive) {
    const treeResult = await callFilesystemTool(
      "directory_tree",
      {
        path: targetPath,
      },
      context,
    );
    const treeText = extractMcpTextContent(treeResult);
    let treeNodes = [];
    try {
      const parsed = JSON.parse(treeText);
      treeNodes = Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error("filesystem MCP 的 directory_tree 返回了无效 JSON。");
    }
    entries = [];
    flattenDirectoryTree(treeNodes, targetPath, entries, maxEntries);
  } else {
    const listResult = await callFilesystemTool(
      "list_directory",
      {
        path: targetPath,
      },
      context,
    );
    const listText = extractMcpTextContent(listResult);
    entries = parseListDirectoryText(listText, targetPath).slice(0, maxEntries);
  }

  return {
    path: targetPath,
    recursive,
    entries,
    total: entries.length,
    capped: entries.length >= maxEntries,
  };
}

function normalizeDocxParagraphs(args) {
  if (Array.isArray(args.paragraphs)) {
    return args.paragraphs.map((item) => toSafeString(item, ""));
  }

  const text = toSafeString(args.content, "");
  if (!text) {
    return [];
  }

  return text.split(/\r?\n/);
}

function normalizeSpreadsheetRows(rawRows) {
  if (Array.isArray(rawRows)) {
    return rawRows;
  }
  return [];
}

function inferSpreadsheetBookType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    return "csv";
  }
  if (ext === ".xls") {
    return "xls";
  }
  return "xlsx";
}

async function officeReadDocument(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(
    args.path,
    context,
    "office_read_document",
  );
  const ext = path.extname(targetPath).toLowerCase();

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: targetPath });
    const clipped = clipText(result.value, args.maxChars);
    return {
      path: targetPath,
      format: "docx",
      content: clipped.text,
      truncated: clipped.truncated,
      totalChars: clipped.totalChars,
    };
  }

  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
    const workbook = xlsx.readFile(targetPath, { cellDates: true });
    const sheetName = toSafeString(args.sheetName, workbook.SheetNames[0]);
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`未找到工作表 "${sheetName}"。`);
    }
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
    return {
      path: targetPath,
      format: ext.replace(".", ""),
      sheetName,
      rows,
      rowCount: rows.length,
    };
  }

  if (ext === ".txt" || ext === ".md" || ext === ".json") {
    return fileReadText(args, context);
  }

  throw new Error(`不支持的 Office 文档格式: ${ext || "unknown"}`);
}

async function officeWriteDocument(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(
    args.path,
    context,
    "office_write_document",
  );
  const ext = path.extname(targetPath).toLowerCase();
  await ensureParentDirectory(targetPath);

  if (ext === ".docx") {
    const title = toSafeString(args.title, "").trim();
    const paragraphs = normalizeDocxParagraphs(args);
    const children = [];

    if (title) {
      children.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
        }),
      );
    }

    for (const text of paragraphs) {
      children.push(
        new Paragraph({
          text,
        }),
      );
    }

    const document = new Document({
      sections: [
        {
          children,
        },
      ],
    });
    const buffer = await Packer.toBuffer(document);
    await fs.writeFile(targetPath, buffer);

    return {
      path: targetPath,
      format: "docx",
      paragraphCount: paragraphs.length,
      title: title || null,
    };
  }

  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
    const rows = normalizeSpreadsheetRows(args.rows ?? args.content);
    const sheetName = toSafeString(args.sheetName, "Sheet1");
    const workbook = xlsx.utils.book_new();

    const worksheet =
      rows.length > 0 && Array.isArray(rows[0])
        ? xlsx.utils.aoa_to_sheet(rows)
        : xlsx.utils.json_to_sheet(rows);

    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    xlsx.writeFile(workbook, targetPath, {
      bookType: inferSpreadsheetBookType(targetPath),
    });

    return {
      path: targetPath,
      format: ext.replace(".", ""),
      sheetName,
      rowCount: rows.length,
    };
  }

  if (ext === ".txt" || ext === ".md") {
    return fileWriteText(args, context);
  }

  if (ext === ".json") {
    const pretty = toBoolean(args.prettyJson, true);
    const content = pretty
      ? `${JSON.stringify(args.content ?? {}, null, 2)}\n`
      : JSON.stringify(args.content ?? {});
    return fileWriteText(
      {
        ...args,
        content,
      },
      context,
    );
  }

  throw new Error(`写入时不支持的 Office 文档格式: ${ext || "unknown"}`);
}

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
  {
    name: "file_read_text",
    description: "Read a local text-like file and return its content.",
    handler: fileReadText,
    aliases: ["read_text_file", "read_text"],
  },
  {
    name: "file_write_text",
    description: "Write or append text content into a local file.",
    handler: fileWriteText,
    aliases: ["write_file", "write_text", "append_text"],
  },
  {
    name: "file_list_directory",
    description: "List files/folders from a local directory.",
    handler: fileListDirectory,
    aliases: ["list_directory"],
  },
  {
    name: "office_read_document",
    description: "Read office-like docs (.docx/.xlsx/.xls/.csv/.txt/.md/.json).",
    handler: officeReadDocument,
    aliases: ["read_document"],
  },
  {
    name: "office_write_document",
    description: "Write office-like docs (.docx/.xlsx/.xls/.csv/.txt/.md/.json).",
    handler: officeWriteDocument,
    aliases: ["write_document"],
  },
]);

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
