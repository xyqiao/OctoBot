import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTheme } from "@mui/material/styles";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import {
  cancelTaskRun,
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
  TaskRunLog,
  TaskRunStatus,
} from "../types";

type ChipColor = "default" | "primary" | "success" | "warning" | "error";

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 2) return "昨天";
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleString("zh-CN");
}

function lifecycleChipColor(status: TaskLifecycleStatus): ChipColor {
  if (status === "active") return "primary";
  if (status === "paused") return "warning";
  if (status === "terminated") return "default";
  return "default";
}

function describeLifecycleStatus(status: TaskLifecycleStatus) {
  if (status === "draft") return "草稿";
  if (status === "active") return "已启用";
  if (status === "paused") return "已暂停";
  if (status === "terminated") return "已终止";
  return "未知";
}

function runChipColor(status: TaskRunStatus): ChipColor {
  if (status === "running") return "primary";
  if (status === "succeeded") return "success";
  if (status === "queued") return "default";
  if (status === "canceled") return "warning";
  if (status === "timeout") return "error";
  return "error";
}

function describeRunStatus(status: TaskRunStatus) {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  if (status === "canceled") return "已取消";
  if (status === "timeout") return "超时";
  return "未知";
}

function describeTriggerType(triggerType: TaskRun["triggerType"]) {
  if (triggerType === "manual") return "手动";
  if (triggerType === "schedule") return "定时";
  if (triggerType === "retry") return "重试";
  return "未知";
}

function describeSchedule(task: TaskDefinition) {
  const schedule = task.schedule;
  if (schedule.type === "manual") {
    return "手动任务";
  }
  if (schedule.type === "once") {
    return `单次执行于 ${formatTimestamp(schedule.runAt)}`;
  }
  return `定时 ${schedule.cronExpr ?? "--"}（${schedule.timezone}）`;
}

function renderLogLine(log: TaskRunLog) {
  const time = new Date(log.ts).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `[${time}] [${log.level.toUpperCase()}] [${log.phase}] ${log.message}`;
}

export default function TasksPage() {
  const theme = useTheme();
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [runLogs, setRunLogs] = useState<TaskRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      if (
        preferredTaskId &&
        loaded.some((item) => item.id === preferredTaskId)
      ) {
        return preferredTaskId;
      }
      if (current && loaded.some((item) => item.id === current)) {
        return current;
      }
      return loaded[0].id;
    });
    return loaded;
  }, []);

  const loadRuns = useCallback(
    async (taskId: string, preferredRunId?: string) => {
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
        if (
          preferredRunId &&
          loadedRuns.some((item) => item.id === preferredRunId)
        ) {
          return preferredRunId;
        }
        if (current && loadedRuns.some((item) => item.id === current)) {
          return current;
        }
        return loadedRuns[0].id;
      });
      return loadedRuns;
    },
    [],
  );

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
        "由任务面板取消。",
      );
      await refreshTaskPanel(selectedTaskId, result.run?.id ?? runningRun.id);
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
            borderRight: `1px solid ${theme.appColors.border}`,
            borderRadius: 0,
            display: "flex",
            flexDirection: "column",
            backgroundColor: theme.appColors.panelAlt,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ p: 2.8, borderBottom: `1px solid ${theme.appColors.border}` }}
          >
            <Typography variant="h5" sx={{ fontSize: 36, fontWeight: 700 }}>
              任务
            </Typography>
            <Box />
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
                        ? `1px solid ${theme.palette.primary.main}`
                        : `1px solid ${theme.appColors.border}`,
                    backgroundColor:
                      selectedTaskId === task.id
                        ? theme.appColors.panelSoft
                        : theme.appColors.panelAlt,
                    boxShadow:
                      selectedTaskId === task.id
                        ? `0 16px 32px ${theme.appColors.overlay}`
                        : `0 8px 18px ${theme.appColors.overlay}`,
                    transform:
                      selectedTaskId === task.id ? "translateY(-1px)" : "none",
                    transition:
                      "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
                    "&:hover": {
                      borderColor:
                        selectedTaskId === task.id
                          ? theme.palette.primary.main
                          : theme.appColors.borderStrong,
                      backgroundColor: theme.appColors.panelSoft,
                      boxShadow: `0 14px 28px ${theme.appColors.overlay}`,
                      transform: "translateY(-1px)",
                    },
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
                    <Typography
                      sx={{
                        color: theme.appColors.textMuted,
                        fontSize: 14,
                        mt: 0.6,
                      }}
                    >
                      {describeSchedule(task)}
                    </Typography>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mt: 1.2 }}
                    >
                      <Chip
                        label={describeLifecycleStatus(task.lifecycleStatus)}
                        color={lifecycleChipColor(task.lifecycleStatus)}
                        size="small"
                        variant={
                          task.lifecycleStatus === "active"
                            ? "filled"
                            : "outlined"
                        }
                      />
                      <Typography
                        sx={{ color: theme.appColors.textMuted, fontSize: 15 }}
                      >
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
              <Box
                sx={{
                  p: 2.2,
                  border: `1px solid ${theme.appColors.border}`,
                  borderRadius: 2.2,
                  backgroundColor: theme.appColors.panelAlt,
                  boxShadow: `0 12px 24px ${theme.appColors.overlay}`,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Typography
                    variant="h4"
                    sx={{
                      fontSize: 53 / 2.3,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {activeTask.title}
                  </Typography>
                  <Chip
                    label={describeLifecycleStatus(activeTask.lifecycleStatus)}
                    color={lifecycleChipColor(activeTask.lifecycleStatus)}
                  />
                  {refreshing && <CircularProgress size={16} />}
                </Stack>
                <Typography
                  sx={{
                    mt: 0.9,
                    color: theme.appColors.textMuted,
                    fontSize: 13.5,
                    letterSpacing: "0.01em",
                  }}
                >
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
                  立即执行
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
                    启用
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<PauseCircleOutlineRoundedIcon />}
                    onClick={() => void handleUpdateLifecycle("paused")}
                    disabled={
                      actionPending ||
                      activeTask.lifecycleStatus === "terminated"
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
                    暂停
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
                  终止
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
                  刷新
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
                    取消运行
                  </Button>
                )}
              </Stack>

              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1.1 }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: 36 / 2.4 }}>
                    执行进度
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 32 / 2.4 }}>
                    {activeRun?.progress ?? 0}%
                  </Typography>
                </Stack>
                <Typography
                  sx={{
                    color: theme.appColors.textMuted,
                    mb: 1,
                    fontSize: 32 / 2.4,
                  }}
                >
                  {activeRun
                    ? `当前运行状态：${describeRunStatus(activeRun.status)}`
                    : "尚未选择运行记录。"}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={activeRun?.progress ?? 0}
                  sx={{
                    height: 9,
                    borderRadius: 999,
                    backgroundColor: theme.appColors.borderStrong,
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
                  运行历史
                </Typography>
              </Stack>

              <Stack spacing={1.2}>
                {runs.length === 0 ? (
                  <Typography color="text.secondary">
                    暂无运行记录，点击 `立即执行` 排队一次。
                  </Typography>
                ) : (
                  runs.map((run) => (
                    <Paper
                      key={run.id}
                      elevation={0}
                      onClick={() => setSelectedRunId(run.id)}
                      sx={{
                        p: 1.5,
                        border:
                          selectedRunId === run.id
                            ? `1px solid ${theme.palette.primary.main}`
                            : `1px solid ${theme.appColors.border}`,
                        borderRadius: 1.6,
                        cursor: "pointer",
                        backgroundColor:
                          selectedRunId === run.id
                            ? theme.appColors.panelSoft
                            : theme.appColors.panel,
                        boxShadow:
                          selectedRunId === run.id
                            ? `0 12px 24px ${theme.appColors.overlay}`
                            : "none",
                        transition:
                          "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
                        "&:hover": {
                          borderColor:
                            selectedRunId === run.id
                              ? theme.palette.primary.main
                              : theme.appColors.borderStrong,
                          backgroundColor: theme.appColors.panelSoft,
                        },
                      }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Typography sx={{ fontWeight: 700 }}>
                          {run.id}
                        </Typography>
                        <Chip
                          size="small"
                          label={describeRunStatus(run.status)}
                          color={runChipColor(run.status)}
                        />
                      </Stack>
                      <Typography
                        sx={{
                          color: theme.appColors.textMuted,
                          fontSize: 13,
                          mt: 0.5,
                        }}
                      >
                        触发方式：{describeTriggerType(run.triggerType)} · 排队时间：{" "}
                        {formatTimestamp(run.queuedAt)}
                      </Typography>
                      <Typography
                        sx={{
                          color: theme.appColors.textMuted,
                          fontSize: 13,
                          mt: 0.2,
                        }}
                      >
                        开始：{formatTimestamp(run.startedAt)} · 结束：{" "}
                        {formatTimestamp(run.endedAt)}
                      </Typography>
                    </Paper>
                  ))
                )}
              </Stack>

              <Divider />

              <Stack direction="row" spacing={1} alignItems="center">
                <TaskAltRoundedIcon />
                <Typography sx={{ fontWeight: 700, fontSize: 39 / 2.4 }}>
                  控制台日志
                </Typography>
              </Stack>

              <Paper
                elevation={0}
                sx={{
                  borderRadius: 2.3,
                  border: `1px solid ${theme.appColors.consoleBorder}`,
                  backgroundColor: theme.appColors.consoleBg,
                  color: theme.appColors.consoleText,
                  px: 2.8,
                  py: 2.5,
                  minHeight: 300,
                  fontFamily: "Consolas, Menlo, monospace",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.72,
                }}
              >
                {selectedRunId
                  ? runLogs.length > 0
                    ? runLogs.map((item) => renderLogLine(item)).join("\n")
                    : "[INFO] 等待运行日志..."
                  : "[INFO] 请选择运行记录查看日志。"}
              </Paper>
            </Stack>
          ) : (
            <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${theme.appColors.border}`,
                  backgroundColor: theme.appColors.panelAlt,
                }}
              >
                <Stack spacing={1.2}>
                  <Typography sx={{ fontWeight: 700 }}>暂无任务</Typography>
                  <Typography sx={{ color: theme.appColors.textMuted }}>
                    请在聊天中使用工具 `task_create_definition` 创建任务。
                  </Typography>
                </Stack>
              </Paper>
          )}
        </Box>
      </Stack>

    </>
  );
}
