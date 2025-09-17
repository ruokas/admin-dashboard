import test from 'node:test';
import assert from 'node:assert/strict';
import { countGroupItems } from '../stats.js';

test('countGroupItems ignores groups without items arrays', () => {
  const groups = [
    { id: 'a', items: [{ id: 1 }, { id: 2 }] },
    { id: 'b' },
    { id: 'c', items: null },
    { id: 'd', items: [{ id: 3 }, { id: 4 }, { id: 5 }] },
  ];
  assert.equal(countGroupItems(groups), 5);
});

test('countGroupItems returns 0 for invalid input', () => {
  assert.equal(countGroupItems(), 0);
  assert.equal(countGroupItems(null), 0);
});
