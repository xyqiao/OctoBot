/**
 * IPC handlers for chat-related operations
 */

const { ipcMain } = require("electron");

function registerChatHandlers({ storage, getRuntime, withEnabledSkills, prepareChatRuntimePayload, refreshChatMemory, activeChatStreams }) {
  ipcMain.handle("agent:chat", async (_event, payload) => {
    const runtime = await getRuntime();
    const preparedPayload = await prepareChatRuntimePayload(payload);
    return runtime.runMultiAgentChat(await withEnabledSkills(preparedPayload));
  });

  ipcMain.handle(
    "agent:chat:stream/start",
    async (event, { streamId, payload }) => {
      if (!streamId || !payload) {
        throw new Error("Invalid stream start payload.");
      }

      const runtime = await getRuntime();
      const channel = `agent:chat:stream:${streamId}`;
      const controller = new AbortController();
      activeChatStreams.set(streamId, controller);

      const send = (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(channel, data);
        }
      };

      void (async () => {
        try {
          const preparedPayload = await prepareChatRuntimePayload(payload);
          const result = await runtime.runMultiAgentChatStream({
            ...(await withEnabledSkills(preparedPayload)),
            signal: controller.signal,
            onChunk: (chunk) => send({ type: "chunk", chunk }),
            onLog: (log) => send({ type: "log", log }),
          });
          send({ type: "done", ...result });
        } catch (error) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          activeChatStreams.delete(streamId);
        }
      })();

      return true;
    },
  );

  ipcMain.handle("agent:chat:stream/cancel", (_event, streamId) => {
    const controller = activeChatStreams.get(streamId);
    if (!controller) {
      return false;
    }
    controller.abort();
    activeChatStreams.delete(streamId);
    return true;
  });

  ipcMain.handle("db:listChats", () => storage.listChats());
  ipcMain.handle("db:createChat", () => storage.createChat());
  ipcMain.handle("db:renameChat", (_event, chatId, title) =>
    storage.renameChat(chatId, title),
  );
  ipcMain.handle("db:deleteChat", (_event, chatId) =>
    storage.deleteChat(chatId),
  );
  ipcMain.handle("db:getChatMessages", (_event, chatId) =>
    storage.getChatMessages(chatId),
  );
  ipcMain.handle("db:getChatMemory", (_event, chatId) =>
    storage.getChatMemory(chatId),
  );
  ipcMain.handle("db:refreshChatMemory", async (_event, payload) =>
    refreshChatMemory(payload),
  );
  ipcMain.handle("db:appendMessage", (_event, message) =>
    storage.appendMessage(message),
  );
}

module.exports = { registerChatHandlers };
