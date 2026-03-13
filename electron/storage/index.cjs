/**
 * Storage layer main entry point
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { defaultSettings, ensureSchema } = require("./schema.cjs");
const { createQueries } = require("./queries.cjs");
const { now, makeId } = require("./utils/common.cjs");
const { createChatStorage } = require("./domains/chatStorage.cjs");
const { createTaskStorage } = require("./domains/taskStorage.cjs");
const { createTaskDefinitionStorage } = require("./domains/taskDefinitionStorage.cjs");
const { createTaskRunStorage } = require("./domains/taskRunStorage.cjs");
const { createAgentRunStorage } = require("./domains/agentRunStorage.cjs");
const { createSettingsStorage } = require("./domains/settingsStorage.cjs");

function createStorage(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "nexus-ai.sqlite");
  const db = new Database(dbPath);
  let closed = false;

  ensureSchema(db);
  const queries = createQueries(db);

  // Create domain storage modules
  const chatStorage = createChatStorage(db, queries);
  const taskStorage = createTaskStorage(db, queries);
  const taskDefinitionStorage = createTaskDefinitionStorage(db, queries);
  const taskRunStorage = createTaskRunStorage(db, queries);
  const agentRunStorage = createAgentRunStorage(db, queries);
  const settingsStorage = createSettingsStorage(db, queries);

  function bootstrapData() {
    const chatCount = queries.countChats.get().count;
    const taskCount = queries.countTasks.get().count;
    const settings = queries.getSettings.get("user-settings");

    const seed = db.transaction(() => {
      if (chatCount === 0) {
        const chats = [
          {
            id: "chat_analytics",
            title: "Data Analysis Model",
            updatedAt: now(),
          },
          {
            id: "chat_refactor",
            title: "Code Refactoring",
            updatedAt: now() - 10 * 60_000,
          },
          {
            id: "chat_research",
            title: "Market Research",
            updatedAt: now() - 30 * 60_000,
          },
        ];

        for (const chat of chats) {
          queries.insertChat.run(chat);
        }

        const messages = [
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "user",
            content:
              "Can you help me analyze the Q3 sales data and generate a trend report?",
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
            content:
              "I've attached the CSV file containing the regional breakdown.",
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
            logs: [
              "[INFO] - Completed summarization and exported digest to workspace.",
            ],
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
          themeMode: defaultSettings.themeMode,
          langsmithEnabled: Number(defaultSettings.langsmithEnabled),
          langsmithApiKey: defaultSettings.langsmithApiKey,
          langsmithProject: defaultSettings.langsmithProject,
          langsmithEndpoint: defaultSettings.langsmithEndpoint,
          desktopNotifications: Number(defaultSettings.desktopNotifications),
          developerLogging: Number(defaultSettings.developerLogging),
          dataTelemetry: Number(defaultSettings.dataTelemetry),
        });
      }
    });

    seed();
    return true;
  }

  function updateTaskLifecycleStatus(taskId, lifecycleStatus, options = {}) {
    const { normalizeLifecycleStatus, normalizeNonEmptyText } = require("./utils/validators.cjs");
    const { toTaskDefinition } = require("./utils/transformers.cjs");

    const nextStatus = normalizeLifecycleStatus(lifecycleStatus);
    const existing = queries.getTaskDefinitionById.get(taskId);
    if (!existing) {
      return {
        task: null,
        signaledRunIds: [],
      };
    }

    const normalizedOptions =
      options && typeof options === "object" ? options : {};
    const cancelActiveRuns =
      normalizedOptions.cancelActiveRuns === undefined
        ? nextStatus === "paused" || nextStatus === "terminated"
        : Boolean(normalizedOptions.cancelActiveRuns);
    const timestamp = now();
    const signaledRunIds = [];

    const cancelRunImmediately = (runId, reason, timestamp) => {
      const code = "RUN_CANCELED";
      const message = normalizeNonEmptyText(reason, "Run canceled by operator.");
      const result = queries.updateTaskRunCanceled.run(
        timestamp,
        timestamp,
        code,
        message,
        runId,
      );

      if (result.changes === 0) {
        return false;
      }

      queries.completeTaskQueueByRunId.run(timestamp, runId);
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "warn",
        phase: "cancel",
        message,
        metaJson: JSON.stringify({ code }),
      });
      return true;
    };

    const updateLifecycle = db.transaction(() => {
      queries.updateTaskDefinitionLifecycleStatus.run(
        nextStatus,
        timestamp,
        taskId,
      );
      if (nextStatus === "terminated") {
        queries.updateTaskScheduleNextRunAt.run(null, taskId);
      }

      if (!cancelActiveRuns) {
        return;
      }

      const cancelableRuns = queries.listCancelableTaskRunsByTask.all(taskId);
      for (const run of cancelableRuns) {
        if (run.status === "queued") {
          cancelRunImmediately(
            run.id,
            `Run canceled because task moved to "${nextStatus}".`,
            timestamp,
          );
          continue;
        }

        if (run.status === "running") {
          const updated = queries.updateTaskRunCancelRequested.run(
            timestamp,
            run.id,
          );
          if (updated.changes > 0) {
            queries.insertTaskRunLog.run({
              runId: run.id,
              ts: timestamp,
              level: "warn",
              phase: "cancel",
              message: `Cancellation requested because task moved to "${nextStatus}".`,
              metaJson: JSON.stringify({ taskStatus: nextStatus }),
            });
            signaledRunIds.push(run.id);
          }
        }
      }
    });

    updateLifecycle();
    const task = queries.getTaskDefinitionById.get(taskId);
    return {
      task: task ? toTaskDefinition(task) : null,
      signaledRunIds,
    };
  }

  function close() {
    if (closed) {
      return false;
    }

    db.close();
    closed = true;
    return true;
  }

  return {
    bootstrapData,
    ...chatStorage,
    ...taskStorage,
    ...taskDefinitionStorage,
    ...taskRunStorage,
    ...agentRunStorage,
    ...settingsStorage,
    updateTaskLifecycleStatus,
    close,
    getDbPath: () => dbPath,
  };
}

module.exports = {
  createStorage,
};
