class TaskDispatcher {
  constructor(options) {
    this.storage = options.storage;
    this.workerManager = options.workerManager;
    this.intervalMs = Number.isFinite(Number(options.intervalMs))
      ? Math.max(300, Math.floor(Number(options.intervalMs)))
      : 1_000;
    this.leaseMs = Number.isFinite(Number(options.leaseMs))
      ? Math.max(1_000, Math.floor(Number(options.leaseMs)))
      : 15_000;
    this.logger = options.logger || console;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) {
      return false;
    }

    this.workerManager.start();
    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    this.tick();
    return true;
  }

  stop() {
    if (!this.timer) {
      this.workerManager.stop();
      return false;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.workerManager.stop();
    return true;
  }

  cancelRun(runId, reason) {
    return this.workerManager.cancelRun(runId, reason);
  }

  tick() {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      while (this.workerManager.hasCapacity()) {
        const lease = this.storage.leaseNextQueuedRun(
          this.workerManager.workerId,
          this.leaseMs,
        );
        if (!lease) {
          break;
        }

        const accepted = this.workerManager.dispatchRun(lease);
        if (!accepted) {
          this.storage.releaseQueuedRunLease(lease.runId);
          break;
        }
      }
    } catch (error) {
      this.logger.error("[task-dispatcher] tick failed:", error);
    } finally {
      this.running = false;
    }
  }
}

module.exports = {
  TaskDispatcher,
};
