/* ui.js — modal, forms, tables, toasts, option helpers, router, downloads */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, L = A.L;
  const esc = U.esc;
  const UI = A.UI = {};
  A.M = A.M || {};
  A.state = A.state || {};

  UI.$ = (s, r = document) => r.querySelector(s);
  UI.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  UI.toast = (msg, bad) => {
    const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    UI.$('#toasts').appendChild(t); setTimeout(() => t.remove(), bad ? 7000 : 3500);
  };
  UI.fail = (e) => UI.toast((e && e.message) || String(e), true);

  // ---------- modal ----------
  UI.modal = ({ title, body, wide, buttons = [], onClose }) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn ghost" data-x aria-label="Close">✕</button></header><div class="body"></div><footer></footer></div>`;
    const bodyEl = bg.querySelector('.body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = bg.querySelector('footer');
    const close = () => { bg.remove(); onClose && onClose(); };
    buttons.forEach(b => {
      const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label; if (b.id) el.id = b.id;
      el.onclick = async () => { if (b.onClick) { el.disabled = true; try { const r = await b.onClick({ close, el, body: bodyEl }); if (r !== false && b.close !== false) close(); } catch (e) { UI.fail(e); } finally { el.disabled = false; } } else close(); };
      foot.appendChild(el);
    });
    if (!buttons.length) foot.remove();
    bg.querySelector('[data-x]').onclick = close;
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    UI.$('#modals').appendChild(bg);
    setTimeout(() => { const f = bg.querySelector('input,select,textarea'); if (f) f.focus(); }, 30);
    return { el: bg, body: bodyEl, close };
  };
  UI.confirm = (text, { ok = 'Confirm', danger, title = 'Please confirm' } = {}) => new Promise(res => {
    let done = false;
    UI.modal({ title, body: `<p>${text}</p>`, buttons: [{ label: 'Cancel', onClick: () => { done = true; res(false); } }, { label: ok, cls: danger ? 'danger' : 'pri', onClick: () => { done = true; res(true); } }], onClose: () => { if (!done) res(false); } });
  });

  // ---------- forms ----------
  const optList = (o) => (o || []).map(x => Array.isArray(x) ? x : [x, x]);
  UI.field = (f, v) => {
    const id = 'f_' + f.k;
    const req = f.req ? ' <b>*</b>' : '';
    const dis = f.readonly ? ' disabled' : '';
    const hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
    const wrap = (inner) => `<label class="f ${f.full ? 'full' : ''}" for="${id}"><span>${esc(f.label)}${req}</span>${inner}${hint}</label>`;
    if (f.type === 'section') return `<fieldset><legend>${esc(f.label)}</legend>${f.html || ''}</fieldset>`;
    if (f.type === 'html') return `<div class="f ${f.full ? 'full' : ''}">${f.label ? `<span>${esc(f.label)}</span>` : ''}${f.html}</div>`;
    if (f.type === 'color') return `<div class="f ${f.full ? 'full' : ''}"><span>${esc(f.label)}</span>${UI.colorField(f.k, v)}${hint}</div>`;
    if (f.type === 'textarea') return wrap(`<textarea id="${id}" name="${f.k}"${dis}>${esc(v || '')}</textarea>`);
    if (f.type === 'select') return wrap(`<select id="${id}" name="${f.k}"${dis}>${f.blank !== false ? `<option value="">${esc(f.blank || '—')}</option>` : ''}${optList(f.options).map(([a, b]) => `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`);
    if (f.type === 'multi') { const set = new Set(v || []); const opts = optList(f.options); return `<div class="f ${f.full !== false ? 'full' : ''}"><span>${esc(f.label)}${req}</span><div class="checks" id="${id}" data-multi="${f.k}">${opts.length ? opts.map(([a, b]) => `<label><input type="checkbox" value="${esc(a)}" ${set.has(a) ? 'checked' : ''}${dis}> ${esc(b)}</label>`).join('') : '<span class="muted small">Nothing to choose yet.</span>'}</div>${hint}</div>`; }
    if (f.type === 'checkbox') return `<label class="f ${f.full ? 'full' : ''}" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="${id}" name="${f.k}" ${v ? 'checked' : ''}${dis}> <span>${esc(f.label)}</span></label>`;
    if (f.type === 'list') return wrap(`<textarea id="${id}" name="${f.k}" data-list="1" placeholder="One per line"${dis}>${esc((v || []).join('\n'))}</textarea>`);
    const t = f.type || 'text';
    return wrap(`<input type="${t}" id="${id}" name="${f.k}" value="${esc(v == null ? '' : v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}${dis}>`);
  };
  UI.form = (fields, vals = {}) => `<form class="form" onsubmit="return false">${fields.filter(f => !f.hidden).map(f => UI.field(f, vals[f.k])).join('')}</form><div class="err" data-err></div>`;
  UI.read = (root, fields) => {
    const out = {}; const errs = [];
    fields.forEach(f => {
      if (['section', 'html'].includes(f.type) || f.readonly) return;
      if (f.type === 'multi') { const box = root.querySelector(`[data-multi="${f.k}"]`); if (box) out[f.k] = [...box.querySelectorAll('input:checked')].map(i => i.value); }
      else {
        const el = root.querySelector(`[name="${f.k}"]`); if (!el) return;
        if (f.type === 'checkbox') out[f.k] = el.checked;
        else if (f.type === 'number') out[f.k] = el.value === '' ? null : Number(el.value);
        else if (f.type === 'list') out[f.k] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        else out[f.k] = el.value.trim();
      }
      const v = out[f.k];
      if (f.req && (v == null || v === '' || (Array.isArray(v) && !v.length))) errs.push(`${f.label} is required.`);
      if (f.type === 'date' && v && !U.validDate(v)) errs.push(`${f.label} is not a valid date.`);
      if (f.type === 'number' && v != null && f.min != null && v < f.min) errs.push(`${f.label} must be at least ${f.min}.`);
    });
    return { vals: out, errs };
  };
  UI.showErr = (root, errs) => { const e = root.querySelector('[data-err]'); if (e) e.innerHTML = errs.map(esc).join('<br>'); return !errs.length; };

  /** generic create/edit modal */
  UI.edit = ({ title, fields, rec = {}, canEdit = true, onSave, extra = [], wide, after, validate, deleteFn }) => {
    const body = document.createElement('div');
    body.innerHTML = UI.form(fields, rec) + (canEdit ? '' : '<p class="muted small">You have view-only access to this record.</p>');
    if (!canEdit) body.querySelectorAll('input,select,textarea').forEach(el => el.disabled = true);
    const buttons = [{ label: canEdit ? 'Cancel' : 'Close' }, ...extra];
    if (canEdit && deleteFn) buttons.splice(1, 0, { label: 'Delete', cls: 'danger', onClick: async () => { if (await UI.confirm('Delete this record permanently? This cannot be undone.', { ok: 'Delete', danger: true })) { await deleteFn(); UI.toast('Deleted'); } else return false; } });
    if (canEdit) buttons.push({
      label: 'Save', cls: 'pri', onClick: async ({ body: b }) => {
        const { vals, errs } = UI.read(b, fields);
        if (validate) { const more = validate(vals); if (more && more.length) errs.push(...more); }
        if (!UI.showErr(b, errs)) return false;
        const r = await onSave(vals, b);
        if (r === false) return false;
        UI.toast('Saved');
      },
    });
    const m = UI.modal({ title, body, wide: wide !== false && fields.length > 6, buttons });
    UI.bindColors(m.body);
    after && after(m.body, m);
    return m;
  };

  // ---------- display helpers ----------
  UI.pill = (v, list, extra = '') => v ? `<span class="pill ${L.tone(v)} ${extra}">${esc(list ? L.label(list, v) : v)}</span>` : '<span class="muted">—</span>';
  UI.demo = (r) => r && r.isDemo ? ' <span class="pill demo" title="Fictional demo record">DEMO DATA</span>' : '';
  UI.table = (cols, rows, opts = {}) => {
    if (!rows.length) return `<div class="empty">${opts.empty || 'Nothing here yet.'}</div>`;
    return `<div class="tw ${opts.noResp ? '' : 'resp'}"><table class="t"><thead><tr>${cols.map(c => `<th ${c.n ? 'style="text-align:right"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${opts.click ? 'click' : ''}" data-id="${esc(r.id || '')}">${cols.map(c => `<td class="${c.n ? 'n' : ''}" data-label="${esc(c.label)}"><span class="cv">${c.f ? c.f(r) : esc(r[c.k])}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  UI.bindRows = (root, fn) => root.querySelectorAll('tr.click[data-id]').forEach(tr => tr.addEventListener('click', (e) => { if (e.target.closest('button,a,input,select')) return; fn(tr.dataset.id); }));
  UI.stat = (v, l, { f, tone, go, id } = {}) => `<button class="stat ${tone || ''}" ${go ? `data-go='${esc(JSON.stringify(go))}'` : ''} ${id ? `id="${id}"` : ''}><span class="v">${v}</span><span class="l">${esc(l)}</span>${f ? `<span class="f">${esc(f)}</span>` : ''}</button>`;
  UI.bindGo = (root) => root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const g = JSON.parse(b.dataset.go); A.go(g[0], g[1]); }));
  UI.bar = (p, cls = '') => `<div class="bar ${cls}" title="${p == null ? 'no data' : p + '%'}"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></div>`;

  // ---------- options ----------
  UI.opt = {
    members: () => St.live('members').filter(m => m.status !== 'inactive').sort(U.by('name')).map(m => [m.id, m.name + ((m.sections || []).length ? ' (' + m.sections.join('/') + ')' : '')]),
    depts: () => St.live('departments').sort(U.by('name')).map(d => [d.id, d.name]),
    events: (incl) => St.all('events').filter(e => !e.archived || e.id === incl).sort(U.by('startDate')).map(e => [e.id, `${e.title} (${U.fmtDs(e.startDate)}${e.startDate ? ' ' + e.startDate.slice(0, 4) : ''})`]),
    sections: () => (St.cfg().sections || ['Soprano', 'Alto', 'Tenor', 'Bass']),
    songs: () => St.live('songs').sort(U.by('title')).map(s => [s.id, s.title + (s.key ? ' · ' + s.key : '')]),
    plans: () => St.all('plans').sort(U.by('name')).map(p => [p.id, p.name]),
    objectives: (y) => St.all('objectives').filter(o => !y || +o.year === +y).map(o => [o.id, o.title]),
    activities: (y) => St.live('activities').filter(o => !y || +o.year === +y).map(o => [o.id, o.title]),
    collections: () => St.all('collections').map(c => [c.id, c.name]),
    categories: () => (St.cfg().categories && St.cfg().categories.length ? St.cfg().categories : L.CATEGORIES),
    years: () => { const y = U.uniq([2027, +(St.cfg().year || 2027), ...St.all('years').map(x => +x.year), +U.today().slice(0, 4)]).sort(); return y.map(x => [x, String(x)]); },
  };
  UI.yearSel = (id, v) => `<select id="${id}">${UI.opt.years().map(([a]) => `<option ${+v === +a ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
  UI.sel = (id, opts, v, blank = 'All') => `<select id="${id}">${blank != null ? `<option value="">${esc(blank)}</option>` : ''}${opts.map(o => Array.isArray(o) ? o : [o, o]).map(([a, b]) => `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  UI.st = (mod, defaults) => (A.state[mod] = A.state[mod] || Object.assign({}, defaults));
  /** bind filter inputs by id to a state object; re-render on change */
  UI.bindFilters = (root, state, map, rerender) => {
    Object.entries(map).forEach(([id, key]) => {
      const el = root.querySelector('#' + id); if (!el) return;
      const ev = el.type === 'search' || el.type === 'text' ? 'input' : 'change';
      el.addEventListener(ev, U.debounce(() => { state[key] = el.type === 'checkbox' ? el.checked : el.value; rerender(); }, ev === 'input' ? 250 : 0));
    });
  };

  // ---------- downloads ----------
  UI.download = async (filename, data) => {
    const dl = A.caps.downloads;
    if (!dl) throw new Error('File downloads are not available here. Nothing was downloaded.');
    try { await dl.save({ filename, data }); return true; }
    catch (e) {
      const msg = { declined: 'Download cancelled.', rejected_extension: 'This file type cannot be downloaded here.', too_large: 'The file is too large to download here.', rate_limited: 'Another download prompt is open. Finish it and try again.' }[e && e.code];
      if (e && e.code === 'declined') { UI.toast(msg); return false; }
      throw new Error(msg || ('Download failed: ' + ((e && (e.message || e.code)) || 'unknown error')));
    }
  };
  UI.csvDownload = async (name, head, rows) => { const ok = await UI.download(name, U.csv(head, rows)); if (ok) UI.toast('CSV ready: ' + name); };

  // ---------- router ----------
  A.go = (mod, params) => {
    A.nav = { mod, params: params || {} }; A._animate = true;
    if (location.hash !== '#' + mod) { A._silentHash = true; location.hash = mod; }
    document.body.classList.remove('navopen');
    A.render();
    window.scrollTo(0, 0);
  };
  A.reqAuth = (perm, rec) => A.Auth.can(perm, rec);
})(window.App);
(function (A) {
  /** module state + navigation params: params passed via A.go replace the module's filters once */
  A.UI.stp = (mod, defaults, params) => {
    if (params && Object.keys(params).length && !params.__applied) { A.state[mod] = Object.assign({}, defaults, params); params.__applied = true; }
    return A.UI.st(mod, defaults);
  };
  /** record an approval decision */
  A.UI.approve = async (coll, rec, decision, extra = {}) => {
    await A.Store.put('approvals', { coll, docId: rec.id, title: rec.title || rec.name, decision, by: A.Auth.uid || null }, { audit: false });
    await A.Store.patch(coll, rec.id, Object.assign({ approval: decision, approvedBy: A.Auth.uid || null, approvedAt: A.U.nowISO() }, extra), { summary: (decision === 'approved' ? 'Approved ' : 'Rejected ') + (rec.title || rec.name) });
  };
})(window.App);
(function (A) {
  const UI = A.UI, L = A.L, U = A.U, esc = U.esc;
  UI.chip = (label, color) => `<span class="chip" style="--c:${esc(color)}">${esc(label)}</span>`;
  UI.dot = (color, title) => `<span class="dot" style="--c:${esc(color)}" ${title ? `title="${esc(title)}"` : ''}></span>`;
  /** color picker field: swatches + custom */
  UI.colorField = (k, v) => { const val = v || L.PALETTE[0][0]; return `<div class="swatches" data-color="${k}"><input type="hidden" name="${k}" value="${esc(val)}">${L.PALETTE.map(([c, n]) => `<button type="button" style="--c:${c}" data-c="${c}" title="${n}" aria-label="${n}" class="${c.toLowerCase() === String(val).toLowerCase() ? 'on' : ''}"></button>`).join('')}<input type="color" value="${esc(val)}" aria-label="Custom color" title="Custom color"></div>`; };
  UI.bindColors = (root) => root.querySelectorAll('[data-color]').forEach(box => {
    const hid = box.querySelector('input[type=hidden]'), pick = box.querySelector('input[type=color]');
    const set = (c) => { hid.value = c; pick.value = c; box.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === c.toLowerCase())); };
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => set(b.dataset.c));
    pick.oninput = () => set(pick.value);
  });
})(window.App);
