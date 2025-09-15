import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportJson } from '../exporter.js';

test('exportJson naudoja būsenos pavadinimą faile', () => {
  const fakeNow = 1700000000000;
  const state = { title: 'pagalba', groups: [] };
  let anchor;
  let createdBlob;
  const doc = {
    createElement(tag) {
      assert.equal(tag, 'a');
      anchor = {
        click() {
          anchor.clicked = true;
        },
      };
      return anchor;
    },
  };
  const urlObj = {
    createObjectURL(blob) {
      createdBlob = blob;
      return 'blob:fake';
    },
    revokeObjectURL(href) {
      this.revokedHref = href;
    },
  };

  const result = exportJson(state, {
    document: doc,
    URL: urlObj,
    now: () => fakeNow,
  });

  assert.equal(result, anchor);
  assert.ok(createdBlob instanceof Blob, 'turi būti sukurtas Blob');
  assert.equal(result.download, `pagalba-${fakeNow}.json`);
  assert.equal(anchor.clicked, true, 'turi būti iškviestas click()');
  assert.equal(urlObj.revokedHref, 'blob:fake');
});

test('exportJson naudoja numatytą pavadinimą, jei nėra antraštės', () => {
  const fakeNow = 1700000000999;
  const state = { groups: [] };
  let anchor;
  const doc = {
    createElement() {
      anchor = {
        click() {
          anchor.clicked = true;
        },
      };
      return anchor;
    },
  };
  const urlObj = {
    createObjectURL() {
      return 'blob:fallback';
    },
    revokeObjectURL() {},
  };

  const result = exportJson(state, {
    document: doc,
    URL: urlObj,
    now: () => fakeNow,
  });

  assert.equal(result.download, `smp-skydas-${fakeNow}.json`);
  assert.equal(anchor.clicked, true);
});
