import type {
  AgentTask,
  ChatMemory,
  ChatMessage,
  ChatSession,
  SkillDescriptor,
  SkillInstallPayload,
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

export async function getChatMemory(chatId: string) {
  return ensureDesktopApi().getChatMemory(chatId) as Promise<ChatMemory | null>;
}

export async function refreshChatMemory(payload: {
  chatId: string;
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
}) {
  return ensureDesktopApi().refreshChatMemory(payload) as Promise<ChatMemory | null>;
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

export async function listSkills() {
  return ensureDesktopApi().listSkills() as Promise<SkillDescriptor[]>;
}

export async function listEnabledSkills() {
  return ensureDesktopApi().listEnabledSkills() as Promise<SkillDescriptor[]>;
}

export async function getSkillById(id: string) {
  return ensureDesktopApi().getSkillById(id) as Promise<SkillDescriptor | null>;
}

export async function installSkill(payload: SkillInstallPayload) {
  return ensureDesktopApi().installSkill(payload) as Promise<SkillDescriptor>;
}

export async function uninstallSkill(id: string) {
  return ensureDesktopApi().uninstallSkill(id) as Promise<boolean>;
}

export async function enableSkill(id: string) {
  return ensureDesktopApi().enableSkill(id) as Promise<boolean>;
}

export async function disableSkill(id: string) {
  return ensureDesktopApi().disableSkill(id) as Promise<boolean>;
}

export async function refreshSkillsCatalog() {
  return ensureDesktopApi().refreshSkillsCatalog() as Promise<SkillDescriptor[]>;
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
