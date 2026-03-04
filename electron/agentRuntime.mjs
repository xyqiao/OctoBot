import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const AgentState = Annotation.Root({
  prompt: Annotation,
  plan: Annotation,
  analysis: Annotation,
  answer: Annotation,
  logs: Annotation({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});

function toText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return String(item.text);
        }
        return JSON.stringify(item);
      })
      .join("\n");
  }
  return String(content ?? "");
}

function buildChatMessages(systemPrompt, userPrompt) {
  return [
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ];
}

async function runModel(model, systemPrompt, userPrompt) {
  if (!model) {
    return [
      "[Mock-Agent] API Key 未配置，当前返回本地演示结果。",
      "建议：在个人设置中填入 modelName/baseUrl/apiKey 后执行真实模型推理。",
      "输入摘要:",
      userPrompt.slice(0, 220),
    ].join("\n");
  }

  const response = await model.invoke(buildChatMessages(systemPrompt, userPrompt));

  return toText(response.content);
}

async function runModelStream(model, systemPrompt, userPrompt, { signal, onChunk } = {}) {
  if (!model) {
    const fallbackText = [
      "[Mock-Agent] API Key 未配置，当前返回本地演示结果。",
      "建议：在个人设置中填入 modelName/baseUrl/apiKey 后执行真实模型推理。",
      "输入摘要:",
      userPrompt.slice(0, 220),
    ].join("\n");
    onChunk?.(fallbackText);
    return fallbackText;
  }

  const stream = await model.stream(
    buildChatMessages(systemPrompt, userPrompt),
    { signal },
  );

  let answer = "";
  for await (const chunk of stream) {
    const delta = toText(chunk.content);
    if (!delta) {
      continue;
    }
    answer += delta;
    onChunk?.(delta);
  }

  return answer;
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

function buildPlanningGraph(model) {
  const planner = async (state) => {
    const plan = await runModel(
      model,
      "你是规划智能体。请将用户需求拆解为简洁、可执行的步骤，按优先级输出。",
      state.prompt,
    );

    return {
      plan,
      logs: ["[INFO] 规划智能体已完成任务拆解。"],
    };
  };

  const analyst = async (state) => {
    const analysis = await runModel(
      model,
      "你是分析智能体。请基于用户需求与任务计划给出结构化分析，突出依据、假设与风险。",
      `需求：\n${state.prompt}\n\n计划：\n${state.plan}`,
    );

    return {
      analysis,
      logs: ["[INFO] 分析智能体已完成结构化分析。"],
    };
  };

  return new StateGraph(AgentState)
    .addNode("planner", planner)
    .addNode("analyst", analyst)
    .addEdge(START, "planner")
    .addEdge("planner", "analyst")
    .addEdge("analyst", END)
    .compile();
}

export async function runMultiAgentChatStream({ prompt, apiKey, modelName, baseUrl, signal, onChunk, onLog }) {
  const model = createModel(apiKey, modelName, baseUrl);
  const planningGraph = buildPlanningGraph(model);

  const planningResult = await planningGraph.invoke({
    prompt,
    logs: ["[INFO] 多智能体工作流已启动。"],
  });

  for (const log of planningResult.logs) {
    onLog?.(log);
  }

  const answer = await runModelStream(
    model,
    "你是汇报智能体。请输出可执行、可落地的 Markdown 回复，结论清晰，必要时使用列表或表格。",
    `需求：\n${prompt}\n\n计划：\n${planningResult.plan}\n\n分析：\n${planningResult.analysis}`,
    { signal, onChunk },
  );

  const logs = [...planningResult.logs, "[INFO] 汇报智能体已生成最终输出。", "[INFO] 工作流执行完成。"];
  onLog?.("[INFO] 汇报智能体已生成最终输出。");
  onLog?.("[INFO] 工作流执行完成。");

  return {
    answer,
    logs,
  };
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
  const result = await runMultiAgentChat({ prompt, apiKey, modelName, baseUrl });

  return {
    answer: `任务已完成。\n\n${result.answer}`,
    logs: ["[INFO] 任务执行引擎已初始化。", ...result.logs],
  };
}
