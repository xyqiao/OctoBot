import { List, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { ChatSession, NavView } from "../../types";
import ChatItemMenu from "./ChatItemMenu";
import ChatListItem from "./ChatListItem";

type ChatListSectionProps = {
  chats: ChatSession[];
  view: NavView;
  selectedChatId: string;
  onSelectChat: (chatId: string) => void;
  onSelectView: (view: NavView) => void;
  onRenameChat: (chat: ChatSession) => void;
  onDeleteChat: (chat: ChatSession) => void;
};

export default function ChatListSection({
  chats,
  view,
  selectedChatId,
  onSelectChat,
  onSelectView,
  onRenameChat,
  onDeleteChat,
}: ChatListSectionProps) {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuChatId, setMenuChatId] = useState("");
  const [hoveredChatId, setHoveredChatId] = useState("");

  const menuOpen = Boolean(menuAnchorEl && menuChatId);
  const menuChat = useMemo(
    () => chats.find((chat) => chat.id === menuChatId) ?? null,
    [chats, menuChatId],
  );

  function closeMenu() {
    setMenuAnchorEl(null);
    setMenuChatId("");
  }

  function handleMenuButtonClick(
    event: MouseEvent<HTMLButtonElement>,
    chatId: string,
  ) {
    if (menuOpen && menuChatId === chatId) {
      closeMenu();
      return;
    }
    setMenuAnchorEl(event.currentTarget);
    setMenuChatId(chatId);
  }

  return (
    <>
      <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>
        对话记录
      </Typography>
      <List sx={{ py: 0, flex: 1 }}>
        {chats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            selected={view === "chat" && selectedChatId === chat.id}
            showMenuButton={hoveredChatId === chat.id || menuChatId === chat.id}
            onSelect={(chatId) => {
              onSelectView("chat");
              onSelectChat(chatId);
            }}
            onHoverStart={(chatId) => {
              setHoveredChatId(chatId);
            }}
            onHoverEnd={(chatId) => {
              setHoveredChatId((current) => (current === chatId ? "" : current));
            }}
            onMenuButtonClick={handleMenuButtonClick}
          />
        ))}
      </List>
      <ChatItemMenu
        anchorEl={menuAnchorEl}
        open={menuOpen}
        chat={menuChat}
        onClose={closeMenu}
        onRenameChat={onRenameChat}
        onDeleteChat={onDeleteChat}
      />
    </>
  );
}

