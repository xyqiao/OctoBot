/// <reference types="vite/client" />

interface DesktopChatSession {
  id: string;
  title: string;
  updatedAt: number;
}

interface DesktopChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface DesktopAgentTask {
  id: string;
  title: string;
  status: "Running" | "Pending" | "Completed" | "Archived";
  progress: number;
  logs: string[];
  updatedAt: number;
  subtitle?: string;
}

type DesktopTaskLifecycleStatus = "draft" | "active" | "paused" | "terminated";
type DesktopTaskScheduleType = "manual" | "once" | "cron";
type DesktopTaskRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";
type DesktopTaskTriggerType = "manual" | "schedule" | "retry";

interface DesktopTaskSchedule {
  type: DesktopTaskScheduleType;
  runAt?: number;
  cronExpr?: string;
  timezone: string;
  nextRunAt?: number;
  lastRunAt?: number;
}

interface DesktopTaskDefinition {
  id: string;
  title: string;
  description: string;
  taskType: "file_ops" | "office_doc" | "custom";
  payload: Record<string, unknown>;
  lifecycleStatus: DesktopTaskLifecycleStatus;
  schedule: DesktopTaskSchedule;
  createdAt: number;
  updatedAt: number;
}

interface DesktopTaskRun {
  id: string;
  taskId: string;
  triggerType: DesktopTaskTriggerType;
  status: DesktopTaskRunStatus;
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

interface DesktopTaskRunLog {
  id: number;
  runId: string;
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  phase: string;
  message: string;
  meta: Record<string, unknown>;
}

interface DesktopTaskRunCancelResult {
  accepted: boolean;
  run: DesktopTaskRun | null;
  requiresSignal: boolean;
  reason: string;
}

interface DesktopTaskCreatePayload {
  id?: string;
  title: string;
  description?: string;
  taskType?: "file_ops" | "office_doc" | "custom";
  payload?: Record<string, unknown>;
  lifecycleStatus?: DesktopTaskLifecycleStatus;
  schedule?: {
    type?: DesktopTaskScheduleType;
    runAt?: number;
    cronExpr?: string;
    timezone?: string;
  };
}

interface DesktopUserSettings {
  id: "user-settings";
  displayName: string;
  email: string;
  role: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  themeMode: "light" | "dark";
  desktopNotifications: boolean;
  developerLogging: boolean;
  dataTelemetry: boolean;
}

type DesktopSkillSource = "builtin" | "upload";
type DesktopSkillInstallStatus = "installed" | "not_installed";

interface DesktopSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconPath?: string | null;
  source: DesktopSkillSource;
  installStatus: DesktopSkillInstallStatus;
  enabled: boolean;
  installPath?: string | null;
  version?: string | null;
  triggers: string[];
  createdAt: number;
  updatedAt: number;
}

interface DesktopSkillInstallPayload {
  skillId?: string;
  archiveBytes?: ArrayBuffer | Uint8Array | number[];
  fileName?: string;
}

interface AgentRuntimePayload {
  prompt: string;
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
}

interface AgentRuntimeResult {
  answer: string;
  logs: string[];
}

interface AgentRuntimeStreamChunkEvent {
  type: "chunk";
  chunk: string;
}

interface AgentRuntimeStreamLogEvent {
  type: "log";
  log: string;
}

interface AgentRuntimeStreamDoneEvent {
  type: "done";
  answer: string;
  logs: string[];
}

interface AgentRuntimeStreamErrorEvent {
  type: "error";
  error: string;
}

type AgentRuntimeStreamEvent =
  | AgentRuntimeStreamChunkEvent
  | AgentRuntimeStreamLogEvent
  | AgentRuntimeStreamDoneEvent
  | AgentRuntimeStreamErrorEvent;

declare global {
  interface Window {
    desktopApi?: {
      notify: (title: string, body: string) => Promise<boolean>;
      runAgentChat: (
        payload: AgentRuntimePayload,
      ) => Promise<AgentRuntimeResult>;
      runAgentChatStream: (
        payload: AgentRuntimePayload,
        onEvent: (event: AgentRuntimeStreamEvent) => void,
      ) => Promise<string>;
      cancelAgentChatStream: (streamId: string) => Promise<boolean>;
      runTaskWorkflow: (
        payload: AgentRuntimePayload,
      ) => Promise<AgentRuntimeResult>;
      createTaskDefinition: (
        payload: DesktopTaskCreatePayload,
      ) => Promise<DesktopTaskDefinition | null>;
      listTaskDefinitions: () => Promise<DesktopTaskDefinition[]>;
      updateTaskStatus: (
        taskId: string,
        lifecycleStatus: DesktopTaskLifecycleStatus,
        options?: { cancelActiveRuns?: boolean },
      ) => Promise<DesktopTaskDefinition | null>;
      runTaskNow: (
        taskId: string,
        options?: { triggerType?: DesktopTaskTriggerType; priority?: number },
      ) => Promise<DesktopTaskRun | null>;
      listTaskRuns: (
        taskId: string,
        limit?: number,
      ) => Promise<DesktopTaskRun[]>;
      cancelTaskRun: (
        runId: string,
        reason?: string,
      ) => Promise<DesktopTaskRunCancelResult>;
      listTaskRunLogs: (
        runId: string,
        limit?: number,
      ) => Promise<DesktopTaskRunLog[]>;
      bootstrapData: () => Promise<boolean>;
      listChats: () => Promise<DesktopChatSession[]>;
      createChat: () => Promise<DesktopChatSession>;
      renameChat: (chatId: string, title: string) => Promise<boolean>;
      deleteChat: (chatId: string) => Promise<boolean>;
      getChatMessages: (chatId: string) => Promise<DesktopChatMessage[]>;
      appendMessage: (message: DesktopChatMessage) => Promise<boolean>;
      listTasks: () => Promise<DesktopAgentTask[]>;
      upsertTask: (task: DesktopAgentTask) => Promise<boolean>;
      getSettings: () => Promise<DesktopUserSettings>;
      saveSettings: (settings: DesktopUserSettings) => Promise<boolean>;
      listSkills: () => Promise<DesktopSkill[]>;
      listEnabledSkills: () => Promise<DesktopSkill[]>;
      getSkillById: (id: string) => Promise<DesktopSkill | null>;
      installSkill: (payload: DesktopSkillInstallPayload) => Promise<DesktopSkill>;
      uninstallSkill: (id: string) => Promise<boolean>;
      enableSkill: (id: string) => Promise<boolean>;
      disableSkill: (id: string) => Promise<boolean>;
      refreshSkillsCatalog: () => Promise<DesktopSkill[]>;
    };
  }
}

export {};
