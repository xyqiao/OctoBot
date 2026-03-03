import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import type { AgentTask, ChatMessage, ChatSession, NavView, UserSettings } from "./types";
import {
  appendMessage,
  bootstrapData,
  createMessage,
  getChatMessages,
  getSettings,
  listChats,
  listTasks,
  saveSettings,
  upsertTask,
} from "./storage/db";
import { runMultiAgentChat, runTaskWorkflow } from "./agent/graphRuntime";

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} mins ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hrs ago`;
  if (diff < day * 2) return "Yesterday";
  return new Date(timestamp).toLocaleDateString();
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function badgeColor(status: AgentTask["status"]) {
  if (status === "Running") return "primary" as const;
  if (status === "Completed") return "success" as const;
  if (status === "Pending") return "default" as const;
  return "warning" as const;
}

function withRuntimeStamp(input: string) {
  const stamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (input.startsWith("[")) {
    return input;
  }

  return `[INFO] - ${stamp} - ${input}`;
}

const baseShellStyle = {
  height: "100vh",
  width: "100%",
  p: 0,
  backgroundColor: "#eef2f8",
};

const sidebarStyle = {
  width: 340,
  borderRadius: 0,
  p: 2.3,
  borderRight: "1px solid #dbe3f0",
  backgroundColor: "#f7f9fd",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
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
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const [selectedChatId, setSelectedChatId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  const [isRunningTask, setIsRunningTask] = useState(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  async function reloadChatsAndTasks() {
    const [nextChats, nextTasks] = await Promise.all([listChats(), listTasks()]);
    setChats(nextChats);
    setTasks(nextTasks);

    if (!selectedChatId && nextChats.length > 0) {
      setSelectedChatId(nextChats[0].id);
    }
    if (!selectedTaskId && nextTasks.length > 0) {
      setSelectedTaskId(nextTasks[0].id);
    }
  }

  useEffect(() => {
    async function init() {
      await bootstrapData();
      const loadedSettings = await getSettings();
      setSettings(loadedSettings);
      await reloadChatsAndTasks();
      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selectedChatId) return;
      const nextMessages = await getChatMessages(selectedChatId);
      setMessages(nextMessages);
    }

    loadMessages();
  }, [selectedChatId]);

  async function sendPrompt() {
    if (!prompt.trim() || !selectedChatId || !settings || isReplying) {
      return;
    }

    const userMessage = createMessage(selectedChatId, "user", prompt.trim());
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setIsReplying(true);
    await appendMessage(userMessage);

    try {
      const runtime = await runMultiAgentChat({
        prompt: userMessage.content,
        apiKey: settings.apiKey,
        modelName: settings.modelName.trim() || "gpt-4o-mini",
        baseUrl: settings.baseUrl,
      });

      const runtimeLogs = runtime.logs.map((line) => withRuntimeStamp(line));
      const extra = runtimeLogs.length > 0 ? `\n\n---\n${runtimeLogs.join("\n")}` : "";
      const answerMessage = createMessage(selectedChatId, "assistant", `${runtime.answer}${extra}`);
      await appendMessage(answerMessage);
      setMessages((prev) => [...prev, answerMessage]);

      if (settings.desktopNotifications) {
        await window.desktopApi?.notify("Nexus AI", "Assistant response is ready.");
      }
    } catch (error) {
      const fallbackMessage = createMessage(
        selectedChatId,
        "assistant",
        `执行失败：${error instanceof Error ? error.message : "Unknown error"}`,
      );
      await appendMessage(fallbackMessage);
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsReplying(false);
      await reloadChatsAndTasks();
    }
  }

  async function restartTask(task: AgentTask) {
    if (!settings || isRunningTask) {
      return;
    }

    setIsRunningTask(true);

    const initialTask: AgentTask = {
      ...task,
      status: "Running",
      progress: 5,
      updatedAt: Date.now(),
      logs: [withRuntimeStamp("Task restarted by operator.")],
    };

    setTasks((prev) => prev.map((item) => (item.id === task.id ? initialTask : item)));
    await upsertTask(initialTask);

    let interim = initialTask;
    let ticker: ReturnType<typeof setInterval> | null = null;

    try {
      ticker = setInterval(() => {
        interim = {
          ...interim,
          progress: Math.min(interim.progress + 10, 85),
          updatedAt: Date.now(),
        };
        setTasks((prev) => prev.map((item) => (item.id === task.id ? interim : item)));
      }, 450);

      const runtime = await runTaskWorkflow({
        prompt: `${task.title}. Generate actionable execution output for this workflow.`,
        apiKey: settings.apiKey,
        modelName: settings.modelName.trim() || "gpt-4o-mini",
        baseUrl: settings.baseUrl,
      });

      const completed: AgentTask = {
        ...interim,
        status: "Completed",
        progress: 100,
        logs: [...interim.logs, ...runtime.logs.map((line) => withRuntimeStamp(line)), withRuntimeStamp(`Workflow summary ready: ${runtime.answer.slice(0, 160)}...`)],
        updatedAt: Date.now(),
      };

      await upsertTask(completed);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? completed : item)));

      if (settings.desktopNotifications) {
        await window.desktopApi?.notify("Nexus AI", `Task completed: ${task.title}`);
      }
    } catch (error) {
      const failed: AgentTask = {
        ...interim,
        status: "Pending",
        logs: [...interim.logs, withRuntimeStamp(`Workflow error: ${String(error)}`)],
        updatedAt: Date.now(),
      };
      await upsertTask(failed);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? failed : item)));
    } finally {
      if (ticker) {
        clearInterval(ticker);
      }
      setIsRunningTask(false);
    }
  }

  async function archiveTask(task: AgentTask) {
    const archived: AgentTask = {
      ...task,
      status: "Archived",
      updatedAt: Date.now(),
      logs: [...task.logs, withRuntimeStamp("Task archived.")],
    };

    await upsertTask(archived);
    setTasks((prev) => prev.map((item) => (item.id === task.id ? archived : item)));
  }

  async function persistSettings() {
    if (!settings) return;
    try {
      await saveSettings(settings);
      const latest = await getSettings();
      setSettings(latest);

      if (latest.desktopNotifications) {
        await window.desktopApi?.notify("Nexus AI", "Configurations saved.");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      await window.desktopApi?.notify("Nexus AI", "Failed to save configurations.");
    }
  }

  async function restoreSettings() {
    const next = await getSettings();
    setSettings(next);
  }

  if (loading || !settings) {
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
          <Paper elevation={0} sx={sidebarStyle}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3.2, px: 0.6 }}>
              <Avatar sx={{ bgcolor: "#1573e6", width: 48, height: 48 }}>
                <SmartToyRoundedIcon />
              </Avatar>
              <Typography variant="h5" sx={{ fontSize: 31, fontWeight: 700 }}>
                Nexus AI
              </Typography>
            </Stack>

            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              sx={{ py: 1.4, borderRadius: 1.6, textTransform: "none", fontSize: 29 / 2.2, mb: 3, fontWeight: 700 }}
            >
              新建对话
            </Button>

            <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>对话记录</Typography>
            <List sx={{ py: 0 }}>
              {chats.map((chat) => (
                <ListItemButton
                  key={chat.id}
                  selected={view === "chat" && selectedChatId === chat.id}
                  onClick={() => {
                    setView("chat");
                    setSelectedChatId(chat.id);
                  }}
                  sx={{
                    borderRadius: 1.6,
                    mb: 0.5,
                    py: 1.05,
                    borderRight: view === "chat" && selectedChatId === chat.id ? "4px solid #1674e6" : "4px solid transparent",
                    backgroundColor: view === "chat" && selectedChatId === chat.id ? "#edf2fb" : "transparent",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38 }}>
                    <ChatBubbleOutlineRoundedIcon color={view === "chat" && selectedChatId === chat.id ? "primary" : "action"} />
                  </ListItemIcon>
                  <ListItemText
                    primary={chat.title}
                    primaryTypographyProps={{
                      fontSize: 30 / 2.3,
                      fontWeight: view === "chat" && selectedChatId === chat.id ? 700 : 500,
                      color: view === "chat" && selectedChatId === chat.id ? "#1573e6" : "inherit",
                    }}
                  />
                </ListItemButton>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />

            <Typography sx={{ fontWeight: 700, color: "#6b7b97", fontSize: 15, mb: 1.1 }}>工作空间</Typography>
            <List sx={{ py: 0, flex: 1 }}>
              <ListItemButton
                selected={view === "tasks"}
                onClick={() => setView("tasks")}
                sx={{
                  borderRadius: 1.6,
                  mb: 0.5,
                  py: 1.05,
                  borderRight: view === "tasks" ? "4px solid #1674e6" : "4px solid transparent",
                  backgroundColor: view === "tasks" ? "#edf2fb" : "transparent",
                }}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>
                  <ChecklistRoundedIcon color={view === "tasks" ? "primary" : "action"} />
                </ListItemIcon>
                <ListItemText
                  primary="任务列表"
                />
              </ListItemButton>
              <ListItemButton sx={{ borderRadius: 2, py: 1.05 }}>
                <ListItemIcon sx={{ minWidth: 38 }}>
                  <ExtensionOutlinedIcon color="disabled" />
                </ListItemIcon>
                <ListItemText primary="技能" />
              </ListItemButton>
            </List>

            <List sx={{ py: 0, mt: "auto" }}>
              <ListItemButton
                selected={view === "settings"}
                onClick={() => setView("settings")}
                sx={{
                  borderRadius: 1.8,
                  py: 1.2,
                  border: view === "settings" ? "1px solid #9dc4fb" : "1px solid transparent",
                  backgroundColor: view === "settings" ? "#edf4ff" : "transparent",
                }}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>
                  <SettingsOutlinedIcon color={view === "settings" ? "primary" : "action"} />
                </ListItemIcon>
                <ListItemText
                  primary="个人设置"
                  primaryTypographyProps={{
                    fontSize: 30 / 2.3,
                    fontWeight: view === "settings" ? 700 : 500,
                    color: view === "settings" ? "#1573e6" : "inherit",
                  }}
                />
              </ListItemButton>
            </List>
          </Paper>

          <Paper elevation={0} sx={workspaceStyle}>
            {view === "chat" && (
              <Stack sx={{ height: "100%" }}>
                <Box sx={{ px: 3.2, py: 2.6, borderBottom: "1px solid #d8e1ef", backgroundColor: "#f8fbff" }}>
                  <Typography variant="h4" sx={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>
                    {activeChat?.title ?? "Data Analysis Model"}
                  </Typography>
                  <Typography sx={{ mt: 0.5, color: "#667a99", fontSize: 28 / 2.3 }}>
                    Running model: {settings.modelName || "gpt-4o-mini"} {settings.baseUrl ? `(${settings.baseUrl})` : ""}
                  </Typography>
                </Box>

                <Box sx={{ flex: 1, p: 3.4, overflowY: "auto", backgroundColor: "#eef2f8" }}>
                  <Stack spacing={3}>
                    {messages.map((message) => {
                      const isUser = message.role === "user";

                      return (
                        <Box key={message.id} sx={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: isUser ? "62%" : "74%" }}>
                          <Stack direction={isUser ? "row-reverse" : "row"} spacing={1.6} alignItems="flex-start">
                            <Avatar sx={{ bgcolor: isUser ? "#21a5f1" : "#2e86f3", width: 44, height: 44 }}>
                              {isUser ? <PersonOutlineRoundedIcon /> : <SmartToyRoundedIcon />}
                            </Avatar>
                            <Paper
                              elevation={0}
                              sx={{
                                px: 2.5,
                                py: 1.55,
                                borderRadius: 2.2,
                                border: `1px solid ${isUser ? "#1978e8" : "#dce6f4"}`,
                                backgroundColor: isUser ? "#1875e7" : "#f8fbff",
                              }}
                            >
                              <Typography sx={{ whiteSpace: "pre-line", color: isUser ? "#fff" : "#1d2740", fontSize: 29 / 2.3, lineHeight: 1.45 }}>
                                {message.content}
                              </Typography>
                            </Paper>
                          </Stack>
                          <Typography
                            sx={{
                              mt: 0.45,
                              ml: isUser ? 0 : 6.8,
                              mr: isUser ? 6.8 : 0,
                              textAlign: isUser ? "right" : "left",
                              color: "#7184a2",
                              fontSize: 14,
                            }}
                          >
                            {formatClock(message.timestamp)}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>

                <Box sx={{ px: 3, pb: 1.9, pt: 1.5, borderTop: "1px solid #d8e1ef", backgroundColor: "#f5f8ff" }}>
                  <Paper
                    elevation={0}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1.2,
                      py: 1,
                      minHeight: 82,
                      border: "2px solid #3489f4",
                      borderRadius: 2.6,
                      backgroundColor: "#fbfdff",
                    }}
                  >
                    <IconButton color="primary">
                      <AttachFileRoundedIcon />
                    </IconButton>
                    <IconButton color="primary">
                      <ImageOutlinedIcon />
                    </IconButton>
                    <TextField
                      fullWidth
                      variant="standard"
                      placeholder="Type your instruction or prompt here..."
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 30 / 2.3, py: 0.5 } }}
                    />
                    <IconButton
                      color="primary"
                      onClick={() => void sendPrompt()}
                      disabled={isReplying}
                      sx={{ backgroundColor: "#e6f0ff", "&:hover": { backgroundColor: "#d7e8ff" } }}
                    >
                      {isReplying ? <CircularProgress size={20} /> : <SendRoundedIcon />}
                    </IconButton>
                  </Paper>
                  <Typography sx={{ textAlign: "center", color: "#7b8ca8", fontSize: 14, mt: 1.2 }}>
                    AI models can make mistakes. Consider verifying sensitive information.
                  </Typography>
                </Box>
              </Stack>
            )}

            {view === "tasks" && (
              <Stack direction="row" sx={{ height: "100%" }}>
                <Paper
                  elevation={0}
                  sx={{
                    width: 420,
                    borderRight: "1px solid #d8e1ef",
                    borderRadius: 0,
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#f7faff",
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2.8, borderBottom: "1px solid #d8e1ef" }}>
                    <Typography variant="h5" sx={{ fontSize: 36, fontWeight: 700 }}>
                      Task Management
                    </Typography>
                    <IconButton color="primary" sx={{ border: "1px solid #c3d8f7", borderRadius: 1.6 }}>
                      <AddRoundedIcon />
                    </IconButton>
                  </Stack>

                  <Box sx={{ p: 2.2, overflowY: "auto" }}>
                    <Stack spacing={1.5}>
                      {tasks.map((task) => (
                        <Card
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          sx={{
                            cursor: "pointer",
                            borderRadius: 2.2,
                            border: selectedTaskId === task.id ? "2px solid #1978ea" : "1px solid #d7e1f1",
                            backgroundColor: selectedTaskId === task.id ? "#f2f8ff" : "#fbfdff",
                            boxShadow: selectedTaskId === task.id ? "0 2px 12px rgba(42, 122, 238, 0.08)" : "none",
                          }}
                        >
                          <CardContent sx={{ p: 2.2, "&:last-child": { pb: 2.2 } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="start" spacing={1}>
                              <Typography sx={{ fontSize: 31 / 2.3, fontWeight: 700 }}>{task.title}</Typography>
                              <IconButton size="small">
                                <MoreVertRoundedIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.2 }}>
                              <Chip label={task.status} color={badgeColor(task.status)} size="small" variant={task.status === "Pending" ? "outlined" : "filled"} />
                              <Typography sx={{ color: "#6e7f9b", fontSize: 15 }}>{formatRelative(task.updatedAt)}</Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </Box>
                </Paper>

                <Box sx={{ flex: 1, p: 3.2, overflowY: "auto" }}>
                  {activeTask ? (
                    <Stack spacing={3}>
                      <Box>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="h4" sx={{ fontSize: 53 / 2.3, fontWeight: 700 }}>
                            {activeTask.title}
                          </Typography>
                          <Chip label={activeTask.status.toUpperCase()} color={badgeColor(activeTask.status)} />
                        </Stack>
                        <Typography sx={{ mt: 0.8, color: "#6e809e", fontSize: 34 / 2.5 }}>
                          {activeTask.subtitle ?? "Job ID: #TSK-0000 • Deployed on Local Client Runtime"}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1.6}>
                        <Button
                          variant="contained"
                          startIcon={<RefreshRoundedIcon />}
                          onClick={() => void restartTask(activeTask)}
                          disabled={isRunningTask}
                          sx={{ textTransform: "none", borderRadius: 1.6, px: 2.2, py: 1.2, fontSize: 30 / 2.3, fontWeight: 700 }}
                        >
                          Restart Task
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<ArchiveOutlinedIcon />}
                          onClick={() => void archiveTask(activeTask)}
                          sx={{ textTransform: "none", borderRadius: 1.6, px: 2.2, py: 1.2, fontSize: 30 / 2.3, fontWeight: 700 }}
                        >
                          Archive
                        </Button>
                      </Stack>

                      <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 36 / 2.4 }}>Execution Progress</Typography>
                          <Typography sx={{ fontWeight: 700, fontSize: 32 / 2.4 }}>{activeTask.progress}%</Typography>
                        </Stack>
                        <Typography sx={{ color: "#6a7c99", mb: 1, fontSize: 32 / 2.4 }}>
                          {activeTask.status === "Completed" ? "Execution completed." : "Fetching initial metadata..."}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={activeTask.progress}
                          sx={{
                            height: 9,
                            borderRadius: 999,
                            backgroundColor: "#b9d4f8",
                            "& .MuiLinearProgress-bar": {
                              borderRadius: 999,
                            },
                          }}
                        />
                      </Box>

                      <Divider />

                      <Stack direction="row" spacing={1} alignItems="center">
                        <TaskAltRoundedIcon />
                        <Typography sx={{ fontWeight: 700, fontSize: 39 / 2.4 }}>Console Logs</Typography>
                      </Stack>

                      <Paper
                        elevation={0}
                        sx={{
                          borderRadius: 2.3,
                          border: "1px solid #0e1d3f",
                          backgroundColor: "#051537",
                          color: "#29c3ff",
                          px: 2.8,
                          py: 2.5,
                          minHeight: 420,
                          fontFamily: "Consolas, Menlo, monospace",
                          fontSize: 15,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.55,
                        }}
                      >
                        {activeTask.logs.length === 0 ? "[INFO] Awaiting runtime logs..." : activeTask.logs.join("\n")}
                      </Paper>
                    </Stack>
                  ) : (
                    <Typography>No task selected.</Typography>
                  )}
                </Box>
              </Stack>
            )}

            {view === "settings" && (
              <Box sx={{ p: 3.4, overflowY: "auto", height: "100%" }}>
                <Stack spacing={2.6} sx={{ maxWidth: 1120, mx: "auto" }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontSize: 74 / 2.3, fontWeight: 700 }}>
                      个人设置
                    </Typography>
                  </Box>

                  <Paper elevation={0} sx={{ p: 3, border: "1px solid #dbe4f2", backgroundColor: "#f9fcff" }}>
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2.2 }}>
                      <PersonOutlineRoundedIcon color="primary" />
                      <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
                        账户信息
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={2.2}>
                      <Avatar sx={{ width: 90, height: 90, bgcolor: "#3f92f7", fontSize: 42 }}>{settings.displayName.slice(0, 2).toUpperCase()}</Avatar>
                      <Stack spacing={1.8} sx={{ flex: 1 }}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.8}>
                          <TextField
                            label="Display Name"
                            value={settings.displayName}
                            fullWidth
                            onChange={(event) => setSettings({ ...settings, displayName: event.target.value })}
                          />
                          <TextField
                            label="Email Address"
                            value={settings.email}
                            fullWidth
                            onChange={(event) => setSettings({ ...settings, email: event.target.value })}
                          />
                        </Stack>
                        <TextField
                          label="Role/Designation"
                          value={settings.role}
                          fullWidth
                          onChange={(event) => setSettings({ ...settings, role: event.target.value })}
                        />
                      </Stack>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ p: 3, border: "1px solid #dbe4f2", backgroundColor: "#f9fcff" }}>
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.8 }}>
                      <KeyRoundedIcon color="primary" />
                      <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
                        模型配置
                      </Typography>
                    </Stack>

                    <Stack spacing={1.8}>
                      <TextField
                        label="Model Name"
                        value={settings.modelName}
                        onChange={(event) => setSettings({ ...settings, modelName: event.target.value })}
                        helperText="例如：gpt-4o-mini / gpt-4.1-mini"
                        fullWidth
                      />

                      <TextField
                        label="Base URL"
                        value={settings.baseUrl}
                        onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                        placeholder="https://api.openai.com/v1"
                        helperText="可选，兼容 OpenAI API 的网关地址。留空使用默认地址。"
                        fullWidth
                      />

                      <TextField
                        label="API Key"
                        type="password"
                        value={settings.apiKey}
                        onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                        helperText="用于 LangChain + LangGraph 推理。"
                        fullWidth
                      />
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ p: 3, border: "1px solid #dbe4f2", backgroundColor: "#f9fcff" }}>
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.8 }}>
                      <ShieldOutlinedIcon color="primary" />
                      <Typography variant="h5" sx={{ fontSize: 42 / 2.4, fontWeight: 700 }}>
                        系统偏好设置
                      </Typography>
                    </Stack>

                    <Stack>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.desktopNotifications}
                            onChange={(_event, checked) => setSettings({ ...settings, desktopNotifications: checked })}
                          />
                        }
                        label="Enable Desktop Notifications"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.developerLogging}
                            onChange={(_event, checked) => setSettings({ ...settings, developerLogging: checked })}
                          />
                        }
                        label="Developer Logging Mode"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.dataTelemetry}
                            onChange={(_event, checked) => setSettings({ ...settings, dataTelemetry: checked })}
                          />
                        }
                        label="Data Telemetry (Help improve model accuracy)"
                      />
                    </Stack>
                  </Paper>

                  <Stack direction="row" justifyContent="center" spacing={1.6}>
                    <Button
                      variant="outlined"
                      onClick={() => void restoreSettings()}
                      sx={{ textTransform: "none", px: 3.4, py: 1.3, borderRadius: 1.5, fontWeight: 700 }}
                    >
                      还原
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => void persistSettings()}
                      sx={{ textTransform: "none", px: 3.4, py: 1.3, borderRadius: 1.5, fontWeight: 700 }}
                    >
                      保存
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            )}
          </Paper>
        </Stack>
      </Paper>
    </Box>
  );
}
