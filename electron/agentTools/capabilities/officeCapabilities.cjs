const fs = require("fs/promises");
const path = require("path");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const { Document, HeadingLevel, Packer, Paragraph } = require("docx");
const { toSafeString, toBoolean } = require("./common.cjs");
const { resolveUserPath } = require("./pathPolicy.cjs");
const { clipText, ensureParentDirectory } = require("./fileUtils.cjs");
const { assertNotAborted } = require("./context.cjs");
const { fileReadText, fileWriteText } = require("./filesystemCapabilities.cjs");

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
  const targetPath = resolveUserPath(args.path, context, "office_read_document");
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
  const targetPath = resolveUserPath(args.path, context, "office_write_document");
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

const capabilities = [
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
];

module.exports = {
  officeReadDocument,
  officeWriteDocument,
  capabilities,
};
