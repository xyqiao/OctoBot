import type {
  AgentTask,
  ChatMessage,
  ChatSession,
  TaskCreatePayload,
  TaskDefinition,
  TaskRun,
  TaskRunCancelResult,
  TaskRunLog,
  TaskLifecycleStatus,
  TaskTriggerType,
  UserSettings,
} from "../types";

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function ensureDesktopApi() {
  if (!window.desktopApi) {
    throw new Error("Desktop IPC API is unavailable. Please run inside Electron.");
  }
  return window.desktopApi;
}

export async function bootstrapData() {
  return ensureDesktopApi().bootstrapData();
}

export async function listChats() {
  return ensureDesktopApi().listChats() as Promise<ChatSession[]>;
}

export async function createChat() {
  return ensureDesktopApi().createChat() as Promise<ChatSession>;
}

export async function renameChat(chatId: string, title: string) {
  return ensureDesktopApi().renameChat(chatId, title);
}

export async function deleteChat(chatId: string) {
  return ensureDesktopApi().deleteChat(chatId);
}

export async function getChatMessages(chatId: string) {
  return ensureDesktopApi().getChatMessages(chatId) as Promise<ChatMessage[]>;
}

export async function appendMessage(message: ChatMessage) {
  return ensureDesktopApi().appendMessage(message);
}

export async function listTasks() {
  return ensureDesktopApi().listTasks() as Promise<AgentTask[]>;
}

export async function upsertTask(task: AgentTask) {
  return ensureDesktopApi().upsertTask(task);
}

export async function createTaskDefinition(payload: TaskCreatePayload) {
  return ensureDesktopApi().createTaskDefinition(payload) as Promise<TaskDefinition | null>;
}

export async function listTaskDefinitions() {
  return ensureDesktopApi().listTaskDefinitions() as Promise<TaskDefinition[]>;
}

export async function updateTaskStatus(
  taskId: string,
  lifecycleStatus: TaskLifecycleStatus,
  options?: { cancelActiveRuns?: boolean },
) {
  return ensureDesktopApi().updateTaskStatus(
    taskId,
    lifecycleStatus,
    options,
  ) as Promise<TaskDefinition | null>;
}

export async function runTaskNow(
  taskId: string,
  options?: { triggerType?: TaskTriggerType; priority?: number },
) {
  return ensureDesktopApi().runTaskNow(taskId, options) as Promise<TaskRun | null>;
}

export async function listTaskRuns(taskId: string, limit?: number) {
  return ensureDesktopApi().listTaskRuns(taskId, limit) as Promise<TaskRun[]>;
}

export async function cancelTaskRun(runId: string, reason?: string) {
  return ensureDesktopApi().cancelTaskRun(
    runId,
    reason,
  ) as Promise<TaskRunCancelResult>;
}

export async function listTaskRunLogs(runId: string, limit?: number) {
  return ensureDesktopApi().listTaskRunLogs(runId, limit) as Promise<TaskRunLog[]>;
}

export async function getSettings() {
  return ensureDesktopApi().getSettings() as Promise<UserSettings>;
}

export async function saveSettings(settings: UserSettings) {
  return ensureDesktopApi().saveSettings(settings);
}

export function createMessage(chatId: string, role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: makeId("msg"),
    chatId,
    role,
    content,
    timestamp: Date.now(),
  };
}
