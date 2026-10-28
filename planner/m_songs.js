/* m_songs.js — shared Song Library, collections, readiness overview */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const canS = () => A.Auth.can('songs');
  const songFields = () => [
    { k: 'title', label: 'Song title', req: true }, { k: 'alt', label: 'Alternative title' }, { k: 'artist', label: 'Artist / composer / source' },
    { k: 'language', label: 'Language' }, { k: 'genre', label: 'Genre / category' }, { k: 'key', label: 'Key' }, { k: 'tempo', label: 'Tempo (BPM)', type: 'number', min: 0 },
    { k: 'difficulty', label: 'Difficulty', type: 'select', options: [['easy', 'Easy'], ['moderate', 'Moderate'], ['difficult', 'Difficult']], blank: false },
    { k: 'duration', label: 'Duration estimate (minutes)', type: 'number', min: 0, step: 0.5 },
    { k: 'sections', label: 'Required choir sections', type: 'multi', options: UI.opt.sections() },
    { k: 'collections', label: 'Collections', type: 'multi', options: UI.opt.collections() },
    { k: 'lyrics', label: 'Lyrics (only where you have the right to store them) or lyrics reference', type: 'textarea', full: true },
    { k: 'sheetUrl', label: 'Arrangement / sheet music link', type: 'url' }, { k: 'audioUrl', label: 'Audio / rehearsal reference link (authorised)', type: 'url' },
    { k: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['learning', 'New song to learn'], ['retired', 'Retired']], blank: false },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  const M = A.M.songs = {
    render(root, params) {
      const f = UI.stp('songs', { tab: 'library', q: '', diff: '', lang: '', col: '', stage: '', plan: '' }, params);
      root.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="tabs" style="margin:0">${[['library', 'Song library'], ['collections', 'Collections'], ['readiness', 'Readiness by plan']].map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>${canS() ? '<div class="row"><button class="btn pri" id="sNew">Add song</button><button class="btn" id="sCol">New collection</button></div>' : ''}</div><div id="sBody"></div>`;
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
      const nb = root.querySelector('#sNew'); if (nb) nb.onclick = () => edit();
      const cb = root.querySelector('#sCol'); if (cb) cb.onclick = () => editCol();
      const el = root.querySelector('#sBody');
      ({ library, collections, readiness })[f.tab](el, f);
    },
    edit,
  };
  function library(el, f) {
    let songs = St.all('songs');
    if (f.q) { const q = f.q.toLowerCase(); songs = songs.filter(s => [s.title, s.alt, s.artist, s.genre].join(' ').toLowerCase().includes(q)); }
    if (f.diff) songs = songs.filter(s => s.difficulty === f.diff);
    if (f.lang) songs = songs.filter(s => s.language === f.lang);
    if (f.col) { const c = St.get('collections', f.col); const set = new Set((c && c.songIds) || []); songs = songs.filter(s => set.has(s.id)); }
    songs.sort(U.by(s => (s.title || '').toLowerCase()));
    const langs = U.uniq(St.all('songs').map(s => s.language));
    el.innerHTML = `<div class="filters"><label class="grow">Search<input type="search" id="sQ" value="${esc(f.q)}" placeholder="Title, composer, genre"></label><label>Difficulty${UI.sel('sD', [['easy', 'Easy'], ['moderate', 'Moderate'], ['difficult', 'Difficult']], f.diff)}</label><label>Language${UI.sel('sL', langs, f.lang)}</label><label>Collection${UI.sel('sC', UI.opt.collections(), f.col)}</label></div>
      <div class="row" style="margin-bottom:8px"><span class="muted small">${songs.length} song(s)</span><button class="btn sm" id="sCsv">CSV</button></div>` + UI.table([
      { label: 'Title', f: s => `<b>${esc(s.title)}</b>${St.all('collections').filter(c => (c.songIds || []).includes(s.id)).map(c => UI.dot(L.colColor(c.id), c.name)).join('')}${UI.demo(s)}${s.alt ? `<div class="small muted">${esc(s.alt)}</div>` : ''}` }, { label: 'Composer / source', k: 'artist' }, { label: 'Language', k: 'language' }, { label: 'Key', k: 'key' },
      { label: 'Difficulty', f: s => UI.pill(s.difficulty || 'moderate', null, s.difficulty === 'difficult' ? 'warn' : '') }, { label: 'Min', n: 1, f: s => s.duration || '—' },
      { label: 'Sections', f: s => esc((s.sections || []).join(', ')) }, { label: 'Plans', n: 1, f: s => St.all('plans').filter(p => L.planSongIds(p).includes(s.id)).length }, { label: 'Status', f: s => UI.pill(s.status || 'active') },
    ], songs, { click: 1, empty: 'The song library is empty. Add your first song.' });
    UI.bindFilters(el, f, { sQ: 'q', sD: 'diff', sL: 'lang', sC: 'col' }, A.render);
    UI.bindRows(el, id => edit(St.get('songs', id)));
    el.querySelector('#sCsv').onclick = () => UI.csvDownload('Choir_Song_Library.csv', ['Title', 'Alternative title', 'Composer/source', 'Language', 'Genre', 'Key', 'Tempo', 'Difficulty', 'Duration (min)', 'Sections', 'Status'], songs.map(s => [s.title, s.alt, s.artist, s.language, s.genre, s.key, s.tempo, s.difficulty, s.duration, (s.sections || []).join('; '), s.status])).catch(UI.fail);
  }
  function edit(rec) {
    const isNew = !rec;
    rec = rec || { difficulty: 'moderate', status: 'active', sections: UI.opt.sections().slice(0, 4) };
    const cols = St.all('collections').filter(c => (c.songIds || []).includes(rec.id)).map(c => c.id);
    UI.edit({
      title: isNew ? 'Add song to library' : rec.title, fields: songFields(), rec: Object.assign({}, rec, { collections: cols }), canEdit: canS(),
      validate: v => { const dup = St.all('songs').find(s => s.id !== rec.id && (s.title || '').trim().toLowerCase() === v.title.trim().toLowerCase()); return dup ? [`"${dup.title}" is already in the library. Open it instead of creating a duplicate.`] : []; },
      onSave: async (v) => {
        const colSel = v.collections || []; delete v.collections;
        const saved = await St.put('songs', Object.assign({}, rec, v));
        for (const c of St.all('collections')) { const has = (c.songIds || []).includes(saved.id), want = colSel.includes(c.id); if (has !== want) await St.patch('collections', c.id, { songIds: want ? [...(c.songIds || []), saved.id] : c.songIds.filter(x => x !== saved.id) }, { audit: false }); }
      },
      deleteFn: !isNew ? async () => { const used = St.all('assignments').some(a => a.songId === rec.id) || St.all('plans').some(p => (p.songIds || []).includes(rec.id)); if (used) { await St.patch('songs', rec.id, { status: 'retired' }); UI.toast('This song is used in practice plans, so it was marked Retired instead of deleted.'); return; } await St.del('songs', rec.id); } : null,
    });
  }
  function collections(el) {
    const cs = St.all('collections').sort(U.by('name'));
    el.innerHTML = `<p class="small muted">Collections group songs from the shared library, e.g. Concert, Wedding, Christmas, Worship, Recording, or New songs to learn. A song can be in several collections without being duplicated.</p>` + UI.table([{ label: 'Collection', f: c => UI.chip(c.name, L.colColor(c.id)) + UI.demo(c) }, { label: 'Songs', n: 1, f: c => (c.songIds || []).length }, { label: 'Description', k: 'description' }], cs, { click: 1, empty: 'No collections yet.' });
    UI.bindRows(el, id => editCol(St.get('collections', id)));
  }
  function editCol(rec) {
    rec = rec || { songIds: [] };
    UI.edit({ title: rec.id ? rec.name : 'New collection', fields: [{ k: 'name', label: 'Collection name', req: true, placeholder: 'Christmas repertoire' }, { k: 'color', label: 'Color', type: 'color', full: true }, { k: 'description', label: 'Description' }, { k: 'songIds', label: 'Songs', type: 'multi', options: UI.opt.songs() }], rec, canEdit: canS(), onSave: v => St.put('collections', Object.assign({}, rec, v)), deleteFn: rec.id ? () => St.del('collections', rec.id) : null });
  }
  function readiness(el, f) {
    const plans = St.all('plans').filter(p => p.status !== 'cancelled' && (!f.plan || p.id === f.plan));
    const rows = []; plans.forEach(p => L.planSongIds(p).forEach(id => rows.push({ id: p.id + '|' + id, p, songId: id, stage: L.stage(p.id, id) })));
    const list = rows.filter(r => !f.stage || (f.stage === 'notready' ? r.stage !== 'ready' : r.stage === f.stage));
    const today = U.today();
    el.innerHTML = `<div class="filters"><label class="grow">Plan${UI.sel('rP', UI.opt.plans(), f.plan)}</label><label>Stage${UI.sel('rS', [...L.STAGES, ['notready', 'Not yet ready (any)']], f.stage)}</label></div>` + UI.table([
      { label: 'Song', f: r => esc(L.songTitle(r.songId)) }, { label: 'Plan / event', f: r => esc(r.p.name) + `<div class="small muted">${L.planTargetDate(r.p) ? 'by ' + U.fmtD(L.planTargetDate(r.p)) : ''}</div>` },
      { label: 'Stage', f: r => UI.pill(r.stage, L.STAGES) }, { label: 'Last · next practice', f: r => { const x = L.lastNextPractice(r.p.id, r.songId, today); return `${x.last ? U.fmtDs(x.last) : '—'} · ${x.next ? U.fmtDs(x.next) : '—'}`; } },
      { label: 'Practised / planned', n: 1, f: r => { const tl = L.songTimeline(r.p.id, r.songId).filter(x => x.s.status !== 'cancelled'); return `${tl.filter(x => x.a.done).length} / ${tl.length}`; } },
      { label: 'Target', f: r => { const rd = L.readiness(r.p.id, r.songId) || {}; return rd.targetDate ? U.fmtDs(rd.targetDate) : '—'; } },
    ], list, { click: 1, empty: 'No songs match.' });
    UI.bindFilters(el, f, { rP: 'plan', rS: 'stage' }, A.render);
    UI.bindRows(el, id => A.go('practice', { plan: id.split('|')[0], ptab: 'songs' }));
  }
})(window.App);
