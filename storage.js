import { sizeFromWidth, sizeFromHeight } from './sizes.js';

const STORAGE_KEY = 'ed_dashboard_lt_v1';

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (data && Array.isArray(data.groups)) {
      data.groups.forEach((g) => {
        g.items?.forEach((it) => {
          if (!('iconUrl' in it)) it.iconUrl = '';
          if (!('icon' in it)) it.icon = '';
          if (Number.isFinite(it.reminderMinutes) && it.reminderMinutes > 0) {
            it.reminderMinutes = Math.max(0, Math.round(it.reminderMinutes));
          } else {
            delete it.reminderMinutes;
          }
          if (!Number.isFinite(it.reminderAt)) {
            delete it.reminderAt;
          }
        });
        if (typeof g.width !== 'number' || typeof g.height !== 'number') {
          let width = 360;
          let height = 360;
          if (g.size === 'sm') {
            width = 240;
            height = 240;
          } else if (g.size === 'lg') {
            width = 480;
            height = 480;
          }
          g.width = width;
          g.height = height;
        }
        g.wSize = g.wSize || sizeFromWidth(g.width);
        g.hSize = g.hSize || sizeFromHeight(g.height);
        delete g.size;
      });
      if (typeof data.notes !== 'string') data.notes = '';
      if (typeof data.notesTitle !== 'string') data.notesTitle = '';
      if (typeof data.title !== 'string') data.title = '';
      if (typeof data.icon !== 'string') data.icon = '';
      if (!Number.isFinite(data.notesReminderMinutes))
        data.notesReminderMinutes = 0;
      else data.notesReminderMinutes = Math.max(0, Math.round(data.notesReminderMinutes));
      if (!Number.isFinite(data.notesReminderAt)) data.notesReminderAt = null;
      if (
        !data.notesBox ||
        typeof data.notesBox.width !== 'number' ||
        typeof data.notesBox.height !== 'number'
      ) {
        const sz = data.notesBox?.size;
        let width = 360;
        let height = 360;
        if (sz === 'sm') {
          width = 240;
          height = 240;
        } else if (sz === 'lg') {
          width = 480;
          height = 480;
        }
        data.notesBox = { width, height, wSize: sizeFromWidth(width), hSize: sizeFromHeight(height) };
      } else {
        data.notesBox.wSize = data.notesBox.wSize || sizeFromWidth(data.notesBox.width);
        data.notesBox.hSize = data.notesBox.hSize || sizeFromHeight(data.notesBox.height);
        delete data.notesBox.size;
      }
      if (
        !data.notesOpts ||
        typeof data.notesOpts.size !== 'number' ||
        typeof data.notesOpts.padding !== 'number'
      )
        data.notesOpts = { size: 16, padding: 8 };
      if (typeof data.notesPos !== 'number') data.notesPos = 0;
    }
    return data;
  } catch (e) {
    return null;
  }
}

export function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function seed() {
  const data = {
    groups: [],
    notes: '',
    notesTitle: '',
    notesBox: { width: 360, height: 360, wSize: 'md', hSize: 'md' },
    notesOpts: { size: 16, padding: 8 },
    notesPos: 0,
    notesReminderMinutes: 0,
    notesReminderAt: null,
    title: '',
    icon: '',
  };
  save(data);
  return data;
}

export function sheetsSync(state, syncStatus, saveFn, renderFn) {
  const SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbxGrClqMHfkKqCUK8zZSix35s26oFW2Oyje-LsIcSH-6DTftkNtEVWcALfbD__rEfy_/exec'; // Pakeiskite į savo "web app" URL

  async function send(action, payload) {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      // Jokios "Content-Type" antraštės – taip išvengiama CORS preflight
      body: JSON.stringify({ action, data: payload }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  return {
    async export() {
      syncStatus.textContent = 'Sinchronizuojama…';
      if (!navigator.onLine) {
        syncStatus.textContent = 'Nėra ryšio';
        alert('Nėra interneto ryšio');
        return;
      }
      try {
        await send('export', state);
        syncStatus.textContent = 'Baigta';
        console.log('Sheets eksportas pavyko');
      } catch (err) {
        syncStatus.textContent = 'Nepavyko';
        console.error('Sheets eksportas nepavyko', err);
        alert('Eksportas nepavyko: ' + err.message);
      } finally {
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    },
    async import() {
      syncStatus.textContent = 'Sinchronizuojama…';
      if (!navigator.onLine) {
        syncStatus.textContent = 'Nėra ryšio';
        alert('Nėra interneto ryšio');
        return;
      }
      try {
        const res = await send('import');
        if (res && res.data) {
          Object.assign(state, res.data);
          saveFn(state);
          renderFn();
          console.log('Sheets importas pavyko');
        }
        syncStatus.textContent = 'Baigta';
      } catch (err) {
        syncStatus.textContent = 'Nepavyko';
        console.error('Sheets importas nepavyko', err);
        alert('Sheets importas nepavyko');
      } finally {
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    },
  };
}
