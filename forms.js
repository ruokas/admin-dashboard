import { I } from './icons.js';

export function groupFormDialog(T, data = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="groupForm">
      <label>${T.groupName}<br><input name="name" required></label>
      <label>${T.groupColor}<br><input name="color" type="color" value="#6ee7b7"></label>
      <p class="error" id="groupErr"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('#groupErr');
    const cancel = form.querySelector('[data-act="cancel"]');
    form.name.value = data.name || '';
    form.color.value = data.color || '#6ee7b7';

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
    }

    function submit(e) {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) {
        err.textContent = T.required;
        return;
      }
      resolve({ name, color: form.color.value });
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
    ];
    const iconButtons = iconKeys
      .map(
        (k) =>
          `<button type="button" data-val="${k}" title="${k}">${I[k]}</button>`,
      )
      .join('');
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="itemForm">
      <label>${T.itemType}<br>
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
      <p class="error" id="itemErr"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
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
    }

    function submit(e) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(form));
      formData.title = formData.title.trim();
      formData.url = formData.url.trim();
      formData.icon = formData.icon.trim();
      formData.note = formData.note.trim();
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
    form.title.focus();
  });
}

export function chartFormDialog(T, data = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="chartForm">
      <label>${T.itemTitle}<br><input name="title" required></label>
      <label>${T.itemUrl}<br><input name="url" required></label>
      <p class="error" id="chartErr"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
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
    form.title.focus();
  });
}

export function notesDialog(
  T,
  data = { text: '', size: 16, padding: 8 },
) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="notesForm">
      <label>${T.notes}<br><textarea name="note" rows="8"></textarea></label>
      <label>${T.noteSize}<br><input name="size" type="number" min="10" max="48"></label>
      <label>${T.notePadding}<br><input name="padding" type="number" min="0" max="100"></label>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const cancel = form.querySelector('[data-act="cancel"]');
    form.note.value = data.text || '';
    form.size.value = data.size || 16;
    form.padding.value = data.padding || 8;

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
    }

    function submit(e) {
      e.preventDefault();
      resolve({
        text: form.note.value.trim(),
        size: parseInt(form.size.value, 10) || 16,
        padding: parseInt(form.padding.value, 10) || 8,
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
    form.note.focus();
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
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="themeForm">${inputs}<menu><button type="button" data-act="cancel">${T.cancel}</button><button type="submit" class="btn-accent">${T.save}</button></menu></form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const cancel = form.querySelector('[data-act="cancel"]');

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
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

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    dlg.showModal();
  });
}

export function confirmDialog(T, msg) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog"><p>${msg}</p><menu><button value="cancel">${T.cancel}</button><button value="ok" class="btn-danger">${T.remove}</button></menu></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    dlg.showModal();
  });
}
