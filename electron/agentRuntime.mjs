import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createLangChainTools, listCapabilityTools } from "./agentTools/langchainTools.mjs";

const TOOL_AWARE_SYSTEM_PROMPT = [
  "你是桌面端智能体。",
  "你可以调用本地工具执行文件读写、办公文档处理、浏览器自动化与自媒体发布。",
  "当任务需要真实操作时，优先调用工具，不要只停留在建议层。",
  "输出使用简洁 Markdown，先给结论，再给关键细节。",
].join("\n");

function toText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          return String(item.text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

function chunkText(answer, chunkSize = 160) {
  const text = toText(answer);
  if (!text) {
    return [];
  }
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }
  return chunks;
}

function summarizeJson(value, maxLen = 240) {
  try {
    const text = JSON.stringify(value);
    if (!text) {
      return "";
    }
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, maxLen)}...(truncated)`;
  } catch {
    return "";
  }
}

function pushLog(logs, onLog, text) {
  logs.push(text);
  onLog?.(text);
}

function createModel(apiKey, modelName = "gpt-4o-mini", baseUrl = "") {
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  const options = {
    apiKey,
    model: modelName,
    temperature: 0.2,
  };

  if (baseUrl && baseUrl.trim()) {
    options.configuration = {
      baseURL: baseUrl.trim(),
    };
  }

  return new ChatOpenAI(options);
}

function extractAssistantAnswer(messages) {
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

function extractEventTextChunk(event) {
  const chunk = event?.data?.chunk;
  if (!chunk) {
    return "";
  }

  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk?.text === "string") {
    return chunk.text;
  }

  if (chunk?.message?.content !== undefined) {
    return toText(chunk.message.content);
  }

  if (chunk?.content !== undefined) {
    return toText(chunk.content);
  }

  return "";
}

function extractEventFinalText(event) {
  const output = event?.data?.output;
  if (!output) {
    return "";
  }
  if (output?.message?.content !== undefined) {
    return toText(output.message.content);
  }
  if (output?.content !== undefined) {
    return toText(output.content);
  }
  return toText(output);
}

function buildToolEventLog(event) {
  if (event.event === "on_tool_start") {
    return `[TOOL] 开始 ${event.name} ${summarizeJson(event?.data?.input)}`.trim();
  }
  if (event.event === "on_tool_end") {
    return `[TOOL] 完成 ${event.name} ${summarizeJson(event?.data?.output)}`.trim();
  }
  if (event.event === "on_tool_error") {
    return `[TOOL] 失败 ${event.name}: ${toText(event?.data?.error)}`;
  }
  return "";
}

async function runToolAwareAgent({ prompt, model, signal, onChunk, onLog }) {
  const logs = [];

  if (!model) {
    const supportedTools = listCapabilityTools()
      .map((item) => `- ${item.name}: ${item.description}`)
      .join("\n");

    const fallbackAnswer = [
      "[Mock-Agent] API Key 未配置，当前无法执行真实模型推理。",
      "请在设置中配置 modelName/baseUrl/apiKey 后重试。",
      "",
      "已注册工具能力：",
      supportedTools,
      "",
      "输入摘要：",
      prompt.slice(0, 260),
    ].join("\n");

    for (const part of chunkText(fallbackAnswer)) {
      onChunk?.(part);
    }
    pushLog(logs, onLog, "[WARN] API key unavailable, returned mock result.");

    return {
      answer: fallbackAnswer,
      logs,
    };
  }

  const tools = createLangChainTools({
    baseDir: process.cwd(),
    runContext: {
      source: "chat_agent",
    },
    onLog: (message) => {
      pushLog(logs, onLog, `[TOOL] ${message}`);
    },
  });

  const agent = createAgent({
    model,
    tools,
    prompt: TOOL_AWARE_SYSTEM_PROMPT,
  });

  pushLog(logs, onLog, "[INFO] 工具智能体已启动（token 流式）。");

  const stateInput = {
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  let answer = "";
  let latestModelOutput = "";

  const eventStream = agent.streamEvents(stateInput, {
    signal,
    version: "v2",
  });

  for await (const event of eventStream) {
    if (!event || typeof event !== "object") {
      continue;
    }

    if (event.event === "on_chat_model_stream") {
      const delta = extractEventTextChunk(event);
      if (delta) {
        answer += delta;
        onChunk?.(delta);
      }
      continue;
    }

    if (event.event === "on_chat_model_end") {
      const finalText = extractEventFinalText(event);
      if (finalText) {
        latestModelOutput = finalText;
      }
      continue;
    }

    if (
      event.event === "on_tool_start" ||
      event.event === "on_tool_end" ||
      event.event === "on_tool_error"
    ) {
      const logLine = buildToolEventLog(event);
      if (logLine) {
        pushLog(logs, onLog, logLine);
      }
    }
  }

  if (!answer && latestModelOutput) {
    answer = latestModelOutput;
    onChunk?.(answer);
  }

  if (!answer) {
    const result = await agent.invoke(stateInput, { signal });
    answer = extractAssistantAnswer(result?.messages || []);
    if (answer) {
      onChunk?.(answer);
    }
  }

  pushLog(logs, onLog, "[INFO] 工具智能体执行完成。");
  return {
    answer,
    logs,
  };
}

export async function runMultiAgentChatStream({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  signal,
  onChunk,
  onLog,
}) {
  const model = createModel(apiKey, modelName, baseUrl);
  return runToolAwareAgent({
    prompt,
    model,
    signal,
    onChunk,
    onLog,
  });
}

export async function runMultiAgentChat({ prompt, apiKey, modelName, baseUrl }) {
  return runMultiAgentChatStream({
    prompt,
    apiKey,
    modelName,
    baseUrl,
  });
}

export async function runTaskWorkflow({ prompt, apiKey, modelName, baseUrl }) {
  const result = await runMultiAgentChat({
    prompt,
    apiKey,
    modelName,
    baseUrl,
  });

  return {
    answer: `任务已完成。\n\n${result.answer}`,
    logs: ["[INFO] 任务执行引擎已初始化。", ...result.logs],
  };
}
