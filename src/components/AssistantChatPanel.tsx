import {
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type FC,
} from "react";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type CompleteAttachment,
  type EmptyMessagePartProps,
  type PendingAttachment,
  type ThreadMessage,
  type ThreadMessageLike,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import {
  AttachmentUI,
  BranchPicker,
  MessagePart,
  Thread,
  UserActionBar,
  makeMarkdownText,
} from "@assistant-ui/react-ui";
import { PrismLight as ReactSyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import langBash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import langCss from "react-syntax-highlighter/dist/esm/languages/prism/css";
import langJavascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import langJsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import langJson from "react-syntax-highlighter/dist/esm/languages/prism/json";
import langMarkdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import langMarkup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import langPython from "react-syntax-highlighter/dist/esm/languages/prism/python";
import langSql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import langTsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import langTypescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import langYaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import remarkGfm from "remark-gfm";
import { appendMessage } from "../utils/db";
import { runMultiAgentChatStream } from "../utils/graphRuntime";
import type { ChatMessage, UserSettings } from "../types";

type AssistantChatPanelProps = {
  chatId: string;
  messages: ChatMessage[];
  settings: UserSettings;
  onMessagePersisted: (message: ChatMessage) => void;
};

const TEXT_ATTACHMENT_PREVIEW_LIMIT = 4_000;
const TEXT_ATTACHMENT_DECODE_BYTE_LIMIT = 12_000;
const prismLanguageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  json5: "json",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  bash: "bash",
  py: "python",
  python: "python",
  sql: "sql",
  css: "css",
  html: "markup",
  xml: "markup",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
};
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

ReactSyntaxHighlighter.registerLanguage("javascript", langJavascript);
ReactSyntaxHighlighter.registerLanguage("jsx", langJsx);
ReactSyntaxHighlighter.registerLanguage("typescript", langTypescript);
ReactSyntaxHighlighter.registerLanguage("tsx", langTsx);
ReactSyntaxHighlighter.registerLanguage("json", langJson);
ReactSyntaxHighlighter.registerLanguage("bash", langBash);
ReactSyntaxHighlighter.registerLanguage("python", langPython);
ReactSyntaxHighlighter.registerLanguage("sql", langSql);
ReactSyntaxHighlighter.registerLanguage("css", langCss);
ReactSyntaxHighlighter.registerLanguage("markup", langMarkup);
ReactSyntaxHighlighter.registerLanguage("markdown", langMarkdown);
ReactSyntaxHighlighter.registerLanguage("yaml", langYaml);

type MarkdownTextComponents = NonNullable<
  NonNullable<Parameters<typeof makeMarkdownText>[0]>["components"]
>;
type MarkdownSyntaxHighlighterProps = ComponentProps<
  NonNullable<MarkdownTextComponents["SyntaxHighlighter"]>
>;

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

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

function extractTextFromMessage(message: ThreadMessage) {
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

function buildPromptWithContext(messages: readonly ThreadMessage[]) {
  const normalized = messages
    .map((message) => {
      const text = extractTextFromMessage(message).trim();
      return {
        role: message.role,
        text,
      };
    })
    .filter((item) => item.text.length > 0);

  let latestUserIndex = -1;
  for (let idx = normalized.length - 1; idx >= 0; idx -= 1) {
    if (normalized[idx].role === "user") {
      latestUserIndex = idx;
      break;
    }
  }

  const latestUserMessage =
    latestUserIndex >= 0 ? normalized[latestUserIndex].text : "";
  const historyWindow =
    latestUserIndex >= 0
      ? normalized.slice(Math.max(0, latestUserIndex - 10), latestUserIndex)
      : normalized.slice(-10);

  const historyTranscript =
    historyWindow.length > 0
      ? historyWindow
          .map((message) => {
            const role =
              message.role === "assistant"
                ? "助手"
                : message.role === "system"
                  ? "系统"
                  : "用户";
            return `${role}:\n${message.text}`;
          })
          .join("\n\n")
      : "(无历史对话)";

  return [
    "你将收到两部分内容：最近历史与当前用户最新消息。",
    "请严格以【当前用户最新消息】为本轮唯一要解决的问题，历史仅供参考。",
    "如果历史里出现旧问题，不要把它当作当前问题。",
    "允许先输出思考过程，再输出最终答复。",
    "在有助于可读性时，请使用 Markdown 格式输出。",
    "",
    "【最近历史（仅供参考）】",
    historyTranscript,
    "",
    "【当前用户最新消息（本轮必须回答）】",
    latestUserMessage || "(未检测到用户消息)",
  ].join("\n");
}

function toInitialMessages(messages: ChatMessage[]): ThreadMessageLike[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    createdAt: new Date(message.timestamp),
    content: [{ type: "text", text: message.content }],
  }));
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

class DocumentAttachmentAdapter {
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

function normalizePrismLanguage(language?: string) {
  if (!language) {
    return "";
  }
  const key = language.toLowerCase().trim();
  return prismLanguageAliases[key] ?? key;
}

const MarkdownSyntaxHighlighter = ({
  components,
  language,
  code,
}: MarkdownSyntaxHighlighterProps) => {
  const { Pre, Code } = components;
  const normalizedLanguage = normalizePrismLanguage(language);

  if (!normalizedLanguage) {
    return (
      <Pre>
        <Code>{code}</Code>
      </Pre>
    );
  }

  return (
    <ReactSyntaxHighlighter
      language={normalizedLanguage}
      style={oneDark}
      PreTag={Pre as never}
      CodeTag={Code as never}
      customStyle={{
        margin: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }}
    >
      {code}
    </ReactSyntaxHighlighter>
  );
};

const MarkdownText = makeMarkdownText({
  remarkPlugins: [remarkGfm],
  components: {
    SyntaxHighlighter: MarkdownSyntaxHighlighter,
  },
});

const ThinkingText: FC<EmptyMessagePartProps> = ({ status }) => {
  if (status.type !== "running") {
    return null;
  }

  return (
    <span className="nexus-thinking">
      思考中
      <span className="nexus-thinking-dots" aria-hidden="true">
        ...
      </span>
    </span>
  );
};

const UserMessageWithAvatar: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-user-message-root nexus-user-message-root">
      <MessagePrimitive.If hasAttachments>
        <div className="aui-user-message-attachments">
          <MessagePrimitive.Attachments
            components={{
              Attachment: AttachmentUI,
            }}
          />
        </div>
      </MessagePrimitive.If>

      <MessagePrimitive.If hasContent>
        <UserActionBar />
        <div className="aui-user-message-content">
          <MessagePrimitive.Content
            components={{
              Text: MessagePart.Text,
            }}
          />
        </div>
        <div className="nexus-user-avatar" aria-label="user avatar">
          <PersonOutlineRoundedIcon fontSize="small" />
        </div>
      </MessagePrimitive.If>

      <BranchPicker />
    </MessagePrimitive.Root>
  );
};

export function AssistantChatPanel({
  chatId,
  messages,
  settings,
  onMessagePersisted,
}: AssistantChatPanelProps) {
  console.log(messages);
  const initialMessages = useMemo(
    () => toInitialMessages(messages),
    [messages],
  );
  const persistedIdsRef = useRef<Set<string>>(
    new Set(messages.map((item) => item.id)),
  );
  const persistCallbackRef = useRef(onMessagePersisted);

  useEffect(() => {
    persistedIdsRef.current = new Set(messages.map((item) => item.id));
  }, [chatId, messages]);

  useEffect(() => {
    persistCallbackRef.current = onMessagePersisted;
  }, [onMessagePersisted]);

  const attachmentAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
        new DocumentAttachmentAdapter(),
      ]),
    [],
  );

  const chatModelAdapter = useMemo<ChatModelAdapter>(() => {
    return {
      async *run(options) {
        const latestUserMessage = [...options.messages]
          .reverse()
          .find((message) => message.role === "user");

        if (
          latestUserMessage &&
          !persistedIdsRef.current.has(latestUserMessage.id)
        ) {
          const userRecord: ChatMessage = {
            id: latestUserMessage.id,
            chatId,
            role: "user",
            content: extractTextFromMessage(latestUserMessage),
            timestamp: latestUserMessage.createdAt.getTime(),
          };

          await appendMessage(userRecord);
          persistCallbackRef.current(userRecord);
          persistedIdsRef.current.add(userRecord.id);
        }

        let fullAnswer = "";

        try {
          const prompt = buildPromptWithContext(options.messages);

          for await (const event of runMultiAgentChatStream({
            prompt,
            apiKey: settings.apiKey,
            modelName: settings.modelName.trim() || "gpt-4o-mini",
            baseUrl: settings.baseUrl,
            abortSignal: options.abortSignal,
          })) {
            if (event.type === "chunk") {
              fullAnswer += event.chunk;
              yield {
                content: [{ type: "text", text: fullAnswer }],
              };
            }

            if (event.type === "done") {
              fullAnswer = event.answer?.trim() || fullAnswer.trim();
            }

            if (event.type === "error") {
              throw new Error(event.error || "Unknown stream error");
            }
          }
        } catch (error) {
          if (options.abortSignal.aborted) {
            return;
          }
          fullAnswer = `执行失败：${error instanceof Error ? error.message : "Unknown error"}`;
          yield {
            content: [{ type: "text", text: fullAnswer }],
          };
        }

        if (options.abortSignal.aborted) {
          return;
        }

        const assistantRecord: ChatMessage = {
          id: options.unstable_assistantMessageId ?? makeId("msg_assistant"),
          chatId,
          role: "assistant",
          content: fullAnswer,
          timestamp: Date.now(),
        };

        if (!persistedIdsRef.current.has(assistantRecord.id)) {
          await appendMessage(assistantRecord);
          persistCallbackRef.current(assistantRecord);
          persistedIdsRef.current.add(assistantRecord.id);
        }
      },
    };
  }, [chatId, settings.apiKey, settings.baseUrl, settings.modelName]);

  const runtime = useLocalRuntime(chatModelAdapter, {
    initialMessages,
    adapters: {
      attachments: attachmentAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        assistantAvatar={{ fallback: "AI" }}
        composer={{ allowAttachments: true }}
        assistantMessage={{
          components: {
            Text: MarkdownText,
            Empty: ThinkingText,
          },
        }}
        components={{
          UserMessage: UserMessageWithAvatar,
        }}
        strings={{
          welcome: { message: "" },
          composer: {
            input: { placeholder: "请在这里输入你的指令或提示..." },
          },
        }}
      />
    </AssistantRuntimeProvider>
  );
}

export default AssistantChatPanel;
