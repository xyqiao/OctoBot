/**
 * Logger utility for runtime layer
 */

export function pushLog(logs, onLog, text) {
  logs.push(text);
  onLog?.(text);
}
