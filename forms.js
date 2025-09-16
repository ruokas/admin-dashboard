import { I } from './icons.js';

const REMINDER_NONE = 'none';
const REMINDER_DATETIME = 'datetime';
const REMINDER_MINUTES = 'minutes';

function formatDateTimeLocal(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const pad = (val) => String(val).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function setupReminderControls(form) {
  const modeSelect = form.querySelector('[name="reminderMode"]');
  if (!modeSelect) return;
  const sections = form.querySelectorAll('[data-reminder]');
  const update = () => {
    const mode = modeSelect.value || REMINDER_NONE;
    sections.forEach((section) => {
      section.hidden = section.dataset.reminder !== mode;
    });
  };
  update();
  modeSelect.addEventListener('change', update);
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(ts) {
  try {
    return new Date(ts).toLocaleString('lt-LT').replace(',', '');
  } catch {
    return '';
  }
}

export function remindersDialog(T, entries = [], onAction = () => {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    const snoozeLabel = T.reminderSnooze || 'Atidėti 5 min.';
    const editLabel = T.reminderEdit || T.edit || 'Redaguoti';
    const listHtml =
      entries && entries.length
        ? `<ul class="reminders-list">${entries
            .map(
              (e) =>
                `<li data-key="${e.key}"><span class="title">${escapeHtml(
                  e.body || e.title || '',
                )}</span><time class="time" datetime="${new Date(e.at).toISOString()}">${formatDateTime(
                  e.at,
                )}</time><div class="actions"><button type="button" data-act="snooze">${escapeHtml(
                  snoozeLabel,
                )}</button><button type="button" data-act="edit">${escapeHtml(
                  editLabel,
                )}</button><button type="button" data-act="remove">${T.remove}</button></div></li>`,
            )
            .join('')}</ul>`
        : `<p>${T.noReminders}</p>`;
    dlg.innerHTML = `<form method="dialog" id="remindersForm"><h2 id="remindersLabel">${T.reminders}</h2>${listHtml}<menu><button type="button" data-act="close">${T.cancel}</button></menu></form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'remindersLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const closeBtn = form.querySelector('[data-act="close"]');
    function cleanup() {
      form.removeEventListener('click', handleAction);
      closeBtn.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
      resolve();
    }
    function close() {
      dlg.close();
      cleanup();
    }
    async function handleAction(e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const action = btn.dataset.act;
      if (!action) return;
      const li = btn.closest('li');
      const key = li?.dataset.key;
      if (!key) return;
      const result = await onAction(action, key);
      const shouldRemove =
        result?.removed || (action === 'remove' && result !== false);
      if (shouldRemove) {
        li?.remove();
        if (!form.querySelector('li')) {
          const p = document.createElement('p');
          p.textContent = T.noReminders;
          form.insertBefore(p, form.querySelector('menu'));
        }
        return;
      }
      if (Number.isFinite(result?.at)) {
        const timeEl = li?.querySelector('time.time');
        if (timeEl) {
          const ts = Number(result.at);
          timeEl.dateTime = new Date(ts).toISOString();
          timeEl.textContent = formatDateTime(ts);
        }
      }
    }
    form.addEventListener('click', handleAction);
    closeBtn.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
  });
}

export function groupFormDialog(T, data = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="groupForm">
      <label id="groupFormLabel">${T.groupName}<br><input name="name" required></label>
      <label>${T.groupColor}<br><input name="color" type="color" value="#6ee7b7"></label>
      <label>${T.groupSize}<br>
        <select name="size">
          <option value="sm">${T.sizeSm}</option>
          <option value="md">${T.sizeMd}</option>
          <option value="lg">${T.sizeLg}</option>
        </select>
      </label>
      <p class="error" id="groupErr" role="status" aria-live="polite"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'groupFormLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('#groupErr');
    const cancel = form.querySelector('[data-act="cancel"]');
    form.name.value = data.name || '';
    form.color.value = data.color || '#6ee7b7';
    form.size.value = data.size || 'md';

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) {
        err.textContent = T.required;
        return;
      }
      resolve({ name, color: form.color.value, size: form.size.value });
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}

export function itemFormDialog(T, data = {}) {
  return new Promise((resolve) => {
    const iconKeys = [
      'globe',
      'table',
      'chart',
      'puzzle',
      'book',
      'file',
      'folder',
      'mail',
      'phone',
      'star',
      'home',
      'link',
      'camera',
      'calendar',
      'clock',
      'user',
      'clipboard',
      'chat',
      'video',
      'map',
      'shield',
      'alert',
    ];
    const iconButtons = iconKeys
      .map(
        (k) =>
          `<button type="button" data-val="${k}" title="${k}">${I[k]}</button>`,
      )
      .join('');
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="itemForm">
      <label id="itemFormLabel">${T.itemType}<br>
        <select name="type">
          <option value="link">link</option>
          <option value="sheet">sheet</option>
          <option value="chart">chart</option>
          <option value="embed">embed</option>
        </select>
      </label>
      <label>${T.itemTitle}<br><input name="title" required></label>
      <label>${T.itemUrl}<br><input name="url" type="url" required></label>
      <label>${T.itemIcon}<br>
        <div class="icon-picker">
          <button type="button" data-val="">–</button>${iconButtons}
          <input type="hidden" name="icon">
        </div>
      </label>
      <label>${T.itemNote}<br><textarea name="note" rows="2"></textarea></label>
      <label>${T.reminderMode}<br>
        <select name="reminderMode">
          <option value="${REMINDER_NONE}">${T.reminderNone}</option>
          <option value="${REMINDER_DATETIME}">${T.reminderExactTime}</option>
          <option value="${REMINDER_MINUTES}">${T.reminderAfter}</option>
        </select>
      </label>
      <label data-reminder="${REMINDER_DATETIME}" hidden>${T.reminderExactTime}<br><input name="reminderAt" type="datetime-local"></label>
      <label data-reminder="${REMINDER_MINUTES}" hidden>${T.reminderMinutes}<br><input name="reminderMinutes" type="number" min="0" step="1"></label>
      <p class="error" id="itemErr" role="status" aria-live="polite"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'itemFormLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('#itemErr');
    const cancel = form.querySelector('[data-act="cancel"]');
    const picker = form.querySelector('.icon-picker');
    const iconInput = form.icon;
    form.type.value = data.type || 'link';
    form.title.value = data.title || '';
    form.url.value = data.url || '';
    iconInput.value = data.icon || '';
    form.note.value = data.note || '';
    const hasReminderMinutes =
      typeof data.reminderMinutes === 'number' && data.reminderMinutes > 0;
    const hasReminderAt = Number.isFinite(data.reminderAt);
    let reminderMode = REMINDER_NONE;
    if (hasReminderAt) reminderMode = REMINDER_DATETIME;
    else if (hasReminderMinutes) reminderMode = REMINDER_MINUTES;
    form.reminderMode.value = reminderMode;
    form.reminderMinutes.value = hasReminderMinutes ? data.reminderMinutes : '';
    form.reminderAt.value = hasReminderAt
      ? formatDateTimeLocal(data.reminderAt)
      : '';
    setupReminderControls(form);

    const initBtn = picker.querySelector(
      `button[data-val="${iconInput.value}"]`,
    );
    if (initBtn) initBtn.classList.add('selected');

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      iconInput.value = btn.dataset.val;
      picker
        .querySelectorAll('button')
        .forEach((b) => b.classList.toggle('selected', b === btn));
    });

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(form));
      formData.title = formData.title.trim();
      formData.url = formData.url.trim();
      formData.icon = formData.icon.trim();
      formData.note = formData.note.trim();
      const reminderMode = formData.reminderMode || REMINDER_NONE;
      const minutesVal = parseInt(formData.reminderMinutes, 10);
      formData.reminderMode = reminderMode;
      formData.reminderMinutes =
        reminderMode === REMINDER_MINUTES &&
        Number.isFinite(minutesVal) &&
        minutesVal > 0
          ? Math.max(0, Math.round(minutesVal))
          : 0;
      formData.reminderAt =
        reminderMode === REMINDER_DATETIME && formData.reminderAt
          ? formData.reminderAt
          : '';
      if (!formData.title || !formData.url) {
        err.textContent = T.required;
        return;
      }
      try {
        const u = new URL(formData.url);
        if (!/^https?:$/.test(u.protocol)) {
          err.textContent = T.invalidUrl;
          return;
        }
      } catch {
        err.textContent = T.invalidUrl;
        return;
      }
      resolve(formData);
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}

export function chartFormDialog(T, data = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="chartForm">
      <label id="chartFormLabel">${T.itemTitle}<br><input name="title" required></label>
      <label>${T.itemUrl}<br><input name="url" required></label>
      <p class="error" id="chartErr" role="status" aria-live="polite"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'chartFormLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('#chartErr');
    const cancel = form.querySelector('[data-act="cancel"]');
    form.title.value = data.title || '';
    form.url.value = data.url || '';

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const title = form.title.value.trim();
      const url = form.url.value.trim();
      if (!title || !url) {
        err.textContent = T.required;
        return;
      }
      resolve({ title, url });
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}

export function notesDialog(
  T,
  data = {
    title: '',
    text: '',
    size: 16,
    padding: 8,
    reminderMinutes: 0,
    reminderAt: null,
  },
) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="notesForm">
      <label id="notesFormLabel">${T.noteTitle}<br><input name="title" type="text"></label>
      <label>${T.notes}<br><textarea name="note" rows="8"></textarea></label>
      <label>${T.noteSize}<br><input name="size" type="number" min="10" max="48"></label>
      <label>${T.notePadding}<br><input name="padding" type="number" min="0" max="100"></label>
      <label>${T.reminderMode}<br>
        <select name="reminderMode">
          <option value="${REMINDER_NONE}">${T.reminderNone}</option>
          <option value="${REMINDER_DATETIME}">${T.reminderExactTime}</option>
          <option value="${REMINDER_MINUTES}">${T.reminderAfter}</option>
        </select>
      </label>
      <label data-reminder="${REMINDER_DATETIME}" hidden>${T.reminderExactTime}<br><input name="reminderAt" type="datetime-local"></label>
      <label data-reminder="${REMINDER_MINUTES}" hidden>${T.reminderMinutes}<br><input name="reminderMinutes" type="number" min="0" step="1"></label>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'notesFormLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const cancel = form.querySelector('[data-act="cancel"]');
    form.title.value = data.title || '';
    form.note.value = data.text || '';
    form.size.value = data.size || 16;
    form.padding.value = data.padding || 8;
    const hasReminderMinutes =
      typeof data.reminderMinutes === 'number' && data.reminderMinutes > 0;
    const hasReminderAt = Number.isFinite(data.reminderAt);
    let reminderMode = REMINDER_NONE;
    if (hasReminderAt) reminderMode = REMINDER_DATETIME;
    else if (hasReminderMinutes) reminderMode = REMINDER_MINUTES;
    form.reminderMode.value = reminderMode;
    form.reminderMinutes.value = hasReminderMinutes ? data.reminderMinutes : '';
    form.reminderAt.value = hasReminderAt
      ? formatDateTimeLocal(data.reminderAt)
      : '';
    setupReminderControls(form);

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const reminderMode = form.reminderMode.value || REMINDER_NONE;
      const reminderVal = parseInt(form.reminderMinutes.value, 10);
      const reminderMinutes =
        reminderMode === REMINDER_MINUTES &&
        Number.isFinite(reminderVal) &&
        reminderVal > 0
          ? Math.max(0, Math.round(reminderVal))
          : 0;
      const reminderAt =
        reminderMode === REMINDER_DATETIME && form.reminderAt.value
          ? form.reminderAt.value
          : '';
      resolve({
        title: form.title.value.trim(),
        text: form.note.value.trim(),
        size: parseInt(form.size.value, 10) || 16,
        padding: parseInt(form.padding.value, 10) || 8,
        reminderMinutes,
        reminderMode,
        reminderAt,
      });
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}

export function themeSelectDialog(T, themes = [], current = 'dark') {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const options = themes
      .map((t) => {
        const v = t.vars;
        const name = t.id.charAt(0).toUpperCase() + t.id.slice(1);
        const sel = t.id === current ? ' aria-current="true"' : '';
        return `<button type="button" data-id="${t.id}" class="theme-opt"${sel}><span style="display:inline-block;width:24px;height:24px;background:${v.bg};border:4px solid ${v.accent};margin-right:8px;"></span>${name}</button>`;
      })
      .join('');
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<div class="theme-list">${options}</div><menu><button type="button" data-act="custom">${T.customize}</button><button type="button" data-act="cancel">${T.cancel}</button></menu>`;
    dlg.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlg);
    const list = dlg.querySelector('.theme-list');
    const cancel = dlg.querySelector('[data-act="cancel"]');
    const custom = dlg.querySelector('[data-act="custom"]');

    function cleanup() {
      list.removeEventListener('click', choose);
      cancel.removeEventListener('click', close);
      custom.removeEventListener('click', customize);
      dlg.remove();
      prevFocus?.focus();
    }

    function choose(e) {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      resolve(btn.dataset.id);
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    function customize() {
      resolve('customize');
      cleanup();
    }

    list.addEventListener('click', choose);
    cancel.addEventListener('click', close);
    custom.addEventListener('click', customize);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    list.querySelector('button')?.focus();
  });
}

export function themeDialog(T, data = {}) {
  return new Promise((resolve) => {
    const fields = [
      { key: 'bg', label: 'Fonas' },
      { key: 'panel', label: 'Skydelio fonas' },
      { key: 'muted', label: 'Pasyvi zona' },
      { key: 'text', label: 'Tekstas' },
      { key: 'subtext', label: 'Antrinis tekstas' },
      { key: 'accent', label: 'Akcentas' },
      { key: 'accent2', label: 'Akcentas (2)' },
      { key: 'btn-accent-text', label: 'Akcento tekstas' },
      { key: 'danger', label: 'Pavojaus spalva' },
      { key: 'danger2', label: 'Pavojaus spalva (2)' },
      { key: 'btn-danger-text', label: 'Pavojaus teksto spalva' },
      { key: 'warn', label: 'Įspėjimas' },
      { key: 'ok', label: 'OK' },
      { key: 'card', label: 'Kortelės fonas' },
    ];
    const inputs = fields
      .map(
        ({ key, label }) =>
          `<label>${label}<br><input name="${key}" type="color" value="${
            data[key] || '#000000'
          }"></label>`,
      )
      .join('');
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="themeForm">${inputs}<menu><button type="button" data-act="reset">${T.reset}</button><button type="button" data-act="cancel">${T.cancel}</button><button type="submit" class="btn-accent">${T.save}</button></menu></form>`;
    dlg.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const firstLabel = form.querySelector('label');
    if (firstLabel) {
      firstLabel.id = 'themeFormLabel';
      dlg.setAttribute('aria-labelledby', 'themeFormLabel');
    }
    const cancel = form.querySelector('[data-act="cancel"]');
    const resetBtn = form.querySelector('[data-act="reset"]');

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      resetBtn.removeEventListener('click', reset);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(form));
      resolve(formData);
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    function reset() {
      fields.forEach(({ key }) => {
        form.elements[key].value = data[key] || '#000000';
      });
    }

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    resetBtn.addEventListener('click', reset);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}

export function confirmDialog(T, msg) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog"><p id="confirmMsg">${msg}</p><menu><button value="cancel">${T.cancel}</button><button value="ok" class="btn-danger">${T.remove}</button></menu></form>`;
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'confirmMsg');
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
      prevFocus?.focus();
    });
    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
}
