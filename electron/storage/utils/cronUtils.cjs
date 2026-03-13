/**
 * Cron scheduling utilities
 */

const {
  normalizeScheduleType,
  normalizeOptionalText,
  normalizeTimestamp,
  normalizeTimezone,
  normalizeNonEmptyText,
} = require("./validators.cjs");

function normalizeTaskSchedule(input, createdAt) {
  const schedule = input && typeof input === "object" ? input : {};
  const type = normalizeScheduleType(schedule.type);
  const timezone = normalizeTimezone(schedule.timezone);

  if (type === "once") {
    const runAt = normalizeTimestamp(schedule.runAt, createdAt);
    return {
      type,
      runAt,
      cronExpr: null,
      timezone,
      nextRunAt: runAt,
      lastRunAt: null,
    };
  }

  if (type === "cron") {
    const cronExpr = normalizeOptionalText(schedule.cronExpr);
    const nextRunAt = cronExpr
      ? computeNextCronRunAt(cronExpr, createdAt)
      : null;
    return {
      type,
      runAt: null,
      cronExpr,
      timezone,
      nextRunAt,
      lastRunAt: null,
    };
  }

  return {
    type: "manual",
    runAt: null,
    cronExpr: null,
    timezone,
    nextRunAt: null,
    lastRunAt: null,
  };
}

function nextMinuteBoundary(timestamp) {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  return date.getTime();
}

function withMinute(date, minute) {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  copy.setMinutes(minute);
  return copy;
}

function withHourMinute(date, hour, minute) {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

function computeNextCronRunAt(cronExpr, fromTimestamp) {
  const expr = String(cronExpr ?? "").trim();
  if (!expr) {
    return null;
  }

  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
    return null;
  }

  const nowDate = new Date(fromTimestamp);

  // Supports: */N * * * *
  if (/^\*\/\d+$/.test(minutePart) && hourPart === "*") {
    const step = Number(minutePart.slice(2));
    if (!Number.isInteger(step) || step < 1 || step > 59) {
      return null;
    }

    const candidate = nextMinuteBoundary(fromTimestamp);
    const candidateDate = new Date(candidate);
    const minute = candidateDate.getMinutes();
    const delta = minute % step === 0 ? 0 : step - (minute % step);
    candidateDate.setMinutes(minute + delta, 0, 0);
    return candidateDate.getTime();
  }

  // Supports: M * * * *
  if (/^\d{1,2}$/.test(minutePart) && hourPart === "*") {
    const minute = Number(minutePart);
    if (minute < 0 || minute > 59) {
      return null;
    }
    let candidate = withMinute(nowDate, minute);
    if (candidate.getTime() <= fromTimestamp) {
      candidate = new Date(candidate.getTime() + 60 * 60_000);
      candidate = withMinute(candidate, minute);
    }
    return candidate.getTime();
  }

  // Supports: M H * * *
  if (/^\d{1,2}$/.test(minutePart) && /^\d{1,2}$/.test(hourPart)) {
    const minute = Number(minutePart);
    const hour = Number(hourPart);
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
      return null;
    }
    let candidate = withHourMinute(nowDate, hour, minute);
    if (candidate.getTime() <= fromTimestamp) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
      candidate = withHourMinute(candidate, hour, minute);
    }
    return candidate.getTime();
  }

  return null;
}

module.exports = {
  normalizeTaskSchedule,
  computeNextCronRunAt,
};
