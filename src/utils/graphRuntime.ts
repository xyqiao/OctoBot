export type RuntimeOptions = {
  prompt: string;
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
  abortSignal?: AbortSignal;
};

export type RuntimeResult = {
  answer: string;
  logs: string[];
};

export type RuntimeStreamEvent =
  | { type: "chunk"; chunk: string }
  | { type: "log"; log: string }
  | { type: "done"; answer: string; logs: string[] }
  | { type: "error"; error: string };

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

async function* fallbackStream(prompt: string): AsyncGenerator<RuntimeStreamEvent> {
  const result = fallback(prompt);
  yield { type: "chunk", chunk: result.answer };
  yield { type: "done", answer: result.answer, logs: result.logs };
}

export async function runMultiAgentChat(options: RuntimeOptions): Promise<RuntimeResult> {
  if (!window.desktopApi?.runAgentChat) {
    return fallback(options.prompt);
  }

  return window.desktopApi.runAgentChat(options);
}

export async function* runMultiAgentChatStream(options: RuntimeOptions): AsyncGenerator<RuntimeStreamEvent> {
  if (!window.desktopApi?.runAgentChatStream) {
    yield* fallbackStream(options.prompt);
    return;
  }

  const queue: RuntimeStreamEvent[] = [];
  let closed = false;
  let wake: (() => void) | null = null;
  let streamId = "";

  const push = (event: RuntimeStreamEvent) => {
    queue.push(event);
    if (event.type === "done" || event.type === "error") {
      closed = true;
    }
    if (wake) {
      wake();
      wake = null;
    }
  };

  const onAbort = () => {
    if (streamId && window.desktopApi?.cancelAgentChatStream) {
      void window.desktopApi.cancelAgentChatStream(streamId);
    }
  };

  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    streamId = await window.desktopApi.runAgentChatStream(
      {
        prompt: options.prompt,
        apiKey: options.apiKey,
        modelName: options.modelName,
        baseUrl: options.baseUrl,
      },
      push,
    );

    if (options.abortSignal?.aborted && window.desktopApi?.cancelAgentChatStream) {
      await window.desktopApi.cancelAgentChatStream(streamId);
    }

    while (!closed || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }

      const event = queue.shift();
      if (!event) {
        continue;
      }

      yield event;
    }
  } finally {
    if (options.abortSignal) {
      options.abortSignal.removeEventListener("abort", onAbort);
    }
  }
}

export async function runTaskWorkflow(options: RuntimeOptions): Promise<RuntimeResult> {
  if (!window.desktopApi?.runTaskWorkflow) {
    return fallback(options.prompt);
  }

  return window.desktopApi.runTaskWorkflow(options);
}
