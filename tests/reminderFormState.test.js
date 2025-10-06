import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReminderFormState,
  updateReminderFormState,
  resetReminderFormState,
  setReminderFormState,
  reminderFormDefaults,
} from '../reminder-form-state.js';

const DEFAULT_STATE = reminderFormDefaults();

test('reminder form state resets to defaults', () => {
  updateReminderFormState({ editingId: 'foo', values: { a: 1 }, error: 'x' });
  const resetState = resetReminderFormState();
  assert.deepEqual(resetState, DEFAULT_STATE);
  assert.equal(getReminderFormState().editingId, null);
});

test('updateReminderFormState merges partial updates', () => {
  resetReminderFormState();
  const firstRef = getReminderFormState();
  updateReminderFormState({ editingId: 'abc' });
  const afterFirstUpdate = getReminderFormState();
  assert.notStrictEqual(firstRef, afterFirstUpdate);
  assert.equal(afterFirstUpdate.editingId, 'abc');
  assert.equal(afterFirstUpdate.error, '');
  const afterSecondUpdate = updateReminderFormState({ error: 'klaida' });
  assert.equal(afterSecondUpdate.editingId, 'abc');
  assert.equal(afterSecondUpdate.error, 'klaida');
});

test('setReminderFormState replaces state snapshot', () => {
  resetReminderFormState();
  const snapshot = {
    editingId: 'xyz',
    values: { title: 'Testas' },
    error: 'klaida',
  };
  setReminderFormState(snapshot);
  const current = getReminderFormState();
  assert.deepEqual(current, snapshot);
  setReminderFormState(null);
  assert.deepEqual(getReminderFormState(), DEFAULT_STATE);
});
