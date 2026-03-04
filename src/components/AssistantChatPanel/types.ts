import type { ChatMessage, UserSettings } from "../../types";

export type AssistantChatPanelProps = {
  chatId: string;
  messages: ChatMessage[];
  settings: UserSettings;
  onMessagePersisted: (message: ChatMessage) => void;
};
