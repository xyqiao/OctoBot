/**
 * Task UI storage operations
 */

const { toTask } = require("../utils/transformers.cjs");

function createTaskStorage(db, queries) {
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

  return {
    listTasks,
    upsertTask,
  };
}

module.exports = {
  createTaskStorage,
};
