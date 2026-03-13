/**
 * Chat context and memory management utilities
 */

const {
  buildPromptWithBudget,
  buildSummaryRefreshState,
  shouldRefreshSummary,
} = require("./chatContextManager.cjs");

function shortChatId(chatId = "") {
  const value = String(chatId || "").trim();
  return value ? value.slice(0, 8) : "-";
}

function normalizeAgentPayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    ...source,
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    chatId: typeof source.chatId === "string" ? source.chatId.trim() : "",
    latestUserMessage:
      typeof source.latestUserMessage === "string" ? source.latestUserMessage : "",
    apiKey: typeof source.apiKey === "string" ? source.apiKey : "",
    langsmithEnabled: Boolean(source.langsmithEnabled),
    langsmithApiKey:
      typeof source.langsmithApiKey === "string" ? source.langsmithApiKey : "",
    langsmithProject:
      typeof source.langsmithProject === "string" ? source.langsmithProject : "",
    langsmithEndpoint:
      typeof source.langsmithEndpoint === "string" ? source.langsmithEndpoint : "",
    modelName:
      typeof source.modelName === "string" && source.modelName.trim()
        ? source.modelName.trim()
        : "gpt-4o-mini",
    baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : "",
  };
}

async function prepareChatRuntimePayload(storage, payload = {}) {
  const normalizedPayload = normalizeAgentPayload(payload);
  if (!storage) {
    return normalizedPayload;
  }

  if (!normalizedPayload.chatId) {
    return normalizedPayload;
  }

  const messages = storage.getChatMessages(normalizedPayload.chatId);
  const memory = storage.getChatMemory(normalizedPayload.chatId);
  const chatContext = buildPromptWithBudget(messages, memory, {
    latestUserMessage: normalizedPayload.latestUserMessage,
    modelName: normalizedPayload.modelName,
  });

  console.info(
    `[聊天记忆] 已构建提示词 chat=${shortChatId(normalizedPayload.chatId)} ` +
      `摘要Token=${chatContext.summaryTokens} ` +
      `历史消息数=${chatContext.historyMessages.length} ` +
      `预计Token=${chatContext.tokenEstimate.estimatedTotalTokens}/` +
      `${chatContext.tokenEstimate.inputBudgetTokens}`,
  );

  return {
    ...normalizedPayload,
    prompt: chatContext.prompt,
    latestUserMessage: chatContext.latestUserMessage,
    chatContext,
  };
}

async function refreshChatMemory(storage, getRuntime, activeChatMemoryRefreshes, payload = {}) {
  const normalizedPayload = normalizeAgentPayload(payload);
  if (!storage || !normalizedPayload.chatId) {
    return null;
  }

  const existing = activeChatMemoryRefreshes.get(normalizedPayload.chatId);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const runtime = await getRuntime();
    const messages = storage.getChatMessages(normalizedPayload.chatId);
    const memory = storage.getChatMemory(normalizedPayload.chatId);
    const refreshState = buildSummaryRefreshState(messages, memory, {
      modelName: normalizedPayload.modelName,
    });

    if (!shouldRefreshSummary(refreshState)) {
      console.info(
        `[聊天记忆] 跳过摘要刷新 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `过渡区Token=${refreshState.transitionTokens}`,
      );
      return memory;
    }

    const lastTransitionMessage = refreshState.transitionMessages.at(-1);
    if (!lastTransitionMessage) {
      console.info(
        `[聊天记忆] 跳过摘要刷新 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `原因=没有可摘要的过渡消息`,
      );
      return memory;
    }

    console.info(
      `[聊天记忆] 开始刷新摘要 chat=${shortChatId(normalizedPayload.chatId)} ` +
        `过渡消息数=${refreshState.transitionMessages.length} ` +
        `过渡区Token=${refreshState.transitionTokens}`,
    );

    try {
      const result = await runtime.runConversationSummary({
        previousSummary: refreshState.summaryText,
        historyText: refreshState.transitionText,
        apiKey: normalizedPayload.apiKey,
        modelName: normalizedPayload.modelName,
        baseUrl: normalizedPayload.baseUrl,
        onLog: (message) => console.info(message),
      });

      if (!result?.applied) {
        console.info(
          `[聊天记忆] 摘要结果未生效 chat=${shortChatId(normalizedPayload.chatId)}`,
        );
        return memory;
      }

      const nextMemory = {
        chatId: normalizedPayload.chatId,
        summaryText: result.summaryText,
        coveredUntilTimestamp: lastTransitionMessage.timestamp,
        updatedAt: Date.now(),
      };
      storage.saveChatMemory(nextMemory);
      console.info(
        `[聊天记忆] 摘要已保存 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `覆盖到=${lastTransitionMessage.timestamp}`,
      );
      return nextMemory;
    } catch (error) {
      console.warn(
        `[聊天记忆] 摘要刷新失败 chat=${shortChatId(normalizedPayload.chatId)}`,
        error,
      );
      return memory;
    }
  })();

  activeChatMemoryRefreshes.set(normalizedPayload.chatId, task);
  try {
    return await task;
  } finally {
    if (activeChatMemoryRefreshes.get(normalizedPayload.chatId) === task) {
      activeChatMemoryRefreshes.delete(normalizedPayload.chatId);
    }
  }
}

module.exports = {
  shortChatId,
  normalizeAgentPayload,
  prepareChatRuntimePayload,
  refreshChatMemory,
};
