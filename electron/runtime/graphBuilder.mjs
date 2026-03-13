/**
 * LangGraph builder for multi-agent workflow
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { isAIMessage } from "@langchain/core/messages";
import { createPlannerNode } from "./agents/planner.mjs";
import { createExecutorNode } from "./agents/executor.mjs";
import { createVerifierNode, shouldContinueAfterVerifier } from "./agents/verifier.mjs";

export function tagAgentMessage(message, name) {
  if (!message || typeof message !== "object") {
    return message;
  }
  message.name = name;
  if (message.lc_kwargs && typeof message.lc_kwargs === "object") {
    message.lc_kwargs.name = name;
  }
  return message;
}

export function mergeConfigTag(config, tag) {
  const tags = Array.isArray(config?.tags) ? config.tags : [];
  return {
    ...config,
    tags: [...tags, tag],
  };
}

export function buildMultiAgentGraph({ model, tools, skillPatch, requiredSteps = [] }) {
  const GraphState = Annotation.Root({
    input: Annotation(),
    plan: Annotation(),
    finalAnswer: Annotation(),
    logs: Annotation({
      reducer: (left = [], right) => {
        const next = Array.isArray(right) ? right : right ? [right] : [];
        return left.concat(next);
      },
      default: () => [],
    }),
    messages: Annotation({
      reducer: (left = [], right) => {
        if (!right) {
          return left;
        }
        const next = Array.isArray(right) ? right : [right];
        return left.concat(next);
      },
      default: () => [],
    }),
  });

  const modelWithTools =
    typeof model?.bindTools === "function" ? model.bindTools(tools) : model;

  const plannerNode = createPlannerNode(model, skillPatch);
  const executorNode = createExecutorNode(modelWithTools, skillPatch, requiredSteps);
  const verifierNode = createVerifierNode(model, skillPatch);
  const toolNode = new ToolNode(tools);

  const shouldContinue = (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && isAIMessage(lastMessage)) {
      const toolCalls = Array.isArray(lastMessage.tool_calls)
        ? lastMessage.tool_calls
        : [];
      if (toolCalls.length > 0) {
        return "tools";
      }
    }
    return "verifier";
  };

  return new StateGraph(GraphState)
    .addNode("planner", plannerNode)
    .addNode("executor", executorNode)
    .addNode("tools", toolNode)
    .addNode("verifier", verifierNode)
    .addEdge(START, "planner")
    .addEdge("planner", "executor")
    .addConditionalEdges("executor", shouldContinue, ["tools", "verifier"])
    .addEdge("tools", "executor")
    .addEdge("verifier", END)
    .compile();
}
