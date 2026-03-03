import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { runTaskWorkflow } from "../utils/graphRuntime";
import { getSettings, listTasks, upsertTask } from "../utils/db";
import type { AgentTask, UserSettings } from "../types";

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

export default function TasksPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunningTask, setIsRunningTask] = useState(false);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [loadedTasks, loadedSettings] = await Promise.all([listTasks(), getSettings()]);
      if (cancelled) return;

      setTasks(loadedTasks);
      setSettings(loadedSettings);
      if (loadedTasks.length > 0) {
        setSelectedTaskId(loadedTasks[0].id);
      }
      setLoading(false);
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

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
        logs: [
          ...interim.logs,
          ...runtime.logs.map((line) => withRuntimeStamp(line)),
          withRuntimeStamp(`Workflow summary ready: ${runtime.answer.slice(0, 160)}...`),
        ],
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

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
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
  );
}
