import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../storage.js';

const STORAGE_KEY = 'ed_dashboard_lt_v1';

test('legacy notes duomenys migruojami į note tipo kortelę', () => {
  const reminderAt = Date.now() + 60000;
  const legacyState = {
    groups: [],
    notes: 'Svarbu patikrinti atsargas',
    notesTitle: 'Prioritetai',
    notesOpts: { size: 18, padding: 12 },
    notesBox: { width: 400, height: 260, wSize: 'md', hSize: 'md' },
    notesReminderMinutes: 5,
    notesReminderAt: reminderAt,
    notesPos: 0,
    title: 'Skydelis',
  };

  const fakeStorage = {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return JSON.stringify(legacyState);
    },
  };

  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = fakeStorage;

  const state = load();

  assert.ok(Array.isArray(state.groups), 'grupės turi būti masyvas');
  assert.equal(state.groups.length, 1, 'turi būti viena pastabų kortelė');
  const note = state.groups[0];
  assert.equal(note.type, 'note');
  assert.equal(note.text, legacyState.notes);
  assert.equal(note.title, legacyState.notesTitle);
  assert.equal(note.name, legacyState.notesTitle);
  assert.equal(note.fontSize, 18);
  assert.equal(note.padding, 12);
  assert.equal(note.color, '#fef08a');
  assert.equal(note.width, 400);
  assert.equal(note.height, 260);
  assert.equal(note.reminderMinutes, 5);
  assert.ok(Number.isFinite(note.reminderAt));
  assert.ok(!('notes' in state));

  globalThis.localStorage = originalStorage;
});
