import type { ChatSession, NavView } from "../../types";

export type AppSidebarProps = {
  chats: ChatSession[];
  view: NavView;
  selectedChatId: string;
  onSelectChat: (chatId: string) => void;
  onSelectView: (view: NavView) => void;
  onCreateChat: () => void;
  onRenameChat: (chat: ChatSession) => void;
  onDeleteChat: (chat: ChatSession) => void;
};

