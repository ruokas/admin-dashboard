let currentState;
let persist;
let floatingMenu;

// Holds references to currently shift-selected groups
let selectedGroups = [];
// Snap resizing to this grid size (px)
const GRID = 10;
const SIZE_MAP = {
  sm: { width: 240, height: 240 },
  md: { width: 360, height: 360 },
  lg: { width: 480, height: 480 },
};

function applySize(el, width, height) {
  el.style.width = width + 'px';
  el.style.height = height + 'px';
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
      const baseW = Math.round(entry.contentRect.width / GRID) * GRID;
      const baseH = Math.round(entry.contentRect.height / GRID) * GRID;

      const targets = selectedGroups.includes(entry.target)
        ? selectedGroups
        : [entry.target];

      targets.forEach((el) => {
        applySize(el, baseW, baseH);
        if (el.dataset.id === 'notes') {
          currentState.notesBox = {
            width: baseW,
            height: baseH,
          };
        } else {
          const sg = currentState.groups.find((x) => x.id === el.dataset.id);
          if (sg) {
            sg.width = baseW;
            sg.height = baseH;
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

  const q = (searchEl.value || '').toLowerCase().trim();
  groupsEl.innerHTML = '';
  function handleDrop(e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/group');
    const toId = e.currentTarget.dataset.id;
    if (!fromId || fromId === toId) return;
    const ids = currentState.groups.map((g) => g.id);
    if (currentState.notes) {
      const pos = Math.max(0, Math.min(currentState.notesPos || 0, ids.length));
      ids.splice(pos, 0, 'notes');
    }
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    const map = new Map(currentState.groups.map((g) => [g.id, g]));
    currentState.notesPos = ids.indexOf('notes');
    if (currentState.notesPos < 0) currentState.notesPos = 0;
    currentState.groups = ids
      .filter((id) => id !== 'notes')
      .map((id) => map.get(id));
    persist();
    render(currentState, editing, T, I, handlers, persist);
  }
  const allGroups = [...state.groups];
  if (state.notes) {
    const pos = Math.max(0, Math.min(state.notesPos || 0, allGroups.length));
    allGroups.splice(pos, 0, { id: 'notes' });
  }
  allGroups.forEach((g) => {
    if (g.id === 'notes') {
      const noteGrp = document.createElement('section');
      noteGrp.className = 'group';
      noteGrp.dataset.id = 'notes';
      noteGrp.dataset.resizing = '0';
      const nDims = state.notesBox?.size
        ? SIZE_MAP[state.notesBox.size]
        : { width: 360, height: 360 };
      const nWidth = state.notesBox?.width ?? nDims.width;
      const nHeight = state.notesBox?.height ?? nDims.height;
      applySize(noteGrp, nWidth, nHeight);
      noteGrp.style.resize = editing ? 'both' : 'none';
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
          e.dataTransfer.setData('text/group', 'notes');
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
      h.innerHTML = `
        <div class="group-title">
          <span class="dot" style="background:#fef08a"></span>
          <h2>${escapeHtml(state.notesTitle || T.notes)}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.edit}" aria-label="${T.edit}" data-act="edit">${I.pencil}</button>
        </div>`
            : ''
        }`;
      h.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.act === 'edit') handlers.editNotes();
      });
      noteGrp.appendChild(h);
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'items';
      const itemsScroll = document.createElement('div');
      itemsScroll.className = 'items-scroll';
      const p = document.createElement('p');
      p.style.whiteSpace = 'pre-wrap';
      p.style.padding = (state.notesOpts?.padding ?? 8) + 'px';
      p.style.fontSize = (state.notesOpts?.size ?? 16) + 'px';
      p.textContent = state.notes;
      itemsScroll.appendChild(p);
      itemsWrap.appendChild(itemsScroll);
      noteGrp.appendChild(itemsWrap);
      groupsEl.appendChild(noteGrp);
      ro.observe(noteGrp);
      return;
    }
    if (g.type === 'chart') {
      const grp = document.createElement('section');
      grp.className = 'group';
      grp.dataset.id = g.id;
      grp.dataset.resizing = '0';
      const gDims = g.size ? SIZE_MAP[g.size] : { width: 360, height: 360 };
      applySize(grp, g.width ?? gDims.width, g.height ?? gDims.height);
      grp.style.resize = editing ? 'both' : 'none';
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
      ro.observe(grp);
      return;
    }
    const grp = document.createElement('section');
    grp.className = 'group';
    grp.dataset.id = g.id;
    grp.dataset.resizing = '0';
    const gDims2 = g.size ? SIZE_MAP[g.size] : { width: 360, height: 360 };
    applySize(grp, g.width ?? gDims2.width, g.height ?? gDims2.height);
    grp.style.resize = editing ? 'both' : 'none';
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

        const metaHtml = `<div class="meta"><div class="title">${escapeHtml(it.title || '(be pavadinimo)')}</div><div class="sub">${escapeHtml(it.note || '')}</div></div>`;

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
    ro.observe(grp);
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
  ['addMenu', 'importBtn', 'exportBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = editing ? 'inline-flex' : 'none';
  });
  const addBtn = document.getElementById('addBtn');
  const addGroup = document.getElementById('addGroup');
  const addChart = document.getElementById('addChart');
  const addNote = document.getElementById('addNote');
  if (addBtn) addBtn.innerHTML = `${I.plus} <span>${T.add}</span>`;
  if (addGroup) addGroup.innerHTML = `${I.plus} ${T.addGroup}`;
  if (addChart) addChart.innerHTML = `${I.chart} ${T.addChart}`;
  if (addNote) addNote.innerHTML = `${I.plus} ${T.addNote}`;
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
