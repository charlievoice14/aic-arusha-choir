/* m_reports.js — Reports & Evaluation, and Notifications */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, C = A.Charts, esc = U.esc;
  const ND = '<span class="muted" title="No data recorded">no data</span>';

  A.M.reports = {
    render(root, params) {
      const f = UI.stp('reports', { tab: 'activities', year: St.cfg().year || 2027, q: '', dept: '' }, params);
      const tabs = [['activities', 'Activities'], ['objectives', 'Objectives'], ['events', 'Events & invitations'], ['tasks', 'Tasks'], ['travel', 'Travel'], ...(A.Auth.has('finance') || St.mode === 'local' ? [['budget', 'Budget vs expenditure']] : []), ['practice', 'Practice'], ['songs', 'Songs by event'], ['attendance', 'Attendance'], ['depts', 'Departments & lessons']];
      root.innerHTML = `<div class="filters"><label>Year${UI.yearSel('rY', f.year)}</label><label>Quarter${UI.sel('rQ', [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']], f.q, 'Full year')}</label><label>Department${UI.sel('rD', UI.opt.depts(), f.dept)}</label><span class="small muted" style="align-self:center">"no data" means nothing has been recorded. It is not the same as zero.</span></div>
        <div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="rBody"></div>`;
      UI.bindFilters(root, f, { rY: 'year', rQ: 'q', rD: 'dept' }, A.render);
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
      const y = +f.year; const [a, b] = f.q ? U.qRange(y, +f.q) : [`${y}-01-01`, `${y}-12-31`];
      const el = root.querySelector('#rBody');
      R[f.tab](el, { y, a, b, f });
      UI.bindGo(el);
    },
  };
  const toolbar = (csvName, head, rows, pdf) => `<div class="row" style="margin-bottom:10px"><button class="btn sm" data-csv="${esc(csvName)}">CSV</button>${pdf ? `<button class="btn sm" data-pdf='${esc(JSON.stringify(pdf))}'>PDF</button>` : ''}</div>`;
  function bindTb(el, head, rows) {
    const c = el.querySelector('[data-csv]'); if (c) c.onclick = () => UI.csvDownload(c.dataset.csv, head, rows).catch(UI.fail);
    const p = el.querySelector('[data-pdf]'); if (p) p.onclick = () => { A.state.pdf = JSON.parse(p.dataset.pdf); A.go('pdf'); };
  }
  const tbl = (head, rows) => UI.table(head.map((h, i) => ({ label: h, f: r => r[i] == null ? ND : (typeof r[i] === 'string' && r[i].startsWith('<') ? r[i] : esc(r[i])), n: typeof rows[0]?.[i] === 'number' })), rows.map((r, i) => Object.assign(r.slice(), { id: String(i) })), { empty: 'No records for this selection.' });
  const R = {
    activities(el, { y, a, b, f }) {
      const acts = St.live('activities').filter(x => +x.year === y && (!f.dept || x.deptId === f.dept) && U.overlapRange(x.start || x.end || a, x.end || x.start || b, a, b));
      const head = ['Quarter', 'Planned', 'Completed', 'In progress', 'Not started', 'Cancelled / deferred', 'Avg progress %'];
      const rows = [1, 2, 3, 4].filter(q => !f.q || +f.q === q).map(q => { const [qa, qb] = U.qRange(y, q); const xs = acts.filter(x => U.overlapRange(x.start || x.end, x.end || x.start, qa, qb)); return ['Q' + q, xs.length, xs.filter(x => x.status === 'completed').length, xs.filter(x => x.status === 'in_progress').length, xs.filter(x => x.status === 'planned').length, xs.filter(x => ['cancelled', 'deferred'].includes(x.status)).length, xs.length ? Math.round(xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length) : null]; });
      const byD = {}; acts.forEach(x => { const k = x.deptId || ''; (byD[k] = byD[k] || []).push(x); });
      const h2 = ['Department', 'Activities', 'Completed', 'Avg progress %'];
      const r2 = Object.entries(byD).map(([k, xs]) => [k ? L.deptName(k) : 'No department', xs.length, xs.filter(x => x.status === 'completed').length, Math.round(xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length)]);
      el.innerHTML = toolbar(`Choir_Activities_Report_${y}.csv`, head, rows, { type: 'annual', period: { kind: 'year', year: y } }) + `<div class="grid g2"><div class="card"><h3>Planned vs completed by quarter</h3>${C.bars(rows.map(r => r[0]), rows.map(r => r[2]), { unit: 'completed', aria: 'Completed activities by quarter' })}</div><div class="card"><h3>Activities by department</h3>${C.donut(r2.map(r => ({ label: r[0], value: r[1] })), String(acts.length), 'activities')}</div></div><h3 style="margin:12px 0 6px">By quarter</h3>${tbl(head, rows)}<h3 style="margin:12px 0 6px">By department</h3>${tbl(h2, r2)}`;
      bindTb(el, head, rows);
    },
    objectives(el, { y }) {
      const objs = St.all('objectives').filter(o => +o.year === y);
      const head = ['Objective', 'Target', 'Indicator', 'Activities', 'Completed activities', 'Progress %', 'Status'];
      const rows = objs.map(o => { const xs = St.live('activities').filter(x => x.objectiveId === o.id); return [o.title, o.target || '—', o.kpi || '—', xs.length, xs.filter(x => x.status === 'completed').length, L.objProgress(o), L.label(L.ACT_STATUS, o.status)]; });
      el.innerHTML = toolbar(`Choir_Objectives_${y}.csv`, head, rows, { type: 'annual', period: { kind: 'year', year: y } }) + `<div class="card" style="margin-bottom:12px">${C.meters(objs.map(o => ({ label: o.title, value: L.objProgress(o), max: 100 })))|| '<p class="muted small">No objectives.</p>'}</div>` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    events(el, { y, a, b, f }) {
      const evs = St.live('events').filter(e => e.startDate && U.overlapRange(e.startDate, e.endDate || e.startDate, a, b) && (!f.dept || (e.depts || []).includes(f.dept)));
      const head = ['Quarter', 'Events', 'Approved (internal)', 'Pending / rejected', 'Confirmed by host', 'Awaiting host', 'Declined', 'Internal only', 'Completed', 'Cancelled'];
      const rows = [1, 2, 3, 4].filter(q => !f.q || +f.q === q).map(q => { const [qa, qb] = U.qRange(y, q); const xs = evs.filter(e => U.inRange(e.startDate, qa, qb)); return ['Q' + q, xs.length, xs.filter(e => e.approval === 'approved').length, xs.filter(e => e.approval !== 'approved').length, xs.filter(e => e.hostConf === 'confirmed').length, xs.filter(e => e.hostConf === 'awaiting').length, xs.filter(e => e.hostConf === 'declined').length, xs.filter(e => !e.hostConf || e.hostConf === 'not_required').length, xs.filter(e => e.status === 'completed').length, xs.filter(e => e.status === 'cancelled').length]; });
      const unc = evs.filter(e => e.hostConf === 'awaiting').sort(U.by('startDate'));
      el.innerHTML = toolbar(`Choir_Events_Report_${y}.csv`, head, rows, { type: 'eventcal', period: f.q ? { kind: 'quarter', year: y, q: +f.q } : { kind: 'year', year: y } }) + `<div class="grid g2"><div class="card"><h3>Host confirmation</h3>${C.donut([{ label: 'Confirmed', value: evs.filter(e => e.hostConf === 'confirmed').length, go: ['events', { hostConf: 'confirmed', year: y }] }, { label: 'Awaiting', value: unc.length, go: ['events', { hostConf: 'awaiting', year: y }] }, { label: 'Declined', value: evs.filter(e => e.hostConf === 'declined').length }, { label: 'Internal (not required)', value: evs.filter(e => !e.hostConf || e.hostConf === 'not_required').length }].filter(x => x.value), String(evs.length), 'events')}</div>
        <div class="card"><h3>Unconfirmed invitations</h3>${unc.map(e => `<div class="small" style="padding:3px 0">${U.fmtD(e.startDate)} · <b>${esc(e.title)}</b> · ${esc(e.host || 'host not recorded')} (${U.diffDays(U.today(), e.startDate)} days)</div>`).join('') || '<p class="muted small">None.</p>'}</div></div><h3 style="margin:12px 0 6px">Events by quarter</h3>` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    tasks(el, { a, b, f }) {
      const today = U.today();
      const ts = St.live('tasks').filter(t => (!f.dept || t.deptId === f.dept) && (!t.due || U.inRange(t.due, a, b)));
      const out = ts.filter(t => !['completed', 'cancelled'].includes(t.status)).sort(U.by('due'));
      const head = ['Deadline', 'Task', 'Department', 'Assigned', 'Priority', 'Status', 'Completion %', 'Overdue'];
      const rows = out.map(t => [t.due || '—', t.title, L.deptName(t.deptId), (t.assignees || []).map(L.memberName).join(', ') || '—', L.label(L.PRIORITY, t.priority), L.label(L.TASK_STATUS, t.status), +t.pct || 0, L.taskOverdue(t, today) ? 'OVERDUE' : '']);
      el.innerHTML = toolbar('Choir_Outstanding_Tasks.csv', head, rows, { type: 'tasks', period: f.q ? { kind: 'quarter', year: +f.year, q: +f.q } : { kind: 'year', year: +f.year } }) + `<div class="stats">${UI.stat(ts.length, 'Tasks in period')}${UI.stat(ts.filter(t => t.status === 'completed').length, 'Completed', { tone: 'ok' })}${UI.stat(out.length, 'Outstanding')}${UI.stat(out.filter(t => L.taskOverdue(t, today)).length, 'Overdue', { tone: 'bad', go: ['tasks', { view: 'overdue' }] })}${UI.stat(out.filter(t => t.status === 'blocked').length, 'Blocked', { tone: 'warn' })}</div>` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    travel(el, { a, b, f }) {
      const ls = St.all('travel').filter(t => !t.departDate || U.inRange(t.departDate, a, b));
      const head = ['Event', 'Leg', 'Departure', 'Route', 'Mode', 'Provider', 'Booking ref.', 'Confirmed', 'Issues'];
      const rows = ls.sort(U.by(t => t.departDate || '')).map(t => [(St.get('events', t.eventId) || {}).title || '—', t.dir, `${t.departDate || '?'} ${t.departTime || ''}`, `${t.from || '?'} → ${t.to || '?'}`, t.mode || '—', t.provider || '—', t.booking || '(none)', t.confirmed ? 'Yes' : 'No', L.legFlags(t).filter(x => x !== 'Unconfirmed').join('; ') || '—']);
      el.innerHTML = toolbar('Choir_Travel_Report.csv', head, rows, { type: 'itinerary', period: f.q ? { kind: 'quarter', year: +f.year, q: +f.q } : { kind: 'year', year: +f.year } }) + `<div class="stats">${UI.stat(ls.length, 'Legs')}${UI.stat(ls.filter(t => t.confirmed).length, 'Confirmed', { tone: 'ok' })}${UI.stat(ls.filter(t => !t.confirmed).length, 'Unconfirmed', { tone: 'warn' })}${UI.stat(ls.filter(t => L.legFlags(t).some(x => x.startsWith('Missing'))).length, 'Missing details', { tone: 'bad' })}</div>` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    budget(el, { a, b }) {
      const cur = St.cfg().currency || 'TZS';
      const evs = St.live('events').filter(e => e.startDate && U.inRange(e.startDate, a, b));
      const head = ['Event', 'Date', 'Estimated budget', 'Recorded actual', 'Variance'];
      const rows = evs.map(e => { const fz = St.get('finance', e.id) || {}; return [e.title, e.startDate, fz.budget == null ? null : fz.budget, fz.actual == null ? null : fz.actual, fz.budget != null && fz.actual != null ? fz.actual - fz.budget : null]; });
      const acts = St.live('activities').filter(x => x.budget && U.overlapRange(x.start || a, x.end || b, a, b));
      const tb = rows.reduce((t, r) => t + (r[2] || 0), 0), ta = rows.filter(r => r[3] != null).reduce((t, r) => t + r[3], 0);
      el.innerHTML = toolbar('Choir_Budget_vs_Actual.csv', head, rows) + `<div class="stats">${UI.stat(U.money(tb, cur), 'Estimated (events)')}${UI.stat(rows.some(r => r[3] != null) ? U.money(ta, cur) : 'no data', 'Recorded actual (events)', { f: `${rows.filter(r => r[3] != null).length} of ${rows.length} events recorded` })}${UI.stat(U.money(acts.reduce((t, x) => t + (+x.budget || 0), 0), cur), 'Work-plan activity budgets')}</div>` + UI.table([{ label: 'Event', f: r => esc(r[0]) }, { label: 'Date', f: r => U.fmtD(r[1]) }, { label: 'Estimated', n: 1, f: r => r[2] == null ? ND : U.money(r[2], cur) }, { label: 'Recorded actual', n: 1, f: r => r[3] == null ? ND : U.money(r[3], cur) }, { label: 'Variance', n: 1, f: r => r[4] == null ? ND : `<span style="color:var(--${r[4] > 0 ? 'bad' : 'ok'})">${U.money(r[4], cur)}</span>` }], rows.map((r, i) => Object.assign(r, { id: String(i) })), { empty: 'No events in this period.' });
      bindTb(el, head, rows);
    },
    practice(el, { a, b, f }) {
      const plans = St.all('plans').filter(p => !p.year || +p.year === +f.year);
      const head = ['Plan', 'Eligible sessions', 'Completed', 'Cancelled', 'Planned hours', 'Actual hours', 'Practice days', 'Unique songs', 'Scheduled', 'Ready'];
      const rows = plans.map(p => { const m = L.planMetrics(p, U.today(), [a, b]); return [p.name, m.sessions, m.completed, m.cancelled, +(m.plannedMin / 60).toFixed(1), m.actualMin == null ? null : +(m.actualMin / 60).toFixed(1), m.practiceDays, m.unique, m.scheduledSongs, m.ready]; });
      const months = []; for (let mm = +a.slice(5, 7); mm <= +b.slice(5, 7); mm++) months.push(mm);
      const ss = St.all('sessions').filter(s => U.inRange(s.date, a, b) && plans.some(p => p.id === s.planId));
      const pl = months.map(mm => ss.filter(s => L.eligible(s) && +s.date.slice(5, 7) === mm).reduce((t, s) => t + (L.sessNet(s) || 0), 0) / 60);
      const ac = months.map(mm => { const c = ss.filter(s => s.status === 'completed' && +s.date.slice(5, 7) === mm && L.sessActualNet(s) != null); return c.length ? c.reduce((t, s) => t + L.sessActualNet(s), 0) / 60 : null; });
      const sc = months.map(mm => ss.filter(s => L.eligible(s) && +s.date.slice(5, 7) === mm).length), dn = months.map(mm => ss.filter(s => s.status === 'completed' && +s.date.slice(5, 7) === mm).length);
      el.innerHTML = toolbar(`Choir_Practice_Report_${f.year}${f.q ? '_Q' + f.q : ''}.csv`, head, rows, { type: 'hours', period: f.q ? { kind: 'quarter', year: +f.year, q: +f.q } : { kind: 'year', year: +f.year } }) + `<div class="grid g2"><div class="card"><h3>Planned vs actual hours</h3>${pl.some(Boolean) ? C.lines(months.map(m => U.MON[m - 1]), [{ name: 'Planned', values: pl }, { name: 'Actual (recorded)', values: ac }], { unit: 'h' }) : '<p class="muted small">No sessions.</p>'}</div><div class="card"><h3>Planned vs completed sessions</h3>${sc.some(Boolean) ? C.lines(months.map(m => U.MON[m - 1]), [{ name: 'Scheduled (eligible)', values: sc }, { name: 'Completed', values: dn }], { unit: 'sessions' }) : '<p class="muted small">No sessions.</p>'}</div></div><h3 style="margin:12px 0 6px">By plan</h3>` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    songs(el, { a, b }) {
      const evs = St.live('events').filter(e => e.startDate && U.inRange(e.startDate, a, b));
      const head = ['Event', 'Date', 'Plan', 'Songs required', 'Scheduled', 'Ready', 'Needs more practice', 'Not scheduled'];
      const rows = evs.map(e => { const p = (e.planId && St.get('plans', e.planId)) || L.eventPlan(e.id); if (!p) return [e.title, e.startDate, '(no practice plan)', (e.songIds || []).length, null, null, null, null]; const m = L.planMetrics(p); return [e.title, e.startDate, p.name, m.unique, m.scheduledSongs, m.ready, m.needsMore.length, m.notScheduled.length]; });
      el.innerHTML = toolbar('Choir_Song_Readiness_by_Event.csv', head, rows, { type: 'readiness', period: { kind: 'year', year: +a.slice(0, 4) } }) + tbl(head, rows);
      bindTb(el, head, rows);
    },
    attendance(el, { a, b, f }) {
      const ss = St.all('sessions').filter(s => U.inRange(s.date, a, b) && s.status === 'completed').sort(U.by('date'));
      const st = L.attStats(ss);
      const head = ['Date', 'Plan', 'Sections', 'Expected', 'Present + late', 'Attendance %'];
      const rows = ss.map(s => { const x = L.attStats([s]); return [s.date, (St.get('plans', s.planId) || {}).name || '—', (s.sections || []).join('/') || 'all', L.expectedMembers(s).length, x.recorded ? x.present : null, x.pct]; });
      const secs = UI.opt.sections();
      const secPct = secs.map(sec => { let e = 0, p = 0; ss.forEach(s => { const at = St.get('attendance', s.id); if (!at || !at.records) return; L.expectedMembers(s).filter(id => ((St.get('members', id) || {}).sections || []).includes(sec)).forEach(id => { e++; if (['P', 'L'].includes(at.records[id])) p++; }); }); return e ? Math.round(p / e * 100) : 0; });
      el.innerHTML = toolbar('Choir_Attendance.csv', head, rows, { type: 'attendance', period: f.q ? { kind: 'quarter', year: +f.year, q: +f.q } : { kind: 'year', year: +f.year } }) + `<div class="stats">${UI.stat(st.pct == null ? 'no data' : st.pct + '%', 'Overall attendance')}${UI.stat(st.recorded, 'Sessions with records')}${UI.stat(st.missing, 'Completed without records', { tone: st.missing ? 'warn' : '' })}</div>${st.recorded ? `<div class="card" style="margin-bottom:12px"><h3>Attendance by section (%)</h3>${C.bars(secs, secPct, { unit: '%', minMax: 100, aria: 'Attendance by section' })}</div>` : ''}` + tbl(head, rows);
      bindTb(el, head, rows);
    },
    depts(el, { y }) {
      const head = ['Department', 'Leader', 'Activities', 'Completed', 'Avg progress %', 'Tasks', 'Completed tasks', 'Overdue'];
      const rows = St.live('departments').map(d => { const xs = St.live('activities').filter(x => x.deptId === d.id && +x.year === y); const ts = St.live('tasks').filter(t => t.deptId === d.id && (!t.due || +t.due.slice(0, 4) === y)); return [d.name, L.memberName(d.leaderId), xs.length, xs.filter(x => x.status === 'completed').length, xs.length ? Math.round(xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length) : null, ts.length, ts.filter(t => t.status === 'completed').length, ts.filter(t => L.taskOverdue(t)).length]; });
      const ll = St.live('activities').filter(x => +x.year === y && x.lessons);
      el.innerHTML = toolbar(`Choir_Department_Performance_${y}.csv`, head, rows, { type: 'annual', period: { kind: 'year', year: y } }) + tbl(head, rows) + `<h3 style="margin:14px 0 6px">Lessons learned</h3>${ll.length ? ll.map(x => `<div class="card" style="margin-bottom:8px"><b>${esc(x.title)}</b> <span class="muted small">${esc(L.deptName(x.deptId))}</span><p class="small" style="margin:4px 0 0">${esc(x.lessons)}</p></div>`).join('') : '<div class="empty">No lessons recorded yet. Add them to activities in the Annual Work-Plan.</div>'}`;
      bindTb(el, head, rows);
    },
  };

  // ---------- notifications ----------
  A.M.notifications = {
    render(root, params) {
      const f = UI.stp('notifications', { type: '', mine: false, showDismissed: false }, params);
      const dis = new Set(A.prefs.dismissed || []);
      let rs = L.reminders();
      const types = U.uniq(rs.map(r => r.type));
      if (f.type) rs = rs.filter(r => r.type === f.type);
      if (f.mine) rs = rs.filter(r => r.mine);
      const vis = rs.filter(r => f.showDismissed || !dis.has(r.id + '@' + r.when));
      const cfg = St.cfg(); const rm = Object.assign({ eventDays: 7, practiceHours: 48, taskDays: 3, songDays: 14, confirmDays: 30 }, cfg.reminders || {});
      root.innerHTML = `<div class="banner info">In-app reminders, worked out from the saved schedule: events ${rm.eventDays} days ahead, practices ${rm.practiceHours} hours ahead, tasks ${rm.taskDays} days ahead, song deadlines ${rm.songDays} days ahead. Change these in Settings. Email and SMS delivery is <b>not configured</b>, so nothing is sent outside the app.</div>
        <div class="filters"><label>Type${UI.sel('nT', types, f.type)}</label><label style="flex-direction:row;gap:6px;align-items:center;min-width:0"><input type="checkbox" id="nM" ${f.mine ? 'checked' : ''}> My tasks only</label><label style="flex-direction:row;gap:6px;align-items:center;min-width:0"><input type="checkbox" id="nD" ${f.showDismissed ? 'checked' : ''}> Show dismissed</label>${A.Auth.uid && A.Auth.canWriteData() && vis.length ? '<button class="btn sm" id="nAll">Dismiss all shown</button>' : ''}</div>
        ${vis.length ? vis.map(r => `<div class="card" style="margin-bottom:8px;border-left:3px solid var(--${r.tone === 'bad' ? 'bad' : r.tone === 'warn' ? 'warn' : 'royal'})"><div class="row between"><div style="min-width:0"><span class="pill ${r.tone}">${esc(r.type)}</span> <b>${esc(r.title)}</b><div class="small muted">${esc(r.body || '')}</div></div><div class="row">${r.link ? `<button class="btn sm" data-open='${esc(JSON.stringify(r.link))}'>Open</button>` : ''}${A.Auth.uid && A.Auth.canWriteData() ? `<button class="btn sm ghost" data-dis="${esc(r.id + '@' + r.when)}">${dis.has(r.id + '@' + r.when) ? 'Dismissed' : 'Dismiss'}</button>` : ''}</div></div></div>`).join('') : '<div class="empty">You\'re all caught up.</div>'}`;
      UI.bindFilters(root, f, { nT: 'type', nM: 'mine', nD: 'showDismissed' }, A.render);
      root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const [mod, id] = JSON.parse(b.dataset.open); if (mod === 'events') A.M.events.view(id); else if (mod === 'tasks') A.M.tasks.edit(St.get('tasks', id)); else if (mod === 'practice') A.go('practice', { plan: id }); else A.go(mod); });
      root.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => { const s = new Set(A.prefs.dismissed || []); s.add(b.dataset.dis); A.savePrefs({ dismissed: [...s].slice(-500) }).then(A.render); });
      const all = root.querySelector('#nAll'); if (all) all.onclick = () => { const s = new Set(A.prefs.dismissed || []); vis.forEach(r => s.add(r.id + '@' + r.when)); A.savePrefs({ dismissed: [...s].slice(-500) }).then(A.render); };
    },
  };
})(window.App);
