/**
 * Agent Run storage operations
 */

const { now } = require("../utils/common.cjs");
const { toAgentRun, toAgentRunStep, toAgentRunToolCall } = require("../utils/transformers.cjs");

function createAgentRunStorage(db, queries) {
  function createAgentRun(payload) {
    const nowTs = now();
    const row = {
      id: payload.id,
      taskRunId: payload.taskRunId,
      traceId: payload.traceId || null,
      status: payload.status || "running",
      summary: payload.summary || null,
      startedAt: payload.startedAt || nowTs,
      endedAt: payload.endedAt || null,
      createdAt: payload.createdAt || nowTs,
      updatedAt: payload.updatedAt || nowTs,
    };
    queries.insertAgentRun.run(row);
    return row;
  }

  function updateAgentRunStatus(id, status, summary, endedAt) {
    const nowTs = now();
    queries.updateAgentRunStatus.run(
      status,
      summary || null,
      endedAt || nowTs,
      nowTs,
      id,
    );
    return true;
  }

  function appendAgentStep(payload) {
    const row = {
      agentRunId: payload.agentRunId,
      agentName: payload.agentName || "agent",
      stepIndex: Number.isFinite(Number(payload.stepIndex))
        ? Number(payload.stepIndex)
        : 0,
      inputText: payload.inputText || null,
      outputText: payload.outputText || null,
      status: payload.status || "completed",
      ts: payload.ts || now(),
      metaJson: JSON.stringify(payload.meta || {}),
    };
    queries.insertAgentStep.run(row);
    return row;
  }

  function appendToolCall(payload) {
    const row = {
      agentRunId: payload.agentRunId,
      toolName: payload.toolName,
      inputJson: JSON.stringify(payload.input || {}),
      outputJson: JSON.stringify(payload.output || {}),
      status: payload.status || "success",
      elapsedMs: Number.isFinite(Number(payload.elapsedMs))
        ? Number(payload.elapsedMs)
        : null,
      ts: payload.ts || now(),
    };
    queries.insertToolCall.run(row);
    return row;
  }

  function listAgentRunsByTaskRun(taskRunId) {
    return queries.listAgentRunsByTaskRun.all(taskRunId).map(toAgentRun);
  }

  function listAgentStepsByRun(agentRunId) {
    return queries.listAgentStepsByRun.all(agentRunId).map(toAgentRunStep);
  }

  function listToolCallsByRun(agentRunId) {
    return queries.listToolCallsByRun.all(agentRunId).map(toAgentRunToolCall);
  }

  return {
    createAgentRun,
    updateAgentRunStatus,
    appendAgentStep,
    appendToolCall,
    listAgentRunsByTaskRun,
    listAgentStepsByRun,
    listToolCallsByRun,
  };
}

module.exports = {
  createAgentRunStorage,
};
