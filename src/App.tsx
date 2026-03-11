import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ChatSession, NavView } from "./types";
import {
  bootstrapData,
  createChat,
  deleteChat,
  listChats,
  renameChat,
} from "./utils/db";
import ChatPage from "./pages/ChatPage";
import SkillsPage from "./pages/SkillsPage";
import TasksPage from "./pages/TasksPage";
import SettingsPage from "./pages/SettingsPage";
import AppSidebar from "./components/AppSidebar";

export default function App() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<NavView>("chat");

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [chatActionPending, setChatActionPending] = useState(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const reloadChats = useCallback(async (preferredSelectedChatId?: string) => {
    const nextChats = await listChats();
    setChats(nextChats);

    setSelectedChatId((currentSelectedChatId) => {
      const preferredId =
        preferredSelectedChatId &&
        nextChats.some((chat) => chat.id === preferredSelectedChatId)
          ? preferredSelectedChatId
          : currentSelectedChatId;

      if (nextChats.length === 0) {
        return "";
      }

      if (!preferredId || !nextChats.some((chat) => chat.id === preferredId)) {
        return nextChats[0].id;
      }

      return preferredId;
    });
  }, []);

  const handleCreateChat = useCallback(async () => {
    const createdChat = await createChat();
    setView("chat");
    await reloadChats(createdChat.id);
  }, [reloadChats]);

  const handleRenameOpen = useCallback((chat: ChatSession) => {
    setRenameTarget(chat);
    setRenameDraft(chat.title);
  }, []);

  const handleRenameClose = useCallback(() => {
    if (chatActionPending) {
      return;
    }
    setRenameTarget(null);
    setRenameDraft("");
  }, [chatActionPending]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget) {
      return;
    }

    const title = renameDraft.trim();
    if (!title) {
      return;
    }

    setChatActionPending(true);
    try {
      await renameChat(renameTarget.id, title);
      await reloadChats(renameTarget.id);
      setRenameTarget(null);
      setRenameDraft("");
    } finally {
      setChatActionPending(false);
    }
  }, [renameDraft, renameTarget, reloadChats]);

  const handleDeleteOpen = useCallback((chat: ChatSession) => {
    setDeleteTarget(chat);
  }, []);

  const handleDeleteClose = useCallback(() => {
    if (chatActionPending) {
      return;
    }
    setDeleteTarget(null);
  }, [chatActionPending]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setChatActionPending(true);
    try {
      const keepSelected =
        selectedChatId !== deleteTarget.id ? selectedChatId : undefined;
      await deleteChat(deleteTarget.id);
      await reloadChats(keepSelected);
      setDeleteTarget(null);
    } finally {
      setChatActionPending(false);
    }
  }, [deleteTarget, reloadChats, selectedChatId]);

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
      <Box
        sx={{
          height: "100vh",
          width: "100%",
          p: 0,
          backgroundColor: theme.appColors.shell,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={28} />
          <Typography>Loading Nexus AI workspace...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100%",
        p: 0,
        backgroundColor: theme.appColors.shell,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          height: "100%",
          p: 0,
          borderRadius: 0,
          overflow: "hidden",
        }}
      >
        <Stack direction="row" sx={{ width: "100%", height: "100%" }}>
          <AppSidebar
            chats={chats}
            view={view}
            selectedChatId={selectedChatId}
            onSelectChat={setSelectedChatId}
            onSelectView={setView}
            onCreateChat={() => {
              void handleCreateChat();
            }}
            onRenameChat={handleRenameOpen}
            onDeleteChat={handleDeleteOpen}
          />

          <Paper
            elevation={0}
            sx={{
              flex: 1,
              borderRadius: 0,
              backgroundColor: theme.appColors.shellElevated,
              minWidth: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {view === "chat" && (
              <ChatPage
                key={selectedChatId || "no-chat"}
                activeChat={activeChat}
                selectedChatId={selectedChatId}
                onChatsChanged={reloadChats}
              />
            )}
            {view === "tasks" && <TasksPage />}
            {view === "skills" && <SkillsPage />}
            {view === "settings" && <SettingsPage />}
          </Paper>
        </Stack>
      </Paper>

      <Dialog
        open={Boolean(renameTarget)}
        onClose={handleRenameClose}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>重命名对话</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            label="对话标题"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleRenameSubmit();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRenameClose} disabled={chatActionPending}>
            取消
          </Button>
          <Button
            onClick={() => void handleRenameSubmit()}
            disabled={chatActionPending || !renameDraft.trim()}
            variant="contained"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={handleDeleteClose}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>确认删除对话？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`此操作不可恢复。确认删除“${deleteTarget?.title ?? ""}”及其全部消息记录吗？`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose} disabled={chatActionPending}>
            取消
          </Button>
          <Button
            onClick={() => void handleDeleteConfirm()}
            color="error"
            disabled={chatActionPending}
            variant="contained"
          >
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
