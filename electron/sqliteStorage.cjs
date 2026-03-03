const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const defaultSettings = {
  id: "user-settings",
  displayName: "John Doe",
  email: "",
  role: "Lead Data Scientist",
  modelName: "gpt-4o-mini",
  baseUrl: "",
  apiKey: "",
  desktopNotifications: true,
  developerLogging: false,
  dataTelemetry: true,
};

function now() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function toChat(row) {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function toMessage(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
  };
}

function toTask(row) {
  let logs = [];
  try {
    logs = JSON.parse(row.logs || "[]");
  } catch {
    logs = [];
  }

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    logs,
    updatedAt: row.updated_at,
    subtitle: row.subtitle ?? undefined,
  };
}

function toSettings(row) {
  if (!row) {
    return defaultSettings;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    modelName: row.model_name || defaultSettings.modelName,
    baseUrl: row.base_url || "",
    apiKey: row.api_key || "",
    desktopNotifications: Boolean(row.desktop_notifications),
    developerLogging: Boolean(row.developer_logging),
    dataTelemetry: Boolean(row.data_telemetry),
  };
}

function summarizeChatTitle(content) {
  const raw = String(content ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "新对话";
  }

  const cleaned = raw.replace(/^[#>*`\-+\d.)\s]+/, "").trim();
  const firstSentence = cleaned.split(/[\n。！？!?；;]+/)[0]?.trim() || cleaned;
  const maxLen = /[^\x00-\x7f]/.test(firstSentence) ? 16 : 36;

  if (firstSentence.length <= maxLen) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, maxLen).trim()}...`;
}

function ensureSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      logs TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      model_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      desktop_notifications INTEGER NOT NULL,
      developer_logging INTEGER NOT NULL,
      data_telemetry INTEGER NOT NULL
    );
  `);

  const columns = db.prepare("PRAGMA table_info(settings)").all().map((col) => col.name);
  const expectedSettingsColumns = [
    "id",
    "display_name",
    "email",
    "role",
    "model_name",
    "base_url",
    "api_key",
    "desktop_notifications",
    "developer_logging",
    "data_telemetry",
  ];

  const hasSchemaMismatch =
    columns.length !== expectedSettingsColumns.length ||
    expectedSettingsColumns.some((column) => !columns.includes(column));

  // Project is pre-release: if schema mismatches, reset settings table to the current shape.
  if (hasSchemaMismatch) {
    db.exec(`
      DROP TABLE IF EXISTS settings;
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        model_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        desktop_notifications INTEGER NOT NULL,
        developer_logging INTEGER NOT NULL,
        data_telemetry INTEGER NOT NULL
      );
    `);
  }
}

function createStorage(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "nexus-ai.sqlite");
  const db = new Database(dbPath);

  ensureSchema(db);

  const queries = {
    countChats: db.prepare("SELECT COUNT(1) AS count FROM chats"),
    countTasks: db.prepare("SELECT COUNT(1) AS count FROM tasks"),
    getSettings: db.prepare("SELECT * FROM settings WHERE id = ?"),
    getChatById: db.prepare("SELECT * FROM chats WHERE id = ?"),
    insertChat: db.prepare("INSERT INTO chats (id, title, updated_at) VALUES (@id, @title, @updatedAt)"),
    insertMessage: db.prepare("INSERT INTO messages (id, chat_id, role, content, timestamp) VALUES (@id, @chatId, @role, @content, @timestamp)"),
    countUserMessagesByChat: db.prepare("SELECT COUNT(1) AS count FROM messages WHERE chat_id = ? AND role = 'user'"),
    listChats: db.prepare("SELECT * FROM chats ORDER BY updated_at DESC"),
    listMessagesByChat: db.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC"),
    updateChatTime: db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?"),
    updateChatTitle: db.prepare("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?"),
    deleteChat: db.prepare("DELETE FROM chats WHERE id = ?"),
    listTasks: db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC"),
    upsertTask: db.prepare(
      `INSERT INTO tasks (id, title, subtitle, status, progress, logs, updated_at)
       VALUES (@id, @title, @subtitle, @status, @progress, @logs, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         subtitle = excluded.subtitle,
         status = excluded.status,
         progress = excluded.progress,
         logs = excluded.logs,
         updated_at = excluded.updated_at`,
    ),
    upsertSettings: db.prepare(
      `INSERT INTO settings (
         id, display_name, email, role, model_name, base_url, api_key,
         desktop_notifications, developer_logging, data_telemetry
       ) VALUES (
         @id, @displayName, @email, @role, @modelName, @baseUrl, @apiKey,
         @desktopNotifications, @developerLogging, @dataTelemetry
       )
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         email = excluded.email,
         role = excluded.role,
         model_name = excluded.model_name,
         base_url = excluded.base_url,
         api_key = excluded.api_key,
         desktop_notifications = excluded.desktop_notifications,
         developer_logging = excluded.developer_logging,
         data_telemetry = excluded.data_telemetry`,
    ),
  };

  function bootstrapData() {
    const chatCount = queries.countChats.get().count;
    const taskCount = queries.countTasks.get().count;
    const settings = queries.getSettings.get("user-settings");

    const seed = db.transaction(() => {
      if (chatCount === 0) {
        const chats = [
          { id: "chat_analytics", title: "Data Analysis Model", updatedAt: now() },
          { id: "chat_refactor", title: "Code Refactoring", updatedAt: now() - 10 * 60_000 },
          { id: "chat_research", title: "Market Research", updatedAt: now() - 30 * 60_000 },
        ];

        for (const chat of chats) {
          queries.insertChat.run(chat);
        }

        const messages = [
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "user",
            content: "Can you help me analyze the Q3 sales data and generate a trend report?",
            timestamp: now() - 4 * 60_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "assistant",
            content:
              "Certainly! Please provide the dataset or connect to your database. I will analyze the metrics and identify key growth areas.",
            timestamp: now() - 4 * 60_000 + 2_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "user",
            content: "I've attached the CSV file containing the regional breakdown.",
            timestamp: now() - 2 * 60_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "assistant",
            content:
              "Processing the CSV file. Extracting column headers...\\n\\nFound 15 columns. Initiating data summarization protocol. This might take a few seconds.",
            timestamp: now() - 90_000,
          },
        ];

        for (const message of messages) {
          queries.insertMessage.run(message);
        }
      }

      if (taskCount === 0) {
        const tasks = [
          {
            id: "task_seo",
            title: "Generate Weekly SEO Report",
            subtitle: "Job ID: #TSK-8400 • Deployed on Cloud Node 03",
            status: "Running",
            progress: 45,
            updatedAt: now() - 120_000,
            logs: [
              "[INFO] - 10:02:11 - Initializing task execution engine.",
              "[INFO] - 10:02:12 - Loading modules: ['seo_analyzer', 'url_fetcher']",
              "[INFO] - 10:02:13 - Fetching target URLs... OK (24 ms)",
              "[DEBUG] - 10:02:14 - Running semantic keyword match. Waiting for response.",
            ],
          },
          {
            id: "task_crm",
            title: "Sync CRM data with Hubspot",
            status: "Pending",
            progress: 0,
            updatedAt: now() - 60 * 60_000,
            logs: [],
          },
          {
            id: "task_summary",
            title: "Summarize meeting transcripts",
            status: "Completed",
            progress: 100,
            updatedAt: now() - 26 * 60 * 60_000,
            logs: ["[INFO] - Completed summarization and exported digest to workspace."],
          },
        ];

        for (const task of tasks) {
          queries.upsertTask.run({
            ...task,
            subtitle: task.subtitle ?? null,
            logs: JSON.stringify(task.logs),
          });
        }
      }

      if (!settings) {
        queries.upsertSettings.run({
          ...defaultSettings,
          desktopNotifications: Number(defaultSettings.desktopNotifications),
          developerLogging: Number(defaultSettings.developerLogging),
          dataTelemetry: Number(defaultSettings.dataTelemetry),
        });
      }
    });

    seed();
    return true;
  }

  function listChats() {
    return queries.listChats.all().map(toChat);
  }

  function createChat() {
    const chat = {
      id: makeId("chat"),
      title: "新对话",
      updatedAt: now(),
    };

    queries.insertChat.run(chat);
    return chat;
  }

  function renameChat(chatId, title) {
    const normalizedTitle = String(title ?? "").trim();
    if (!normalizedTitle) {
      return false;
    }

    const updatedAt = now();
    const result = queries.updateChatTitle.run(normalizedTitle, updatedAt, chatId);
    return result.changes > 0;
  }

  function deleteChat(chatId) {
    const result = queries.deleteChat.run(chatId);
    return result.changes > 0;
  }

  function getChatMessages(chatId) {
    return queries.listMessagesByChat.all(chatId).map(toMessage);
  }

  function appendMessage(message) {
    const txn = db.transaction(() => {
      const chatRow = message.role === "user" ? queries.getChatById.get(message.chatId) : null;
      const shouldRetitle =
        message.role === "user" &&
        chatRow?.title === "新对话" &&
        queries.countUserMessagesByChat.get(message.chatId).count === 0;

      queries.insertMessage.run(message);

      const updatedAt = Date.now();
      queries.updateChatTime.run(updatedAt, message.chatId);

      if (shouldRetitle) {
        const generatedTitle = summarizeChatTitle(message.content);
        queries.updateChatTitle.run(generatedTitle, updatedAt, message.chatId);
      }
    });
    txn();
    return true;
  }

  function listTasks() {
    return queries.listTasks.all().map(toTask);
  }

  function upsertTask(task) {
    queries.upsertTask.run({
      ...task,
      subtitle: task.subtitle ?? null,
      logs: JSON.stringify(task.logs ?? []),
    });
    return true;
  }

  function getSettings() {
    const row = queries.getSettings.get("user-settings");
    return toSettings(row);
  }

  function saveSettings(settings) {
    const normalized = {
      ...defaultSettings,
      ...settings,
      modelName: String(settings.modelName || defaultSettings.modelName),
      baseUrl: String(settings.baseUrl || ""),
      apiKey: String(settings.apiKey || ""),
    };

    queries.upsertSettings.run({
      ...normalized,
      desktopNotifications: Number(normalized.desktopNotifications),
      developerLogging: Number(normalized.developerLogging),
      dataTelemetry: Number(normalized.dataTelemetry),
    });
    return true;
  }

  return {
    bootstrapData,
    listChats,
    createChat,
    renameChat,
    deleteChat,
    getChatMessages,
    appendMessage,
    listTasks,
    upsertTask,
    getSettings,
    saveSettings,
    getDbPath: () => dbPath,
  };
}

module.exports = {
  createStorage,
};
