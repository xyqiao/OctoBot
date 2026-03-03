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

interface DesktopUserSettings {
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

declare global {
  interface Window {
    desktopApi?: {
      notify: (title: string, body: string) => Promise<boolean>;
      runAgentChat: (payload: AgentRuntimePayload) => Promise<AgentRuntimeResult>;
      runTaskWorkflow: (payload: AgentRuntimePayload) => Promise<AgentRuntimeResult>;
      bootstrapData: () => Promise<boolean>;
      listChats: () => Promise<DesktopChatSession[]>;
      getChatMessages: (chatId: string) => Promise<DesktopChatMessage[]>;
      appendMessage: (message: DesktopChatMessage) => Promise<boolean>;
      listTasks: () => Promise<DesktopAgentTask[]>;
      upsertTask: (task: DesktopAgentTask) => Promise<boolean>;
      getSettings: () => Promise<DesktopUserSettings>;
      saveSettings: (settings: DesktopUserSettings) => Promise<boolean>;
    };
  }
}

export {};
