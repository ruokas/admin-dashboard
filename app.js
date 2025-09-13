import { load, save, seed } from './storage.js';
import { render, updateEditingUI, toSheetEmbed } from './render.js';
import {
  groupFormDialog,
  itemFormDialog,
  chartFormDialog,
  confirmDialog as confirmDlg,
  notesDialog,
} from './forms.js';
import { I } from './icons.js';

const T = {
  searchPH: 'Paieška nuorodose…',
  searchLabel: 'Paieška',
  add: 'Pridėti',
  addGroup: 'Pridėti grupę',
  addChart: 'Pridėti grafiką',
  addNote: 'Pridėti pastabas',
  import: 'Importuoti',
  export: 'Eksportuoti',
  theme: 'Tema',
  color: 'Spalva',
  customize: 'Tinkinti',
  notes: 'Pastabos',
  noteTitle: 'Pastabų pavadinimas',
  noteSize: 'Šrifto dydis (px)',
  notePadding: 'Paraštės (px)',
  toDark: 'Perjungti į tamsią temą',
  toLight: 'Perjungti į šviesią temą',
  openAll: 'Atverti visas',
  collapse: 'Suskleisti',
  expand: 'Išskleisti',
  addItem: 'Pridėti įrašą',
  editGroup: 'Redaguoti grupę',
  editChart: 'Redaguoti grafiką',
  editMode: 'Redaguoti',
  done: 'Baigti',
  deleteGroup: 'Pašalinti grupę',
  empty: 'Nėra įrašų. Spauskite ＋, kad pridėtumėte nuorodą ar įterpimą.',
  noMatches: 'Nėra atitikmenų šioje grupėje.',
  itemType: 'Įrašo tipas',
  groupName: 'Grupės pavadinimas (pvz., „Kasdieniai darbai“, „Gairės“)',
  groupColor: 'Akcento spalva',
  renameGroup: 'Pervadinti grupę',
  itemTitle: 'Pavadinimas',
  itemUrl: 'URL',
  itemIcon: 'Pasirinkite piktogramą (nebūtina)',
  itemNote: 'Pastaba (nebūtina)',
  sheetTip:
    'Patarimas: Google Sheets turi būti „Publish to web“ arba bendrinamas.',
  confirmDelGroup: 'Pašalinti šią grupę ir visus jos įrašus?',
  confirmDelChart: 'Pašalinti šį grafiką?',
  confirmDelItem: 'Pašalinti šį įrašą?',
  invalidImport: 'Netinkamas failo formatas',
  save: 'Išsaugoti',
  cancel: 'Atšaukti',
  required: 'Užpildykite visus laukus.',
  invalidUrl: 'Neteisingas URL.',
  remove: 'Pašalinti',
  moveUp: 'Perkelti aukštyn',
  moveDown: 'Perkelti žemyn',
  actions: 'Veiksmai',
  preview: 'Peržiūra',
  edit: 'Redaguoti',
  reset: 'Atstatyti',
};

const DEFAULT_TITLE = 'Admin skydelis';

const editBtn = document.getElementById('editBtn');
// const syncStatus = document.getElementById('syncStatus'); // Sheets sync indikatorius (išjungta)
const searchEl = document.getElementById('q');
const searchLabelEl = document.getElementById('searchLabel');
const themeBtn = document.getElementById('themeBtn');
const colorBtn = document.getElementById('colorBtn');
const colorMenuList = document.getElementById('colorMenuList');
const colorMenu = document.getElementById('colorMenu');
const pageTitleEl = document.getElementById('pageTitle');
const pageIconEl = document.getElementById('pageIcon');

let state = load() || seed();
if (!('notes' in state)) state.notes = localStorage.getItem('notes') || '';
if (!('notesOpts' in state)) state.notesOpts = { size: 16, padding: 8 };
if (!state.notesTitle) state.notesTitle = T.notes;
if (!('notesBox' in state)) state.notesBox = { w: 0, h: 0 };
if (!('notesPos' in state)) state.notesPos = 0;
if (!state.title) state.title = DEFAULT_TITLE;
let editing = false;


pageTitleEl.textContent = state.title;
pageIconEl.textContent = state.icon || '';
document.title = state.title;

pageTitleEl.addEventListener('input', () => {
  if (!editing) return;
  state.title = pageTitleEl.textContent.trim();
  document.title = state.title;
  save(state);
});
pageIconEl.addEventListener('input', () => {
  if (!editing) return;
  state.icon = pageIconEl.textContent.trim();
  save(state);
});

const uid = () => Math.random().toString(36).slice(2, 10);

function parseIframe(html) {
  const match = html.match(/<iframe[^>]*src="([^"]+)"[^>]*>/i);
  if (!match) return { src: html };
  const src = match[1];
  const hMatch = html.match(/height="(\d+)"/i);
  return { src, h: hMatch ? parseInt(hMatch[1], 10) : undefined };
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
      toggleCollapse,
      confirmDialog: (msg) => confirmDlg(T, msg),
    },
    () => save(state),
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
    save(state);
  }
}

async function addGroup() {
  const res = await groupFormDialog(T);
  if (!res) return;
  state.groups.push({
    id: uid(),
    name: res.name,
    color: res.color,
    items: [],
    resized: false,
  });
  save(state);
  renderAll();
}

async function editGroup(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  const res = await groupFormDialog(T, { name: g.name, color: g.color });
  if (!res) return;
  g.name = res.name;
  g.color = res.color;
  save(state);
  renderAll();
}

async function addChart() {
  const res = await chartFormDialog(T);
  if (!res) return;
  const parsed = parseIframe(res.url);
  state.groups.push({
    id: uid(),
    type: 'chart',
    name: res.title,
    url: parsed.src,
    h: parsed.h ? parsed.h + 56 : undefined,
    resized: !!parsed.h,
  });
  save(state);
  renderAll();
}

async function editNotes() {
  const res = await notesDialog(T, {
    title: state.notesTitle || '',
    text: state.notes || '',
    size: state.notesOpts.size,
    padding: state.notesOpts.padding,
  });
  if (res === null) return;
  state.notesTitle = res.title || T.notes;
  state.notes = res.text;
  state.notesOpts = { size: res.size, padding: res.padding };
  save(state);
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
  if (parsed.h) {
    g.h = parsed.h + 56;
    g.resized = true;
  }
  save(state);
  renderAll();
}

function toggleCollapse(gid) {
  const g = state.groups.find((x) => x.id === gid);
  if (!g) return;
  g.collapsed = !g.collapsed;
  save(state);
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
    if (parsed.h) data.h = parsed.h;
  }
  g.items.push({
    id: uid(),
    type: data.type,
    title: data.title,
    url: data.url,
    note: data.note,
    icon: data.icon,
    ...(data.h ? { h: data.h } : {}),
  });
  save(state);
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
    if (parsed.h) data.h = parsed.h;
    else delete data.h;
  }
  it.type = data.type;
  it.title = data.title;
  it.url = data.url;
  it.note = data.note;
  it.icon = data.icon;
  if (data.h) it.h = data.h;
  else delete it.h;
  save(state);
  renderAll();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'smp-skydas.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.groups))
        throw new Error(T.invalidImport);
      state = data;
      save(state);
      renderAll();
    } catch (err) {
      alert('Importo klaida: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function applyTheme() {
  const light = localStorage.getItem('ed_dash_theme') === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  themeBtn.innerHTML = `${light ? I.sun : I.moon} <span>${T.theme}</span>`;
  themeBtn.setAttribute('aria-label', light ? T.toDark : T.toLight);
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

function setColor(color) {
  localStorage.setItem('ed_dash_color', color);
  applyColor();
}

// Google Sheets sinchronizavimas laikinai išjungtas
// const sheets = sheetsSync(state, syncStatus, () => save(state), renderAll);

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
  exportJson();
});
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) importJson(f);
  e.target.value = '';
});
themeBtn.addEventListener('click', toggleTheme);
colorBtn.innerHTML = `🎨 <span>${T.color}</span>`;
colorBtn.setAttribute('aria-label', T.color);
const colorOptions = document.querySelectorAll('#colorMenuList button');
function hideColorMenu() {
  colorMenuList.style.display = 'none';
}
colorBtn.addEventListener('click', () => {
  colorMenuList.style.display =
    colorMenuList.style.display === 'flex' ? 'none' : 'flex';
});
document.addEventListener('click', (e) => {
  if (!colorMenu.contains(e.target)) hideColorMenu();
});
colorOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    setColor(btn.dataset.color);
    hideColorMenu();
  });
});
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
