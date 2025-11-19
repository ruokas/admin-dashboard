import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let supabase = null;

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

export function initSupabase(config = {}) {
  const { url, anonKey } = resolveConfig(config);
  if (!url || !anonKey) {
    console.warn(
      'Supabase konfigūracija nepilna – klientas nebuvo sukurtas (naudojamas tik vietinis režimas).'
    );
    supabase = null;
    return null;
  }
  supabase = createClient(url, anonKey);
  return supabase;
}

export async function signInWithOtp(email) {
  const client = ensureClient();
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (!normalizedEmail) {
    throw new Error('El. pašto adresas privalomas OTP prisijungimui.');
  }
  const { data, error } = await client.auth.signInWithOtp({ email: normalizedEmail });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = ensureClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  return true;
}

export function getSession() {
  const client = ensureClient();
  return client.auth.getSession();
}

export function onAuthStateChange(callback) {
  const client = ensureClient();
  if (typeof callback !== 'function') {
    throw new Error('Auth būsenos stebėjimui būtina nurodyti funkciją.');
  }
  return client.auth.onAuthStateChange(callback);
}

export async function fetchSettings() {
  const client = ensureClient();
  const { data, error } = await client
    .from('ed_dash_settings')
    .select('id, user_id, state_json, updated_at')
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }
  return data;
}

export async function upsertSettings(payload = {}) {
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
  signInWithOtp,
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
