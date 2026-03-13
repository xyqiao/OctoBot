/**
 * Database schema definition and initialization
 */

const defaultSettings = {
  id: "user-settings",
  displayName: "John Doe",
  email: "",
  role: "Lead Data Scientist",
  modelName: "gpt-4o-mini",
  baseUrl: "",
  apiKey: "",
  langsmithEnabled: false,
  langsmithApiKey: "",
  langsmithProject: "",
  langsmithEndpoint: "",
  themeMode: "light",
  desktopNotifications: true,
  developerLogging: false,
  dataTelemetry: true,
};

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

    CREATE TABLE IF NOT EXISTS chat_memory (
      chat_id TEXT PRIMARY KEY,
      summary_text TEXT NOT NULL,
      covered_until_timestamp INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS task_definition (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_schedule (
      task_id TEXT PRIMARY KEY,
      schedule_type TEXT NOT NULL,
      run_at INTEGER,
      cron_expr TEXT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      next_run_at INTEGER,
      last_run_at INTEGER,
      FOREIGN KEY (task_id) REFERENCES task_definition(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_run (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      status TEXT NOT NULL,
      queued_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      progress INTEGER NOT NULL DEFAULT 0,
      worker_id TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task_definition(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_run (
      id TEXT PRIMARY KEY,
      task_run_id TEXT NOT NULL,
      trace_id TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (task_run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_step (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_text TEXT,
      output_text TEXT,
      status TEXT NOT NULL,
      ts INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_call (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      elapsed_ms INTEGER,
      ts INTEGER NOT NULL,
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_run_task ON agent_run(task_run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_step_run ON agent_step(agent_run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_tool_call_run ON tool_call(agent_run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_artifact_run ON artifact(agent_run_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_run_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      phase TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      available_at INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      lease_owner TEXT,
      lease_expires_at INTEGER,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_def_status ON task_definition(lifecycle_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_sched_next ON task_schedule(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_task_run_task ON task_run(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_run_status ON task_run(status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_task_log_run ON task_run_log(run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_task_queue_pick ON task_queue(status, available_at, priority);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      model_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      langsmith_enabled INTEGER NOT NULL,
      langsmith_api_key TEXT NOT NULL,
      langsmith_project TEXT NOT NULL,
      langsmith_endpoint TEXT NOT NULL,
      theme_mode TEXT NOT NULL,
      desktop_notifications INTEGER NOT NULL,
      developer_logging INTEGER NOT NULL,
      data_telemetry INTEGER NOT NULL
    );
  `);

  const columns = db
    .prepare("PRAGMA table_info(settings)")
    .all()
    .map((col) => col.name);
  const expectedSettingsColumns = [
    "id",
    "display_name",
    "email",
    "role",
    "model_name",
    "base_url",
    "api_key",
    "langsmith_enabled",
    "langsmith_api_key",
    "langsmith_project",
    "langsmith_endpoint",
    "theme_mode",
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
        langsmith_enabled INTEGER NOT NULL,
        langsmith_api_key TEXT NOT NULL,
        langsmith_project TEXT NOT NULL,
        langsmith_endpoint TEXT NOT NULL,
        theme_mode TEXT NOT NULL,
        desktop_notifications INTEGER NOT NULL,
        developer_logging INTEGER NOT NULL,
        data_telemetry INTEGER NOT NULL
      );
    `);
  }
}

module.exports = {
  defaultSettings,
  ensureSchema,
};
