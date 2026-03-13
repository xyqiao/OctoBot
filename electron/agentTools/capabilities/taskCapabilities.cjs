const { getStorage } = require("../../storage/context.cjs");
const { toSafeString } = require("./common.cjs");

function normalizeTaskSchedule(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const type = toSafeString(source.type, "manual").trim();
  const normalizedType = type === "once" || type === "cron" ? type : "manual";
  const timezone = toSafeString(source.timezone, "Asia/Shanghai").trim() || "Asia/Shanghai";
  const runAt = Number.isFinite(Number(source.runAt)) ? Number(source.runAt) : undefined;
  const cronExpr = toSafeString(source.cronExpr, "").trim() || undefined;

  if (normalizedType === "once" && !Number.isFinite(runAt)) {
    throw new Error("schedule.runAt is required for once schedule.");
  }
  if (normalizedType === "cron" && !cronExpr) {
    throw new Error("schedule.cronExpr is required for cron schedule.");
  }

  return {
    type: normalizedType,
    runAt,
    cronExpr,
    timezone,
  };
}

async function taskCreateDefinition(args = {}) {
  const payload = args && typeof args === "object" ? args : {};
  const title = toSafeString(payload.title, "").trim();
  const inferredText = toSafeString(
    payload.text || payload.query || payload.content || payload.prompt,
    "",
  ).trim();
  const prompt = toSafeString(payload.prompt, "").trim();

  const finalTitle =
    title ||
    (inferredText
      ? inferredText.split(/\n|。|！|!|\?|？/)[0].slice(0, 28).trim()
      : "自动任务");
  const finalPrompt = prompt || inferredText;

  if (!finalPrompt) {
    throw new Error("prompt is required.");
  }

  const description = toSafeString(payload.description, "").trim();
  const schedule = normalizeTaskSchedule(payload.schedule || {});
  const storage = getStorage();
  if (!storage?.createTaskDefinition) {
    throw new Error("Task storage is unavailable.");
  }

  const created = storage.createTaskDefinition({
    title: finalTitle,
    description,
    taskType: "agent_task",
    payload: {
      prompt: finalPrompt,
    },
    lifecycleStatus: "active",
    schedule,
  });

  if (!created?.id) {
    throw new Error("Failed to create task.");
  }

  return {
    id: created.id,
    title: created.title,
    schedule: created.schedule,
  };
}

const capabilities = [
  {
    name: "task_create_definition",
    description: "Create an agent_task definition from a prompt.",
    handler: taskCreateDefinition,
    aliases: ["create_task", "create_agent_task"],
  },
];

module.exports = {
  normalizeTaskSchedule,
  taskCreateDefinition,
  capabilities,
};
