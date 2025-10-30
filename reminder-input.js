const REMINDER_MODE_NONE = 'none';
const REMINDER_MODE_DATETIME = 'datetime';
const REMINDER_MODE_MINUTES = 'minutes';

function coerceReminderMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }
  return NaN;
}

function parseReminderDate(value) {
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return NaN;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  return NaN;
}

export function parseReminderInput(data = {}) {
  const rawMode =
    typeof data.reminderMode === 'string' ? data.reminderMode.trim() : '';
  let mode;
  if (rawMode === REMINDER_MODE_MINUTES || rawMode === REMINDER_MODE_DATETIME) {
    mode = rawMode;
  } else if (rawMode === REMINDER_MODE_NONE) {
    mode = REMINDER_MODE_NONE;
  }

  const coercedMinutes = coerceReminderMinutes(data.reminderMinutes);
  const hasMinutes = Number.isFinite(coercedMinutes) && coercedMinutes > 0;

  if (!mode) {
    const parsedAt = parseReminderDate(data.reminderAt);
    if (Number.isFinite(parsedAt)) {
      mode = REMINDER_MODE_DATETIME;
    } else if (hasMinutes) {
      mode = REMINDER_MODE_MINUTES;
    } else {
      mode = REMINDER_MODE_NONE;
    }
  }

  let reminderMinutes = 0;
  if (mode === REMINDER_MODE_MINUTES) {
    reminderMinutes = hasMinutes ? coercedMinutes : 0;
    if (reminderMinutes <= 0) {
      reminderMinutes = 0;
      mode = REMINDER_MODE_NONE;
    }
  }

  let reminderAt = null;
  if (mode === REMINDER_MODE_DATETIME) {
    const parsedAt = parseReminderDate(data.reminderAt);
    if (Number.isFinite(parsedAt)) {
      reminderAt = parsedAt;
    } else {
      mode = REMINDER_MODE_NONE;
    }
  }

  return { mode, reminderMinutes, reminderAt };
}

export function hasReminderPayload(data = {}) {
  if (!data || typeof data !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(data, 'reminderMode') ||
    Object.prototype.hasOwnProperty.call(data, 'reminderMinutes') ||
    Object.prototype.hasOwnProperty.call(data, 'reminderAt')
  );
}

export {
  REMINDER_MODE_NONE,
  REMINDER_MODE_DATETIME,
  REMINDER_MODE_MINUTES,
};
