import type { AgentTask, ChatMessage, ChatSession, UserSettings } from "../types";

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
