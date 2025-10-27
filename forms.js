import { I } from './icons.js';

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toArray(value, fallback = []) {
  if (Array.isArray(value) && value.length) return value;
  return fallback;
}

function parseShortcutEntry(entry) {
  if (typeof entry !== 'string') return null;
  const [keysPart, descPart] = entry.split(':');
  if (!keysPart || !descPart) return null;
  const keys = keysPart
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) return null;
  const description = descPart.trim();
  if (!description) return null;
  return { keys, description };
}

export function helpDialog(T) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.classList.add('help-dialog');

    const title = T.helpTitle || 'Spartus naudojimo gidas';
    const intro = T.helpIntro ||
      'Kelios gairės, kaip greitai pradėti dirbti su skydeliu.';
    const quickItems = toArray(T.helpQuickItems, [
      'Paspauskite „Redaguoti“, kad keistumėte pavadinimą, ikoną ir įjungtumėte kortelių tvarkymą.',
      'Sukurkite grupes (pvz., „Pamaina“, „Formos“) ir įrašus su nuorodomis ar įterpimais.',
      'Korteles galite tempti ir keisti jų dydį – laikykite Shift, kad pažymėtumėte kelias.',
      'Įjunkite priminimų kortelę ir naudokite laikmačius dažniausioms užduotims.',
    ]);
    const shortcutEntries = toArray(T.helpShortcuts, [
      '/: Fokusuoja paiešką',
      'Ctrl + K: Įjungia pridėjimo meniu',
      '?: Atidaro pagalbos langą',
    ]);
    const shortcuts = shortcutEntries
      .map((entry) => parseShortcutEntry(entry))
      .filter(Boolean);
    const tips = toArray(T.helpTips, [
      'Eksportuokite JSON failą prieš dalindamiesi skydeliu – turėsite atsarginę kopiją.',
      'Tema keičiama viršuje esančiu mėnulio/saulės mygtuku.',
      'Mygtukas „🖼 Paveikslėlis“ leidžia įkelti logotipą, „✕ Pašalinti“ – išvalyti ikoną.',
    ]);
    const quickHtml = quickItems
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const shortcutsHtml = shortcuts
      .map((entry) => {
        const keysHtml = entry.keys
          .map((key) => `<kbd>${escapeHtml(key)}</kbd>`)
          .join('<span class="help-dialog__shortcut-plus">+</span>');
        return `<li class="help-dialog__shortcut"><span class="help-dialog__shortcut-keys">${keysHtml}</span><span class="help-dialog__shortcut-desc">${escapeHtml(entry.description)}</span></li>`;
      })
      .join('');
    const tipsHtml = tips
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    const quickSection = quickItems.length
      ? `<section class="help-dialog__section"><h3 class="help-dialog__section-title">${escapeHtml(
          T.helpQuickTitle || 'Dažniausi veiksmai',
        )}</h3><ol class="help-dialog__list help-dialog__list--numbered">${quickHtml}</ol></section>`
      : '';
    const shortcutSection = shortcuts.length
      ? `<section class="help-dialog__section"><h3 class="help-dialog__section-title">${escapeHtml(
          T.helpShortcutsTitle || 'Klaviatūros trumpiniai',
        )}</h3><ul class="help-dialog__shortcuts">${shortcutsHtml}</ul></section>`
      : '';
    const tipsSection = tips.length
      ? `<section class="help-dialog__section"><h3 class="help-dialog__section-title">${escapeHtml(
          T.helpTipsTitle || 'Papildomi patarimai',
        )}</h3><ul class="help-dialog__list help-dialog__list--bullets">${tipsHtml}</ul></section>`
      : '';

    const closeLabel = T.helpClose || T.cancel || 'Uždaryti';
    const iconHtml = I.help || '';

    dlg.innerHTML = `<form method="dialog" class="help-dialog__form" id="helpDialogForm"><div class="help-dialog__header"><h2 class="help-dialog__title" id="helpDialogLabel"><span class="help-dialog__title-icon" aria-hidden="true">${iconHtml}</span>${escapeHtml(
      title,
    )}</h2><p class="help-dialog__intro">${escapeHtml(intro)}</p></div><div class="help-dialog__sections">${
      quickSection + shortcutSection + tipsSection
    }</div><menu><button type="submit" class="btn-outline" data-act="close">${escapeHtml(
      closeLabel,
    )}</button></menu></form>`;

    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'helpDialogLabel');
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const closeBtn = form.querySelector('[data-act="close"]');

    function cleanup() {
      form.removeEventListener('submit', submit);
      closeBtn?.removeEventListener('click', close);
      dlg.removeEventListener('cancel', close);
      dlg.remove();
      prevFocus?.focus();
      resolve();
    }

    function close() {
      dlg.close();
      cleanup();
    }

    function submit(e) {
      e.preventDefault();
      close();
    }

    form.addEventListener('submit', submit);
    closeBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
    dlg.addEventListener('cancel', close);
    dlg.showModal();
    if (closeBtn instanceof HTMLElement) {
      closeBtn.focus();
    }
  });
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
      if (!key && action !== 'quick') return;
      const meta = { ...btn.dataset };
      const result = await onAction(action, key, meta);
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
    const paletteColors = [
      { value: '#f1f5f9', label: 'Švelni pilka' },
      { value: '#e0f2fe', label: 'Rami mėlyna' },
      { value: '#e9d5ff', label: 'Levandų violetinė' },
      { value: '#fce7f3', label: 'Pastelinė rožinė' },
      { value: '#fef3c7', label: 'Šilta gelsva' },
      { value: '#dcfce7', label: 'Švelni žalia' },
      { value: '#f5f3ff', label: 'Šviesi alyvinė' },
      { value: '#ffe4e6', label: 'Švelni koralinė' },
    ];
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    const paletteButtons = paletteColors
      .map(
        (c) =>
          `<button type="button" data-color="${c.value}" style="--swatch:${c.value}" aria-label="${escapeHtml(
            c.label,
          )}" aria-pressed="false"></button>`,
      )
      .join('');
    dlg.innerHTML = `<form method="dialog" id="groupForm" class="group-form">
      <header class="group-form__header">
        <h2 id="groupFormLabel">${escapeHtml(
          T.groupDialogTitle || 'Nauja kortelė',
        )}</h2>
        <p class="group-form__description">${escapeHtml(
          T.groupDialogDescription || 'Sukurkite kortelę, parinkite jai spalvą ir dydį.',
        )}</p>
      </header>
      <label class="group-form__field">
        <span class="group-form__label">${escapeHtml(T.groupName)}</span>
        <input name="name" required placeholder="pvz., „Pamaina“" autocomplete="off">
      </label>
      <section class="group-form__field" aria-labelledby="groupColorLabel">
        <div class="group-form__label-row">
          <span id="groupColorLabel" class="group-form__label">${escapeHtml(
            T.groupColor,
          )}</span>
          <span class="group-form__hint">${escapeHtml(
            T.groupPaletteLabel || 'Švelni paletė',
          )}</span>
        </div>
        <div class="group-form__color">
          <div class="group-form__palette" role="listbox" aria-labelledby="groupColorLabel">
            ${paletteButtons}
          </div>
          <label class="group-form__custom-color">
            <span class="group-form__custom-label">${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}</span>
            <input name="color" type="color" value="#6ee7b7" aria-label="${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}">
          </label>
        </div>
      </section>
      <fieldset class="group-form__field">
        <legend class="group-form__label">${escapeHtml(T.groupSize)}</legend>
        <div class="group-form__sizes" role="radiogroup">
          <label class="group-form__size">
            <input type="radio" name="size" value="sm">
            <span>${escapeHtml(T.sizeSm)}</span>
          </label>
          <label class="group-form__size">
            <input type="radio" name="size" value="md">
            <span>${escapeHtml(T.sizeMd)}</span>
          </label>
          <label class="group-form__size">
            <input type="radio" name="size" value="lg">
            <span>${escapeHtml(T.sizeLg)}</span>
          </label>
        </div>
      </fieldset>
      <div class="group-form__preview" aria-hidden="true">
        <span class="group-form__preview-label">${escapeHtml(
          T.preview || 'Peržiūra',
        )}</span>
        <div class="group-form__preview-card" data-size="md">
          <div class="group-form__preview-dot"></div>
          <div class="group-form__preview-content">
            <span class="group-form__preview-title">${escapeHtml(
              T.groupPreviewPlaceholder || 'Kortelė',
            )}</span>
            <span class="group-form__preview-sub">${escapeHtml(
              T.groupDialogDescription || 'Sukurkite kortelę, parinkite jai spalvą ir dydį.',
            )}</span>
          </div>
        </div>
      </div>
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
    const defaultColor = data.color || '#6ee7b7';
    const initialSize = data.size || 'md';
    form.name.value = data.name || '';
    form.color.value = defaultColor;
    form.size.value = initialSize;
    const palette = Array.from(
      dlg.querySelectorAll('.group-form__palette button[data-color]'),
    );
    const previewCard = dlg.querySelector('.group-form__preview-card');
    const previewTitle = dlg.querySelector('.group-form__preview-title');
    const previewSub = dlg.querySelector('.group-form__preview-sub');
    const sizeInputs = Array.from(form.querySelectorAll('input[name="size"]'));
    sizeInputs.forEach((input) => {
      input.checked = input.value === initialSize;
    });

    function updatePaletteSelection(value) {
      palette.forEach((btn) => {
        const selected = btn.dataset.color?.toLowerCase() === value.toLowerCase();
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function updateSizeSelection() {
      sizeInputs.forEach((input) => {
        const label = input.closest('.group-form__size');
        if (!label) return;
        label.classList.toggle('group-form__size--selected', input.checked);
      });
    }

    function updatePreview() {
      if (!previewCard) return;
      const color = form.color.value || '#6ee7b7';
      previewCard.style.setProperty('--group-accent', color);
      const name = form.name.value.trim();
      if (previewTitle) {
        previewTitle.textContent = name || (T.groupPreviewPlaceholder || 'Kortelė');
      }
      if (previewSub) {
        previewSub.textContent = T.groupDialogDescription ||
          'Sukurkite kortelę, parinkite jai spalvą ir dydį.';
      }
      previewCard.dataset.size = form.size.value || 'md';
      updateSizeSelection();
    }

    function applyColor(value) {
      if (!value) return;
      form.color.value = value;
      updatePaletteSelection(value);
      updatePreview();
    }

    const paletteContainer = dlg.querySelector('.group-form__palette');

    function handlePaletteClick(e) {
      const btn = e.target.closest('button[data-color]');
      if (!btn) return;
      e.preventDefault();
      applyColor(btn.dataset.color);
      btn.focus();
    }

    function handlePaletteKeydown(e) {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        return;
      }
      const current = document.activeElement;
      const index = palette.indexOf(current);
      if (index === -1) return;
      e.preventDefault();
      let nextIndex = index;
      if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = palette.length - 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = Math.min(palette.length - 1, index + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
      const next = palette[nextIndex];
      next?.focus();
      if (next?.dataset.color) {
        applyColor(next.dataset.color);
      }
    }

    function handleColorInput(e) {
      applyColor(e.target.value);
    }

    function handleNameInput() {
      updatePreview();
    }

    function handleSizeChange() {
      updatePreview();
    }

    paletteContainer?.addEventListener('click', handlePaletteClick);
    paletteContainer?.addEventListener('keydown', handlePaletteKeydown);
    form.color.addEventListener('input', handleColorInput);
    form.name.addEventListener('input', handleNameInput);
    sizeInputs.forEach((input) => input.addEventListener('change', handleSizeChange));

    updatePaletteSelection(defaultColor);
    updatePreview();
    updateSizeSelection();

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      paletteContainer?.removeEventListener('click', handlePaletteClick);
      paletteContainer?.removeEventListener('keydown', handlePaletteKeydown);
      form.color.removeEventListener('input', handleColorInput);
      form.name.removeEventListener('input', handleNameInput);
      sizeInputs.forEach((input) => input.removeEventListener('change', handleSizeChange));
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
    size: 20,
    padding: 20,
    color: '#fef08a',
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
      <label>${T.noteColor}<br><input name="color" type="color"></label>
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
    const initSize = Number.parseInt(data.size, 10);
    const initPadding = Number.parseInt(data.padding, 10);
    form.size.value = Number.isFinite(initSize) ? initSize : 20;
    form.padding.value = Number.isFinite(initPadding) ? initPadding : 20;
    form.color.value = data.color || '#fef08a';

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const sizeVal = Number.parseInt(form.size.value, 10);
      const paddingVal = Number.parseInt(form.padding.value, 10);
      resolve({
        title: form.title.value.trim(),
        text: form.note.value.trim(),
        size: Number.isFinite(sizeVal) ? sizeVal : 20,
        padding: Number.isFinite(paddingVal) ? paddingVal : 20,
        color: form.color.value || '#fef08a',
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
