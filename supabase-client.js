function resolveTestMock(methodName) {
  const mock = globalThis.__supabaseClientMock;
  if (mock && typeof mock[methodName] === 'function') {
    return mock[methodName];
  }
  return null;
}

let supabase = null;
let supabaseModulePromise = null;

async function loadSupabaseModule() {
  if (!supabaseModulePromise) {
    supabaseModulePromise = import('https://esm.sh/@supabase/supabase-js@2').catch(
      (error) => {
        supabaseModulePromise = null;
        throw error;
      }
    );
  }
  return supabaseModulePromise;
}

function resolveConfig(input = {}) {
  if (!input || typeof input !== 'object') {
    return { url: null, anonKey: null };
  }
  const url =
    input.url ||
    input.supabaseUrl ||
    input.SUPABASE_URL ||
    null;
  const anonKey =
    input.anonKey ||
    input.supabaseAnonKey ||
    input.SUPABASE_ANON_KEY ||
    null;
  return { url, anonKey };
}

function ensureClient() {
  if (!supabase) {
    throw new Error(
      'Supabase klientas neinicijuotas. Patikrinkite supabase-config.js nustatymus.'
    );
  }
  return supabase;
}

export async function initSupabase(config = {}) {
  const mockFn = resolveTestMock('initSupabase');
  if (mockFn) return mockFn(config);
  const { url, anonKey } = resolveConfig(config);
  if (!url || !anonKey) {
    console.warn(
      'Supabase konfigūracija nepilna – klientas nebuvo sukurtas (naudojamas tik vietinis režimas).'
    );
    supabase = null;
    return null;
  }
  const module = await loadSupabaseModule();
  supabase = module.createClient(url, anonKey);
  return supabase;
}

export async function signInWithPassword(email, password) {
  const mockFn = resolveTestMock('signInWithPassword');
  if (mockFn) return mockFn(email, password);
  const client = ensureClient();
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  const normalizedPassword = typeof password === 'string' ? password : '';
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('El. paštas ir slaptažodis yra privalomi.');
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password: normalizedPassword,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const mockFn = resolveTestMock('signOut');
  if (mockFn) return mockFn();
  const client = ensureClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  return true;
}

export function getSession() {
  const mockFn = resolveTestMock('getSession');
  if (mockFn) return mockFn();
  const client = ensureClient();
  return client.auth.getSession();
}

export function onAuthStateChange(callback) {
  const mockFn = resolveTestMock('onAuthStateChange');
  if (mockFn) return mockFn(callback);
  const client = ensureClient();
  if (typeof callback !== 'function') {
    throw new Error('Auth būsenos stebėjimui būtina nurodyti funkciją.');
  }
  return client.auth.onAuthStateChange(callback);
}

export async function fetchSettings() {
  const mockFn = resolveTestMock('fetchSettings');
  if (mockFn) return mockFn();
  const client = ensureClient();
  const { data, error } = await client
    .from('ed_dash_settings')
    .select('id, user_id, state_json, updated_at')
    .order('updated_at', { ascending: false, nullsLast: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }
  return data;
}

export async function upsertSettings(payload = {}) {
  const mockFn = resolveTestMock('upsertSettings');
  if (mockFn) return mockFn(payload);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Supabase išsaugojimui būtinas objekto tipo payload.');
  }
  const client = ensureClient();
  const { data, error } = await client
    .from('ed_dash_settings')
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

const publicApi = {
  initSupabase,
  signInWithPassword,
  signOut,
  getSession,
  onAuthStateChange,
  fetchSettings,
  upsertSettings,
};

if (typeof window !== 'undefined') {
  window.supabaseClient = publicApi;
}

export default publicApi;
