/**
 * Model factory and LangSmith integration
 */

import { ChatOpenAI } from "@langchain/openai";
import { Client as LangSmithClient } from "langsmith";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { toText } from "./utils/textUtils.mjs";

export function createModel(apiKey, modelName = "gpt-4o-mini", baseUrl = "", extraOptions = {}) {
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  const options = {
    apiKey,
    model: modelName,
    temperature: 0.2,
    ...extraOptions,
  };

  if (baseUrl && baseUrl.trim()) {
    options.configuration = {
      baseURL: baseUrl.trim(),
    };
  }

  return new ChatOpenAI(options);
}

export function buildLangSmithTracer({ enabled, apiKey, projectName, endpoint }) {
  if (!enabled || !apiKey || !apiKey.trim()) {
    return null;
  }

  const client = new LangSmithClient({
    apiKey: apiKey.trim(),
    apiUrl: endpoint && endpoint.trim() ? endpoint.trim() : undefined,
  });
  const tracer = new LangChainTracer({ projectName, client });
  return tracer;
}

export function extractAssistantAnswer(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const type =
      typeof message?.getType === "function"
        ? message.getType()
        : message?._getType?.();

    if (type === "ai" || message?.role === "assistant") {
      return toText(message.content);
    }
  }

  const lastMessage = messages[messages.length - 1];
  return toText(lastMessage?.content);
}
