import type {
  CompleteAttachment,
  PendingAttachment,
  ThreadMessage,
} from "@assistant-ui/react";
import { makeId } from "./shared";

const TEXT_ATTACHMENT_PREVIEW_LIMIT = 4_000;
const TEXT_ATTACHMENT_DECODE_BYTE_LIMIT = 12_000;

const textLikeFileExtensions = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".sql",
  ".log",
];

function isTextLikeAttachment(filename?: string, mimeType?: string) {
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();
  if (
    normalizedMimeType.startsWith("text/") ||
    normalizedMimeType.includes("json") ||
    normalizedMimeType.includes("xml") ||
    normalizedMimeType.includes("yaml") ||
    normalizedMimeType.includes("javascript") ||
    normalizedMimeType.includes("typescript")
  ) {
    return true;
  }

  const normalizedName = String(filename ?? "").toLowerCase();
  return textLikeFileExtensions.some((extension) =>
    normalizedName.endsWith(extension),
  );
}

function decodeBase64Utf8(base64Data: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeDataUrlToText(dataUrl: string) {
  if (!dataUrl) {
    return "";
  }

  if (!dataUrl.startsWith("data:")) {
    return dataUrl;
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return "";
  }

  const metadata = dataUrl.slice(5, commaIndex).toLowerCase();
  const payload = dataUrl.slice(commaIndex + 1);

  try {
    if (metadata.includes(";base64")) {
      const base64Limit = Math.ceil(
        (TEXT_ATTACHMENT_DECODE_BYTE_LIMIT * 4) / 3,
      );
      return decodeBase64Utf8(payload.slice(0, base64Limit));
    }

    return decodeURIComponent(payload);
  } catch {
    return "";
  }
}

function toPromptPreview(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= TEXT_ATTACHMENT_PREVIEW_LIMIT) {
    return normalized;
  }

  const truncatedCount = normalized.length - TEXT_ATTACHMENT_PREVIEW_LIMIT;
  return `${normalized.slice(0, TEXT_ATTACHMENT_PREVIEW_LIMIT).trim()}\n...[truncated ${truncatedCount} chars]`;
}

export function extractTextFromMessage(message: ThreadMessage) {
  const parts = message.content ?? [];
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      chunks.push(part.text);
      continue;
    }

    if (part.type === "image") {
      chunks.push(`[Uploaded Image] ${part.filename ?? "image"}`);
      continue;
    }

    if (part.type === "file") {
      const filename = part.filename ?? "file";
      const mimeType = part.mimeType ?? "application/octet-stream";
      const attachmentData = typeof part.data === "string" ? part.data : "";
      const canExtractText = isTextLikeAttachment(filename, mimeType);

      if (canExtractText && attachmentData) {
        const extracted = toPromptPreview(decodeDataUrlToText(attachmentData));
        if (extracted) {
          chunks.push(`[Uploaded File Content] ${filename}`);
          chunks.push(extracted);
          continue;
        }
      }

      chunks.push(`[Uploaded File] ${filename} (${mimeType})`);
      continue;
    }

    if (part.type === "data") {
      chunks.push(
        `[Data:${part.name}] ${JSON.stringify(part.data).slice(0, 320)}`,
      );
    }
  }

  return chunks.join("\n").trim();
}

function detectAttachmentType(file: File) {
  if (file.type.startsWith("image/")) {
    return "image" as const;
  }

  if (
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".csv")
  ) {
    return "document" as const;
  }

  return "file" as const;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export class DocumentAttachmentAdapter {
  accept =
    ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    return {
      id: makeId("att"),
      type: detectAttachmentType(file),
      name: file.name,
      contentType: file.type || undefined,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const file = attachment.file;
    const data = await readFileAsDataUrl(file);

    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          data,
        },
      ],
    };
  }

  async remove(): Promise<void> {
    return;
  }
}
