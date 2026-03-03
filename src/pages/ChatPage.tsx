import { useEffect, useState } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import AssistantChatPanel from "../components/AssistantChatPanel";
import { getChatMessages, getSettings } from "../utils/db";
import type { ChatMessage, ChatSession, UserSettings } from "../types";

type ChatPageProps = {
  activeChat: ChatSession | null;
  selectedChatId: string;
  onChatsChanged: () => Promise<void>;
};

export default function ChatPage({ activeChat, selectedChatId, onChatsChanged }: ChatPageProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesReady, setMessagesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const nextSettings = await getSettings();
      if (!cancelled) {
        setSettings(nextSettings);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      setMessages([]);
      setMessagesReady(false);

      if (!selectedChatId) {
        setMessagesReady(true);
        return;
      }

      try {
        const nextMessages = await getChatMessages(selectedChatId);
        if (!cancelled) {
          setMessages(nextMessages);
        }
      } finally {
        if (!cancelled) {
          setMessagesReady(true);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [selectedChatId]);

  return (
    <Stack sx={{ height: "100%" }}>
      <Box sx={{ backgroundColor: "#f8fbff", textAlign: "center", py: 1, borderBottom: "1px solid #d8e1ef" }}>
        <Typography variant="h4" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
          {activeChat?.title}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "#667a99", mt: 0.5 }}>内容由AI生成</Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, backgroundColor: "#eef2f8" }}>
        {!settings ? (
          <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
            <CircularProgress size={28} />
          </Box>
        ) : selectedChatId ? (
          messagesReady ? (
            <Box
              className="nexus-chat-shell"
              sx={{
                height: "100%",
                backgroundColor: "#f5f8ff",
              }}
            >
              <AssistantChatPanel
                key={`${selectedChatId}:ready`}
                chatId={selectedChatId}
                messages={messages}
                settings={settings}
                onMessagePersisted={(message) => {
                  setMessages((prev) => {
                    if (prev.some((item) => item.id === message.id)) {
                      return prev;
                    }
                    return [...prev, message];
                  });
                  void onChatsChanged();
                }}
              />
            </Box>
          ) : (
            <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
              <CircularProgress size={28} />
            </Box>
          )
        ) : (
          <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
            <Typography color="text.secondary">No chat selected.</Typography>
          </Box>
        )}
      </Box>
    </Stack>
  );
}
