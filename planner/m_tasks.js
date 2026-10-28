/* m_tasks.js — Tasks & Responsibilities: list, kanban, calendar, overdue, my tasks; dependencies; templates */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const linkOpts = () => [
    ...St.live('events').map(e => ['event:' + e.id, 'Event · ' + e.title]),
    ...St.live('activities').map(a => ['activity:' + a.id, 'Activity · ' + a.title]),
    ...St.all('sessions').filter(s => s.status !== 'cancelled').sort(U.by('date')).map(s => ['session:' + s.id, 'Practice · ' + U.fmtD(s.date) + ' ' + ((St.get('plans', s.planId) || {}).name || '')]),
  ];
  const fullFields = (rec) => [
    { k: 'title', label: 'Task', req: true, full: true }, { k: 'description', label: 'Description', type: 'textarea', full: true },
    { k: 'link', label: 'Linked to', type: 'select', options: linkOpts(), blank: 'Not linked' },
    { k: 'deptId', label: 'Responsible department', type: 'select', options: UI.opt.depts() },
    { k: 'assignees', label: 'Assigned people / team', type: 'multi', options: UI.opt.members() },
    { k: 'start', label: 'Start date', type: 'date' }, { k: 'due', label: 'Deadline', type: 'date', req: true },
    { k: 'priority', label: 'Priority', type: 'select', options: L.PRIORITY, blank: false }, { k: 'status', label: 'Status', type: 'select', options: L.TASK_STATUS, blank: false },
    { k: 'pct', label: 'Completion %', type: 'number', min: 0, max: 100 },
    { k: 'deps', label: 'Depends on (must finish first)', type: 'multi', options: St.live('tasks').filter(t => t.id !== rec.id).sort(U.by('due')).map(t => [t.id, t.title + ' · ' + U.fmtDs(t.due)]) },
    { k: 'notes', label: 'Notes', type: 'textarea' }, { k: 'evidence', label: 'Evidence of completion (link or description)', type: 'textarea' },
  ];
  const ownFields = () => [{ k: 'status', label: 'Status', type: 'select', options: L.TASK_STATUS, blank: false }, { k: 'pct', label: 'Completion %', type: 'number', min: 0, max: 100 }, { k: 'notes', label: 'Notes', type: 'textarea', full: true }, { k: 'evidence', label: 'Evidence of completion', type: 'textarea', full: true }];
  const blockedBy = (t) => (t.deps || []).map(id => St.get('tasks', id)).filter(d => d && d.status !== 'completed' && d.status !== 'cancelled');

  const M = A.M.tasks = {
    render(root, params) {
      const f = UI.stp('tasks', { view: 'list', q: '', dept: '', status: '', priority: '', event: '', due: '', month: U.today().slice(0, 7) }, params);
      const today = U.today(); const me = A.Auth.memberId();
      let ts = St.live('tasks');
      if (f.q) { const q = f.q.toLowerCase(); ts = ts.filter(t => [t.title, t.description, t.notes].join(' ').toLowerCase().includes(q)); }
      if (f.dept) ts = ts.filter(t => t.deptId === f.dept);
      if (f.status) ts = ts.filter(t => t.status === f.status);
      if (f.priority) ts = ts.filter(t => t.priority === f.priority);
      if (f.event) ts = ts.filter(t => t.linkType === 'event' && t.linkId === f.event);
      if (f.due === 'soon') ts = ts.filter(t => t.due && t.due >= today && U.diffDays(today, t.due) <= 14 && !['completed', 'cancelled'].includes(t.status));
      if (f.view === 'overdue') ts = ts.filter(t => L.taskOverdue(t, today));
      if (f.view === 'mine') ts = ts.filter(t => me && (t.assignees || []).includes(me));
      ts.sort(U.by(t => t.due || '9999'));
      const can = A.Auth.can('tasks_all') || A.Auth.has('tasks_dept');
      root.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="tabs" style="margin:0">${[['list', 'List'], ['kanban', 'Kanban'], ['calendar', 'Calendar'], ['overdue', 'Overdue (' + St.live('tasks').filter(t => L.taskOverdue(t, today)).length + ')'], ['mine', 'My tasks']].map(([k, t]) => `<button data-v="${k}" class="${f.view === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="row">${can ? '<button class="btn pri" id="tNew">New task</button><button class="btn" id="tTpl">From template</button>' : ''}<button class="btn" id="tCsv">CSV</button></div></div>
        <div class="filters"><label class="grow">Search<input type="search" id="tQ" value="${esc(f.q)}"></label><label>Department${UI.sel('tD', UI.opt.depts(), f.dept)}</label><label>Status${UI.sel('tS', L.TASK_STATUS, f.status)}</label><label>Priority${UI.sel('tP', L.PRIORITY, f.priority)}</label><label class="grow">Event${UI.sel('tE', UI.opt.events(), f.event)}</label><label>Due${UI.sel('tW', [['soon', 'Next 14 days']], f.due, 'Any')}</label></div>
        ${f.view === 'mine' && !me ? '<div class="banner info">Your account is not linked to a member profile yet, so no tasks can be matched to you. Ask an administrator to link it under Settings → Roles.</div>' : ''}
        <div id="tBody"></div>`;
      UI.bindFilters(root, f, { tQ: 'q', tD: 'dept', tS: 'status', tP: 'priority', tE: 'event', tW: 'due' }, A.render);
      root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { f.view = b.dataset.v; A.render(); });
      const nb = root.querySelector('#tNew'); if (nb) nb.onclick = () => edit();
      const tp = root.querySelector('#tTpl'); if (tp) tp.onclick = pickTemplate;
      root.querySelector('#tCsv').onclick = () => UI.csvDownload('Choir_Tasks.csv', ['Task', 'Linked to', 'Department', 'Assigned', 'Start', 'Deadline', 'Priority', 'Status', 'Completion %', 'Overdue'], ts.map(t => [t.title, L.linkLabel(t), L.deptName(t.deptId), (t.assignees || []).map(L.memberName).join('; '), t.start, t.due, t.priority, L.label(L.TASK_STATUS, t.status), t.pct || 0, L.taskOverdue(t) ? 'yes' : ''])).catch(UI.fail);
      const el = root.querySelector('#tBody');
      if (f.view === 'kanban') kanban(el, ts); else if (f.view === 'calendar') calendar(el, ts, f); else list(el, ts);
    },
    edit,
  };
  function list(el, ts) {
    el.innerHTML = UI.table([
      { label: 'Task', f: t => `<b>${esc(t.title)}</b>${UI.demo(t)}<div class="small muted">${esc(L.linkLabel(t))}</div>` }, { label: 'Department', f: t => t.deptId ? UI.chip(L.deptName(t.deptId), L.deptColor(t.deptId)) : '—' },
      { label: 'Assigned', f: t => esc((t.assignees || []).map(L.memberName).join(', ') || '—') }, { label: 'Deadline', f: t => `${U.fmtD(t.due)}${L.taskOverdue(t) ? ' <span class="pill bad">Overdue</span>' : ''}` },
      { label: 'Priority', f: t => UI.pill(t.priority, L.PRIORITY) }, { label: 'Status', f: t => UI.pill(t.status, L.TASK_STATUS) + (blockedBy(t).length ? ' <span class="pill warn" title="Waiting on dependencies">waiting</span>' : '') },
      { label: 'Done', f: t => `<div style="min-width:70px">${UI.bar(+t.pct || 0)}</div>` },
    ], ts, { click: 1, empty: 'No tasks match.' });
    UI.bindRows(el, id => edit(St.get('tasks', id)));
  }
  function kanban(el, ts) {
    el.innerHTML = `<div class="kan">${L.TASK_STATUS.map(([k, l]) => { const c = ts.filter(t => t.status === k); return `<div class="col" data-st="${k}"><h3>${l}<span class="num muted">${c.length}</span></h3>${c.map(t => `<div class="kc" draggable="true" data-id="${t.id}" style="--c:${esc(t.deptId ? L.deptColor(t.deptId) : '')}"><b>${esc(t.title)}</b><div class="small muted">${U.fmtDs(t.due)} · ${esc(L.deptName(t.deptId))}</div>${L.taskOverdue(t) ? '<span class="pill bad">Overdue</span> ' : ''}${UI.pill(t.priority, L.PRIORITY)}</div>`).join('')}</div>`; }).join('')}</div><p class="small muted">Drag a card to another column to change its status.</p>`;
    el.querySelectorAll('.kc').forEach(c => { c.onclick = () => edit(St.get('tasks', c.dataset.id)); c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); }); c.addEventListener('dragend', () => c.classList.remove('drag')); });
    el.querySelectorAll('.col[data-st]').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); }); col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('drop'); const t = St.get('tasks', e.dataTransfer.getData('text/plain')); if (!t || t.status === col.dataset.st) return; try { await setStatus(t, col.dataset.st); } catch (x) { UI.fail(x); } });
    });
  }
  async function setStatus(t, st) {
    if (!A.Auth.can('task_progress', t)) throw new Error('You can only update tasks assigned to you or your department.');
    const bl = blockedBy(t);
    if (['in_progress', 'completed'].includes(st) && bl.length && !(await UI.confirm(`This task depends on unfinished work: ${bl.map(b => esc(b.title)).join(', ')}. Change the status anyway?`, { ok: 'Change anyway' }))) return;
    await St.patch('tasks', t.id, { status: st, pct: st === 'completed' ? 100 : t.pct });
  }
  function calendar(el, ts, f) {
    const [y, m] = f.month.split('-').map(Number); const first = U.ymd(y, m, 1); const start = U.addDays(first, -((U.dow(first) + 6) % 7));
    let g = `<div class="row" style="margin-bottom:8px"><button class="btn sm" id="tmP">◀</button><b>${U.MONTHS[m - 1]} ${y}</b><button class="btn sm" id="tmN">▶</button></div><div class="mgrid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dh">${d}</div>`).join('')}`;
    for (let i = 0; i < 42; i++) { const d = U.addDays(start, i); if (i >= 35 && +d.slice(5, 7) !== m) break; const its = ts.filter(t => t.due === d); g += `<div class="d ${+d.slice(5, 7) !== m ? 'out' : ''} ${d === U.today() ? 'today' : ''}"><span class="dn">${+d.slice(8)}</span>${its.map(t => `<span class="ci k-deadline ${t.status === 'completed' ? 'x' : ''}" data-id="${t.id}">${esc(t.title)}</span>`).join('')}</div>`; }
    el.innerHTML = g + '</div>';
    el.querySelectorAll('.ci[data-id]').forEach(c => c.onclick = () => edit(St.get('tasks', c.dataset.id)));
    const mv = (n) => { let mm = m + n, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } f.month = `${yy}-${U.pad(mm)}`; A.render(); };
    el.querySelector('#tmP').onclick = () => mv(-1); el.querySelector('#tmN').onclick = () => mv(1);
  }
  function edit(rec) {
    const isNew = !(rec && rec.id);
    rec = Object.assign({ status: 'not_started', priority: 'medium', pct: 0, assignees: [], deps: [] }, rec || {});
    if (rec.linkType && rec.linkId) rec.link = rec.linkType + ':' + rec.linkId;
    const full = isNew ? (A.Auth.can('tasks_all') || A.Auth.has('tasks_dept') || A.Auth.canDept(rec.deptId)) : A.Auth.can('tasks', rec);
    const own = !full && !isNew && A.Auth.can('task_progress', rec);
    const fields = full ? fullFields(rec) : ownFields();
    const bl = blockedBy(rec);
    const m = UI.edit({
      title: isNew ? 'New task' : rec.title, fields, rec, canEdit: full || own, wide: true,
      validate: v => { const e = []; if (v.start && v.due && v.due < v.start) e.push('Deadline must be on or after the start date.'); if (!full) return e; if (!A.Auth.can('tasks_all') && v.deptId && !A.Auth.myDepts().led.includes(v.deptId)) e.push('You can only create tasks for departments you lead.'); if ((v.deps || []).includes(rec.id)) e.push('A task cannot depend on itself.'); return e; },
      onSave: async (v) => {
        if (v.link !== undefined) { const [lt, lid] = (v.link || '').split(':'); v.linkType = lid ? lt : ''; v.linkId = lid || ''; delete v.link; }
        if (v.status === 'completed') v.pct = 100;
        const blk = blockedBy(Object.assign({}, rec, v));
        if (['in_progress', 'completed'].includes(v.status) && blk.length && rec.status !== v.status && !(await UI.confirm(`Unfinished dependencies: ${blk.map(b => esc(b.title)).join(', ')}. Save anyway?`, { ok: 'Save anyway' }))) return false;
        const old = isNew ? null : St.get('tasks', rec.id);
        const saved = await St.put('tasks', Object.assign({}, old || rec, v));
        // dependents: propose shifting deadlines of tasks that depend on this one
        if (old && old.due && saved.due && saved.due > old.due) {
          const deps = St.live('tasks').filter(t => (t.deps || []).includes(saved.id) && t.due && t.due <= saved.due && !['completed', 'cancelled'].includes(t.status));
          if (deps.length) setTimeout(() => proposeShift(deps, U.diffDays(old.due, saved.due), saved), 60);
        }
      },
      deleteFn: !isNew && full ? () => St.put('tasks', Object.assign({}, rec, { archived: true }), { summary: 'Archived task ' + rec.title }) : null,
    });
    if (bl.length) m.body.insertAdjacentHTML('afterbegin', `<div class="banner warn">Waiting on: ${bl.map(b => esc(b.title) + ' (' + U.fmtDs(b.due) + ')').join(', ')}</div>`);
    if (!isNew && !full && own) m.body.insertAdjacentHTML('afterbegin', `<div class="banner info">${esc(L.linkLabel(rec))} · due ${U.fmtD(rec.due)}. You can update progress on tasks assigned to you.</div>`);
  }
  function proposeShift(tasks, delta, src) {
    UI.modal({ title: 'Adjust dependent deadlines?', wide: true, body: `<p>"${esc(src.title)}" moved ${delta} day(s) later. These tasks depend on it. Proposed new deadlines:</p>${tasks.map(t => `<label class="row small" style="padding:3px 0"><input type="checkbox" data-t="${t.id}" checked> ${esc(t.title)}: ${U.fmtD(t.due)} → <b>${U.fmtD(U.addDays(t.due, delta))}</b></label>`).join('')}`, buttons: [{ label: 'Keep current dates' }, { label: 'Apply selected', cls: 'pri', onClick: async ({ body }) => { for (const c of body.querySelectorAll('[data-t]:checked')) { const t = St.get('tasks', c.dataset.t); await St.patch('tasks', t.id, { due: U.addDays(t.due, delta) }); } UI.toast('Deadlines adjusted'); } }] });
  }
  function pickTemplate() {
    const body = `<div class="form"><label class="f"><span>Event</span>${UI.sel('tplE', UI.opt.events(), '', 'Choose event…')}</label><label class="f"><span>Template</span>${UI.sel('tplK', Object.entries(A.TEMPLATES).map(([k, v]) => [k, v.name]), '', null)}</label></div>`;
    UI.modal({ title: 'Generate tasks from a template', body, buttons: [{ label: 'Cancel' }, { label: 'Review tasks', cls: 'pri', onClick: ({ body: b }) => { const e = St.get('events', b.querySelector('#tplE').value); if (!e) { UI.toast('Choose an event.', true); return false; } setTimeout(() => A.templateDialog(e, b.querySelector('#tplK').value), 50); } }] });
  }
})(window.App);
