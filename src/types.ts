export type NavView = "chat" | "tasks" | "settings";

export type MessageRole = "user" | "assistant";

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export type TaskStatus = "Running" | "Pending" | "Completed" | "Archived";

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  progress: number;
  logs: string[];
  updatedAt: number;
  subtitle?: string;
}

export interface UserSettings {
  id: "user-settings";
  displayName: string;
  email: string;
  role: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  desktopNotifications: boolean;
  developerLogging: boolean;
  dataTelemetry: boolean;
}

export interface AgentEvent {
  kind: "log" | "progress";
  message?: string;
  progress?: number;
}

export type TaskLifecycleStatus = "draft" | "active" | "paused" | "terminated";
export type TaskScheduleType = "manual" | "once" | "cron";
export type TaskRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";
export type TaskTriggerType = "manual" | "schedule" | "retry";

export interface TaskSchedule {
  type: TaskScheduleType;
  runAt?: number;
  cronExpr?: string;
  timezone: string;
  nextRunAt?: number;
  lastRunAt?: number;
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  taskType: "file_ops" | "office_doc" | "social_publish" | "custom";
  payload: Record<string, unknown>;
  lifecycleStatus: TaskLifecycleStatus;
  schedule: TaskSchedule;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  triggerType: TaskTriggerType;
  status: TaskRunStatus;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  progress: number;
  workerId?: string;
  cancelRequested: boolean;
  result: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRunLog {
  id: number;
  runId: string;
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  phase: string;
  message: string;
  meta: Record<string, unknown>;
}

export interface TaskRunCancelResult {
  accepted: boolean;
  run: TaskRun | null;
  requiresSignal: boolean;
  reason: string;
}

export interface TaskCreatePayload {
  id?: string;
  title: string;
  description?: string;
  taskType?: "file_ops" | "office_doc" | "social_publish" | "custom";
  payload?: Record<string, unknown>;
  lifecycleStatus?: TaskLifecycleStatus;
  schedule?: {
    type?: TaskScheduleType;
    runAt?: number;
    cronExpr?: string;
    timezone?: string;
  };
}
