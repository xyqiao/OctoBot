import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useLocalRuntime,
} from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { DocumentAttachmentAdapter } from "./attachmentUtils";
import {
  AssistantMessageWithReasoning,
  UserMessageWithAvatar,
} from "./MessageComponents";
import { toInitialMessages } from "./messageUtils";
import type { AssistantChatPanelProps } from "./types";
import { useChatModelAdapter } from "./useChatModelAdapter";

export function AssistantChatPanel({
  chatId,
  messages,
  settings,
  onMessagePersisted,
}: AssistantChatPanelProps) {
  const initialMessages = useMemo(
    () => toInitialMessages(messages),
    [messages],
  );

  const attachmentAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
        new DocumentAttachmentAdapter(),
      ]),
    [],
  );

  const chatModelAdapter = useChatModelAdapter({
    chatId,
    messages,
    settings,
    onMessagePersisted,
  });

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
        components={{
          AssistantMessage: AssistantMessageWithReasoning,
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
