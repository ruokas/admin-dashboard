const STORAGE_KEY = 'ed_dashboard_lt_v1';

export function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
  } catch (e) {
    return null;
  }
}

export function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function seed() {
  const data = { groups: [] };
  save(data);
  return data;
}

export function sheetsSync(state, syncStatus, saveFn, renderFn) {
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx87mix5Ch6eaLgS0MVR2ooQGzktFJVrVw1aG0iVzRgHPyjlcOjeqNgx4fCrGjX9Dqo/exec'; // Pakeiskite į savo "web app" URL

  async function send(action, payload) {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data: payload }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  return {
    async export() {
      syncStatus.textContent = 'Sinchronizuojama…';
      try {
        await send('export', state);
        syncStatus.textContent = 'Baigta';
        console.log('Sheets eksportas pavyko');
      } catch (err) {
        syncStatus.textContent = 'Nepavyko';
        console.error('Sheets eksportas nepavyko', err);
        alert('Sheets eksportas nepavyko');
      } finally {
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    },
    async import() {
      syncStatus.textContent = 'Sinchronizuojama…';
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
