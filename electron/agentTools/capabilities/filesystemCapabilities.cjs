const path = require("path");
const { callFilesystemMcpTool } = require("../../integrations/mcp/filesystemMcpRuntime.cjs");
const { toSafeString, toFiniteInt, toBoolean } = require("./common.cjs");
const { resolveUserPath } = require("./pathPolicy.cjs");
const { clipText } = require("./fileUtils.cjs");
const { extractMcpTextContent, assertMcpToolSuccess } = require("./mcpText.cjs");
const { assertNotAborted, emitToolLog } = require("./context.cjs");

const DEFAULT_MAX_LIST_ENTRIES = 200;

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
    const type =
      rawType === "directory" ? "directory" : rawType === "file" ? "file" : "other";

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

async function fileReadText(args, context) {
  assertNotAborted(context);
  const targetPath = resolveUserPath(args.path, context, "file_read_text");
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
  const targetPath = resolveUserPath(args.path, context, "file_write_text");
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
  const targetPath = resolveUserPath(args.path, context, "file_list_directory");
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

const capabilities = [
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
];

module.exports = {
  fileReadText,
  fileWriteText,
  fileListDirectory,
  capabilities,
};
