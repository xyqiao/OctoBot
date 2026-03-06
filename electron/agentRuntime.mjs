import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  createLangChainTools,
  listCapabilityTools,
} from "./agentTools/langchainTools.mjs";

const TOOL_AWARE_SYSTEM_PROMPT = [
  "你是桌面端智能体。",
  "你可以调用本地工具执行文件读写、办公文档处理，以及基于 Playwright MCP 的浏览器自动化。",
  "当任务需要真实操作时，优先调用工具，不要只停留在建议层。",
  "输出使用简洁 Markdown，先给结论，再给关键细节。",
].join("\n");

const SKILL_TOOL_NAME_MAP = {
  office_read_document: "office_read_document",
  read_document: "office_read_document",
  office_write_document: "office_write_document",
  write_document: "office_write_document",
};

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

function normalizeText(value) {
  return toText(value).toLowerCase();
}

function normalizeSkillToolName(value) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) {
    return "";
  }
  return SKILL_TOOL_NAME_MAP[raw] || raw;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = toText(value).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeSkillSpec(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const aliases = Array.isArray(source?.triggers?.aliases)
    ? source.triggers.aliases
    : [];
  const keywords = Array.isArray(source?.triggers?.keywords)
    ? source.triggers.keywords
    : [];
  const tools = Array.isArray(source.tools) ? source.tools : [];
  const fallback = Array.isArray(source.fallback) ? source.fallback : [];
  const steps = Array.isArray(source.steps) ? source.steps : [];

  return {
    id: toText(source.id || "").trim(),
    name: toText(source.name || source.displayName || "").trim(),
    displayName: toText(source.displayName || source.name || "").trim(),
    description: toText(source.description || "").trim(),
    purpose: toText(source.purpose || "").trim(),
    trigger: toText(source.trigger || "").trim(),
    tools: uniqueStrings(tools.map(normalizeSkillToolName).filter(Boolean)),
    fallback: uniqueStrings(fallback),
    steps: uniqueStrings(steps),
    triggers: {
      aliases: uniqueStrings(aliases),
      keywords: uniqueStrings(keywords),
    },
  };
}

function hasSkillExplicitMention(promptLower, skill) {
  const names = uniqueStrings([
    skill.displayName,
    skill.name,
    ...skill.triggers.aliases,
  ]).map((item) => item.toLowerCase());

  return names.some((name) => {
    if (!name) {
      return false;
    }
    return (
      promptLower.includes(`$${name}`) ||
      promptLower.includes(`#${name}`) ||
      promptLower.includes(name)
    );
  });
}

function computeSkillSemanticScore(promptLower, skill) {
  const tokens = uniqueStrings([
    ...skill.triggers.keywords,
    ...skill.triggers.aliases,
    ...skill.tools,
    skill.name,
    skill.displayName,
  ]).map((item) => item.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (!promptLower.includes(token)) {
      continue;
    }
    if (skill.tools.map((item) => item.toLowerCase()).includes(token)) {
      score += 2;
      continue;
    }
    if (token.length >= 4) {
      score += 2;
    } else {
      score += 1;
    }
  }

  const purposeText = normalizeText(
    `${skill.description}\n${skill.purpose}\n${skill.trigger}`,
  );
  if (
    purposeText &&
    promptLower.includes(purposeText.slice(0, Math.min(30, purposeText.length)))
  ) {
    score += 1;
  }

  return score;
}

function selectSkillsForPrompt(prompt, enabledSkillSpecs = [], maxSkills = 3) {
  const skills = enabledSkillSpecs
    .map(normalizeSkillSpec)
    .filter((skill) => skill.displayName || skill.name);

  if (skills.length === 0) {
    return {
      selectedSkills: [],
      matchReason: "none",
    };
  }

  const promptLower = normalizeText(prompt);
  const explicitMatches = skills.filter((skill) =>
    hasSkillExplicitMention(promptLower, skill),
  );

  const selected = [];
  const selectedIds = new Set();
  for (const skill of explicitMatches) {
    const id = skill.id || skill.name || skill.displayName;
    if (selectedIds.has(id)) {
      continue;
    }
    selected.push(skill);
    selectedIds.add(id);
    if (selected.length >= maxSkills) {
      break;
    }
  }

  const reason = selected.length > 0 ? "explicit" : "semantic";
  if (selected.length < maxSkills) {
    const semanticCandidates = skills
      .map((skill) => ({
        skill,
        score: computeSkillSemanticScore(promptLower, skill),
      }))
      .filter((item) => item.score >= 2)
      .sort((left, right) => right.score - left.score);

    for (const candidate of semanticCandidates) {
      const id =
        candidate.skill.id ||
        candidate.skill.name ||
        candidate.skill.displayName;
      if (selectedIds.has(id)) {
        continue;
      }
      selected.push(candidate.skill);
      selectedIds.add(id);
      if (selected.length >= maxSkills) {
        break;
      }
    }
  }

  return {
    selectedSkills: selected,
    matchReason: selected.length > 0 ? reason : "none",
  };
}

function buildSkillPromptPatch(selectedSkills = []) {
  if (!Array.isArray(selectedSkills) || selectedSkills.length === 0) {
    return "";
  }

  const sections = selectedSkills.map((skill, index) => {
    return [
      `${index + 1}. ${skill.displayName || skill.name}`,
      skill.description ? `- 描述: ${skill.description}` : "",
      skill.purpose ? `- 用途: ${skill.purpose}` : "",
      skill.trigger ? `- 触发条件: ${skill.trigger}` : "",
      skill.steps.length > 0
        ? `- 执行步骤:\n${skill.steps.map((step, stepIndex) => `  ${stepIndex + 1}) ${step}`).join("\n")}`
        : "",
      skill.tools.length > 0 ? `- 依赖工具: ${skill.tools.join(", ")}` : "",
      skill.fallback.length > 0
        ? `- 失败回退:\n${skill.fallback.map((item) => `  - ${item}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "你当前必须遵循以下已匹配技能规范：",
    ...sections,
    "执行要求：严格按技能步骤执行；工具调用优先使用技能列出的依赖工具；失败时按回退策略处理并说明。",
  ].join("\n\n");
}

function collectAllowedToolsFromSkills(selectedSkills = []) {
  const tools = uniqueStrings(
    selectedSkills
      .flatMap((skill) => (Array.isArray(skill.tools) ? skill.tools : []))
      .map(normalizeSkillToolName)
      .filter(Boolean),
  );
  return tools;
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

async function runToolAwareAgent({
  prompt,
  model,
  signal,
  onChunk,
  onLog,
  enabledSkillSpecs = [],
}) {
  const logs = [];
  const { selectedSkills, matchReason } = selectSkillsForPrompt(
    prompt,
    enabledSkillSpecs,
  );
  const allowedToolNames = collectAllowedToolsFromSkills(selectedSkills);
  const skillPatch = buildSkillPromptPatch(selectedSkills);
  const finalPrompt = prompt;

  if (selectedSkills.length > 0) {
    pushLog(
      logs,
      onLog,
      `[SKILL] 命中 ${selectedSkills.length} 个技能（${matchReason}）：${selectedSkills
        .map((item) => item.displayName || item.name)
        .join(", ")}`,
    );
    if (allowedToolNames.length > 0) {
      pushLog(
        logs,
        onLog,
        `[SKILL] 工具白名单：${allowedToolNames.join(", ")}`,
      );
    }
  } else if (enabledSkillSpecs.length > 0) {
    pushLog(logs, onLog, "[SKILL] 未命中可自动触发技能，按通用流程执行。");
  }

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
      finalPrompt.slice(0, 260),
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

  const tools = await createLangChainTools({
    baseDir: process.cwd(),
    runContext: {
      source: "chat_agent",
    },
    allowedToolNames,
    onLog: (message) => {
      pushLog(logs, onLog, `[TOOL] ${message}`);
    },
  });

  const agentPrompt = [TOOL_AWARE_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");
  const agent = createAgent({
    model,
    tools,
    prompt: agentPrompt,
  });

  pushLog(logs, onLog, "[INFO] 工具智能体已启动（token 流式）。");

  const stateInput = {
    messages: [
      {
        role: "user",
        content: finalPrompt,
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
  enabledSkillSpecs = [],
  signal,
  onChunk,
  onLog,
}) {
  const model = createModel(apiKey, modelName, baseUrl);
  return runToolAwareAgent({
    prompt,
    model,
    enabledSkillSpecs,
    signal,
    onChunk,
    onLog,
  });
}

export async function runMultiAgentChat({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  enabledSkillSpecs = [],
}) {
  return runMultiAgentChatStream({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    enabledSkillSpecs,
  });
}

export async function runTaskWorkflow({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  enabledSkillSpecs = [],
}) {
  const result = await runMultiAgentChat({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    enabledSkillSpecs,
  });

  return {
    answer: `任务已完成。\n\n${result.answer}`,
    logs: ["[INFO] 任务执行引擎已初始化。", ...result.logs],
  };
}
