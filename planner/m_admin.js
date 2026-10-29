/* m_admin.js — Settings & Administration, first-run wizard, roles, demo data, audit, setup guide */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const DEFAULT_DEPTS = ['Choir Leadership', 'Music and Repertoire', 'Rehearsal Coordination', 'Events and Protocol', 'Finance and Fundraising', 'Transport and Logistics', 'Media and Communications', 'Welfare and Hospitality', 'Prayer and Spiritual Development'];

  const identityFields = () => [
    { k: 'name', label: 'Choir name', req: true }, { k: 'church', label: 'Church affiliation' },
    { k: 'theme', label: 'Annual theme', full: true }, { k: 'year', label: 'Default planning year', type: 'number', min: 2000, max: 2100, req: true },
    { k: 'currency', label: 'Currency', placeholder: 'TZS' }, { k: 'sections', label: 'Choir sections / groups', type: 'list', hint: 'One per line, e.g. Soprano' },
    { k: 'categories', label: 'Event categories', type: 'list', hint: 'One per line' },
    { k: 'logoHtml', label: 'Logo', type: 'html', html: `<div class="row"><img id="logoPrev" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--surface-2)"><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp"><button class="btn sm" type="button" id="logoClear">Remove</button></div><div class="hint">Stored resized (max 160 px) in the database. Used in the sidebar and PDF headers.</div>` },
  ];
  function bindLogo(root, cur) {
    let logo = cur || '';
    const prev = root.querySelector('#logoPrev'); if (logo) prev.src = logo;
    root.querySelector('#logoFile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const img = new Image(); const url = URL.createObjectURL(f);
      img.onload = () => { const c = document.createElement('canvas'); const s = Math.min(1, 160 / Math.max(img.width, img.height)); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); logo = c.toDataURL('image/png'); if (logo.length > 120000) logo = c.toDataURL('image/jpeg', 0.85); prev.src = logo; URL.revokeObjectURL(url); };
      img.onerror = () => UI.toast('That image could not be read.', true);
      img.src = url;
    });
    root.querySelector('#logoClear').onclick = () => { logo = ''; prev.removeAttribute('src'); };
    return () => logo;
  }
  const cfgDefaults = () => Object.assign({ name: '', church: '', theme: '', year: 2027, currency: 'TZS', sections: ['Soprano', 'Alto', 'Tenor', 'Bass'], categories: L.CATEGORIES.slice(), reminders: { eventDays: 7, practiceHours: 48, taskDays: 3, songDays: 14, confirmDays: 30 }, holidays: [] }, St.cfg());

  const M = A.M.admin = {
    render(root) {
      const s = UI.st('admin', { tab: 'identity' });
      const tabs = [['identity', 'Choir identity'], ['colors', 'Categories & colors'], ['planning', 'Planning & reminders'], ['roles', 'Roles & permissions'], ['integrations', 'Integrations'], ['demo', 'Demo data'], ['audit', 'Audit history'], ['guide', 'Setup guide & schema']];
      root.innerHTML = `<div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${s.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="adm"></div>`;
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { s.tab = b.dataset.t; A.render(); });
      const el = root.querySelector('#adm');
      const canSet = A.Auth.can('settings');
      ({ identity, colors, planning, roles, integrations, demo, audit, guide })[s.tab](el, canSet);
    },
    wizard,
  };

  function identity(el, can) {
    const cfg = cfgDefaults(); const f = identityFields();
    el.innerHTML = `<div class="card">${UI.form(f, cfg)}<div class="row" style="margin-top:12px"><button class="btn pri" id="saveId" ${can ? '' : 'disabled'}>Save identity</button><button class="btn" id="runWiz" ${can ? '' : 'disabled'}>Run setup guide again</button>${can ? '' : '<span class="muted small">Only administrators can change settings.</span>'}</div></div>`;
    const getLogo = bindLogo(el, cfg.logo);
    el.querySelector('#saveId').onclick = async () => {
      const { vals, errs } = UI.read(el, f); if (!UI.showErr(el, errs)) return;
      try { await St.put('cfg', Object.assign({}, St.cfg(), vals, { id: 'org', logo: getLogo(), setupDone: true }), { summary: 'Choir settings' }); UI.toast('Settings saved'); A.render(); } catch (e) { UI.fail(e); }
    };
    el.querySelector('#runWiz').onclick = () => wizard();
  }

  function colors(el, can) {
    const cfg = cfgDefaults();
    const cats = (cfg.categories && cfg.categories.length ? cfg.categories : L.CATEGORIES).map(c => [c, L.catColor(c)]);
    const secs = (cfg.sections || []).map(c => [c, L.sectionColor(c)]);
    const depts = St.live('departments').sort(U.by('name'));
    const rows = (list, kind) => list.map(([n, c], i) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)" data-row="${kind}"><input type="text" value="${esc(n)}" data-name style="max-width:220px" ${can ? '' : 'disabled'} aria-label="Name">${UI.colorField(kind + '_' + i, c)}${can ? '<button class="btn sm danger" data-rm type="button">Remove</button>' : ''}</div>`).join('');
    el.innerHTML = `<p class="small muted">Colors show up on the calendar, event lists, practice plans, schedule slots, tasks and PDFs, so you can tell categories apart at a glance.</p>
      <div class="grid g2"><div class="card"><h3>Event categories</h3><div id="cCats">${rows(cats, 'cat')}</div>${can ? '<button class="btn sm" id="cAddCat" style="margin-top:8px">Add category</button>' : ''}</div>
      <div class="card"><h3>Choir sections</h3><div id="cSecs">${rows(secs, 'sec')}</div>${can ? '<button class="btn sm" id="cAddSec" style="margin-top:8px">Add section</button>' : ''}</div>
      <div class="card"><h3>Departments</h3>${depts.map(d => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)" data-dept="${d.id}"><b style="min-width:180px">${esc(d.name)}</b>${UI.colorField('dept_' + d.id, L.deptColor(d.id))}</div>`).join('') || '<p class="muted small">No departments yet.</p>'}</div>
      <div class="card"><h3>Practice plans & collections</h3><p class="small muted">Set these colors on each practice plan (Edit plan) and song collection.</p>${St.all('plans').map(p => `<div style="padding:3px 0">${UI.chip(p.name, L.planColor(p.id))}</div>`).join('')}${St.all('collections').map(c => `<div style="padding:3px 0">${UI.chip(c.name, L.colColor(c.id))}</div>`).join('')}</div></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="cSave" ${can ? '' : 'disabled'}>Save colors</button></div>`;
    UI.bindColors(el);
    const addRow = (box, kind) => { const i = Date.now(); box.insertAdjacentHTML('beforeend', `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)" data-row="${kind}"><input type="text" value="" data-name placeholder="Name" style="max-width:220px">${UI.colorField(kind + '_' + i, L.PALETTE[i % L.PALETTE.length][0])}<button class="btn sm danger" data-rm type="button">Remove</button></div>`); UI.bindColors(box.lastElementChild); bindRm(); };
    const bindRm = () => el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => b.closest('.row').remove());
    bindRm();
    const ac = el.querySelector('#cAddCat'); if (ac) ac.onclick = () => addRow(el.querySelector('#cCats'), 'cat');
    const as = el.querySelector('#cAddSec'); if (as) as.onclick = () => addRow(el.querySelector('#cSecs'), 'sec');
    el.querySelector('#cSave').onclick = async () => {
      const read = (kind) => [...el.querySelectorAll(`[data-row="${kind}"]`)].map(r => [r.querySelector('[data-name]').value.trim(), r.querySelector('input[type=hidden]').value]).filter(x => x[0]);
      const c = read('cat'), sc = read('sec');
      if (!c.length || !sc.length) return UI.toast('Keep at least one category and one section.', true);
      try {
        await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', categories: c.map(x => x[0]), categoryColors: Object.fromEntries(c), sections: sc.map(x => x[0]), sectionColors: Object.fromEntries(sc) }), { summary: 'Categories & colors' });
        for (const r of el.querySelectorAll('[data-dept]')) { const col = r.querySelector('input[type=hidden]').value; const d = St.get('departments', r.dataset.dept); if (d && d.color !== col) await St.patch('departments', d.id, { color: col }, { audit: false }); }
        UI.toast('Colors saved'); A.render();
      } catch (e) { UI.fail(e); }
    };
  }

  function planning(el, can) {
    const cfg = cfgDefaults(); const r = cfg.reminders;
    const f = [
      { k: 'eventDays', label: 'Remind about events (days before)', type: 'number', min: 0 }, { k: 'practiceHours', label: 'Remind about practices (hours before)', type: 'number', min: 0 },
      { k: 'taskDays', label: 'Task deadline reminder (days before)', type: 'number', min: 0 }, { k: 'songDays', label: 'Song readiness deadline reminder (days before)', type: 'number', min: 0 },
      { k: 'confirmDays', label: 'Flag unconfirmed host invitations (days before event)', type: 'number', min: 0 },
    ];
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>Reminder timing</h3>${UI.form(f, r)}<button class="btn pri" id="saveRem" style="margin-top:10px" ${can ? '' : 'disabled'}>Save reminder timing</button></div>
      <div class="card"><h3>Holidays & closed dates</h3><p class="muted small">Recurring practice series can skip these automatically ("Skip choir holidays").</p>
      ${UI.table([{ k: 'date', label: 'Date', f: h => U.fmtD(h.date) }, { k: 'name', label: 'Name' }, { label: '', f: h => can ? `<button class="btn sm danger" data-del="${h.date}">Remove</button>` : '' }], (cfg.holidays || []).map(h => Object.assign({ id: h.date }, h)).sort(U.by('date')), { empty: 'No holidays added.' })}
      <div class="row" style="margin-top:8px"><input type="date" id="hDate" style="max-width:170px"><input type="text" id="hName" placeholder="e.g. Christmas Day" style="max-width:220px"><button class="btn" id="hAdd" ${can ? '' : 'disabled'}>Add</button></div></div></div>`;
    el.querySelector('#saveRem').onclick = async () => { const { vals } = UI.read(el.querySelector('.card'), f); try { await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', reminders: vals }), { summary: 'Reminder timing' }); UI.toast('Saved'); } catch (e) { UI.fail(e); } };
    el.querySelector('#hAdd').onclick = async () => {
      const d = el.querySelector('#hDate').value, n = el.querySelector('#hName').value.trim();
      if (!U.validDate(d)) return UI.toast('Choose a date first.', true);
      const hol = (cfg.holidays || []).filter(h => h.date !== d).concat([{ date: d, name: n || 'Holiday' }]);
      try { await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', holidays: hol }), { summary: 'Holiday ' + d }); A.render(); } catch (e) { UI.fail(e); }
    };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { try { await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', holidays: (cfg.holidays || []).filter(h => h.date !== b.dataset.del) })); A.render(); } catch (e) { UI.fail(e); } });
  }

  const SHORT = { admin: 'Admin', chair: 'Chair', secretary: 'Secretary', music: 'Music Dir.', dept: 'Dept. leader', member: 'Member', viewer: 'Read-only' };
  async function roles(el) {
    const can = A.Auth.can('roles'); const user = A.caps.user; const CL = window.ChoirLink || {};
    const rs = St.all('roles');
    const ids = rs.map(r => r.id);
    const ps = user && ids.length ? await user.profiles(ids).catch(() => ({})) : {};
    const mx = A.Auth.matrix();
    const RL = A.allRoles();
    const titles = A.titles();
    const avail = (CL.titles || []);
    const fresh = avail.filter(t => !titles.includes(t));
    const leaders = (CL.leaders || []).slice().sort((a, b) => (a.admin === b.admin ? a.name.localeCompare(b.name) : a.admin ? -1 : 1));
    const count = (t) => (CL.members || []).filter(m => m && m.position === t).length;
    el.innerHTML = `<div class="grid g2">
      <div class="card"><h3>Leadership titles</h3>
        <p class="muted small">Bring in the leadership titles used in the choir app (Chairperson, Secretary, Treasurer…). Each title becomes a column in the permission matrix below, and everyone with that title gets its permissions automatically.</p>
        ${titles.length ? `<div class="row" style="gap:6px;margin:8px 0">${titles.map(t => `<span class="pill info">${esc(t)} <span class="muted">· ${count(t)}</span></span>`).join('')}</div>` : '<div class="empty" style="padding:16px">No titles imported yet.</div>'}
        <div class="row" style="margin-top:8px">${can ? `<button class="btn pri" id="tImport">${titles.length ? (fresh.length ? `Import ${fresh.length} new title${fresh.length === 1 ? '' : 's'}` : 'Refresh titles') : 'Import titles from the choir app'}</button>` : ''}${can && titles.length ? '<button class="btn ghost" id="tClear">Stop using titles</button>' : ''}</div>
      </div>
      <div class="card"><h3>Leaders & their planner roles</h3>
        <p class="muted small">Choir app administrators are always System Administrator. Everyone else follows their title, unless you give them a different role here.</p>
        ${UI.table([
          { label: 'Name', f: l => `<b>${esc(l.name)}</b>` },
          { label: 'Title', f: l => esc(l.title || '—') },
          { label: 'Planner role', f: l => { const own = St.get('roles', l.uid); const k = A.roleFor(l.uid, l.title, l.admin); return esc(A.roleLabel(k)) + (own && own.role && !l.admin ? ' <span class="pill gold">set by hand</span>' : ''); } },
          { label: '', f: l => can && !l.admin ? `<button class="btn sm" data-ed="${esc(l.uid)}" data-nm="${esc(l.name)}">Change</button>` : '' }
        ], leaders, { empty: 'No leaders have logged in to the choir app yet.' })}
        ${rs.filter(r => !leaders.some(l => l.uid === r.id)).length ? `<p class="small muted" style="margin-top:10px">Other people with a role: ${rs.filter(r => !leaders.some(l => l.uid === r.id)).map(r => `${esc((ps[r.id] && ps[r.id].name) || 'Someone')} (${esc(A.roleLabel(r.role))}) ${can ? `<button class="btn sm ghost" data-ed="${esc(r.id)}">Edit</button>` : ''}`).join(' · ')}</p>` : ''}
      </div></div>
      <div class="card" style="margin-top:14px"><h3>Permission matrix</h3><p class="muted small">Ticks control what each role and leadership title can do in the planner. Scroll sideways to see every title.</p>
        <div class="tw"><table class="t mx"><thead><tr><th>Permission</th>${RL.map(r => `<th title="${esc(r[1])}" style="text-align:center;white-space:normal;min-width:${r[0].startsWith('t_') ? 92 : 70}px">${esc(SHORT[r[0]] || r[1])}</th>`).join('')}</tr></thead><tbody>
        ${A.PERMS.filter(([p]) => p !== 'ai' || A.caps.sample).map(([p, d]) => `<tr><td>${esc(d)}</td>${RL.map(([r]) => `<td style="text-align:center"><input type="checkbox" data-r="${r}" data-p="${p}" ${r === 'admin' ? 'checked disabled' : ''} ${(mx[r] || []).includes(p) ? 'checked' : ''} ${can ? '' : 'disabled'} aria-label="${esc(r + ' ' + d)}"></td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="row" style="margin-top:8px"><button class="btn pri" id="saveMx" ${can ? '' : 'disabled'}>Save permissions</button><button class="btn" id="resetMx" ${can ? '' : 'disabled'}>Restore defaults</button></div>
      </div>`;
    const editRole = (uid, name) => { const cur = St.get('roles', uid); UI.edit({ title: 'Planner role for ' + (name || (ps[uid] && ps[uid].name) || 'this person'), fields: [{ k: 'role', label: 'Role', type: 'select', options: RL, req: true, blank: false, hint: 'Leave it on their title to follow the permission matrix for that title.' }, { k: 'memberId', label: 'Linked member profile', type: 'select', options: UI.opt.members(), hint: 'Used for "My Tasks", attendance and department leadership.' }], rec: cur || { role: A.roleFor(uid, (leaders.find(l => l.uid === uid) || {}).title, false) }, onSave: (v) => St.put('roles', Object.assign({ id: uid }, v), { summary: 'Role ' + v.role }).then(() => A.render()), deleteFn: cur ? () => St.del('roles', uid).then(() => { UI.toast('Back to following their title'); A.render(); }) : null }); };
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editRole(b.dataset.ed, b.dataset.nm));
    const ti = el.querySelector('#tImport');
    if (ti) ti.onclick = async () => {
      ti.disabled = true;
      try {
        const list = [...new Set(titles.concat(avail))];
        await St.put('cfg', { id: 'titles', list }, { summary: 'Leadership titles imported' });
        // new titles start with the permissions of the role their name suggests
        const cur = (St.get('cfg', 'perms') || {}).matrix || {}; const add = {};
        list.forEach(t => { const k = A.titleKey(t); if (!cur[k]) add[k] = A.titleDefaults(t); });
        if (Object.keys(add).length) await St.put('cfg', { id: 'perms', matrix: Object.assign({}, A.DEFAULT_MATRIX, cur, add) }, { summary: 'Title permissions' });
        UI.toast(`${list.length} leadership titles ready in the permission matrix`); A.render();
      } catch (e) { ti.disabled = false; UI.fail(e); }
    };
    const tc = el.querySelector('#tClear');
    if (tc) tc.onclick = async () => { if (!(await UI.confirm('Stop using leadership titles? Leaders go back to the role suggested by their position.', { ok: 'Stop using titles', danger: true }))) return; try { await St.put('cfg', { id: 'titles', list: [] }); A.render(); } catch (e) { UI.fail(e); } };
    el.querySelector('#saveMx').onclick = async () => {
      const m = {}; RL.forEach(([r]) => m[r] = []);
      el.querySelectorAll('[data-r]').forEach(c => { if (c.checked) m[c.dataset.r].push(c.dataset.p); });
      m.admin = A.PERMS.map(p => p[0]);
      try { await St.put('cfg', { id: 'perms', matrix: m }, { summary: 'Permission matrix' }); UI.toast('Permissions saved'); } catch (e) { UI.fail(e); }
    };
    el.querySelector('#resetMx').onclick = async () => { const m = Object.assign({}, A.DEFAULT_MATRIX); A.titles().forEach(t => m[A.titleKey(t)] = A.titleDefaults(t)); try { await St.put('cfg', { id: 'perms', matrix: m }, { summary: 'Permission defaults' }); A.render(); } catch (e) { UI.fail(e); } };
  }

  function integrations(el) {
    el.innerHTML = `<div class="grid g2">
      <div class="card"><h3>In-app notifications</h3><p><span class="pill ok">Active</span></p><p class="small">Reminders are calculated from saved records each time the planner opens. Timing is set under Planning & reminders.</p></div>
      <div class="card"><h3>Email & messaging (SMS / WhatsApp)</h3><p><span class="pill">Not configured</span></p><p class="small">No email or messaging service is connected, so the planner does not send messages outside the app. Connecting one needs an external provider account and credentials (a paid service in most cases).</p></div>
      <div class="card"><h3>Shared database</h3><p>${St.mode === 'db' ? '<span class="pill ok">Connected</span>' : '<span class="pill bad">Not connected (preview)</span>'}</p><p class="small">Records sync live through the choir app's Firebase database.</p></div>
      <div class="card"><h3>PDF & CSV downloads</h3><p>${A.caps.downloads ? '<span class="pill ok">Available</span>' : '<span class="pill">Unavailable in this view</span>'}</p><p class="small">PDFs are generated in the browser with the jsPDF library and offered through the download prompt.</p></div>
    </div>`;
  }

  function demo(el) {
    const can = A.Auth.can('settings');
    const n = ['slots', 'events', 'songs', 'plans', 'tasks', 'members', 'departments', 'travel', 'activities', 'objectives'].reduce((t, c) => t + St.all(c).filter(x => x.isDemo).length, 0);
    el.innerHTML = `<div class="card"><h3>Demo data</h3><p class="small">Loads fictional departments, members, songs, events, a practice plan with a recurring series, tasks and travel legs, all labelled <span class="pill demo">DEMO DATA</span>. Use it to explore, then remove it before real planning.</p><p class="small">Demo records in the database now: <b class="num">${n}</b></p>
    <div class="row"><button class="btn gold" id="loadDemo" ${can ? '' : 'disabled'}>Load demo data</button><button class="btn danger" id="clearDemo" ${can && n ? '' : 'disabled'}>Remove all demo data</button></div><div id="demoMsg" class="small" style="margin-top:8px"></div></div>`;
    el.querySelector('#loadDemo').onclick = async (e) => { e.target.disabled = true; el.querySelector('#demoMsg').textContent = 'Loading demo data…'; try { const c = await loadDemo(); el.querySelector('#demoMsg').textContent = `Loaded ${c} demo records.`; A.render(); } catch (x) { UI.fail(x); e.target.disabled = false; } };
    el.querySelector('#clearDemo').onclick = async (e) => { if (!(await UI.confirm('Remove every record marked DEMO DATA (and its practice sessions and song assignments)?', { ok: 'Remove demo data', danger: true }))) return; e.target.disabled = true; try { const c = await clearDemo(); UI.toast(`Removed ${c} demo records`); A.render(); } catch (x) { UI.fail(x); } };
  }

  async function audit(el) {
    const rows = St.all('audit').sort(U.by('at', -1)).slice(0, 300);
    const ex = St.all('exports').sort(U.by('at', -1)).slice(0, 60);
    const ids = U.uniq([...rows, ...ex].map(r => r.by));
    const ps = A.caps.user && ids.length ? await A.caps.user.profiles(ids).catch(() => ({})) : {};
    const who = (id) => esc((ps[id] && ps[id].name) || (id ? 'Someone' : '—'));
    el.innerHTML = `<div class="section-h"><h2>Recent changes</h2><span class="muted small">latest 300</span></div>${UI.table([{ label: 'When', f: r => U.stamp(r.at) }, { label: 'Who', f: r => who(r.by) }, { k: 'action', label: 'Action' }, { k: 'coll', label: 'Area' }, { k: 'summary', label: 'Record' }], rows, { empty: 'No changes recorded yet.' })}
    <div class="section-h"><h2>Export history</h2></div>${UI.table([{ label: 'When', f: r => U.stamp(r.at) }, { label: 'Who', f: r => who(r.by) }, { k: 'filename', label: 'File' }, { label: 'Result', f: r => UI.pill(r.status === 'ok' ? 'completed' : 'cancelled').replace('Completed', 'Generated').replace('Cancelled', 'Failed') }, { k: 'error', label: 'Detail' }], ex, { empty: 'No exports yet.' })}`;
  }

  function guide(el) {
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>Setup guide</h3><ol class="list-plain">
      <li>Open <b>Settings → Choir identity</b>: name, church, theme, logo, sections and categories.</li>
      <li>Add <b>Departments</b> and <b>Members</b>. Members don't need app accounts.</li>
      <li>Administrators and leaders of the choir app can open the planner. Assign each person's planner role under <b>Roles & permissions</b>, and use <b>Members → Import choir members</b> to link everyone.</li>
      <li>Create <b>annual objectives</b> and <b>activities</b> in the Annual Work-Plan.</li>
      <li>Add your regular practice times in <b>Schedule</b>.</li><li>Add <b>events</b>, then use <b>Schedule → Song practice planner</b> to create the practice plan and decide which songs to practise at each session.</li>
      <li>Build the <b>Song Library</b> and add songs to plan repertoires. Use assisted distribution to schedule them.</li>
      <li>Export the Q1 calendar from <b>PDF Studio</b>.</li></ol>
      <h3 style="margin-top:14px">What depends on outside services</h3><ul class="list-plain small">
      <li>The planner uses the choir app's own Firebase database and sign-in. No claude.ai account is needed.</li>
      <li>Email/SMS reminders need an external provider and are <b>not configured</b>.</li></ul>
      <h3 style="margin-top:14px">Where permissions are enforced</h3><ul class="list-plain small">
      <li><b>Enforced by the server:</b> only choir administrators and leaders can read or change planner data, and only administrators can change roles, settings and permissions.</li>
      <li><b>Enforced in the app:</b> the finer split between planner roles (Chair, Secretary, Music Director, Department Leader). Treat every leader as trusted.</li>
      <li>Each copy of the planner is one choir's own isolated database. A second choir needs its own copy.</li></ul></div>
      <div class="card"><h3>Database schema</h3><p class="small muted">Document collections (each record has id, createdAt/By, updatedAt/By):</p><div class="tw"><table class="t"><tbody>${[
        ['cfg/org, cfg/perms', 'Organisation identity, branding, sections, categories, holidays, reminders; permission matrix'], ['roles/{userId}', 'App role + linked member'],
        ['departments', 'name, description, leaderId → members'], ['members', 'name, phone, email, sections[], departments[] → departments, role, status, userId'],
        ['years', 'planning year, theme, approval'], ['objectives', 'year, title, target, KPI, deptId, status, progress'],
        ['activities', 'year, objectiveId, title, targets, KPI, start/end, deptId, leaderId, resources, budget, outcome, progress, status, approval'],
        ['events', 'code (unique EV-YYYY-NNN), category, start/end date+time, venue, host, leaderId, depts[], objectiveId, activityId, songIds[], equipment[], status, approval, hostConf, archived'],
        ['finance/{eventId}', 'budget, actual expenses (administrators and leaders only)'],
        ['tasks', 'title, linkType/linkId (event | activity | session), deptId, assignees[], start, due, priority, status, deps[] → tasks, pct, evidence'],
        ['travel', 'eventId, dir (outbound/return), depart/arrive date+time, from, to, mode, provider, booking, travelers[], accommodation, cost, coordinatorId, confirmed'],
        ['songs, collections', 'shared song library; collections hold songIds[]'], ['slots', 'Schedule: available practice times (weekdays, start/end, break, venue, sections, valid from/to, color); series.slotId links generated sessions back to them'], ['plans', 'practice plan: eventId, objectiveId, collectionId, dates, targets, songIds[], reservePct, status, approval'],
        ['series', 'recurrence rule: freq, weekdays[], start/end, times, breakMin, songTarget, exclusions[], skipHolidays'],
        ['sessions', 'id = seriesId_YYYYMMDD for series occurrences (one per date, cannot duplicate); date, start, end, breakMin, status, detached, actual{start,end,breakMin}, report'],
        ['assignments', 'id = sessionId__songId (one per song per session); locked, done, minutes'], ['readiness', 'id = planId__songId; stage, sectionStages, estSessions, estMin, targetDate'],
        ['attendance', 'id = sessionId; records{memberId: P/L/A/E}'], ['notifications, approvals, audit, exports', 'change notices, approval decisions, audit trail, export jobs'],
      ].map(([a, b]) => `<tr><td class="mono small" style="white-space:nowrap">${a}</td><td class="small">${b}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }

  // ---------- first-run wizard ----------
  function wizard() {
    const steps = ['Identity', 'Planning year', 'Departments', 'Members & sections', 'Objectives', 'Events & practice', 'Song library', 'First export'];
    let i = 0;
    const m = UI.modal({ title: 'Set up your choir planner', wide: true, body: '<div id="wz"></div>', buttons: [] });
    const box = m.body.querySelector('#wz');
    const foot = document.createElement('footer'); m.body.parentElement.appendChild(foot);
    const step = () => {
      const cfg = cfgDefaults();
      box.innerHTML = `<div class="steps">${steps.map((s, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}">${k + 1}. ${s}</span>`).join('')}</div><div id="ws"></div>`;
      const ws = box.querySelector('#ws'); let save = async () => true;
      if (i === 0) { const f = identityFields().filter(x => ['name', 'church', 'theme', 'logoHtml'].includes(x.k)); ws.innerHTML = UI.form(f, cfg); const gl = bindLogo(ws, cfg.logo); save = async () => { const { vals, errs } = UI.read(ws, f); if (!UI.showErr(ws, errs)) return false; await St.put('cfg', Object.assign({}, St.cfg(), cfgDefaults(), vals, { id: 'org', logo: gl(), setupDone: true }), { summary: 'Choir identity' }); A.render(); return true; }; }
      if (i === 1) { ws.innerHTML = `<p>Which year are you planning? The default is 2027.</p>${UI.form([{ k: 'year', label: 'Planning year', type: 'number', min: 2000, max: 2100 }, { k: 'theme', label: 'Theme for this year', full: true }], { year: cfg.year || 2027, theme: cfg.theme })}`; save = async () => { const { vals } = UI.read(ws, [{ k: 'year', type: 'number' }, { k: 'theme' }]); await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', year: vals.year || 2027, theme: vals.theme })); const y = String(vals.year || 2027); if (!St.get('years', y)) await St.put('years', { id: y, year: +y, theme: vals.theme, approval: 'pending' }); A.render(); return true; }; }
      if (i === 2) { const have = new Set(St.all('departments').map(d => d.name)); ws.innerHTML = `<p>Tick the departments to create. You can rename or add more later.</p><div class="checks" style="max-height:none">${DEFAULT_DEPTS.map(d => `<label><input type="checkbox" value="${esc(d)}" ${have.has(d) ? 'checked disabled' : 'checked'}> ${esc(d)}</label>`).join('')}</div>`; save = async () => { for (const c of ws.querySelectorAll('input:checked:not(:disabled)')) await St.put('departments', { name: c.value }); return true; }; }
      if (i === 3) { ws.innerHTML = `<div class="form"><label class="f"><span>Sections (one per line)</span><textarea id="wsec">${esc((cfg.sections || []).join('\n'))}</textarea></label><label class="f"><span>Quick-add members: one per line, "Name, Section"</span><textarea id="wmem" placeholder="Jane Doe, Soprano"></textarea></label></div>`; save = async () => { const secs = ws.querySelector('#wsec').value.split('\n').map(s => s.trim()).filter(Boolean); await St.put('cfg', Object.assign({}, St.cfg(), { id: 'org', sections: secs })); for (const line of ws.querySelector('#wmem').value.split('\n').map(s => s.trim()).filter(Boolean)) { const [n, sec] = line.split(',').map(s => s.trim()); await St.put('members', { name: n, sections: sec ? [sec] : [], departments: [], status: 'active' }); } return true; }; }
      if (i === 4) { ws.innerHTML = `<p>List the annual objectives for ${cfg.year || 2027}, one per line. You'll add targets and activities in the Annual Work-Plan.</p><textarea id="wobj" style="width:100%;min-height:120px" placeholder="Prepare and present two major concerts"></textarea>`; save = async () => { for (const t of ws.querySelector('#wobj').value.split('\n').map(s => s.trim()).filter(Boolean)) await St.put('objectives', { year: +(St.cfg().year || 2027), title: t, status: 'planned', progress: 0 }); return true; }; }
      if (i === 5) { ws.innerHTML = `<p>Create your first event and practice plan now, or skip and do it later.</p><div class="row"><button class="btn" id="wEv">New event…</button><button class="btn" id="wPl">New practice plan…</button></div>`; ws.querySelector('#wEv').onclick = () => A.M.events.edit(); ws.querySelector('#wPl').onclick = () => A.M.practice.editPlan(); }
      if (i === 6) { ws.innerHTML = `<p>Add songs to the shared library, one title per line. Add details later in Song Library.</p><textarea id="wsongs" style="width:100%;min-height:120px"></textarea><p class="small muted">Or load clearly labelled fictional demo data to explore:</p><button class="btn gold" id="wDemo">Load DEMO DATA</button>`; ws.querySelector('#wDemo').onclick = async (e) => { e.target.disabled = true; try { const c = await loadDemo(); UI.toast(`Loaded ${c} demo records`); } catch (x) { UI.fail(x); } }; save = async () => { for (const t of ws.querySelector('#wsongs').value.split('\n').map(s => s.trim()).filter(Boolean)) await St.put('songs', { title: t, difficulty: 'moderate', status: 'active', sections: [] }); return true; }; }
      if (i === 7) { ws.innerHTML = `<p>Your planner is ready. Export the first quarterly calendar (Q1 ${cfg.year || 2027}) from PDF Studio.</p><button class="btn pri" id="wPdf">Open PDF Studio</button>`; ws.querySelector('#wPdf').onclick = () => { m.close(); A.state.pdf = null; A.go('pdf'); }; }
      foot.innerHTML = '';
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; foot.appendChild(b); };
      if (i > 0) mk('Back', '', () => { i--; step(); });
      mk(i === steps.length - 1 ? 'Finish' : 'Skip', 'ghost', () => { if (i === steps.length - 1) return m.close(); i++; step(); });
      if (i < steps.length - 1) mk('Save & continue', 'pri', async (e) => { e.target.disabled = true; try { if ((await save()) !== false) { i++; step(); } } catch (x) { UI.fail(x); } e.target.disabled = false; });
    };
    step();
  }

  // ---------- demo data ----------
  async function loadDemo() {
    const y = +(St.cfg().year || 2027); let n = 0;
    const put = async (c, o) => { n++; return St.put(c, Object.assign({ isDemo: true }, o), { audit: false }); };
    if (!St.get('cfg', 'org')) await St.put('cfg', Object.assign(cfgDefaults(), { id: 'org', name: 'Demo Choir', setupDone: true }));
    const D = {}; for (const d of ['Music and Repertoire', 'Events and Protocol', 'Transport and Logistics', 'Media and Communications', 'Finance and Fundraising']) D[d] = (await put('departments', { name: 'DEMO – ' + d })).id;
    const mem = [['Amani K. (demo)', 'Soprano'], ['Neema J. (demo)', 'Soprano'], ['Rehema M. (demo)', 'Alto'], ['Faraja L. (demo)', 'Alto'], ['Baraka T. (demo)', 'Tenor'], ['Imani P. (demo)', 'Tenor'], ['Juma S. (demo)', 'Bass'], ['Daudi W. (demo)', 'Bass']];
    const M = []; for (const [nm, sec] of mem) M.push((await put('members', { name: nm, sections: [sec], departments: [D['Music and Repertoire']], status: 'active', role: 'Singer' })).id);
    await St.patch('departments', D['Music and Repertoire'], { leaderId: M[4] }, { audit: false });
    const songs = [['DEMO Song – Morning Light', 'easy', 'C'], ['DEMO Song – River of Grace', 'moderate', 'G'], ['DEMO Song – Hills of Promise', 'difficult', 'E♭'], ['DEMO Song – Lantern Hymn', 'moderate', 'F'], ['DEMO Song – Harvest Joy', 'easy', 'D'], ['DEMO Song – Quiet Waters', 'difficult', 'B♭'], ['DEMO Song – Gate of Praise', 'moderate', 'A']];
    const S = []; for (const [t, d, k] of songs) S.push((await put('songs', { title: t, difficulty: d, key: k, language: 'Swahili', genre: 'Worship', duration: 5, sections: ['Soprano', 'Alto', 'Tenor', 'Bass'], status: 'active', notes: 'Fictional demo song' })).id);
    await put('collections', { name: 'DEMO – Easter concert repertoire', songIds: S.slice(0, 6) });
    const obj = await put('objectives', { year: y, title: 'DEMO – Present two well-prepared concerts', target: '2 concerts', kpi: 'Concerts held; 90% songs ready 1 week before', status: 'planned', progress: 10, deptId: D['Music and Repertoire'] });
    const act = await put('activities', { year: y, objectiveId: obj.id, title: 'DEMO – Easter concert preparation', start: `${y}-02-01`, end: `${y}-03-28`, deptId: D['Music and Repertoire'], leaderId: M[4], target: '6 songs ready', kpi: 'Songs marked ready', budget: 1500000, status: 'in_progress', approval: 'approved', progress: 20 });
    const ev = await put('events', { code: L.nextEventCode(y), title: 'DEMO – Easter Concert', category: 'Concert', startDate: `${y}-03-28`, startTime: '15:00', endDate: `${y}-03-28`, endTime: '18:00', venue: 'Demo Community Hall', address: 'Fictional address', host: 'Demo host committee', status: 'approved', approval: 'approved', hostConf: 'awaiting', depts: [D['Music and Repertoire'], D['Events and Protocol']], objectiveId: obj.id, activityId: act.id, equipment: ['PA system', 'Keyboard'], songIds: S.slice(0, 6), leaderId: M[4], budget: 1500000 });
    const ev2 = await put('events', { code: L.nextEventCode(y), title: 'DEMO – Outreach visit', category: 'Outreach', startDate: `${y}-05-16`, startTime: '09:00', endDate: `${y}-05-17`, endTime: '17:00', venue: 'Demo Parish (fictional)', status: 'proposed', approval: 'pending', hostConf: 'awaiting', depts: [D['Transport and Logistics']], equipment: ['PA system'] });
    const plan = await put('plans', { name: 'DEMO – Easter concert preparation', year: y, eventId: ev.id, objectiveId: obj.id, start: `${y}-02-02`, target: `${y}-03-28`, ownerId: M[4], sections: ['Soprano', 'Alto', 'Tenor', 'Bass'], targetSongs: 6, targetSessions: 16, targetHours: 32, status: 'active', approval: 'approved', songIds: S.slice(0, 6), reservePct: 15 });
    await St.patch('events', ev.id, { planId: plan.id }, { audit: false });
    const sl1 = await put('slots', { name: 'DEMO – Weekday rehearsal', kind: 'practice', weekdays: [2, 4], freq: 'weekly', start: '17:30', end: '19:30', breakMin: 10, venue: 'Demo Church Hall', validFrom: `${y}-01-01`, validTo: `${y}-12-31`, color: '#2fb36a', skipHolidays: true, active: true, sections: [] });
    await put('slots', { name: 'DEMO – Saturday sectionals', kind: 'practice', weekdays: [6], freq: 'weekly', start: '14:00', end: '17:00', breakMin: 15, venue: 'Demo Church Hall', validFrom: `${y}-01-01`, validTo: `${y}-12-31`, color: '#6c6cf0', skipHolidays: true, active: true, sections: [] });
    await put('slots', { name: 'DEMO – Sunday service', kind: 'service', weekdays: [0], freq: 'weekly', start: '09:00', end: '12:00', breakMin: 0, venue: 'Demo Church', color: '#e3b04b', active: true });
    const sr = { id: U.uid('se_'), slotId: sl1.id, isDemo: true, planId: plan.id, title: 'DEMO – Weekly rehearsal', start: `${y}-02-02`, end: `${y}-03-26`, freq: 'custom', weekdays: [2, 4], startTime: '17:30', endTime: '19:30', breakMin: 10, songTarget: 3, venue: 'Demo Church Hall', sections: ['Soprano', 'Alto', 'Tenor', 'Bass'], leaderId: M[4], exclusions: [`${y}-03-04`] };
    const r = await L.saveSeries(sr); n += 1 + r.created;
    for (const sid of S.slice(0, 6)) await St.put('readiness', { id: L.rdId(plan.id, sid), planId: plan.id, songId: sid, stage: 'not_scheduled', isDemo: true }, { audit: false });
    for (const [t, d, due, pr] of [['Distribute song sheets', 'Music and Repertoire', `${y}-02-05`, 'high'], ['Book PA system', 'Media and Communications', `${y}-03-14`, 'medium'], ['Confirm venue with host', 'Events and Protocol', `${y}-03-01`, 'critical'], ['Arrange bus for outreach', 'Transport and Logistics', `${y}-05-01`, 'high']]) await put('tasks', { title: 'DEMO – ' + t, deptId: D[d], due, start: U.addDays(due, -14), priority: pr, status: 'not_started', pct: 0, linkType: 'event', linkId: t.includes('outreach') ? ev2.id : ev.id, assignees: [M[0]] });
    const vh = Object.assign(L.newVehicle('coaster', 1), { label: 'DEMO Coaster', seats: { 1: M[0], 2: M[1], 3: M[2], 4: M[3], 5: M[4], 6: M[5] } });
    await put('travel', { eventId: ev2.id, dir: 'outbound', departDate: `${y}-05-16`, departTime: '06:30', arriveDate: `${y}-05-16`, arriveTime: '08:30', from: 'Demo Church', to: 'Demo Parish', mode: 'Coaster', provider: '', booking: '', travelers: M, vehicles: [vh], confirmed: false, coordinatorId: M[6] });
    await put('travel', { eventId: ev2.id, dir: 'return', departDate: `${y}-05-17`, departTime: '17:30', arriveDate: `${y}-05-17`, arriveTime: '19:30', from: 'Demo Parish', to: 'Demo Church', mode: 'Coaster', travelers: M, confirmed: false, coordinatorId: M[6] });
    await St.patch('departments', D['Finance and Fundraising'], { leaderId: M[2], mission: 'Keep the choir’s money accountable and raise funds for ministry', editors: [M[3]] }, { audit: false });
    await St.patch('members', M[2], { departments: [D['Music and Repertoire'], D['Finance and Fundraising']] }, { audit: false });
    const ym = U.today().slice(0, 7);
    for (let i = 0; i < 6; i++) await put('fin_payments', { memberId: M[i], month: ym, amount: i < 4 ? 10000 : 5000, date: U.today(), method: i % 2 ? 'M-Pesa' : 'Cash' });
    const fc = await put('fin_contribs', { name: 'DEMO – Easter concert fund', target: 2000000, perMember: 50000, start: `${y}-01-10`, deadline: `${y}-03-20`, responsible: 'Rehema M. (demo)', status: 'Active', eventId: ev.id });
    for (let i = 0; i < 3; i++) await put('fin_cpay', { contribId: fc.id, memberId: M[i], amount: 50000, date: U.today(), method: 'Bank' });
    await put('fin_income', { date: U.today(), amount: 300000, category: 'Donation', description: 'DEMO – Well-wisher donation', method: 'Bank', receivedFrom: 'Demo donor' });
    await put('fin_expenses', { date: U.today(), amount: 120000, category: 'Transport', description: 'DEMO – Bus deposit for outreach', method: 'M-Pesa', paidTo: 'Demo Bus Co.', eventId: ev2.id, deptId: D['Transport and Logistics'] });
    await put('fin_openings', { type: 'Cash', amount: 450000, date: U.today(), note: 'DEMO – Balance brought forward' });
    await put('deptbudget', { deptId: D['Media and Communications'], title: 'DEMO – Hire sound system for Easter concert', amount: 350000, neededBy: `${y}-03-14`, eventId: ev.id, category: 'Equipment', status: 'requested', purpose: 'Fictional demo request' });
    await put('deptnotes', { deptId: D['Music and Repertoire'], type: 'minutes', date: U.today(), title: 'DEMO – Music team planning meeting', body: 'Fictional demo minutes: agreed Easter repertoire and rehearsal schedule.', attendees: [M[4], M[0]], actions: ['Share rehearsal recordings', 'Confirm keyboardist'] });
    await St.audit('demo', 'cfg', 'demo', 'Loaded demo data');
    return n;
  }
  async function clearDemo() {
    let n = 0;
    const demoPlans = new Set(St.all('plans').filter(p => p.isDemo).map(p => p.id));
    for (const s of St.all('sessions').filter(s => demoPlans.has(s.planId))) { await St.del('sessions', s.id, { audit: false }); n++; }
    for (const a of St.all('assignments').filter(a => demoPlans.has(a.planId))) { await St.del('assignments', a.id, { audit: false }); n++; }
    for (const a of St.all('readiness').filter(a => demoPlans.has(a.planId))) { await St.del('readiness', a.id, { audit: false }); n++; }
    for (const c of ['fin_payments', 'fin_cpay', 'fin_contribs', 'fin_income', 'fin_expenses', 'fin_openings', 'deptbudget', 'deptnotes', 'slots', 'series', 'plans', 'events', 'songs', 'collections', 'tasks', 'members', 'departments', 'travel', 'activities', 'objectives']) for (const x of St.all(c).filter(x => x.isDemo)) { await St.del(c, x.id, { audit: false }); n++; }
    await St.audit('demo', 'cfg', 'demo', `Removed ${n} demo records`);
    return n;
  }
  A.loadDemo = loadDemo; A.clearDemo = clearDemo;
})(window.App);
