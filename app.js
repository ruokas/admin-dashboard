import { load, save, seed } from './storage.js';
import { render, updateEditingUI, toSheetEmbed } from './render.js';
import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';
import {
  groupFormDialog,
  itemFormDialog,
  chartFormDialog,
  confirmDialog as confirmDlg,
  notesDialog,
} from './forms.js';
import { I } from './icons.js';
import { Tlt } from './i18n.js';
import { exportJson } from './exporter.js';
import { createReminderManager } from './reminders.js';

const T = Tlt;
// Hook future English localisation: fill T.en when translations are ready.
T.en = T.en || {};

const DEFAULT_TITLE = 'Admin skydelis';

const REMINDER_MODE_NONE = 'none';
const REMINDER_MODE_DATETIME = 'datetime';
const REMINDER_MODE_MINUTES = 'minutes';
const REMINDER_SNOOZE_MINUTES = 5;
const REMINDER_QUICK_MINUTES = [5, 10, 15, 30];
const NOTE_DEFAULT_COLOR = '#fef08a';
const NOTE_DEFAULT_FONT = 20;
const NOTE_DEFAULT_PADDING = 20;

const reminderFormDefaults = {
  editingId: null,
  values: null,
  error: '',
};

let reminderFormState = { ...reminderFormDefaults };

function resetReminderFormState() {
  reminderFormState = { ...reminderFormDefaults };
}

function updateReminderFormState(partial = {}) {
  reminderFormState = { ...reminderFormState, ...partial };
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

const editBtn = document.getElementById('editBtn');
// const syncStatus = document.getElementById('syncStatus'); // Sheets sync indikatorius (išjungta)
const searchEl = document.getElementById('q');
const searchLabelEl = document.getElementById('searchLabel');
const themeBtn = document.getElementById('themeBtn');
const remindersBtn = document.getElementById('remindersBtn');
const pageTitleEl = document.getElementById('pageTitle');
const pageIconEl = document.getElementById('pageIcon');

let state = load() || seed();
if (!Array.isArray(state.groups)) state.groups = [];
if (!state.title) state.title = DEFAULT_TITLE;
let editing = false;
let reminders;

normaliseReminderState();

pageTitleEl.textContent = state.title;
pageIconEl.textContent = state.icon || '';
document.title = state.title;

pageTitleEl.addEventListener('input', () => {
  if (!editing) return;
  state.title = pageTitleEl.textContent.trim();
  document.title = state.title;
  persistState();
});
pageIconEl.addEventListener('input', () => {
  if (!editing) return;
  state.icon = pageIconEl.textContent.trim();
  persistState();
});

const uid = () => crypto.randomUUID().slice(0, 8);

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

function parseReminderInput(data = {}) {
  const rawMode =
    typeof data.reminderMode === 'string' ? data.reminderMode : '';
  let mode;
  if (rawMode === REMINDER_MODE_MINUTES || rawMode === REMINDER_MODE_DATETIME) {
    mode = rawMode;
  } else if (rawMode === REMINDER_MODE_NONE) {
    mode = REMINDER_MODE_NONE;
  }
  if (!mode) {
    if (
      (typeof data.reminderAt === 'string' && data.reminderAt) ||
      Number.isFinite(data.reminderAt)
    ) {
      mode = REMINDER_MODE_DATETIME;
    } else if (
      Number.isFinite(data.reminderMinutes) &&
      data.reminderMinutes > 0
    ) {
      mode = REMINDER_MODE_MINUTES;
    } else {
      mode = REMINDER_MODE_NONE;
    }
  }

  let reminderMinutes = 0;
  if (mode === REMINDER_MODE_MINUTES) {
    const minutesVal = Number.parseInt(data.reminderMinutes, 10);
    if (Number.isFinite(minutesVal) && minutesVal > 0) {
      reminderMinutes = Math.max(0, Math.round(minutesVal));
    } else if (
      Number.isFinite(data.reminderMinutes) &&
      data.reminderMinutes > 0
    ) {
      reminderMinutes = Math.max(0, Math.round(data.reminderMinutes));
    }
    if (reminderMinutes <= 0) {
      reminderMinutes = 0;
      mode = REMINDER_MODE_NONE;
    }
  }

  let reminderAt = null;
  if (mode === REMINDER_MODE_DATETIME) {
    let parsed = NaN;
    if (typeof data.reminderAt === 'string') {
      const raw = data.reminderAt.trim();
      if (raw) parsed = Date.parse(raw);
    } else if (Number.isFinite(data.reminderAt)) {
      parsed = data.reminderAt;
    }
    if (Number.isFinite(parsed)) {
      reminderAt = Math.round(parsed);
    } else {
      mode = REMINDER_MODE_NONE;
    }
  }

  return { mode, reminderMinutes, reminderAt };
}

function hasReminderPayload(data = {}) {
  return (
    Object.prototype.hasOwnProperty.call(data, 'reminderMode') ||
    Object.prototype.hasOwnProperty.call(data, 'reminderMinutes') ||
    Object.prototype.hasOwnProperty.call(data, 'reminderAt')
  );
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
      width: SIZE_MAP.md.width,
      height: SIZE_MAP.md.height,
      wSize: 'md',
      hSize: 'md',
      showQuick: false,
    };
  } else {
    const fallbackWidth = SIZE_MAP[state.remindersCard.wSize || 'md']?.width || 360;
    const fallbackHeight =
      SIZE_MAP[state.remindersCard.hSize || 'md']?.height || 360;
    if (!Number.isFinite(state.remindersCard.width))
      state.remindersCard.width = fallbackWidth;
    if (!Number.isFinite(state.remindersCard.height))
      state.remindersCard.height = fallbackHeight;
    state.remindersCard.wSize =
      state.remindersCard.wSize || sizeFromWidth(state.remindersCard.width);
    state.remindersCard.hSize =
      state.remindersCard.hSize || sizeFromHeight(state.remindersCard.height);
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

  if (reminderFormState.editingId) {
    const target = (state.customReminders || []).find(
      (item) => item.id === reminderFormState.editingId,
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
      width: SIZE_MAP.md.width,
      height: SIZE_MAP.md.height,
      wSize: 'md',
      hSize: 'md',
      showQuick: false,
    };
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

function removeRemindersCard() {
  if (!state.remindersCard) return;
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
  if (state.remindersCard?.enabled && focusReminderCard()) {
    return;
  }
  alert(T.reminderCardMissing);
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

function persistState() {
  normaliseReminderState();
  save(state);
  syncReminders();
}

function renderAll() {
  render(
    state,
    editing,
    T,
    I,
    {
      addItem,
      editGroup,
      editItem,
      editChart,
      notes: {
        edit: (id) => editNoteCard(id),
        remove: (id) => removeNoteCard(id),
      },
      toggleCollapse,
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
        formState: () => reminderFormState,
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
  updateEditingUI(editing, state, T, I, renderAll);
  pageTitleEl.contentEditable = editing;
  pageIconEl.contentEditable = editing;
  if (!editing) {
    state.title = pageTitleEl.textContent.trim();
    state.icon = pageIconEl.textContent.trim();
    document.title = state.title;
    persistState();
  }
}

function findNoteById(id) {
  return state.groups.find((g) => g.type === 'note' && g.id === id);
}

async function addGroup() {
  const res = await groupFormDialog(T);
  if (!res) return;
  const dims = SIZE_MAP[res.size] ?? SIZE_MAP.md;
  state.groups.push({
    id: uid(),
    name: res.name,
    color: res.color,
    ...dims,
    wSize: sizeFromWidth(dims.width),
    hSize: sizeFromHeight(dims.height),
    items: [],
  });
  persistState();
  renderAll();
}

async function editGroup(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const res = await groupFormDialog(T, {
    name: g.name,
    color: g.color,
    size: sizeFromWidth(g.width ?? 360),
  });
  if (!res) return;
  g.name = res.name;
  g.color = res.color;
  const dims2 = SIZE_MAP[res.size] ?? SIZE_MAP.md;
  Object.assign(g, dims2);
  g.wSize = sizeFromWidth(dims2.width);
  g.hSize = sizeFromHeight(dims2.height);
  persistState();
  renderAll();
}

async function addChart() {
  const res = await chartFormDialog(T);
  if (!res) return;
  const parsed = parseIframe(res.url);
  const cDims = SIZE_MAP.md;
  state.groups.push({
    id: uid(),
    type: 'chart',
    name: res.title,
    url: parsed.src,
    h: parsed.height ? parsed.height + 56 : undefined,
    ...cDims,
    wSize: sizeFromWidth(cDims.width),
    hSize: sizeFromHeight(cDims.height),
  });
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
  const note = {
    id: uid(),
    type: 'note',
    title: res.title.trim() || T.notes,
    name: res.title.trim() || T.notes,
    text: res.text,
    color: normalizeNoteColor(res.color),
    width: dims.width,
    height: dims.height,
    wSize: sizeFromWidth(dims.width),
    hSize: sizeFromHeight(dims.height),
    fontSize: Number.isFinite(res.size) ? res.size : NOTE_DEFAULT_FONT,
    padding: Number.isFinite(res.padding) ? res.padding : NOTE_DEFAULT_PADDING,
  };
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
  state.groups = state.groups.filter((g) => g.id !== noteId);
  persistState();
  renderAll();
}

async function editChart(gid) {
  const g = state.groups.find((x) => x.id === gid && x.type === 'chart');
  if (!g) return;
  const res = await chartFormDialog(T, { title: g.name, url: g.url });
  if (!res) return;
  const parsed = parseIframe(res.url);
  g.name = res.title;
  g.url = parsed.src;
  if (parsed.height) {
    g.h = parsed.height + 56;
  }
  persistState();
  renderAll();
}

function toggleCollapse(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  g.collapsed = !g.collapsed;
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
      state.icon = importedIcon;
      pageTitleEl.textContent = state.title || DEFAULT_TITLE;
      pageIconEl.textContent = state.icon || '';
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
  let theme = localStorage.getItem('ed_dash_theme');
  if (!theme) {
    const prefersLight =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    // Pakeiskite numatytą temą, jei skyriui reikia kitokio starto varianto.
    theme = prefersLight ? 'light' : 'dark';
    localStorage.setItem('ed_dash_theme', theme);
  }
  const light = theme === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  const label = light ? T.toDark : T.toLight;
  const icon = light ? I.moon : I.sun;
  themeBtn.innerHTML = `${icon}`;
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
}

function toggleTheme() {
  const curr = localStorage.getItem('ed_dash_theme') === 'light';
  localStorage.setItem('ed_dash_theme', curr ? 'dark' : 'light');
  applyTheme();
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

const addMenuList = document.getElementById('addMenuList');
const addBtn = document.getElementById('addBtn');
function hideAddMenu() {
  addMenuList.style.display = 'none';
}
addBtn.addEventListener('click', () => {
  addMenuList.style.display =
    addMenuList.style.display === 'flex' ? 'none' : 'flex';
});
document.addEventListener('click', (e) => {
  if (!document.getElementById('addMenu').contains(e.target)) hideAddMenu();
});
document.getElementById('addGroup').addEventListener('click', () => {
  hideAddMenu();
  addGroup();
});
document.getElementById('addChart').addEventListener('click', () => {
  hideAddMenu();
  addChart();
});
document.getElementById('addNote').addEventListener('click', () => {
  hideAddMenu();
  addNoteCard();
});
const addRemindersBtn = document.getElementById('addRemindersCard');
if (addRemindersBtn) {
  addRemindersBtn.addEventListener('click', () => {
    hideAddMenu();
    addRemindersCard();
  });
}
document.getElementById('exportBtn').addEventListener('click', () => {
  exportJson(state);
});
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) importJson(f);
  e.target.value = '';
});

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
searchEl.setAttribute('aria-label', T.searchLabel);
searchEl.placeholder = T.searchPH;
searchEl.addEventListener('input', renderAll);

applyTheme();
applyColor();
updateUI();

window.addEventListener('error', (e) => {
  console.error('Klaida:', e.message);
});
