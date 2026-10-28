/* m_events.js — event management: CRUD, duplicate, cancel, archive, approvals, host confirmation, conflicts, templates */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  A.TEMPLATES = {
    concert: { name: 'Concert', items: [['Finalise concert repertoire', 56, 'Music and Repertoire', 'high'], ['Distribute song materials', 49, 'Music and Repertoire', 'high'], ['Confirm venue and date with host', 42, 'Events and Protocol', 'critical'], ['Publicity and posters', 28, 'Media and Communications', 'medium'], ['Book sound system and instruments', 21, 'Media and Communications', 'high'], ['Arrange transport', 14, 'Transport and Logistics', 'medium'], ['Full run-through rehearsal', 7, 'Rehearsal Coordination', 'high'], ['Print programme booklets', 5, 'Events and Protocol', 'medium'], ['Post-event evaluation meeting', -7, 'Choir Leadership', 'low']] },
    recording: { name: 'Recording', items: [['Select songs for recording', 60, 'Music and Repertoire', 'high'], ['Book studio / engineer', 45, 'Media and Communications', 'critical'], ['Arrangements and parts ready', 40, 'Music and Repertoire', 'high'], ['Section rehearsal recordings shared', 14, 'Music and Repertoire', 'medium'], ['Budget and payment for studio', 30, 'Finance and Fundraising', 'high'], ['Mix review', -14, 'Media and Communications', 'medium']] },
    wedding: { name: 'Wedding', items: [['Meet couple for song selection', 42, 'Music and Repertoire', 'high'], ['Confirm schedule with church', 30, 'Events and Protocol', 'high'], ['Rehearse wedding songs', 14, 'Rehearsal Coordination', 'high'], ['Arrange transport', 7, 'Transport and Logistics', 'medium'], ['Uniform check', 3, 'Welfare and Hospitality', 'low']] },
    rehearsal: { name: 'Rehearsal', items: [['Confirm venue access', 7, 'Rehearsal Coordination', 'medium'], ['Share rehearsal recordings', 5, 'Music and Repertoire', 'medium'], ['Prepare keyboard and microphones', 1, 'Media and Communications', 'medium'], ['Follow up absent members', -2, 'Welfare and Hospitality', 'low']] },
  };

  const fields = (rec) => {
    const fin = A.Auth.has('finance') || St.mode === 'local';
    return [
      { k: 'title', label: 'Event title', req: true, full: true }, { k: 'code', label: 'Event ID', readonly: true, hint: 'Assigned automatically (unique per year).' },
      { k: 'category', label: 'Category', type: 'select', options: UI.opt.categories(), req: true },
      { k: 'description', label: 'Description', type: 'textarea', full: true },
      { k: 'startDate', label: 'Start date', type: 'date', req: true }, { k: 'startTime', label: 'Start time', type: 'time' }, { k: 'endDate', label: 'End date', type: 'date' }, { k: 'endTime', label: 'End time', type: 'time' },
      { k: 'venue', label: 'Venue' }, { k: 'address', label: 'Address' }, { k: 'host', label: 'Host / inviting party' }, { k: 'hostContact', label: 'Host contact details' },
      { k: 'leaderId', label: 'Event leader', type: 'select', options: UI.opt.members() },
      { k: 'objectiveId', label: 'Linked work-plan objective', type: 'select', options: UI.opt.objectives() }, { k: 'activityId', label: 'Linked work-plan activity', type: 'select', options: UI.opt.activities() },
      { k: 'planId', label: 'Linked practice plan', type: 'select', options: UI.opt.plans() },
      { k: 'status', label: 'Event status', type: 'select', options: L.EVENT_STATUS, blank: false }, { k: 'approval', label: 'Internal approval', type: 'select', options: L.APPROVAL, blank: false, readonly: !A.Auth.can('approve'), hint: A.Auth.can('approve') ? '' : 'Only approvers can change this.' },
      { k: 'hostConf', label: 'External host confirmation', type: 'select', options: L.HOSTCONF, blank: false },
      { k: 'depts', label: 'Participating departments', type: 'multi', options: UI.opt.depts() },
      { k: 'songIds', label: 'Song repertoire required', type: 'multi', options: UI.opt.songs() },
      { k: 'tech', label: 'Technical requirements', type: 'textarea' }, { k: 'equipment', label: 'Equipment (one per line, used for conflict checks)', type: 'list' },
      { k: 'transport', label: 'Transport notes', type: 'textarea' }, { k: 'accommodation', label: 'Accommodation', type: 'textarea' },
      ...(fin ? [{ k: 'budget', label: 'Estimated budget (' + (St.cfg().currency || 'TZS') + ')', type: 'number', min: 0 }, { k: 'actual', label: 'Recorded actual expenses', type: 'number', min: 0, hint: 'Record only real, receipted amounts.' }] : []),
      { k: 'attachments', label: 'Attachment links (one per line: name | URL)', type: 'list', full: true },
      { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    ];
  };

  const M = A.M.events = {
    render(root, params) {
      const f = UI.stp('events', { year: St.cfg().year || 2027, q: '', cat: '', status: '', approval: '', hostConf: '', when: '', search: '', archived: false }, params);
      const y = +f.year; const today = U.today();
      let evs = St.all('events').filter(e => (!!e.archived) === !!f.archived && (!e.startDate || +e.startDate.slice(0, 4) === y || (e.endDate && +e.endDate.slice(0, 4) === y)));
      if (f.q) { const [a, b] = U.qRange(y, +f.q); evs = evs.filter(e => e.startDate && U.overlapRange(e.startDate, e.endDate || e.startDate, a, b)); }
      ['status', 'approval', 'hostConf'].forEach(k => { if (f[k]) evs = evs.filter(e => e[k] === f[k]); });
      if (f.cat) evs = evs.filter(e => e.category === f.cat);
      if (f.when === 'upcoming') evs = evs.filter(e => e.startDate >= today && e.status !== 'cancelled');
      if (f.when === 'past') evs = evs.filter(e => (e.endDate || e.startDate) < today);
      if (f.search) { const q = f.search.toLowerCase(); evs = evs.filter(e => [e.title, e.venue, e.code, e.host].join(' ').toLowerCase().includes(q)); }
      evs.sort(U.by(e => e.startDate + (e.startTime || '')));
      const can = A.Auth.can('events');
      root.innerHTML = `<div class="filters">
        <label class="grow">Search<input type="search" id="eSearch" value="${esc(f.search)}" placeholder="Title, venue, ID, host"></label>
        <label>Year${UI.yearSel('eY', y)}</label><label>Quarter${UI.sel('eQ', [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']], f.q, 'All')}</label>
        <label>Category${UI.sel('eC', UI.opt.categories(), f.cat)}</label><label>Status${UI.sel('eS', L.EVENT_STATUS, f.status)}</label>
        <label>Approval${UI.sel('eA', L.APPROVAL, f.approval)}</label><label>Host confirmation${UI.sel('eH', L.HOSTCONF, f.hostConf)}</label>
        <label>When${UI.sel('eW', [['upcoming', 'Upcoming'], ['past', 'Past']], f.when, 'Any time')}</label>
        <label style="flex-direction:row;align-items:center;gap:6px;min-width:0"><input type="checkbox" id="eArc" ${f.archived ? 'checked' : ''}> Archived</label></div>
        <div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="eNew">New event</button>' : ''}<button class="btn" id="eCsv">CSV</button><span class="muted small">${evs.length} event(s)</span></div>
        ${UI.table([
          { label: 'ID', f: e => `<span class="mono small">${esc(e.code || '—')}</span>` }, { label: 'Event', f: e => `<b>${esc(e.title)}</b>${UI.demo(e)}<div style="margin-top:3px">${UI.chip(e.category || 'Other', L.catColor(e.category))}</div>` },
          { label: 'Date', f: e => `${U.fmtD(e.startDate)}${e.startTime ? ' ' + e.startTime : ''}${e.endDate && e.endDate !== e.startDate ? '<br>→ ' + U.fmtD(e.endDate) : ''}` },
          { label: 'Venue', f: e => esc(e.venue || '—') }, { label: 'Status', f: e => UI.pill(e.status, L.EVENT_STATUS) }, { label: 'Approval', f: e => UI.pill(e.approval || 'pending', L.APPROVAL) },
          { label: 'Host', f: e => UI.pill(e.hostConf || 'not_required', L.HOSTCONF) }, { label: 'Prep', f: e => prepBadge(e) },
        ], evs, { click: 1, empty: 'No events match these filters.' })}`;
      UI.bindFilters(root, f, { eSearch: 'search', eY: 'year', eQ: 'q', eC: 'cat', eS: 'status', eA: 'approval', eH: 'hostConf', eW: 'when', eArc: 'archived' }, A.render);
      UI.bindRows(root, id => M.view(id));
      const nb = root.querySelector('#eNew'); if (nb) nb.onclick = () => M.edit();
      root.querySelector('#eCsv').onclick = () => UI.csvDownload(`Choir_Events_${y}.csv`, ['ID', 'Title', 'Category', 'Start', 'Start time', 'End', 'End time', 'Venue', 'Status', 'Approval', 'Host confirmation', 'Departments'], evs.map(e => [e.code, e.title, e.category, e.startDate, e.startTime, e.endDate, e.endTime, e.venue, L.label(L.EVENT_STATUS, e.status), L.label(L.APPROVAL, e.approval), L.label(L.HOSTCONF, e.hostConf), (e.depts || []).map(L.deptName).join('; ')])).catch(UI.fail);
    },
    edit, view, dateChanged,
  };
  function prepBadge(e) {
    const p = (e.planId && St.get('plans', e.planId)) || L.eventPlan(e.id); if (!p) return '<span class="muted small">no practice plan</span>';
    const m = L.planMetrics(p); return `<span class="small num">${m.ready}/${m.unique} ready</span>`;
  }
  const finOf = (id) => St.get('finance', id) || {};

  function edit(pre) {
    const isNew = !(pre && pre.id);
    const rec = Object.assign({ status: 'proposed', approval: 'pending', hostConf: 'not_required', category: 'Concert' }, pre || {});
    if (!isNew) Object.assign(rec, { budget: finOf(rec.id).budget, actual: finOf(rec.id).actual });
    rec.attachments = (rec.attachments || []).map(a => typeof a === 'string' ? a : `${a.name} | ${a.url}`);
    const can = isNew ? A.Auth.can('events') : A.Auth.can('events');
    UI.edit({
      title: isNew ? 'New event' : 'Edit event ' + (rec.code || ''), fields: fields(rec), rec, canEdit: can,
      after: (b) => { if (can) UI.slotPicker(b, (sl, set) => { set('startTime', sl.start); set('endTime', sl.end); if (sl.venue) set('venue', sl.venue); if (sl.leaderId) set('leaderId', sl.leaderId); }, 'Take time & venue from the schedule'); },
      validate: v => { const e = []; if (v.endDate && v.endDate < v.startDate) e.push('End date must be on or after the start date.'); if (v.endDate === v.startDate && v.startTime && v.endTime && v.endTime < v.startTime) e.push('End time is before start time.'); if (v.actual != null && !A.Auth.has('finance') && St.mode !== 'local') e.push('You are not allowed to record expenses.'); return e; },
      onSave: async (v, body) => {
        const old = isNew ? null : St.get('events', rec.id);
        const fin = { budget: v.budget, actual: v.actual }; delete v.budget; delete v.actual;
        v.attachments = (v.attachments || []).map(l => { const [n, u] = l.split('|').map(s => s.trim()); return { name: u ? n : (n || '').slice(0, 60), url: u || n }; });
        if (!v.endDate) v.endDate = v.startDate;
        const next = Object.assign({}, old || pre || {}, v);
        if (!A.Auth.can('approve')) next.approval = (old && old.approval) || 'pending';
        if (isNew) next.code = L.nextEventCode(+v.startDate.slice(0, 4));
        const cf = L.conflicts('event', next);
        if (cf.length && !(await UI.confirm(`<b>Possible conflicts:</b><ul class="list-plain">${cf.map(c => `<li>${esc(c.title)} (${U.fmtD(c.date)}): ${esc(c.why.join(', '))}</li>`).join('')}</ul>Save anyway?`, { ok: 'Save anyway', title: 'Schedule conflict' }))) return false;
        const saved = await St.put('events', next);
        if (fin.budget != null || fin.actual != null) await St.put('finance', { id: saved.id, eventId: saved.id, budget: fin.budget, actual: fin.actual }, { summary: 'Finance ' + saved.title });
        if (old && (old.startDate !== saved.startDate || old.venue !== saved.venue || old.startTime !== saved.startTime || old.status !== saved.status)) {
          L.notifyChange('Event changed', saved.title, [old.startDate !== saved.startDate ? `Date ${U.fmtD(old.startDate)} → ${U.fmtD(saved.startDate)}` : '', old.startTime !== saved.startTime ? `Time ${old.startTime || '—'} → ${saved.startTime || '—'}` : '', old.venue !== saved.venue ? `Venue ${old.venue || '—'} → ${saved.venue || '—'}` : '', old.status !== saved.status ? `Status → ${L.label(L.EVENT_STATUS, saved.status)}` : ''].filter(Boolean).join('; '), ['events', saved.id]);
        }
        if (old && old.startDate !== saved.startDate) setTimeout(() => dateChanged(old, saved), 80);
        if (isNew && !saved.planId) setTimeout(() => offerTemplate(saved), 80);
      },
    });
  }

  /** propose (never silently apply) deadline shifts after an event date change */
  async function dateChanged(old, ev) {
    const delta = U.diffDays(old.startDate, ev.startDate);
    const tasks = St.live('tasks').filter(t => t.linkType === 'event' && t.linkId === ev.id && t.due && !['completed', 'cancelled'].includes(t.status));
    const legs = St.all('travel').filter(t => t.eventId === ev.id);
    const plan = (ev.planId && St.get('plans', ev.planId)) || L.eventPlan(ev.id);
    const after = plan ? L.planSessions(plan.id).filter(s => s.status === 'scheduled' && s.date > ev.startDate) : [];
    if (!tasks.length && !legs.length && !plan) return;
    const body = `<p>The event moved by <b>${delta > 0 ? '+' : ''}${delta} day(s)</b> to ${U.fmtD(ev.startDate)}. Review the proposed adjustments. Nothing changes unless you tick it.</p>
      ${tasks.length ? `<h3>Task deadlines</h3>${tasks.map(t => `<label class="row small" style="padding:3px 0"><input type="checkbox" data-t="${t.id}" checked> ${esc(t.title)}: ${U.fmtD(t.due)} → <b>${U.fmtD(U.addDays(t.due, delta))}</b></label>`).join('')}` : ''}
      ${legs.length ? `<h3 style="margin-top:10px">Travel legs</h3>${legs.map(t => `<label class="row small" style="padding:3px 0"><input type="checkbox" data-l="${t.id}"> ${t.dir === 'return' ? 'Return' : 'Outbound'} ${esc(t.from || '')} → ${esc(t.to || '')}: ${U.fmtD(t.departDate)} → <b>${U.fmtD(U.addDays(t.departDate, delta))}</b> <span class="muted">(confirm bookings with the provider)</span></label>`).join('')}` : ''}
      ${plan ? `<h3 style="margin-top:10px">Practice plan "${esc(plan.name)}"</h3><label class="row small"><input type="checkbox" id="dcPlan" checked> Update the plan's target date to ${U.fmtD(ev.startDate)} and recalculate preparation deadlines</label>${after.length ? `<p class="small" style="color:var(--warn)">${after.length} scheduled practice session(s) now fall after the performance date. They are <b>not</b> moved automatically. Review them in the Practice Planner.</p>` : ''}` : ''}`;
    UI.modal({ title: 'Performance date changed', body, wide: true, buttons: [{ label: 'Skip' }, {
      label: 'Apply selected', cls: 'pri', onClick: async ({ body: b }) => {
        for (const c of b.querySelectorAll('[data-t]:checked')) { const t = St.get('tasks', c.dataset.t); await St.patch('tasks', t.id, { due: U.addDays(t.due, delta), start: t.start ? U.addDays(t.start, delta) : t.start }); }
        for (const c of b.querySelectorAll('[data-l]:checked')) { const t = St.get('travel', c.dataset.l); await St.patch('travel', t.id, { departDate: U.addDays(t.departDate, delta), arriveDate: t.arriveDate ? U.addDays(t.arriveDate, delta) : t.arriveDate, confirmed: false }); }
        const pc = b.querySelector('#dcPlan'); if (pc && pc.checked) await St.patch('plans', plan.id, { target: ev.startDate });
        UI.toast('Adjustments applied');
      },
    }] });
  }
  function offerTemplate(ev) {
    const key = { Concert: 'concert', Recording: 'recording', Wedding: 'wedding', Rehearsal: 'rehearsal' }[ev.category];
    if (!key || !A.Auth.can('tasks_all')) return;
    UI.confirm(`Generate the standard <b>${A.TEMPLATES[key].name}</b> preparation tasks for "${esc(ev.title)}"? You can review them first.`, { ok: 'Review tasks', title: 'Task template' }).then(ok => ok && templateDialog(ev, key));
  }
  function templateDialog(ev, key) {
    const tpl = A.TEMPLATES[key]; const deptBy = (n) => (St.live('departments').find(d => d.name.replace(/^DEMO – /, '') === n) || {}).id || '';
    const rows = tpl.items.map(([t, d, dn, pr], i) => ({ i, title: t, due: U.addDays(ev.startDate, -d), deptId: deptBy(dn), dn, pr }));
    UI.modal({ title: tpl.name + ' task template', wide: true, body: `<p class="small muted">Deadlines are counted back from ${U.fmtD(ev.startDate)}. Untick anything you don't need.</p>${rows.map(r => `<label class="row small" style="padding:4px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-r="${r.i}" checked> <b style="flex:1">${esc(r.title)}</b> <span>${U.fmtD(r.due)}</span> <span class="muted">${esc(r.deptId ? L.deptName(r.deptId) : r.dn + ' (not set up)')}</span> ${UI.pill(r.pr, L.PRIORITY)}</label>`).join('')}`,
      buttons: [{ label: 'Cancel' }, { label: 'Create selected tasks', cls: 'pri', onClick: async ({ body }) => { let n = 0; for (const c of body.querySelectorAll('[data-r]:checked')) { const r = rows[+c.dataset.r]; await St.put('tasks', { title: r.title, linkType: 'event', linkId: ev.id, deptId: r.deptId, due: r.due, start: U.addDays(r.due, -14) < U.today() ? U.today() : U.addDays(r.due, -14), priority: r.pr, status: 'not_started', pct: 0, assignees: [], template: key }); n++; } UI.toast(`Created ${n} tasks`); } }] });
  }
  A.templateDialog = templateDialog;

  function view(id) {
    const e = St.get('events', id); if (!e) return;
    const can = A.Auth.can('events'); const fin = finOf(id);
    const plan = (e.planId && St.get('plans', e.planId)) || L.eventPlan(e.id);
    const tasks = St.live('tasks').filter(t => t.linkType === 'event' && t.linkId === id).sort(U.by('due'));
    const legs = St.all('travel').filter(t => t.eventId === id).sort(U.by(t => t.departDate + t.departTime));
    const cf = L.conflicts('event', e);
    const m = plan ? L.planMetrics(plan) : null;
    const showFin = A.Auth.has('finance') || St.mode === 'local';
    const body = `<div class="row" style="margin-bottom:10px">${UI.pill(e.status, L.EVENT_STATUS)} ${UI.pill(e.approval || 'pending', L.APPROVAL)} <span class="small muted">internal</span> ${UI.pill(e.hostConf || 'not_required', L.HOSTCONF)} <span class="small muted">host</span>${UI.demo(e)}${e.archived ? ' <span class="pill">Archived</span>' : ''}</div>
      ${cf.length ? `<div class="banner warn"><b>Conflicts:</b> ${cf.map(c => `${esc(c.title)} (${U.fmtDs(c.date)}: ${esc(c.why.join(', '))})`).join('; ')}</div>` : ''}
      <div class="grid g2"><dl class="kv">
        <dt>Event ID</dt><dd class="mono">${esc(e.code || '—')}</dd><dt>Category</dt><dd>${esc(e.category || '—')}</dd>
        <dt>When</dt><dd>${U.fmtD(e.startDate)} ${esc(e.startTime || '')}${e.endDate && (e.endDate !== e.startDate || e.endTime) ? ' → ' + U.fmtD(e.endDate) + ' ' + esc(e.endTime || '') : ''} <span class="muted small">EAT</span></dd>
        <dt>Venue</dt><dd>${esc(e.venue || '—')}${e.address ? '<br><span class="small muted">' + esc(e.address) + '</span>' : ''}</dd>
        <dt>Host</dt><dd>${esc(e.host || '—')}${e.hostContact ? '<br><span class="small">' + esc(e.hostContact) + '</span>' : ''}</dd>
        <dt>Leader</dt><dd>${esc(L.memberName(e.leaderId))}</dd><dt>Departments</dt><dd>${(e.depts || []).map(d => esc(L.deptName(d))).join(', ') || '—'}</dd>
        <dt>Work-plan</dt><dd>${esc((St.get('objectives', e.objectiveId) || {}).title || '—')}${e.activityId ? '<br><span class="small">' + esc((St.get('activities', e.activityId) || {}).title || '') + '</span>' : ''}</dd>
        <dt>Equipment</dt><dd>${(e.equipment || []).map(esc).join(', ') || '—'}</dd><dt>Technical</dt><dd>${esc(e.tech || '—')}</dd>
        <dt>Transport</dt><dd>${esc(e.transport || '—')}</dd><dt>Accommodation</dt><dd>${esc(e.accommodation || '—')}</dd>
        ${showFin ? `<dt>Budget</dt><dd>${U.money(fin.budget, St.cfg().currency)}</dd><dt>Actual expenses</dt><dd>${fin.actual == null ? '<span class="muted">not recorded</span>' : U.money(fin.actual, St.cfg().currency)}</dd>` : ''}
        ${A.Fin && A.Fin.canView() ? (() => { const fm = A.Fin.eventMoney(e.id); return `<dt>Finance Manager</dt><dd>${fm.income || fm.expense ? `Income ${A.Fin.fmt(fm.income)} · Expenses ${A.Fin.fmt(fm.expense)}` : '<span class="muted">nothing linked to this event yet</span>'}</dd>`; })() : ''}
        <dt>Attachments</dt><dd>${(e.attachments || []).map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name || a.url)}</a>`).join('<br>') || '—'}</dd>
        <dt>Notes</dt><dd>${esc(e.notes || '—')}</dd></dl>
      <div><h3>Preparation</h3>${plan ? `<p><b>${esc(plan.name)}</b>: ${m.sessions} sessions, ${U.hrs(m.plannedMin)} planned, ${m.ready}/${m.unique} songs ready.</p><button class="btn sm" id="vPlan">Open practice plan</button>` : `<p class="muted">No practice plan linked.</p>${A.Auth.can('practice') ? '<button class="btn sm" id="vNewPlan">Create practice plan</button>' : ''}`}
        <h3 style="margin-top:12px">Repertoire (${(e.songIds || []).length})</h3><div class="small">${(e.songIds || []).map(s => esc(L.songTitle(s))).join(' · ') || '<span class="muted">none listed</span>'}</div>
        <h3 style="margin-top:12px">Tasks (${tasks.length})</h3>${tasks.map(t => `<div class="small" style="padding:2px 0">${L.taskOverdue(t) ? '<span class="pill bad">Overdue</span> ' : ''}${esc(t.title)} · ${U.fmtDs(t.due)} ${UI.pill(t.status, L.TASK_STATUS)}</div>`).join('') || '<div class="small muted">No tasks.</div>'}
        <h3 style="margin-top:12px">Travel (${legs.length})</h3>${legs.map(t => `<div class="small">${t.dir === 'return' ? 'Return' : 'Outbound'}: ${U.fmtDs(t.departDate)} ${esc(t.departTime || '??:??')} ${esc(t.from || '?')} → ${esc(t.to || '?')} ${t.confirmed ? '<span class="pill ok">Confirmed</span>' : '<span class="pill warn">Unconfirmed</span>'}</div>`).join('') || '<div class="small muted">No travel legs.</div>'}
      </div></div>`;
    const buttons = [{ label: 'Close' }];
    buttons.push({ label: 'Event brief PDF', onClick: () => { A.state.pdf = { type: 'brief', eventId: id, period: { kind: 'year', year: +(e.startDate || '2027').slice(0, 4) } }; setTimeout(() => A.go('pdf'), 30); } });
    if (can) {
      buttons.push({ label: 'Add task', onClick: () => setTimeout(() => A.M.tasks.edit({ linkType: 'event', linkId: id, due: e.startDate }), 50) });
      const key = { Concert: 'concert', Recording: 'recording', Wedding: 'wedding', Rehearsal: 'rehearsal' }[e.category];
      if (key) buttons.push({ label: 'Task template', onClick: () => setTimeout(() => templateDialog(e, key), 50) });
      buttons.push({ label: 'Duplicate', onClick: () => setTimeout(() => edit(Object.assign({}, e, { id: undefined, code: undefined, title: e.title + ' (copy)', status: 'proposed', approval: 'pending', hostConf: e.hostConf === 'not_required' ? 'not_required' : 'awaiting', planId: '', archived: false, createdAt: undefined })), 50) });
      if (e.status !== 'cancelled') buttons.push({ label: 'Cancel event', cls: 'danger', onClick: async () => { if (!(await UI.confirm('Cancel this event? It stays on record as Cancelled.', { ok: 'Cancel event', danger: true }))) return false; await St.patch('events', id, { status: 'cancelled' }); L.notifyChange('Event cancelled', e.title, U.fmtD(e.startDate), ['events', id]); } });
      buttons.push({ label: e.archived ? 'Restore' : 'Archive', onClick: () => St.patch('events', id, { archived: !e.archived }) });
      if (e.hostConf === 'awaiting') buttons.push({ label: 'Host confirmed', cls: 'gold', onClick: () => St.patch('events', id, { hostConf: 'confirmed', status: ['proposed', 'awaiting_approval', 'approved', 'awaiting_host'].includes(e.status) && e.approval === 'approved' ? 'confirmed' : e.status }) });
    }
    if (A.Auth.can('approve') && e.approval !== 'approved') buttons.push({ label: 'Approve', cls: 'gold', onClick: () => UI.approve('events', e, 'approved', { status: ['proposed', 'awaiting_approval'].includes(e.status) ? (e.hostConf === 'awaiting' ? 'awaiting_host' : 'approved') : e.status }) });
    if (A.AI.available()) buttons.push({ label: 'Draft brief & agenda (AI)', onClick: () => setTimeout(() => A.AI.ask('Event brief & meeting agenda: ' + e.title, 'Draft (1) a one-page event brief for choir members and (2) a preparation meeting agenda with timings. Flag anything unconfirmed (host confirmation, travel, missing details) as open items.', { event: { title: e.title, code: e.code, category: e.category, start: e.startDate + ' ' + (e.startTime || ''), end: (e.endDate || '') + ' ' + (e.endTime || ''), venue: e.venue, address: e.address, host: e.host, status: L.label(L.EVENT_STATUS, e.status), approval: e.approval, hostConfirmation: L.label(L.HOSTCONF, e.hostConf), equipment: e.equipment, tech: e.tech, transport: e.transport, accommodation: e.accommodation, notes: e.notes }, repertoire: (e.songIds || []).map(L.songTitle), tasks: tasks.map(t => ({ title: t.title, due: t.due, status: t.status, dept: L.deptName(t.deptId) })), travel: legs.map(t => ({ dir: t.dir, depart: t.departDate + ' ' + (t.departTime || 'time missing'), from: t.from, to: t.to, confirmed: !!t.confirmed })), preparation: plan ? A.AI.planData(plan).metrics : null }), 50) });
    if (can) buttons.push({ label: 'Edit', cls: 'pri', onClick: () => setTimeout(() => edit(e), 50) });
    const md = UI.modal({ title: e.title, wide: true, body, buttons });
    const vp = md.body.querySelector('#vPlan'); if (vp) vp.onclick = () => { md.close(); A.go('practice', { plan: plan.id }); };
    const np = md.body.querySelector('#vNewPlan'); if (np) np.onclick = () => { md.close(); A.M.practice.editPlan({ name: e.title + ' preparation', eventId: id, target: e.startDate, year: +(e.startDate || '2027').slice(0, 4), songIds: e.songIds || [], depts: e.depts || [] }); };
  }
})(window.App);
