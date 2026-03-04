import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import {
  cancelTaskRun,
  createTaskDefinition,
  listTaskDefinitions,
  listTaskRunLogs,
  listTaskRuns,
  runTaskNow,
  updateTaskStatus,
} from "../utils/db";
import type {
  TaskDefinition,
  TaskLifecycleStatus,
  TaskRun,
  TaskScheduleType,
  TaskRunLog,
  TaskRunStatus,
} from "../types";

type ChipColor = "default" | "primary" | "success" | "warning" | "error";

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

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleString();
}

function lifecycleChipColor(status: TaskLifecycleStatus): ChipColor {
  if (status === "active") return "primary";
  if (status === "paused") return "warning";
  if (status === "terminated") return "default";
  return "default";
}

function runChipColor(status: TaskRunStatus): ChipColor {
  if (status === "running") return "primary";
  if (status === "succeeded") return "success";
  if (status === "queued") return "default";
  if (status === "canceled") return "warning";
  if (status === "timeout") return "error";
  return "error";
}

function describeSchedule(task: TaskDefinition) {
  const schedule = task.schedule;
  if (schedule.type === "manual") {
    return "Manual task";
  }
  if (schedule.type === "once") {
    return `Run once at ${formatTimestamp(schedule.runAt)}`;
  }
  return `Cron ${schedule.cronExpr ?? "--"} (${schedule.timezone})`;
}

function renderLogLine(log: TaskRunLog) {
  const time = new Date(log.ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `[${time}] [${log.level.toUpperCase()}] [${log.phase}] ${log.message}`;
}

function toDatetimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [runLogs, setRunLogs] = useState<TaskRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createTaskType, setCreateTaskType] = useState<TaskDefinition["taskType"]>("custom");
  const [createScheduleType, setCreateScheduleType] = useState<TaskScheduleType>("manual");
  const [createRunAt, setCreateRunAt] = useState(() =>
    toDatetimeLocalValue(Date.now() + 10 * 60_000),
  );
  const [createCronExpr, setCreateCronExpr] = useState("*/15 * * * *");
  const [createTimezone, setCreateTimezone] = useState("Asia/Shanghai");
  const [createPayloadText, setCreatePayloadText] = useState("{}");
  const [createFormError, setCreateFormError] = useState("");

  const payloadPlaceholder = useMemo(() => {
    if (createTaskType === "file_ops") {
      return '{"toolCalls":[{"name":"file_read_text","args":{"path":"./README.md"}}]}';
    }
    if (createTaskType === "office_doc") {
      return '{"toolCalls":[{"name":"office_read_document","args":{"path":"./report.xlsx","sheetName":"Sheet1"}}]}';
    }
    if (createTaskType === "social_publish") {
      return '{"toolCalls":[{"name":"social_publish_run","args":{"platform":"xiaohongshu","mode":"draft","title":"标题","content":"正文","mediaPaths":["~/Desktop/cover.png"]}}]}';
    }
    return '{"toolCalls":[{"name":"file_list_directory","args":{"path":"./","maxEntries":50}}]}';
  }, [createTaskType]);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const runningRun = useMemo(
    () => runs.find((run) => run.status === "running") ?? null,
    [runs],
  );

  const loadTasks = useCallback(async (preferredTaskId?: string) => {
    const loaded = await listTaskDefinitions();
    setTasks(loaded);
    setSelectedTaskId((current) => {
      if (!loaded.length) {
        return "";
      }
      if (preferredTaskId && loaded.some((item) => item.id === preferredTaskId)) {
        return preferredTaskId;
      }
      if (current && loaded.some((item) => item.id === current)) {
        return current;
      }
      return loaded[0].id;
    });
    return loaded;
  }, []);

  const loadRuns = useCallback(async (taskId: string, preferredRunId?: string) => {
    if (!taskId) {
      setRuns([]);
      setSelectedRunId("");
      return [];
    }

    const loadedRuns = await listTaskRuns(taskId, 120);
    setRuns(loadedRuns);
    setSelectedRunId((current) => {
      if (!loadedRuns.length) {
        return "";
      }
      if (preferredRunId && loadedRuns.some((item) => item.id === preferredRunId)) {
        return preferredRunId;
      }
      if (current && loadedRuns.some((item) => item.id === current)) {
        return current;
      }
      return loadedRuns[0].id;
    });
    return loadedRuns;
  }, []);

  const loadRunLogs = useCallback(async (runId: string) => {
    if (!runId) {
      setRunLogs([]);
      return [];
    }
    const logs = await listTaskRunLogs(runId, 1_000);
    setRunLogs(logs);
    return logs;
  }, []);

  const refreshTaskPanel = useCallback(
    async (taskId = selectedTaskId, runId = selectedRunId) => {
      if (!taskId) {
        return;
      }
      setRefreshing(true);
      try {
        await Promise.all([
          loadTasks(taskId),
          loadRuns(taskId, runId),
          runId ? loadRunLogs(runId) : Promise.resolve([]),
        ]);
      } finally {
        setRefreshing(false);
      }
    },
    [loadRunLogs, loadRuns, loadTasks, selectedRunId, selectedTaskId],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadTasks();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setRuns([]);
      setSelectedRunId("");
      return;
    }
    void loadRuns(selectedTaskId);
  }, [loadRuns, selectedTaskId]);

  useEffect(() => {
    if (!selectedRunId) {
      setRunLogs([]);
      return;
    }
    void loadRunLogs(selectedRunId);
  }, [loadRunLogs, selectedRunId]);

  useEffect(() => {
    if (!selectedTaskId) {
      return undefined;
    }

    const timer = setInterval(() => {
      if (actionPending) {
        return;
      }
      void refreshTaskPanel(selectedTaskId, selectedRunId);
    }, 1_600);

    return () => {
      clearInterval(timer);
    };
  }, [actionPending, refreshTaskPanel, selectedRunId, selectedTaskId]);

  function openCreateDialog() {
    setCreateDialogOpen(true);
    setCreateFormError("");
    setCreateTitle("");
    setCreateDescription("");
    setCreateTaskType("custom");
    setCreateScheduleType("manual");
    setCreateRunAt(toDatetimeLocalValue(Date.now() + 10 * 60_000));
    setCreateCronExpr("*/15 * * * *");
    setCreateTimezone("Asia/Shanghai");
    setCreatePayloadText("{}");
  }

  function closeCreateDialog() {
    if (actionPending) {
      return;
    }
    setCreateDialogOpen(false);
    setCreateFormError("");
  }

  async function handleCreateTaskSubmit() {
    const title = createTitle.trim();
    if (!title) {
      setCreateFormError("任务标题不能为空。");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(createPayloadText || "{}");
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        setCreateFormError("Payload 必须是 JSON 对象。");
        return;
      }
      payload = parsed;
    } catch {
      setCreateFormError("Payload 不是合法的 JSON。");
      return;
    }

    let runAt: number | undefined;
    if (createScheduleType === "once") {
      const parsedRunAt = Date.parse(createRunAt);
      if (!Number.isFinite(parsedRunAt)) {
        setCreateFormError("单次任务的执行时间无效。");
        return;
      }
      runAt = parsedRunAt;
    }

    if (createScheduleType === "cron" && !createCronExpr.trim()) {
      setCreateFormError("Cron 表达式不能为空。");
      return;
    }

    setCreateFormError("");
    setActionPending(true);
    try {
      const created = await createTaskDefinition({
        title,
        description: createDescription.trim(),
        taskType: createTaskType,
        payload,
        lifecycleStatus: "active",
        schedule: {
          type: createScheduleType,
          runAt,
          cronExpr: createScheduleType === "cron" ? createCronExpr.trim() : undefined,
          timezone: createTimezone.trim() || "Asia/Shanghai",
        },
      });

      if (created?.id) {
        await loadTasks(created.id);
        await loadRuns(created.id);
      } else {
        await loadTasks();
      }

      setCreateDialogOpen(false);
    } catch (error) {
      setCreateFormError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setActionPending(false);
    }
  }

  async function handleRunNow() {
    if (!activeTask) {
      return;
    }
    setActionPending(true);
    try {
      const run = await runTaskNow(activeTask.id, {
        triggerType: "manual",
        priority: 20,
      });
      await loadTasks(activeTask.id);
      await loadRuns(activeTask.id, run?.id ?? undefined);
      if (run?.id) {
        await loadRunLogs(run.id);
      }
    } finally {
      setActionPending(false);
    }
  }

  async function handleUpdateLifecycle(status: TaskLifecycleStatus) {
    if (!activeTask) {
      return;
    }
    setActionPending(true);
    try {
      await updateTaskStatus(activeTask.id, status, {
        cancelActiveRuns: status === "paused" || status === "terminated",
      });
      await refreshTaskPanel(activeTask.id, selectedRunId);
    } finally {
      setActionPending(false);
    }
  }

  async function handleCancelRun() {
    if (!runningRun) {
      return;
    }
    setActionPending(true);
    try {
      const result = await cancelTaskRun(
        runningRun.id,
        "Canceled by operator from task panel.",
      );
      await refreshTaskPanel(
        selectedTaskId,
        result.run?.id ?? runningRun.id,
      );
    } finally {
      setActionPending(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <>
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
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ p: 2.8, borderBottom: "1px solid #d8e1ef" }}
        >
          <Typography variant="h5" sx={{ fontSize: 36, fontWeight: 700 }}>
            Task Management
          </Typography>
          <IconButton
            color="primary"
            sx={{ border: "1px solid #c3d8f7", borderRadius: 1.6 }}
            onClick={openCreateDialog}
            disabled={actionPending}
          >
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
                  border:
                    selectedTaskId === task.id
                      ? "2px solid #1978ea"
                      : "1px solid #d7e1f1",
                  backgroundColor:
                    selectedTaskId === task.id ? "#f2f8ff" : "#fbfdff",
                  boxShadow:
                    selectedTaskId === task.id
                      ? "0 2px 12px rgba(42, 122, 238, 0.08)"
                      : "none",
                }}
              >
                <CardContent sx={{ p: 2.2, "&:last-child": { pb: 2.2 } }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="start"
                    spacing={1}
                  >
                    <Typography sx={{ fontSize: 31 / 2.3, fontWeight: 700 }}>
                      {task.title}
                    </Typography>
                    <IconButton size="small">
                      <MoreVertRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Typography sx={{ color: "#6e7f9b", fontSize: 14, mt: 0.6 }}>
                    {describeSchedule(task)}
                  </Typography>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mt: 1.2 }}
                  >
                    <Chip
                      label={task.lifecycleStatus.toUpperCase()}
                      color={lifecycleChipColor(task.lifecycleStatus)}
                      size="small"
                      variant={
                        task.lifecycleStatus === "active"
                          ? "filled"
                          : "outlined"
                      }
                    />
                    <Typography sx={{ color: "#6e7f9b", fontSize: 15 }}>
                      {formatRelative(task.updatedAt)}
                    </Typography>
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
                <Chip
                  label={activeTask.lifecycleStatus.toUpperCase()}
                  color={lifecycleChipColor(activeTask.lifecycleStatus)}
                />
                {refreshing && <CircularProgress size={16} />}
              </Stack>
              <Typography sx={{ mt: 0.8, color: "#6e809e", fontSize: 34 / 2.5 }}>
                {describeSchedule(activeTask)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.6} flexWrap="wrap">
              <Button
                variant="contained"
                startIcon={<RefreshRoundedIcon />}
                onClick={() => void handleRunNow()}
                disabled={
                  actionPending || activeTask.lifecycleStatus === "terminated"
                }
                sx={{
                  textTransform: "none",
                  borderRadius: 1.6,
                  px: 2.2,
                  py: 1.2,
                  fontSize: 30 / 2.3,
                  fontWeight: 700,
                }}
              >
                Run Now
              </Button>
              {activeTask.lifecycleStatus === "paused" ? (
                <Button
                  variant="outlined"
                  startIcon={<PlayCircleOutlineRoundedIcon />}
                  onClick={() => void handleUpdateLifecycle("active")}
                  disabled={actionPending}
                  sx={{
                    textTransform: "none",
                    borderRadius: 1.6,
                    px: 2.2,
                    py: 1.2,
                    fontSize: 30 / 2.3,
                    fontWeight: 700,
                  }}
                >
                  Start
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<PauseCircleOutlineRoundedIcon />}
                  onClick={() => void handleUpdateLifecycle("paused")}
                  disabled={
                    actionPending || activeTask.lifecycleStatus === "terminated"
                  }
                  sx={{
                    textTransform: "none",
                    borderRadius: 1.6,
                    px: 2.2,
                    py: 1.2,
                    fontSize: 30 / 2.3,
                    fontWeight: 700,
                  }}
                >
                  Pause
                </Button>
              )}
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopCircleOutlinedIcon />}
                onClick={() => void handleUpdateLifecycle("terminated")}
                disabled={
                  actionPending || activeTask.lifecycleStatus === "terminated"
                }
                sx={{
                  textTransform: "none",
                  borderRadius: 1.6,
                  px: 2.2,
                  py: 1.2,
                  fontSize: 30 / 2.3,
                  fontWeight: 700,
                }}
              >
                Terminate
              </Button>
              <Button
                variant="text"
                onClick={() => void refreshTaskPanel()}
                disabled={actionPending}
                sx={{
                  textTransform: "none",
                  borderRadius: 1.6,
                  px: 1.6,
                  py: 1.2,
                  fontSize: 30 / 2.3,
                  fontWeight: 700,
                }}
              >
                Refresh
              </Button>
              {runningRun && (
                <Button
                  variant="text"
                  color="warning"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => void handleCancelRun()}
                  disabled={actionPending}
                  sx={{
                    textTransform: "none",
                    borderRadius: 1.6,
                    px: 1.6,
                    py: 1.2,
                    fontSize: 30 / 2.3,
                    fontWeight: 700,
                  }}
                >
                  Cancel Running
                </Button>
              )}
            </Stack>

            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 36 / 2.4 }}>
                  Execution Progress
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 32 / 2.4 }}>
                  {activeRun?.progress ?? 0}%
                </Typography>
              </Stack>
              <Typography sx={{ color: "#6a7c99", mb: 1, fontSize: 32 / 2.4 }}>
                {activeRun
                  ? `Current run status: ${activeRun.status.toUpperCase()}`
                  : "No run selected."}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={activeRun?.progress ?? 0}
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
              <Typography sx={{ fontWeight: 700, fontSize: 39 / 2.4 }}>
                Run History
              </Typography>
            </Stack>

            <Stack spacing={1.2}>
              {runs.length === 0 ? (
                <Typography color="text.secondary">
                  No run history yet. Click `Run Now` to queue one.
                </Typography>
              ) : (
                runs.map((run) => (
                  <Paper
                    key={run.id}
                    elevation={0}
                    onClick={() => setSelectedRunId(run.id)}
                    sx={{
                      p: 1.5,
                      border: selectedRunId === run.id ? "2px solid #1978ea" : "1px solid #d7e1f1",
                      borderRadius: 1.4,
                      cursor: "pointer",
                      backgroundColor: selectedRunId === run.id ? "#f2f8ff" : "#ffffff",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {run.id}
                      </Typography>
                      <Chip
                        size="small"
                        label={run.status.toUpperCase()}
                        color={runChipColor(run.status)}
                      />
                    </Stack>
                    <Typography sx={{ color: "#6a7c99", fontSize: 13, mt: 0.5 }}>
                      Trigger: {run.triggerType} · Queued: {formatTimestamp(run.queuedAt)}
                    </Typography>
                    <Typography sx={{ color: "#6a7c99", fontSize: 13, mt: 0.2 }}>
                      Started: {formatTimestamp(run.startedAt)} · Ended: {formatTimestamp(run.endedAt)}
                    </Typography>
                  </Paper>
                ))
              )}
            </Stack>

            <Divider />

            <Stack direction="row" spacing={1} alignItems="center">
              <TaskAltRoundedIcon />
              <Typography sx={{ fontWeight: 700, fontSize: 39 / 2.4 }}>
                Console Logs
              </Typography>
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
                minHeight: 300,
                fontFamily: "Consolas, Menlo, monospace",
                fontSize: 15,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
              }}
            >
              {selectedRunId
                ? runLogs.length > 0
                  ? runLogs.map((item) => renderLogLine(item)).join("\n")
                  : "[INFO] Awaiting runtime logs..."
                : "[INFO] Select a run to inspect logs."}
            </Paper>
          </Stack>
        ) : (
          <Typography>No task selected.</Typography>
        )}
      </Box>
      </Stack>

      <Dialog
        open={createDialogOpen}
        onClose={closeCreateDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>创建任务</DialogTitle>
        <DialogContent sx={{ pt: 1.2 }}>
          <Stack spacing={1.6} sx={{ mt: 0.2 }}>
            <TextField
              label="任务标题"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="例如：每周汇总销售数据"
              fullWidth
              autoFocus
            />

            <TextField
              label="任务描述"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              placeholder="补充执行目标、约束和输出要求"
              multiline
              minRows={2}
              fullWidth
            />

            <Stack direction="row" spacing={1.2}>
              <TextField
                select
                label="任务类型"
                value={createTaskType}
                onChange={(event) =>
                  setCreateTaskType(event.target.value as TaskDefinition["taskType"])
                }
                fullWidth
              >
                <MenuItem value="custom">custom（自定义）</MenuItem>
                <MenuItem value="file_ops">file_ops（文件读写）</MenuItem>
                <MenuItem value="office_doc">office_doc（办公文档）</MenuItem>
                <MenuItem value="social_publish">social_publish（内容发布）</MenuItem>
              </TextField>
              <TextField
                select
                label="调度类型"
                value={createScheduleType}
                onChange={(event) =>
                  setCreateScheduleType(event.target.value as TaskScheduleType)
                }
                fullWidth
              >
                <MenuItem value="manual">manual（手动触发）</MenuItem>
                <MenuItem value="once">once（单次定时）</MenuItem>
                <MenuItem value="cron">cron（周期任务）</MenuItem>
              </TextField>
            </Stack>

            {createScheduleType === "once" && (
              <TextField
                type="datetime-local"
                label="执行时间"
                value={createRunAt}
                onChange={(event) => setCreateRunAt(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            )}

            {createScheduleType === "cron" && (
              <TextField
                label="Cron 表达式"
                value={createCronExpr}
                onChange={(event) => setCreateCronExpr(event.target.value)}
                placeholder="例如 */15 * * * * 或 30 9 * * *"
                fullWidth
                helperText="当前本地解析器支持：*/N * * * *、M * * * *、M H * * *。"
              />
            )}

            <TextField
              label="时区"
              value={createTimezone}
              onChange={(event) => setCreateTimezone(event.target.value)}
              placeholder="Asia/Shanghai"
              fullWidth
            />

            <TextField
              label="Payload(JSON)"
              value={createPayloadText}
              onChange={(event) => setCreatePayloadText(event.target.value)}
              multiline
              minRows={8}
              fullWidth
              placeholder={payloadPlaceholder}
              helperText="支持 payload.toolCalls 或 payload.operations。可用工具：file_read_text、file_write_text、file_list_directory、office_read_document、office_write_document、browser_playwright_run、social_publish_run。可选 payload.allowedRoots 限制目录。"
              sx={{
                "& textarea": {
                  fontFamily: "Consolas, Menlo, monospace",
                },
              }}
            />

            {createFormError && (
              <Typography sx={{ color: "error.main", fontSize: 13 }}>
                {createFormError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeCreateDialog} disabled={actionPending}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateTaskSubmit()}
            disabled={actionPending}
          >
            创建并激活
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
