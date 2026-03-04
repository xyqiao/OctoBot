import type { ThreadAssistantMessagePart } from "@assistant-ui/react";

const thinkTagPattern = /<\s*(\/?)\s*think\s*>/gi;

export type ParsedAssistantResponse = {
  reasoning: string;
  answer: string;
};

export function parseAssistantResponse(raw: string): ParsedAssistantResponse {
  if (!raw) {
    return { reasoning: "", answer: "" };
  }

  const reasoningChunks: string[] = [];
  const answerChunks: string[] = [];
  let cursor = 0;
  let inThink = false;
  thinkTagPattern.lastIndex = 0;

  for (const match of raw.matchAll(thinkTagPattern)) {
    const tag = match[0];
    const tagStart = match.index ?? cursor;
    const chunk = raw.slice(cursor, tagStart);

    if (chunk) {
      if (inThink) {
        reasoningChunks.push(chunk);
      } else {
        answerChunks.push(chunk);
      }
    }

    const isClosingTag = match[1] === "/";
    if (isClosingTag) {
      if (inThink) {
        inThink = false;
      } else {
        answerChunks.push(tag);
      }
    } else if (inThink) {
      reasoningChunks.push(tag);
    } else {
      inThink = true;
    }

    cursor = tagStart + tag.length;
  }

  const tail = raw.slice(cursor);
  if (tail) {
    if (inThink) {
      reasoningChunks.push(tail);
    } else {
      answerChunks.push(tail);
    }
  }

  return {
    reasoning: reasoningChunks.join(""),
    answer: answerChunks.join(""),
  };
}

export function toAssistantContentParts(raw: string): ThreadAssistantMessagePart[] {
  const parsed = parseAssistantResponse(raw);
  const parts: ThreadAssistantMessagePart[] = [];

  if (parsed.reasoning.trim().length > 0) {
    parts.push({ type: "reasoning", text: parsed.reasoning });
  }

  if (parsed.answer.length > 0 || parts.length === 0) {
    parts.push({ type: "text", text: parsed.answer });
  }

  return parts;
}
