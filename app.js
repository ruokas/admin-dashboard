import { load, save, seed } from './storage.js';
import {
  render,
  updateEditingUI,
  applyTheme,
  toggleTheme,
  toSheetEmbed,
} from './render.js';
import {
  groupFormDialog,
  itemFormDialog,
  confirmDialog as confirmDlg,
} from './forms.js';

const T = {
  searchPH: 'Paieška nuorodose…',
  addGroup: 'Pridėti grupę',
  import: 'Importuoti',
  export: 'Eksportuoti',
  theme: 'Tema',
  openAll: 'Atverti visas',
  addItem: 'Pridėti įrašą',
  editGroup: 'Redaguoti grupę',
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

const I = {
  plus: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  pencil:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z"/></svg>',
  trash:
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  arrowUpRight:
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></svg>',
  arrowUp:
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15"/></svg>',
  arrowDown:
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
  check:
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  more: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
  globe:
    '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  table:
    '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/></svg>',
  puzzle:
    '<svg class="icon" viewBox="0 0 24 24"><path d="M13 2a3 3 0 013 3h3v4h-3a3 3 0 1 1-6 0H7v4h3a3 3 0 1 1 6 0h3v4h-3a3 3 0 0 1-6 0H7v3H3v-3a3 3 0 0 1 3-3v-4a3 3 0 0 1-3-3V5h4a3 3 0 0 1 3-3h3z"/></svg>',
  chart:
    '<svg class="icon" viewBox="0 0 24 24"><line x1="4" y1="19" x2="20" y2="19"/><line x1="8" y1="19" x2="8" y2="11"/><line x1="12" y1="19" x2="12" y2="7"/><line x1="16" y1="19" x2="16" y2="13"/></svg>',
};

const editBtn = document.getElementById('editBtn');
// const syncStatus = document.getElementById('syncStatus'); // Sheets sync indikatorius (išjungta)
const searchEl = document.getElementById('q');

let state = load() || seed();
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

// Google Sheets sinchronizavimas laikinai išjungtas
// const sheets = sheetsSync(state, syncStatus, () => save(state), renderAll);

document.getElementById('addGroup').addEventListener('click', addGroup);
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
document.getElementById('themeBtn').addEventListener('click', toggleTheme);
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
