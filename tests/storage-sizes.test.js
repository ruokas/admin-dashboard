import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_MAP } from '../sizes.js';
import { load } from '../storage.js';

const STORAGE_KEY = 'ed_dashboard_lt_v1';

function withFakeStorage(state, callback) {
  const fakeStorage = {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return JSON.stringify(state);
    },
  };
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = fakeStorage;
  try {
    return callback();
  } finally {
    globalThis.localStorage = originalStorage;
  }
}

test('link group custom dydžiai išsaugomi', () => {
  const customState = {
    groups: [
      {
        id: 'group-1',
        type: 'link',
        name: 'Test',
        width: 520,
        height: 410,
        wSize: 'lg',
        hSize: 'lg',
        sizePreset: { width: null, height: null },
        customWidth: 520,
        customHeight: 410,
        items: [],
      },
    ],
    title: 'Skydelis',
  };

  const state = withFakeStorage(customState, () => load());
  assert.equal(state.groups[0].width, 520);
  assert.equal(state.groups[0].height, 410);
  assert.equal(state.groups[0].wSize, 'lg');
  assert.equal(state.groups[0].hSize, 'lg');
  assert.equal(state.groups[0].sizePreset.width, null);
  assert.equal(state.groups[0].sizePreset.height, null);
  assert.equal(state.groups[0].customWidth, 520);
  assert.equal(state.groups[0].customHeight, 410);
});

test('trūkstami dydžiai nukrenta į iš anksto nustatytas reikšmes', () => {
  const fallbackState = {
    groups: [
      {
        id: 'group-2',
        type: 'link',
        name: 'Fallback',
        wSize: 'md',
        hSize: 'sm',
        items: [],
      },
    ],
    title: 'Skydelis',
  };

  const state = withFakeStorage(fallbackState, () => load());
  assert.equal(state.groups[0].width, SIZE_MAP.md.width);
  assert.equal(state.groups[0].height, SIZE_MAP.sm.height);
});

test('vertės arti šablono prilyginamos presetui', () => {
  const almostPresetState = {
    groups: [
      {
        id: 'group-3',
        type: 'link',
        name: 'Almost preset',
        width: SIZE_MAP.md.width + 1,
        height: SIZE_MAP.md.height - 1,
        wSize: 'md',
        hSize: 'md',
        items: [],
      },
    ],
    title: 'Skydelis',
  };

  const state = withFakeStorage(almostPresetState, () => load());
  assert.equal(state.groups[0].width, SIZE_MAP.md.width);
  assert.equal(state.groups[0].height, SIZE_MAP.md.height);
});
