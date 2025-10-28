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
    const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const DEFAULT_GROUP_COLOR = '#10b981';

    function expandHex(hex) {
      if (!HEX_COLOR_RE.test(hex)) return null;
      const lower = hex.toLowerCase();
      if (lower.length === 4) {
        return (
          '#' +
          lower
            .slice(1)
            .split('')
            .map((ch) => ch + ch)
            .join('')
        );
      }
      return lower;
    }

    function hexToRgb(hex) {
      const normalized = expandHex(hex);
      if (!normalized) return null;
      return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
      };
    }

    function toHexChannel(n) {
      return Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');
    }

    function mixHex(base, target, ratio) {
      const src = hexToRgb(base);
      const dst = hexToRgb(target);
      if (!src || !dst) return base;
      const clampRatio = Math.max(0, Math.min(1, Number(ratio)));
      const r = src.r + (dst.r - src.r) * clampRatio;
      const g = src.g + (dst.g - src.g) * clampRatio;
      const b = src.b + (dst.b - src.b) * clampRatio;
      return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
    }

    function normalizeHex(hex, fallback = DEFAULT_GROUP_COLOR) {
      const expanded = expandHex(hex);
      if (expanded) return expanded;
      if (HEX_COLOR_RE.test(hex)) return hex.toLowerCase();
      return fallback;
    }

    function makeAutoGradient(hex) {
      const normalized = expandHex(hex);
      if (!normalized) {
        return `linear-gradient(135deg, ${hex}, ${hex})`;
      }
      const bright = mixHex(normalized, '#ffffff', 0.38);
      const mid = mixHex(normalized, '#ffffff', 0.12);
      const deep = mixHex(normalized, '#000000', 0.18);
      return `linear-gradient(135deg, ${bright}, ${mid}, ${deep})`;
    }

    const paletteColors = [
      { value: DEFAULT_GROUP_COLOR, label: 'Ryški žalia' },
      { value: '#0ea5e9', label: 'Ryški žydra' },
      { value: '#6366f1', label: 'Gilus mėlynas' },
      { value: '#a855f7', label: 'Sodri violetinė' },
      { value: '#ec4899', label: 'Ryški avietinė' },
      { value: '#f97316', label: 'Ryški oranžinė' },
      { value: '#ef4444', label: 'Sodri raudona' },
      { value: '#facc15', label: 'Ryški gelsva' },
    ];
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    const paletteButtons = paletteColors
      .map((c) => {
        const norm = normalizeHex(c.value);
        const gradient = makeAutoGradient(norm);
        return `<button type="button" data-color="${norm}" style="--swatch:${norm};--swatch-gradient:${gradient}" aria-label="${escapeHtml(
          c.label,
        )}" aria-pressed="false"></button>`;
      })
      .join('');
    dlg.innerHTML = `<form method="dialog" id="groupForm" class="group-form">
      <header class="group-form__header">
        <h2 id="groupFormLabel">${escapeHtml(
          T.groupDialogTitle || 'Nauja kortelė',
        )}</h2>
      </header>
      <label class="group-form__field">
        <span class="group-form__label">${escapeHtml(T.groupName)}</span>
        <input name="name" required autocomplete="off">
      </label>
      <section class="group-form__field" aria-labelledby="groupColorLabel">
        <div class="group-form__label-row">
          <span id="groupColorLabel" class="group-form__label">${escapeHtml(
            T.groupColor,
          )}</span>
        </div>
        <div class="group-form__color">
          <div class="group-form__palette" role="listbox" aria-labelledby="groupColorLabel">
            ${paletteButtons}
          </div>
          <label class="group-form__custom-color">
            <input name="color" type="color" value="${DEFAULT_GROUP_COLOR}" aria-label="${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}">
            <span class="group-form__custom-label">${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}</span>
          </label>
        </div>
      </section>
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
    const defaultColor = normalizeHex(data.color || DEFAULT_GROUP_COLOR);
    form.name.value = data.name || '';
    form.color.value = defaultColor;
    const palette = Array.from(
      dlg.querySelectorAll('.group-form__palette button[data-color]'),
    );
    function updatePaletteSelection(value) {
      palette.forEach((btn) => {
        const selected = btn.dataset.color?.toLowerCase() === value.toLowerCase();
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function applyColor(value) {
      if (!value) return;
      const normalized = normalizeHex(value);
      form.color.value = normalized;
      form.color.style.setProperty('--custom-swatch', normalized);
      updatePaletteSelection(normalized);
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

    paletteContainer?.addEventListener('click', handlePaletteClick);
    paletteContainer?.addEventListener('keydown', handlePaletteKeydown);
    form.color.addEventListener('input', handleColorInput);

    applyColor(defaultColor);

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      paletteContainer?.removeEventListener('click', handlePaletteClick);
      paletteContainer?.removeEventListener('keydown', handlePaletteKeydown);
      form.color.removeEventListener('input', handleColorInput);
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
      const normalized = normalizeHex(form.color.value || DEFAULT_GROUP_COLOR);
      resolve({ name, color: normalized });
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
    const iconLabels = {
      none: 'Be piktogramos',
      globe: 'Interneto nuoroda',
      table: 'Lentelė',
      chart: 'Diagrama',
      puzzle: 'Integracija',
      book: 'Gairės',
      file: 'Dokumentas',
      folder: 'Aplankas',
      mail: 'El. paštas',
      phone: 'Telefonas',
      star: 'Svarbu',
      home: 'Pagrindinis',
      link: 'Nuoroda',
      camera: 'Kamera',
      calendar: 'Kalendorius',
      clock: 'Laikmatis',
      user: 'Kontaktas',
      clipboard: 'Ataskaita',
      chat: 'Pokalbis',
      video: 'Vaizdo įrašas',
      map: 'Žemėlapis',
      shield: 'Sauga',
      alert: 'Įspėjimas',
      ...(T.iconLabels || {}),
    };
    const iconButtons = iconKeys
      .map((k) => {
        const label = escapeHtml(iconLabels[k] || k);
        return `<button type="button" role="option" data-val="${k}" title="${label}" aria-label="${label}" aria-selected="false">${I[k]}</button>`;
      })
      .join('');
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.classList.add('item-form-dialog');
    const isEditing = Boolean(data && Object.keys(data).length);
    const formTitle = escapeHtml(
      isEditing
        ? T.itemFormTitleEdit || T.editItem || T.edit || 'Redaguoti įrašą'
        : T.itemFormTitleCreate || T.addItem || 'Pridėti įrašą',
    );
    const formSubtitle = escapeHtml(
      T.itemFormSubtitle || 'Įveskite nuorodos duomenis.',
    );
    const resolvedType = data.type || 'link';
    dlg.innerHTML = `<form method="dialog" id="itemForm">
      <header class="item-form__header">
        <h2 class="item-form__title" id="itemFormLabel">${formTitle}</h2>
        <p class="item-form__subtitle">${formSubtitle}</p>
      </header>
      <div class="item-form__grid">
        <label class="item-form__field item-form__field--full">
          <span class="item-form__label">${escapeHtml(T.itemTitle)}</span>
          <input name="title" required>
        </label>
        <label class="item-form__field item-form__field--full">
          <span class="item-form__label">${escapeHtml(T.itemUrl)}</span>
          <input name="url" type="url" required>
        </label>
        <label class="item-form__field item-form__field--full">
          <span class="item-form__label">${escapeHtml(T.itemIcon)}</span>
          <div class="icon-picker" role="listbox">
            <button type="button" role="option" data-val="" title="${escapeHtml(
              (T.iconLabels && T.iconLabels.none) || iconLabels.none,
            )}" aria-label="${escapeHtml(
              (T.iconLabels && T.iconLabels.none) || iconLabels.none,
            )}" aria-selected="false">–</button>${iconButtons}
            <input type="hidden" name="icon">
          </div>
        </label>
        <label class="item-form__field item-form__field--full">
          <span class="item-form__label">${escapeHtml(T.itemNote)}</span>
          <textarea name="note" rows="2"></textarea>
        </label>
      </div>
      <p class="error" id="itemErr" role="status" aria-live="polite"></p>
      <menu class="item-form__actions">
        <button type="button" class="btn-outline" data-act="cancel">${escapeHtml(
          T.cancel,
        )}</button>
        <button type="submit" class="btn-accent">${escapeHtml(T.save)}</button>
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
    form.title.value = data.title || '';
    form.url.value = data.url || '';
    iconInput.value = data.icon || '';
    form.note.value = data.note || '';

    const initBtn = picker.querySelector(
      `button[data-val="${iconInput.value}"]`,
    );
    if (initBtn) {
      initBtn.classList.add('selected');
      initBtn.setAttribute('aria-selected', 'true');
    }

    picker
      .querySelectorAll('button')
      .forEach((btn) =>
        btn.setAttribute('aria-selected', btn.classList.contains('selected') ? 'true' : 'false'),
      );

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      iconInput.value = btn.dataset.val;
      picker
        .querySelectorAll('button')
        .forEach((b) => {
          const isSelected = b === btn;
          b.classList.toggle('selected', isSelected);
          b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
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
      formData.type = resolvedType;
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
    const DEFAULT_SCALE_PERCENT = 100;
    const MIN_SCALE_PERCENT = 50;
    const MAX_SCALE_PERCENT = 200;
    const DEFAULT_PREVIEW_HEIGHT = 480;
    const DEFAULT_PREVIEW_WIDTH = 640;
    const MIN_AUTO_HEIGHT = 120;
    const MAX_AUTO_HEIGHT = 2000;
    const MIN_AUTO_WIDTH = 200;
    const MAX_AUTO_WIDTH = 2400;

    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" id="chartForm">
      <fieldset class="form-section">
        <legend>${T.chartBasics || 'Pagrindiniai nustatymai'}</legend>
        <label id="chartFormLabel">${T.itemTitle}<br><input name="title" required></label>
        <label>${T.itemUrl}<br><textarea name="url" rows="3" required></textarea></label>
      </fieldset>
      <fieldset class="form-section">
        <legend>${T.chartDisplay || 'Atvaizdavimo parametrai'}</legend>
        <div class="chart-form__grid">
          <label class="chart-form__scale">${T.chartScale || 'Mastelis'}
            <input type="range" name="scale" min="${MIN_SCALE_PERCENT}" max="${MAX_SCALE_PERCENT}" step="5">
            <span class="chart-form__scale-value" data-chart-scale-value>100%</span>
          </label>
        </div>
        <p class="hint">${
          T.chartHint ||
          'Įveskite iframe nuorodą ar kodą. Kortelės plotis ir aukštis prisitaiko automatiškai, mastelį keiskite slankikliu.'
        }</p>
      </fieldset>
      <section class="chart-preview" aria-live="polite">
        <header class="chart-preview__header">
          <h3>${T.chartPreview || 'Gyva peržiūra'}</h3>
          <p class="chart-preview__meta">
            <span>${T.chartPreviewScale || 'Mastelis'}: <strong data-chart-scale-label>100%</strong></span>
            <span>${
              T.chartPreviewWidth || 'Rodymo plotis'
            }: <strong data-chart-width-label>${DEFAULT_PREVIEW_WIDTH}px</strong></span>
            <span>${
              T.chartPreviewHeight || 'Rodymo aukštis'
            }: <strong data-chart-height-label>${DEFAULT_PREVIEW_HEIGHT}px</strong></span>
          </p>
        </header>
        <div class="chart-preview__frame" data-state="empty">
          <div class="chart-preview__placeholder" data-chart-placeholder>${
            T.chartPreviewPlaceholder || 'Įveskite nuorodą, kad pamatytumėte grafiką.'
          }</div>
          <iframe title="${
            T.chartPreviewFrameTitle || 'Grafiko peržiūra'
          }" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-forms"></iframe>
        </div>
        <p class="chart-preview__status" data-chart-status></p>
        <p class="chart-preview__hint">${
          T.chartDragHint ||
          'Reguliuokite mastelį slankikliu aukščiau – kortelės dydis prisitaikys automatiškai.'
        }</p>
      </section>
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
    const urlField = form.elements.url;
    const titleField = form.elements.title;
    const scaleField = form.elements.scale;
    const scaleValue = form.querySelector('[data-chart-scale-value]');
    const scaleLabel = form.querySelector('[data-chart-scale-label]');
    const widthLabel = form.querySelector('[data-chart-width-label]');
    const heightLabel = form.querySelector('[data-chart-height-label]');
    const previewWrap = form.querySelector('.chart-preview__frame');
    const previewFrame = previewWrap.querySelector('iframe');
    const previewPlaceholder = form.querySelector('[data-chart-placeholder]');
    const previewStatus = form.querySelector('[data-chart-status]');

    const initialScale = Number.isFinite(data.scale)
      ? Math.round(Number(data.scale) * 100)
      : DEFAULT_SCALE_PERCENT;
    const initialHeight = [data.frameHeight, data.height, data.h]
      .map((val) => Number(val))
      .find((val) => Number.isFinite(val));
    const initialWidth = [data.frameWidth, data.width, data.w]
      .map((val) => Number(val))
      .find((val) => Number.isFinite(val));

    let derivedHeight = Number.isFinite(initialHeight)
      ? Math.max(MIN_AUTO_HEIGHT, Math.min(MAX_AUTO_HEIGHT, initialHeight))
      : null;
    let derivedWidth = Number.isFinite(initialWidth)
      ? Math.max(MIN_AUTO_WIDTH, Math.min(MAX_AUTO_WIDTH, initialWidth))
      : null;
    let currentSrc = '';
    let hasLoaded = false;

    const clampPercent = (value) => {
      const numeric = Number.parseInt(value, 10);
      if (!Number.isFinite(numeric)) return DEFAULT_SCALE_PERCENT;
      return Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, numeric));
    };

    const clampHeight = (value) => {
      const numeric = Number.parseInt(value, 10);
      if (!Number.isFinite(numeric)) return null;
      return Math.min(MAX_AUTO_HEIGHT, Math.max(MIN_AUTO_HEIGHT, numeric));
    };

    const clampWidth = (value) => {
      const numeric = Number.parseInt(value, 10);
      if (!Number.isFinite(numeric)) return null;
      return Math.min(MAX_AUTO_WIDTH, Math.max(MIN_AUTO_WIDTH, numeric));
    };

    const computeBaseHeight = () => {
      if (derivedHeight) return derivedHeight;
      return DEFAULT_PREVIEW_HEIGHT;
    };

    const computeBaseWidth = () => {
      if (derivedWidth) return derivedWidth;
      return DEFAULT_PREVIEW_WIDTH;
    };

    const parseEmbed = (value) => {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) return { src: '', height: null, width: null };
      if (/<iframe/i.test(raw)) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(raw, 'text/html');
          const iframe = doc.querySelector('iframe');
          if (iframe) {
            const srcAttr = iframe.getAttribute('src');
            const heightAttr = iframe.getAttribute('height');
            const widthAttr = iframe.getAttribute('width');
            const parsedHeight = heightAttr ? Number.parseInt(heightAttr, 10) : null;
            const parsedWidth = widthAttr ? Number.parseInt(widthAttr, 10) : null;
            return {
              src: srcAttr ? srcAttr.trim() : '',
              height: Number.isFinite(parsedHeight) ? parsedHeight : null,
              width: Number.isFinite(parsedWidth) ? parsedWidth : null,
            };
          }
        } catch {
          /* noop */
        }
      }
      return { src: raw, height: null, width: null };
    };

    const isValidUrl = (value) => {
      if (!value) return false;
      try {
        const u = new URL(value);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    };

    const applySizing = () => {
      const percent = clampPercent(scaleField.value || DEFAULT_SCALE_PERCENT);
      scaleField.value = percent;
      const scale = percent / 100;
      const baseHeight = computeBaseHeight();
      const baseWidth = computeBaseWidth();
      const displayHeight = Math.round(baseHeight * scale);
      const displayWidth = Math.round(baseWidth * scale);
      scaleValue.textContent = `${percent}%`;
      scaleLabel.textContent = `${percent}%`;
      if (widthLabel) {
        widthLabel.textContent = `${displayWidth}px`;
      }
      heightLabel.textContent = `${displayHeight}px`;
      previewFrame.style.height = `${baseHeight}px`;
      previewFrame.style.width = `${baseWidth}px`;
      previewFrame.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
      previewFrame.style.transformOrigin = 'top left';
      previewWrap.style.height = `${displayHeight}px`;
      previewWrap.style.width = `${displayWidth}px`;
      previewWrap.dataset.scale = String(scale);
      previewWrap.dataset.height = String(baseHeight);
      previewWrap.dataset.width = String(baseWidth);
    };

    const measureFrameSize = () => {
      try {
        const doc = previewFrame.contentDocument;
        if (!doc) return null;
        const body = doc.body;
        const root = doc.documentElement;
        const bodyHeight = body ? Math.max(body.scrollHeight, body.offsetHeight) : 0;
        const rootHeight = root ? Math.max(root.scrollHeight, root.offsetHeight) : 0;
        const bodyWidth = body ? Math.max(body.scrollWidth, body.offsetWidth) : 0;
        const rootWidth = root ? Math.max(root.scrollWidth, root.offsetWidth) : 0;
        const measuredHeight = Math.max(bodyHeight, rootHeight);
        const measuredWidth = Math.max(bodyWidth, rootWidth);
        const safeHeight =
          Number.isFinite(measuredHeight) && measuredHeight > 0
            ? clampHeight(measuredHeight)
            : null;
        const safeWidth =
          Number.isFinite(measuredWidth) && measuredWidth > 0
            ? clampWidth(measuredWidth)
            : null;
        if (!safeHeight && !safeWidth) return null;
        return {
          height: safeHeight,
          width: safeWidth,
        };
      } catch {
        return null;
      }
    };

    const updatePreview = () => {
      err.textContent = '';
      const raw = urlField.value.trim();
      const { src, height, width } = parseEmbed(raw);
      if (!raw) {
        currentSrc = '';
        previewFrame.removeAttribute('src');
        previewWrap.dataset.state = 'empty';
        previewStatus.textContent = '';
        previewPlaceholder.hidden = false;
        hasLoaded = false;
        derivedHeight = null;
        derivedWidth = null;
        applySizing();
        return;
      }

      if (!isValidUrl(src)) {
        currentSrc = '';
        previewFrame.removeAttribute('src');
        previewWrap.dataset.state = 'error';
        previewStatus.textContent = T.invalidUrl;
        previewPlaceholder.hidden = true;
        hasLoaded = false;
        derivedHeight = null;
        derivedWidth = null;
        applySizing();
        return;
      }

      previewWrap.dataset.state = currentSrc === src && hasLoaded ? 'ready' : 'loading';
      previewStatus.textContent = currentSrc === src && hasLoaded ? '' : T.chartPreviewLoading || 'Kraunama…';
      previewPlaceholder.hidden = true;
      if (height) {
        const clamped = clampHeight(height);
        if (clamped) {
          derivedHeight = clamped;
        }
      }
      if (width) {
        const clampedW = clampWidth(width);
        if (clampedW) {
          derivedWidth = clampedW;
        }
      }
      if (currentSrc !== src) {
        currentSrc = src;
        hasLoaded = false;
        previewFrame.src = src;
      } else {
        applySizing();
      }
    };

    const handlePreviewLoad = () => {
      hasLoaded = true;
      if (!currentSrc) return;
      previewWrap.dataset.state = 'ready';
      previewStatus.textContent = '';
      const measured = measureFrameSize();
      if (measured) {
        if (Number.isFinite(measured.height)) {
          derivedHeight = measured.height;
        }
        if (Number.isFinite(measured.width)) {
          derivedWidth = measured.width;
        }
      }
      applySizing();
    };
    previewFrame.addEventListener('load', handlePreviewLoad);

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      urlField.removeEventListener('input', handleUrlInput);
      scaleField.removeEventListener('input', handleScaleInput);
      previewFrame.removeEventListener('load', handlePreviewLoad);
      dlg.remove();
      prevFocus?.focus();
    }

    const handleUrlInput = () => {
      previewStatus.textContent = '';
      updatePreview();
    };

    const handleScaleInput = () => {
      applySizing();
    };

    function submit(e) {
      e.preventDefault();
      const title = titleField.value.trim();
      const rawUrl = urlField.value.trim();
      if (!title || !rawUrl) {
        err.textContent = T.required;
        return;
      }
      const { src } = parseEmbed(rawUrl);
      if (!isValidUrl(src)) {
        err.textContent = T.invalidUrl;
        return;
      }
      const percent = clampPercent(scaleField.value || DEFAULT_SCALE_PERCENT);
      const baseHeight = computeBaseHeight();
      const baseWidth = computeBaseWidth();
      resolve({
        title,
        url: src,
        scale: percent / 100,
        frameHeight: baseHeight,
        height: baseHeight,
        frameWidth: baseWidth,
        width: baseWidth,
      });
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    titleField.value = data.title || '';
    urlField.value = data.url || '';
    scaleField.value = clampPercent(initialScale || DEFAULT_SCALE_PERCENT);

    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);
    urlField.addEventListener('input', handleUrlInput);
    scaleField.addEventListener('input', handleScaleInput);

    dlg.showModal();
    const first = dlg.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    applySizing();
    updatePreview();
  });
}

export function notesDialog(
  T,
  data = {
    title: '',
    text: '',
    size: 20,
    padding: 20,
    color: '#facc15',
  },
) {
  return new Promise((resolve) => {
    const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const DEFAULT_NOTE_COLOR = '#facc15';

    function expandHex(hex) {
      if (!HEX_COLOR_RE.test(hex)) return null;
      const lower = hex.toLowerCase();
      if (lower.length === 4) {
        return (
          '#' +
          lower
            .slice(1)
            .split('')
            .map((ch) => ch + ch)
            .join('')
        );
      }
      return lower;
    }

    function hexToRgb(hex) {
      const normalized = expandHex(hex);
      if (!normalized) return null;
      return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
      };
    }

    function mixHex(base, target, ratio) {
      const src = hexToRgb(base);
      const dst = hexToRgb(target);
      if (!src || !dst) return base;
      const clampRatio = Math.max(0, Math.min(1, Number(ratio)));
      const r = src.r + (dst.r - src.r) * clampRatio;
      const g = src.g + (dst.g - src.g) * clampRatio;
      const b = src.b + (dst.b - src.b) * clampRatio;
      const toHex = (n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function normalizeHex(hex, fallback = DEFAULT_NOTE_COLOR) {
      if (typeof hex !== 'string') return fallback;
      const trimmed = hex.trim();
      if (HEX_COLOR_RE.test(trimmed)) {
        return expandHex(trimmed) || fallback;
      }
      return fallback;
    }

    function makeAutoGradient(hex) {
      const normalized = expandHex(hex);
      if (!normalized) {
        return `linear-gradient(135deg, ${hex}, ${hex})`;
      }
      const bright = mixHex(normalized, '#ffffff', 0.35);
      const deep = mixHex(normalized, '#000000', 0.15);
      return `linear-gradient(135deg, ${bright}, ${normalized}, ${deep})`;
    }

    const paletteColors = [
      { value: '#10b981', label: 'Ryški žalia' },
      { value: '#0ea5e9', label: 'Ryški žydra' },
      { value: '#6366f1', label: 'Gilus mėlynas' },
      { value: '#a855f7', label: 'Sodri violetinė' },
      { value: '#ec4899', label: 'Ryški avietinė' },
      { value: '#f97316', label: 'Ryški oranžinė' },
      { value: '#ef4444', label: 'Sodri raudona' },
      { value: DEFAULT_NOTE_COLOR, label: 'Ryški gelsva' },
    ];

    const SIZE_MIN = 12;
    const SIZE_MAX = 44;
    const PADDING_MIN = 4;
    const PADDING_MAX = 64;

    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    const paletteButtons = paletteColors
      .map((c) => {
        const norm = normalizeHex(c.value);
        const gradient = makeAutoGradient(norm);
        return `<button type="button" data-color="${norm}" style="--swatch:${norm};--swatch-gradient:${gradient}" aria-label="${escapeHtml(
          c.label,
        )}" aria-pressed="false"></button>`;
      })
      .join('');

    const subtitle = escapeHtml(
      T.noteDialogSubtitle || 'Aprašykite svarbiausius veiksmus ar priminimus vienoje vietoje.',
    );

    dlg.innerHTML = `<form method="dialog" id="notesForm" class="group-form note-form">
      <header class="group-form__header note-form__header">
        <h2 id="notesFormLabel">${escapeHtml(
          T.noteDialogTitle || T.addNote || 'Nauja pastabų kortelė',
        )}</h2>
        <p class="group-form__description">${subtitle}</p>
      </header>
      <section class="group-form__field">
        <label class="group-form__label" for="noteTitleInput">${escapeHtml(
          T.noteTitle || 'Pastabų pavadinimas',
        )}</label>
        <input id="noteTitleInput" name="title" type="text" autocomplete="off" placeholder="${escapeHtml(
          T.noteTitleHint || '',
        )}">
      </section>
      <section class="group-form__field note-form__field">
        <div class="group-form__label-row">
          <label class="group-form__label" for="noteBodyInput">${escapeHtml(
            T.notes || 'Pastabos',
          )}</label>
          <span class="group-form__hint" data-note-char-count>0</span>
        </div>
        <textarea id="noteBodyInput" name="note" rows="8" placeholder="${escapeHtml(
          T.noteContentPlaceholder || '',
        )}"></textarea>
      </section>
      <section class="group-form__field">
        <span class="group-form__label">${escapeHtml(
          T.noteAppearanceTitle || 'Išvaizda',
        )}</span>
        <div class="note-form__options">
          <label class="note-form__option" for="noteSizeInput">
            <span>${escapeHtml(T.noteFontLabel || 'Šrifto dydis')}</span>
            <div class="note-form__slider">
              <input
                id="noteSizeInput"
                name="size"
                type="range"
                min="12"
                max="44"
                step="1"
                aria-describedby="noteSizeValue"
              >
              <output id="noteSizeValue" data-note-size-output aria-live="polite"></output>
            </div>
          </label>
          <label class="note-form__option" for="notePaddingInput">
            <span>${escapeHtml(T.notePaddingLabel || 'Kortelės paraštės')}</span>
            <div class="note-form__slider">
              <input
                id="notePaddingInput"
                name="padding"
                type="range"
                min="4"
                max="64"
                step="1"
                aria-describedby="notePaddingValue"
              >
              <output id="notePaddingValue" data-note-padding-output aria-live="polite"></output>
            </div>
          </label>
        </div>
      </section>
      <section class="group-form__field" aria-labelledby="noteColorLabel">
        <div class="group-form__label-row">
          <span id="noteColorLabel" class="group-form__label">${escapeHtml(
            T.noteColor || 'Kortelės spalva',
          )}</span>
        </div>
        <div class="group-form__color note-form__colors">
          <div class="group-form__palette" role="listbox" aria-labelledby="noteColorLabel">
            ${paletteButtons}
          </div>
          <label class="group-form__custom-color note-form__custom-color">
            <input name="color" type="color" aria-label="${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}">
            <span class="group-form__custom-label">${escapeHtml(
              T.groupColorCustom || 'Pasirinktinė spalva',
            )}</span>
          </label>
        </div>
      </section>
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
    const noteInput = form.note;
    const titleInput = form.title;
    const sizeSlider = form.size;
    const paddingSlider = form.padding;
    const colorInput = form.color;
    const charCountEl = form.querySelector('[data-note-char-count]');
    const sizeOutput = form.querySelector('[data-note-size-output]');
    const paddingOutput = form.querySelector('[data-note-padding-output]');
    const paletteContainer = form.querySelector('.group-form__palette');
    const paletteButtonsEls = Array.from(
      form.querySelectorAll('.group-form__palette button[data-color]'),
    );

    const initialSize = Number.isFinite(Number.parseInt(data.size, 10))
      ? Number.parseInt(data.size, 10)
      : 20;
    const initialPadding = Number.isFinite(Number.parseInt(data.padding, 10))
      ? Number.parseInt(data.padding, 10)
      : 20;
    const initialColor = normalizeHex(data.color || DEFAULT_NOTE_COLOR);

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const initialSizeValue = clamp(initialSize, SIZE_MIN, SIZE_MAX);
    const initialPaddingValue = clamp(initialPadding, PADDING_MIN, PADDING_MAX);

    titleInput.value = data.title || '';
    noteInput.value = data.text || '';
    sizeSlider.min = SIZE_MIN.toString();
    sizeSlider.max = SIZE_MAX.toString();
    paddingSlider.min = PADDING_MIN.toString();
    paddingSlider.max = PADDING_MAX.toString();
    sizeSlider.value = initialSizeValue.toString();
    paddingSlider.value = initialPaddingValue.toString();
    colorInput.value = initialColor;

    function updateCharCount() {
      const count = noteInput.value.length;
      const template = T.noteCharCount || '{count} simbolių';
      charCountEl.textContent = template.replace('{count}', count.toString());
    }

    function updateSliderOutput(slider, output, fallback) {
      if (!output) return;
      const value = Number.parseInt(slider.value, 10);
      const min = Number.parseInt(slider.min, 10);
      const max = Number.parseInt(slider.max, 10);
      const safeValue = Number.isFinite(value)
        ? clamp(
            value,
            Number.isFinite(min) ? min : value,
            Number.isFinite(max) ? max : value,
          )
        : fallback;
      output.textContent = `${safeValue} px`;
    }

    function handleSizeSliderInput() {
      updateSliderOutput(sizeSlider, sizeOutput, initialSizeValue);
    }

    function handlePaddingSliderInput() {
      updateSliderOutput(paddingSlider, paddingOutput, initialPaddingValue);
    }

    function updatePaletteSelection(value) {
      paletteButtonsEls.forEach((btn) => {
        const selected = btn.dataset.color?.toLowerCase() === value.toLowerCase();
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function applyColor(value) {
      if (!value) return;
      const normalized = normalizeHex(value, DEFAULT_NOTE_COLOR);
      colorInput.value = normalized;
      colorInput.style.setProperty('--custom-swatch', normalized);
      updatePaletteSelection(normalized);
    }

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
      const index = paletteButtonsEls.indexOf(current);
      if (index === -1) return;
      e.preventDefault();
      let nextIndex = index;
      if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = paletteButtonsEls.length - 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        nextIndex = Math.min(paletteButtonsEls.length - 1, index + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        nextIndex = Math.max(0, index - 1);
      const next = paletteButtonsEls[nextIndex];
      next?.focus();
      if (next?.dataset.color) {
        applyColor(next.dataset.color);
      }
    }

    function handleColorInput(e) {
      applyColor(e.target.value);
    }

    function cleanup() {
      form.removeEventListener('submit', submit);
      cancel.removeEventListener('click', close);
      paletteContainer?.removeEventListener('click', handlePaletteClick);
      paletteContainer?.removeEventListener('keydown', handlePaletteKeydown);
      noteInput.removeEventListener('input', updateCharCount);
      sizeSlider.removeEventListener('input', handleSizeSliderInput);
      paddingSlider.removeEventListener('input', handlePaddingSliderInput);
      colorInput.removeEventListener('input', handleColorInput);
      dlg.remove();
      prevFocus?.focus();
    }

    function submit(e) {
      e.preventDefault();
      const sizeVal = Number.parseInt(sizeSlider.value, 10);
      const paddingVal = Number.parseInt(paddingSlider.value, 10);
      resolve({
        title: titleInput.value.trim(),
        text: noteInput.value.trim(),
        size: Number.isFinite(sizeVal)
          ? clamp(sizeVal, SIZE_MIN, SIZE_MAX)
          : initialSizeValue,
        padding: Number.isFinite(paddingVal)
          ? clamp(paddingVal, PADDING_MIN, PADDING_MAX)
          : initialPaddingValue,
        color: colorInput.value || DEFAULT_NOTE_COLOR,
      });
      cleanup();
    }

    function close() {
      resolve(null);
      cleanup();
    }

    paletteContainer?.addEventListener('click', handlePaletteClick);
    paletteContainer?.addEventListener('keydown', handlePaletteKeydown);
    colorInput.addEventListener('input', handleColorInput);
    noteInput.addEventListener('input', updateCharCount);
    sizeSlider.addEventListener('input', handleSizeSliderInput);
    paddingSlider.addEventListener('input', handlePaddingSliderInput);
    form.addEventListener('submit', submit);
    cancel.addEventListener('click', close);
    dlg.addEventListener('cancel', close);

    applyColor(initialColor);
    updateCharCount();
    updateSliderOutput(sizeSlider, sizeOutput, initialSizeValue);
    updateSliderOutput(paddingSlider, paddingOutput, initialPaddingValue);

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
