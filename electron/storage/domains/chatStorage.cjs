/**
 * Chat-related storage operations
 */

const { now, makeId, summarizeChatTitle } = require("../utils/common.cjs");
const { toChat, toMessage, toChatMemory } = require("../utils/transformers.cjs");

function createChatStorage(db, queries) {
  function listChats() {
    return queries.listChats.all().map(toChat);
  }

  function createChat() {
    const chat = {
      id: makeId("chat"),
      title: "新对话",
      updatedAt: now(),
    };

    queries.insertChat.run(chat);
    return chat;
  }

  function renameChat(chatId, title) {
    const normalizedTitle = String(title ?? "").trim();
    if (!normalizedTitle) {
      return false;
    }

    const updatedAt = now();
    const result = queries.updateChatTitle.run(
      normalizedTitle,
      updatedAt,
      chatId,
    );
    return result.changes > 0;
  }

  function deleteChat(chatId) {
    const result = queries.deleteChat.run(chatId);
    return result.changes > 0;
  }

  function getChatMessages(chatId) {
    return queries.listMessagesByChat.all(chatId).map(toMessage);
  }

  function getChatMemory(chatId) {
    return toChatMemory(queries.getChatMemoryByChatId.get(chatId));
  }

  function saveChatMemory(memory) {
    const normalized = {
      chatId: String(memory?.chatId || "").trim(),
      summaryText: String(memory?.summaryText || "").trim(),
      coveredUntilTimestamp: Number(memory?.coveredUntilTimestamp) || 0,
      updatedAt: Number(memory?.updatedAt) || Date.now(),
    };

    if (!normalized.chatId) {
      return false;
    }

    queries.upsertChatMemory.run(normalized);
    return true;
  }

  function appendMessage(message) {
    const txn = db.transaction(() => {
      const chatRow =
        message.role === "user"
          ? queries.getChatById.get(message.chatId)
          : null;
      const shouldRetitle =
        message.role === "user" &&
        chatRow?.title === "新对话" &&
        queries.countUserMessagesByChat.get(message.chatId).count === 0;

      queries.insertMessage.run(message);

      const updatedAt = Date.now();
      queries.updateChatTime.run(updatedAt, message.chatId);

      if (shouldRetitle) {
        const generatedTitle = summarizeChatTitle(message.content);
        queries.updateChatTitle.run(generatedTitle, updatedAt, message.chatId);
      }
    });
    txn();
    return true;
  }

  return {
    listChats,
    createChat,
    renameChat,
    deleteChat,
    getChatMessages,
    getChatMemory,
    saveChatMemory,
    appendMessage,
  };
}

module.exports = {
  createChatStorage,
};
