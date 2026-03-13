/**
 * Stall detection utilities
 */

import { toText, summarizeJson, normalizeSignalText } from "./utils/textUtils.mjs";

export const STALL_POLICY = {
  maxRepeatedToolErrors: 2,
  maxNoProgressExecutions: 4,
  maxRepeatedExecutorOutputs: 3,
  maxRepeatedVerifierOutputs: 3,
};

export function isGraphRecursionLimitError(error) {
  const message = toText(error?.message || error);
  const name = typeof error?.name === "string" ? error.name : "";
  return (
    name === "GraphRecursionError" ||
    message.includes("GRAPH_RECURSION_LIMIT") ||
    (message.includes("Recursion limit") && message.includes("stop condition"))
  );
}

export function isAbortError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  const message = toText(error?.message || error);
  return name === "AbortError" || message.includes("aborted") || message.includes("ABORT");
}

export function buildToolSignature(event) {
  const name = toText(event?.name || "").trim() || "unknown_tool";
  const input = event?.data?.input ? event.data.input : {};
  return `${name}:${summarizeJson(input, 180)}`;
}

export function detectStall(state, policy = STALL_POLICY) {
  const messages = Array.isArray(state?.messages) ? state.messages : [];
  const logs = Array.isArray(state?.logs) ? state.logs : [];

  // Check for repeated tool errors
  const toolErrorLogs = logs.filter((log) =>
    typeof log === "string" && log.includes("[TOOL] 失败")
  );
  if (toolErrorLogs.length >= policy.maxRepeatedToolErrors) {
    const lastErrors = toolErrorLogs.slice(-policy.maxRepeatedToolErrors);
    const signatures = lastErrors.map((log) => normalizeSignalText(log));
    const uniqueSignatures = new Set(signatures);
    if (uniqueSignatures.size === 1) {
      return {
        stalled: true,
        reason: "repeated_tool_error",
        detail: lastErrors[0],
      };
    }
  }

  // Check for no progress in executor
  const executorMessages = messages.filter((msg) =>
    msg?.name === "executor" || msg?.lc_kwargs?.name === "executor"
  );
  if (executorMessages.length >= policy.maxNoProgressExecutions) {
    const recentExecutor = executorMessages.slice(-policy.maxNoProgressExecutions);
    const outputs = recentExecutor.map((msg) => normalizeSignalText(toText(msg?.content)));
    const uniqueOutputs = new Set(outputs);
    if (uniqueOutputs.size <= 2) {
      return {
        stalled: true,
        reason: "no_progress_executor",
        detail: `Executor repeated similar outputs ${policy.maxNoProgressExecutions} times`,
      };
    }
  }

  // Check for repeated verifier outputs
  const verifierMessages = messages.filter((msg) =>
    msg?.name === "verifier" || msg?.lc_kwargs?.name === "verifier"
  );
  if (verifierMessages.length >= policy.maxRepeatedVerifierOutputs) {
    const recentVerifier = verifierMessages.slice(-policy.maxRepeatedVerifierOutputs);
    const outputs = recentVerifier.map((msg) => normalizeSignalText(toText(msg?.content)));
    const uniqueOutputs = new Set(outputs);
    if (uniqueOutputs.size === 1) {
      return {
        stalled: true,
        reason: "repeated_verifier_output",
        detail: outputs.values().next().value,
      };
    }
  }

  return {
    stalled: false,
    reason: null,
    detail: null,
  };
}
