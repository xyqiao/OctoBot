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
