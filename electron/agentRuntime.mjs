import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

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

async function runModel(model, systemPrompt, userPrompt) {
  if (!model) {
    return [
      "[Mock-Agent] OpenAI API Key 未配置，当前返回本地演示结果。",
      "建议：在 Personal Settings 中填入 OpenAI Key 后执行真实模型推理。",
      "输入摘要:",
      userPrompt.slice(0, 220),
    ].join("\n");
  }

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return toText(response.content);
}

function createModel(apiKey, modelName = "gpt-4o-mini") {
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0.2,
  });
}

function buildGraph(model) {
  const planner = async (state) => {
    const plan = await runModel(
      model,
      "You are a planning agent. Break user intent into concise executable steps.",
      state.prompt,
    );

    return {
      plan,
      logs: ["[INFO] Planner agent completed plan decomposition."],
    };
  };

  const analyst = async (state) => {
    const analysis = await runModel(
      model,
      "You are an analyst agent. Analyze the request and draft evidence-driven findings.",
      `Request:\n${state.prompt}\n\nPlan:\n${state.plan}`,
    );

    return {
      analysis,
      logs: ["[INFO] Analyst agent completed structured analysis."],
    };
  };

  const reporter = async (state) => {
    const answer = await runModel(
      model,
      "You are a reporting agent. Return a practical markdown response.",
      `Request:\n${state.prompt}\n\nPlan:\n${state.plan}\n\nAnalysis:\n${state.analysis}`,
    );

    return {
      answer,
      logs: ["[INFO] Reporter agent generated the final output."],
    };
  };

  return new StateGraph(AgentState)
    .addNode("planner", planner)
    .addNode("analyst", analyst)
    .addNode("reporter", reporter)
    .addEdge(START, "planner")
    .addEdge("planner", "analyst")
    .addEdge("analyst", "reporter")
    .addEdge("reporter", END)
    .compile();
}

export async function runMultiAgentChat({ prompt, apiKey, modelName }) {
  const model = createModel(apiKey, modelName);
  const graph = buildGraph(model);

  const result = await graph.invoke({
    prompt,
    logs: ["[INFO] Multi-agent workflow started."],
  });

  return {
    answer: result.answer,
    logs: [...result.logs, "[INFO] Workflow completed."],
  };
}

export async function runTaskWorkflow({ prompt, apiKey, modelName }) {
  const result = await runMultiAgentChat({ prompt, apiKey, modelName });

  return {
    answer: `Task completed.\n\n${result.answer}`,
    logs: ["[INFO] Task execution engine initialized.", ...result.logs],
  };
}
