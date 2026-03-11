import { Divider, Paper } from "@mui/material";
import type { AppSidebarProps } from "./types";
import ChatListSection from "./ChatListSection";
import SidebarHeader from "./SidebarHeader";
import SidebarNavList from "./SidebarNavList";
import { sidebarStyle } from "./SidebarStyles";

export default function AppSidebar({
  chats,
  view,
  selectedChatId,
  onSelectChat,
  onSelectView,
  onCreateChat,
  onRenameChat,
  onDeleteChat,
}: AppSidebarProps) {
  return (
    <Paper elevation={0} sx={(theme) => sidebarStyle(theme)}>
      <SidebarHeader />
      <SidebarNavList
        view={view}
        onSelectView={onSelectView}
        onCreateChat={onCreateChat}
      />
      <Divider sx={{ my: 2 }} />
      <ChatListSection
        chats={chats}
        view={view}
        selectedChatId={selectedChatId}
        onSelectChat={onSelectChat}
        onSelectView={onSelectView}
        onRenameChat={onRenameChat}
        onDeleteChat={onDeleteChat}
      />
    </Paper>
  );
}
