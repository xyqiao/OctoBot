import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import type { ChatSession, NavView } from "./types";
import { bootstrapData, listChats } from "./utils/db";
import ChatPage from "./pages/ChatPage";
import TasksPage from "./pages/TasksPage";
import SettingsPage from "./pages/SettingsPage";
import AppSidebar from "./components/AppSidebar";

const baseShellStyle = {
  height: "100vh",
  width: "100%",
  p: 0,
  backgroundColor: "#eef2f8",
};

const workspaceStyle = {
  flex: 1,
  borderRadius: 0,
  backgroundColor: "#f2f5fb",
  minWidth: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<NavView>("chat");

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const reloadChats = useCallback(async () => {
    const nextChats = await listChats();
    setChats(nextChats);

    setSelectedChatId((currentSelectedChatId) => {
      if (nextChats.length === 0) {
        return "";
      }

      if (!currentSelectedChatId || !nextChats.some((chat) => chat.id === currentSelectedChatId)) {
        return nextChats[0].id;
      }

      return currentSelectedChatId;
    });
  }, []);

  useEffect(() => {
    async function init() {
      await bootstrapData();
      await reloadChats();
      setLoading(false);
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadChats]);

  if (loading) {
    return (
      <Box sx={{ ...baseShellStyle, display: "grid", placeItems: "center" }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={28} />
          <Typography>Loading Nexus AI workspace...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={baseShellStyle}>
      <Paper
        elevation={0}
        sx={{ width: "100%", height: "100%", p: 0, borderRadius: 2.5, overflow: "hidden", border: "1px solid #dbe3f0" }}
      >
        <Stack direction="row" sx={{ width: "100%", height: "100%" }}>
          <AppSidebar
            chats={chats}
            view={view}
            selectedChatId={selectedChatId}
            onSelectChat={setSelectedChatId}
            onSelectView={setView}
          />

          <Paper elevation={0} sx={workspaceStyle}>
            {view === "chat" && (
              <ChatPage
                key={selectedChatId || "no-chat"}
                activeChat={activeChat}
                selectedChatId={selectedChatId}
                onChatsChanged={reloadChats}
              />
            )}
            {view === "tasks" && <TasksPage />}
            {view === "settings" && <SettingsPage />}
          </Paper>
        </Stack>
      </Paper>
    </Box>
  );
}
