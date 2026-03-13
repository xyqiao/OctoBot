/**
 * Event handling utilities for runtime layer
 */

import { toText, summarizeJson } from "./textUtils.mjs";

export function extractToolCallsFromEvent(event) {
  const output = event?.data?.output;
  const message = output?.message || output?.generations?.[0]?.message || output;
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : Array.isArray(output?.tool_calls)
      ? output.tool_calls
      : [];
  return toolCalls;
}

export function extractEventTextChunk(event) {
  const output = event?.data?.output;
  const chunk = output?.chunk;
  if (!chunk) {
    return "";
  }
  return toText(chunk?.content || chunk);
}

export function extractEventFinalText(event) {
  const output = event?.data?.output;
  const message = output?.message || output?.generations?.[0]?.message || output;
  return toText(message?.content || message);
}

export function buildToolEventLog(event) {
  const name = toText(event?.name || "").trim() || "unknown_tool";
  const input = event?.data?.input ? event.data.input : {};
  const output = event?.data?.output;

  const inputSummary = summarizeJson(input, 120);
  const outputSummary = output ? summarizeJson(output, 120) : "";

  return {
    name,
    input: inputSummary,
    output: outputSummary,
    signature: `${name}:${inputSummary}`,
  };
}

export function eventHasTag(event, tag) {
  const tags = event?.tags || [];
  return Array.isArray(tags) && tags.includes(tag);
}

export function pushLog(logs, onLog, text) {
  logs.push(text);
  onLog?.(text);
}
