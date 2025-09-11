const STORAGE_KEY = 'ed_dashboard_lt_v1';

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (data && Array.isArray(data.groups)) {
      data.groups.forEach((g) =>
        g.items?.forEach((it) => {
          if (!('iconUrl' in it)) it.iconUrl = '';
          if (!('icon' in it)) it.icon = '';
        }),
      );
      if (typeof data.notes !== 'string') data.notes = '';
      if (
        !data.notesOpts ||
        typeof data.notesOpts.size !== 'number' ||
        typeof data.notesOpts.padding !== 'number'
      )
        data.notesOpts = { size: 16, padding: 8 };
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
  const data = { groups: [], notes: '', notesOpts: { size: 16, padding: 8 } };
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
