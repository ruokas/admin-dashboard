import { test } from 'node:test';
import assert from 'node:assert/strict';

const supabaseCalls = { upsert: 0 };

const supabaseMock = {
  initSupabase: async () => ({}),
  signInWithPassword: async () => ({}),
  signOut: async () => true,
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  fetchSettings: async () => ({
    id: 'row-1',
    user_id: 'user-1',
    state_json: null,
    updated_at: new Date().toISOString(),
  }),
  upsertSettings: async (payload) => {
    supabaseCalls.upsert += 1;
    return {
      id: payload.id || 'row-1',
      updated_at: payload.updated_at || new Date().toISOString(),
    };
  },
};

function createStubElement() {
  const noop = () => {};
  const base = {
    addEventListener: noop,
    removeEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: noop,
    remove: noop,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop },
    focus: noop,
    blur: noop,
    click: noop,
    value: '',
    innerHTML: '',
    textContent: '',
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
  });
}

function setupDomStubs() {
  const element = createStubElement();
  const doc = {
    documentElement: { classList: element.classList },
    body: element,
    createElement: () => createStubElement(),
    createDocumentFragment: () => createStubElement(),
    getElementById: () => createStubElement(),
    querySelector: () => createStubElement(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.document = doc;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getSelection: () => ({ removeAllRanges: () => {} }),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    navigator: { language: 'lt-LT' },
  };
  globalThis.DOMParser = class {
    parseFromString() {
      return { querySelector: () => null };
    }
  };
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  globalThis.HTMLElement = class {};
  globalThis.requestAnimationFrame = (cb) => {
    if (typeof cb === 'function') cb();
    return 0;
  };
}

function createMinimalState() {
  return {
    groups: [],
    customReminders: [],
    remindersCard: {
      enabled: false,
      title: '',
      wSize: 'md',
      hSize: 'md',
      showQuick: false,
      width: 360,
      height: 360,
    },
    meta: {},
  };
}

async function loadAppModule() {
  if (!globalThis.__appModule) {
    setupDomStubs();
    globalThis.__supabaseClientMock = supabaseMock;
    globalThis.__appModule = await import('../app.js');
  }
  return globalThis.__appModule;
}

test('persistState nesiunčia į Supabase neprisijungus', async (t) => {
  supabaseCalls.upsert = 0;
  try {
    const app = await loadAppModule();
    const hooks = app.__testHooks;

    hooks.resetRemoteSaveForTest();
    hooks.setSupabaseReadyForTest(true);
    hooks.setAuthSessionForTest(null);
    hooks.setStateForTest(createMinimalState());

    hooks.persistStateForTest();
    assert.equal(hooks.getRemoteSaveTimerForTest(), null);
    await hooks.flushRemoteSaveForTest();
    assert.equal(supabaseCalls.upsert, 0);
  } finally {
    supabaseCalls.upsert = 0;
  }
});

test('persistState kviečia nuotolinį išsaugojimą, kai vartotojas prisijungęs', async (t) => {
  supabaseCalls.upsert = 0;
  try {
    const app = await loadAppModule();
    const hooks = app.__testHooks;

    hooks.resetRemoteSaveForTest();
    hooks.setSupabaseReadyForTest(true);
    hooks.setAuthSessionForTest({ user: { id: 'user-99', email: 'test@example.com' } });
    hooks.setStateForTest(createMinimalState());

    hooks.persistStateForTest();
    assert.ok(hooks.getRemoteSaveTimerForTest());
    await hooks.flushRemoteSaveForTest();
    assert.equal(supabaseCalls.upsert, 1);
  } finally {
    supabaseCalls.upsert = 0;
  }
});

test('syncLatestRemoteState parsiunčia string state_json su preferRemote', async () => {
  const originalFetch = supabaseMock.fetchSettings;
  const remoteSnapshot = {
    ...createMinimalState(),
    groups: [{ id: 'g-1', title: 'Nuotolinis', items: [] }],
    title: 'Nuotolinis pavadinimas',
    updatedAt: Date.now() - 5_000,
  };
  supabaseMock.fetchSettings = async () => ({
    id: 'row-2',
    user_id: 'user-2',
    state_json: JSON.stringify(remoteSnapshot),
    updated_at: new Date(remoteSnapshot.updatedAt).toISOString(),
  });

  try {
    const app = await loadAppModule();
    const hooks = app.__testHooks;
    hooks.setSupabaseReadyForTest(true);
    hooks.setAuthSessionForTest({ user: { id: 'user-2', email: 'remote@example.com' } });
    hooks.setStateForTest({
      ...createMinimalState(),
      updatedAt: Date.now(),
      meta: {},
    });

    const result = await hooks.syncLatestRemoteStateForTest({ preferRemote: true });
    assert.equal(result.applied, true);
    const nextState = hooks.getStateForTest();
    assert.equal(nextState.title, remoteSnapshot.title);
    assert.deepEqual(nextState.groups, remoteSnapshot.groups);
    assert.equal(nextState.meta.remoteId, 'row-2');
  } finally {
    supabaseMock.fetchSettings = originalFetch;
  }
});

test('syncLatestRemoteState išskleidžia dvigubai užkoduotą state_json', async () => {
  const originalFetch = supabaseMock.fetchSettings;
  const remoteSnapshot = {
    ...createMinimalState(),
    groups: [{ id: 'g-9', title: 'Dviguba', items: [] }],
    title: 'Dvigubai užkoduota',
    updatedAt: Date.now() - 10_000,
  };
  supabaseMock.fetchSettings = async () => ({
    id: 'row-9',
    user_id: 'user-9',
    state_json: JSON.stringify(JSON.stringify(remoteSnapshot)),
    updated_at: new Date(remoteSnapshot.updatedAt).toISOString(),
  });

  try {
    const app = await loadAppModule();
    const hooks = app.__testHooks;
    hooks.setSupabaseReadyForTest(true);
    hooks.setAuthSessionForTest({ user: { id: 'user-9', email: 'double@example.com' } });
    hooks.setStateForTest({
      ...createMinimalState(),
      updatedAt: Date.now(),
      meta: {},
    });

    const result = await hooks.syncLatestRemoteStateForTest({ preferRemote: true });
    assert.equal(result.applied, true);
    const nextState = hooks.getStateForTest();
    assert.equal(nextState.title, remoteSnapshot.title);
    assert.deepEqual(nextState.groups, remoteSnapshot.groups);
    assert.equal(nextState.meta.remoteId, 'row-9');
  } finally {
    supabaseMock.fetchSettings = originalFetch;
  }
});

test('syncLatestRemoteState išskleidžia trigubai užkoduotą state_json', async () => {
  const originalFetch = supabaseMock.fetchSettings;
  const remoteSnapshot = {
    ...createMinimalState(),
    groups: [{ id: 'g-10', title: 'Triguba', items: [] }],
    title: 'Trigubai užkoduota',
    updatedAt: Date.now() - 15_000,
  };
  supabaseMock.fetchSettings = async () => ({
    id: 'row-10',
    user_id: 'user-10',
    state_json: JSON.stringify(JSON.stringify(JSON.stringify(remoteSnapshot))),
    updated_at: new Date(remoteSnapshot.updatedAt).toISOString(),
  });

  try {
    const app = await loadAppModule();
    const hooks = app.__testHooks;
    hooks.setSupabaseReadyForTest(true);
    hooks.setAuthSessionForTest({ user: { id: 'user-10', email: 'triple@example.com' } });
    hooks.setStateForTest({
      ...createMinimalState(),
      updatedAt: Date.now(),
      meta: {},
    });

    const result = await hooks.syncLatestRemoteStateForTest({ preferRemote: true });
    assert.equal(result.applied, true);
    const nextState = hooks.getStateForTest();
    assert.equal(nextState.title, remoteSnapshot.title);
    assert.deepEqual(nextState.groups, remoteSnapshot.groups);
    assert.equal(nextState.meta.remoteId, 'row-10');
  } finally {
    supabaseMock.fetchSettings = originalFetch;
  }
});
