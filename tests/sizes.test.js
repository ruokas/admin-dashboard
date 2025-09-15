import test from 'node:test';
import assert from 'node:assert/strict';

import { sizeFromWidth, sizeFromHeight } from '../sizes.js';

test('sizeFromWidth klasifikacijos', () => {
  assert.strictEqual(sizeFromWidth(240), 'sm');
  assert.strictEqual(sizeFromWidth(299), 'sm');
  assert.strictEqual(sizeFromWidth(300), 'md');
  assert.strictEqual(sizeFromWidth(419), 'md');
  assert.strictEqual(sizeFromWidth(420), 'lg');
  assert.strictEqual(sizeFromWidth(600), 'lg');
});

test('sizeFromHeight klasifikacijos', () => {
  assert.strictEqual(sizeFromHeight(240), 'sm');
  assert.strictEqual(sizeFromHeight(299), 'sm');
  assert.strictEqual(sizeFromHeight(300), 'md');
  assert.strictEqual(sizeFromHeight(419), 'md');
  assert.strictEqual(sizeFromHeight(420), 'lg');
  assert.strictEqual(sizeFromHeight(600), 'lg');
});
