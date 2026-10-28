/* m_practice.js — Practice Planner: plans, single & recurring sessions, metrics, feasibility, distribution, readiness, attendance */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, C = A.Charts, esc = U.esc;
  const WD = [[0, 'Sun'], [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']];
  const canP = () => A.Auth.can('practice');
  const canR = () => A.Auth.can('readiness') || A.Auth.can('practice');

  const planFields = () => [
    { k: 'name', label: 'Plan name', req: true, full: true }, { k: 'color', label: 'Plan color (calendar & planner)', type: 'color', full: true }, { k: 'year', label: 'Planning year', type: 'number', req: true, min: 2000, max: 2100 },
    { k: 'eventId', label: 'Associated event (optional)', type: 'select', options: UI.opt.events() }, { k: 'objectiveId', label: 'Linked work-plan objective', type: 'select', options: UI.opt.objectives() },
    { k: 'collectionId', label: 'Song collection (adds its songs to the repertoire)', type: 'select', options: UI.opt.collections() },
    { k: 'start', label: 'Preparation start date', type: 'date', req: true }, { k: 'target', label: 'Performance / target completion date', type: 'date', hint: 'If an event is linked, its date is used.' },
    { k: 'ownerId', label: 'Plan owner', type: 'select', options: UI.opt.members() },
    { k: 'sections', label: 'Participating sections', type: 'multi', options: UI.opt.sections() }, { k: 'depts', label: 'Participating departments', type: 'multi', options: UI.opt.depts() },
    { k: 'targetSongs', label: 'Target unique songs', type: 'number', min: 0 }, { k: 'targetSessions', label: 'Target practice sessions', type: 'number', min: 0 }, { k: 'targetHours', label: 'Target practice hours', type: 'number', min: 0, step: 0.5 },
    { k: 'reservePct', label: 'Time reserved for revision & run-throughs (%)', type: 'number', min: 0, max: 80 },
    { k: 'status', label: 'Overall status', type: 'select', options: L.PLAN_STATUS, blank: false }, { k: 'approval', label: 'Approval', type: 'select', options: L.APPROVAL, blank: false, readonly: !A.Auth.can('approve') },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  const sessFields = (s, isSeriesOcc) => [
    { k: 'planId', label: 'Practice plan', type: 'select', options: UI.opt.plans(), req: true, readonly: !!s.id }, { k: 'title', label: 'Session title' },
    { k: 'date', label: 'Date', type: 'date', req: true }, { k: 'start', label: 'Start time', type: 'time', req: true }, { k: 'end', label: 'End time', type: 'time', req: true },
    { k: 'breakMin', label: 'Break (minutes)', type: 'number', min: 0 }, { k: 'venue', label: 'Venue' }, { k: 'leaderId', label: 'Practice leader', type: 'select', options: UI.opt.members() },
    { k: 'songTarget', label: 'Number of songs to practise (target)', type: 'number', min: 0, hint: 'If you assign specific songs, the planned count comes from the list instead.' },
    { k: 'sections', label: 'Participating sections', type: 'multi', options: UI.opt.sections() }, { k: 'memberIds', label: 'Individual participants (in addition to sections)', type: 'multi', options: UI.opt.members() },
    { k: 'notes', label: 'Notes & preparation', type: 'textarea', full: true },
  ];

  const M = A.M.practice = {
    render(root, params) {
      const f = UI.stp('practice', { plan: '', tab: '', ptab: 'dash', year: St.cfg().year || 2027, q: '', event: '', dept: '', section: '', stage: '', when: '' }, params);
      if (f.plan && !St.get('plans', f.plan)) f.plan = '';
      if (f.plan) return planView(root, f);
      f.tab = f.tab || 'dash';
      root.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="tabs" style="margin:0">${[['dash', 'Practice dashboard'], ['plans', 'Practice plans'], ['sessions', 'All sessions'], ['checkin', 'Check-in']].map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="row">${canP() ? '<button class="btn pri" id="pNew">New practice plan</button><button class="btn" id="pSingle">Single practice</button>' : ''}</div></div><div id="pBody"></div>`;
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
      const nb = root.querySelector('#pNew'); if (nb) nb.onclick = () => M.editPlan();
      const sb = root.querySelector('#pSingle'); if (sb) sb.onclick = () => M.newSingle();
      const body = root.querySelector('#pBody');
      ({ dash: practiceDash, plans: planList, sessions: allSessions, checkin: checkinPick })[f.tab](body, f);
    },
    editPlan, newSingle, editSession, newSeries, checkin,
  };

  // ---------- filters shared by dashboard & session list ----------
  function scopeFilters(f) {
    return `<div class="filters"><label>Year${UI.yearSel('pfY', f.year)}</label><label>Quarter${UI.sel('pfQ', [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']], f.q, 'Full year')}</label>
      <label class="grow">Event${UI.sel('pfE', UI.opt.events(), f.event)}</label><label>Department${UI.sel('pfD', UI.opt.depts(), f.dept)}</label>
      <label>Section${UI.sel('pfS', UI.opt.sections(), f.section)}</label><label>Song status${UI.sel('pfG', L.STAGES, f.stage)}</label></div>`;
  }
  function bindScope(root, f) { UI.bindFilters(root, f, { pfY: 'year', pfQ: 'q', pfE: 'event', pfD: 'dept', pfS: 'section', pfG: 'stage' }, A.render); }
  function scoped(f) {
    const y = +f.year; const [a, b] = f.q ? U.qRange(y, +f.q) : [`${y}-01-01`, `${y}-12-31`];
    const plans = St.all('plans').filter(p => (!p.year || +p.year === y) && (!f.event || p.eventId === f.event) && (!f.dept || (p.depts || []).includes(f.dept)));
    let sess = []; plans.forEach(p => sess.push(...L.planSessions(p.id)));
    sess = sess.filter(s => U.inRange(s.date, a, b) && (!f.section || (s.sections || []).includes(f.section) || !(s.sections || []).length));
    return { plans, sess, a, b, y };
  }

  // ---------- 8.12 practice dashboard ----------
  function practiceDash(el, f) {
    const { plans, sess, a, b } = scoped(f); const today = U.today();
    const elig = sess.filter(L.eligible); const done = elig.filter(s => s.status === 'completed');
    const next = elig.filter(s => s.status === 'scheduled' && (s.date > today || (s.date === today && (s.start || '') >= U.nowHM()))).sort(U.by(s => s.date + s.start))[0];
    const wk0 = U.addDays(today, -((U.dow(today) + 6) % 7)), wk1 = U.addDays(wk0, 6);
    const thisWeek = elig.filter(s => U.inRange(s.date, wk0, wk1));
    const pMin = elig.reduce((t, s) => t + (L.sessNet(s) || 0), 0);
    const aRec = done.filter(s => L.sessActualNet(s) != null); const aMin = aRec.reduce((t, s) => t + L.sessActualNet(s), 0);
    const songMap = new Map(); const overdue = [];
    plans.forEach(p => L.planSongIds(p).forEach(id => {
      const st = L.stage(p.id, id); const k = id; const prev = songMap.get(k); songMap.set(k, prev && prev !== 'ready' ? prev : st);
      const rd = L.readiness(p.id, id); if (rd && rd.targetDate && rd.targetDate < today && st !== 'ready') overdue.push({ p, id, rd });
    }));
    const eligIds = new Set(elig.map(s => s.id));
    const schedSongs = U.uniq(St.all('assignments').filter(x => eligIds.has(x.sessionId)).map(x => x.songId)).filter(id => songMap.has(id));
    const ready = [...songMap.values()].filter(s => s === 'ready').length;
    const att = L.attStats(elig);
    const tgtSongs = plans.reduce((t, p) => t + (+p.targetSongs || 0), 0);
    const deadlines = plans.map(p => ({ p, d: L.planTargetDate(p) })).filter(x => x.d && x.d >= today).sort(U.by('d')).slice(0, 6);
    const stat = UI.stat;
    const stageFilter = f.stage ? [...songMap.entries()].filter(([, s]) => s === f.stage).map(([id]) => id) : null;
    el.innerHTML = scopeFilters(f) + `
      <div class="card" style="margin-bottom:12px"><div class="row between"><div><div class="muted small">Next practice session</div>${next ? `<h2>${U.fmtD(next.date)} · ${esc(next.start)}–${esc(next.end)}</h2><div>${esc(next.title || (St.get('plans', next.planId) || {}).name || '')} · ${esc(next.venue || 'venue not set')} · ${L.sessSlots(next).n} song(s) · ${L.sessNet(next)} min net</div>` : '<h2 class="muted">None scheduled</h2>'}</div>${next ? `<button class="btn" id="pdNext">Open session</button>` : ''}</div></div>
      <div class="stats">
        ${stat(thisWeek.length, 'Sessions this week', { f: `${U.fmtDs(wk0)} – ${U.fmtDs(wk1)}`, go: ['practice', { tab: 'sessions', when: 'week' }] })}
        ${stat(U.uniq(done.map(s => s.date)).length, 'Practice days completed', { go: ['practice', { tab: 'sessions', when: 'completed' }] })}
        ${stat(U.uniq(elig.filter(s => s.status === 'scheduled' && s.date >= today).map(s => s.date)).length, 'Practice days remaining', { go: ['practice', { tab: 'sessions', when: 'upcoming' }] })}
        ${stat(U.hrs(pMin), 'Planned practice hours', { f: 'Σ net scheduled time' })}
        ${stat(aRec.length ? U.hrs(aMin) : '—', 'Actual practice hours', { f: aRec.length ? `${aRec.length} session(s) with recorded times` : 'none recorded yet' })}
        ${stat(songMap.size, 'Unique songs required', { go: ['songs', { tab: 'readiness' }] })}
        ${stat(schedSongs.length, 'Unique songs scheduled', { f: `${songMap.size - schedSongs.length} not yet scheduled` })}
        ${stat(ready, 'Ready for performance', { tone: 'ok', go: ['songs', { tab: 'readiness', stage: 'ready' }] })}
        ${stat(songMap.size - ready, 'Need additional work', { tone: songMap.size - ready ? 'warn' : '', go: ['songs', { tab: 'readiness', stage: 'notready' }] })}
        ${stat(att.pct == null ? '—' : att.pct + '%', 'Session attendance', { f: att.recorded ? `${att.recorded} recorded · ${att.missing} missing` : (att.missing ? `${att.missing} completed session(s) have no record` : 'no attendance data') })}
        ${stat(overdue.length, 'Songs with overdue preparation', { tone: overdue.length ? 'bad' : '' })}
        ${stat(tgtSongs ? Math.round(ready / tgtSongs * 100) + '%' : '—', 'Progress to repertoire target', { f: tgtSongs ? `${ready} ready of ${tgtSongs} targeted` : 'no target set' })}
      </div>
      <div class="grid g2">
        <div class="card"><h3>Upcoming performance deadlines</h3>${deadlines.length ? deadlines.map(x => { const fz = L.feasibility(x.p, today); return `<div style="padding:7px 0;border-top:1px solid var(--line);cursor:pointer" data-go='${esc(JSON.stringify(['practice', { plan: x.p.id }]))}'><div class="row between"><b>${esc(x.p.name)}</b><span class="pill ${fz.ok ? 'ok' : 'bad'}">${fz.ok ? 'Schedule looks sufficient' : 'Schedule looks insufficient'}</span></div><div class="small muted">${U.fmtD(x.d)} · ${U.diffDays(today, x.d)} days · ${fz.remaining} sessions left · ${fz.m.ready}/${fz.m.unique} ready</div></div>`; }).join('') + '<p class="small muted">Planning estimates, not guarantees of musical readiness.</p>' : '<div class="empty">No upcoming performance dates.</div>'}</div>
        <div class="card"><h3>Song status</h3>${C.donut(L.STAGES.map(([k, l]) => ({ label: l, value: [...songMap.values()].filter(s => s === k).length })).filter(x => x.value), String(songMap.size), 'songs')}
          ${stageFilter ? `<div class="small" style="margin-top:8px"><b>${esc(L.label(L.STAGES, f.stage))}:</b> ${stageFilter.map(id => esc(L.songTitle(id))).join(', ') || 'none'}</div>` : ''}
          ${overdue.length ? `<h3 style="margin-top:10px">Overdue preparation</h3>${overdue.map(o => `<div class="small">${esc(L.songTitle(o.id))}: target ${U.fmtD(o.rd.targetDate)} (${esc(o.p.name)}) ${UI.pill(L.stage(o.p.id, o.id), L.STAGES)}</div>`).join('')}` : ''}</div>
      </div>
      ${plans.length === 1 || f.event ? `<div class="card" style="margin-top:12px"><h3>Timeline</h3>${timeline(plans[0])}</div>` : ''}
      <div class="card" style="margin-top:12px"><h3>Sessions by week</h3>${weekBars(elig, a, b)}</div>`;
    bindScope(el, f); UI.bindGo(el);
    const nx = el.querySelector('#pdNext'); if (nx) nx.onclick = () => editSession(next);
  }
  function weekBars(elig, a, b) {
    const weeks = []; let w = U.addDays(a, -((U.dow(a) + 6) % 7));
    while (w <= b && weeks.length < 60) { weeks.push(w); w = U.addDays(w, 7); }
    const vals = weeks.map(w0 => elig.filter(s => U.inRange(s.date, w0, U.addDays(w0, 6))).reduce((t, s) => t + (L.sessNet(s) || 0), 0) / 60);
    if (!vals.some(Boolean)) return '<p class="muted small">No sessions in this period.</p>';
    const step = Math.ceil(weeks.length / 13);
    return C.bars(weeks.map((w0, i) => i % step === 0 ? U.fmtDs(w0) : ''), vals, { unit: 'h planned', labels: weeks.length <= 16, tipLabel: i => 'Week of ' + U.fmtD(weeks[i]), aria: 'Planned practice hours per week' });
  }
  function timeline(plan) {
    if (!plan) return '<p class="muted small">Choose an event or plan to see its timeline.</p>';
    const ss = L.planSessions(plan.id); const tgt = L.planTargetDate(plan); const today = U.today();
    if (!ss.length) return '<p class="muted small">No sessions yet.</p>';
    const a = ss[0].date; const b = tgt && tgt > ss[ss.length - 1].date ? tgt : ss[ss.length - 1].date; const span = Math.max(1, U.diffDays(a, b));
    const x = (d) => (U.diffDays(a, d) / span * 100).toFixed(2) + '%';
    return `<div class="tl">${ss.map(s => `<span class="mk k-practice ${s.status === 'cancelled' ? 'x' : ''}" style="left:${x(s.date)};${s.status === 'completed' ? 'background:var(--gold)' : ''}" title="${esc(U.fmtD(s.date) + ' · ' + L.label(L.SESSION_STATUS, s.status) + ' · ' + L.sessSlots(s).n + ' songs')}"></span>`).join('')}
      ${tgt ? `<span class="ev" style="left:${x(tgt)}"><b style="${parseFloat(x(tgt)) > 55 ? 'left:auto;right:4px' : ''}">Performance ${U.fmtDs(tgt)}</b></span>` : ''}${today >= a && today <= b ? `<span class="now" style="left:${x(today)}"><b style="${parseFloat(x(today)) > 70 ? 'left:auto;right:4px' : ''}">Today</b></span>` : ''}</div>
      <div class="row between small muted"><span>${U.fmtD(a)} · first session</span><span><i class="mk" style="position:static;display:inline-block;background:var(--gold)"></i> completed · <span style="color:var(--c-practice)">●</span> scheduled · faded = cancelled</span><span>${U.fmtD(b)}</span></div>`;
  }

  // ---------- plan list ----------
  function planList(el, f) {
    const plans = St.all('plans').sort(U.by(p => L.planTargetDate(p) || p.start || ''));
    el.innerHTML = UI.table([
      { label: 'Plan', f: p => `${UI.dot(L.planColor(p.id))}<b>${esc(p.name)}</b>${UI.demo(p)}` }, { label: 'Event', f: p => esc((St.get('events', p.eventId) || {}).title || 'General development') },
      { label: 'Dates', f: p => `${U.fmtDs(p.start)} → ${U.fmtDs(L.planTargetDate(p))}` }, { label: 'Sessions', n: 1, f: p => L.planMetrics(p).sessions }, { label: 'Planned', n: 1, f: p => U.hrs(L.planMetrics(p).plannedMin) },
      { label: 'Ready', n: 1, f: p => { const m = L.planMetrics(p); return `${m.ready}/${m.unique}`; } }, { label: 'Status', f: p => UI.pill(p.status, L.PLAN_STATUS) }, { label: 'Approval', f: p => UI.pill(p.approval || 'pending', L.APPROVAL) },
    ], plans, { click: 1, empty: 'No practice plans yet. Create one for a concert, wedding, recording or general development.' });
    UI.bindRows(el, id => { A.state.practice.plan = id; A.state.practice.ptab = 'dash'; A.render(); });
  }

  // ---------- all sessions ----------
  function allSessions(el, f) {
    const { sess } = scoped(f); const today = U.today();
    let list = sess.slice();
    if (f.when === 'upcoming') list = list.filter(s => s.status === 'scheduled' && s.date >= today);
    if (f.when === 'completed') list = list.filter(s => s.status === 'completed');
    if (f.when === 'cancelled') list = list.filter(s => s.status === 'cancelled');
    if (f.when === 'week') { const w0 = U.addDays(today, -((U.dow(today) + 6) % 7)); list = list.filter(s => U.inRange(s.date, w0, U.addDays(w0, 6))); }
    if (f.when === 'unrecorded') list = list.filter(s => s.status === 'scheduled' && s.date < today);
    list.sort(U.by(s => s.date + s.start));
    el.innerHTML = scopeFilters(f) + `<div class="row" style="margin-bottom:8px"><label class="small">Show ${UI.sel('pfW', [['upcoming', 'Upcoming'], ['week', 'This week'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['unrecorded', 'Past, not yet recorded']], f.when, 'All')}</label><span class="muted small">${list.length} session(s)</span></div>` + sessTable(list);
    bindScope(el, f); UI.bindFilters(el, f, { pfW: 'when' }, A.render);
    UI.bindRows(el, id => editSession(St.get('sessions', id)));
  }
  function sessTable(list, opts = {}) {
    return UI.table([
      { label: 'Date', f: s => `${U.fmtD(s.date)}` }, { label: 'Time', f: s => `<span class="mono">${esc(s.start || '')}–${esc(s.end || '')}</span>` },
      ...(opts.noPlan ? [] : [{ label: 'Plan', f: s => esc((St.get('plans', s.planId) || {}).name || '—') }]),
      { label: 'Venue', f: s => esc(s.venue || '—') }, { label: 'Net (sched.)', n: 1, f: s => (L.sessNet(s) ?? '—') + ' min' }, { label: 'Actual', n: 1, f: s => L.sessActualNet(s) == null ? '<span class="muted">—</span>' : L.sessActualNet(s) + ' min' },
      { label: 'Songs', n: 1, f: s => { const x = L.sessSlots(s); return `${x.n}${x.explicit ? '' : ' <span class="muted small">target</span>'}`; } },
      { label: 'Status', f: s => UI.pill(s.status, L.SESSION_STATUS) + (s.seriesId ? ' <span class="pill" title="Part of a recurring series">↻</span>' : '') + (s.detached ? ' <span class="pill" title="Edited separately from its series">edited</span>' : '') },
    ], list, { click: 1, empty: 'No sessions.' });
  }

  // ---------- single plan ----------
  function planView(root, f) {
    const p = St.get('plans', f.plan); const ev = p.eventId && St.get('events', p.eventId);
    const tabs = [['dash', 'Plan dashboard'], ['sessions', 'Sessions'], ['songs', 'Repertoire & readiness'], ['planner', 'Song planner'], ['distribute', 'Song distribution'], ['attendance', 'Attendance'], ['tasks', 'Practice tasks']];
    root.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn sm ghost" id="pBack">← All practice plans</button></div>
      <div class="card" style="margin-bottom:12px"><div class="row between"><div style="min-width:0"><div class="muted small">Practice plan · ${esc(p.year || '')}</div><h2>${esc(p.name)}${UI.demo(p)}</h2>
      <div class="small">${ev ? `For <b>${esc(ev.title)}</b> on ${U.fmtD(ev.startDate)}` : (p.target ? 'Target completion ' + U.fmtD(p.target) : 'General choir development')} · from ${U.fmtD(p.start)} · owner ${esc(L.memberName(p.ownerId))} ${UI.pill(p.status, L.PLAN_STATUS)} ${UI.pill(p.approval || 'pending', L.APPROVAL)}</div></div>
      <div class="row">${canP() ? '<button class="btn" id="pEdit">Edit plan</button><button class="btn" id="pS1">Single practice</button><button class="btn pri" id="pRec">Recurring practice</button>' : ''}${A.Auth.can('approve') && p.approval !== 'approved' ? '<button class="btn gold" id="pAppr">Approve</button>' : ''}<button class="btn" id="pPdf">Preparation PDF</button>${A.AI.available() ? '<button class="btn" id="pAi">AI review</button>' : ''}</div></div></div>
      <div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${f.ptab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="ppBody"></div>`;
    root.querySelector('#pBack').onclick = () => { f.plan = ''; f.tab = 'plans'; A.render(); };
    root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.ptab = b.dataset.t; A.render(); });
    const on = (id, fn) => { const b = root.querySelector(id); if (b) b.onclick = fn; };
    on('#pEdit', () => editPlan(p)); on('#pS1', () => newSingle({ planId: p.id })); on('#pRec', () => newSeries(p));
    on('#pAppr', () => UI.approve('plans', p, 'approved').catch(UI.fail));
    on('#pAi', () => A.AI.ask('AI review: ' + p.name, 'Review this practice plan. 1) Summarise rehearsal progress so far. 2) Highlight songs not yet scheduled before the performance and songs at risk. 3) Identify overloaded sessions (estimated load above net time) and scheduling conflicts. 4) Recommend extra preparation time for difficult songs and suggest practice days/durations. 5) Suggest follow-up tasks. Label all figures as estimates.', Object.assign(A.AI.planData(p), { conflicts: L.planSessions(p.id).filter(s => s.status === 'scheduled').flatMap(s => L.conflicts('session', s).map(c => ({ date: s.date, with: c.title, why: c.why }))).slice(0, 40) })));
    on('#pPdf', () => { A.state.pdf = { type: 'prep', planId: p.id, period: { kind: 'year', year: +(p.year || 2027) } }; A.go('pdf'); });
    const body = root.querySelector('#ppBody');
    ({ dash: planDash, sessions: planSessions, songs: planSongs, planner: planPlanner, distribute: planDistribute, attendance: planAttendance, tasks: planTasks })[f.ptab](body, p);
  }

  function planDash(el, p) {
    const today = U.today(); const fz = L.feasibility(p, today); const m = fz.m; const F = m.formulas;
    const row = (n, label, v, formula, tone) => `<tr><td class="num muted">${n}</td><td>${esc(label)}</td><td class="n" style="${tone ? 'color:var(--' + tone + ')' : ''}">${v}</td><td class="calc">${esc(formula || '')}</td></tr>`;
    el.innerHTML = `${fz.tgt ? `<div class="banner ${fz.ok ? 'info' : 'warn'}"><b>${fz.ok ? 'The current schedule appears sufficient' : 'The current schedule appears insufficient'}</b> for ${U.fmtD(fz.tgt)} (planning estimate, not a guarantee of musical readiness).
        ${!fz.ok ? `<ul class="list-plain" style="margin-top:6px">${fz.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>` : '<div class="banner info">This plan has no performance or target date, so deadline feasibility is not calculated.</div>'}
      <div class="grid g2"><div class="card"><h3>Preparation & feasibility</h3><dl class="kv">
        <dt>Calendar days until target</dt><dd class="num">${fz.calDays == null ? '—' : fz.calDays}</dd>
        <dt>Remaining practice days</dt><dd class="num">${fz.daysLeft}</dd><dt>Remaining scheduled sessions</dt><dd class="num">${fz.remaining}</dd>
        <dt>Planned sessions per week</dt><dd class="num">${fz.perWeek == null ? '—' : fz.perWeek.toFixed(1)}</dd>
        <dt>Required unique songs</dt><dd class="num">${m.unique}${p.targetSongs ? ` <span class="muted">(target ${p.targetSongs})</span>` : ''}</dd>
        <dt>Songs already ready</dt><dd class="num">${m.ready}</dd><dt>Songs needing work</dt><dd class="num">${m.attention}</dd>
        <dt>Remaining est. workload</dt><dd class="num">${U.hrs(m.workMin)} · ${m.workSlots} song-practices</dd>
        <dt>Available practice time</dt><dd class="num">${U.hrs(fz.availMin)} (usable ${U.hrs(fz.usableMin)} after ${fz.reserve}% revision reserve)</dd>
        <dt>Shortfall</dt><dd class="num" style="color:var(--${fz.deficitMin ? 'bad' : 'ok'})">${fz.deficitMin ? U.hrs(fz.deficitMin) : 'none'}</dd></dl>
        <p class="calc" style="margin-top:8px">Workload = Σ over not-ready songs of max(0, estimated sessions − completed practices) × estimated minutes. Defaults by difficulty: easy 2×15, moderate 3×20, difficult 5×25 min (editable per song).</p></div>
      <div class="card"><h3>Targets vs plan</h3>${C.meters([{ label: 'Sessions', value: m.sessions, max: +p.targetSessions || 0, sub: `${m.sessions} / ${p.targetSessions || '—'}` }, { label: 'Hours', value: m.plannedMin / 60, max: +p.targetHours || 0, sub: `${(m.plannedMin / 60).toFixed(1)} / ${p.targetHours || '—'} h` }, { label: 'Unique songs', value: m.unique, max: +p.targetSongs || 0, sub: `${m.unique} / ${p.targetSongs || '—'}` }, { label: 'Songs ready', value: m.ready, max: m.unique, sub: `${m.ready} / ${m.unique}` }, { label: 'Sessions completed', value: m.completed, max: m.sessions, sub: `${m.completed} / ${m.sessions}` }])}
        <h3 style="margin-top:10px">Timeline</h3>${timeline(p)}</div></div>
      <div class="card" style="margin-top:12px"><h3>Calculated metrics</h3><div class="tw"><table class="t"><thead><tr><th>#</th><th>Metric</th><th style="text-align:right">Value</th><th>How it's calculated</th></tr></thead><tbody>
        ${row(1, 'Scheduled practice sessions (eligible)', m.sessions, F.sessions)}
        ${row(2, 'Practice days', m.practiceDays, F.practiceDays)}
        ${row(3, 'Planned practice hours', U.hrs(m.plannedMin), F.plannedHours)}
        ${row(4, 'Actual practice hours', m.actualMin == null ? 'no data' : U.hrs(m.actualMin), F.actualHours + (m.completed - m.actualRecorded > 0 ? ` (${m.completed - m.actualRecorded} completed session(s) lack actual times)` : ''))}
        ${row(5, 'Planned song-practice slots', m.plannedSlots, `${F.plannedSlots} (${m.explicitSlots} from assigned lists, ${m.targetOnlySlots} from numeric targets only, which is workload, not verified repertoire)`)}
        ${row(6, 'Completed song-practice slots', m.completedSlots, F.completedSlots)}
        ${row(7, 'Unique songs in repertoire', m.unique, F.unique)}
        ${row(8, 'Unique songs scheduled', m.scheduledSongs, F.scheduledSongs)}
        ${row(9, 'Unique songs not yet scheduled', m.notScheduled.length, m.notScheduled.map(L.songTitle).join(', ') || '—', m.notScheduled.length ? 'warn' : '')}
        ${row(10, 'Songs ready for performance', m.ready, F.ready, 'ok')}
        ${row(11, 'Songs in progress / needing attention', `${m.attention}`, `${m.inProg.length} learning/in progress · ${m.needsMore.length} need more practice · ${m.attention - m.inProg.length - m.needsMore.length} not started`)}
        ${row(12, 'Completed vs remaining sessions', `${m.completed} / ${m.remaining}`, `completed · remaining from today (${m.cancelled} cancelled reported separately${m.unrecorded ? `, ${m.unrecorded} past sessions not yet recorded` : ''})`)}
        ${row(13, 'Average songs per session', m.avgSongs == null ? '—' : m.avgSongs.toFixed(1), F.avgSongs)}
        ${row(14, 'Average practice duration', m.avgMin == null ? '—' : Math.round(m.avgMin) + ' min', F.avgMin)}
        ${row(15, 'Sessions remaining before target', m.beforeEvent, F.beforeEvent)}
        ${row(16, 'Estimated workload remaining', U.hrs(m.workMin), F.workMin)}
      </tbody></table></div></div>`;
  }

  function planSessions(el, p) {
    const ss = L.planSessions(p.id); const series = St.all('series').filter(s => s.planId === p.id);
    const m = L.planMetrics(p);
    el.innerHTML = `<div class="stats">${UI.stat(m.sessions, 'Eligible sessions')}${UI.stat(m.practiceDays, 'Practice days')}${UI.stat(U.hrs(m.plannedMin), 'Planned hours')}${UI.stat(m.actualMin == null ? '—' : U.hrs(m.actualMin), 'Actual hours (recorded)')}${UI.stat(m.cancelled, 'Cancelled sessions', { tone: m.cancelled ? 'warn' : '' })}</div>
      ${series.length ? `<h3 style="margin-bottom:6px">Recurring series</h3>${UI.table([{ label: 'Series', f: s => esc(s.title || 'Series') }, { label: 'Pattern', f: s => `${esc(L.label(L.FREQ, s.freq))}${['weekly', 'biweekly', 'custom'].includes(s.freq) ? ' · ' + (s.weekdays || []).map(d => U.DAYS[d]).join(', ') : ''}` }, { label: 'Range', f: s => `${U.fmtDs(s.start)} – ${U.fmtD(s.end)}` }, { label: 'Time', f: s => `<span class="mono">${esc(s.startTime)}–${esc(s.endTime)}</span>` }, { label: 'Occurrences', n: 1, f: s => St.all('sessions').filter(x => x.seriesId === s.id && x.status !== 'cancelled').length }, { label: 'Excluded', f: s => (s.exclusions || []).map(U.fmtDs).join(', ') || '—' }], series, { click: 1 })}` : ''}
      <h3 style="margin:12px 0 6px">Sessions</h3>${sessTable(ss, { noPlan: 1 })}`;
    el.querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => { const id = tr.dataset.id; const sr = St.get('series', id); if (sr) newSeries(p, sr); else editSession(St.get('sessions', id)); }));
  }

  // ---------- repertoire & readiness ----------
  function planSongs(el, p) {
    const ids = L.planSongIds(p); const today = U.today();
    const cr = canR(); const cp = canP();
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${cp ? `<label class="small" style="flex:1;min-width:220px">Add songs from library ${UI.sel('psAdd', UI.opt.songs().filter(([id]) => !ids.includes(id)), '', 'Choose a song…')}</label><label class="small" style="min-width:200px">Add a collection ${UI.sel('psCol', UI.opt.collections(), '', 'Choose…')}</label>` : ''}</div>
      <p class="small muted">Only music leaders set readiness. Completing a session never marks a song ready on its own. Estimates drive the workload and feasibility figures.</p>
      ${UI.table([
        { label: 'Song', f: id => `<b>${esc(L.songTitle(id))}</b><div class="small muted">${esc((St.get('songs', id) || {}).key || '')} · ${esc((St.get('songs', id) || {}).difficulty || 'moderate')}</div>` },
        { label: 'Readiness (full choir)', f: id => cr ? `<select data-stage="${id}" aria-label="Readiness">${L.STAGES.map(([k, l]) => `<option value="${k}" ${L.stage(p.id, id) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : UI.pill(L.stage(p.id, id), L.STAGES) },
        { label: 'Sections', f: id => { const r = L.readiness(p.id, id) || {}; const ss = r.sectionStages || {}; return Object.keys(ss).length ? Object.entries(ss).map(([s, v]) => `<span class="pill ${L.tone(v)}" title="${esc(L.label(L.STAGES, v))}">${esc(s.slice(0, 1))}</span>`).join(' ') : '<span class="muted small">—</span>'; } },
        { label: 'Est. sessions × min', f: id => { const e = L.songEst(p.id, id); return `<span class="num">${e.sessions} × ${e.min}</span>${e.custom ? '' : ' <span class="muted small">default</span>'}`; } },
        { label: 'Practised / planned', n: 1, f: id => { const tl = L.songTimeline(p.id, id).filter(x => x.s.status !== 'cancelled'); return `${tl.filter(x => x.a.done).length} / ${tl.length}`; } },
        { label: 'Last · next practice', f: id => { const x = L.lastNextPractice(p.id, id, today); return `<span class="small">${x.last ? U.fmtDs(x.last) : '—'} · ${x.next ? U.fmtDs(x.next) : '—'}</span>`; } },
        { label: 'Target date', f: id => { const r = L.readiness(p.id, id) || {}; const late = r.targetDate && r.targetDate < today && L.stage(p.id, id) !== 'ready'; return r.targetDate ? `<span class="${late ? 'pill bad' : ''}">${U.fmtDs(r.targetDate)}</span>` : '—'; } },
        { label: '', f: id => `<button class="btn sm" data-rd="${id}">Details</button>` },
      ], ids.map(id => ({ id })).map(x => x.id), { empty: 'No songs in this plan yet. Add songs from the library or a collection.' }).replace(/data-id="[^"]*"/g, '')}`;
    // UI.table expects objects; map ids
    const tb = el.querySelector('tbody'); if (tb) [...tb.rows].forEach((tr, i) => tr.dataset.song = ids[i]);
    el.querySelectorAll('[data-stage]').forEach(s => s.onchange = async () => { try { await saveRd(p, s.dataset.stage, { stage: s.value }); UI.toast('Readiness updated'); } catch (e) { UI.fail(e); } });
    el.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => songDetail(p, b.dataset.rd));
    const add = el.querySelector('#psAdd'); if (add) add.onchange = async () => { if (!add.value) return; try { await addSongs(p, [add.value]); } catch (e) { UI.fail(e); } };
    const col = el.querySelector('#psCol'); if (col) col.onchange = async () => { const c = St.get('collections', col.value); if (!c) return; try { await addSongs(p, c.songIds || []); UI.toast(`Added songs from ${c.name}`); } catch (e) { UI.fail(e); } };
  }
  async function addSongs(p, ids) {
    const cur = St.get('plans', p.id); const songIds = U.uniq([...(cur.songIds || []), ...ids]);
    await St.patch('plans', p.id, { songIds });
    for (const id of ids) if (!L.readiness(p.id, id)) await St.put('readiness', { id: L.rdId(p.id, id), planId: p.id, songId: id, stage: 'not_scheduled' }, { audit: false });
  }
  async function saveRd(p, songId, part) {
    if (!canR()) throw new Error('Only music leaders can update readiness.');
    const cur = L.readiness(p.id, songId) || { id: L.rdId(p.id, songId), planId: p.id, songId, stage: 'not_scheduled' };
    await St.put('readiness', Object.assign({}, cur, part, { updatedBy: A.Auth.uid || null }), { summary: L.songTitle(songId) + ' → ' + L.label(L.STAGES, part.stage || cur.stage) });
  }
  function songDetail(p, songId) {
    const r = L.readiness(p.id, songId) || {}; const e = L.songEst(p.id, songId); const secs = UI.opt.sections();
    const tl = L.songTimeline(p.id, songId);
    const body = `${UI.form([
      { k: 'stage', label: 'Full-choir readiness', type: 'select', options: L.STAGES, blank: false },
      { k: 'estSessions', label: 'Estimated sessions needed', type: 'number', min: 0, hint: 'Default for this difficulty: ' + e.sessions },
      { k: 'estMin', label: 'Estimated minutes per session', type: 'number', min: 0, hint: 'Default: ' + e.min },
      { k: 'targetDate', label: 'Target readiness date', type: 'date' },
      ...secs.map(s => ({ k: 'sec_' + s, label: s + ' readiness', type: 'select', options: L.STAGES })),
      { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    ], Object.assign({ stage: L.stage(p.id, songId) }, r, Object.fromEntries(secs.map(s => ['sec_' + s, (r.sectionStages || {})[s] || '']))))}
      <h3 style="margin-top:12px">Preparation timeline (${tl.length} assignment(s))</h3>${tl.length ? tl.map(x => `<div class="small" style="padding:3px 0;border-bottom:1px solid var(--line)">${U.fmtD(x.s.date)} ${esc(x.s.start || '')} · ${UI.pill(x.s.status, L.SESSION_STATUS)} ${x.a.done ? '<span class="pill ok">rehearsed</span>' : ''}${x.a.locked ? ' <span class="pill">locked</span>' : ''}</div>`).join('') : '<p class="small muted">Not on any session yet.</p>'}`;
    UI.modal({ title: L.songTitle(songId), wide: true, body, buttons: [{ label: canP() ? 'Remove from plan' : 'Close', cls: canP() ? 'danger' : '', onClick: canP() ? async () => { if (!(await UI.confirm('Remove this song from the plan repertoire? Its session assignments are removed too.', { danger: true, ok: 'Remove' }))) return false; await St.patch('plans', p.id, { songIds: (St.get('plans', p.id).songIds || []).filter(x => x !== songId) }); for (const a of L.planAssign(p.id).filter(a => a.songId === songId)) await St.del('assignments', a.id, { audit: false }); } : null },
      ...(canR() ? [{ label: 'Save', cls: 'pri', onClick: async ({ body: b }) => { const fs = [{ k: 'stage' }, { k: 'estSessions', type: 'number' }, { k: 'estMin', type: 'number' }, { k: 'targetDate', type: 'date' }, { k: 'notes' }, ...secs.map(s => ({ k: 'sec_' + s }))]; const { vals } = UI.read(b, fs); const ss = {}; secs.forEach(s => { if (vals['sec_' + s]) ss[s] = vals['sec_' + s]; delete vals['sec_' + s]; }); vals.sectionStages = ss; await saveRd(p, songId, vals); UI.toast('Saved'); } }] : [])] });
  }

  // ---------- song planner (saved) ----------
  function planPlanner(el, p) {
    const today = U.today();
    const ss = L.planSessions(p.id).filter(s => s.status !== 'cancelled');
    const show = A.state.ppShow || 'upcoming';
    const list = show === 'all' ? ss : ss.filter(s => s.date >= today || s.status === 'scheduled');
    const rows = list.map(s => ({ s, ids: L.sessAssign(s.id).map(a => a.songId), locked: L.sessAssign(s.id).filter(a => a.locked).map(a => a.songId) }));
    const songs = L.planSongIds(p);
    const colorOf = (s) => { const sr = St.get('series', s.seriesId); const sl = sr && St.get('slots', sr.slotId); return sl ? L.slotColor(sl) : L.planColor(p.id); };
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><p class="small muted" style="margin:0;max-width:640px">Which songs to practise at each session, built from your schedule. Times come from the session; songs are ordered hardest first after a ${p.warmupMin ?? 10}-minute warm-up.</p>
      <div class="row">${UI.sel('ppShow', [['upcoming', 'Upcoming sessions'], ['all', 'All sessions']], show, null)}${canP() ? `<button class="btn pri" id="ppBuild">${L.planAssign(p.id).length ? 'Rebuild from schedule' : 'Build from schedule'}</button>` : ''}<button class="btn" id="ppPdf">Planner PDF</button></div></div>
      <div class="tabs"><button data-pv="m" class="${(A.state.ppView || 'm') === 'm' ? 'on' : ''}">When to practise each song</button><button data-pv="r" class="${A.state.ppView === 'r' ? 'on' : ''}">Session run sheets</button></div>
      <div class="card">${(A.state.ppView || 'm') === 'm' ? A.SP.matrix(rows, songs, colorOf) : A.SP.runsheets(rows, p.id, p.warmupMin ?? 10, colorOf)}</div>`;
    el.querySelector('#ppShow').onchange = (e) => { A.state.ppShow = e.target.value; A.render(); };
    el.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { A.state.ppView = b.dataset.pv; A.render(); });
    const bb = el.querySelector('#ppBuild'); if (bb) bb.onclick = () => { A.state.sp = null; A.go('schedule', { tab: 'planner', planId: p.id }); };
    el.querySelector('#ppPdf').onclick = () => { A.state.pdf = { type: 'songplan', planId: p.id, period: { kind: 'year', year: +(p.year || 2027) } }; A.go('pdf'); };
  }

  // ---------- 8.9 distribution ----------
  function planDistribute(el, p) {
    const st = A.state.dist = A.state.dist && A.state.dist.planId === p.id ? A.state.dist : { planId: p.id, reserve: p.reservePct == null ? 15 : p.reservePct, pins: [], extra: false, revise: false, allow: false, songs: null };
    const ids = L.planSongIds(p); const sel = st.songs || ids;
    el.innerHTML = `<div class="card"><h3>Assisted song distribution</h3><p class="small muted">Spreads the selected songs across future scheduled sessions before ${U.fmtD(L.planTargetDate(p))}. It respects each session's song target and available time, puts difficult songs first and repeats them, keeps locked and pinned assignments, and reserves time for revision. Review the result before saving. Being scheduled does not mean a song is mastered.</p>
      <div class="form"><label class="f"><span>Revision / run-through reserve (%)</span><input type="number" id="dRes" min="0" max="80" value="${st.reserve}"></label>
      <label class="f" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="dExtra" ${st.extra ? 'checked' : ''}> Extra repetition for "needs more practice" songs</label>
      <label class="f" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="dRev" ${st.revise ? 'checked' : ''}> Include one revision pass for ready songs</label>
      <label class="f" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="dOver" ${st.allow ? 'checked' : ''}> Allow overloading when time runs out (flagged)</label>
      <div class="f full"><span>Songs to distribute</span><div class="checks">${ids.map(id => `<label><input type="checkbox" data-s="${id}" ${sel.includes(id) ? 'checked' : ''}> ${esc(L.songTitle(id))} ${UI.pill(L.stage(p.id, id), L.STAGES)}</label>`).join('') || '<span class="muted small">Add songs to the plan first.</span>'}</div></div>
      <div class="f full"><span>Pin a song to a date</span><div class="row">${UI.sel('dPinSong', ids.map(id => [id, L.songTitle(id)]), '', 'Song…')}<input type="date" id="dPinDate" style="max-width:170px"><button class="btn sm" id="dPin" type="button">Pin</button></div>
      <div class="small" style="margin-top:4px">${st.pins.map((x, i) => `<span class="pill">${esc(L.songTitle(x.songId))} → ${U.fmtDs(x.date)} <a href="#" data-unpin="${i}">✕</a></span>`).join(' ') || '<span class="muted">No pins.</span>'}</div></div></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="dRun" ${canP() ? '' : 'disabled'}>Generate proposal</button></div></div><div id="dOut" style="margin-top:12px"></div>`;
    const sync = () => { st.reserve = +el.querySelector('#dRes').value || 0; st.extra = el.querySelector('#dExtra').checked; st.revise = el.querySelector('#dRev').checked; st.allow = el.querySelector('#dOver').checked; st.songs = [...el.querySelectorAll('[data-s]:checked')].map(c => c.dataset.s); };
    el.querySelector('#dPin').onclick = () => { sync(); const s = el.querySelector('#dPinSong').value, d = el.querySelector('#dPinDate').value; if (!s || !U.validDate(d)) return UI.toast('Choose a song and a date.', true); st.pins.push({ songId: s, date: d }); A.render(); };
    el.querySelectorAll('[data-unpin]').forEach(a => a.onclick = (e) => { e.preventDefault(); sync(); st.pins.splice(+a.dataset.unpin, 1); A.render(); });
    el.querySelector('#dRun').onclick = () => {
      sync();
      const res = L.distribute(p, { songIds: st.songs, reservePct: st.reserve, pins: st.pins, extraForNeedsMore: st.extra, revisionForReady: st.revise, allowOverload: st.allow });
      const out = el.querySelector('#dOut');
      out.innerHTML = `${res.warnings.length ? `<div class="banner warn"><ul class="list-plain">${res.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '<div class="banner info">Every selected song got the sessions it needs within the available time.</div>'}
        <div class="tw"><table class="t"><thead><tr><th>Session</th><th>Time available</th><th>Songs (proposed)</th><th style="text-align:right">Est. load</th></tr></thead><tbody>${res.sessions.map(x => `<tr><td>${U.fmtD(x.s.date)}<div class="small muted">${esc(x.s.start)}–${esc(x.s.end)} · target ${x.s.songTarget || '—'}</div></td><td class="num">${x.capMin} min</td><td>${x.rows.map(r => `<span class="pill ${r.locked ? '' : r.over ? 'bad' : 'info'}" style="margin:1px">${r.locked ? (r.pinned ? '📌 ' : '🔒 ') : ''}${esc(L.songTitle(r.songId))}${r.of > 1 ? ` (${r.rep}/${r.of})` : ''}</span>`).join(' ') || '<span class="muted small">—</span>'}</td><td class="n" style="color:var(--${x.usedMin > x.capMin ? 'bad' : 'fg'})">${x.usedMin} / ${x.capMin}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:10px"><button class="btn pri" id="dSave">Save these assignments</button><span class="small muted">Replaces unlocked, not-yet-rehearsed assignments on these future sessions.</span></div>`;
      out.querySelector('#dSave').onclick = async (e) => { e.target.disabled = true; try { await L.applyDistribution(p, res); st.pins = []; UI.toast('Song assignments saved'); A.render(); } catch (x) { UI.fail(x); e.target.disabled = false; } };
    };
  }

  // ---------- attendance overview for a plan ----------
  function planAttendance(el, p) {
    const ss = L.planSessions(p.id).filter(s => s.status === 'completed');
    const st = L.attStats(ss);
    el.innerHTML = `<div class="stats">${UI.stat(st.pct == null ? '—' : st.pct + '%', 'Attendance (recorded sessions)', { f: 'present+late ÷ expected participants' })}${UI.stat(st.recorded, 'Sessions with attendance')}${UI.stat(st.missing, 'Completed sessions without records', { tone: st.missing ? 'warn' : '' })}</div>` +
      UI.table([{ label: 'Date', f: s => U.fmtD(s.date) }, { label: 'Expected', n: 1, f: s => L.expectedMembers(s).length }, { label: 'Present', n: 1, f: s => { const a = St.get('attendance', s.id); return a && a.records ? Object.values(a.records).filter(v => v === 'P').length : '<span class="muted">no record</span>'; } }, { label: 'Late', n: 1, f: s => { const a = St.get('attendance', s.id); return a && a.records ? Object.values(a.records).filter(v => v === 'L').length : '—'; } }, { label: 'Absent / excused', n: 1, f: s => { const a = St.get('attendance', s.id); return a && a.records ? Object.values(a.records).filter(v => v === 'A' || v === 'E').length : '—'; } }, { label: '%', n: 1, f: s => { const x = L.attStats([s]); return x.pct == null ? '—' : x.pct + '%'; } }, { label: '', f: s => A.Auth.can('attendance') ? `<button class="btn sm" data-ci="${s.id}">Check-in</button>` : '' }], ss, { empty: 'No completed sessions yet. Record a session as held first.' });
    el.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => checkin(b.dataset.ci));
  }
  function planTasks(el, p) {
    const sids = new Set(L.planSessions(p.id).map(s => s.id));
    const ts = St.live('tasks').filter(t => t.linkType === 'session' && sids.has(t.linkId)).sort(U.by('due'));
    el.innerHTML = `<p class="small muted">Tasks linked to this plan's sessions. Open a session and choose "Practice tasks" to generate the standard checklist.</p>` + UI.table([{ label: 'Task', k: 'title' }, { label: 'Session', f: t => esc(L.linkLabel(t)) }, { label: 'Due', f: t => U.fmtD(t.due) }, { label: 'Assigned', f: t => (t.assignees || []).map(L.memberName).join(', ') || '—' }, { label: 'Status', f: t => (L.taskOverdue(t) ? '<span class="pill bad">Overdue</span> ' : '') + UI.pill(t.status, L.TASK_STATUS) }], ts, { click: 1, empty: 'No practice tasks yet.' });
    UI.bindRows(el, id => A.M.tasks.edit(St.get('tasks', id)));
  }

  // ---------- plan form ----------
  function editPlan(pre) {
    const rec = Object.assign({ year: +(St.cfg().year || 2027), status: 'active', approval: 'pending', reservePct: 15, songIds: [] }, pre || {});
    UI.edit({
      title: rec.id ? 'Edit practice plan' : 'New practice plan', fields: planFields(), rec, canEdit: canP(),
      validate: v => (v.target && v.start && v.target < v.start ? ['Target date must be after the start date.'] : []),
      onSave: async (v) => {
        const old = rec.id ? St.get('plans', rec.id) : null;
        if (!A.Auth.can('approve')) v.approval = (old && old.approval) || 'pending';
        const ev = v.eventId && St.get('events', v.eventId);
        const next = Object.assign({}, old || rec, v);
        if (ev && !next.target) next.target = ev.startDate;
        const col = v.collectionId && St.get('collections', v.collectionId);
        if (col) next.songIds = U.uniq([...(next.songIds || []), ...(col.songIds || [])]);
        if (ev) next.songIds = U.uniq([...(next.songIds || []), ...(ev.songIds || [])]);
        const saved = await St.put('plans', next);
        for (const id of saved.songIds || []) if (!L.readiness(saved.id, id)) await St.put('readiness', { id: L.rdId(saved.id, id), planId: saved.id, songId: id, stage: 'not_scheduled' }, { audit: false });
        if (ev && ev.planId !== saved.id && !ev.planId) await St.patch('events', ev.id, { planId: saved.id }, { audit: false });
        A.state.practice = Object.assign(A.state.practice || {}, { plan: saved.id, ptab: 'dash' });
        if (A.nav.mod === 'practice') A.render(); else A.go('practice', { plan: saved.id });
      },
      deleteFn: rec.id ? async () => { if (L.planSessions(rec.id).some(s => s.status === 'completed')) { await St.patch('plans', rec.id, { status: 'cancelled' }); UI.toast('Plan has completed sessions, so it was marked Cancelled to keep history.'); return; } for (const s of L.planSessions(rec.id)) await St.del('sessions', s.id, { audit: false }); for (const a of L.planAssign(rec.id)) await St.del('assignments', a.id, { audit: false }); for (const s of St.all('series').filter(x => x.planId === rec.id)) await St.del('series', s.id, { audit: false }); await St.del('plans', rec.id); A.state.practice.plan = ''; } : null,
    });
  }

  // ---------- single session ----------
  function newSingle(pre) {
    if (!St.all('plans').length) { UI.toast('Create a practice plan first. Single practices belong to a plan.', true); return editPlan(); }
    const p = pre && pre.planId && St.get('plans', pre.planId);
    const rec = Object.assign({ start: '17:30', end: '19:30', breakMin: 0, songTarget: 3, status: 'scheduled', sections: p ? p.sections || [] : [] }, pre || {});
    const fs = sessFields(rec);
    UI.edit({
      title: 'Single practice session', fields: fs, rec, canEdit: canP(), validate: v => (U.gross(v.start, v.end) === 0 ? ['End time must differ from start time.'] : []),
      after: (b) => { liveDuration(b); UI.slotPicker(b, (sl, set, setM) => { set('start', sl.start); set('end', sl.end); set('breakMin', sl.breakMin || 0); set('venue', sl.venue || ''); if (sl.leaderId) set('leaderId', sl.leaderId); if ((sl.sections || []).length) setM('sections', sl.sections); }); },
      onSave: async (v) => {
        const s = Object.assign({ status: 'scheduled', detached: false }, rec, v);
        const cf = L.conflicts('session', s);
        if (cf.length && !(await UI.confirm(`<b>Conflicts:</b> ${cf.map(c => esc(c.title + ' (' + U.fmtDs(c.date) + ': ' + c.why.join(', ') + ')')).join('; ')}<br>Save anyway?`, { ok: 'Save anyway' }))) return false;
        const saved = await St.put('sessions', s, { summary: 'Practice ' + s.date });
        UI.toast(`Saved: ${L.sessNet(saved)} min net practice, ${saved.songTarget || 0} song target`);
        setTimeout(() => editSession(St.get('sessions', saved.id), 'songs'), 60);
      },
    });
  }
  function liveDuration(b) {
    const out = document.createElement('div'); out.className = 'calc'; out.style.marginTop = '8px'; b.appendChild(out);
    const upd = () => { const s = b.querySelector('[name=start]'), e = b.querySelector('[name=end]'), br = b.querySelector('[name=breakMin]'); if (!s || !e) return; const g = U.gross(s.value, e.value); const n = U.net(s.value, e.value, br ? br.value : 0); out.textContent = g == null ? '' : `Duration ${g} min − break ${br ? +br.value || 0 : 0} min = net practice ${n} min (${(n / 60).toFixed(2)} h)`; };
    b.addEventListener('input', upd); upd();
  }

  // ---------- recurring series ----------
  function newSeries(p, existing) {
    if (!p) return UI.toast('Open a practice plan first.', true);
    const sr = existing ? Object.assign({}, existing) : { id: U.uid('se_'), planId: p.id, title: 'Weekly rehearsal', start: p.start || U.today(), end: L.planTargetDate(p) ? U.addDays(L.planTargetDate(p), -1) : '', freq: 'custom', weekdays: [2, 4, 6], startTime: '17:30', endTime: '19:30', breakMin: 10, songTarget: 3, venue: '', sections: p.sections || [], exclusions: [], skipHolidays: true };
    const fs = [
      { k: 'title', label: 'Series title', full: true }, { k: 'start', label: 'Start date', type: 'date', req: true }, { k: 'end', label: 'End date', type: 'date', req: true },
      { k: 'freq', label: 'Frequency', type: 'select', options: L.FREQ, blank: false }, { k: 'weekdays', label: 'Weekdays (weekly, every two weeks, custom)', type: 'multi', options: WD.map(([a, b]) => [String(a), b]) },
      { k: 'startTime', label: 'Start time', type: 'time', req: true }, { k: 'endTime', label: 'End time', type: 'time', req: true }, { k: 'breakMin', label: 'Break (minutes)', type: 'number', min: 0 },
      { k: 'songTarget', label: 'Default song target per session', type: 'number', min: 0 }, { k: 'venue', label: 'Venue' }, { k: 'leaderId', label: 'Practice leader', type: 'select', options: UI.opt.members() },
      { k: 'sections', label: 'Participating sections', type: 'multi', options: UI.opt.sections() },
      { k: 'exclusions', label: 'Excluded dates (YYYY-MM-DD, one per line)', type: 'list' }, { k: 'skipHolidays', label: 'Skip choir holidays (Settings)', type: 'checkbox' },
    ];
    const rec = Object.assign({}, sr, { weekdays: (sr.weekdays || []).map(String) });
    const extra = existing && canP() ? [{ label: 'End series early', onClick: () => setTimeout(() => endSeries(existing), 50) }] : [];
    UI.edit({
      title: existing ? 'Edit recurring series (entire series)' : 'Recurring practice', fields: fs, rec, canEdit: canP(), extra, after: (b) => {
        const s = b.querySelector('[name=startTime]'), e = b.querySelector('[name=endTime]'), br = b.querySelector('[name=breakMin]');
        const out = document.createElement('div'); out.className = 'calc'; b.appendChild(out);
        const upd = () => { const n = U.net(s.value, e.value, br.value); out.textContent = n == null ? '' : `Each session: ${U.gross(s.value, e.value)} min − ${+br.value || 0} min break = ${n} min net`; };
        b.addEventListener('input', upd); upd();
        UI.slotPicker(b, (sl, set, setM) => { set('title', sl.name); set('startTime', sl.start); set('endTime', sl.end); set('breakMin', sl.breakMin || 0); set('venue', sl.venue || ''); if (sl.leaderId) set('leaderId', sl.leaderId); setM('weekdays', sl.weekdays || []); if ((sl.sections || []).length) setM('sections', sl.sections); const fq = b.querySelector('[name=freq]'); if (fq) fq.value = sl.freq === 'biweekly' ? 'biweekly' : 'custom'; sr.slotId = sl.id; }, 'Use an available time from the schedule');
      },
      validate: v => { const e = []; if (v.end < v.start) e.push('End date must be after start date.'); (v.exclusions || []).forEach(d => { if (!U.validDate(d)) e.push(`"${d}" is not a valid date (use YYYY-MM-DD).`); }); if (['weekly', 'biweekly', 'custom'].includes(v.freq) && !(v.weekdays || []).length) e.push('Choose at least one weekday.'); if (U.diffDays(v.start, v.end) > 731) e.push('A series can span at most two years.'); return e; },
      onSave: async (v) => {
        const next = Object.assign({}, sr, v, { weekdays: (v.weekdays || []).map(Number), planId: p.id });
        const pv = L.previewSeries(next);
        if (!pv.dates.length) { UI.toast('That pattern produces no dates.', true); return false; }
        const ok = await previewDialog(next, pv, !!existing);
        if (!ok) return false;
        const r = await L.saveSeries(next);
        if (existing) { // apply time/venue/target changes to existing, not individually edited, scheduled occurrences
          for (const s of St.all('sessions').filter(x => x.seriesId === next.id && !x.detached && x.status === 'scheduled')) await St.patch('sessions', s.id, { start: next.startTime, end: next.endTime, breakMin: +next.breakMin || 0, venue: next.venue, songTarget: +next.songTarget || 0, sections: next.sections, leaderId: next.leaderId || '', title: next.title }, { audit: false });
        }
        L.notifyChange(existing ? 'Practice series updated' : 'Practice series created', next.title || p.name, `${r.created} new session(s), ${r.existing} already existed${r.cancelled ? `, ${r.cancelled} cancelled` : ''}`, ['practice', p.id]);
        UI.toast(`${r.created} session(s) created · ${r.existing} already existed (no duplicates)${r.cancelled ? ` · ${r.cancelled} cancelled` : ''}`);
      },
    });
  }
  function previewDialog(sr, pv, isEdit) {
    return new Promise(res => {
      let done = false;
      const net = U.net(sr.startTime, sr.endTime, sr.breakMin);
      const hol = new Set((St.cfg().holidays || []).map(h => h.date));
      const body = `<div class="stats">${UI.stat(pv.dates.length, 'Occurrences')}${UI.stat(pv.toCreate.length, 'New sessions to create')}${UI.stat(pv.existing.length, 'Already exist (kept)')}${UI.stat(U.hrs(net * pv.dates.length), 'Planned hours', { f: `${pv.dates.length} × ${net} min net` })}${UI.stat(U.uniq(pv.dates).length, 'Practice days')}</div>
        ${(sr.exclusions || []).length || sr.skipHolidays ? `<p class="small">Excluded: ${(sr.exclusions || []).map(U.fmtDs).join(', ') || 'none'}${sr.skipHolidays ? ` · holidays skipped: ${[...hol].filter(d => d >= sr.start && d <= sr.end).map(U.fmtDs).join(', ') || 'none in range'}` : ''}</p>` : ''}
        ${pv.orphans.filter(o => o.status === 'scheduled' && !o.detached).length ? `<div class="banner warn">${pv.orphans.filter(o => o.status === 'scheduled' && !o.detached).length} existing session(s) no longer match the pattern and will be marked cancelled (kept on record).</div>` : ''}
        <div class="tw" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th>#</th><th>Date</th><th>Time</th><th>Net</th><th>Songs</th><th></th></tr></thead><tbody>${pv.rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${U.fmtD(r.date)}</td><td class="mono">${esc(sr.startTime)}–${esc(sr.endTime)}</td><td class="num">${net} min</td><td class="num">${sr.songTarget || 0}</td><td>${r.exists ? '<span class="pill">exists</span>' : '<span class="pill info">new</span>'}</td></tr>`).join('')}</tbody></table></div>`;
      UI.modal({ title: 'Preview sessions before saving', wide: true, body, onClose: () => { if (!done) res(false); }, buttons: [{ label: 'Back', onClick: () => { done = true; res(false); } }, { label: isEdit ? 'Update series' : `Create ${pv.toCreate.length} session(s)`, cls: 'pri', onClick: () => { done = true; res(true); } }] });
    });
  }
  async function endSeries(sr) {
    const d = await new Promise(res => { UI.modal({ title: 'End series early', body: `<label class="small">Last date of the series<input type="date" id="esD" value="${U.today()}"></label><p class="small muted">Scheduled sessions after this date are cancelled (kept on record). Completed sessions are never changed.</p>`, buttons: [{ label: 'Cancel', onClick: () => res(null) }, { label: 'End series', cls: 'danger', onClick: ({ body }) => res(body.querySelector('#esD').value) }], onClose: () => res(null) }); });
    if (!U.validDate(d || '')) return;
    try { await L.saveSeries(Object.assign({}, sr, { end: d })); UI.toast('Series ended on ' + U.fmtD(d)); } catch (e) { UI.fail(e); }
  }

  // ---------- session editor ----------
  function editSession(s, tab) {
    if (!s) return;
    const p = St.get('plans', s.planId) || {};
    let cur = tab || 'details';
    const m = UI.modal({ title: `Practice · ${U.fmtD(s.date)}`, wide: true, body: '<div class="tabs" id="seTabs"></div><div id="seBody"></div>', buttons: [{ label: 'Close' }] });
    const draw = () => {
      s = St.get('sessions', s.id) || s;
      const tb = m.body.querySelector('#seTabs');
      tb.innerHTML = [['details', 'Details'], ['songs', 'Songs (' + L.sessAssign(s.id).length + ')'], ['record', 'Record session'], ['tasks', 'Practice tasks']].map(([k, t]) => `<button data-t="${k}" class="${cur === k ? 'on' : ''}">${t}</button>`).join('');
      tb.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { cur = b.dataset.t; draw(); });
      const el = m.body.querySelector('#seBody');
      ({ details: sDetails, songs: sSongs, record: sRecord, tasks: sTasks })[cur](el, s, p, draw, m);
    };
    draw();
  }
  function sDetails(el, s, p, draw, m) {
    const fs = sessFields(s, !!s.seriesId); const can = canP() && s.status !== 'completed';
    const sl = L.sessSlots(s);
    el.innerHTML = `<div class="row" style="margin-bottom:8px">${UI.pill(s.status, L.SESSION_STATUS)} ${s.seriesId ? '<span class="pill">Recurring series</span>' : '<span class="pill">Single session</span>'} ${s.detached ? '<span class="pill">Edited separately</span>' : ''}<span class="small muted">Plan: ${esc(p.name || '—')} · scheduled net ${L.sessNet(s)} min · planned songs ${sl.n} (${sl.explicit ? 'from assigned list' : 'numeric target'})</span></div>` + UI.form(fs, s) +
      `<div class="row" style="margin-top:10px">${can ? '<button class="btn pri" id="sdSave">Save changes</button>' : ''}${canP() && s.status === 'scheduled' ? '<button class="btn danger" id="sdCancel">Cancel this session</button>' : ''}${canP() && s.status === 'cancelled' ? '<button class="btn" id="sdRestore">Restore session</button>' : ''}${canP() && !s.seriesId && s.status !== 'completed' ? '<button class="btn danger" id="sdDel">Delete</button>' : ''}</div>${s.status === 'completed' ? '<p class="small muted">Completed sessions are locked. Use Record session to correct the actual figures.</p>' : ''}`;
    if (!can) el.querySelectorAll('form input,form select,form textarea').forEach(x => x.disabled = true);
    liveDuration(el);
    const on = (id, fn) => { const b = el.querySelector(id); if (b) b.onclick = async () => { try { await fn(); } catch (e) { UI.fail(e); } }; };
    on('#sdSave', async () => {
      const { vals, errs } = UI.read(el, fs); if (!UI.showErr(el, errs)) return;
      const changes = {}; Object.keys(vals).forEach(k => { if (JSON.stringify(vals[k] ?? '') !== JSON.stringify(s[k] ?? '')) changes[k] = vals[k]; });
      if (!Object.keys(changes).length) return UI.toast('No changes');
      const next = Object.assign({}, s, changes); const cf = L.conflicts('session', next);
      if (cf.length && !(await UI.confirm(`<b>Conflicts:</b> ${cf.map(c => esc(c.title + ' (' + c.why.join(', ') + ')')).join('; ')}<br>Save anyway?`, { ok: 'Save anyway' }))) return;
      let scope = 'one';
      if (s.seriesId && !s.detached) scope = await askScope(!!changes.date);
      if (!scope) return;
      const r = await L.editOccurrence(s, changes, scope);
      if (changes.date || changes.start || changes.venue) L.notifyChange('Practice changed', s.title || p.name || 'Practice', [changes.date ? `${U.fmtD(s.date)} → ${U.fmtD(changes.date)}` : '', changes.start ? `start ${s.start} → ${changes.start}` : '', changes.venue ? `venue → ${changes.venue}` : ''].filter(Boolean).join('; ') + (scope !== 'one' ? ` (${scope === 'all' ? 'entire series' : 'this and future sessions'})` : ''), ['practice', s.planId]);
      UI.toast('Saved' + (r && r.lost ? ` · ${r.lost} song assignment(s) on dates no longer in the series were removed` : ''));
      if (scope === 'future') m.close(); else draw();
    });
    on('#sdCancel', async () => { if (!(await UI.confirm('Cancel this practice session? It stays on record and is excluded from practice counts.', { ok: 'Cancel session', danger: true }))) return; await St.patch('sessions', s.id, { status: 'cancelled', detached: !!s.seriesId }); L.notifyChange('Practice cancelled', s.title || p.name || 'Practice', U.fmtD(s.date), ['practice', s.planId]); draw(); });
    on('#sdRestore', async () => { await St.patch('sessions', s.id, { status: 'scheduled' }); draw(); });
    on('#sdDel', async () => { if (!(await UI.confirm('Delete this session and its song assignments?', { ok: 'Delete', danger: true }))) return; for (const a of L.sessAssign(s.id)) await St.del('assignments', a.id, { audit: false }); await St.del('sessions', s.id); m.close(); });
  }
  function askScope(dateChanged) {
    return new Promise(res => {
      let done = false; const fin = (v) => { done = true; res(v); };
      UI.modal({ title: 'Apply changes to…', body: `<p>This session is part of a recurring series.</p>${dateChanged ? '<p class="small muted">A date change applies to this session only.</p>' : ''}`, onClose: () => { if (!done) res(null); }, buttons: [{ label: 'Cancel', onClick: () => fin(null) }, { label: 'This session only', cls: 'pri', onClick: () => fin('one') }, ...(dateChanged ? [] : [{ label: 'This and future sessions', onClick: () => fin('future') }, { label: 'Entire series', onClick: () => fin('all') }])] });
    });
  }
  function sSongs(el, s, p, draw) {
    const as = L.sessAssign(s.id).sort(U.by('songId')); const can = canP(); const net = L.sessNet(s) || 0;
    const load = as.reduce((t, a) => t + L.songEst(s.planId, a.songId).min, 0);
    const planIds = L.planSongIds(p);
    el.innerHTML = `<p class="small">Song target: <b>${s.songTarget || 0}</b> · assigned: <b>${as.length}</b> → planned song-practice slots: <b>${L.sessSlots(s).n}</b> <span class="muted">(${as.length ? 'the assigned list is used; the numeric target is not added on top' : 'numeric target only, counted as workload, not verified repertoire'})</span></p>
      <p class="small">Estimated time for assigned songs: <b class="num">${load} min</b> of <b class="num">${net} min</b> net ${load > net ? '<span class="pill bad">exceeds available time</span>' : ''}</p>
      ${as.length ? `<details style="margin:8px 0"><summary class="small" style="cursor:pointer;font-weight:700">Run sheet for this session</summary><div style="margin-top:8px">${A.SP.runsheets([{ s, ids: as.map(a => a.songId) }], s.planId, p.warmupMin ?? 10, () => L.planColor(s.planId))}</div></details>` : ''}
      ${UI.table([{ label: 'Song', f: a => esc(L.songTitle(a.songId)) }, { label: 'Stage', f: a => UI.pill(L.stage(s.planId, a.songId), L.STAGES) }, { label: 'Est. min', n: 1, f: a => L.songEst(s.planId, a.songId).min }, { label: 'Locked', f: a => `<input type="checkbox" data-lock="${a.id}" ${a.locked ? 'checked' : ''} ${can ? '' : 'disabled'} aria-label="Locked">` }, { label: 'Rehearsed', f: a => `<input type="checkbox" data-done="${a.id}" ${a.done ? 'checked' : ''} ${A.Auth.can('attendance') || can ? '' : 'disabled'} aria-label="Rehearsed">` }, { label: '', f: a => can ? `<button class="btn sm danger" data-rm="${a.id}">Remove</button>` : '' }], as, { empty: 'No specific songs assigned.' })}
      ${can ? `<div class="row" style="margin-top:8px"><label class="small" style="flex:1;min-width:220px">Add song ${UI.sel('ssAdd', [...planIds.map(id => [id, '★ ' + L.songTitle(id)]), ...UI.opt.songs().filter(([id]) => !planIds.includes(id))].filter(([id]) => !as.some(a => a.songId === id)), '', 'Choose (★ = in plan repertoire)…')}</label></div>` : ''}`;
    const run = (fn) => async (e) => { try { await fn(e); draw(); } catch (x) { UI.fail(x); } };
    el.querySelectorAll('[data-lock]').forEach(c => c.onchange = run(() => St.patch('assignments', c.dataset.lock, { locked: c.checked }, { audit: false })));
    el.querySelectorAll('[data-done]').forEach(c => c.onchange = run(() => St.patch('assignments', c.dataset.done, { done: c.checked }, { audit: false })));
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = run(() => St.del('assignments', b.dataset.rm, { audit: false })));
    const add = el.querySelector('#ssAdd');
    if (add) add.onchange = run(async () => {
      const songId = add.value; if (!songId) return; const id = s.id + '__' + songId;
      if (St.get('assignments', id)) return UI.toast('That song is already assigned to this session.', true);
      await St.put('assignments', { id, sessionId: s.id, planId: s.planId, songId, locked: true, done: false, minutes: L.songEst(s.planId, songId).min }, { audit: false });
      if (!planIds.includes(songId)) await addSongs(St.get('plans', s.planId), [songId]);
      else if (!L.readiness(s.planId, songId)) await St.put('readiness', { id: L.rdId(s.planId, songId), planId: s.planId, songId, stage: 'not_scheduled' }, { audit: false });
    });
  }
  function sRecord(el, s, p, draw) {
    const can = A.Auth.can('attendance') || canP(); const r = s.report || {}; const act = s.actual || {};
    const as = L.sessAssign(s.id);
    const fs = [
      { k: 'occurred', label: 'Did the session take place?', type: 'select', options: [['yes', 'Yes, it took place'], ['no', 'No, it was cancelled']], req: true },
      { k: 'aStart', label: 'Actual start time', type: 'time' }, { k: 'aEnd', label: 'Actual finish time', type: 'time' }, { k: 'aBreak', label: 'Actual breaks (minutes)', type: 'number', min: 0 },
      ...(as.length ? [] : [{ k: 'actualSongs', label: 'Number of songs rehearsed', type: 'number', min: 0, hint: 'Used only because no specific songs were assigned.' }]),
      { k: 'progress', label: 'Progress made', type: 'textarea' }, { k: 'attention', label: 'Songs / sections requiring more attention', type: 'textarea' },
      { k: 'nextNotes', label: 'Notes for the next session', type: 'textarea' }, { k: 'issues', label: 'Equipment or logistical issues', type: 'textarea' },
      { k: 'followups', label: 'Follow-up tasks (one per line, created as tasks)', type: 'list', full: true },
    ];
    const vals = { occurred: s.status === 'cancelled' ? 'no' : s.status === 'completed' ? 'yes' : '', aStart: act.start || s.start, aEnd: act.end || s.end, aBreak: act.breakMin ?? s.breakMin, actualSongs: s.actualSongs, progress: r.progress, attention: r.attention, nextNotes: r.nextNotes, issues: r.issues };
    const att = St.get('attendance', s.id);
    el.innerHTML = `${s.date > U.today() ? '<div class="banner info">This session is in the future. Record it after it happens.</div>' : ''}
      <p class="small">Scheduled: ${esc(s.start)}–${esc(s.end)} − ${s.breakMin || 0} min break = <b>${L.sessNet(s)} min</b> planned. ${L.sessActualNet(s) != null ? `Actual recorded: <b>${L.sessActualNet(s)} min</b>.` : 'No actual time recorded yet.'}</p>
      ${UI.form(fs, vals)}
      ${as.length ? `<p class="small" style="margin-top:8px">Songs rehearsed: tick them on the Songs tab (${as.filter(a => a.done).length}/${as.length} ticked).</p>` : ''}
      <p class="small">Attendance: ${att && att.records ? `<b>${Object.values(att.records).filter(v => v === 'P' || v === 'L').length}</b> present of ${L.expectedMembers(s).length} expected` : '<span class="muted">not recorded</span>'} <button class="btn sm" id="srAtt" ${can ? '' : 'disabled'}>Open check-in</button></p>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="srSave" ${can ? '' : 'disabled'}>Save session record</button></div>`;
    el.querySelector('#srAtt').onclick = () => checkin(s.id);
    el.querySelector('#srSave').onclick = async () => {
      const { vals: v, errs } = UI.read(el, fs); if (!UI.showErr(el, errs)) return;
      try {
        if (v.occurred === 'no') { await St.patch('sessions', s.id, { status: 'cancelled', detached: !!s.seriesId, report: Object.assign({}, r, { progress: v.progress, issues: v.issues }), cancelReason: 'Did not take place' }); }
        else {
          if (!v.aStart || !v.aEnd) { UI.showErr(el, ['Enter the actual start and finish times.']); return; }
          await St.patch('sessions', s.id, { status: 'completed', actual: { start: v.aStart, end: v.aEnd, breakMin: +v.aBreak || 0 }, actualSongs: v.actualSongs ?? null, report: { progress: v.progress, attention: v.attention, nextNotes: v.nextNotes, issues: v.issues }, recordedBy: A.Auth.uid || null });
        }
        for (const t of v.followups || []) await St.put('tasks', { title: t, linkType: 'session', linkId: s.id, due: U.addDays(s.date, 7), status: 'not_started', priority: 'medium', pct: 0, assignees: [], deptId: '' });
        UI.toast('Session recorded'); draw();
      } catch (e) { UI.fail(e); }
    };
  }
  const PRACTICE_TASKS = [['Distribute song materials', -3], ['Prepare instrumental arrangements', -5], ['Share rehearsal recordings', -2], ['Confirm venue access', -2], ['Prepare microphones and equipment', -1], ['Review difficult song sections', -1], ['Follow up with absent section members', 2]];
  function sTasks(el, s, p, draw) {
    const ts = St.live('tasks').filter(t => t.linkType === 'session' && t.linkId === s.id);
    el.innerHTML = `${UI.table([{ label: 'Task', k: 'title' }, { label: 'Due', f: t => U.fmtD(t.due) }, { label: 'Status', f: t => UI.pill(t.status, L.TASK_STATUS) }], ts, { click: 1, empty: 'No tasks for this session.' })}
      ${A.Auth.can('tasks_all') || canP() ? `<h3 style="margin-top:12px">Generate optional tasks</h3><div class="checks" style="max-height:none">${PRACTICE_TASKS.map(([t, d], i) => `<label><input type="checkbox" data-pt="${i}"> ${esc(t)} <span class="muted small">(${d < 0 ? -d + ' day(s) before' : d + ' day(s) after'})</span></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label class="small">Assign to ${UI.sel('ptWho', UI.opt.members(), s.leaderId || '', 'Unassigned')}</label><button class="btn pri" id="ptGo">Create selected tasks</button></div>` : ''}`;
    UI.bindRows(el, id => A.M.tasks.edit(St.get('tasks', id)));
    const go = el.querySelector('#ptGo');
    if (go) go.onclick = async () => { try { const who = el.querySelector('#ptWho').value; const dept = (St.live('departments').find(d => /Music/.test(d.name)) || {}).id || ''; let n = 0; for (const c of el.querySelectorAll('[data-pt]:checked')) { const [t, d] = PRACTICE_TASKS[+c.dataset.pt]; await St.put('tasks', { title: t + ' (' + U.fmtDs(s.date) + ')', linkType: 'session', linkId: s.id, due: U.addDays(s.date, d), start: U.addDays(s.date, d - 5), status: 'not_started', priority: 'medium', pct: 0, assignees: who ? [who] : [], deptId: dept }); n++; } UI.toast(`Created ${n} task(s)`); draw(); } catch (e) { UI.fail(e); } };
  }

  // ---------- mobile check-in ----------
  function checkinPick(el) {
    const today = U.today();
    const ss = St.all('sessions').filter(s => s.status !== 'cancelled' && U.diffDays(s.date, today) >= 0 && U.diffDays(s.date, today) <= 7).sort(U.by(s => s.date + s.start, -1));
    el.innerHTML = `<p class="small muted">Pick a session from today or the past week to take attendance.</p>` + (ss.length ? ss.map(s => `<button class="btn" style="display:flex;width:100%;justify-content:space-between;margin-bottom:6px;padding:12px" data-ci="${s.id}"><span>${U.fmtD(s.date)} · ${esc(s.start)}</span><span class="muted">${esc(s.title || (St.get('plans', s.planId) || {}).name || '')}</span></button>`).join('') : '<div class="empty">No sessions today or in the past week.</div>');
    el.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => checkin(b.dataset.ci));
  }
  function checkin(sid) {
    const s = St.get('sessions', sid); if (!s) return;
    const can = A.Auth.can('attendance') || canP();
    const exp = L.expectedMembers(s); const extra = St.live('members').filter(m => !exp.includes(m.id) && m.status !== 'inactive');
    const at = St.get('attendance', sid); const rec = Object.assign({}, (at && at.records) || {});
    const row = (m) => `<div class="m"><span class="nm">${esc(m.name)}<span class="small muted"> ${(m.sections || []).join('/')}</span></span>${['P', 'L', 'A', 'E'].map(k => `<button class="btn ${k} ${rec[m.id] === k ? 'on' : ''}" data-m="${m.id}" data-v="${k}" title="${{ P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' }[k]}" ${can ? '' : 'disabled'}>${k}</button>`).join('')}</div>`;
    const body = document.createElement('div'); body.className = 'checkin';
    const paint = () => {
      const n = exp.filter(id => rec[id] === 'P' || rec[id] === 'L').length;
      body.innerHTML = `<p class="small">${U.fmtD(s.date)} · ${esc(s.start)}–${esc(s.end)} · expected ${exp.length} (sections: ${(s.sections || []).join(', ') || 'all'}) · <b>${n} present</b> · ${exp.filter(id => !rec[id]).length} not marked</p>
        <div class="row" style="margin-bottom:8px">${can ? '<button class="btn sm" id="ciAllP">Mark unmarked as present</button>' : ''}<span class="small muted">P present · L late · A absent · E excused</span></div>
        ${exp.map(id => St.get('members', id)).filter(Boolean).map(row).join('') || '<div class="empty">No expected participants. Add sections or members to the session.</div>'}
        ${extra.length ? `<details style="margin-top:10px"><summary class="small">Other members (visitors / not in planned sections)</summary>${extra.map(row).join('')}</details>` : ''}`;
      body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const k = b.dataset.m; rec[k] = rec[k] === b.dataset.v ? undefined : b.dataset.v; if (!rec[k]) delete rec[k]; paint(); });
      const all = body.querySelector('#ciAllP'); if (all) all.onclick = () => { exp.forEach(id => { if (!rec[id]) rec[id] = 'P'; }); paint(); };
    };
    paint();
    UI.modal({ title: 'Practice check-in', body, buttons: [{ label: 'Close' }, ...(can ? [{ label: 'Save attendance', cls: 'pri', onClick: async () => { await St.put('attendance', { id: sid, sessionId: sid, records: rec }, { summary: 'Attendance ' + s.date }); UI.toast('Attendance saved'); } }] : [])] });
  }
})(window.App);
