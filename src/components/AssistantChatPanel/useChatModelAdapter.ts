import { useEffect, useMemo, useRef } from "react";
import type { ChatModelAdapter } from "@assistant-ui/react";
import { appendMessage } from "../../utils/db";
import { runMultiAgentChatStream } from "../../utils/graphRuntime";
import type { ChatMessage } from "../../types";
import { parseAssistantResponse, toAssistantContentParts } from "./assistantResponseParser";
import { extractTextFromMessage } from "./attachmentUtils";
import { buildPromptWithContext } from "./messageUtils";
import { makeId } from "./shared";
import type { AssistantChatPanelProps } from "./types";

type UseChatModelAdapterOptions = Pick<
  AssistantChatPanelProps,
  "chatId" | "messages" | "settings" | "onMessagePersisted"
>;

export function useChatModelAdapter({
  chatId,
  messages,
  settings,
  onMessagePersisted,
}: UseChatModelAdapterOptions): ChatModelAdapter {
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

  return useMemo<ChatModelAdapter>(() => {
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
                content: toAssistantContentParts(fullAnswer),
              };
            }

            if (event.type === "done") {
              fullAnswer = event.answer || fullAnswer;
              yield {
                content: toAssistantContentParts(fullAnswer),
              };
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

        const persistedAssistantAnswer = (() => {
          const parsed = parseAssistantResponse(fullAnswer);
          const normalizedAnswer = parsed.answer.trim();
          if (normalizedAnswer.length > 0) {
            return normalizedAnswer;
          }
          return fullAnswer.trim();
        })();

        const assistantRecord: ChatMessage = {
          id: options.unstable_assistantMessageId ?? makeId("msg_assistant"),
          chatId,
          role: "assistant",
          content: persistedAssistantAnswer,
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
}
