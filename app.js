(function(){
  'use strict';
  const T = {
    searchPH: 'Paieška nuorodose…',
    addGroup: 'Pridėti grupę',
    import: 'Importuoti',
    export: 'Eksportuoti',
    theme: 'Tema',
    openAll: 'Atverti visas',
    addItem: 'Pridėti įrašą',
    editGroup: 'Redaguoti grupę',
    editMode: 'Redaguoti',
    done: 'Baigti',
    deleteGroup: 'Pašalinti grupę',
    empty: 'Nėra įrašų. Spauskite ＋, kad pridėtumėte nuorodą ar įterpimą.',
    noMatches: 'Nėra atitikmenų šioje grupėje.',
    itemType: 'Įrašo tipas',
    groupName: 'Grupės pavadinimas (pvz., „Kasdieniai darbai“, „Gairės“)',
    groupColor: 'Akcento spalva',
    renameGroup: 'Pervadinti grupę',
    itemTitle: 'Pavadinimas',
    itemUrl: 'URL',
    itemNote: 'Pastaba (nebūtina)',
    sheetTip: 'Patarimas: Google Sheets turi būti „Publish to web“ arba bendrinamas.',
    confirmDelGroup: 'Pašalinti šią grupę ir visus jos įrašus?',
    confirmDelItem: 'Pašalinti šį įrašą?',
    invalidImport: 'Netinkamas failo formatas',
    save: 'Išsaugoti',
    cancel: 'Atšaukti',
    required: 'Užpildykite visus laukus.',
    invalidUrl: 'Neteisingas URL.',
    remove: 'Pašalinti',
  };

  const I = {
    plus: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    pencil: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
    eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    arrowUpRight: '<svg class="icon" viewBox="0 0 24 24"><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    globe: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    table: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/></svg>',
    puzzle: '<svg class="icon" viewBox="0 0 24 24"><path d="M13 2a3 3 0 013 3h3v4h-3a3 3 0 1 1-6 0H7v4h3a3 3 0 1 1 6 0h3v4h-3a3 3 0 0 1-6 0H7v3H3v-3a3 3 0 0 1 3-3v-4a3 3 0 0 1-3-3V5h4a3 3 0 0 1 3-3h3z"/></svg>'
  };

  const STORAGE_KEY = 'ed_dashboard_lt_v1';
  const THEME_KEY = 'ed_dash_theme';
  const groupsEl = document.getElementById('groups');
  const statsEl = document.getElementById('stats');
  const searchEl = document.getElementById('q');
  const editBtn = document.getElementById('editBtn');
  const syncStatus = document.getElementById('syncStatus');
  let editing = false;

  function updateEditingUI(){
    document.body.classList.toggle('editing', editing);
    editBtn.innerHTML = editing ? `${I.check} <span>${T.done}</span>` : `${I.pencil} <span>${T.editMode}</span>`;
    ['addGroup','importBtn','exportBtn'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.style.display = editing ? 'inline-flex' : 'none';
    });
    render();
  }

  const uid = () => Math.random().toString(36).slice(2,10);

  // Tinklelio dydis grupių dydžių reguliavimui (px)
  const GRID = 20;

  let state = load() || seed();

  // Google Sheets
  const sheetsSync = (()=>{
    const SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec'; // Pakeiskite į savo "web app" URL
    async function send(action, payload){
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: payload })
      });
      if(!res.ok) throw new Error('HTTP '+ res.status);
      return res.json();
    }
    return {
      async export(){
        syncStatus.textContent = 'Sinchronizuojama…';
        try{
          await send('export', state);
          syncStatus.textContent = 'Baigta';
          console.log('Sheets eksportas pavyko');
        }catch(err){
          syncStatus.textContent = 'Nepavyko';
          console.error('Sheets eksportas nepavyko', err);
          alert('Sheets eksportas nepavyko');
        }finally{
          setTimeout(()=>{ syncStatus.textContent = ''; }, 3000);
        }
      },
      async import(){
        syncStatus.textContent = 'Sinchronizuojama…';
        try{
          const res = await send('import');
          if(res && res.data){
            state = res.data;
            save();
            render();
            console.log('Sheets importas pavyko');
          }
          syncStatus.textContent = 'Baigta';
        }catch(err){
          syncStatus.textContent = 'Nepavyko';
          console.error('Sheets importas nepavyko', err);
          alert('Sheets importas nepavyko');
        }finally{
          setTimeout(()=>{ syncStatus.textContent = ''; }, 3000);
        }
      }
    };
  })();

  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const id = entry.target.dataset.id;
      const g = state.groups.find(x => x.id === id);
      if (g) {
        const w = Math.round(entry.contentRect.width / GRID) * GRID;
        const h = Math.round(entry.contentRect.height / GRID) * GRID;
        if (entry.target.dataset.resizing === '1') {
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

  document.addEventListener('mouseup', ()=>{
    document.querySelectorAll('.group').forEach(g=>g.dataset.resizing='0');
  });

  // Dialogai
  const groupDlg = document.createElement('dialog');
  groupDlg.innerHTML = `<form method="dialog" id="groupForm">
      <label>${T.groupName}<br><input name="name" required></label>
      <label>${T.groupColor}<br><input name="color" type="color" value="#6ee7b7"></label>
      <p class="error" id="groupErr"></p>
      <menu>
        <button type="button" data-act="cancel">${T.cancel}</button>
        <button type="submit" class="btn-accent">${T.save}</button>
      </menu>
    </form>`;
  document.body.appendChild(groupDlg);
  const groupForm = groupDlg.querySelector('#groupForm');
  const groupErr = groupDlg.querySelector('#groupErr');
  const groupCancel = groupForm.querySelector('[data-act="cancel"]');

  const itemDlg = document.createElement('dialog');
  itemDlg.innerHTML = `<form method="dialog" id="itemForm">
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
  document.body.appendChild(itemDlg);
  const itemForm = itemDlg.querySelector('#itemForm');
  const itemErr = itemDlg.querySelector('#itemErr');
  const itemCancel = itemForm.querySelector('[data-act="cancel"]');

  function groupFormDialog(data={}){
    groupForm.name.value = data.name || '';
    groupForm.color.value = data.color || '#6ee7b7';
    groupErr.textContent = '';
    return new Promise(resolve=>{
      function submit(e){
        e.preventDefault();
        const name = groupForm.name.value.trim();
        if(!name){ groupErr.textContent = T.required; return; }
        resolve({name, color: groupForm.color.value});
        cleanup();
      }
      function cancel(){ resolve(null); cleanup(); }
      function cleanup(){
        groupForm.removeEventListener('submit', submit);
        groupCancel.removeEventListener('click', cancel);
        groupDlg.close();
      }
      groupForm.addEventListener('submit', submit);
      groupCancel.addEventListener('click', cancel);
      groupDlg.showModal();
    });
  }

  function itemFormDialog(data={}){
    itemForm.type.value = data.type || 'link';
    itemForm.title.value = data.title || '';
    itemForm.url.value = data.url || '';
    itemForm.note.value = data.note || '';
    itemErr.textContent = '';
    return new Promise(resolve=>{
      function submit(e){
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(itemForm));
        formData.title = formData.title.trim();
        formData.url = formData.url.trim();
        formData.note = formData.note.trim();
        if(!formData.title || !formData.url){ itemErr.textContent = T.required; return; }
        try{ new URL(formData.url); }catch{ itemErr.textContent = T.invalidUrl; return; }
        resolve(formData);
        cleanup();
      }
      function cancel(){ resolve(null); cleanup(); }
      function cleanup(){
        itemForm.removeEventListener('submit', submit);
        itemCancel.removeEventListener('click', cancel);
        itemDlg.close();
      }
      itemForm.addEventListener('submit', submit);
      itemCancel.addEventListener('click', cancel);
      itemDlg.showModal();
      itemForm.title.focus();
    });
  }

  function confirmDialog(msg){
    return new Promise(resolve=>{
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form method="dialog"><p>${msg}</p><menu><button value="cancel">${T.cancel}</button><button value="ok" class="btn-danger">${T.remove}</button></menu></form>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('close', ()=>{ resolve(dlg.returnValue==='ok'); dlg.remove(); });
      dlg.showModal();
    });
  }

  /** @typedef {{id:string, name:string, color:string, items: Item[], w?:number, h?:number, resized?:boolean}} Group */
  /** @typedef {{id:string, type:'link'|'sheet'|'embed', title:string, url:string, note?:string, h?:number}} Item */

  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function save(){ persist(); render(); }
  function load(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'');}catch(e){return null;} }
  function seed(){
    const data = { groups: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  function toFavicon(u){ try{ const url=new URL(u); return `${url.origin}/favicon.ico`; }catch{ return '' } }
  function toSheetEmbed(url){
    try{
      const u = new URL(url);
      if(!u.hostname.includes('docs.google.com')) return null;
      if(/\/(pub|pubhtml|htmlview|htmlembed)/.test(u.pathname)) return url;
      const parts = u.pathname.split('/').filter(Boolean);
      const dIdx = parts.indexOf('d');
      if(dIdx === -1) return null;
      let id = parts[dIdx + 1];
      if(id === 'e') id = parts[dIdx + 2];
      if(!id) return null;
      const gid = u.searchParams.get('gid') || u.hash.match(/gid=([^&]+)/)?.[1];
      const params = new URLSearchParams({widget:'true', headers:'false'});
      if(gid) params.set('gid', gid);
      return `https://docs.google.com/spreadsheets/d/${id}/htmlembed?${params.toString()}`;
    }catch{ return null; }
  }

  function render(){
    ro.disconnect();
    const q = (searchEl.value||'').toLowerCase().trim();
    groupsEl.innerHTML = '';
    state.groups.forEach((g)=>{
      const grp = document.createElement('section');
      grp.className = 'group';
      grp.dataset.id = g.id;
      grp.dataset.resizing = '0';
      if(g.w) grp.style.width = g.w + 'px';
      if(g.resized) grp.style.height = g.h + 'px';
      grp.style.resize = editing ? 'both' : 'none';
      if(editing){
        // žymime dydžio keitimą tik spaudžiant apatinį dešinį kampą
        grp.addEventListener('mousedown', (e)=>{
          const rect = grp.getBoundingClientRect();
          const withinHandle = e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20;
          if(withinHandle) grp.dataset.resizing = '1';
        });
        grp.draggable = true;
        grp.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/group', g.id); grp.style.opacity = .5; });
        grp.addEventListener('dragend',   ()=>{ grp.style.opacity = 1; });
        grp.addEventListener('dragover',  e=>{ e.preventDefault(); });
        grp.addEventListener('drop', (e)=>{
          e.preventDefault();
          const fromId = e.dataTransfer.getData('text/group');
          if(fromId && fromId!==g.id){
            const fromIdx = state.groups.findIndex(x=>x.id===fromId);
            const toIdx   = state.groups.findIndex(x=>x.id===g.id);
            const [moved] = state.groups.splice(fromIdx,1);
            state.groups.splice(toIdx,0,moved);
            save();
          }
        });
      }

      const h = document.createElement('div');
      h.className = 'group-header';
      h.innerHTML = `
        <div class="group-title">
          <span class="dot" style="background:${g.color||'#6ee7b7'}"></span>
          <h2 title="Tempkite, kad perrikiuotumėte" class="handle">${escapeHtml(g.name)}</h2>
        </div>
        ${editing?`<div class="group-actions">
          <button type="button" title="${T.openAll}" aria-label="${T.openAll}" data-act="openAll">${I.arrowUpRight}</button>
          <button type="button" title="${T.addItem}" aria-label="${T.addItem}" data-act="add">${I.plus}</button>
          <button type="button" title="${T.editGroup}" aria-label="${T.editGroup}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteGroup}" aria-label="${T.deleteGroup}" data-act="del">${I.trash}</button>
        </div>`:''}`;

      h.addEventListener('click', (e)=>{
        const btn = e.target.closest('button');
        if(!btn) return;
        const act = btn.dataset.act;
        if(act==='add') return addItem(g.id);
        if(act==='edit') return editGroup(g.id);
        if(act==='del'){
          confirmDialog(T.confirmDelGroup).then(ok=>{
            if(ok){
              state.groups = state.groups.filter(x=>x.id!==g.id);
              save();
            }
          });
          return;
        }
        if(act==='openAll'){ g.items.filter(i=>i.type==='link').forEach(i=> window.open(i.url, '_blank')); }
      });

      grp.appendChild(h);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'items';

      const filteredItems = g.items.filter(i=>{ if(!q) return true; return [i.title, i.url, i.note].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)); });

      if(filteredItems.length===0){
        const empty = document.createElement('div');
        empty.className='empty';
        empty.textContent = q ? T.noMatches : T.empty;
        itemsWrap.appendChild(empty);
      } else {
        filteredItems.forEach((it)=>{
          const card = document.createElement('div');
          card.className = 'item';
          card.dataset.gid = g.id;
          card.dataset.iid = it.id;
          card.draggable = editing;
          if(editing){
            card.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/item', JSON.stringify({gid:g.id,iid:it.id})); card.classList.add('dragging'); });
            card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
            card.addEventListener('dragover', e=> e.preventDefault());
            card.addEventListener('drop', (e)=>{
              e.preventDefault();
              const data = JSON.parse(e.dataTransfer.getData('text/item')||'{}');
              if(!data.iid) return;
              if(data.gid===g.id){
                const idxFrom = g.items.findIndex(x=>x.id===data.iid);
                const idxTo   = g.items.findIndex(x=>x.id===it.id);
                const [moved] = g.items.splice(idxFrom,1);
                g.items.splice(idxTo,0,moved);
                save();
              } else {
                const fromG = state.groups.find(x=>x.id===data.gid);
                const idxFrom = fromG.items.findIndex(x=>x.id===data.iid);
                const [moved] = fromG.items.splice(idxFrom,1);
                const idxTo   = g.items.findIndex(x=>x.id===it.id);
                g.items.splice(idxTo,0,moved);
                save();
              }
            });
          }

          const favicon = it.type==='link' ? `<img class="favicon" alt="" src="${toFavicon(it.url)}">` : `<div class="favicon">${it.type==='sheet'?I.table:I.puzzle}</div>`;

          const metaHtml = it.type==='link'
            ? `<a class="meta" href="${it.url}" target="_blank" rel="noopener"><div class="title">${escapeHtml(it.title||'(be pavadinimo)')}</div><div class="sub">${escapeHtml(it.note||'')}</div></a>`
            : `<div class="meta"><div class="title">${escapeHtml(it.title||'(be pavadinimo)')}</div><div class="sub">${escapeHtml(it.note||'')}</div></div>`;

          const actionsHtml = editing ? `<div class="actions">
              <button type="button" title="Peržiūra" aria-label="Peržiūra" data-a="preview">${I.eye}</button>
              <button type="button" title="Redaguoti" aria-label="Redaguoti" data-a="edit">${I.pencil}</button>
              <button type="button" class="btn-danger" title="Pašalinti" aria-label="Pašalinti" data-a="del">${I.trash}</button>
            </div>` : '';
          card.innerHTML = `${favicon}${metaHtml}${actionsHtml}`;
          if(it.type==='link') card.querySelector('img.favicon')?.addEventListener('error',e=>{e.target.outerHTML=`<div class="favicon">${I.globe}</div>`;});

          card.addEventListener('click', (e)=>{
            if(e.target.closest('a')) return;
            if(editing){
              const b = e.target.closest('button');
              if(!b) return;
              const a = b.dataset.a;
              if(a==='edit') return editItem(g.id, it.id);
              if(a==='del'){
                confirmDialog(T.confirmDelItem).then(ok=>{
                  if(ok){ g.items = g.items.filter(x=>x.id!==it.id); save(); }
                });
                return;
              }
              if(a==='preview') return previewItem(it, card);
            }else{
              if(it.type==='link') window.open(it.url, '_blank');
              else previewItem(it, card);
            }
          });

          itemsWrap.appendChild(card);
          if(it.type === 'embed' || it.type === 'sheet') previewItem(it, card);
        });
      }

      grp.appendChild(itemsWrap);
      groupsEl.appendChild(grp);
      if(editing) ro.observe(grp);
    });

    const totalGroups = state.groups.length;
    const totalItems = state.groups.reduce((s,g)=>s+g.items.length,0);
    statsEl.textContent = `${totalGroups} grupės • ${totalItems} įrašai`;
  }

  /**
   * Nustato numatytą embed aukštį pagal tėvinio elemento plotį (16:9),
   * jei vartotojas nėra pakeitęs dydžio.
   * @param {HTMLElement} root Grupės elementas
   */
  const embedObserver = new ResizeObserver(entries => {
    for(const entry of entries){
      if(entry.target.dataset.custom==='1') continue;
      const w = entry.contentRect.width;
      entry.target.style.height = Math.round(w * 0.5625) + 'px';
    }
  });

  function resizeEmbeds(root){
    if(!root) return;
    root.querySelectorAll('.embed').forEach(box => {
      embedObserver.observe(box);
      if(box.dataset.custom==='1') return;
      const w = box.clientWidth;
      box.style.height = Math.round(w * 0.5625) + 'px';
    });
  }

  function previewItem(it, mount){
    const existing = mount.nextElementSibling;
    if(existing && existing.classList.contains('embed')){ existing.remove(); return; }
    const wrap = document.createElement('div');
    wrap.className = 'embed';
    wrap.style.overflow = 'hidden';
    wrap.dataset.custom = it.h ? '1' : '0';
    if(it.h) wrap.style.height = it.h + 'px';
    let src = it.url;
    if(it.type==='sheet'){ const conv = toSheetEmbed(it.url); if(conv) src = conv; }
    wrap.innerHTML = `<iframe src="${src}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
    wrap.addEventListener('mouseup', ()=>{
      it.h = Math.round(wrap.getBoundingClientRect().height);
      wrap.dataset.custom = '1';
      save();
    });
    mount.after(wrap);
    resizeEmbeds(mount.closest('.group'));
  }

  async function addGroup(){
    const res = await groupFormDialog();
    if(!res) return;
    state.groups.push({ id:uid(), name:res.name, color:res.color, items:[], resized:false });
    save();
  }

  async function editGroup(gid){
    const g = state.groups.find(x=>x.id===gid); if(!g) return;
    const res = await groupFormDialog({name:g.name, color:g.color});
    if(!res) return;
    g.name = res.name;
    g.color = res.color;
    save();
  }

  async function addItem(gid){
    const g = state.groups.find(x=>x.id===gid); if(!g) return;
    const data = await itemFormDialog({type:'link'});
    if(!data) return;
    if(data.type==='sheet'){
      const conv = toSheetEmbed(data.url);
      if(conv) data.url = conv; else alert(T.sheetTip);
    }
    g.items.push({ id:uid(), type:data.type, title:data.title, url:data.url, note:data.note });
    save();
  }

  async function editItem(gid, iid){
    const g = state.groups.find(x=>x.id===gid); if(!g) return;
    const it = g.items.find(x=>x.id===iid); if(!it) return;
    const data = await itemFormDialog(it);
    if(!data) return;
    if(data.type==='sheet'){ const conv = toSheetEmbed(data.url); if(conv) data.url = conv; }
    it.type = data.type;
    it.title = data.title;
    it.url = data.url;
    it.note = data.note;
    save();
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'smp-skydas.json'; a.click(); URL.revokeObjectURL(a.href);
  }

  function importJson(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if(!data || !Array.isArray(data.groups)) throw new Error(T.invalidImport);
        state = data; save();
      }catch(err){ alert('Importo klaida: '+ err.message); }
    };
    reader.readAsText(file);
  }

  function applyTheme(){ const theme = localStorage.getItem(THEME_KEY) || 'dark'; if(theme==='light') document.documentElement.classList.add('theme-light'); else document.documentElement.classList.remove('theme-light'); }
  function toggleTheme(){ const now = (localStorage.getItem(THEME_KEY)||'dark')==='dark' ? 'light':'dark'; localStorage.setItem(THEME_KEY, now); applyTheme(); }
  document.getElementById('addGroup').addEventListener('click', addGroup);
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    exportJson();
    sheetsSync.export();
  });
  document.getElementById('importBtn').addEventListener('click', ()=>{
    sheetsSync.import();
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', (e)=>{ const f = e.target.files[0]; if(f) importJson(f); e.target.value=''; });
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  editBtn.addEventListener('click', ()=>{ editing = !editing; updateEditingUI(); });
  searchEl.placeholder = T.searchPH;
  searchEl.addEventListener('input', render);

  function escapeHtml(str){ return String(str).replace(/[&<>\"]/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s])); }

  applyTheme();
  updateEditingUI();

  // Papildoma diagnostika, jei vartotojas sako, kad mygtukai „neveikia“
  window.addEventListener('error', (e)=>{ console.error('Klaida:', e.message); });
})();
