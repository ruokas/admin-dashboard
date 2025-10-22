const MAX_DELAY = 2147483647;

function focusWindow() {
  if (typeof window === 'undefined') return;
  if (typeof window.focus !== 'function') return;
  try {
    window.focus();
  } catch (err) {
    console.debug('Nepavyko sufokusuoti lango', err);
  }
}

function highlightElement(el) {
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      el.scrollIntoView();
    }
  }
  el.classList.add('reminder-highlight');
  setTimeout(() => {
    if (el && el.classList) {
      el.classList.remove('reminder-highlight');
    }
  }, 2000);
}

function activateEntry(entry, attempt = 0) {
  if (!entry?.data) return;
  if (typeof document === 'undefined') return;
  if (attempt > 5) return;
  const data = entry.data;
  if (data.type === 'note') {
    const noteId = String(data.id || '');
    let notesEl = null;
    if (noteId && typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      notesEl = document.querySelector(`.group[data-id="${CSS.escape(noteId)}"]`);
    }
    if (!notesEl && noteId) {
      notesEl = Array.from(document.querySelectorAll('.group')).find(
        (el) => el.dataset.id === noteId,
      );
    }
    if (!notesEl) {
      notesEl = document.querySelector('.group.note-card');
    }
    if (notesEl) highlightElement(notesEl);
    return;
  }
  if (data.type === 'item') {
    const { gid, iid } = data;
    if (!gid || !iid) return;
    const gidStr = String(gid);
    const iidStr = String(iid);
    let groupEl = null;
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      groupEl = document.querySelector(
        `.group[data-id="${CSS.escape(gidStr)}"]`,
      );
    }
    if (!groupEl) {
      groupEl = Array.from(document.querySelectorAll('.group')).find(
        (el) => el.dataset.id === gidStr,
      );
    }
    if (!groupEl) {
      setTimeout(() => activateEntry(entry, attempt + 1), 120);
      return;
    }
    let itemEl = null;
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      itemEl = groupEl.querySelector(
        `.item[data-gid="${CSS.escape(gidStr)}"][data-iid="${CSS.escape(iidStr)}"]`,
      );
    }
    if (!itemEl) {
      itemEl = Array.from(groupEl.querySelectorAll('.item')).find(
        (el) => el.dataset.gid === gidStr && el.dataset.iid === iidStr,
      );
    }
    if (!itemEl) {
      const searchEl = document.getElementById('q');
      if (searchEl && searchEl.value) {
        searchEl.value = '';
        searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => activateEntry(entry, attempt + 1), 120);
        return;
      }
      setTimeout(() => activateEntry(entry, attempt + 1), 120);
      return;
    }
    highlightElement(itemEl);
  }
}

function fallbackAlert(entry, customFallback) {
  let handled = false;
  if (typeof customFallback === 'function') {
    try {
      customFallback(entry);
      handled = true;
    } catch (err) {
      console.error('Reminder fallback error', err);
    }
  }
  if (!handled) {
    const message = [entry?.title, entry?.body].filter(Boolean).join('\n');
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      if (message) window.alert(message);
      else window.alert('Priminimas');
    } else if (message) {
      console.info('Reminder:', message);
    }
  }
  focusWindow();
  setTimeout(() => activateEntry(entry), 0);
}

export function createReminderManager(options = {}) {
  const timers = new Map();
  const fallback = options.fallback;

  function clearTimer(key) {
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing.timerId);
      timers.delete(key);
    }
  }

  function notify(entry) {
    if (typeof window === 'undefined') {
      fallbackAlert(entry, fallback);
      return;
    }
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        const title = entry.title || 'Priminimas';
        const options = {
          body: entry.body || '',
          tag: entry.key,
          data: entry.data || {},
        };
        const notification = new Notification(title, options);
        const handleClick = () => {
          try {
            focusWindow();
            setTimeout(() => activateEntry(entry), 0);
            if (typeof notification.close === 'function') {
              notification.close();
            }
          } catch (err) {
            console.error('Priminimo pranešimo paspaudimo klaida', err);
          }
        };
        if (typeof notification.addEventListener === 'function') {
          notification.addEventListener('click', handleClick);
        } else {
          notification.onclick = handleClick;
        }
        return;
      } catch (err) {
        console.error('Priminimo pranešimas nepavyko', err);
      }
    }
    fallbackAlert(entry, fallback);
  }

  function trigger(entry) {
    notify(entry);
    if (typeof entry.onTrigger === 'function') {
      try {
        entry.onTrigger(entry);
      } catch (err) {
        console.error('Priminimo onTrigger klaida', err);
      }
    }
  }

  function schedule(entry) {
    clearTimer(entry.key);
    if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return;
    const record = { entry, at: entry.at, timerId: null };
    const run = () => {
      const remaining = record.at - Date.now();
      if (remaining <= 0) {
        clearTimer(entry.key);
        trigger(record.entry);
        return;
      }
      const delay = Math.min(remaining, MAX_DELAY);
      record.timerId = setTimeout(run, delay);
      timers.set(entry.key, record);
    };
    const initialRemaining = record.at - Date.now();
    if (initialRemaining <= 0) {
      trigger(record.entry);
      return;
    }
    const delay = Math.min(initialRemaining, MAX_DELAY);
    record.timerId = setTimeout(run, delay);
    timers.set(entry.key, record);
  }

  function sync(entries = []) {
    const active = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry.key !== 'string') return;
      active.add(entry.key);
      schedule(entry);
    });
    Array.from(timers.keys()).forEach((key) => {
      if (!active.has(key)) clearTimer(key);
    });
  }

  async function ensurePermission() {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch (err) {
      console.error('Nepavyko gauti pranešimų leidimo', err);
      return false;
    }
  }

  return {
    sync,
    ensurePermission,
  };
}
