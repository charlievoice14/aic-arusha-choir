/* m_people.js — Departments and Members */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const canM = () => A.Auth.can('members');

  A.M.departments = {
    render(root) {
      const ds = St.live('departments').sort(U.by('name')); const today = U.today();
      root.innerHTML = `<div class="row" style="margin-bottom:10px">${canM() ? '<button class="btn pri" id="dNew">Add department</button>' : ''}<span class="muted small">Departments own work-plan activities and tasks. Department leaders manage their own department's items.</span></div>
        <div class="grid g3">${ds.map(d => {
          const mem = St.live('members').filter(m => (m.departments || []).includes(d.id));
          const acts = St.live('activities').filter(a => a.deptId === d.id); const ts = St.live('tasks').filter(t => t.deptId === d.id);
          const open = ts.filter(t => !['completed', 'cancelled'].includes(t.status)).length, od = ts.filter(t => L.taskOverdue(t, today)).length;
          const prog = acts.length ? Math.round(acts.reduce((t, a) => t + (+a.progress || 0), 0) / acts.length) : null;
          return `<div class="card" data-d="${d.id}" style="cursor:pointer;border-top:4px solid ${esc(L.deptColor(d.id))}"><div class="row between"><h3>${esc(d.name)}</h3>${UI.demo(d)}</div><div class="small muted">Leader: ${esc(L.memberName(d.leaderId))}</div>
            <div class="row small" style="margin:8px 0;gap:14px"><span><b class="num">${mem.length}</b> members</span><span><b class="num">${acts.length}</b> activities</span><span><b class="num">${open}</b> open tasks</span>${od ? `<span class="pill bad">${od} overdue</span>` : ''}</div>
            ${UI.bar(prog)}<div class="small muted" style="margin-top:3px">${prog == null ? 'No activities' : 'Average activity progress ' + prog + '%'}</div>${d.description ? `<p class="small" style="margin-top:6px">${esc(d.description)}</p>` : ''}</div>`;
        }).join('') || '<div class="empty">No departments yet. Add them here or with the setup guide in Settings.</div>'}</div>`;
      const nb = root.querySelector('#dNew'); if (nb) nb.onclick = () => edit();
      root.querySelectorAll('[data-d]').forEach(c => c.onclick = () => edit(St.get('departments', c.dataset.d)));
    },
  };
  function edit(rec) {
    rec = rec || {};
    UI.edit({ title: rec.id ? rec.name : 'New department', fields: [{ k: 'name', label: 'Department name', req: true }, { k: 'leaderId', label: 'Department leader', type: 'select', options: UI.opt.members() }, { k: 'color', label: 'Department color', type: 'color', full: true }, { k: 'description', label: 'Responsibilities', type: 'textarea', full: true }], rec: Object.assign({ color: L.autoColor(rec.name || String(Date.now())) }, rec), canEdit: canM(),
      onSave: v => St.put('departments', Object.assign({}, rec, v)),
      deleteFn: rec.id ? async () => { const used = St.all('tasks').some(t => t.deptId === rec.id) || St.all('activities').some(a => a.deptId === rec.id); if (used) { await St.patch('departments', rec.id, { archived: true }); UI.toast('Department has history, so it was archived instead of deleted.'); } else await St.del('departments', rec.id); } : null });
  }

  const memFields = () => [
    { k: 'name', label: 'Full name', req: true }, { k: 'role', label: 'Choir role / title', placeholder: 'e.g. Section leader' },
    { k: 'phone', label: 'Phone (optional)', type: 'tel' }, { k: 'email', label: 'Email (optional)', type: 'email' },
    { k: 'sections', label: 'Sections', type: 'multi', options: UI.opt.sections() }, { k: 'departments', label: 'Departments', type: 'multi', options: UI.opt.depts() },
    { k: 'status', label: 'Account status', type: 'select', options: [['active', 'Active'], ['inactive', 'Inactive']], blank: false },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  A.M.members = {
    render(root, params) {
      const f = UI.stp('members', { q: '', section: '', dept: '', status: 'active' }, params);
      let ms = St.live('members');
      if (f.q) { const q = f.q.toLowerCase(); ms = ms.filter(m => [m.name, m.role, m.phone, m.email].join(' ').toLowerCase().includes(q)); }
      if (f.section) ms = ms.filter(m => (m.sections || []).includes(f.section));
      if (f.dept) ms = ms.filter(m => (m.departments || []).includes(f.dept));
      if (f.status) ms = ms.filter(m => (m.status || 'active') === f.status);
      ms.sort(U.by('name'));
      const secs = UI.opt.sections();
      root.innerHTML = `<div class="stats">${secs.map(s => UI.stat(St.live('members').filter(m => m.status !== 'inactive' && (m.sections || []).includes(s)).length, s, { go: ['members', { section: s, status: 'active' }] })).join('')}${UI.stat(St.live('members').filter(m => m.status !== 'inactive').length, 'Active members')}</div>
        <div class="filters"><label class="grow">Search<input type="search" id="mQ" value="${esc(f.q)}"></label><label>Section${UI.sel('mS', secs, f.section)}</label><label>Department${UI.sel('mD', UI.opt.depts(), f.dept)}</label><label>Status${UI.sel('mT', [['active', 'Active'], ['inactive', 'Inactive']], f.status)}</label></div>
        <div class="row" style="margin-bottom:8px">${canM() ? '<button class="btn pri" id="mNew">Add member</button><button class="btn" id="mBulk">Bulk add</button><button class="btn" id="mImport">Import choir members</button>' : ''}<button class="btn" id="mCsv">CSV</button><span class="small muted">Members don't need an app account. Contact details are optional.</span></div>` +
        UI.table([{ label: 'Name', f: m => `<b>${esc(m.name)}</b>${UI.demo(m)}` }, { label: 'Sections', f: m => (m.sections || []).map(s => UI.chip(s, L.sectionColor(s))).join(' ') || '—' }, { label: 'Departments', f: m => (m.departments || []).map(d => UI.chip(L.deptName(d), L.deptColor(d))).join(' ') || '—' }, { label: 'Role', k: 'role' }, { label: 'Contact', f: m => esc([m.phone, m.email].filter(Boolean).join(' · ') || '—') }, { label: 'App account', f: m => (m.userId || St.all('roles').some(r => r.memberId === m.id)) ? '<span class="pill ok">Linked</span>' : '<span class="muted small">—</span>' }, { label: 'Status', f: m => UI.pill(m.status || 'active') }], ms, { click: 1, empty: 'No members match.' });
      UI.bindFilters(root, f, { mQ: 'q', mS: 'section', mD: 'dept', mT: 'status' }, A.render);
      UI.bindRows(root, id => editM(St.get('members', id)));
      const nb = root.querySelector('#mNew'); if (nb) nb.onclick = () => editM();
      const bb = root.querySelector('#mBulk'); if (bb) bb.onclick = bulk;
      const ib = root.querySelector('#mImport'); if (ib) ib.onclick = importChoir;
      root.querySelector('#mCsv').onclick = () => UI.csvDownload('Choir_Members.csv', ['Name', 'Sections', 'Departments', 'Role', 'Phone', 'Email', 'Status'], ms.map(m => [m.name, (m.sections || []).join('; '), (m.departments || []).map(L.deptName).join('; '), m.role, m.phone, m.email, m.status || 'active'])).catch(UI.fail);
    },
  };
  function editM(rec) {
    rec = rec || { status: 'active', sections: [], departments: [] };
    UI.edit({ title: rec.id ? rec.name : 'Add member', fields: memFields(), rec, canEdit: canM(), onSave: v => St.put('members', Object.assign({}, rec, v)),
      deleteFn: rec.id ? async () => { await St.patch('members', rec.id, { status: 'inactive', archived: true }); UI.toast('Member archived (kept for attendance history).'); } : null });
  }
  /* Adds everyone from the choir app (name, voice part, position) and links their choir login. */
  async function importChoir() {
    const src = (window.ChoirLink && window.ChoirLink.choirMembers) || [];
    const have = St.all('members');
    const norm = (s) => String(s || '').trim().toLowerCase();
    let added = 0, linked = 0;
    for (const c of src) {
      const ex = have.find(m => m.choirId === c.choirId) || have.find(m => !m.choirId && norm(m.name) === norm(c.name));
      if (ex) {
        const part = { choirId: c.choirId };
        if (c.userId && ex.userId !== c.userId) { part.userId = c.userId; linked++; }
        if (!(ex.sections || []).length && c.sections.length) part.sections = c.sections;
        if (ex.choirId !== c.choirId || part.userId || part.sections) await St.patch('members', ex.id, part, { audit: false });
      } else {
        await St.put('members', { name: c.name, choirId: c.choirId, userId: c.userId, sections: c.sections, departments: [], role: c.role, phone: '', status: 'active' }, { audit: false });
        added++;
      }
    }
    await St.audit('bulk', 'members', '-', `Imported choir members: ${added} added, ${linked} linked`).catch(() => { });
    UI.toast(`${added} added · ${linked} logins linked`);
  }
  function bulk() {
    UI.modal({ title: 'Bulk add members', body: `<p class="small">One member per line: <span class="mono">Name, Section, Phone</span>. Section and phone are optional.</p><textarea id="bk" style="width:100%;min-height:200px"></textarea>`, buttons: [{ label: 'Cancel' }, { label: 'Add members', cls: 'pri', onClick: async ({ body }) => { let n = 0; for (const line of body.querySelector('#bk').value.split('\n').map(s => s.trim()).filter(Boolean)) { const [name, sec, phone] = line.split(',').map(s => s.trim()); if (!name) continue; await St.put('members', { name, sections: sec ? [sec] : [], departments: [], phone: phone || '', status: 'active' }, { audit: false }); n++; } await St.audit('bulk', 'members', '-', `Added ${n} members`); UI.toast(`Added ${n} members`); } }] });
  }
})(window.App);
