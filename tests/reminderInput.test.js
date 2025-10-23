import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReminderInput,
  REMINDER_MODE_MINUTES,
  REMINDER_MODE_NONE,
  REMINDER_MODE_DATETIME,
} from '../reminder-input.js';

test('parseReminderInput accepts numeric string minutes', () => {
  const parsed = parseReminderInput({ reminderMinutes: '5' });
  assert.equal(parsed.mode, REMINDER_MODE_MINUTES);
  assert.equal(parsed.reminderMinutes, 5);
  assert.equal(parsed.reminderAt, null);
});

test('parseReminderInput treats blank minutes as no reminder', () => {
  const parsed = parseReminderInput({ reminderMinutes: '   ' });
  assert.equal(parsed.mode, REMINDER_MODE_NONE);
  assert.equal(parsed.reminderMinutes, 0);
  assert.equal(parsed.reminderAt, null);
});

test('parseReminderInput keeps explicit datetime mode', () => {
  const parsed = parseReminderInput({
    reminderMode: REMINDER_MODE_DATETIME,
    reminderAt: '2030-01-01T12:00',
  });
  assert.equal(parsed.mode, REMINDER_MODE_DATETIME);
  assert.ok(Number.isFinite(parsed.reminderAt));
  assert.equal(parsed.reminderMinutes, 0);
});

test('invalid minutes when mode forced to minutes fall back to none', () => {
  const parsed = parseReminderInput({
    reminderMode: REMINDER_MODE_MINUTES,
    reminderMinutes: '0',
  });
  assert.equal(parsed.mode, REMINDER_MODE_NONE);
  assert.equal(parsed.reminderMinutes, 0);
});
