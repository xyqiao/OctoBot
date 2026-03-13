/**
 * Task Definition storage operations
 */

const { now, makeId } = require("../utils/common.cjs");
const {
  normalizeNonEmptyText,
  normalizeTaskType,
  normalizeLifecycleStatus,
  normalizeJson,
} = require("../utils/validators.cjs");
const { normalizeTaskSchedule } = require("../utils/cronUtils.cjs");
const { toTaskDefinition } = require("../utils/transformers.cjs");

function createTaskDefinitionStorage(db, queries) {
  function createTaskDefinition(input = {}) {
    const normalizedInput = input && typeof input === "object" ? input : {};
    const timestamp = now();
    const taskId = normalizeNonEmptyText(normalizedInput.id, makeId("taskdef"));
    const schedule = normalizeTaskSchedule(normalizedInput.schedule, timestamp);

    const payload = {
      id: taskId,
      title: normalizeNonEmptyText(normalizedInput.title, "未命名任务"),
      description: normalizeNonEmptyText(normalizedInput.description, ""),
      taskType: normalizeTaskType(normalizedInput.taskType),
      payloadJson: normalizeJson(normalizedInput.payload, {}),
      lifecycleStatus: normalizeLifecycleStatus(
        normalizedInput.lifecycleStatus,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const insertTask = db.transaction(() => {
      queries.insertTaskDefinition.run(payload);
      queries.upsertTaskSchedule.run({
        taskId,
        scheduleType: schedule.type,
        runAt: schedule.runAt,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
      });
    });

    insertTask();

    const created = queries.getTaskDefinitionById.get(taskId);
    return created ? toTaskDefinition(created) : null;
  }

  function listTaskDefinitions() {
    return queries.listTaskDefinitions.all().map(toTaskDefinition);
  }

  function updateTaskDefinitionLifecycleStatus(taskId, lifecycleStatus) {
    const normalized = normalizeLifecycleStatus(lifecycleStatus);
    const timestamp = now();
    const result = queries.updateTaskDefinitionLifecycleStatus.run(
      normalized,
      timestamp,
      taskId,
    );
    return result.changes > 0;
  }

  return {
    createTaskDefinition,
    listTaskDefinitions,
    updateTaskDefinitionLifecycleStatus,
  };
}

module.exports = {
  createTaskDefinitionStorage,
};
