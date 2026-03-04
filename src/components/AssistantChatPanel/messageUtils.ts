import type { ThreadMessage, ThreadMessageLike } from "@assistant-ui/react";
import type { ChatMessage } from "../../types";
import { toAssistantContentParts } from "./assistantResponseParser";
import { extractTextFromMessage } from "./attachmentUtils";

export function buildPromptWithContext(messages: readonly ThreadMessage[]) {
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

export function toInitialMessages(messages: ChatMessage[]): ThreadMessageLike[] {
  return messages.map((message) => {
    const content: ThreadMessageLike["content"] =
      message.role === "assistant"
        ? toAssistantContentParts(message.content)
        : [{ type: "text" as const, text: message.content }];

    return {
      id: message.id,
      role: message.role,
      createdAt: new Date(message.timestamp),
      content,
    };
  });
}
