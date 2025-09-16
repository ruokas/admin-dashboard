const MAX_DELAY = 2147483647;

function fallbackAlert(entry, customFallback) {
  if (typeof customFallback === 'function') {
    try {
      customFallback(entry);
      return;
    } catch (err) {
      console.error('Reminder fallback error', err);
    }
  }
  const message = [entry?.title, entry?.body].filter(Boolean).join('\n');
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    if (message) window.alert(message);
    else window.alert('Priminimas');
  } else if (message) {
    console.info('Reminder:', message);
  }
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
        new Notification(title, options);
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
