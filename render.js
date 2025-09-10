let currentState;
let persist;
let floatingMenu;

const GRID = 20;

const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const id = entry.target.dataset.id;
    const g = currentState.groups.find((x) => x.id === id);
    if (g) {
      let w = Math.round(entry.contentRect.width / GRID) * GRID;
      let h = Math.round(entry.contentRect.height / GRID) * GRID;
      if (entry.target.dataset.resizing === '1') {
        const minW = entry.target.scrollWidth;
        const minH = entry.target.scrollHeight;
        if (w < minW) w = minW;
        if (h < minH) h = minH;
        entry.target.style.width = w + 'px';
        entry.target.style.height = h + 'px';
        g.w = w;
        g.h = h;
        g.resized = true;
        persist();
        resizeEmbeds(entry.target);
      }
    }
  }
});

document.addEventListener('mouseup', () => {
  document
    .querySelectorAll('.group')
    .forEach((g) => (g.dataset.resizing = '0'));
});

document.addEventListener('click', (e) => {
  if (floatingMenu && !e.target.closest('.floating-menu') && !e.target.closest('[data-a="menu"]')) {
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

const embedObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entry.target.dataset.custom === '1') continue;
    const w = entry.contentRect.width;
    entry.target.style.height = Math.round(w * 0.5625) + 'px';
  }
});

function resizeEmbeds(root) {
  if (!root) return;
  root.querySelectorAll('.embed').forEach((box) => {
    embedObserver.observe(box);
    if (box.dataset.custom === '1') return;
    const w = box.clientWidth;
    box.style.height = Math.round(w * 0.5625) + 'px';
  });
}

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
  resizeEmbeds(mount.closest('.group'));
}

export function render(state, editing, T, I, handlers, saveFn) {
  currentState = state;
  persist = saveFn;
  const groupsEl = document.getElementById('groups');
  const statsEl = document.getElementById('stats');
  const searchEl = document.getElementById('q');

  ro.disconnect();

  const q = (searchEl.value || '').toLowerCase().trim();
  groupsEl.innerHTML = '';
  state.groups.forEach((g) => {
    const grp = document.createElement('section');
    grp.className = 'group';
    grp.dataset.id = g.id;
    grp.dataset.resizing = '0';
    if (g.w) grp.style.width = g.w + 'px';
    if (g.resized) grp.style.height = g.h + 'px';
    grp.style.resize = editing ? 'both' : 'none';
    if (editing) {
      grp.addEventListener('mousedown', (e) => {
        const rect = grp.getBoundingClientRect();
        const withinHandle =
          e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
        if (withinHandle) grp.dataset.resizing = '1';
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
      grp.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData('text/group');
        if (fromId && fromId !== g.id) {
          const fromIdx = state.groups.findIndex((x) => x.id === fromId);
          const toIdx = state.groups.findIndex((x) => x.id === g.id);
          const [moved] = state.groups.splice(fromIdx, 1);
          state.groups.splice(toIdx, 0, moved);
          persist();
          render(state, editing, T, I, handlers, saveFn);
        }
      });
    }

    const h = document.createElement('div');
    h.className = 'group-header';
    h.innerHTML = `
        <div class="group-title">
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
        const card = document.createElement('div');
        card.className = 'item';
        card.dataset.gid = g.id;
        card.dataset.iid = it.id;
        card.draggable = editing;
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

        const favicon = it.iconUrl
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

        const metaHtml =
          it.type === 'link'
            ? `<a class="meta" href="${it.url}" target="_blank" rel="noopener"><div class="title">${escapeHtml(it.title || '(be pavadinimo)')}</div><div class="sub">${escapeHtml(it.note || '')}</div></a>`
            : `<div class="meta"><div class="title">${escapeHtml(it.title || '(be pavadinimo)')}</div><div class="sub">${escapeHtml(it.note || '')}</div></div>`;

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
              floatingMenu.style.left = rect.right - floatingMenu.offsetWidth + 'px';
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
            if (it.type === 'link') window.open(it.url, '_blank');
            else previewItem(it, card);
          }
        });

        itemsScroll.appendChild(card);
      });
    }

    itemsWrap.appendChild(itemsScroll);
    grp.appendChild(itemsWrap);
    groupsEl.appendChild(grp);
    ro.observe(grp);
    resizeEmbeds(grp);
  });

  const totalGroups = state.groups.length;
  const totalItems = state.groups.reduce((sum, g) => sum + g.items.length, 0);
  statsEl.textContent = `${totalGroups} grupės • ${totalItems} įrašai`;
}

export function updateEditingUI(editing, T, I, renderFn) {
  const editBtn = document.getElementById('editBtn');
  document.body.classList.toggle('editing', editing);
  editBtn.innerHTML = editing
    ? `${I.check} <span>${T.done}</span>`
    : `${I.pencil} <span>${T.editMode}</span>`;
  ['addGroup', 'importBtn', 'exportBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = editing ? 'inline-flex' : 'none';
  });
  renderFn();
}

export function applyTheme() {
  const theme = localStorage.getItem('ed_dash_theme') || 'dark';
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
