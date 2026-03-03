export type RuntimeOptions = {
  prompt: string;
  apiKey?: string;
  modelName?: string;
};

export type RuntimeResult = {
  answer: string;
  logs: string[];
};

function fallback(prompt: string): RuntimeResult {
  return {
    answer: [
      "[Mock-Agent] 当前无法连接主进程 LangGraph 运行时。",
      "这通常出现在纯浏览器预览模式。",
      "",
      "输入内容：",
      prompt,
    ].join("\n"),
    logs: ["[WARN] IPC runtime unavailable."],
  };
}

export async function runMultiAgentChat(options: RuntimeOptions): Promise<RuntimeResult> {
  if (!window.desktopApi?.runAgentChat) {
    return fallback(options.prompt);
  }

  return window.desktopApi.runAgentChat(options);
}

export async function runTaskWorkflow(options: RuntimeOptions): Promise<RuntimeResult> {
  if (!window.desktopApi?.runTaskWorkflow) {
    return fallback(options.prompt);
  }

  return window.desktopApi.runTaskWorkflow(options);
}
