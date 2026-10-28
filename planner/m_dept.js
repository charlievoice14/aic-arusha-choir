/* m_dept.js — Department workspaces: each department signs in to its own space to keep its profile, plans, tasks, minutes and budget requests */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, C = A.Charts, esc = U.esc;
  const NOTE_TYPES = [['minutes', 'Meeting minutes'], ['report', 'Report'], ['note', 'Note'], ['announcement', 'Announcement']];
  const BUDGET_STATUS = [['requested', 'Requested'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['paid', 'Paid']];
  L.BUDGET_STATUS = BUDGET_STATUS;
  L.financeDept = () => St.get('departments', St.cfg().financeDeptId) || St.live('departments').find(d => /financ|fedha|fundrais/i.test(d.name)) || null;
  const deptMembers = (id) => St.live('members').filter(m => (m.departments || []).includes(id) && m.status !== 'inactive').sort(U.by('name'));
  const myDeptIds = () => A.Auth.myDepts().member;

  A.M.departments = {
    render(root, params) {
      const f = UI.stp('departments', { dept: '', tab: 'overview' }, params);
      if (f.dept && !St.get('departments', f.dept)) f.dept = '';
      if (f.dept) return workspace(root, f);
      hub(root);
    },
    open: (id, tab) => A.go('departments', { dept: id, tab: tab || 'overview' }),
  };

  // ---------- hub ----------
  function hub(root) {
    const ds = St.live('departments').sort(U.by('name')); const mine = myDeptIds(); const today = U.today();
    const card = (d) => {
      const mem = deptMembers(d.id); const acts = St.live('activities').filter(a => a.deptId === d.id); const ts = St.live('tasks').filter(t => t.deptId === d.id);
      const open = ts.filter(t => !['completed', 'cancelled'].includes(t.status)).length, od = ts.filter(t => L.taskOverdue(t, today)).length;
      const prog = acts.length ? Math.round(acts.reduce((t, a) => t + (+a.progress || 0), 0) / acts.length) : null;
      const isMine = mine.includes(d.id); const canE = A.Auth.canDept(d.id);
      return `<button class="card dcard" data-d="${d.id}" style="--c:${esc(L.deptColor(d.id))}"><div class="row between" style="margin-bottom:6px"><h3 style="margin:0">${esc(d.name)}</h3>${canE ? '<span class="pill ok">You can edit</span>' : isMine ? '<span class="pill info">Your department</span>' : ''}${UI.demo(d)}</div>
        <div class="small muted" style="text-align:left">${esc(d.mission || 'Leader: ' + L.memberName(d.leaderId))}</div>
        <div class="row small" style="margin:10px 0;gap:14px"><span><b class="num">${mem.length}</b> members</span><span><b class="num">${acts.length}</b> plans</span><span><b class="num">${open}</b> open tasks</span>${od ? `<span class="pill bad">${od} overdue</span>` : ''}</div>
        ${UI.bar(prog)}<div class="small muted" style="margin-top:4px;text-align:left">${prog == null ? 'No plans yet' : 'Plans ' + prog + '% complete'}</div></button>`;
    };
    const mineDs = ds.filter(d => mine.includes(d.id));
    root.innerHTML = `<div class="hero-h"><div style="flex:1;min-width:240px"><h2>Department <em>workspaces</em></h2><p class="muted small" style="margin:6px 0 0;max-width:640px">Each department keeps its own profile, plans, tasks, meeting minutes and budget requests here. Leaders and co-leaders can edit their department; everyone else can view it.</p></div>
      ${A.Auth.can('members') ? '<button class="btn pri" id="dNew">Add department</button>' : ''}</div>
      ${A.Auth.memberId() ? '' : `<div class="banner info">Your account isn't linked to a member profile yet, so no department is marked as yours. An administrator can link it under Settings → Roles & permissions.</div>`}
      ${mineDs.length ? `<div class="section-h"><h2>Your departments</h2></div><div class="grid g3">${mineDs.map(card).join('')}</div><div class="section-h"><h2>All departments</h2></div>` : ''}
      <div class="grid g3">${ds.filter(d => !mine.includes(d.id)).map(card).join('') || (mineDs.length ? '' : '<div class="empty">No departments yet. Add them here or with the setup guide in Settings.</div>')}</div>`;
    root.querySelectorAll('[data-d]').forEach(c => c.onclick = () => A.M.departments.open(c.dataset.d));
    const nb = root.querySelector('#dNew'); if (nb) nb.onclick = () => editProfile();
  }

  // ---------- workspace ----------
  function workspace(root, f) {
    const d = St.get('departments', f.dept); const can = A.Auth.canDept(d.id); const fin = L.financeDept(); const isFin = fin && fin.id === d.id;
    const tabs = [['overview', 'Overview'], ['calendar', 'Calendar'], ['plans', 'Plans'], ['tasks', 'Tasks'], ['events', 'Events'], ['notes', 'Minutes & reports'], ['budget', 'Budget requests'], ['team', 'Team'], ...(isFin ? [['finance', 'AAC Finance Manager']] : [])];
    if (!tabs.some(t => t[0] === f.tab)) f.tab = 'overview';
    root.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn sm ghost" id="dBack">← All departments</button></div>
      <div class="card dhead" style="--c:${esc(L.deptColor(d.id))};margin-bottom:14px"><div class="row between"><div style="min-width:0"><div class="muted small">Department workspace</div><h2>${esc(d.name)}${UI.demo(d)}</h2>
        <div class="small">${d.mission ? esc(d.mission) + ' · ' : ''}Leader: <b>${esc(L.memberName(d.leaderId))}</b>${(d.editors || []).length ? ' · Co-leaders: ' + d.editors.map(L.memberName).map(esc).join(', ') : ''}</div></div>
        <div class="row">${can ? '<span class="pill ok">You can edit this department</span><button class="btn" id="dEdit">Edit profile</button>' : '<span class="pill">View only</span>'}<button class="btn" id="dPdf">Department plan PDF</button></div></div></div>
      <div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="dBody"></div>`;
    root.querySelector('#dBack').onclick = () => { f.dept = ''; A.render(); };
    root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
    const eb = root.querySelector('#dEdit'); if (eb) eb.onclick = () => editProfile(d);
    root.querySelector('#dPdf').onclick = () => { A.state.pdf = { type: 'deptplan', dept: d.id, period: { kind: 'year', year: +(St.cfg().year || 2027) } }; A.go('pdf'); };
    const el = root.querySelector('#dBody');
    ({ overview, calendar, plans, tasks, events, notes, budget, team, finance: (e) => A.Fin.render(e) })[f.tab](el, d, can);
  }

  function overview(el, d, can) {
    const today = U.today(); const y = +(St.cfg().year || 2027);
    const acts = St.live('activities').filter(a => a.deptId === d.id && +a.year === y); const ts = St.live('tasks').filter(t => t.deptId === d.id);
    const evs = St.live('events').filter(e => (e.depts || []).includes(d.id) && e.startDate >= today && e.status !== 'cancelled').sort(U.by('startDate'));
    const notes = St.all('deptnotes').filter(n => n.deptId === d.id).sort(U.by('date', -1));
    const reqs = St.all('deptbudget').filter(r => r.deptId === d.id);
    const cur = St.cfg().currency || 'TZS';
    el.innerHTML = `<div class="kpis">
        <button class="kpi k1" data-tab="plans"><span class="h"><i>${A.icon('workplan')}</i>Plans ${y}</span><span class="b"><span class="v">${acts.length}</span><span class="f">${acts.filter(a => a.status === 'completed').length} completed</span></span></button>
        <button class="kpi k2" data-tab="tasks"><span class="h"><i>${A.icon('tasks')}</i>Open tasks</span><span class="b"><span class="v">${ts.filter(t => !['completed', 'cancelled'].includes(t.status)).length}</span><span class="f">${ts.filter(t => L.taskOverdue(t, today)).length} overdue</span></span></button>
        <button class="kpi k3" data-tab="events"><span class="h"><i>${A.icon('events')}</i>Upcoming events</span><span class="b"><span class="v">${evs.length}</span><span class="f">${evs[0] ? U.fmtDs(evs[0].startDate) + ' next' : 'none scheduled'}</span></span></button>
        <button class="kpi k4" data-tab="budget"><span class="h"><i>${A.icon('reports')}</i>Budget requested</span><span class="b"><span class="v">${U.num(reqs.filter(r => r.status !== 'rejected').reduce((t, r) => t + (+r.amount || 0), 0))}</span><span class="f">${cur} · ${reqs.filter(r => r.status === 'requested').length} awaiting decision</span></span></button>
      </div>
      <div class="grid g2">
        <div class="card"><h3>About the department</h3><dl class="kv"><dt>Mission</dt><dd>${esc(d.mission || '—')}</dd><dt>Responsibilities</dt><dd style="white-space:pre-wrap">${esc(d.description || '—')}</dd><dt>Meets</dt><dd>${esc([d.meetDay, d.meetTime, d.meetVenue].filter(Boolean).join(' · ') || '—')}</dd><dt>Contact</dt><dd>${esc(d.contact || '—')}</dd><dt>Members</dt><dd>${deptMembers(d.id).length}</dd></dl></div>
        <div class="card"><h3>Plan progress</h3>${C.meters(acts.slice(0, 8).map(a => ({ label: a.title, value: +a.progress || 0, max: 100 }))) || '<p class="muted small">No plans for this year yet.</p>'}</div>
        <div class="card"><h3>Coming up</h3>${evs.slice(0, 5).map(e => `<div class="small" style="padding:4px 0">${UI.dot(L.catColor(e.category))}<b>${esc(e.title)}</b> · ${U.fmtD(e.startDate)}</div>`).join('') || '<p class="muted small">No upcoming events for this department.</p>'}
          ${ts.filter(t => t.due && t.due >= today && !['completed', 'cancelled'].includes(t.status)).sort(U.by('due')).slice(0, 5).map(t => `<div class="small" style="padding:4px 0">${UI.dot('#e0566b')}Due ${U.fmtDs(t.due)}: ${esc(t.title)}</div>`).join('')}</div>
        <div class="card"><h3>Latest minutes & reports</h3>${notes.slice(0, 4).map(n => `<div style="padding:5px 0;border-bottom:1px solid var(--line)"><b class="small">${esc(n.title)}</b> <span class="pill">${esc(L.label(NOTE_TYPES, n.type))}</span><div class="small muted">${U.fmtD(n.date)}</div></div>`).join('') || '<p class="muted small">Nothing recorded yet.</p>'}</div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { A.state.departments.tab = b.dataset.tab; A.render(); });
  }

  const DK = [['activity', 'Plans (work-plan)'], ['deadline', 'Task deadlines'], ['event', 'Events'], ['practice', 'Practice sessions']];
  function calendar(el, d) {
    const st = A.state.dcal = A.state.dcal || {};
    const y0 = +(St.cfg().year || 2027); const t = U.today();
    const anchor = st.month || (+t.slice(0, 4) === y0 ? t.slice(0, 7) : `${y0}-01`);
    const [y, m] = anchor.split('-').map(Number); const [a, b] = U.mRange(y, m);
    const show = Object.assign({ activity: true, deadline: true, event: true, rehearsal: true, practice: true, travel: false }, st.show || {});
    const items = L.calItems(a, b, { dept: d.id, show }).filter(i => i.kind !== 'practice' || (St.get('plans', (St.get('sessions', i.id) || {}).planId) || {}).depts);
    items.forEach(i => { i.color = i.kind === 'rehearsal' ? L.KIND_COLOR.event : L.KIND_COLOR[i.kind]; });
    const first = U.ymd(y, m, 1); const start = U.addDays(first, -((U.dow(first) + 6) % 7));
    let g = `<div class="mgrid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="dh">${x}</div>`).join('')}`;
    for (let k = 0; k < 42; k++) {
      const day = U.addDays(start, k); if (k >= 35 && +day.slice(5, 7) !== m) break;
      const its = L.itemsOn(items, day).sort((p, q) => (q.kind === 'activity') - (p.kind === 'activity'));
      g += `<div class="d ${+day.slice(5, 7) !== m ? 'out' : ''} ${day === t ? 'today' : ''}" style="cursor:default"><span class="dn">${+day.slice(8)}</span>${its.slice(0, 6).map(i => `<span class="ci ${i.cancelled ? 'x' : ''} ${i.kind === 'activity' && L.isCont(i, day) ? 'cont' : ''}" style="--k:${esc(i.color)}" data-id="${esc(i.id)}" data-coll="${i.coll}" title="${esc(i.title + ' — ' + i.sub)}">${i.time ? esc(i.time) + ' ' : ''}${esc(i.title)}</span>`).join('')}${its.length > 6 ? `<span class="small muted">+${its.length - 6} more</span>` : ''}</div>`;
    }
    g += '</div>';
    const shift = (n) => { let mm = m + n, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } st.month = `${yy}-${U.pad(mm)}`; A.render(); };
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="row"><button class="btn sm" id="dcP" aria-label="Previous month">◀</button><b style="min-width:140px;text-align:center">${U.MONTHS[m - 1]} ${y}</b><button class="btn sm" id="dcN" aria-label="Next month">▶</button><button class="btn sm" id="dcT">Today</button></div>
        <div class="row"><button class="btn sm" id="dcAll">Open in main calendar</button><button class="btn sm" id="dcPdf">PDF</button></div></div>
      <div class="legend">${DK.map(([k, l]) => `<span style="--k:${L.KIND_COLOR[k]}"><label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" data-dk="${k}" ${show[k] ? 'checked' : ''}><i></i>${l}</label></span>`).join('')}</div>${g}
      <p class="small muted" style="margin-top:8px">Plans show across their full dates: the name appears on the first day and each Monday, with a thin bar on the days in between. Click any item to open it.</p>`;
    el.querySelector('#dcP').onclick = () => shift(-1); el.querySelector('#dcN').onclick = () => shift(1); el.querySelector('#dcT').onclick = () => { st.month = t.slice(0, 7); A.render(); };
    el.querySelectorAll('[data-dk]').forEach(c => c.onchange = () => { st.show = Object.assign({}, show, { [c.dataset.dk]: c.checked, rehearsal: c.dataset.dk === 'event' ? c.checked : show.rehearsal }); A.render(); });
    el.querySelectorAll('.ci[data-id]').forEach(c => c.onclick = () => A.openItem(c.dataset.coll, c.dataset.id));
    el.querySelector('#dcAll').onclick = () => A.go('calendar', { view: 'month', anchor: first, dept: d.id, colorBy: 'category', show: { event: true, rehearsal: true, practice: true, deadline: true, activity: true, travel: false } });
    el.querySelector('#dcPdf').onclick = () => { A.state.pdf = { type: 'calendar', dept: d.id, period: { kind: 'month', year: y, m }, cover: false }; A.go('pdf'); };
  }

  function plans(el, d, can) {
    const y = +(St.cfg().year || 2027);
    const acts = St.live('activities').filter(a => a.deptId === d.id).sort(U.by('start'));
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="pNew">Add plan / activity</button>' : ''}<span class="small muted">Plans added here go into the choir's Annual Work-Plan under ${esc(d.name)} and need approval from the leadership.</span></div>` +
      [1, 2, 3, 4].map(q => { const [a, b] = U.qRange(y, q); const qa = acts.filter(x => +x.year === y && U.overlapRange(x.start || x.end, x.end || x.start, a, b)); return `<div class="card" style="margin-bottom:12px"><div class="row between"><h3>Q${q} ${y}</h3><span class="small muted">${qa.length}</span></div>${qa.map(x => `<div data-a="${x.id}" style="padding:8px 0;border-top:1px solid var(--line);cursor:pointer"><div class="row between"><b>${esc(x.title)}</b><span>${UI.pill(x.status, L.ACT_STATUS)} ${UI.pill(x.approval || 'pending', L.APPROVAL)}</span></div><div class="small muted">${U.fmtDs(x.start)} – ${U.fmtDs(x.end)}${x.target ? ' · ' + esc(x.target) : ''}${x.budget ? ' · ' + U.money(x.budget, St.cfg().currency) : ''}</div>${UI.bar(+x.progress || 0)}</div>`).join('') || '<p class="small muted">No plans this quarter.</p>'}</div>`; }).join('');
    el.querySelectorAll('[data-a]').forEach(x => x.onclick = () => A.M.workplan.editActivity(St.get('activities', x.dataset.a)));
    const nb = el.querySelector('#pNew'); if (nb) nb.onclick = () => A.M.workplan.newActivity({ deptId: d.id, year: y });
  }

  function tasks(el, d, can) {
    const ts = St.live('tasks').filter(t => t.deptId === d.id).sort(U.by(t => t.due || '9999'));
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="tNew">Add task</button>' : ''}<button class="btn" id="tBoard">Open on task board</button></div>` + UI.table([
      { label: 'Task', f: t => `<b>${esc(t.title)}</b><div class="small muted">${esc(L.linkLabel(t))}</div>` }, { label: 'Assigned', f: t => esc((t.assignees || []).map(L.memberName).join(', ') || '—') },
      { label: 'Deadline', f: t => U.fmtD(t.due) + (L.taskOverdue(t) ? ' <span class="pill bad">Overdue</span>' : '') }, { label: 'Priority', f: t => UI.pill(t.priority, L.PRIORITY) }, { label: 'Status', f: t => UI.pill(t.status, L.TASK_STATUS) }, { label: 'Done', f: t => `<div style="min-width:70px">${UI.bar(+t.pct || 0)}</div>` },
    ], ts, { click: 1, empty: 'No tasks for this department yet.' });
    UI.bindRows(el, id => A.M.tasks.edit(St.get('tasks', id)));
    const nb = el.querySelector('#tNew'); if (nb) nb.onclick = () => A.M.tasks.edit({ deptId: d.id, due: U.addDays(U.today(), 14) });
    el.querySelector('#tBoard').onclick = () => A.go('tasks', { view: 'kanban', dept: d.id });
  }

  function events(el, d) {
    const evs = St.live('events').filter(e => (e.depts || []).includes(d.id)).sort(U.by('startDate'));
    el.innerHTML = UI.table([{ label: 'Event', f: e => `${UI.chip(e.category || 'Other', L.catColor(e.category))} <b>${esc(e.title)}</b>` }, { label: 'Date', f: e => U.fmtD(e.startDate) }, { label: 'Venue', f: e => esc(e.venue || '—') }, { label: 'Status', f: e => UI.pill(e.status, L.EVENT_STATUS) }, { label: 'Our tasks', n: 1, f: e => St.live('tasks').filter(t => t.deptId === d.id && t.linkType === 'event' && t.linkId === e.id).length }], evs, { click: 1, empty: 'This department is not listed on any event yet. Add it under "Participating departments" on an event.' });
    UI.bindRows(el, id => A.M.events.view(id));
  }

  function notes(el, d, can) {
    const ns = St.all('deptnotes').filter(n => n.deptId === d.id).sort(U.by('date', -1));
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="nNew">Add minutes / report</button>' : ''}</div>` + (ns.length ? ns.map(n => `<div class="card" style="margin-bottom:10px;cursor:pointer" data-n="${n.id}"><div class="row between"><div><span class="pill">${esc(L.label(NOTE_TYPES, n.type))}</span> <b>${esc(n.title)}</b></div><span class="small muted">${U.fmtD(n.date)}</span></div><p class="small" style="white-space:pre-wrap;margin:8px 0 0">${esc((n.body || '').slice(0, 400))}${(n.body || '').length > 400 ? '…' : ''}</p>${(n.actions || []).length ? `<div class="small" style="margin-top:6px"><b>Action items:</b> ${n.actions.map(esc).join(' · ')}</div>` : ''}</div>`).join('') : '<div class="empty">No minutes or reports yet.</div>');
    const ed = (rec) => {
      rec = rec || { deptId: d.id, type: 'minutes', date: U.today(), attendees: [], actions: [] };
      UI.edit({ title: rec.id ? rec.title : 'Minutes / report', canEdit: can, rec, wide: true, fields: [
        { k: 'type', label: 'Type', type: 'select', options: NOTE_TYPES, blank: false }, { k: 'date', label: 'Date', type: 'date', req: true }, { k: 'title', label: 'Title', req: true, full: true },
        { k: 'attendees', label: 'Present', type: 'multi', options: deptMembers(d.id).map(m => [m.id, m.name]) }, { k: 'body', label: 'Minutes / report', type: 'textarea', full: true },
        { k: 'actions', label: 'Action items (one per line)', type: 'list', full: true }, { k: 'makeTasks', label: 'Also create department tasks from new action items', type: 'checkbox' }],
        onSave: async (v) => { const mk = v.makeTasks; delete v.makeTasks; const old = (rec.actions || []); const saved = await St.put('deptnotes', Object.assign({}, rec, v, { deptId: d.id })); if (mk) for (const a of (v.actions || []).filter(x => !old.includes(x))) await St.put('tasks', { title: a, deptId: d.id, due: U.addDays(v.date, 14), status: 'not_started', priority: 'medium', pct: 0, assignees: [], notes: 'From ' + saved.title }); },
        deleteFn: rec.id ? () => St.del('deptnotes', rec.id) : null });
    };
    const nb = el.querySelector('#nNew'); if (nb) nb.onclick = () => ed();
    el.querySelectorAll('[data-n]').forEach(c => c.onclick = () => ed(St.get('deptnotes', c.dataset.n)));
  }

  function budget(el, d, can) {
    const cur = St.cfg().currency || 'TZS'; const finOk = A.Fin.canEdit();
    const rs = St.all('deptbudget').filter(r => r.deptId === d.id).sort(U.by('createdAt', -1));
    const tot = (st) => rs.filter(r => r.status === st).reduce((t, r) => t + (+r.amount || 0), 0);
    el.innerHTML = `<div class="stats">${UI.stat(U.money(tot('requested'), cur), 'Awaiting decision', { tone: tot('requested') ? 'warn' : '' })}${UI.stat(U.money(tot('approved'), cur), 'Approved, not yet paid')}${UI.stat(U.money(tot('paid'), cur), 'Paid', { tone: 'ok' })}</div>
      <div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="bNew">Request budget</button>' : ''}<span class="small muted">Requests go to the Finance & Fundraising department. When paid, they are recorded as expenses in the AAC Finance Manager.</span></div>` +
      UI.table([{ label: 'Request', f: r => `<b>${esc(r.title)}</b><div class="small muted">${esc(r.purpose || '')}</div>` }, { label: 'Amount', n: 1, f: r => U.money(r.amount, cur) }, { label: 'For event', f: r => esc((St.get('events', r.eventId) || {}).title || '—') }, { label: 'Needed by', f: r => U.fmtD(r.neededBy) }, { label: 'Status', f: r => `<span class="pill ${({ requested: 'warn', approved: 'info', rejected: 'bad', paid: 'ok' })[r.status] || ''}">${esc(L.label(BUDGET_STATUS, r.status))}</span>` },
        { label: '', f: r => finOk && r.status === 'requested' ? `<button class="btn sm gold" data-ap="${r.id}">Approve</button> <button class="btn sm danger" data-rj="${r.id}">Reject</button>` : finOk && r.status === 'approved' ? `<button class="btn sm pri" data-pay="${r.id}">Pay & record expense</button>` : '' }], rs, { click: 1, empty: 'No budget requests yet.' });
    const ed = (rec) => { rec = rec || { deptId: d.id, status: 'requested' }; UI.edit({ title: rec.id ? rec.title : 'Budget request', canEdit: can && rec.status === 'requested', rec, fields: [{ k: 'title', label: 'What is it for?', req: true, full: true }, { k: 'amount', label: 'Amount (' + cur + ')', type: 'number', min: 1, req: true }, { k: 'neededBy', label: 'Needed by', type: 'date' }, { k: 'eventId', label: 'For event (optional)', type: 'select', options: UI.opt.events() }, { k: 'category', label: 'Expense category', type: 'select', options: A.Fin.EXPENSE_CATS, blank: false }, { k: 'purpose', label: 'Details / justification', type: 'textarea', full: true }], onSave: v => St.put('deptbudget', Object.assign({}, rec, v, { deptId: d.id, requestedBy: A.Auth.memberId() || null })), deleteFn: rec.id && rec.status === 'requested' ? () => St.del('deptbudget', rec.id) : null }); };
    UI.bindRows(el, id => ed(St.get('deptbudget', id)));
    const nb = el.querySelector('#bNew'); if (nb) nb.onclick = () => ed();
    el.querySelectorAll('[data-ap]').forEach(b => b.onclick = (e) => { e.stopPropagation(); St.patch('deptbudget', b.dataset.ap, { status: 'approved', decidedBy: A.Auth.uid || null, decidedAt: U.nowISO() }).catch(UI.fail); });
    el.querySelectorAll('[data-rj]').forEach(b => b.onclick = (e) => { e.stopPropagation(); St.patch('deptbudget', b.dataset.rj, { status: 'rejected', decidedBy: A.Auth.uid || null, decidedAt: U.nowISO() }).catch(UI.fail); });
    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const r = St.get('deptbudget', b.dataset.pay); A.Fin.expenseForm({ amount: r.amount, category: r.category || 'Other', description: r.title, deptId: d.id, eventId: r.eventId || '', paidTo: '' }, async (exp) => { await St.patch('deptbudget', r.id, { status: 'paid', expenseId: exp.id, paidAt: U.nowISO() }); }); });
  }

  function team(el, d, can) {
    const mem = deptMembers(d.id); const all = St.live('members').filter(m => m.status !== 'inactive' && !(m.departments || []).includes(d.id)).sort(U.by('name'));
    const linked = (id) => St.all('roles').some(r => r.memberId === id) || !!(St.get('members', id) || {}).userId;
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>Members (${mem.length})</h3>${UI.table([{ label: 'Name', f: m => `<b>${esc(m.name)}</b>${d.leaderId === m.id ? ' <span class="pill gold">Leader</span>' : (d.editors || []).includes(m.id) ? ' <span class="pill info">Co-leader</span>' : ''}` }, { label: 'Sections', f: m => (m.sections || []).map(s => UI.chip(s, L.sectionColor(s))).join(' ') || '—' }, { label: 'Sign-in', f: m => linked(m.id) ? '<span class="pill ok">Linked</span>' : '<span class="muted small">not linked</span>' }, { label: '', f: m => can && d.leaderId !== m.id ? `<button class="btn sm danger" data-rm="${m.id}">Remove</button>` : '' }], mem, { empty: 'No members in this department yet.' })}
        ${can ? `<div class="row" style="margin-top:10px"><select id="tmAdd" style="flex:1;min-width:180px"><option value="">+ Add member to ${esc(d.name)}…</option>${all.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>` : ''}</div>
      <div class="card"><h3>How department sign-in works</h3><ol class="list-plain small"><li>Each person logs in to the choir app on their own phone or computer. Administrators and leaders can open the planner.</li><li>Use <b>Members → Import choir members</b> so each person's choir login is linked to their planner profile (or link them under <b>Settings → Roles & permissions</b>).</li><li>The department <b>leader</b> and <b>co-leaders</b> (set in Edit profile) can then edit this workspace: profile, plans, tasks, minutes and budget requests. Other members can view it and update tasks assigned to them.</li></ol>
        <p class="small muted">Members marked "not linked" can still be listed and assigned tasks. They just can't sign in to edit yet.</p></div></div>`;
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const m = St.get('members', b.dataset.rm); try { await St.patch('members', m.id, { departments: (m.departments || []).filter(x => x !== d.id) }); if ((d.editors || []).includes(m.id)) await St.patch('departments', d.id, { editors: d.editors.filter(x => x !== m.id) }); } catch (e) { UI.fail(e); } });
    const ad = el.querySelector('#tmAdd'); if (ad) ad.onchange = async () => { const m = St.get('members', ad.value); if (!m) return; try { await St.patch('members', m.id, { departments: U.uniq([...(m.departments || []), d.id]) }); } catch (e) { UI.fail(e); } };
  }

  function editProfile(rec) {
    const isNew = !rec; rec = rec || {}; const admin = A.Auth.can('members') || ['admin', 'chair'].includes(A.Auth.role());
    const can = isNew ? A.Auth.can('members') : A.Auth.canDept(rec.id);
    UI.edit({ title: isNew ? 'New department' : rec.name, canEdit: can, wide: true, rec: Object.assign({ color: L.autoColor(rec.name || String(Date.now())) }, rec), fields: [
      { k: 'name', label: 'Department name', req: true, readonly: !isNew && !admin }, { k: 'leaderId', label: 'Leader', type: 'select', options: UI.opt.members(), readonly: !isNew && !admin, hint: admin ? '' : 'Only the choir leadership changes the leader.' },
      { k: 'editors', label: 'Co-leaders (can edit this workspace)', type: 'multi', options: UI.opt.members() },
      { k: 'mission', label: 'Mission (one line)', full: true }, { k: 'description', label: 'Responsibilities', type: 'textarea', full: true },
      { k: 'meetDay', label: 'Usual meeting day' }, { k: 'meetTime', label: 'Meeting time', type: 'time' }, { k: 'meetVenue', label: 'Meeting venue' }, { k: 'contact', label: 'Contact (phone / email)' },
      { k: 'color', label: 'Department color', type: 'color', full: true }],
      onSave: async (v) => { const saved = await St.put('departments', Object.assign({}, rec, v)); for (const id of U.uniq([v.leaderId, ...(v.editors || [])]).filter(Boolean)) { const m = St.get('members', id); if (m && !(m.departments || []).includes(saved.id)) await St.patch('members', id, { departments: [...(m.departments || []), saved.id] }, { audit: false }); } },
      deleteFn: !isNew && admin ? async () => { const used = St.all('tasks').some(t => t.deptId === rec.id) || St.all('activities').some(a => a.deptId === rec.id); if (used) { await St.patch('departments', rec.id, { archived: true }); UI.toast('Department has history, so it was archived instead of deleted.'); } else await St.del('departments', rec.id); A.state.departments.dept = ''; } : null });
  }
})(window.App);
