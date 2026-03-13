function createAbortError() {
  const error = new Error("RUN_ABORTED");
  error.code = "RUN_ABORTED";
  return error;
}

function assertNotAborted(context) {
  if (context?.isAborted?.()) {
    throw createAbortError();
  }
}

function emitToolLog(context, message, meta = {}) {
  if (typeof context?.onLog === "function") {
    context.onLog(message, meta);
  }
}

module.exports = {
  createAbortError,
  assertNotAborted,
  emitToolLog,
};
