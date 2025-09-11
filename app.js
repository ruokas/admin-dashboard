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
  add: 'Pridėti',
  addGroup: 'Pridėti grupę',
  addChart: 'Pridėti grafiką',
  addNote: 'Pridėti pastabas',
  import: 'Importuoti',
  export: 'Eksportuoti',
  theme: 'Tema',
  notes: 'Pastabos',
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
};

const editBtn = document.getElementById('editBtn');
// const syncStatus = document.getElementById('syncStatus'); // Sheets sync indikatorius (išjungta)
const searchEl = document.getElementById('q');
const themeBtn = document.getElementById('themeBtn');

let state = load() || seed();
if (!('notes' in state)) state.notes = localStorage.getItem('notes') || '';
if (!('notesOpts' in state)) state.notesOpts = { size: 16, padding: 8 };
let editing = false;

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
  const res = await notesDialog(
    T,
    { text: state.notes || '', ...state.notesOpts },
  );
  if (res === null) return;
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
  const theme = localStorage.getItem('ed_dash_theme') || 'dark';
  if (theme === 'light') {
    document.documentElement.classList.add('theme-light');
    themeBtn.innerHTML = `${I.sun} <span>${T.theme}</span>`;
    themeBtn.setAttribute('aria-label', T.toDark);
  } else {
    document.documentElement.classList.remove('theme-light');
    themeBtn.innerHTML = `${I.moon} <span>${T.theme}</span>`;
    themeBtn.setAttribute('aria-label', T.toLight);
  }
}

function toggleTheme() {
  const now =
    (localStorage.getItem('ed_dash_theme') || 'dark') === 'dark'
      ? 'light'
      : 'dark';
  localStorage.setItem('ed_dash_theme', now);
  applyTheme();
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
editBtn.addEventListener('click', () => {
  editing = !editing;
  updateUI();
});
searchEl.placeholder = T.searchPH;
searchEl.addEventListener('input', renderAll);

applyTheme();
updateUI();

window.addEventListener('error', (e) => {
  console.error('Klaida:', e.message);
});
