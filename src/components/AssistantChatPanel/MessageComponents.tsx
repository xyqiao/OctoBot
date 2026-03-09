import { useEffect, useRef, type FC } from "react";
import {
  ChainOfThoughtPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
  useThread,
} from "@assistant-ui/react";
import {
  AssistantActionBar,
  AssistantMessage,
  AttachmentUI,
  BranchPicker,
  MessagePart,
} from "@assistant-ui/react-ui";
import { MarkdownText, ThinkingText } from "./MarkdownText";

const ReasoningChainOfThought: FC = () => {
  const aui = useAui();
  const collapsed = useAuiState((state) => state.chainOfThought.collapsed);
  const hasAnswerText = useAuiState((state) =>
    state.message.parts.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    ),
  );
  const hasReasoning = useAuiState((state) =>
    state.chainOfThought.parts.some(
      (part) => part.type === "reasoning" && part.text.trim().length > 0,
    ),
  );
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    if (!hasAnswerText) {
      autoCollapsedRef.current = false;
      if (collapsed) {
        aui.chainOfThought().setCollapsed(false);
      }
      return;
    }

    if (!autoCollapsedRef.current && !collapsed) {
      aui.chainOfThought().setCollapsed(true);
      autoCollapsedRef.current = true;
    }
  }, [aui, collapsed, hasAnswerText]);

  if (!hasReasoning) {
    return null;
  }

  return (
    <ChainOfThoughtPrimitive.Root
      className="nexus-cot-root"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <ChainOfThoughtPrimitive.AccordionTrigger className="nexus-cot-trigger">
        {collapsed ? "思考过程（展开）" : "思考过程（收起）"}
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <div className="nexus-cot-content">
        <ChainOfThoughtPrimitive.Parts
          components={{
            Reasoning: MarkdownText,
          }}
        />
      </div>
    </ChainOfThoughtPrimitive.Root>
  );
};

const AssistantMessageTools: FC = () => {
  const allowCopy = useThread((thread) => thread.capabilities.unstable_copy);
  const allowReload = useThread((thread) => thread.capabilities.reload);

  if (!allowCopy && !allowReload) {
    return null;
  }

  return (
    <AssistantActionBar.Root hideWhenRunning autohide="not-last">
      {allowCopy ? <AssistantActionBar.Copy /> : null}
      {allowReload ? <AssistantActionBar.Reload /> : null}
    </AssistantActionBar.Root>
  );
};

export const AssistantMessageWithReasoning: FC = () => {
  return (
    <AssistantMessage.Root className="nexus-assistant-message-root">
      <AssistantMessage.Content
        components={{
          Text: MarkdownText,
          Empty: ThinkingText,
          ChainOfThought: ReasoningChainOfThought,
        }}
      />
      <BranchPicker />
      <AssistantMessageTools />
    </AssistantMessage.Root>
  );
};

export const UserMessageWithAvatar: FC = () => {
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
        <div className="aui-user-message-content">
          <MessagePrimitive.Content
            components={{
              Text: MessagePart.Text,
            }}
          />
        </div>
      </MessagePrimitive.If>

      <BranchPicker />
    </MessagePrimitive.Root>
  );
};
