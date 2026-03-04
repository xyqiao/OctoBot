class TaskScheduler {
  constructor(options) {
    this.storage = options.storage;
    this.intervalMs = Number.isFinite(Number(options.intervalMs))
      ? Math.max(1_000, Math.floor(Number(options.intervalMs)))
      : 5_000;
    this.batchSize = Number.isFinite(Number(options.batchSize))
      ? Math.max(1, Math.floor(Number(options.batchSize)))
      : 20;
    this.logger = options.logger || console;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) {
      return false;
    }

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    this.tick();
    return true;
  }

  stop() {
    if (!this.timer) {
      return false;
    }

    clearInterval(this.timer);
    this.timer = null;
    return true;
  }

  tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const queuedRuns = this.storage.enqueueDueScheduledRuns(this.batchSize);
      if (queuedRuns.length > 0) {
        this.logger.info(
          `[task-scheduler] queued ${queuedRuns.length} scheduled runs.`,
        );
      }
    } catch (error) {
      this.logger.error("[task-scheduler] tick failed:", error);
    } finally {
      this.running = false;
    }
  }
}

module.exports = {
  TaskScheduler,
};

