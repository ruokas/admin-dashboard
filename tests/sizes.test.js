import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from '../sizes.js';

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

test('sizeFromWidth prisitaiko prie pakeistų dydžių', (t) => {
  const backup = Object.fromEntries(
    Object.entries(SIZE_MAP).map(([key, dims]) => [key, { ...dims }]),
  );

  t.after(() => {
    Object.entries(backup).forEach(([key, dims]) => {
      if (!SIZE_MAP[key]) SIZE_MAP[key] = {};
      Object.assign(SIZE_MAP[key], dims);
    });
  });

  SIZE_MAP.sm.width = 200;
  SIZE_MAP.md.width = 320;
  SIZE_MAP.lg.width = 520;

  assert.strictEqual(sizeFromWidth(180), 'sm');
  assert.strictEqual(sizeFromWidth(259), 'sm');
  assert.strictEqual(sizeFromWidth(260), 'md');
  assert.strictEqual(sizeFromWidth(419), 'md');
  assert.strictEqual(sizeFromWidth(420), 'lg');
});

test('sizeFromHeight prisitaiko prie pakeistų dydžių', (t) => {
  const backup = Object.fromEntries(
    Object.entries(SIZE_MAP).map(([key, dims]) => [key, { ...dims }]),
  );

  t.after(() => {
    Object.entries(backup).forEach(([key, dims]) => {
      if (!SIZE_MAP[key]) SIZE_MAP[key] = {};
      Object.assign(SIZE_MAP[key], dims);
    });
  });

  SIZE_MAP.sm.height = 200;
  SIZE_MAP.md.height = 340;
  SIZE_MAP.lg.height = 540;

  assert.strictEqual(sizeFromHeight(199), 'sm');
  assert.strictEqual(sizeFromHeight(269), 'sm');
  assert.strictEqual(sizeFromHeight(270), 'md');
  assert.strictEqual(sizeFromHeight(439), 'md');
  assert.strictEqual(sizeFromHeight(440), 'lg');
});
