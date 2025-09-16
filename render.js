import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';

let currentState;
let persist;
let floatingMenu;

// Holds references to currently shift-selected groups
let selectedGroups = [];
// Snap resizing to this grid size (px)
const GRID = 20;

// Allow snapping to existing card sizes when within this distance (px)
const SNAP_THRESHOLD = GRID;

const MIN_SIZE_ADJUSTER = Symbol('minSizeAdjuster');

function setupMinSizeWatcher(cardEl, innerEl) {
  if (!cardEl || !innerEl || typeof ResizeObserver === 'undefined') return;
  const adjustMinSize = () => {
    if (!cardEl.isConnected || !innerEl.isConnected) return;
    const widthPx = `${Math.ceil(innerEl.scrollWidth)}px`;
    const heightPx = `${Math.ceil(innerEl.scrollHeight)}px`;
    if (cardEl.style.minWidth !== widthPx) {
      cardEl.style.minWidth = widthPx;
    }
    if (cardEl.style.minHeight !== heightPx) {
      cardEl.style.minHeight = heightPx;
    }
  };

  const mo = new ResizeObserver(() => adjustMinSize());
  mo.observe(innerEl);
  cardEl[MIN_SIZE_ADJUSTER] = adjustMinSize;
  adjustMinSize();

  let cleaned = false;
  let removalObserver = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    mo.disconnect();
    if (removalObserver) {
      removalObserver.disconnect();
      removalObserver = null;
    }
    if (cardEl[MIN_SIZE_ADJUSTER] === adjustMinSize) {
      delete cardEl[MIN_SIZE_ADJUSTER];
    }
  };

  const watchParent = (node) => {
    if (!node || typeof MutationObserver !== 'function') return;
    if (removalObserver) {
      removalObserver.disconnect();
    }
    removalObserver = new MutationObserver(() => {
      if (!cardEl.isConnected) {
        cleanup();
        return;
      }
      if (cardEl.parentNode && cardEl.parentNode !== node) {
        watchParent(cardEl.parentNode);
      }
    });
    removalObserver.observe(node, { childList: true });
  };

  if (typeof MutationObserver === 'function') {
    watchParent(cardEl.parentNode);
  } else {
    cardEl.addEventListener(
      'DOMNodeRemoved',
      (event) => {
        if (event.target === cardEl) cleanup();
      },
      { once: true },
    );
  }
}

let reminderTicker = null;
let reminderEntryCache = new Map();

function formatRelativeTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const clamped = Math.max(0, ms);
  if (clamped < 60000) {
    const seconds = Math.round(clamped / 1000);
    return `${seconds}s`;
  }
  const totalMinutes = Math.round(clamped / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} val ${minutes} min` : `${hours} val`;
}

function formatClockLabel(ms) {
  if (!Number.isFinite(ms)) return '00:00';
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h${remMinutes.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function formatDueLabel(ts) {
  try {
    return new Date(ts).toLocaleString('lt-LT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function applySize(el, width, height, wSize = sizeFromWidth(width), hSize = sizeFromHeight(height)) {
  el.style.width = width + 'px';
  el.style.height = height + 'px';
  el.classList.remove('w-sm', 'w-md', 'w-lg', 'h-sm', 'h-md', 'h-lg');
  el.classList.add(`w-${wSize}`, `h-${hSize}`);
}

// Debounce state persistence while resizing
let resizeDirty = false;
let resizeTimeout;
function schedulePersist() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (resizeDirty) {
      persist();
      resizeDirty = false;
    }
  }, 200);
}

const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entry.target.dataset.resizing === '1') {
      // Snap to grid first
      let baseW = Math.round(entry.contentRect.width / GRID) * GRID;
      let baseH = Math.round(entry.contentRect.height / GRID) * GRID;

      // Snap to widths/heights of other cards if close enough
      const groups = Array.from(document.querySelectorAll('.group')).filter(
        (g) => g !== entry.target,
      );
      for (const g of groups) {
        const rect = g.getBoundingClientRect();
        if (Math.abs(baseW - Math.round(rect.width)) <= SNAP_THRESHOLD) {
          baseW = Math.round(rect.width);
        }
        if (Math.abs(baseH - Math.round(rect.height)) <= SNAP_THRESHOLD) {
          baseH = Math.round(rect.height);
        }
      }
      const wSize = sizeFromWidth(baseW);
      const hSize = sizeFromHeight(baseH);

      const targets = selectedGroups.includes(entry.target)
        ? selectedGroups
        : [entry.target];

      targets.forEach((el) => {
        applySize(el, baseW, baseH, wSize, hSize);
        if (el.dataset.id === 'reminders') {
          currentState.remindersCard = {
            ...(currentState.remindersCard || {}),
            width: baseW,
            height: baseH,
            wSize,
            hSize,
          };
        } else {
          const sg = currentState.groups.find((x) => x.id === el.dataset.id);
          if (sg) {
            sg.width = baseW;
            sg.height = baseH;
            sg.wSize = wSize;
            sg.hSize = hSize;
            delete sg.size;
          }
        }
      });
      resizeDirty = true;
      schedulePersist();
    }
  }
});

document.addEventListener('mouseup', () => {
  document.querySelectorAll('.group').forEach((g) => {
    g.dataset.resizing = '0';
    g.style.minWidth = '';
    g.style.minHeight = '';
    const adjust = g[MIN_SIZE_ADJUSTER];
    if (typeof adjust === 'function') {
      adjust();
    }
  });
  if (resizeDirty) {
    persist();
    resizeDirty = false;
  }
});

document.addEventListener('click', (e) => {
  if (
    floatingMenu &&
    !e.target.closest('.floating-menu') &&
    !e.target.closest('[data-a="menu"]')
  ) {
    floatingMenu.remove();
    floatingMenu = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && floatingMenu) {
    floatingMenu.remove();
    floatingMenu = null;
  }
});

function toFavicon(u) {
  try {
    const url = new URL(u);
    return `${url.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function toSheetEmbed(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('docs.google.com')) return null;
    if (/\/(pub|pubhtml|htmlview|htmlembed)/.test(u.pathname)) return url;
    const parts = u.pathname.split('/').filter(Boolean);
    const dIdx = parts.indexOf('d');
    if (dIdx === -1) return null;
    let id = parts[dIdx + 1];
    if (id === 'e') id = parts[dIdx + 2];
    if (!id) return null;
    const gid = u.searchParams.get('gid') || u.hash.match(/gid=([^&]+)/)?.[1];
    const params = new URLSearchParams({ widget: 'true', headers: 'false' });
    if (gid) params.set('gid', gid);
    return `https://docs.google.com/spreadsheets/d/${id}/htmlembed?${params.toString()}`;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"]/g,
    (s) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[s],
  );
}

function previewItem(it, mount) {
  const existing = mount.nextElementSibling;
  if (existing && existing.classList.contains('embed')) {
    existing.remove();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'embed';
  wrap.style.overflow = 'hidden';
  wrap.dataset.custom = it.h ? '1' : '0';
  if (it.h) wrap.style.height = it.h + 'px';
  let src = it.url;
  if (it.type === 'sheet') {
    const conv = toSheetEmbed(it.url);
    if (conv) src = conv;
  }
  wrap.innerHTML = `<iframe src="${src}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  wrap.addEventListener('mouseup', () => {
    it.h = Math.round(wrap.getBoundingClientRect().height);
    wrap.dataset.custom = '1';
    persist();
  });
  mount.after(wrap);
}

export function render(state, editing, T, I, handlers, saveFn) {
  currentState = state;
  persist = saveFn;
  const groupsEl = document.getElementById('groups');
  const statsEl = document.getElementById('stats');
  const searchEl = document.getElementById('q');

  ro.disconnect();
  selectedGroups = [];
  if (reminderTicker) {
    clearInterval(reminderTicker);
    reminderTicker = null;
  }
  reminderEntryCache = new Map();

  const q = (searchEl.value || '').toLowerCase().trim();
  groupsEl.innerHTML = '';
  function handleDrop(e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/group');
    const toId = e.currentTarget.dataset.id;
    if (!fromId || fromId === toId) return;
    const ids = currentState.groups.map((g) => g.id);
    if (currentState.remindersCard?.enabled) {
      const rPos = Math.max(
        0,
        Math.min(currentState.remindersPos || 0, ids.length),
      );
      ids.splice(rPos, 0, 'reminders');
    }
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    const map = new Map(currentState.groups.map((g) => [g.id, g]));
    currentState.remindersPos = ids.indexOf('reminders');
    if (currentState.remindersPos < 0) currentState.remindersPos = 0;
    currentState.groups = ids
      .filter((id) => id !== 'reminders')
      .map((id) => map.get(id));
    persist();
    render(currentState, editing, T, I, handlers, persist);
  }
  const groupMap = new Map(state.groups.map((g) => [g.id, g]));
  const ids = state.groups.map((g) => g.id);
  const specials = [];
  if (state.remindersCard?.enabled) {
    specials.push({ id: 'reminders', pos: state.remindersPos || 0 });
  }
  specials
    .sort((a, b) => a.pos - b.pos)
    .forEach((special) => {
      const pos = Math.max(0, Math.min(special.pos, ids.length));
      ids.splice(pos, 0, special.id);
    });
  currentState.remindersPos = ids.indexOf('reminders');
  if (currentState.remindersPos < 0)
    currentState.remindersPos = Math.max(
      0,
      Math.min(state.remindersPos || 0, ids.length),
    );
  const allGroups = ids
    .map((id) => {
      if (id === 'reminders') return { id: 'reminders' };
      return groupMap.get(id);
    })
    .filter(Boolean);
  allGroups.forEach((g) => {
    if (g.id === 'reminders') {
      const reminderHandlers = handlers.reminders || {};
      const cardState = state.remindersCard || {};
      const remGrp = document.createElement('section');
      remGrp.className = 'group reminders-card';
      remGrp.dataset.id = 'reminders';
      remGrp.dataset.resizing = '0';
      const rWidth =
        cardState.width ?? SIZE_MAP[cardState.wSize || 'md']?.width ?? 360;
      const rHeight =
        cardState.height ?? SIZE_MAP[cardState.hSize || 'md']?.height ?? 360;
      const rWSize = cardState.wSize || sizeFromWidth(rWidth);
      const rHSize = cardState.hSize || sizeFromHeight(rHeight);
      applySize(remGrp, rWidth, rHeight, rWSize, rHSize);
      remGrp.style.resize = editing ? 'both' : 'none';
      remGrp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        remGrp.addEventListener('mousedown', (e) => {
          const rect = remGrp.getBoundingClientRect();
          const withinHandle =
            e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
          if (withinHandle) {
            remGrp.dataset.resizing = '1';
            remGrp.style.minWidth = remGrp.scrollWidth + 'px';
            remGrp.style.minHeight = remGrp.scrollHeight + 'px';
          }
        });
        remGrp.draggable = true;
        remGrp.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/group', 'reminders');
          remGrp.style.opacity = 0.5;
        });
        remGrp.addEventListener('dragend', () => {
          remGrp.style.opacity = 1;
        });
        remGrp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        remGrp.addEventListener('drop', handleDrop);
      } else {
        remGrp.draggable = false;
      }
      remGrp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(remGrp);
        if (idx === -1) {
          selectedGroups.push(remGrp);
          remGrp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          remGrp.classList.remove('selected');
        }
      });
      const header = document.createElement('div');
      header.className = 'group-header';
      const titleText = (cardState.title || '').trim() ||
        T.remindersCardTitle ||
        T.reminders;
      header.innerHTML = `
        <div class="group-title">
          <span class="dot" style="background:#38bdf8"></span>
          <h2 data-reminders-title>${escapeHtml(titleText)}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${escapeHtml(T.remove)}" aria-label="${escapeHtml(T.remove)}" data-act="remove">${I.trash}</button>
        </div>`
            : ''
        }
      `;
      const titleEl = header.querySelector('[data-reminders-title]');
      if (titleEl) {
        titleEl.contentEditable = editing;
        titleEl.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            titleEl.blur();
          }
        });
        titleEl.addEventListener('blur', () => {
          if (!editing) return;
          if (reminderHandlers.setTitle) {
            reminderHandlers.setTitle(titleEl.textContent || '');
          }
        });
      }
      header.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'remove') {
          if (handlers.confirmDialog) {
            handlers
              .confirmDialog(T.reminderCardRemove)
              .then((ok) => ok && reminderHandlers.removeCard?.());
          } else {
            reminderHandlers.removeCard?.();
          }
        }
      });
      remGrp.appendChild(header);

      const body = document.createElement('div');
      body.className = 'reminders-card-body';

      const controlsWrap = document.createElement('div');
      controlsWrap.className = 'reminder-controls';

      const quickSection = document.createElement('section');
      quickSection.className = 'reminder-quick-start';
      const quickText = document.createElement('div');
      quickText.className = 'reminder-quick-text';
      quickText.innerHTML = `
        <h3>${escapeHtml(T.reminderQuickTitle)}</h3>
        <p>${escapeHtml(T.reminderQuickDescription)}</p>
      `;
      quickSection.appendChild(quickText);
      const quickButtons = document.createElement('div');
      quickButtons.className = 'reminder-quick-buttons';
      quickButtons.setAttribute('data-reminder-quick-start', '1');
      const quickPresets = (() => {
        if (typeof reminderHandlers.quickPresets === 'function') {
          const res = reminderHandlers.quickPresets();
          if (Array.isArray(res)) return res;
        }
        return [5, 10, 15, 30];
      })();
      const quickLabels = {
        5: T.reminderPlus5,
        10: T.reminderPlus10,
        15: T.reminderPlus15,
        30: T.reminderPlus30,
      };
      quickPresets
        .filter((min) => Number.isFinite(min) && min > 0)
        .forEach((min) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.minutes = String(min);
          const titleLabel = (T.reminderTimerPattern || 'Laikmatis {min} min.').replace(
            '{min}',
            min,
          );
          const quickLabel = quickLabels[min] || `+${min} min`;
          btn.title = titleLabel;
          btn.innerHTML = `${I.clock} ${escapeHtml(quickLabel)}`;
          quickButtons.appendChild(btn);
        });
      if (!quickButtons.childElementCount) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.minutes = '5';
        btn.title = T.reminderPlus5;
        btn.innerHTML = `${I.clock} ${escapeHtml(T.reminderPlus5)}`;
        quickButtons.appendChild(btn);
      }
      quickSection.appendChild(quickButtons);
      controlsWrap.appendChild(quickSection);

      const form = document.createElement('form');
      form.className = 'reminder-form';
      form.setAttribute('data-reminder-form', '1');
      form.innerHTML = `
        <label>
          <span>${escapeHtml(T.reminderName)}</span>
          <input name="title" placeholder="${escapeHtml(
            T.reminderNamePH || ''
          )}" autocomplete="off">
        </label>
        <label>
          <span>${escapeHtml(T.reminderMode)}</span>
          <select name="reminderMode">
            <option value="minutes">${escapeHtml(T.reminderAfter)}</option>
            <option value="datetime">${escapeHtml(T.reminderExactTime)}</option>
          </select>
        </label>
        <div class="reminder-form-section" data-reminder-section="minutes">
          <label>
            <span>${escapeHtml(T.reminderMinutes)}</span>
            <input name="reminderMinutes" type="number" min="1" step="1">
          </label>
          <div class="reminder-quick-fill" data-reminder-quick-fill></div>
        </div>
        <div class="reminder-form-section" data-reminder-section="datetime">
          <label>
            <span>${escapeHtml(T.reminderExactTime)}</span>
            <input name="reminderAt" type="datetime-local">
          </label>
        </div>
        <div class="reminder-form-actions">
          <button type="submit" class="btn-accent" data-reminder-submit>${escapeHtml(
            T.reminderCreate
          )}</button>
          <button type="button" data-reminder-cancel hidden>${escapeHtml(
            T.reminderCancelEdit
          )}</button>
        </div>
        <p class="error" data-reminder-error aria-live="polite"></p>
      `;
      const quickFill = form.querySelector('[data-reminder-quick-fill]');
      quickPresets
        .filter((min) => Number.isFinite(min) && min > 0)
        .forEach((min) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.minutes = String(min);
          btn.textContent = quickLabels[min] || `+${min} min`;
          quickFill?.appendChild(btn);
        });
      const formState = reminderHandlers.formState
        ? reminderHandlers.formState()
        : { editingId: null, values: null, error: '' };
      const values = formState?.values || {};
      form.title.value = values.title || '';
      form.reminderMode.value = values.reminderMode || 'minutes';
      form.reminderMinutes.value = values.reminderMinutes || '';
      form.reminderAt.value = values.reminderAt || '';
      const errorEl = form.querySelector('[data-reminder-error]');
      if (errorEl) errorEl.textContent = formState.error || '';
      const submitBtn = form.querySelector('[data-reminder-submit]');
      const cancelBtn = form.querySelector('[data-reminder-cancel]');
      if (formState.editingId) {
        if (submitBtn) submitBtn.textContent = T.reminderUpdate;
        if (cancelBtn) cancelBtn.hidden = false;
        form.classList.add('is-editing');
      } else {
        if (submitBtn) submitBtn.textContent = T.reminderCreate;
        if (cancelBtn) cancelBtn.hidden = true;
        form.classList.remove('is-editing');
      }
      const updateMode = () => {
        const mode = form.reminderMode.value || 'minutes';
        form
          .querySelectorAll('[data-reminder-section]')
          .forEach((section) => {
            section.hidden = section.dataset.reminderSection !== mode;
          });
      };
      updateMode();
      form.reminderMode.addEventListener('change', updateMode);
      quickFill?.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-minutes]');
        if (!btn) return;
        form.reminderMode.value = 'minutes';
        form.reminderMinutes.value = btn.dataset.minutes || '';
        updateMode();
      });
      quickButtons.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-minutes]');
        if (!btn) return;
        const minutes = parseInt(btn.dataset.minutes || '', 10);
        if (Number.isFinite(minutes) && reminderHandlers.quick) {
          reminderHandlers.quick(minutes);
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (typeof reminderHandlers.submit === 'function') {
          const payload = Object.fromEntries(new FormData(form));
          payload.reminderMode = payload.reminderMode || 'minutes';
          reminderHandlers.submit(payload);
        }
      });
      cancelBtn?.addEventListener('click', () => {
        reminderHandlers.cancelEdit?.();
      });
      controlsWrap.appendChild(form);

      body.appendChild(controlsWrap);

      const listSection = document.createElement('section');
      listSection.className = 'reminder-list-section';
      listSection.innerHTML = `
        <h3>${escapeHtml(T.remindersUpcoming)}</h3>
        <div class="reminder-empty" data-reminder-empty>${escapeHtml(
          T.noReminders,
        )}</div>
        <ul class="reminder-items" data-reminder-list></ul>
      `;
      const listEl = listSection.querySelector('[data-reminder-list]');
      const emptyEl = listSection.querySelector('[data-reminder-empty]');
      const snoozeMinutes = reminderHandlers.snoozeMinutes || 5;
      const updateReminders = () => {
        const entries = reminderHandlers.entries
          ? reminderHandlers.entries()
          : [];
        const sorted = Array.isArray(entries)
          ? [...entries].sort((a, b) => a.at - b.at)
          : [];
        reminderEntryCache = new Map(sorted.map((entry) => [entry.key, entry]));
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!sorted.length) {
          if (emptyEl) emptyEl.hidden = false;
          return;
        }
        if (emptyEl) emptyEl.hidden = true;
        sorted.forEach((entry) => {
          const li = document.createElement('li');
          li.dataset.key = entry.key;
          const remaining = Number.isFinite(entry.at)
            ? entry.at - Date.now()
            : NaN;
          const duration = Number.isFinite(entry.duration)
            ? entry.duration
            : null;
          const ratio = duration
            ? Math.max(0, Math.min(1, 1 - remaining / duration))
            : 0;
          li.classList.toggle('overdue', Number.isFinite(remaining) && remaining <= 0);
          const progress = document.createElement('div');
          progress.className = 'reminder-progress';
          progress.style.setProperty('--ratio', String(ratio));
          progress.innerHTML = `<span>${escapeHtml(
            formatClockLabel(remaining),
          )}</span>`;
          li.appendChild(progress);
          const info = document.createElement('div');
          info.className = 'reminder-info';
          const titleRow = document.createElement('div');
          titleRow.className = 'reminder-title';
          titleRow.textContent =
            entry.body || entry.title || T.reminderNotificationTitle;
          info.appendChild(titleRow);
          const meta = document.createElement('div');
          meta.className = 'reminder-meta';
          const typeSpan = document.createElement('span');
          typeSpan.className = 'reminder-tag';
          const typeLabel =
            entry.data?.type === 'note'
              ? T.reminderTypeNotes
              : entry.data?.type === 'item'
                ? T.reminderTypeItem
                : T.reminderTypeCustom;
          typeSpan.textContent = typeLabel;
          meta.appendChild(typeSpan);
          const dueSpan = document.createElement('span');
          dueSpan.className = 'reminder-due';
          dueSpan.textContent = `${T.reminderDue}: ${formatDueLabel(entry.at)}`;
          meta.appendChild(dueSpan);
          const leftSpan = document.createElement('span');
          leftSpan.className = 'reminder-left';
          leftSpan.textContent = `${T.reminderLeft}: ${formatRelativeTime(
            remaining,
          )}`;
          meta.appendChild(leftSpan);
          info.appendChild(meta);
          li.appendChild(info);
          const actions = document.createElement('div');
          actions.className = 'reminder-actions';
          const snoozeBtn = document.createElement('button');
          snoozeBtn.type = 'button';
          snoozeBtn.dataset.action = 'snooze';
          snoozeBtn.title = T.reminderSnoozeShort || T.reminderSnooze;
          snoozeBtn.innerHTML = `${I.clock}`;
          actions.appendChild(snoozeBtn);
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.dataset.action = 'edit';
          editBtn.title = T.reminderEditInline || T.reminderEdit;
          editBtn.innerHTML = `${I.pencil}`;
          actions.appendChild(editBtn);
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.dataset.action = 'remove';
          removeBtn.title = T.reminderRemove || T.remove;
          removeBtn.classList.add('btn-danger');
          removeBtn.innerHTML = `${I.trash}`;
          actions.appendChild(removeBtn);
          li.appendChild(actions);
          listEl.appendChild(li);
        });
      };
      updateReminders();
      if (reminderTicker) {
        clearInterval(reminderTicker);
      }
      reminderTicker = setInterval(updateReminders, 1000);
      listEl?.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-action]');
        if (!btn) return;
        const item = btn.closest('li');
        if (!item) return;
        const key = item.dataset.key;
        if (!key) return;
        const action = btn.dataset.action;
        if (action === 'remove') {
          reminderHandlers.clear?.(key);
        } else if (action === 'snooze') {
          reminderHandlers.snooze?.(key, snoozeMinutes);
        } else if (action === 'edit') {
          const entry = reminderEntryCache.get(key);
          if (entry) reminderHandlers.edit?.(entry);
        }
      });
      body.appendChild(listSection);

      remGrp.appendChild(body);
      groupsEl.appendChild(remGrp);
      const inner = remGrp.querySelector('.group-body');
      setupMinSizeWatcher(remGrp, inner);
      ro.observe(remGrp);
      return;
    }
    if (g.type === 'note') {
      const noteGrp = document.createElement('section');
      noteGrp.className = 'group note-card';
      noteGrp.dataset.id = g.id;
      noteGrp.dataset.resizing = '0';
      const fallbackW = SIZE_MAP[g.wSize ?? 'md']?.width ?? SIZE_MAP.md.width;
      const fallbackH = SIZE_MAP[g.hSize ?? 'md']?.height ?? SIZE_MAP.md.height;
      const nWidth = Number.isFinite(g.width) ? g.width : fallbackW;
      const nHeight = Number.isFinite(g.height) ? g.height : fallbackH;
      const nWSize = g.wSize || sizeFromWidth(nWidth);
      const nHSize = g.hSize || sizeFromHeight(nHeight);
      applySize(noteGrp, nWidth, nHeight, nWSize, nHSize);
      noteGrp.style.resize = editing ? 'both' : 'none';
      noteGrp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        noteGrp.addEventListener('mousedown', (e) => {
          const rect = noteGrp.getBoundingClientRect();
          const withinHandle =
            e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
          if (withinHandle) {
            noteGrp.dataset.resizing = '1';
            noteGrp.style.minWidth = noteGrp.scrollWidth + 'px';
            noteGrp.style.minHeight = noteGrp.scrollHeight + 'px';
          }
        });
        noteGrp.draggable = true;
        noteGrp.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/group', g.id);
          noteGrp.style.opacity = 0.5;
        });
        noteGrp.addEventListener('dragend', () => {
          noteGrp.style.opacity = 1;
        });
        noteGrp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        noteGrp.addEventListener('drop', handleDrop);
      }
      noteGrp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(noteGrp);
        if (idx === -1) {
          selectedGroups.push(noteGrp);
          noteGrp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          noteGrp.classList.remove('selected');
        }
      });
      const h = document.createElement('div');
      h.className = 'group-header';
      const dotColor = g.color || '#fef08a';
      const headerTitle = escapeHtml(g.title || g.name || T.notes);
      h.innerHTML = `
        <div class="group-title">
          <span class="dot" style="background:${dotColor}"></span>
          <h2>${headerTitle}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.edit}" aria-label="${T.edit}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteNotes}" aria-label="${T.deleteNotes}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;
      h.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.act === 'edit') handlers.notes?.edit?.(g.id);
        if (btn.dataset.act === 'del') handlers.notes?.remove?.(g.id);
      });
      noteGrp.appendChild(h);
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'items';
      const itemsScroll = document.createElement('div');
      itemsScroll.className = 'items-scroll';
      const p = document.createElement('p');
      p.style.whiteSpace = 'pre-wrap';
      const padding = Number.isFinite(g.padding) ? g.padding : 20;
      const fontSize = Number.isFinite(g.fontSize) ? g.fontSize : 20;
      p.style.padding = padding + 'px';
      p.style.fontSize = fontSize + 'px';
      p.textContent = g.text || '';
      itemsScroll.appendChild(p);
      itemsWrap.appendChild(itemsScroll);
      noteGrp.appendChild(itemsWrap);
      groupsEl.appendChild(noteGrp);
      const inner = noteGrp.querySelector('.items');
      setupMinSizeWatcher(noteGrp, inner);
      ro.observe(noteGrp);
      return;
    }
    if (g.type === 'chart') {
      const grp = document.createElement('section');
      grp.className = 'group';
      grp.dataset.id = g.id;
      grp.dataset.resizing = '0';
      const gWidth =
        g.width ?? SIZE_MAP[g.wSize ?? 'md'].width;
      const gHeight =
        g.height ?? SIZE_MAP[g.hSize ?? 'md'].height;
      const gWSize = g.wSize ?? sizeFromWidth(gWidth);
      const gHSize = g.hSize ?? sizeFromHeight(gHeight);
      applySize(grp, gWidth, gHeight, gWSize, gHSize);
      grp.style.resize = editing ? 'both' : 'none';
      grp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        grp.addEventListener('mousedown', (e) => {
          const rect = grp.getBoundingClientRect();
          const withinHandle =
            e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
          if (withinHandle) {
            grp.dataset.resizing = '1';
            grp.style.minWidth = grp.scrollWidth + 'px';
            grp.style.minHeight = grp.scrollHeight + 'px';
          }
        });
        grp.draggable = true;
        grp.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/group', g.id);
          grp.style.opacity = 0.5;
        });
        grp.addEventListener('dragend', () => {
          grp.style.opacity = 1;
        });
        grp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        grp.addEventListener('drop', handleDrop);
      }

      grp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(grp);
        if (idx === -1) {
          selectedGroups.push(grp);
          grp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          grp.classList.remove('selected');
        }
      });

      const h = document.createElement('div');
      h.className = 'group-header';
      h.innerHTML = `
        <div class="group-title">
          <button type="button" class="toggle" data-collapse title="${g.collapsed ? T.expand : T.collapse}" aria-label="${g.collapsed ? T.expand : T.collapse}">${g.collapsed ? I.arrowDown : I.arrowUp}</button>
          <span class="dot" style="background:${g.color || '#6ee7b7'}"></span>
          <h2 title="Tempkite, kad perrikiuotumėte" class="handle">${escapeHtml(g.name || '')}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.moveUp}" aria-label="${T.moveUp}" data-act="up">${I.arrowUp}</button>
          <button type="button" title="${T.moveDown}" aria-label="${T.moveDown}" data-act="down">${I.arrowDown}</button>
          <button type="button" title="${T.editChart}" aria-label="${T.editChart}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteGroup}" aria-label="${T.deleteGroup}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;

      h.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.collapse !== undefined) {
          handlers.toggleCollapse(g.id);
          return;
        }
        const act = btn.dataset.act;
        if (act === 'edit') return handlers.editChart(g.id);
        if (act === 'del') {
          handlers.confirmDialog(T.confirmDelChart).then((ok) => {
            if (ok) {
              state.groups = state.groups.filter((x) => x.id !== g.id);
              persist();
              render(state, editing, T, I, handlers, saveFn);
            }
          });
          return;
        }
        if (act === 'up' || act === 'down') {
          const idx = state.groups.findIndex((x) => x.id === g.id);
          if (act === 'up' && idx > 0) {
            const [moved] = state.groups.splice(idx, 1);
            state.groups.splice(idx - 1, 0, moved);
          }
          if (act === 'down' && idx < state.groups.length - 1) {
            const [moved] = state.groups.splice(idx, 1);
            state.groups.splice(idx + 1, 0, moved);
          }
          persist();
          render(state, editing, T, I, handlers, saveFn);
        }
      });

      grp.appendChild(h);
      const emb = document.createElement('div');
      emb.className = 'embed';
      emb.dataset.custom = '1';
      emb.style.flex = '1';
      emb.style.resize = 'none';
      emb.innerHTML = `<iframe src="${g.url}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
      grp.appendChild(emb);
      if (g.collapsed) grp.classList.add('collapsed');
      groupsEl.appendChild(grp);
      const inner = grp.querySelector('.embed');
      setupMinSizeWatcher(grp, inner);
      ro.observe(grp);
      return;
    }
    const grp = document.createElement('section');
    grp.className = 'group';
    grp.dataset.id = g.id;
    grp.dataset.resizing = '0';
    const gWidth2 =
      g.width ?? SIZE_MAP[g.wSize ?? 'md'].width;
    const gHeight2 =
      g.height ?? SIZE_MAP[g.hSize ?? 'md'].height;
    const gWSize2 = g.wSize ?? sizeFromWidth(gWidth2);
    const gHSize2 = g.hSize ?? sizeFromHeight(gHeight2);
    applySize(grp, gWidth2, gHeight2, gWSize2, gHSize2);
    grp.style.resize = editing ? 'both' : 'none';
    grp.style.overflow = editing ? 'auto' : 'visible';
    if (editing) {
      grp.addEventListener('mousedown', (e) => {
        const rect = grp.getBoundingClientRect();
        const withinHandle =
          e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
        if (withinHandle) {
          grp.dataset.resizing = '1';
          grp.style.minWidth = grp.scrollWidth + 'px';
          grp.style.minHeight = grp.scrollHeight + 'px';
        }
      });
      grp.draggable = true;
      grp.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/group', g.id);
        grp.style.opacity = 0.5;
      });
      grp.addEventListener('dragend', () => {
        grp.style.opacity = 1;
      });
      grp.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      grp.addEventListener('drop', handleDrop);
    }

    grp.addEventListener('click', (e) => {
      if (!e.shiftKey) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const idx = selectedGroups.indexOf(grp);
      if (idx === -1) {
        selectedGroups.push(grp);
        grp.classList.add('selected');
      } else {
        selectedGroups.splice(idx, 1);
        grp.classList.remove('selected');
      }
    });

    const h = document.createElement('div');
    h.className = 'group-header';
    h.innerHTML = `
        <div class="group-title">
          <button type="button" class="toggle" data-collapse title="${g.collapsed ? T.expand : T.collapse}" aria-label="${g.collapsed ? T.expand : T.collapse}">${g.collapsed ? I.arrowDown : I.arrowUp}</button>
          <span class="dot" style="background:${g.color || '#6ee7b7'}"></span>
          <h2 title="Tempkite, kad perrikiuotumėte" class="handle">${escapeHtml(g.name)}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.moveUp}" aria-label="${T.moveUp}" data-act="up">${I.arrowUp}</button>
          <button type="button" title="${T.moveDown}" aria-label="${T.moveDown}" data-act="down">${I.arrowDown}</button>
          <button type="button" title="${T.openAll}" aria-label="${T.openAll}" data-act="openAll">${I.arrowUpRight}</button>
          <button type="button" title="${T.addItem}" aria-label="${T.addItem}" data-act="add">${I.plus}</button>
          <button type="button" title="${T.editGroup}" aria-label="${T.editGroup}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteGroup}" aria-label="${T.deleteGroup}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;

    h.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.collapse !== undefined) {
        handlers.toggleCollapse(g.id);
        return;
      }
      const act = btn.dataset.act;
      if (act === 'add') return handlers.addItem(g.id);
      if (act === 'edit') return handlers.editGroup(g.id);
      if (act === 'del') {
        handlers.confirmDialog(T.confirmDelGroup).then((ok) => {
          if (ok) {
            state.groups = state.groups.filter((x) => x.id !== g.id);
            persist();
            render(state, editing, T, I, handlers, saveFn);
          }
        });
        return;
      }
      if (act === 'up' || act === 'down') {
        const idx = state.groups.findIndex((x) => x.id === g.id);
        if (act === 'up' && idx > 0) {
          const [moved] = state.groups.splice(idx, 1);
          state.groups.splice(idx - 1, 0, moved);
        }
        if (act === 'down' && idx < state.groups.length - 1) {
          const [moved] = state.groups.splice(idx, 1);
          state.groups.splice(idx + 1, 0, moved);
        }
        persist();
        render(state, editing, T, I, handlers, saveFn);
        return;
      }
      if (act === 'openAll') {
        g.items
          .filter((i) => i.type === 'link')
          .forEach((i) => window.open(i.url, '_blank'));
      }
    });

    grp.appendChild(h);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'items';
    const itemsScroll = document.createElement('div');
    itemsScroll.className = 'items-scroll';
    if (editing) {
      itemsScroll.addEventListener('dragover', (e) => e.preventDefault());
      itemsScroll.addEventListener('drop', (e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('text/item') || '{}');
        if (!data.iid) return;
        const fromG = state.groups.find((x) => x.id === data.gid);
        const idxFrom = fromG.items.findIndex((x) => x.id === data.iid);
        const [moved] = fromG.items.splice(idxFrom, 1);
        g.items.push(moved);
        persist();
        render(state, editing, T, I, handlers, saveFn);
      });
    }

    const filteredItems = g.items.filter((i) => {
      if (!q) return true;
      return [i.title, i.url, i.note]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    if (filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = q ? T.noMatches : T.empty;
      itemsScroll.appendChild(empty);
    } else {
      filteredItems.forEach((it) => {
        const isLink = !editing && it.type === 'link';
        const card = document.createElement(isLink ? 'a' : 'div');
        card.className = 'item';
        card.dataset.gid = g.id;
        card.dataset.iid = it.id;
        card.draggable = editing;
        if (isLink) {
          card.href = it.url;
          card.target = '_blank';
          card.rel = 'noopener';
        }
        if (editing) {
          card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData(
              'text/item',
              JSON.stringify({ gid: g.id, iid: it.id }),
            );
            card.classList.add('dragging');
          });
          card.addEventListener('dragend', () =>
            card.classList.remove('dragging'),
          );
          card.addEventListener('dragover', (e) => e.preventDefault());
          card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const data = JSON.parse(
              e.dataTransfer.getData('text/item') || '{}',
            );
            if (!data.iid) return;
            if (data.gid === g.id) {
              const idxFrom = g.items.findIndex((x) => x.id === data.iid);
              const idxTo = g.items.findIndex((x) => x.id === it.id);
              const [moved] = g.items.splice(idxFrom, 1);
              g.items.splice(idxTo, 0, moved);
              persist();
              render(state, editing, T, I, handlers, saveFn);
            } else {
              const fromG = state.groups.find((x) => x.id === data.gid);
              const idxFrom = fromG.items.findIndex((x) => x.id === data.iid);
              const [moved] = fromG.items.splice(idxFrom, 1);
              const idxTo = g.items.findIndex((x) => x.id === it.id);
              g.items.splice(idxTo, 0, moved);
              persist();
              render(state, editing, T, I, handlers, saveFn);
            }
          });
        }

        const favicon = it.icon
          ? `<div class="favicon">${I[it.icon] || ''}</div>`
          : it.iconUrl
            ? `<img class="favicon" alt="" src="${it.iconUrl}">`
            : it.type === 'link'
              ? `<img class="favicon" alt="" src="${toFavicon(it.url)}">`
              : `<div class="favicon">${
                  it.type === 'sheet'
                    ? I.table
                    : it.type === 'chart'
                      ? I.chart
                      : I.puzzle
                }</div>`;

        const hasReminder = Number.isFinite(it.reminderAt);
        const reminderLabel = escapeHtml(
          T.reminderNotificationTitle || 'Priminimas',
        );
        const reminderHtml = hasReminder
          ? `<span class="reminder-flag" role="img" aria-label="${reminderLabel}" title="${reminderLabel}">⏰</span>`
          : '';
        const metaHtml = `<div class="meta"><div class="title-row"><div class="title">${escapeHtml(
          it.title || '(be pavadinimo)',
        )}</div>${reminderHtml}</div><div class="sub">${escapeHtml(
          it.note || '',
        )}</div></div>`;

        const actionsHtml = editing
          ? `<div class="actions">
              <button type="button" title="${T.actions}" aria-label="${T.actions}" data-a="menu">${I.more}</button>
            </div>`
          : '';
        card.innerHTML = `${favicon}${metaHtml}${actionsHtml}`;
        const imgFav = card.querySelector('img.favicon');
        if (imgFav)
          imgFav.addEventListener('error', (e) => {
            const fallback =
              it.type === 'sheet'
                ? I.table
                : it.type === 'chart'
                  ? I.chart
                  : it.type === 'embed'
                    ? I.puzzle
                    : I.globe;
            e.target.outerHTML = `<div class="favicon">${fallback}</div>`;
          });

        card.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          if (editing) {
            const b = e.target.closest('button');
            if (!b) return;
            const a = b.dataset.a;
            if (a === 'menu') {
              if (floatingMenu) {
                if (floatingMenu.dataset.item === it.id) {
                  floatingMenu.remove();
                  floatingMenu = null;
                  return;
                }
                floatingMenu.remove();
              }
              floatingMenu = document.createElement('div');
              floatingMenu.className = 'floating-menu';
              floatingMenu.dataset.item = it.id;
              floatingMenu.innerHTML = `
                <button type="button" data-a="up">${I.arrowUp} ${T.moveUp}</button>
                <button type="button" data-a="down">${I.arrowDown} ${T.moveDown}</button>
                <button type="button" data-a="preview">${I.eye} ${T.preview}</button>
                <button type="button" data-a="edit">${I.pencil} ${T.edit}</button>
                <button type="button" class="btn-danger" data-a="del">${I.trash} ${T.remove}</button>
              `;
              document.body.appendChild(floatingMenu);
              const rect = b.getBoundingClientRect();
              floatingMenu.style.position = 'fixed';
              floatingMenu.style.top = rect.bottom + 4 + 'px';
              floatingMenu.style.left =
                rect.right - floatingMenu.offsetWidth + 'px';
              floatingMenu.addEventListener('click', (ev) => {
                const btn = ev.target.closest('button');
                if (!btn) return;
                const action = btn.dataset.a;
                floatingMenu.remove();
                floatingMenu = null;
                if (action === 'edit') return handlers.editItem(g.id, it.id);
                if (action === 'del') {
                  handlers.confirmDialog(T.confirmDelItem).then((ok) => {
                    if (ok) {
                      g.items = g.items.filter((x) => x.id !== it.id);
                      persist();
                      render(state, editing, T, I, handlers, saveFn);
                    }
                  });
                  return;
                }
                if (action === 'preview') return previewItem(it, card);
                if (action === 'up' || action === 'down') {
                  const idx = g.items.findIndex((x) => x.id === it.id);
                  if (action === 'up' && idx > 0) {
                    const [moved] = g.items.splice(idx, 1);
                    g.items.splice(idx - 1, 0, moved);
                  }
                  if (action === 'down' && idx < g.items.length - 1) {
                    const [moved] = g.items.splice(idx, 1);
                    g.items.splice(idx + 1, 0, moved);
                  }
                  persist();
                  render(state, editing, T, I, handlers, saveFn);
                }
              });
              return;
            }
          } else {
            if (it.type !== 'link') previewItem(it, card);
          }
        });

        itemsScroll.appendChild(card);
      });
    }

    itemsWrap.appendChild(itemsScroll);
    grp.appendChild(itemsWrap);
    if (g.collapsed) grp.classList.add('collapsed');
    groupsEl.appendChild(grp);
    const inner = grp.querySelector('.items');
    setupMinSizeWatcher(grp, inner);
    ro.observe(grp);
  });

  const totalGroups = state.groups.length;
  const totalItems = state.groups.reduce((sum, g) => sum + g.items.length, 0);
  statsEl.textContent = `${totalGroups} grupės • ${totalItems} įrašai`;
}

export function updateEditingUI(editing, state, T, I, renderFn) {
  const editBtn = document.getElementById('editBtn');
  document.body.classList.toggle('editing', editing);
  editBtn.innerHTML = editing
    ? `${I.check} <span>${T.done}</span>`
    : `${I.pencil} <span>${T.editMode}</span>`;
  ['addMenu', 'importBtn', 'exportBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = editing ? 'inline-flex' : 'none';
  });
  const addBtn = document.getElementById('addBtn');
  const addGroup = document.getElementById('addGroup');
  const addChart = document.getElementById('addChart');
  const addNote = document.getElementById('addNote');
  const addReminder = document.getElementById('addRemindersCard');
  if (addBtn) addBtn.innerHTML = `${I.plus} <span>${T.add}</span>`;
  if (addGroup) addGroup.innerHTML = `${I.plus} ${T.addGroup}`;
  if (addChart) addChart.innerHTML = `${I.chart} ${T.addChart}`;
  if (addNote) addNote.innerHTML = `${I.plus} ${T.addNote}`;
  if (addReminder) {
    addReminder.innerHTML = `${I.clock} ${T.addRemindersCard}`;
    if (!editing) addReminder.style.display = 'none';
    else
      addReminder.style.display = state.remindersCard?.enabled
        ? 'none'
        : 'block';
  }
  renderFn();
}

export function applyTheme() {
  let theme = localStorage.getItem('ed_dash_theme');
  if (!theme) {
    const prefersLight =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    // Jei reikia kitos pradinės temos – keiskite šiame bloke.
    theme = prefersLight ? 'light' : 'dark';
    localStorage.setItem('ed_dash_theme', theme);
  }
  if (theme === 'light') document.documentElement.classList.add('theme-light');
  else document.documentElement.classList.remove('theme-light');
}

export function toggleTheme() {
  const now =
    (localStorage.getItem('ed_dash_theme') || 'dark') === 'dark'
      ? 'light'
      : 'dark';
  localStorage.setItem('ed_dash_theme', now);
  applyTheme();
}
