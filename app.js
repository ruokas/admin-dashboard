import {
  initSupabase,
  signInWithPassword,
  signOut as supabaseSignOut,
  getSession,
  onAuthStateChange,
  fetchSettings,
  upsertSettings,
} from './supabase-client.js';
import { load, save, seed, touchState } from './storage.js';
import {
  render,
  updateEditingUI,
  toSheetEmbed,
  formatRemoteSyncStatus,
} from './render.js';
import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';
import {
  remindersDialog,
  groupFormDialog,
  itemFormDialog,
  chartFormDialog,
  confirmDialog as confirmDlg,
  notesDialog,
  helpDialog,
} from './forms.js';
import { I } from './icons.js';
import { Tlt } from './i18n.js';
import { createReminderManager } from './reminders.js';
import {
  getReminderFormState,
  resetReminderFormState,
  updateReminderFormState,
} from './reminder-form-state.js';
import {
  REMINDER_MODE_DATETIME,
  REMINDER_MODE_MINUTES,
  parseReminderInput,
  hasReminderPayload,
} from './reminder-input.js';
import { getActiveTheme, resolveChartThemeUrl } from './theme-utils.js';

const T = Tlt;
// Hook future English localisation: fill T.en when translations are ready.
T.en = T.en || {};

const DEFAULT_TITLE = 'Admin skydelis';

const REMINDER_SNOOZE_MINUTES = 5;
const REMINDER_QUICK_MINUTES = [5, 10, 15, 30];
const NOTE_DEFAULT_COLOR = '#fef08a';
const NOTE_DEFAULT_FONT = 20;
const NOTE_DEFAULT_PADDING = 20;
const MAX_ICON_IMAGE_BYTES = 200 * 1024; // 200 KB
const MAX_ICON_IMAGE_LENGTH = Math.ceil((MAX_ICON_IMAGE_BYTES / 3) * 4) + 512;
const ICON_IMAGE_ACCEPT_PREFIX = 'data:image/';
const AUTH_EMAIL_STORAGE_KEY = 'ed_dash_last_email';
const REMOTE_SAVE_DEBOUNCE_MS = 2000;
const REMOTE_SAVE_ERROR_MESSAGE = 'Nepavyko išsaugoti – bandykite rankiniu būdu';
const LOGIN_GATE_DELAY_MS = 700;

let supabaseReady = false;

const supabaseConfigPromise = import('./supabase-config.js')
  .then((module) => {
    const url = module?.SUPABASE_URL;
    const anonKey = module?.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.warn(
        'Supabase konfigūracija nepilna – naudokite vietinį režimą arba užpildykite supabase-config.js.'
      );
      return null;
    }
    return { url, anonKey };
  })
  .catch((error) => {
    console.warn(
      'Supabase konfigūracijos failas nerastas. Naudojamas tik vietinis režimas.',
      error
    );
    return null;
  });
const supabaseInitPromise = supabaseConfigPromise
  .then(async (config) => {
    if (!config) {
      updateAuthButtonState();
      setLoginGateActive(false);
      return false;
    }
    try {
      await initSupabase({ url: config.url, anonKey: config.anonKey });
      supabaseReady = true;
      setLoginGateActive(true);
      updateAuthButtonState();
      subscribeToAuthChanges();
      return true;
    } catch (error) {
      supabaseReady = false;
      updateAuthButtonState();
      setLoginGateActive(false);
      console.error('Nepavyko inicijuoti Supabase kliento:', error);
      setSyncStatus(T.authStatusError || 'Nepavyko prisijungti. Bandykite dar kartą.', {
        variant: 'error',
      });
      return false;
    }
  })
  .catch((error) => {
    console.error('Supabase inicijavimo klaida:', error);
    setLoginGateActive(false);
    return false;
  });

function sanitizeIconImage(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith(ICON_IMAGE_ACCEPT_PREFIX)) return '';
  if (trimmed.length > MAX_ICON_IMAGE_LENGTH) return '';
  return trimmed;
}

function ensureStateMeta(targetState) {
  const source = targetState && typeof targetState === 'object' ? targetState : state;
  if (!source || typeof source !== 'object') return {};
  if (!source.meta || typeof source.meta !== 'object') {
    source.meta = {};
  }
  if (!('remoteUpdatedAt' in source.meta)) {
    source.meta.remoteUpdatedAt = null;
  }
  if (!('remoteId' in source.meta)) {
    source.meta.remoteId = null;
  }
  return source.meta;
}

function resolveAuthUserId() {
  const userId = authSession?.user?.id;
  if (typeof userId === 'string' && userId) {
    return userId;
  }
  return null;
}

function formatDateTimeLocal(ts) {
  if (!Number.isFinite(ts)) return '';
  const date = new Date(ts);
  const pad = (val) => String(val).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeNoteColor(value) {
  if (typeof value !== 'string') return NOTE_DEFAULT_COLOR;
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  return NOTE_DEFAULT_COLOR;
}

function computeSizeMetadata(width, height) {
  const widthMatch = Object.entries(SIZE_MAP).find(([, dims]) => {
    const preset = Number.isFinite(dims?.width) ? Math.round(dims.width) : NaN;
    return Number.isFinite(preset) && Number.isFinite(width) && Math.round(width) === preset;
  });
  const heightMatch = Object.entries(SIZE_MAP).find(([, dims]) => {
    const preset = Number.isFinite(dims?.height) ? Math.round(dims.height) : NaN;
    return Number.isFinite(preset) && Number.isFinite(height) && Math.round(height) === preset;
  });
  return {
    sizePreset: {
      width: widthMatch ? widthMatch[0] : null,
      height: heightMatch ? heightMatch[0] : null,
    },
    customWidth: widthMatch ? null : Number.isFinite(width) ? Math.round(width) : null,
    customHeight: heightMatch ? null : Number.isFinite(height) ? Math.round(height) : null,
  };
}

function applySizeMetadata(target, width, height) {
  if (!target) return;
  const meta = computeSizeMetadata(width, height);
  target.sizePreset = meta.sizePreset;
  if (meta.customWidth != null) target.customWidth = meta.customWidth;
  else delete target.customWidth;
  if (meta.customHeight != null) target.customHeight = meta.customHeight;
  else delete target.customHeight;
  return meta;
}

const editBtn = document.getElementById('editBtn');
const syncStatusEl = document.getElementById('syncStatus');
const authToggleBtn = document.getElementById('auth-toggle');
const authModalEl = document.getElementById('authModal');
const authModalDialog = authModalEl?.querySelector('[data-modal-dialog]') ?? null;
const authCloseBtn = document.getElementById('authClose');
const authFormEl = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authModalDescription = document.getElementById('authModalDescription');
const authModalTitle = document.getElementById('authModalTitle');
const authMessageEl = document.getElementById('authMessage');
const authSubmitBtn = document.getElementById('authSubmit');
const authClearBtn = document.getElementById('authClear');
const authEmailLabel = authFormEl?.querySelector("label[for='authEmail']") ?? null;
const authPasswordLabel = authFormEl?.querySelector("label[for='authPassword']") ?? null;
if (authModalDialog && !authModalDialog.hasAttribute('tabindex')) {
  authModalDialog.setAttribute('tabindex', '-1');
}
const searchEl = document.getElementById('q');
const searchLabelEl = document.getElementById('searchLabel');
const themeBtn = document.getElementById('themeBtn');
const remindersBtn = document.getElementById('remindersBtn');
const addRemindersBtn = document.getElementById('addRemindersCard');
const pageTitleEl = document.getElementById('pageTitle');
const pageIconEl = document.getElementById('pageIcon');
const addMenu = document.getElementById('addMenu');
const addMenuList = document.getElementById('addMenuList');
const addBtn = document.getElementById('addBtn');
const addMenuBackdrop = addMenu?.querySelector('[data-menu-backdrop]') ?? null;
const helpBtn = document.getElementById('helpBtn');
const searchClearBtn = document.getElementById('searchClear');
const pageIconImageBtn = document.getElementById('pageIconImageBtn');
const pageIconClearBtn = document.getElementById('pageIconClearBtn');
const pageIconFileInput = document.getElementById('pageIconFile');
let pageIconImageEl = null;

let authSession = null;
let authSubscription = null;
let authModalOpen = false;
let authSubmitting = false;
let lastFocusedBeforeAuthModal = null;
let autoAuthModalRequested = true;
let bootstrapCompleted = false;
let loginGateActive = false;
let loginGateDelayTimer = null;
let loginGateDelayUsed = false;

applyPageIconActionLabels();
applyAuthLabels();
updateAuthButtonState();

if (addMenu && !addMenu.dataset.open) {
  addMenu.dataset.open = '0';
}
if (addBtn) {
  if (!addBtn.hasAttribute('aria-controls')) {
    addBtn.setAttribute('aria-controls', 'addMenuList');
  }
  if (!addBtn.hasAttribute('aria-haspopup')) {
    addBtn.setAttribute('aria-haspopup', 'true');
  }
  addBtn.setAttribute('aria-expanded', addMenu?.dataset.open === '1' ? 'true' : 'false');
}
let state = load() || seed();
bootstrapSession()
  .then((result) => {
    if (result?.appliedRemote) {
      normaliseReminderState();
      refreshPageHeaderFromState();
      renderAll();
      syncReminders();
    }
  })
  .catch((error) => {
    console.error('Nepavyko užbaigti Supabase paleidimo:', error);
  })
  .finally(() => {
    bootstrapCompleted = true;
  });
if (!Array.isArray(state.groups)) state.groups = [];
if (!state.title) state.title = DEFAULT_TITLE;
if (typeof state.icon !== 'string') state.icon = '';
if (typeof state.iconImage !== 'string') state.iconImage = '';
state.iconImage = sanitizeIconImage(state.iconImage);
if (state.iconImage) state.icon = '';
let editing = false;
let reminders;
let debouncedSearchRender = null;
let remoteSaveTimer = null;
let remoteSaveInFlight = false;
let remoteSavePendingSnapshot = null;

normaliseReminderState();

const storedEmail = loadStoredEmail();
if (authEmailInput && storedEmail) {
  authEmailInput.value = storedEmail;
}
if (authPasswordInput) {
  authPasswordInput.value = '';
}

refreshPageHeaderFromState();

pageTitleEl.addEventListener('input', () => {
  if (!editing) return;
  const rawTitle = pageTitleEl.textContent;
  const trimmedTitle = rawTitle.trim();
  state.title = trimmedTitle;
  if (!trimmedTitle) {
    pageTitleEl.textContent = '';
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(pageTitleEl);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  document.title = state.title || DEFAULT_TITLE;
  persistState();
});
pageIconEl.addEventListener('input', () => {
  if (!editing) return;
  state.iconImage = '';
  state.icon = pageIconEl.textContent.replace(/\s+/g, ' ').trim();
  updatePageIconPresentation({ preserveTextSelection: true });
  persistState();
});

if (pageIconImageBtn && pageIconFileInput) {
  pageIconImageBtn.addEventListener('click', () => {
    if (!editing) return;
    pageIconFileInput.click();
  });
}

if (pageIconClearBtn) {
  pageIconClearBtn.addEventListener('click', () => {
    if (!editing) return;
    state.icon = '';
    state.iconImage = '';
    pageIconEl.textContent = '';
    updatePageIconPresentation();
    persistState();
    pageIconEl.focus();
  });
}

if (pageIconFileInput) {
  pageIconFileInput.addEventListener('change', (event) => handlePageIconFileSelection(event));
}

if (authToggleBtn) {
  authToggleBtn.addEventListener('click', () => onAuthToggle());
}
if (authCloseBtn) {
  authCloseBtn.addEventListener('click', () => closeAuthModal());
}
if (authModalEl) {
  authModalEl.addEventListener('click', (event) => handleAuthBackdropClick(event));
}
if (authFormEl) {
  authFormEl.addEventListener('submit', (event) => onAuthSubmit(event));
}
if (authClearBtn) {
  authClearBtn.addEventListener('click', () => handleAuthClear());
}
document.addEventListener('keydown', handleAuthModalKeydown, true);

const uid = () => crypto.randomUUID().slice(0, 8);

const openHelp = () => helpDialog(T);

const updateSearchClearVisibility = () => {
  if (!searchClearBtn) return;
  const hasValue = Boolean(searchEl?.value?.trim());
  searchClearBtn.hidden = !hasValue;
};

function applyPageIconActionLabels() {
  if (pageIconImageBtn) {
    pageIconImageBtn.innerHTML = `${I.camera} <span class="page-icon-action-label" aria-hidden="true">${T.pageIconImage}</span>`;
    pageIconImageBtn.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    pageIconImageBtn.setAttribute('aria-label', T.pageIconImage);
  }
  if (pageIconClearBtn) {
    pageIconClearBtn.innerHTML = `${I.close} <span class="page-icon-action-label" aria-hidden="true">${T.pageIconClear}</span>`;
    pageIconClearBtn.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    pageIconClearBtn.setAttribute('aria-label', T.pageIconClear);
  }
}

function applyAuthLabels() {
  if (authToggleBtn) {
    const label = T.authToggleSignIn || 'Prisijungti';
    authToggleBtn.textContent = label;
    authToggleBtn.setAttribute('aria-label', label);
  }
  if (authModalTitle) {
    authModalTitle.textContent = T.authModalTitle || 'Prisijungimas';
  }
  if (authModalDescription) {
    authModalDescription.textContent = T.authModalDescription || 'Įveskite prisijungimo duomenis.';
  }
  if (authEmailLabel) {
    authEmailLabel.textContent = T.authEmailLabel || 'El. pašto adresas';
  }
  if (authEmailInput) {
    authEmailInput.placeholder = T.authEmailPlaceholder || 'vardas@gmail.com';
  }
  if (authPasswordLabel) {
    authPasswordLabel.textContent = T.authPasswordLabel || 'Slaptažodis';
  }
  if (authPasswordInput) {
    authPasswordInput.placeholder = T.authPasswordPlaceholder || '••••••••';
  }
  if (authSubmitBtn) {
    authSubmitBtn.textContent = T.authSubmit || 'Prisijungti';
  }
  if (authClearBtn) {
    authClearBtn.textContent = T.authClear || 'Išvalyti';
    authClearBtn.setAttribute('aria-label', T.authClearHint || T.authClear || 'Išvalyti');
  }
  if (authMessageEl) {
    authMessageEl.textContent = '';
  }
  setSyncStatus(T.authStatusSignedOut || 'Neprisijungęs');
}

function setSyncStatus(message, options = {}) {
  if (!syncStatusEl) return;
  const { variant = 'neutral', includeRemoteMeta = false } = options;
  const segments = [];
  if (message) {
    segments.push(message);
  }
  if (includeRemoteMeta) {
    const remoteLabel = formatRemoteSyncStatus(ensureStateMeta(), T);
    if (remoteLabel) {
      segments.push(remoteLabel);
    }
  }
  syncStatusEl.textContent = segments.join(' • ');
  if (variant && variant !== 'neutral') {
    syncStatusEl.dataset.variant = variant;
  } else {
    delete syncStatusEl.dataset.variant;
  }
}

function updateIdleSyncStatus() {
  if (!supabaseReady) {
    setSyncStatus(T.authStatusSignedOut || 'Neprisijungęs');
    return;
  }
  if (authSession?.user?.email) {
    setSyncStatus(formatSignedInStatus(authSession.user.email), {
      variant: 'success',
      includeRemoteMeta: true,
    });
    return;
  }
  if (authSession) {
    setSyncStatus(T.authStatusSignedIn || 'Prisijungęs', {
      variant: 'success',
      includeRemoteMeta: true,
    });
    return;
  }
  setSyncStatus(T.authStatusSignedOut || 'Neprisijungęs');
}

function formatSignedInStatus(email) {
  const template = T.authStatusSignedIn || 'Prisijungta kaip {email}';
  return template.replace('{email}', email || 'vartotojas');
}

function loadStoredEmail() {
  try {
    return localStorage.getItem(AUTH_EMAIL_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Nepavyko nuskaityti išsaugoto el. pašto:', error);
    return '';
  }
}

function persistStoredEmail(value) {
  try {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) {
      localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(AUTH_EMAIL_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Nepavyko išsaugoti el. pašto:', error);
  }
}

function setAuthMessage(message, variant = 'neutral') {
  if (!authMessageEl) return;
  authMessageEl.textContent = message || '';
  if (variant && variant !== 'neutral') {
    authMessageEl.dataset.variant = variant;
  } else {
    delete authMessageEl.dataset.variant;
  }
}

function setLoginGateActive(active) {
  const wasActive = loginGateActive;
  loginGateActive = Boolean(active);
  if (loginGateDelayTimer) {
    clearTimeout(loginGateDelayTimer);
    loginGateDelayTimer = null;
  }
  if (loginGateActive) {
    document.body.dataset.loginGate = '1';
    const open = () => {
      if (!authModalOpen) {
        openAuthModal({ force: true });
      }
    };
    if (!wasActive && !loginGateDelayUsed) {
      loginGateDelayTimer = setTimeout(() => {
        loginGateDelayTimer = null;
        open();
      }, LOGIN_GATE_DELAY_MS);
      loginGateDelayUsed = true;
    } else {
      open();
    }
  } else {
    delete document.body.dataset.loginGate;
    if (authModalOpen) {
      closeAuthModal({ restoreFocus: false });
    }
  }
}

function scheduleAuthModalAutoOpen() {
  autoAuthModalRequested = true;
  maybeAutoOpenAuthModal();
}

function maybeAutoOpenAuthModal() {
  if (!autoAuthModalRequested) return;
  if (!supabaseReady) return;
  if (authSession) {
    autoAuthModalRequested = false;
    return;
  }
  if (authModalOpen) {
    autoAuthModalRequested = false;
    return;
  }
  openAuthModal();
  autoAuthModalRequested = false;
}

async function bootstrapSession() {
  const initReady = await supabaseInitPromise.catch(() => false);
  if (!initReady || !supabaseReady) return { appliedRemote: false };
  const session = await refreshAuthSession();
  if (!session) {
    maybeAutoOpenAuthModal();
    return { appliedRemote: false };
  }
  const remoteResult = await syncLatestRemoteState({ preferRemote: true });
  maybeAutoOpenAuthModal();
  return { appliedRemote: Boolean(remoteResult?.applied) };
}

function resolveAuthErrorMessage(error) {
  const defaultMessage = T.authStatusError || 'Nepavyko prisijungti. Bandykite dar kartą.';
  if (!error) return defaultMessage;
  const rawMessage = typeof error.message === 'string' ? error.message.trim() : '';
  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes('invalid login') ||
    normalized.includes('invalid credentials') ||
    error?.status === 400 ||
    error?.status === 422
  ) {
    return T.authInvalidCredentials || defaultMessage;
  }
  return rawMessage || defaultMessage;
}

function setAuthSubmitting(pending) {
  authSubmitting = Boolean(pending);
  if (authSubmitBtn) {
    authSubmitBtn.disabled = pending;
    authSubmitBtn.setAttribute('aria-busy', pending ? 'true' : 'false');
  }
  if (authEmailInput) {
    authEmailInput.disabled = pending;
  }
  if (authPasswordInput) {
    authPasswordInput.disabled = pending;
  }
}

function updateAuthButtonState() {
  if (!authToggleBtn) return;
  const signInLabel = T.authToggleSignIn || 'Prisijungti';
  const signOutLabel = T.authToggleSignOut || 'Atsijungti';
  let nextLabel = signInLabel;
  if (!supabaseReady) {
    authToggleBtn.disabled = true;
    authToggleBtn.setAttribute('aria-disabled', 'true');
    authToggleBtn.title = T.authNoConfig || '';
  } else {
    authToggleBtn.disabled = false;
    authToggleBtn.removeAttribute('aria-disabled');
    authToggleBtn.title = '';
    nextLabel = authSession ? signOutLabel : signInLabel;
  }
  authToggleBtn.textContent = nextLabel;
  authToggleBtn.setAttribute('aria-label', nextLabel);
}

function openAuthModal(options = {}) {
  if (!authModalEl) return;
  const { force = false } = options;
  if (!force && !supabaseReady) {
    alert(T.authNoConfig || 'Supabase konfigūracija nerasta.');
    return;
  }
  autoAuthModalRequested = false;
  authModalOpen = true;
  lastFocusedBeforeAuthModal =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  authModalEl.hidden = false;
  authModalEl.classList.toggle('auth-modal--gate', loginGateActive);
  document.body.dataset.modalOpen = '1';
  if (loginGateActive) {
    document.body.dataset.loginGate = '1';
  }
  setAuthMessage('', 'neutral');
  if (authPasswordInput) {
    authPasswordInput.value = '';
  }
  const focusTarget = authEmailInput || authModalDialog;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    requestAnimationFrame(() => focusTarget.focus());
  }
}

function closeAuthModal(options = {}) {
  if (!authModalEl) return;
  if (loginGateActive && !authSession) {
    return;
  }
  const { restoreFocus = true } = options;
  authModalOpen = false;
  authModalEl.hidden = true;
  delete document.body.dataset.modalOpen;
  if (restoreFocus && lastFocusedBeforeAuthModal instanceof HTMLElement) {
    lastFocusedBeforeAuthModal.focus();
  }
  lastFocusedBeforeAuthModal = null;
}

function handleAuthModalKeydown(event) {
  if (!authModalOpen) return;
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault();
    closeAuthModal();
  }
}

function handleAuthBackdropClick(event) {
  if (!authModalOpen || !authModalEl) return;
  if (event.target === authModalEl) {
    closeAuthModal();
  }
}

function onAuthToggle() {
  if (!supabaseReady) {
    alert(T.authNoConfig || 'Supabase konfigūracija nerasta.');
    return;
  }
  if (authSession) {
    onAuthSignOut();
  } else {
    openAuthModal();
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseReady || authSubmitting) return;
  const email = (authEmailInput?.value || '').trim();
  const password = authPasswordInput?.value || '';
  if (!email || !password) {
    setAuthMessage(T.required || 'Užpildykite visus laukus.', 'error');
    if (!email) {
      authEmailInput?.focus();
    } else {
      authPasswordInput?.focus();
    }
    return;
  }
  try {
    setAuthSubmitting(true);
    setSyncStatus(T.authStatusSyncing || 'Sinchronizuojama…');
    setAuthMessage('', 'neutral');
    const { session } = await signInWithPassword(email, password);
    persistStoredEmail(email);
    if (authPasswordInput) {
      authPasswordInput.value = '';
    }
    if (session) {
      updateAuthSession(session);
    } else {
      await refreshAuthSession();
    }
    setAuthMessage(T.authPasswordSuccess || 'Prisijungimas sėkmingas.', 'success');
    closeAuthModal({ restoreFocus: false });
  } catch (error) {
    console.error('Nepavyko prisijungti:', error);
    setAuthMessage(resolveAuthErrorMessage(error), 'error');
    setSyncStatus(T.authStatusError || 'Nepavyko prisijungti. Bandykite dar kartą.', {
      variant: 'error',
    });
  } finally {
    setAuthSubmitting(false);
  }
}

function handleAuthClear() {
  persistStoredEmail('');
  if (authEmailInput) {
    authEmailInput.value = '';
    authEmailInput.focus();
  }
  if (authPasswordInput) {
    authPasswordInput.value = '';
  }
  setAuthMessage(T.authClearSuccess || 'El. paštas išvalytas.', 'success');
}

async function refreshAuthSession() {
  if (!supabaseReady) return null;
  try {
    setSyncStatus(T.authStatusSyncing || 'Sinchronizuojama…');
    const { data } = await getSession();
    const session = data?.session ?? null;
    updateAuthSession(session);
    return session;
  } catch (error) {
    console.error('Nepavyko gauti Supabase sesijos:', error);
    updateAuthSession(null);
    setSyncStatus(T.authStatusSignedOut || 'Neprisijungęs', { variant: 'error' });
    return null;
  }
}

function updateAuthSession(session) {
  const wasAuthenticated = Boolean(authSession);
  authSession = session && session.user ? session : null;
  setLoginGateActive(!authSession);
  updateIdleSyncStatus();
  if (authSession?.user?.email) {
    autoAuthModalRequested = false;
    if (authModalOpen) {
      closeAuthModal({ restoreFocus: false });
    }
  } else if (supabaseReady && wasAuthenticated) {
    scheduleAuthModalAutoOpen();
  }
  if (!authSession) {
    clearRemoteSaveTimer();
  }
  updateAuthButtonState();
  if (authSession && !wasAuthenticated && bootstrapCompleted) {
    syncLatestRemoteState({ preferRemote: true });
  }
}

async function onAuthSignOut() {
  if (!supabaseReady) return;
  try {
    setSyncStatus(T.authStatusSyncing || 'Sinchronizuojama…');
    await supabaseSignOut();
    updateAuthSession(null);
  } catch (error) {
    console.error('Nepavyko atsijungti nuo Supabase:', error);
    setSyncStatus(T.authStatusError || 'Nepavyko prisijungti. Bandykite dar kartą.', {
      variant: 'error',
    });
  }
}

function subscribeToAuthChanges() {
  if (!supabaseReady) return;
  try {
    const result = onAuthStateChange((_event, session) => {
      updateAuthSession(session);
    });
    const subscription = result?.data?.subscription || result?.subscription;
    if (subscription) {
      if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
        authSubscription.unsubscribe();
      }
      authSubscription = subscription;
    }
  } catch (error) {
    console.error('Nepavyko užsiprenumeruoti Supabase auth įvykių:', error);
  }
}

function updatePageIconPresentation(options = {}) {
  if (!pageIconEl) return;
  const { preserveTextSelection = false } = options;
  const placeholder = T.pageIconPlaceholder || '🖼';
  pageIconEl.dataset.placeholder = placeholder;

  const iconText = typeof state?.icon === 'string' ? state.icon.trim() : '';
  const sanitizedImage = sanitizeIconImage(state?.iconImage || '');
  if (state && state.iconImage !== sanitizedImage) {
    state.iconImage = sanitizedImage;
  }
  const hasImage = Boolean(sanitizedImage);
  const isEmpty = !hasImage && iconText === '';

  pageIconEl.dataset.empty = isEmpty ? '1' : '0';
  pageIconEl.classList.toggle('page-icon--image', hasImage);

  if (hasImage) {
    if (!pageIconImageEl) {
      pageIconImageEl = document.createElement('img');
      pageIconImageEl.decoding = 'async';
      pageIconImageEl.loading = 'lazy';
    }
    const altText = T.pageIconImageAlt || T.pageIconImage || 'Puslapio piktograma';
    if (pageIconImageEl.alt !== altText) pageIconImageEl.alt = altText;
    if (pageIconImageEl.src !== sanitizedImage) {
      pageIconImageEl.src = sanitizedImage;
    }
    if (pageIconEl.firstChild !== pageIconImageEl) {
      pageIconEl.textContent = '';
      pageIconEl.appendChild(pageIconImageEl);
    }
    pageIconEl.setAttribute('role', 'img');
    pageIconEl.setAttribute('aria-hidden', 'false');
    pageIconEl.setAttribute('aria-label', altText);
  } else {
    if (pageIconImageEl?.parentNode === pageIconEl) {
      pageIconImageEl.remove();
    }
    if (!preserveTextSelection) {
      pageIconEl.textContent = iconText;
    }
    pageIconEl.removeAttribute('role');
    pageIconEl.removeAttribute('aria-label');
    pageIconEl.setAttribute('aria-hidden', 'true');
  }

  const canEditText = Boolean(editing) && !hasImage;
  pageIconEl.contentEditable = canEditText ? 'true' : 'false';

  const imageHint = T.pageIconImageHint || '';
  const editHint = T.pageIconEditHint || '';
  if (editing) {
    pageIconEl.title = hasImage ? imageHint : editHint;
  } else if (hasImage && imageHint) {
    pageIconEl.title = imageHint;
  } else {
    pageIconEl.removeAttribute('title');
  }

  if (pageIconImageBtn) {
    const label = T.pageIconImageAria || T.pageIconImage || 'Paveikslėlis';
    pageIconImageBtn.disabled = !editing;
    pageIconImageBtn.setAttribute('aria-label', label);
    pageIconImageBtn.title = T.pageIconImage || '';
    pageIconImageBtn.setAttribute('aria-disabled', editing ? 'false' : 'true');
  }

  if (pageIconClearBtn) {
    const clearLabel = T.pageIconClearAria || T.pageIconClear || 'Pašalinti';
    pageIconClearBtn.hidden = isEmpty;
    pageIconClearBtn.disabled = !editing;
    pageIconClearBtn.setAttribute('aria-label', clearLabel);
    pageIconClearBtn.title = T.pageIconClear || '';
    pageIconClearBtn.setAttribute('aria-disabled', editing ? 'false' : 'true');
  }
}

function refreshPageHeaderFromState(options = {}) {
  const { preserveIconSelection = false } = options;
  if (pageTitleEl) {
    pageTitleEl.textContent = state?.title || '';
  }
  document.title = (state?.title && state.title.trim()) || DEFAULT_TITLE;
  updatePageIconPresentation({ preserveTextSelection: preserveIconSelection });
}

function handlePageIconFileSelection(event) {
  const input = event?.target;
  if (!editing) {
    if (input) input.value = '';
    return;
  }
  const file = input?.files?.[0];
  if (!file) {
    if (input) input.value = '';
    return;
  }
  if (!file.type?.startsWith('image/')) {
    alert(T.pageIconImageInvalid || 'Pasirinkite paveikslėlio failą.');
    input.value = '';
    return;
  }
  if (file.size > MAX_ICON_IMAGE_BYTES) {
    alert(T.pageIconImageTooLarge || 'Paveikslėlis per didelis (maks. 200 KB).');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result === 'string' && result.startsWith(ICON_IMAGE_ACCEPT_PREFIX)) {
      const sanitized = sanitizeIconImage(result);
      if (!sanitized) {
        alert(T.pageIconImageTooLarge || 'Paveikslėlis per didelis (maks. 200 KB).');
        return;
      }
      state.iconImage = sanitized;
      state.icon = '';
      updatePageIconPresentation();
      persistState();
    } else {
      alert(T.pageIconImageInvalid || T.pageIconImageError || 'Nepavyko įkelti paveikslėlio.');
    }
  };
  reader.onerror = () => {
    alert(T.pageIconImageError || 'Nepavyko įkelti paveikslėlio.');
  };
  reader.onloadend = () => {
    if (input) input.value = '';
  };
  reader.readAsDataURL(file);
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function findGroupElementById(id) {
  return Array.from(document.querySelectorAll('.group')).find(
    (el) => el.dataset?.id === id,
  );
}

function findItemElement(gid, iid) {
  return Array.from(
    document.querySelectorAll('.item[data-gid][data-iid]'),
  ).find((el) => el.dataset?.gid === gid && el.dataset?.iid === iid);
}

function scheduleRender(callback, delay = 150) {
  let controller = null;
  let timeoutId = null;
  let rafId = null;

  const clearTimers = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const schedule = (...args) => {
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    const { signal } = controller;

    clearTimers();

    const start = () => {
      if (signal.aborted) return;
      const run = () => {
        if (signal.aborted) return;
        controller = null;
        callback(...args);
      };
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(run);
      } else {
        run();
      }
    };

    if (
      typeof window !== 'undefined' &&
      typeof window.setTimeout === 'function' &&
      delay > 0
    ) {
      timeoutId = window.setTimeout(start, delay);
    } else {
      start();
    }

    signal.addEventListener(
      'abort',
      () => {
        clearTimers();
      },
      { once: true },
    );

    return controller;
  };

  schedule.cancel = () => {
    if (controller) {
      controller.abort();
      controller = null;
    } else {
      clearTimers();
    }
  };

  schedule.flush = (...args) => {
    schedule.cancel();
    const run = () => callback(...args);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      run();
    }
  };

  return schedule;
}

function animateLeaveElement(el) {
  if (!el || prefersReducedMotion()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    let fallbackId = null;
    const cleanup = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', handleEnd);
      if (
        fallbackId != null &&
        typeof window !== 'undefined' &&
        typeof window.clearTimeout === 'function'
      ) {
        window.clearTimeout(fallbackId);
      }
      if (el.dataset.anim === 'leave') {
        el.removeAttribute('data-anim');
      }
      resolve();
    };
    const handleEnd = (event) => {
      if (event?.target !== el) return;
      cleanup();
    };
    el.dataset.anim = 'leave';
    void el.offsetWidth;
    el.addEventListener('animationend', handleEnd);
    if (
      typeof window !== 'undefined' &&
      typeof window.setTimeout === 'function'
    ) {
      fallbackId = window.setTimeout(() => cleanup(), 400);
    }
  });
}

function parseIframe(html) {
  const raw = typeof html === 'string' ? html.trim() : '';
  if (!raw) return { src: '', height: undefined };

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');
  const iframe = doc.querySelector('iframe');

  if (!iframe) {
    return { src: raw, height: undefined };
  }

  const src = iframe.getAttribute('src')?.trim() || raw;
  const heightAttr = iframe.getAttribute('height');
  const height = heightAttr ? parseInt(heightAttr, 10) : undefined;

  return { src, height };
}

function normaliseReminderState() {
  if (!Array.isArray(state.customReminders)) state.customReminders = [];
  else
    state.customReminders = state.customReminders
      .filter((rem) => Number.isFinite(rem?.at))
      .map((rem) => ({
        id: typeof rem.id === 'string' && rem.id ? rem.id : uid(),
        title: typeof rem.title === 'string' ? rem.title : '',
        at: Math.round(rem.at),
        minutes:
          Number.isFinite(rem.minutes) && rem.minutes > 0
            ? Math.max(0, Math.round(rem.minutes))
            : null,
        createdAt: Number.isFinite(rem.createdAt)
          ? Math.round(rem.createdAt)
          : Date.now(),
      }));
  if (!state.remindersCard) {
    state.remindersCard = {
      enabled: false,
      title: '',
      wSize: 'md',
      hSize: 'md',
      showQuick: false,
    };
    const dims = SIZE_MAP.md || {};
    const width = Number.isFinite(dims.width) ? dims.width : 360;
    const height = Number.isFinite(dims.height) ? dims.height : 360;
    state.remindersCard.width = width;
    state.remindersCard.height = height;
    applySizeMetadata(state.remindersCard, width, height);
  } else {
    const fallbackWidth = SIZE_MAP[state.remindersCard.wSize || 'md']?.width || 360;
    const fallbackHeight = SIZE_MAP[state.remindersCard.hSize || 'md']?.height || 360;
    let width = Number.isFinite(state.remindersCard.customWidth)
      ? state.remindersCard.customWidth
      : Number.isFinite(state.remindersCard.width)
        ? state.remindersCard.width
        : fallbackWidth;
    let height = Number.isFinite(state.remindersCard.customHeight)
      ? state.remindersCard.customHeight
      : Number.isFinite(state.remindersCard.height)
        ? state.remindersCard.height
        : fallbackHeight;
    width = Number.isFinite(width) ? Math.max(0, Math.round(width)) : fallbackWidth;
    height = Number.isFinite(height) ? Math.max(0, Math.round(height)) : fallbackHeight;
    state.remindersCard.wSize = sizeFromWidth(width);
    state.remindersCard.hSize = sizeFromHeight(height);
    state.remindersCard.width = width;
    state.remindersCard.height = height;
    applySizeMetadata(state.remindersCard, width, height);
    state.remindersCard.title =
      typeof state.remindersCard.title === 'string'
        ? state.remindersCard.title
        : '';
    state.remindersCard.enabled = Boolean(state.remindersCard.enabled);
    state.remindersCard.showQuick = state.remindersCard.showQuick === true;
  }
  if (typeof state.remindersPos !== 'number') state.remindersPos = 0;
  const groups = Array.isArray(state.groups) ? state.groups : [];
  groups.forEach((g) => {
    if (g.type === 'note') {
      if (typeof g.title === 'string') g.name = g.title;
      if (!Number.isFinite(g.fontSize) || g.fontSize <= 0) g.fontSize = 20;
      if (!Number.isFinite(g.padding) || g.padding < 0) g.padding = 20;
      if ('reminderAt' in g) delete g.reminderAt;
      if ('reminderMinutes' in g) delete g.reminderMinutes;
    }
    (g.items || []).forEach((it) => {
      const hasReminder = Number.isFinite(it.reminderAt);
      if (!hasReminder) {
        delete it.reminderAt;
        delete it.reminderMinutes;
        return;
      }
      it.reminderAt = Math.round(it.reminderAt);
      if (Number.isFinite(it.reminderMinutes) && it.reminderMinutes > 0) {
        it.reminderMinutes = Math.max(0, Math.round(it.reminderMinutes));
      } else {
        delete it.reminderMinutes;
      }
    });
  });
}

function buildReminderEntries() {
  const entries = [];
  const clean = (value) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const truncate = (text, limit = 160) =>
    text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

  state.groups.forEach((g) => {
    const groupName = clean(g.name || '');
    (g.items || []).forEach((it) => {
      if (!Number.isFinite(it.reminderAt)) return;
      const prefix = clean(T.reminderItemBody) || T.reminderItemBody;
      const parts = [prefix, groupName, clean(it.title), clean(it.note)].filter(
        Boolean,
      );
      const body = truncate(parts.join(' • ')) || T.reminderItemBody;
      entries.push({
        key: `item:${it.id}`,
        at: it.reminderAt,
        title: T.reminderNotificationTitle,
        body,
        data: { type: 'item', gid: g.id, iid: it.id },
        onTrigger: () => {
          delete it.reminderAt;
          delete it.reminderMinutes;
          persistState();
          renderAll();
        },
      });
    });
  });

  (state.customReminders || []).forEach((rem) => {
    if (!Number.isFinite(rem.at)) return;
    const title = clean(rem.title || '') || T.reminderDefaultTitle;
    const duration = Number.isFinite(rem.minutes)
      ? rem.minutes * 60000
      : Number.isFinite(rem.createdAt)
        ? Math.max(0, rem.at - rem.createdAt)
        : null;
    entries.push({
      key: `custom:${rem.id}`,
      at: rem.at,
      title,
      body: title,
      data: { type: 'custom', id: rem.id },
      duration,
      createdAt: rem.createdAt,
      onTrigger: () => {
        state.customReminders = (state.customReminders || []).filter(
          (item) => item.id !== rem.id,
        );
        persistState();
        renderAll();
      },
    });
  });

  return entries;
}

function clearReminder(key) {
  if (key.startsWith('note:')) {
    const id = key.slice(5);
    const note = state.groups.find((g) => g.type === 'note' && g.id === id);
    if (note) {
      delete note.reminderAt;
      delete note.reminderMinutes;
    }
  } else if (key.startsWith('item:')) {
    const id = key.slice(5);
    for (const g of state.groups) {
      const it = (g.items || []).find((i) => i.id === id);
      if (it) {
        delete it.reminderAt;
        delete it.reminderMinutes;
        break;
      }
    }
  } else if (key.startsWith('custom:')) {
    const id = key.slice(7);
    state.customReminders = (state.customReminders || []).filter(
      (rem) => rem.id !== id,
    );
  }
  persistState();
  renderAll();
}

function snoozeReminder(key, minutes) {
  const newAt = Date.now() + minutes * 60000;
  if (key.startsWith('note:')) {
    const id = key.slice(5);
    const note = state.groups.find((g) => g.type === 'note' && g.id === id);
    if (note) {
      delete note.reminderAt;
      delete note.reminderMinutes;
    }
    return NaN;
  }
  if (key.startsWith('item:')) {
    const id = key.slice(5);
    for (const g of state.groups) {
      const it = (g.items || []).find((i) => i.id === id);
      if (it) {
        it.reminderMinutes = minutes;
        it.reminderAt = newAt;
        return newAt;
      }
    }
  }
  if (key.startsWith('custom:')) {
    const id = key.slice(7);
    const rem = (state.customReminders || []).find((item) => item.id === id);
    if (rem) {
      rem.minutes = minutes;
      rem.at = newAt;
      rem.createdAt = Date.now();
      return newAt;
    }
  }
  return NaN;
}

async function editReminder(entry) {
  if (!entry || !entry.data) return;
  if (entry.data.type === 'note' && entry.data.id) {
    await editNoteCard(entry.data.id);
    return;
  }
  if (entry.data.type === 'item' && entry.data.gid && entry.data.iid) {
    await editItem(entry.data.gid, entry.data.iid);
    return;
  }
  if (entry.data.type === 'custom' && entry.data.id) {
    beginEditCustomReminder(entry.data.id);
  }
}

function focusReminderCard() {
  if (typeof document === 'undefined') return false;
  const card = document.querySelector('.group[data-id="reminders"]');
  if (!card) return false;
  try {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    card.scrollIntoView();
  }
  card.classList.add('reminder-highlight');
  setTimeout(() => card.classList.remove('reminder-highlight'), 2000);
  return true;
}

function beginEditCustomReminder(id) {
  const reminder = (state.customReminders || []).find((item) => item.id === id);
  if (!reminder) return;
  const usesMinutes = Number.isFinite(reminder.minutes) && reminder.minutes > 0;
  const values = {
    title: reminder.title || '',
    reminderMode: usesMinutes ? REMINDER_MODE_MINUTES : REMINDER_MODE_DATETIME,
    reminderMinutes: usesMinutes ? reminder.minutes : '',
    reminderAt:
      !usesMinutes && Number.isFinite(reminder.at)
        ? formatDateTimeLocal(reminder.at)
        : '',
  };
  if (values.reminderMode === REMINDER_MODE_DATETIME && !values.reminderAt) {
    values.reminderMode = REMINDER_MODE_MINUTES;
  }
  updateReminderFormState({ editingId: id, values, error: '' });
  renderAll();
  focusReminderCard();
}

function cancelEditCustomReminder() {
  resetReminderFormState();
  renderAll();
}

function formatTimerTitle(minutes) {
  const template = T.reminderTimerPattern || 'Laikmatis {min} min.';
  if (template.includes('{min}')) return template.replace('{min}', minutes);
  return `${template} ${minutes} min.`;
}

function createQuickReminder(minutes) {
  const parsed = Math.max(0, Math.round(minutes || 0));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    updateReminderFormState({ error: T.reminderFormError });
    renderAll();
    return { error: T.reminderFormError };
  }
  const now = Date.now();
  state.customReminders.push({
    id: uid(),
    title: formatTimerTitle(parsed),
    at: now + parsed * 60000,
    minutes: parsed,
    createdAt: now,
  });
  resetReminderFormState();
  persistState();
  renderAll();
  reminders?.ensurePermission?.();
  return { success: true };
}

function submitReminderForm(formData = {}) {
  const parsed = parseReminderInput(formData);
  const now = Date.now();
  let at = NaN;
  let minutes = 0;
  if (parsed.mode === REMINDER_MODE_MINUTES && parsed.reminderMinutes > 0) {
    minutes = parsed.reminderMinutes;
    at = now + minutes * 60000;
  } else if (
    parsed.mode === REMINDER_MODE_DATETIME &&
    Number.isFinite(parsed.reminderAt)
  ) {
    at = parsed.reminderAt;
    minutes = Math.max(0, Math.round((parsed.reminderAt - now) / 60000));
  }

  const values = {
    title: (formData.title || '').trim(),
    reminderMode: parsed.mode,
    reminderMinutes:
      parsed.mode === REMINDER_MODE_MINUTES && parsed.reminderMinutes > 0
        ? parsed.reminderMinutes
        : '',
    reminderAt:
      parsed.mode === REMINDER_MODE_DATETIME && Number.isFinite(parsed.reminderAt)
        ? formatDateTimeLocal(parsed.reminderAt)
        : '',
  };
  updateReminderFormState({ values, error: '' });

  if (!Number.isFinite(at) || at <= now) {
    updateReminderFormState({ error: T.reminderFormError, values });
    renderAll();
    return { error: T.reminderFormError };
  }

  const title = values.title || T.reminderDefaultTitle;
  const record = {
    title,
    at: Math.round(at),
    minutes: minutes > 0 ? minutes : null,
    createdAt: now,
  };

  const formState = getReminderFormState();
  if (formState.editingId) {
    const target = (state.customReminders || []).find(
      (item) => item.id === formState.editingId,
    );
    if (!target) {
      resetReminderFormState();
      renderAll();
      return { error: T.reminderFormError };
    }
    target.title = record.title;
    target.at = record.at;
    target.minutes = record.minutes;
    target.createdAt = record.createdAt;
  } else {
    state.customReminders.push({ id: uid(), ...record });
  }

  resetReminderFormState();
  persistState();
  renderAll();
  reminders?.ensurePermission?.();
  return { success: true };
}

function addRemindersCard() {
  if (!state.remindersCard) {
    state.remindersCard = {
      enabled: true,
      title: '',
      wSize: 'md',
      hSize: 'md',
      showQuick: false,
    };
    const dims = SIZE_MAP.md || {};
    const width = Number.isFinite(dims.width) ? dims.width : 360;
    const height = Number.isFinite(dims.height) ? dims.height : 360;
    state.remindersCard.width = width;
    state.remindersCard.height = height;
    applySizeMetadata(state.remindersCard, width, height);
  } else {
    state.remindersCard.enabled = true;
  }
  if (typeof state.remindersPos !== 'number' || state.remindersPos < 0) {
    state.remindersPos = state.groups.length;
  }
  resetReminderFormState();
  persistState();
  renderAll();
  focusReminderCard();
}

async function removeRemindersCard() {
  if (!state.remindersCard) return;
  const el = findGroupElementById('reminders');
  await animateLeaveElement(el);
  state.remindersCard.enabled = false;
  resetReminderFormState();
  persistState();
  renderAll();
}

function setRemindersCardTitle(title) {
  if (!state.remindersCard) return;
  state.remindersCard.title = title.trim();
  persistState();
}

function openReminders() {
  const entries = buildReminderEntries().sort((a, b) => a.at - b.at);
  if (!state.remindersCard?.enabled && entries.length === 0) {
    alert(T.reminderCardMissing);
    return;
  }
  return remindersDialog(T, entries, async (action, key, meta = {}) => {
    if (!action) return null;
    if (action === 'remove') {
      clearReminder(key);
      const idx = entries.findIndex((entry) => entry.key === key);
      if (idx >= 0) entries.splice(idx, 1);
      return { removed: true };
    }
    if (action === 'snooze') {
      const minutes = Number.isFinite(Number(meta?.minutes))
        ? Number(meta.minutes)
        : REMINDER_SNOOZE_MINUTES;
      const newAt = snoozeReminder(key, minutes);
      if (Number.isFinite(newAt)) {
        const target = entries.find((entry) => entry.key === key);
        if (target) target.at = newAt;
        persistState();
        renderAll();
        return { at: newAt };
      }
      return { error: true };
    }
    if (action === 'edit') {
      const entry = entries.find((item) => item.key === key);
      if (!entry) return { error: true };
      await editReminder(entry);
      return { edited: true };
    }
    if (action === 'quick') {
      const minutes = Number.isFinite(Number(meta?.minutes))
        ? Number(meta.minutes)
        : REMINDER_SNOOZE_MINUTES;
      return createQuickReminder(minutes);
    }
    return null;
  });
}

/**
 * Updates the reminders button badge with the current count.
 * @param {number} count Total reminder entries detected.
 */
function updateReminderBadge(count) {
  if (!remindersBtn) return;

  const safeCount = Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
  const label = safeCount > 0 ? `${T.reminders} (${safeCount})` : T.reminders;
  remindersBtn.setAttribute('aria-label', label);
  remindersBtn.title = label;

  let badge = remindersBtn.querySelector('.reminder-badge');
  if (safeCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'reminder-badge';
      badge.setAttribute('aria-hidden', 'true');
      remindersBtn.appendChild(badge);
    }
    const displayCount = safeCount > 99 ? '99+' : String(safeCount);
    badge.textContent = displayCount;
  } else if (badge) {
    badge.remove();
  }
}

function syncReminders() {
  const entries = buildReminderEntries();
  if (reminders) {
    reminders.sync(entries);
  }
  updateReminderBadge(entries.length);
}

function canSyncRemoteState() {
  return supabaseReady && Boolean(authSession?.user);
}

function parseRemoteState(input) {
  if (!input) return null;
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return null;

  let current = input;
  let attempts = 0;
  while (typeof current === 'string' && attempts < 5) {
    try {
      current = JSON.parse(current);
      attempts += 1;
    } catch (error) {
      console.warn('Nepavyko perskaityti Supabase state_json kaip JSON:', error);
      return null;
    }
  }

  return current && typeof current === 'object' ? current : null;
}

function hasLocalContent() {
  const hasGroups = Array.isArray(state?.groups) && state.groups.length > 0;
  const hasCustomReminders =
    Array.isArray(state?.customReminders) && state.customReminders.length > 0;
  const hasTitle = typeof state?.title === 'string' && state.title.trim().length > 0;
  const hasIcon =
    (typeof state?.icon === 'string' && state.icon.trim()) ||
    (typeof state?.iconImage === 'string' && state.iconImage.trim());
  const remindersEnabled = Boolean(state?.remindersCard?.enabled);
  return hasGroups || hasCustomReminders || hasTitle || hasIcon || remindersEnabled;
}

async function syncLatestRemoteState(options = {}) {
  const { preferRemote = false } = options;
  if (!canSyncRemoteState()) {
    return { applied: false };
  }
  try {
    setSyncStatus(T.authStatusSyncing || 'Sinchronizuojama…');
    const remote = await fetchSettings();
    if (!remote) {
      updateIdleSyncStatus();
      return { applied: false };
    }
    const remoteState = parseRemoteState(remote?.state_json);
    const remoteId = typeof remote.id === 'string' && remote.id ? remote.id : null;
    const remoteUpdatedAtIso =
      typeof remote.updated_at === 'string' && remote.updated_at ? remote.updated_at : null;
    const remoteUpdatedAtValue = remoteUpdatedAtIso ? Date.parse(remoteUpdatedAtIso) : null;
    const localHasContent = hasLocalContent();
    const localUpdatedAt =
      localHasContent && Number.isFinite(state.updatedAt) ? state.updatedAt : null;
    const remoteHasTimestamp = Number.isFinite(remoteUpdatedAtValue);
    const remoteIsNewerOrEqual =
      remoteHasTimestamp && (!Number.isFinite(localUpdatedAt) || remoteUpdatedAtValue >= localUpdatedAt);
    const shouldApply = Boolean(remoteState) &&
      (preferRemote
        ? remoteIsNewerOrEqual || !remoteHasTimestamp || !localHasContent
        : remoteIsNewerOrEqual);
    if (shouldApply && remoteState) {
      applyRemoteState(remoteState, {
        remoteId,
        remoteUpdatedAtIso,
        remoteUpdatedAtValue,
      });
      setSyncStatus(T.remoteSyncSuccess || 'Duomenys atnaujinti iš Supabase.', {
        variant: 'success',
        includeRemoteMeta: true,
      });
      return { applied: true };
    }
    console.info('Supabase sync praleistas', {
      preferRemote,
      remoteStatePresent: Boolean(remoteState),
      remoteUpdatedAtIso,
      remoteHasTimestamp,
      localHasContent,
      localUpdatedAt,
      remoteIsNewerOrEqual,
    });
    const meta = ensureStateMeta();
    if (remoteId) meta.remoteId = remoteId;
    if (remoteUpdatedAtIso) meta.remoteUpdatedAt = remoteUpdatedAtIso;
    save(state);
    updateIdleSyncStatus();
    return { applied: false };
  } catch (error) {
    console.error('Nuotolinio atsisiuntimo klaida iš Supabase:', error);
    setSyncStatus(T.remoteSyncError || 'Nepavyko atsiųsti duomenų iš Supabase.', {
      variant: 'error',
    });
    return { applied: false, error: true };
  }
}

function applyRemoteState(remoteState, options = {}) {
  if (!remoteState || typeof remoteState !== 'object') return false;
  Object.keys(state).forEach((key) => {
    if (!(key in remoteState)) {
      delete state[key];
    }
  });
  Object.assign(state, remoteState);
  const sanitizedIconImage = sanitizeIconImage(state.iconImage || '');
  state.iconImage = sanitizedIconImage;
  if (sanitizedIconImage) {
    state.icon = '';
  } else if (typeof state.icon !== 'string') {
    state.icon = '';
  }
  if (typeof state.title !== 'string' || !state.title.trim()) {
    state.title = DEFAULT_TITLE;
  }
  normaliseReminderState();
  refreshPageHeaderFromState();
  renderAll();
  syncReminders();
  const meta = ensureStateMeta();
  if (typeof options.remoteId === 'string' && options.remoteId) {
    meta.remoteId = options.remoteId;
  }
  if (typeof options.remoteUpdatedAtIso === 'string' && options.remoteUpdatedAtIso) {
    meta.remoteUpdatedAt = options.remoteUpdatedAtIso;
  } else if (Number.isFinite(options.remoteUpdatedAtValue)) {
    meta.remoteUpdatedAt = new Date(options.remoteUpdatedAtValue).toISOString();
  }
  if (
    Number.isFinite(options.remoteUpdatedAtValue) &&
    (!Number.isFinite(state.updatedAt) || state.updatedAt < options.remoteUpdatedAtValue)
  ) {
    state.updatedAt = options.remoteUpdatedAtValue;
  }
  save(state);
  return true;
}

async function ensureRemoteRowId() {
  const userId = resolveAuthUserId();
  if (!userId) {
    return { userId: null, rowId: null };
  }
  const meta = ensureStateMeta();
  if (typeof meta.remoteId === 'string' && meta.remoteId) {
    return { userId, rowId: meta.remoteId };
  }
  try {
    const remote = await fetchSettings();
    const remoteId = typeof remote?.id === 'string' && remote.id ? remote.id : null;
    if (remoteId) {
      meta.remoteId = remoteId;
      const remoteUpdatedAt =
        typeof remote?.updated_at === 'string' && remote.updated_at ? remote.updated_at : null;
      if (remoteUpdatedAt) {
        meta.remoteUpdatedAt = remoteUpdatedAt;
      }
      return { userId, rowId: remoteId };
    }
  } catch (error) {
    console.warn('Nepavyko nustatyti Supabase įrašo ID:', error);
  }
  return { userId, rowId: userId };
}

function clearRemoteSaveTimer() {
  if (remoteSaveTimer) {
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = null;
  }
}

function clearPendingRemoteSave() {
  clearRemoteSaveTimer();
  remoteSavePendingSnapshot = null;
}

function cloneStateSnapshot(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(input);
    } catch (error) {
      console.warn('Nepavyko sukurti būsenos kopijos structuredClone metodu:', error);
    }
  }
  try {
    return JSON.parse(JSON.stringify(input));
  } catch (error) {
    console.error('Nuotolinio išsaugojimo būsenos kopijavimo klaida:', error);
    return null;
  }
}

function debounceRemoteSave(nextState) {
  if (!canSyncRemoteState()) return;
  const snapshot = cloneStateSnapshot(nextState);
  if (!snapshot) return;
  clearRemoteSaveTimer();
  remoteSaveTimer = setTimeout(() => {
    remoteSaveTimer = null;
    remoteSave(snapshot);
  }, REMOTE_SAVE_DEBOUNCE_MS);
}

async function remoteSave(snapshot) {
  if (!canSyncRemoteState()) return;
  const targetState = snapshot || cloneStateSnapshot(state);
  if (!targetState) return;
  remoteSavePendingSnapshot = targetState;
  if (remoteSaveInFlight) return;
  remoteSaveInFlight = true;
  try {
    while (remoteSavePendingSnapshot && canSyncRemoteState()) {
      const nextSnapshot = remoteSavePendingSnapshot;
      remoteSavePendingSnapshot = null;
      await performRemoteSaveRequest(nextSnapshot);
    }
  } finally {
    remoteSaveInFlight = false;
    if (remoteSavePendingSnapshot && canSyncRemoteState()) {
      await remoteSave(remoteSavePendingSnapshot);
    }
  }
}

async function performRemoteSaveRequest(snapshot) {
  if (!canSyncRemoteState()) return;
  const targetState = snapshot || cloneStateSnapshot(state);
  if (!targetState) return;
  const { userId, rowId } = await ensureRemoteRowId();
  if (!userId) {
    console.warn('Nuotolinio išsaugojimo vartotojo ID nerastas – sinchronizacija nutraukta.');
    return;
  }
  const issuedAtIso = new Date().toISOString();
  try {
    setSyncStatus(T.authStatusSyncing || 'Sinchronizuojama…');
    const result = await upsertSettings({
      id: rowId,
      user_id: userId,
      state_json: targetState,
      updated_at: issuedAtIso,
    });
    const remoteUpdatedAt = result?.updated_at || issuedAtIso;
    const meta = ensureStateMeta();
    meta.remoteUpdatedAt = remoteUpdatedAt;
    const savedRemoteId = typeof result?.id === 'string' && result.id ? result.id : rowId;
    meta.remoteId = savedRemoteId;
    save(state);
    updateIdleSyncStatus();
  } catch (error) {
    console.error('Nuotolinio išsaugojimo klaida:', error);
    setSyncStatus(REMOTE_SAVE_ERROR_MESSAGE, { variant: 'error' });
  }
}

function persistState() {
  normaliseReminderState();
  touchState(state);
  ensureStateMeta();
  save(state);
  syncReminders();
  debounceRemoteSave(state);
}

export const __testHooks = {
  setStateForTest(nextState) {
    state = nextState;
  },
  getStateForTest() {
    return state;
  },
  setAuthSessionForTest(session) {
    authSession = session;
  },
  setSupabaseReadyForTest(nextReady) {
    supabaseReady = Boolean(nextReady);
  },
  resetRemoteSaveForTest() {
    clearPendingRemoteSave();
    remoteSaveInFlight = false;
  },
  getRemoteSaveTimerForTest() {
    return remoteSaveTimer;
  },
  persistStateForTest() {
    persistState();
  },
  async flushRemoteSaveForTest(snapshot) {
    await remoteSave(snapshot);
  },
  syncLatestRemoteStateForTest(options) {
    return syncLatestRemoteState(options);
  },
};

function renderAll() {
  if (typeof debouncedSearchRender?.cancel === 'function') {
    debouncedSearchRender.cancel();
  }
  render(
    state,
    editing,
    T,
    I,
    {
      addGroup: () => addGroup(),
      beginAddGroup: () => beginAddGroupFlow(),
      addItem,
      editGroup,
      editItem,
      editChart,
      removeGroup: (id) => removeGroup(id),
      removeItem: (gid, iid) => removeItem(gid, iid),
      notes: {
        edit: (id) => editNoteCard(id),
        remove: (id) => removeNoteCard(id),
      },
      confirmDialog: (msg) => confirmDlg(T, msg),
      reminders: {
        entries: () => buildReminderEntries().sort((a, b) => a.at - b.at),
        clear: (key) => clearReminder(key),
        snooze: (key, minutes) => {
          const newAt = snoozeReminder(key, minutes);
          if (Number.isFinite(newAt)) {
            persistState();
            renderAll();
          }
        },
        edit: (entry) => editReminder(entry),
        quick: (minutes) => createQuickReminder(minutes),
        submit: (payload) => submitReminderForm(payload),
        formState: () => getReminderFormState(),
        cancelEdit: () => cancelEditCustomReminder(),
        focus: () => focusReminderCard(),
        startEditCustom: (id) => beginEditCustomReminder(id),
        removeCard: () => removeRemindersCard(),
        setTitle: (title) => setRemindersCardTitle(title),
        cardState: () => state.remindersCard,
        quickPresets: () => [...REMINDER_QUICK_MINUTES],
        snoozeMinutes: REMINDER_SNOOZE_MINUTES,
      },
    },
    () => persistState(),
  );
}

function updateUI() {
  if (!editing && isMenuOpen()) {
    setMenuOpen(false, { restoreFocus: false });
  }
  updateEditingUI(editing, state, T, I, renderAll);
  pageTitleEl.contentEditable = editing;
  if (!editing) {
    const trimmedTitle = pageTitleEl.textContent.trim();
    state.title = trimmedTitle;
    if (!trimmedTitle) {
      pageTitleEl.textContent = '';
    }
    if (!state.iconImage) {
      state.icon = pageIconEl.textContent.trim();
    }
    document.title = state.title || DEFAULT_TITLE;
    updatePageIconPresentation({ preserveTextSelection: false });
    persistState();
  } else {
    if (!pageTitleEl.textContent.trim()) {
      pageTitleEl.textContent = '';
    }
    const preserveSelection = document.activeElement === pageIconEl;
    updatePageIconPresentation({ preserveTextSelection: preserveSelection });
  }
}

function findNoteById(id) {
  return state.groups.find((g) => g.type === 'note' && g.id === id);
}

async function addGroup() {
  const res = await groupFormDialog(T);
  if (!res) return;
  const dims = SIZE_MAP.md;
  const width = Number.isFinite(dims.width) ? dims.width : SIZE_MAP.md.width;
  const height = Number.isFinite(dims.height) ? dims.height : SIZE_MAP.md.height;
  const group = {
    id: uid(),
    name: res.name,
    color: res.color,
    width,
    height,
    wSize: sizeFromWidth(width),
    hSize: sizeFromHeight(height),
    items: [],
  };
  applySizeMetadata(group, width, height);
  state.groups.push(group);
  persistState();
  renderAll();
}

function beginAddGroupFlow() {
  if (editing) {
    addGroup();
    return;
  }
  editing = true;
  updateUI();
  setTimeout(() => addGroup(), 0);
}

async function editGroup(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const res = await groupFormDialog(T, {
    name: g.name,
    color: g.color,
  });
  if (!res) return;
  g.name = res.name;
  g.color = res.color;
  const width = Number.isFinite(g.width) ? g.width : SIZE_MAP.md.width;
  const height = Number.isFinite(g.height) ? g.height : SIZE_MAP.md.height;
  g.width = width;
  g.height = height;
  g.wSize = sizeFromWidth(width);
  g.hSize = sizeFromHeight(height);
  applySizeMetadata(g, width, height);
  persistState();
  renderAll();
}

async function addChart() {
  const res = await chartFormDialog(T);
  if (!res) return;
  const chart = {
    id: uid(),
    type: 'chart',
    name: res.title,
    url: res.url,
    width: Number.isFinite(SIZE_MAP.md.width) ? SIZE_MAP.md.width : 640,
    height: Number.isFinite(SIZE_MAP.md.height) ? SIZE_MAP.md.height : 480,
    scale: 1,
  };
  chart.wSize = sizeFromWidth(chart.width);
  chart.hSize = sizeFromHeight(chart.height);
  applySizeMetadata(chart, chart.width, chart.height);
  state.groups.push(chart);
  persistState();
  renderAll();
}

async function addNoteCard() {
  const res = await notesDialog(T, {
    title: '',
    text: '',
    size: NOTE_DEFAULT_FONT,
    padding: NOTE_DEFAULT_PADDING,
    color: NOTE_DEFAULT_COLOR,
  });
  if (res === null) return;
  const dims = SIZE_MAP.md;
  const width = Number.isFinite(dims.width) ? dims.width : SIZE_MAP.md.width;
  const height = Number.isFinite(dims.height) ? dims.height : SIZE_MAP.md.height;
  const note = {
    id: uid(),
    type: 'note',
    title: res.title.trim() || T.notes,
    name: res.title.trim() || T.notes,
    text: res.text,
    color: normalizeNoteColor(res.color),
    width,
    height,
    wSize: sizeFromWidth(width),
    hSize: sizeFromHeight(height),
    fontSize: Number.isFinite(res.size) ? res.size : NOTE_DEFAULT_FONT,
    padding: Number.isFinite(res.padding) ? res.padding : NOTE_DEFAULT_PADDING,
  };
  applySizeMetadata(note, width, height);
  state.groups.push(note);
  persistState();
  renderAll();
}

async function editNoteCard(noteId) {
  const note = findNoteById(noteId);
  if (!note) return;
  const res = await notesDialog(T, {
    title: note.title || note.name || '',
    text: note.text || '',
    size: Number.isFinite(note.fontSize) ? note.fontSize : NOTE_DEFAULT_FONT,
    padding: Number.isFinite(note.padding) ? note.padding : NOTE_DEFAULT_PADDING,
    color: note.color || NOTE_DEFAULT_COLOR,
  });
  if (res === null) return;
  note.title = res.title.trim() || T.notes;
  note.name = note.title;
  note.text = res.text;
  note.fontSize = Number.isFinite(res.size) ? res.size : NOTE_DEFAULT_FONT;
  note.padding = Number.isFinite(res.padding) ? res.padding : NOTE_DEFAULT_PADDING;
  note.color = normalizeNoteColor(res.color);
  delete note.reminderMinutes;
  delete note.reminderAt;
  persistState();
  renderAll();
}

async function removeNoteCard(noteId) {
  const note = findNoteById(noteId);
  if (!note) return;
  const ok = await confirmDlg(T, T.confirmDelNotes);
  if (!ok) return;
  const el = findGroupElementById(noteId);
  await animateLeaveElement(el);
  state.groups = state.groups.filter((g) => g.id !== noteId);
  persistState();
  renderAll();
}

async function editChart(gid) {
  const g = state.groups.find((x) => x.id === gid && x.type === 'chart');
  if (!g) return;
  const res = await chartFormDialog(T, {
    title: g.name,
    url: g.url,
  });
  if (!res) return;
  g.name = res.title;
  g.url = res.url;
  delete g.frameHeight;
  delete g.frameWidth;
  delete g.h;
  delete g.w;
  const width = Number.isFinite(g.width) ? g.width : SIZE_MAP.md.width;
  const height = Number.isFinite(g.height) ? g.height : SIZE_MAP.md.height;
  g.width = width;
  g.height = height;
  g.wSize = sizeFromWidth(width);
  g.hSize = sizeFromHeight(height);
  applySizeMetadata(g, width, height);
  persistState();
  renderAll();
}

async function removeGroup(gid) {
  const index = state.groups.findIndex((g) => g.id === gid);
  if (index === -1) return;
  const el = findGroupElementById(gid);
  await animateLeaveElement(el);
  state.groups.splice(index, 1);
  persistState();
  renderAll();
}

async function addItem(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const data = await itemFormDialog(T, { type: 'link' });
  if (!data) return;
  if (data.type === 'sheet') {
    const conv = toSheetEmbed(data.url);
    if (conv) data.url = conv;
    else alert(T.sheetTip);
  }
  if (data.type === 'embed' || data.type === 'chart') {
    const parsed = parseIframe(data.url);
    data.url = parsed.src;
    if (parsed.height) data.h = parsed.height;
  }
  const newItem = {
    id: uid(),
    type: data.type,
    title: data.title,
    url: data.url,
    note: data.note,
    icon: data.icon,
  };
  if (data.h) newItem.h = data.h;
  if (hasReminderPayload(data)) {
    const reminder = parseReminderInput(data);
    if (reminder.mode === REMINDER_MODE_MINUTES && reminder.reminderMinutes > 0) {
      newItem.reminderMinutes = reminder.reminderMinutes;
      newItem.reminderAt = Date.now() + reminder.reminderMinutes * 60000;
      if (reminders) await reminders.ensurePermission();
    } else if (
      reminder.mode === REMINDER_MODE_DATETIME &&
      Number.isFinite(reminder.reminderAt)
    ) {
      newItem.reminderAt = reminder.reminderAt;
      if (reminders) await reminders.ensurePermission();
    }
  }
  g.items.push(newItem);
  persistState();
  renderAll();
}

async function editItem(gid, iid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const it = g.items.find((x) => x.id === iid);
  if (!it) return;
  const data = await itemFormDialog(T, it);
  if (!data) return;
  if (data.type === 'sheet') {
    const conv = toSheetEmbed(data.url);
    if (conv) data.url = conv;
  }
  if (data.type === 'embed' || data.type === 'chart') {
    const parsed = parseIframe(data.url);
    data.url = parsed.src;
    if (parsed.height) data.h = parsed.height;
    else delete data.h;
  }
  it.type = data.type;
  it.title = data.title;
  it.url = data.url;
  it.note = data.note;
  it.icon = data.icon;
  if (data.h) it.h = data.h;
  else delete it.h;
  if (hasReminderPayload(data)) {
    const reminder = parseReminderInput(data);
    if (reminder.mode === REMINDER_MODE_MINUTES && reminder.reminderMinutes > 0) {
      it.reminderMinutes = reminder.reminderMinutes;
      it.reminderAt = Date.now() + reminder.reminderMinutes * 60000;
      if (reminders) await reminders.ensurePermission();
    } else if (
      reminder.mode === REMINDER_MODE_DATETIME &&
      Number.isFinite(reminder.reminderAt)
    ) {
      delete it.reminderMinutes;
      it.reminderAt = reminder.reminderAt;
      if (reminders) await reminders.ensurePermission();
    } else {
      delete it.reminderMinutes;
      delete it.reminderAt;
    }
  }
  persistState();
  renderAll();
}

async function removeItem(gid, iid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const idx = g.items.findIndex((x) => x.id === iid);
  if (idx === -1) return;
  const el = findItemElement(gid, iid);
  await animateLeaveElement(el);
  g.items.splice(idx, 1);
  persistState();
  renderAll();
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.groups))
        throw new Error(T.invalidImport);
      state = data;
      normaliseReminderState();
      const importedTitle =
        typeof state.title === 'string' ? state.title.trim() : '';
      state.title = importedTitle || DEFAULT_TITLE;
      const importedIcon =
        typeof state.icon === 'string' ? state.icon.trim() : '';
      const importedIconImage = sanitizeIconImage(state.iconImage || '');
      state.iconImage = importedIconImage;
      state.icon = importedIconImage ? '' : importedIcon;
      pageTitleEl.textContent = state.title || DEFAULT_TITLE;
      updatePageIconPresentation();
      document.title = state.title || DEFAULT_TITLE;
      persistState();
      renderAll();
    } catch (err) {
      alert('Importo klaida: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function applyTheme() {
  const theme = getActiveTheme();
  const light = theme === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  const label = light ? T.toDark : T.toLight;
  const icon = light ? I.moon : I.sun;
  themeBtn.innerHTML = `${icon}`;
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
  syncChartFrameThemes(theme);
}

function toggleTheme() {
  const curr = localStorage.getItem('ed_dash_theme') === 'light';
  localStorage.setItem('ed_dash_theme', curr ? 'dark' : 'light');
  applyTheme();
}

function syncChartFrameThemes(theme) {
  const frames = document.querySelectorAll('.group--chart iframe');
  frames.forEach((frame) => {
    if (!(frame instanceof HTMLIFrameElement)) return;
    const storedBase = typeof frame.dataset.baseUrl === 'string'
      ? frame.dataset.baseUrl.trim()
      : '';
    const baseUrl = storedBase || frame.getAttribute('data-base-url') || frame.src;
    const resolvedBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    const nextSrc = resolveChartThemeUrl(resolvedBase, theme);
    if (!storedBase && resolvedBase) {
      frame.dataset.baseUrl = resolvedBase;
    }
    if (frame.dataset.themeApplied === theme && frame.src === nextSrc) {
      return;
    }
    frame.dataset.themeApplied = theme;
    if (nextSrc && frame.src !== nextSrc) {
      frame.src = nextSrc;
    }
  });
}

// Galimos spalvų schemos; pridėkite savo jei reikia
const colorThemes = ['emerald', 'sky', 'rose', 'amber', 'violet'];

function applyColor() {
  const color = localStorage.getItem('ed_dash_color') || 'emerald';
  document.documentElement.classList.remove(
    ...colorThemes.map((c) => `color-${c}`),
  );
  document.documentElement.classList.add(`color-${color}`);
}
// Google Sheets sinchronizavimas laikinai išjungtas
// const sheets = sheetsSync(state, syncStatus, () => persistState(), renderAll);

let lastFocusedBeforeMenu = null;

function isMenuOpen() {
  return addMenu?.dataset.open === '1';
}

function setMenuOpen(open, options = {}) {
  if (!addMenu) return;
  const { restoreFocus = true } = options;
  const currentlyOpen = isMenuOpen();
  if (open === currentlyOpen) return;

  addMenu.dataset.open = open ? '1' : '0';
  if (addBtn) {
    addBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (open) {
    lastFocusedBeforeMenu =
      document.activeElement instanceof HTMLElement ? document.activeElement : addBtn;

    if (addMenuList) {
      const focusTarget = addMenuList.querySelector('button:not([disabled])');
      if (focusTarget instanceof HTMLElement) {
        const focusFn = () => focusTarget.focus();
        if (
          typeof window !== 'undefined' &&
          typeof window.requestAnimationFrame === 'function'
        ) {
          window.requestAnimationFrame(focusFn);
        } else {
          focusFn();
        }
      }
    }

    document.addEventListener('keydown', handleMenuKeydown);
  } else {
    document.removeEventListener('keydown', handleMenuKeydown);
    if (restoreFocus) {
      const focusTarget =
        lastFocusedBeforeMenu instanceof HTMLElement ? lastFocusedBeforeMenu : addBtn;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
    }
    lastFocusedBeforeMenu = null;
  }
}

function handleMenuKeydown(event) {
  if (!isMenuOpen()) return;
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault();
    setMenuOpen(false);
  }
}

if (addBtn && addMenu) {
  addBtn.addEventListener('click', () => {
    setMenuOpen(!isMenuOpen());
  });
}

if (addMenuBackdrop) {
  addMenuBackdrop.addEventListener('click', () => setMenuOpen(false));
}

document.addEventListener('click', (event) => {
  if (!addMenu || !isMenuOpen()) return;
  if (!addMenu.contains(event.target)) {
    setMenuOpen(false);
  }
});
// Išplėtimui: jei reikia kitų laukų ignoravimo, papildykite žemiau esantį sąrašą.
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName?.toLowerCase();
  if (target.isContentEditable) return true;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.getAttribute('role') === 'textbox') return true;
  return false;
}

// Jei keičiate paieškos identifikatorių – atnaujinkite fokusavimo logiką.
function focusSearchField() {
  if (!(searchEl instanceof HTMLElement)) return;
  const focusOptions = { preventScroll: true };
  try {
    searchEl.focus(focusOptions);
  } catch (err) {
    searchEl.focus();
  }
  if (typeof searchEl.select === 'function') {
    searchEl.select();
  }
}

// Pagrindinis kelias naujiems trumpiniams – praplėskite šią funkciją arba pridėkite naują.
function openAddMenuViaShortcut() {
  if (!addMenu || !addBtn) return;
  if (!editing) {
    editing = true;
    updateUI();
  }
  if (!editing) return;
  if (!isMenuOpen()) {
    setMenuOpen(true, { restoreFocus: false });
  }
  if (addMenuList && addMenuList.contains(document.activeElement)) {
    return;
  }
  if (addMenuList) {
    const firstItem = addMenuList.querySelector('button:not([disabled])');
    if (firstItem instanceof HTMLElement) {
      firstItem.focus();
    }
  }
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (isEditableTarget(target)) {
    return;
  }

  const key = event.key?.toLowerCase();
  if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    focusSearchField();
    return;
  }

  if (
    (event.key === '?' || (event.shiftKey && key === '/')) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    openHelp();
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    key === 'k'
  ) {
    event.preventDefault();
    openAddMenuViaShortcut();
  }
});

[
  ['addGroup', () => addGroup()],
  ['addChart', () => addChart()],
  ['addNote', () => addNoteCard()],
].forEach(([id, handler]) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', () => {
      setMenuOpen(false, { restoreFocus: false });
      handler();
    });
  }
});

if (addRemindersBtn) {
  addRemindersBtn.addEventListener('click', () => {
    setMenuOpen(false, { restoreFocus: false });
    addRemindersCard();
  });
}

window.addEventListener('beforeunload', () => {
  if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
    authSubscription.unsubscribe();
  }
});

if (helpBtn) {
  helpBtn.innerHTML = `${I.help}<span class="sr-only">${T.help}</span>`;
  helpBtn.setAttribute('aria-label', `${T.help}`);
  helpBtn.setAttribute('data-tooltip', `${T.help}`);
  helpBtn.title = `${T.help}`;
  helpBtn.addEventListener('click', () => openHelp());
}

reminders = createReminderManager();
if (remindersBtn) {
  remindersBtn.innerHTML = `${I.clock} <span>${T.reminders}</span>`;
  remindersBtn.addEventListener('click', openReminders);
}
updateReminderBadge(0);
syncReminders();
themeBtn.addEventListener('click', toggleTheme);
editBtn.addEventListener('click', () => {
  editing = !editing;
  updateUI();
});
if (searchLabelEl) searchLabelEl.textContent = T.searchLabel;
debouncedSearchRender = scheduleRender(() => renderAll());
searchEl.setAttribute('aria-label', T.searchLabel);
searchEl.placeholder = T.searchPH;
searchEl.addEventListener('focus', () => updateSearchClearVisibility());
searchEl.addEventListener('input', () => {
  updateSearchClearVisibility();
  debouncedSearchRender();
});
searchEl.addEventListener('change', () => {
  updateSearchClearVisibility();
  debouncedSearchRender.flush();
});
if (searchClearBtn) {
  searchClearBtn.innerHTML = `${I.close}<span class="sr-only">${T.searchClear}</span>`;
  searchClearBtn.setAttribute('aria-label', T.searchClear);
  searchClearBtn.title = T.searchClear;
  searchClearBtn.addEventListener('click', () => {
    searchEl.value = '';
    updateSearchClearVisibility();
    if (typeof debouncedSearchRender?.cancel === 'function') {
      debouncedSearchRender.cancel();
    }
    renderAll();
    searchEl.focus();
  });
  updateSearchClearVisibility();
}

applyTheme();
applyColor();
updateUI();

window.addEventListener('error', (e) => {
  console.error('Klaida:', e.message);
});
