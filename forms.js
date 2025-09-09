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
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="itemForm">
      <label>${T.itemType}<br>
        <select name="type">
          <option value="link">link</option>
          <option value="sheet">sheet</option>
          <option value="embed">embed</option>
        </select>
      </label>
      <label>${T.itemTitle}<br><input name="title" required></label>
      <label>${T.itemUrl}<br><input name="url" type="url" required></label>
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
    form.type.value = data.type || 'link';
    form.title.value = data.title || '';
    form.url.value = data.url || '';
    form.note.value = data.note || '';

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
      formData.note = formData.note.trim();
      if (!formData.title || !formData.url) {
        err.textContent = T.required;
        return;
      }
      try {
        new URL(formData.url);
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
