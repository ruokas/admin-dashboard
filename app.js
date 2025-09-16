import { load, save, seed } from './storage.js';
import { render, updateEditingUI, toSheetEmbed } from './render.js';
import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';
import {
  groupFormDialog,
  itemFormDialog,
  chartFormDialog,
  confirmDialog as confirmDlg,
  notesDialog,
  remindersDialog,
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

const editBtn = document.getElementById('editBtn');
// const syncStatus = document.getElementById('syncStatus'); // Sheets sync indikatorius (išjungta)
const searchEl = document.getElementById('q');
const searchLabelEl = document.getElementById('searchLabel');
const themeBtn = document.getElementById('themeBtn');
const remindersBtn = document.getElementById('remindersBtn');
const pageTitleEl = document.getElementById('pageTitle');
const pageIconEl = document.getElementById('pageIcon');

let state = load() || seed();
if (!('notes' in state)) state.notes = localStorage.getItem('notes') || '';
if (!('notesOpts' in state)) state.notesOpts = { size: 16, padding: 8 };
if (!state.notesTitle) state.notesTitle = T.notes;
if (!('notesBox' in state))
  state.notesBox = { width: 360, height: 360, wSize: 'md', hSize: 'md' };
if (!state.notesBox.wSize)
  state.notesBox.wSize = sizeFromWidth(state.notesBox.width);
if (!state.notesBox.hSize)
  state.notesBox.hSize = sizeFromHeight(state.notesBox.height);
if (!('notesPos' in state)) state.notesPos = 0;
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

function normaliseReminderState() {
  if (!Number.isFinite(state.notesReminderAt)) {
    state.notesReminderAt = null;
    state.notesReminderMinutes = 0;
  } else {
    state.notesReminderMinutes = Math.max(
      0,
      Math.round(state.notesReminderMinutes || 0),
    );
  }
  const groups = Array.isArray(state.groups) ? state.groups : [];
  groups.forEach((g) => {
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

  if (Number.isFinite(state.notesReminderAt)) {
    const title = clean(state.notesTitle || T.notes) || T.notes;
    const text = clean(state.notes || '');
    const label = clean(T.reminderNoteBody) || T.reminderNoteBody;
    const bodyParts = [label, title];
    if (text) bodyParts.push(text);
    const body = truncate(bodyParts.join(' • ')) || T.reminderNoteBody;
    entries.push({
      key: 'notes',
      at: state.notesReminderAt,
      title: T.reminderNotificationTitle,
      body,
      data: { type: 'notes' },
      onTrigger: () => {
        state.notesReminderAt = null;
        state.notesReminderMinutes = 0;
        persistState();
        renderAll();
      },
    });
  }

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

  return entries;
}

function clearReminder(key) {
  if (key === 'notes') {
    state.notesReminderAt = null;
    state.notesReminderMinutes = 0;
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
  }
  persistState();
  renderAll();
}

async function openReminders() {
  const entries = buildReminderEntries().sort((a, b) => a.at - b.at);
  await remindersDialog(T, entries, (key) => {
    clearReminder(key);
  });
}

function syncReminders() {
  if (!reminders) return;
  reminders.sync(buildReminderEntries());
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
      editNotes,
      removeNotes,
      toggleCollapse,
      confirmDialog: (msg) => confirmDlg(T, msg),
    },
    () => persistState(),
  );
}

function updateUI() {
  updateEditingUI(editing, T, I, renderAll);
  pageTitleEl.contentEditable = editing;
  pageIconEl.contentEditable = editing;
  if (!editing) {
    state.title = pageTitleEl.textContent.trim();
    state.icon = pageIconEl.textContent.trim();
    document.title = state.title;
    persistState();
  }
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

async function editNotes() {
  const res = await notesDialog(T, {
    title: state.notesTitle || '',
    text: state.notes || '',
    size: state.notesOpts.size,
    padding: state.notesOpts.padding,
    reminderMinutes: state.notesReminderMinutes || 0,
    reminderAt: state.notesReminderAt,
  });
  if (res === null) return;
  state.notesTitle = res.title || T.notes;
  state.notes = res.text;
  state.notesOpts = { size: res.size, padding: res.padding };
  const reminder = parseReminderInput(res);
  if (reminder.mode === REMINDER_MODE_MINUTES && reminder.reminderMinutes > 0) {
    state.notesReminderMinutes = reminder.reminderMinutes;
    state.notesReminderAt = Date.now() + reminder.reminderMinutes * 60000;
    if (reminders) await reminders.ensurePermission();
  } else if (
    reminder.mode === REMINDER_MODE_DATETIME &&
    Number.isFinite(reminder.reminderAt)
  ) {
    state.notesReminderMinutes = 0;
    state.notesReminderAt = reminder.reminderAt;
    if (reminders) await reminders.ensurePermission();
  } else {
    state.notesReminderMinutes = 0;
    state.notesReminderAt = null;
  }
  persistState();
  renderAll();
}

// Ištrina pastabų kortelę, bet palieka paskutines parinktis ateičiai
async function removeNotes() {
  const ok = await confirmDlg(T, T.confirmDelNotes);
  if (!ok) return;
  state.notes = '';
  state.notesTitle = T.notes;
  state.notesReminderMinutes = 0;
  state.notesReminderAt = null;
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
  themeBtn.innerHTML = `${icon} <span>${label}</span>`;
  themeBtn.setAttribute('aria-label', label);
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
  editNotes();
});
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
syncReminders();
remindersBtn.innerHTML = `${I.clock} <span>${T.reminders}</span>`;
remindersBtn.setAttribute('aria-label', T.reminders);
remindersBtn.addEventListener('click', openReminders);
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
