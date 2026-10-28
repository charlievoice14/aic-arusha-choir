/* pdf.js — PDF Studio: report models from saved data, HTML preview, genuine PDF generation with jsPDF + AutoTable */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const P = A.PDF = {};

  P.TYPES = [
    ['calendar', 'Visual calendar', 'Choir_Calendar'], ['eventcal', 'Detailed event calendar', 'Choir_Event_Calendar'], ['workplan', 'Annual work-plan', 'Choir_Annual_Workplan'],
    ['deptplan', 'Department work-plan', 'Choir_Department_Workplan'], ['tasks', 'Task & deadline report', 'Choir_Tasks'], ['itinerary', 'Travel itinerary', 'Choir_Travel_Itinerary'], ['seating', 'Travel seating plan', 'Choir_Seating_Plan'],
    ['brief', 'Event brief', 'Choir_Event_Brief'], ['timetable', 'Practice timetable', 'Choir_Practice_Plan'], ['pcal', 'Practice calendar (visual)', 'Choir_Practice_Calendar'],
    ['assign', 'Song assignment schedule', 'Choir_Song_Assignments'], ['attendance', 'Practice attendance report', 'Choir_Practice_Report'], ['readiness', 'Song readiness report', 'Choir_Song_Readiness'],
    ['hours', 'Planned vs actual practice hours', 'Choir_Practice_Report'], ['workload', 'Remaining practice workload', 'Choir_Practice_Report'], ['ptasks', 'Practice task & deadline report', 'Choir_Practice_Tasks'],
    ['songplan', 'Song practice planner', 'Choir_Song_Planner'], ['prep', 'Event preparation plan', 'Choir_Event_Preparation'], ['annual', 'Annual activity & evaluation report', 'Choir_Annual_Report'], ['finance', 'Finance report (AAC Finance Manager)', 'AAC_Finance_Report'],
  ];
  const NEEDS = { brief: 'event', prep: 'plan', deptplan: 'dept', songplan: 'plan', seating: 'leg' };
  P.defaults = () => ({ type: 'calendar', period: { kind: 'quarter', year: 2027, q: 1, m: 1 }, orient: 'auto', cover: true, sec: { events: true, travel: true, tasks: true, plans: true, practice: true, songs: false }, dept: '', eventId: '', planId: '', simulateFail: false });
  P.periodToken = (p) => { const y = +p.year || 2027; if (p.kind === 'quarter') return `${y}_Q${p.q || 1}`; if (p.kind === 'month') return `${y}_${U.MON[(+p.m || 1) - 1]}`; if (p.kind === 'custom') { const [a, b] = U.period(p); return `${y}_${a.slice(5).replace('-', '')}-${b.slice(5).replace('-', '')}`; } return String(y); };
  P.filename = (o) => {
    const t = P.TYPES.find(x => x[0] === o.type); const base = t ? t[2] : 'Choir_Report';
    if (o.type === 'finance') return `${base}_${U.today()}.pdf`;
    if (o.type === 'seating') { const t = St.get('travel', o.legId) || {}; const e = St.get('events', t.eventId) || {}; return `${base}_${U.slug(e.title || 'event').slice(0, 30)}_${t.dir || 'leg'}_${(t.departDate || '').replace(/-/g, '')}.pdf`; }
    if (o.type === 'songplan') { const p = St.get('plans', o.planId); return `${base}_${o.period.year || 2027}_${U.slug((p && p.name) || 'plan').slice(0, 40)}.pdf`; }
    if (o.type === 'prep' || o.type === 'workplan' || o.type === 'annual') return `${base}_${o.period.year || 2027}.pdf`;
    if (o.type === 'brief') { const e = St.get('events', o.eventId); return `${base}_${U.slug((e && (e.code || e.title)) || 'event')}.pdf`; }
    if (o.type === 'deptplan') return `${base}_${o.period.year || 2027}_${U.slug(L.deptName(o.dept))}.pdf`;
    return `${base}_${P.periodToken(o.period)}.pdf`;
  };

  // ---------- model builders (all read saved records at call time) ----------
  const fin = () => A.Auth.has('finance') || St.mode === 'local';
  const evIn = (a, b, o) => St.live('events').filter(e => e.startDate && U.overlapRange(e.startDate, e.endDate || e.startDate, a, b) && (!o.dept || (e.depts || []).includes(o.dept)) && (!o.eventId || e.id === o.eventId)).sort(U.by(e => e.startDate + (e.startTime || '')));
  const sessIn = (a, b, o) => St.all('sessions').filter(s => U.inRange(s.date, a, b) && (!o.planId || s.planId === o.planId) && (!o.eventId || (St.get('plans', s.planId) || {}).eventId === o.eventId)).sort(U.by(s => s.date + s.start));
  const tasksIn = (a, b, o) => St.live('tasks').filter(t => t.due && U.inRange(t.due, a, b) && (!o.dept || t.deptId === o.dept) && (!o.eventId || (t.linkType === 'event' && t.linkId === o.eventId))).sort(U.by('due'));
  const legsIn = (a, b, o) => St.all('travel').filter(t => (!t.departDate || U.inRange(t.departDate, a, b)) && (!o.eventId || t.eventId === o.eventId)).sort(U.by(t => (t.departDate || '') + (t.departTime || '')));
  const evRow = (e) => [e.code || '', e.title, `${U.fmtD(e.startDate)} ${e.startTime || ''}${e.endDate && e.endDate !== e.startDate ? ' - ' + U.fmtD(e.endDate) : ''}${e.endTime ? ' to ' + e.endTime : ''}`, e.venue || '-', L.label(L.EVENT_STATUS, e.status), L.label(L.APPROVAL, e.approval || 'pending'), L.label(L.HOSTCONF, e.hostConf || 'not_required')];
  const legRow = (t) => [(St.get('events', t.eventId) || {}).title || '-', t.dir === 'return' ? 'Return' : t.dir === 'other' ? 'Other' : 'Outbound', `${U.fmtD(t.departDate)} ${t.departTime || '(time missing)'}`, `${t.from || '?'} -> ${t.to || '?'}`, t.arriveDate ? `${U.fmtD(t.arriveDate)} ${t.arriveTime || ''}` : '-', [t.mode, t.provider].filter(Boolean).join(' / ') || '-', t.booking || '(none entered)', t.confirmed ? 'Confirmed' : 'UNCONFIRMED', L.memberName(t.coordinatorId)];
  const LEG_HEAD = ['Event', 'Leg', 'Departure', 'Route', 'Arrival', 'Mode / provider', 'Booking ref.', 'Status', 'Coordinator'];
  const taskRow = (t) => [U.fmtD(t.due), t.title, L.deptName(t.deptId), (t.assignees || []).map(L.memberName).join(', ') || '-', L.label(L.PRIORITY, t.priority), L.label(L.TASK_STATUS, t.status) + (L.taskOverdue(t) ? ' (OVERDUE)' : ''), (t.pct || 0) + '%', L.linkLabel(t) || '-'];
  const TASK_HEAD = ['Deadline', 'Task', 'Department', 'Assigned', 'Priority', 'Status', 'Done', 'Linked to'];
  const sessRow = (s, withSongs) => { const p = St.get('plans', s.planId) || {}; const sl = L.sessSlots(s); const as = L.sessAssign(s.id); return [U.fmtD(s.date), `${s.start || ''}-${s.end || ''}`, `${L.sessNet(s) ?? '-'} min${s.breakMin ? ' (break ' + s.breakMin + ')' : ''}`, s.venue || '-', p.name || '-', `${sl.n}${sl.explicit ? '' : ' (target)'}`, ...(withSongs ? [as.map(a => L.songTitle(a.songId)).join(', ') || '-'] : []), L.label(L.SESSION_STATUS, s.status) + (L.sessActualNet(s) != null ? ` (actual ${L.sessActualNet(s)} min)` : '')]; };
  const SESS_HEAD = (withSongs) => ['Date', 'Time', 'Net duration', 'Venue', 'Plan', 'Songs', ...(withSongs ? ['Song assignments'] : []), 'Status'];

  function calBlocks(a, b, o, onlyPractice) {
    const blocks = []; let y = +a.slice(0, 4), m = +a.slice(5, 7);
    const show = onlyPractice ? { event: false, rehearsal: false, practice: true, deadline: false, travel: false } : { event: true, rehearsal: true, practice: o.sec.practice, deadline: o.sec.tasks, activity: o.sec.plans !== false, travel: o.sec.travel };
    const items = L.calItems(a, b, { show, dept: o.dept, event: o.eventId });
    const ssAll = sessIn(a, b, o).filter(L.eligible);
    blocks.push({ stats: [['Events', items.filter(i => i.kind === 'event' || i.kind === 'rehearsal').length, '#6c6cf0'], ['Practice sessions', ssAll.length, '#C9922E'], ['Practice hours', (ssAll.reduce((t, s) => t + (L.sessNet(s) || 0), 0) / 60).toFixed(1), '#14a89b'], ['Deadlines', items.filter(i => i.kind === 'deadline').length, '#e0566b'], ['Plans running', items.filter(i => i.kind === 'activity').length, '#9b8cff'], ['Travel legs', items.filter(i => i.kind === 'travel').length, '#e3b04b']] });
    while (U.ymd(y, m, 1) <= b) {
      const [ma, mb] = U.mRange(y, m); const days = {};
      for (let d = ma; d <= mb; d = U.addDays(d, 1)) { if (d < a || d > b) continue; const its = L.itemsOn(items, d).sort((x, y) => (y.kind === 'activity') - (x.kind === 'activity')); if (its.length) days[d] = its.map(i => ({ cont: i.kind === 'activity' && L.isCont(i, d) && d !== a, t: (i.time ? i.time + ' ' : '') + i.title + (i.cancelled ? ' (cancelled)' : ''), k: i.kind, c: L.itemColor(i, 'category') })); }
      blocks.push({ cal: { y, m, days, from: a, to: b } });
      m++; if (m > 12) { m = 1; y++; }
    }
    blocks.push({ legend: true });
    if (!onlyPractice && o.sec.events) { const evs = evIn(a, b, o); blocks.push({ h: 'Events in this period' }, { table: { head: ['ID', 'Event', 'When (EAT)', 'Venue', 'Status', 'Approval', 'Host confirmation'], body: evs.map(evRow), colors: evs.map(e => L.catColor(e.category)) }, empty: 'No events in this period.' }); }
    if (!onlyPractice && o.sec.travel) { const ls = legsIn(a, b, o); blocks.push({ h: 'Travel legs and departure times' }, { table: { head: LEG_HEAD, body: ls.map(legRow) }, empty: 'No travel legs in this period.' }); }
    if (!onlyPractice && o.sec.plans !== false) { const acts = items.filter(i => i.kind === 'activity').map(i => St.get('activities', i.id)).filter(Boolean); blocks.push({ h: 'Work-plan activities by department' }, { table: { head: ['Activity', 'Department', 'Dates', 'Leader', 'Target', 'Progress', 'Approval'], body: acts.map(x => [x.title, L.deptName(x.deptId), `${U.fmtD(x.start)} - ${U.fmtD(x.end)}`, L.memberName(x.leaderId), x.target || '-', `${+x.progress || 0}% ${L.label(L.ACT_STATUS, x.status)}`, L.label(L.APPROVAL, x.approval || 'pending')]), colors: acts.map(x => L.deptColor(x.deptId)) }, empty: 'No work-plan activities in this period.' }); }
    if (!onlyPractice && o.sec.tasks) { const ts = tasksIn(a, b, o); blocks.push({ h: 'Task deadlines and departments' }, { table: { head: TASK_HEAD, body: ts.map(taskRow), colors: ts.map(t => L.deptColor(t.deptId)) }, empty: 'No task deadlines in this period.' }); }
    if (o.sec.practice || onlyPractice) { const ss = sessIn(a, b, o); blocks.push({ h: 'Practice sessions' }, { table: { head: SESS_HEAD(o.sec.songs), body: ss.map(s => sessRow(s, o.sec.songs)), colors: ss.map(s => L.planColor(s.planId)) }, empty: 'No practice sessions in this period.' }, { p: practiceSummary(ss) }); }
    return blocks;
  }
  function practiceSummary(ss) {
    const el = ss.filter(L.eligible); const pm = el.reduce((t, s) => t + (L.sessNet(s) || 0), 0); const done = el.filter(s => s.status === 'completed'); const ar = done.filter(s => L.sessActualNet(s) != null);
    return `Eligible sessions: ${el.length} on ${U.uniq(el.map(s => s.date)).length} practice day(s); planned ${(pm / 60).toFixed(1)} h net. Completed: ${done.length}; actual hours recorded for ${ar.length}: ${ar.length ? (ar.reduce((t, s) => t + L.sessActualNet(s), 0) / 60).toFixed(1) + ' h' : 'no data'}. Cancelled (excluded): ${ss.length - el.length}.`;
  }

  P.build = (o) => {
    const [a, b] = U.period(o.period); const per = U.periodLabel(o.period); const cfg = St.cfg();
    const t = P.TYPES.find(x => x[0] === o.type) || P.TYPES[0];
    const M = { title: t[1], subtitle: per, filename: P.filename(o), landscape: o.orient === 'landscape' || (o.orient === 'auto' && ['calendar', 'pcal', 'eventcal', 'itinerary', 'timetable', 'assign', 'tasks', 'ptasks', 'workplan', 'deptplan'].includes(o.type)), blocks: [], cover: o.cover, range: [a, b] };
    const B = M.blocks;
    if (NEEDS[o.type] === 'event' && !St.get('events', o.eventId)) throw new Error('Choose an event for this document.');
    if (NEEDS[o.type] === 'plan' && !St.get('plans', o.planId)) throw new Error('Choose a practice plan for this document.');
    if (NEEDS[o.type] === 'dept' && !St.get('departments', o.dept)) throw new Error('Choose a department for this document.');
    if (NEEDS[o.type] === 'leg' && !St.get('travel', o.legId)) throw new Error('Choose a travel leg for this seating plan.');
    switch (o.type) {
      case 'calendar': B.push(...calBlocks(a, b, o, false)); break;
      case 'pcal': M.title = 'Practice calendar'; B.push(...calBlocks(a, b, o, true)); break;
      case 'eventcal': {
        const evs = evIn(a, b, o);
        if (!evs.length) B.push({ p: 'No events in this period.' });
        evs.forEach(e => {
          B.push({ h: `${e.code || ''} ${e.title}` }, { kv: [['When (EAT)', `${U.fmtD(e.startDate)} ${e.startTime || ''}${e.endDate ? ' - ' + U.fmtD(e.endDate) + ' ' + (e.endTime || '') : ''}`], ['Category', e.category || '-'], ['Venue', [e.venue, e.address].filter(Boolean).join(', ') || '-'], ['Host', [e.host, e.hostContact].filter(Boolean).join(' / ') || '-'], ['Status', L.label(L.EVENT_STATUS, e.status)], ['Internal approval', L.label(L.APPROVAL, e.approval || 'pending')], ['Host confirmation', L.label(L.HOSTCONF, e.hostConf || 'not_required')], ['Leader', L.memberName(e.leaderId)], ['Departments', (e.depts || []).map(L.deptName).join(', ') || '-'], ...(o.sec.events ? [['Equipment', (e.equipment || []).join(', ') || '-'], ['Technical', e.tech || '-'], ['Notes', e.notes || '-']] : [])] });
          if (o.sec.travel) { const ls = St.all('travel').filter(t => t.eventId === e.id).sort(U.by(t => (t.departDate || '') + (t.departTime || ''))); if (ls.length) B.push({ table: { head: LEG_HEAD.slice(1), body: ls.map(t => legRow(t).slice(1)) } }); }
          if (o.sec.tasks) { const ts = St.live('tasks').filter(t => t.linkType === 'event' && t.linkId === e.id).sort(U.by('due')); if (ts.length) B.push({ table: { head: TASK_HEAD.slice(0, 7), body: ts.map(t => taskRow(t).slice(0, 7)) } }); }
          if (o.sec.songs && (e.songIds || []).length) B.push({ p: 'Repertoire: ' + e.songIds.map(L.songTitle).join(', ') });
        });
        break;
      }
      case 'workplan': case 'deptplan': {
        const y = +o.period.year || 2027; const yd = St.get('years', String(y)) || {};
        if (o.type === 'deptplan') M.title = 'Department work-plan: ' + L.deptName(o.dept);
        M.subtitle = `Planning year ${y}`;
        B.push({ kv: [['Theme', yd.theme || cfg.theme || '-'], ['Work-plan approval', L.label(L.APPROVAL, yd.approval || 'pending')]] });
        const objs = St.all('objectives').filter(x => +x.year === y && (o.type !== 'deptplan' || x.deptId === o.dept));
        B.push({ h: 'Annual objectives' }, { table: { head: ['Objective', 'Measurable target', 'Indicator', 'Department', 'Progress'], body: objs.map(x => [x.title, x.target || '-', x.kpi || '-', L.deptName(x.deptId), L.objProgress(x) + '%']) }, empty: 'No objectives recorded.' });
        const acts = St.live('activities').filter(x => +x.year === y && (o.type !== 'deptplan' || x.deptId === o.dept));
        [1, 2, 3, 4].forEach(q => {
          const [qa, qb] = U.qRange(y, q); const qs = acts.filter(x => U.overlapRange(x.start || x.end, x.end || x.start, qa, qb)).sort(U.by('start'));
          B.push({ h: ['Q1: January-March', 'Q2: April-June', 'Q3: July-September', 'Q4: October-December'][q - 1] }, { table: { head: ['Activity', 'Dates', 'Department / leader', 'Target & indicator', 'Resources', ...(fin() ? ['Budget'] : []), 'Expected outcome', 'Progress', 'Approval'], body: qs.map(x => [x.title + (x.aiSuggested ? ' (AI draft)' : ''), `${U.fmtDs(x.start)} - ${U.fmtDs(x.end)}`, `${L.deptName(x.deptId)} / ${L.memberName(x.leaderId)}`, [x.target, x.kpi].filter(Boolean).join(' / ') || '-', x.resources || '-', ...(fin() ? [U.money(x.budget, cfg.currency)] : []), x.outcome || '-', `${x.progress || 0}% ${L.label(L.ACT_STATUS, x.status)}`, L.label(L.APPROVAL, x.approval || 'pending')]) }, empty: 'No activities this quarter.' });
        });
        if (o.type === 'deptplan' && o.sec.tasks) { const ts = St.live('tasks').filter(t => t.deptId === o.dept && (!t.due || +t.due.slice(0, 4) === y)).sort(U.by('due')); B.push({ h: 'Department tasks' }, { table: { head: TASK_HEAD, body: ts.map(taskRow) }, empty: 'No tasks.' }); }
        break;
      }
      case 'tasks': case 'ptasks': {
        let ts = tasksIn(a, b, o); if (o.type === 'ptasks') { M.title = 'Practice task & deadline report'; ts = ts.filter(t => t.linkType === 'session'); }
        const od = ts.filter(t => L.taskOverdue(t));
        B.push({ p: `${ts.length} task(s) due in this period · ${ts.filter(t => t.status === 'completed').length} completed · ${od.length} overdue (as of ${U.fmtD(U.today())}).` });
        if (od.length) B.push({ h: 'Overdue' }, { table: { head: TASK_HEAD, body: od.map(taskRow) } });
        const by = {}; ts.forEach(t => (by[t.deptId || ''] = by[t.deptId || ''] || []).push(t));
        Object.entries(by).forEach(([d, xs]) => B.push({ h: d ? L.deptName(d) : 'No department' }, { table: { head: TASK_HEAD, body: xs.map(taskRow) } }));
        if (!ts.length) B.push({ p: 'No tasks due in this period.' });
        break;
      }
      case 'itinerary': {
        const ls = legsIn(a, b, o);
        if (o.eventId) { const e = St.get('events', o.eventId); if (e) { M.title = 'Travel itinerary: ' + e.title; B.push({ kv: [['Event', `${e.title} (${e.code || ''})`], ['Date', `${U.fmtD(e.startDate)} ${e.startTime || ''}`], ['Venue', [e.venue, e.address].filter(Boolean).join(', ') || '-'], ['Accommodation', e.accommodation || '-'], ['Transport notes', e.transport || '-']] }); } }
        B.push({ h: 'Travel legs' }, { table: { head: LEG_HEAD, body: ls.map(legRow) }, empty: 'No travel legs recorded.' });
        const flagged = ls.filter(t => L.legFlags(t).length);
        if (flagged.length) B.push({ h: 'Items to resolve' }, { table: { head: ['Leg', 'Issues'], body: flagged.map(t => [`${t.dir} ${t.from || '?'} -> ${t.to || '?'} (${U.fmtDs(t.departDate)})`, L.legFlags(t).join('; ')]) } });
        ls.filter(t => (t.travelers || []).length).forEach(t => B.push({ p: `Travellers, ${t.dir} ${U.fmtDs(t.departDate)}: ${(t.travelers || []).map(L.memberName).join(', ')}` }));
        if (fin()) { const c = ls.reduce((s, t) => s + (+t.cost || 0), 0); B.push({ p: `Recorded transport costs: ${U.money(c, cfg.currency)}.` }); }
        B.push({ p: 'Booking references are shown exactly as entered. Legs marked UNCONFIRMED have not been confirmed with the provider.' });
        break;
      }
      case 'brief': {
        const e = St.get('events', o.eventId); const fz = St.get('finance', e.id) || {};
        M.title = 'Event brief: ' + e.title; M.subtitle = `${U.fmtD(e.startDate)} · ${e.code || ''}`;
        B.push({ kv: [['Event ID', e.code || '-'], ['Category', e.category || '-'], ['When (EAT)', `${U.fmtD(e.startDate)} ${e.startTime || ''} - ${U.fmtD(e.endDate || e.startDate)} ${e.endTime || ''}`], ['Venue / address', [e.venue, e.address].filter(Boolean).join(', ') || '-'], ['Host / contact', [e.host, e.hostContact].filter(Boolean).join(' / ') || '-'], ['Event leader', L.memberName(e.leaderId)], ['Departments', (e.depts || []).map(L.deptName).join(', ') || '-'], ['Status', L.label(L.EVENT_STATUS, e.status)], ['Internal approval', L.label(L.APPROVAL, e.approval || 'pending')], ['Host confirmation', L.label(L.HOSTCONF, e.hostConf || 'not_required')], ['Work-plan link', [(St.get('objectives', e.objectiveId) || {}).title, (St.get('activities', e.activityId) || {}).title].filter(Boolean).join(' / ') || '-'], ['Technical requirements', e.tech || '-'], ['Equipment', (e.equipment || []).join(', ') || '-'], ['Transport', e.transport || '-'], ['Accommodation', e.accommodation || '-'], ...(fin() ? [['Estimated budget', U.money(fz.budget, cfg.currency)], ['Recorded actual expenses', fz.actual == null ? 'Not recorded' : U.money(fz.actual, cfg.currency)]] : []), ['Description', e.description || '-'], ['Notes', e.notes || '-']] });
        B.push({ h: 'Repertoire' }, { table: { head: ['#', 'Song', 'Key', 'Readiness'], body: (e.songIds || []).map((id, i) => { const p = (e.planId && St.get('plans', e.planId)) || L.eventPlan(e.id); return [i + 1, L.songTitle(id), (St.get('songs', id) || {}).key || '-', p ? L.label(L.STAGES, L.stage(p.id, id)) : '-']; }) }, empty: 'No repertoire listed.' });
        const ts = St.live('tasks').filter(t => t.linkType === 'event' && t.linkId === e.id).sort(U.by('due'));
        B.push({ h: 'Preparation tasks' }, { table: { head: TASK_HEAD.slice(0, 7), body: ts.map(t => taskRow(t).slice(0, 7)) }, empty: 'No tasks.' });
        const ls = St.all('travel').filter(t => t.eventId === e.id).sort(U.by(t => (t.departDate || '') + (t.departTime || '')));
        B.push({ h: 'Travel' }, { table: { head: LEG_HEAD.slice(1), body: ls.map(t => legRow(t).slice(1)) }, empty: 'No travel legs.' });
        break;
      }
      case 'timetable': case 'assign': {
        const ss = sessIn(a, b, o); const withSongs = o.type === 'assign' || o.sec.songs;
        if (o.type === 'assign') M.title = 'Song assignment schedule';
        const weeks = {}; ss.forEach(s => { const w = U.addDays(s.date, -((U.dow(s.date) + 6) % 7)); (weeks[w] = weeks[w] || []).push(s); });
        Object.entries(weeks).forEach(([w, xs]) => B.push({ h: `Week of ${U.fmtD(w)}` }, { table: { head: SESS_HEAD(withSongs), body: xs.map(s => sessRow(s, withSongs)) } }));
        if (!ss.length) B.push({ p: 'No practice sessions in this period.' });
        B.push({ p: practiceSummary(ss) });
        if (o.type === 'assign') { const songs = U.uniq(ss.filter(L.eligible).flatMap(s => L.sessAssign(s.id).map(a2 => a2.songId))); B.push({ h: 'Per-song schedule' }, { table: { head: ['Song', 'Sessions', 'Dates'], body: songs.map(id => { const ds = ss.filter(s => L.eligible(s) && L.sessAssign(s.id).some(x => x.songId === id)).map(s => U.fmtDs(s.date)); return [L.songTitle(id), ds.length, ds.join(', ')]; }) }, empty: 'No songs assigned.' }); }
        if (o.sec.tasks) { const ts = tasksIn(a, b, o).filter(t => t.linkType === 'session'); if (ts.length) B.push({ h: 'Practice tasks & deadlines' }, { table: { head: TASK_HEAD, body: ts.map(taskRow) } }); }
        break;
      }
      case 'attendance': {
        M.title = 'Practice attendance report';
        const ss = sessIn(a, b, o).filter(s => s.status === 'completed'); const st = L.attStats(ss);
        B.push({ p: `Completed sessions: ${ss.length}. Attendance recorded for ${st.recorded}; missing records for ${st.missing} (shown as "no record", not zero). Overall: ${st.pct == null ? 'no data' : st.pct + '% (present + late / expected participants)'}.` });
        B.push({ table: { head: ['Date', 'Plan', 'Expected', 'Present', 'Late', 'Absent', 'Excused', 'Attendance'], body: ss.map(s => { const at = St.get('attendance', s.id); const exp = L.expectedMembers(s).length; if (!at || !at.records) return [U.fmtD(s.date), (St.get('plans', s.planId) || {}).name || '-', exp, 'no record', '-', '-', '-', '-']; const r = Object.values(at.records); const x = L.attStats([s]); return [U.fmtD(s.date), (St.get('plans', s.planId) || {}).name || '-', exp, r.filter(v => v === 'P').length, r.filter(v => v === 'L').length, r.filter(v => v === 'A').length, r.filter(v => v === 'E').length, x.pct == null ? '-' : x.pct + '%']; }) }, empty: 'No completed sessions in this period.' });
        const per = {}; ss.forEach(s => { const at = St.get('attendance', s.id); if (!at || !at.records) return; L.expectedMembers(s).forEach(id => { const p = per[id] = per[id] || { e: 0, p: 0 }; p.e++; if (['P', 'L'].includes(at.records[id])) p.p++; }); });
        B.push({ h: 'By member (sessions with records)' }, { table: { head: ['Member', 'Section', 'Expected', 'Attended', '%'], body: Object.entries(per).map(([id, v]) => [L.memberName(id), ((St.get('members', id) || {}).sections || []).join('/'), v.e, v.p, Math.round(v.p / v.e * 100) + '%']).sort(U.by(r => r[0])) }, empty: 'No attendance recorded.' });
        break;
      }
      case 'readiness': case 'workload': {
        if (o.type === 'workload') M.title = 'Remaining practice workload';
        const plans = St.all('plans').filter(p => p.status !== 'cancelled' && (!o.planId || p.id === o.planId) && (!o.eventId || p.eventId === o.eventId) && (!L.planTargetDate(p) || U.overlapRange(p.start || a, L.planTargetDate(p), a, b)));
        if (!plans.length) B.push({ p: 'No practice plans in this period.' });
        plans.forEach(p => {
          const fz = L.feasibility(p); const m = fz.m;
          B.push({ h: p.name }, { p: `Target: ${fz.tgt ? U.fmtD(fz.tgt) : 'none'} · ${m.unique} unique songs · ${m.ready} ready · ${m.attention} need work · remaining estimated workload ${(m.workMin / 60).toFixed(1)} h vs ${(fz.usableMin / 60).toFixed(1)} h usable (${fz.reserve}% reserved) -> ${fz.tgt ? (fz.ok ? 'schedule appears sufficient' : 'schedule appears INSUFFICIENT') : 'no deadline'}. Planning estimate only.` });
          if (o.type === 'readiness') B.push({ table: { head: ['Song', 'Difficulty', 'Readiness', 'Sections', 'Practised / planned', 'Last practice', 'Next practice', 'Target date'], body: m.songs.map(id => { const rd = L.readiness(p.id, id) || {}; const tl = L.songTimeline(p.id, id).filter(x => x.s.status !== 'cancelled'); const ln = L.lastNextPractice(p.id, id, U.today()); return [L.songTitle(id), (St.get('songs', id) || {}).difficulty || 'moderate', L.label(L.STAGES, L.stage(p.id, id)), Object.entries(rd.sectionStages || {}).map(([s, v]) => s + ': ' + L.label(L.STAGES, v)).join('; ') || '-', `${tl.filter(x => x.a.done).length} / ${tl.length}`, ln.last ? U.fmtDs(ln.last) : '-', ln.next ? U.fmtDs(ln.next) : '-', rd.targetDate ? U.fmtDs(rd.targetDate) : '-']; }) }, empty: 'No songs.' });
          else { B.push({ table: { head: ['Song', 'Readiness', 'Est. sessions', 'Completed', 'Remaining', 'Min / session', 'Remaining minutes'], body: m.perSong.map(x => [L.songTitle(x.id), L.label(L.STAGES, L.stage(p.id, x.id)), x.est.sessions + (x.est.custom ? '' : ' (default)'), x.doneCount, x.rem, x.est.min, x.min]) }, empty: 'All songs are marked ready.' }); if (fz.tips.length) B.push({ p: 'Suggestions: ' + fz.tips.join(' ') }); }
        });
        break;
      }
      case 'hours': {
        M.title = 'Planned vs actual practice hours';
        const ss = sessIn(a, b, o); const months = {}; ss.forEach(s => { const k = s.date.slice(0, 7); const x = months[k] = months[k] || { pl: 0, ac: 0, acN: 0, sess: 0, done: 0, canc: 0, days: new Set() }; if (s.status === 'cancelled') { x.canc++; return; } x.sess++; x.days.add(s.date); x.pl += L.sessNet(s) || 0; if (s.status === 'completed') { x.done++; const n = L.sessActualNet(s); if (n != null) { x.ac += n; x.acN++; } } });
        B.push({ table: { head: ['Month', 'Eligible sessions', 'Practice days', 'Planned hours', 'Completed', 'Actual hours (recorded)', 'Difference', 'Cancelled'], body: Object.entries(months).sort().map(([k, x]) => [U.MONTHS[+k.slice(5) - 1] + ' ' + k.slice(0, 4), x.sess, x.days.size, (x.pl / 60).toFixed(1), x.done, x.acN ? (x.ac / 60).toFixed(1) + (x.acN < x.done ? ` (${x.done - x.acN} missing)` : '') : 'no data', x.acN ? ((x.ac - x.pl * (x.done / Math.max(1, x.sess))) / 60).toFixed(1) : '-', x.canc]) }, empty: 'No sessions in this period.' });
        B.push({ p: practiceSummary(ss) + ' Planned = scheduled end - start - breaks. Actual = recorded finish - start - breaks, only for sessions recorded after practice.' });
        break;
      }
      case 'finance': {
        if (!A.Fin.canView()) throw new Error('Finance reports are only available to the Finance & Fundraising team and the choir leadership.');
        const F = A.Fin, sm = F.summary(), t = sm.totals, fmt = F.fmt;
        M.title = 'Finance report'; M.subtitle = 'As of ' + U.fmtD(U.today()); M.landscape = o.orient === 'landscape';
        B.push({ stats: [['Total balance', U.num(t.total), '#C9922E'], ['Cash in hand', U.num(t.cash), '#14a89b'], ['Bank & mobile', U.num(t.bank), '#6c6cf0'], ['Net this month', U.num(sm.inc - sm.exp), sm.inc - sm.exp >= 0 ? '#C9922E' : '#e0566b']] });
        B.push({ h: 'Income and expenses, last 6 months' }, { table: { head: ['Month', 'Income', 'Expenses', 'Net'], body: sm.months.map(([m, i, e]) => [U.MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4), fmt(i), fmt(e), fmt(i - e)]) } });
        B.push({ h: 'Membership fees, ' + U.MONTHS[+sm.cur.slice(5) - 1] + ' ' + sm.cur.slice(0, 4) }, { kv: [['Expected', fmt(sm.feeExpected)], ['Collected', fmt(sm.feeCollected)], ['Outstanding', fmt(Math.max(0, sm.feeExpected - sm.feeCollected))]] });
        B.push({ h: 'Fundraising & contributions' }, { table: { head: ['Contribution', 'Target', 'Collected', 'Outstanding', '% complete', 'Deadline'], body: sm.contribs.map(([c, col]) => [c.name, fmt(c.target), fmt(col), fmt(Math.max(0, (+c.target || 0) - col)), (c.target ? Math.min(100, Math.round(col / c.target * 100)) : 0) + '%', U.fmtD(c.deadline)]) }, empty: 'No contributions recorded.' });
        const bi = Object.entries(F.byIncome()).filter(([, v]) => v > 0), be = Object.entries(F.byExpense());
        B.push({ h: 'Income by source' }, { table: { head: ['Source', 'Amount'], body: bi.map(([k, v]) => [k, fmt(v)]), colors: bi.map((x, i) => L.PALETTE[i % 12][0]) }, empty: 'No income recorded.' });
        B.push({ h: 'Expenses by category' }, { table: { head: ['Category', 'Amount'], body: be.map(([k, v]) => [k, fmt(v)]), colors: be.map((x, i) => L.PALETTE[(i + 3) % 12][0]) }, empty: 'No expenses recorded.' });
        const owing = sm.members.filter(x => x.out > 0).sort((a2, b2) => b2.out - a2.out);
        B.push({ pagebreak: true }, { h: 'Members with outstanding balances' }, { table: { head: ['Member', 'Member ID', 'Status', 'Months fully paid', 'Outstanding'], body: owing.map(x => [x.m.name, x.m.memberCode || '-', x.status, x.months, fmt(x.out)]) }, empty: 'No outstanding balances.' });
        B.push({ p: 'Fees and contribution payments are counted as income. Recorded cash-in-hand and bank balances are included in totals but are not income. Bank includes mobile money.' });
        break;
      }
      case 'seating': {
        const t = St.get('travel', o.legId); const e = St.get('events', t.eventId) || {}; const stx = L.legSeatStats(t);
        const dir = t.dir === 'return' ? 'Return' : t.dir === 'other' ? 'Travel' : 'Outbound';
        M.title = 'Seating plan: ' + (e.title || 'Travel'); M.subtitle = `${dir} · ${t.from || '?'} → ${t.to || '?'} · ${U.fmtD(t.departDate)} ${t.departTime || ''}`; M.landscape = o.orient === 'landscape';
        const nm = (id) => (St.get('members', id) || {}).name || '(removed member)'; const sec = (id) => ((St.get('members', id) || {}).sections || [])[0] || '';
        B.push({ stats: [['Travellers', (t.travelers || []).length, '#6c6cf0'], ['Vehicles', stx.vehicles, '#14a89b'], ['Seats', stx.cap, '#e3b04b'], ['Seated', stx.used, '#C9922E'], ['Without seat', stx.unseated.length, stx.unseated.length ? '#e0566b' : '#C9922E']] });
        B.push({ kv: [['Event', `${e.title || '-'}${e.code ? ' (' + e.code + ')' : ''}`], ['Leg', `${dir}: ${t.from || '?'} → ${t.to || '?'}`], ['Departure (EAT)', `${U.fmtD(t.departDate)} ${t.departTime || '(time missing)'}`], ['Arrival (EAT)', t.arriveDate ? `${U.fmtD(t.arriveDate)} ${t.arriveTime || ''}` : '-'], ['Travel type', t.mode || '-'], ['Provider', t.provider || '-'], ['Booking reference', t.booking || '(none entered)'], ['Arrangement', t.confirmed ? 'Confirmed with provider' : 'UNCONFIRMED'], ['Coordinator', L.memberName(t.coordinatorId)]] });
        if (!(t.vehicles || []).length) B.push({ p: 'No vehicles or seats have been set up for this leg yet.' });
        (t.vehicles || []).forEach((v, i) => {
          const lay = L.seatLayout(v); const tpl = L.vehicleTpl(v.type);
          B.push({ pagebreak: true }, { h: `${v.label || 'Vehicle ' + (i + 1)} · ${tpl[1]}` }, { p: [v.plate ? 'Plate: ' + v.plate : '', v.driver ? 'Driver: ' + v.driver : '', `${lay.seats.filter(s2 => (v.seats || {})[s2]).length} of ${lay.capacity} seats filled`].filter(Boolean).join('   ·   ') });
          B.push({ seatmap: { cols: lay.cols, driver: v.driver || '', grid: lay.grid.map(r => r.map(c => c.t === 'seat' ? { t: 'seat', no: c.no, name: (v.seats || {})[c.id] ? nm(v.seats[c.id]) : '', color: (v.seats || {})[c.id] ? L.sectionColor(sec(v.seats[c.id])) : '' } : { t: c.t })), legend: U.uniq(Object.values(v.seats || {}).map(sec)).filter(Boolean).map(s2 => [s2, L.sectionColor(s2)]) } });
          const rows = lay.seats.filter(s2 => (v.seats || {})[s2]).map(s2 => ({ s: s2, m: v.seats[s2] }));
          B.push({ h: 'Passenger manifest by seat' }, { table: { head: ['Seat', 'Name', 'Section', 'Signature / check-in'], body: rows.map(r => [r.s, nm(r.m), sec(r.m) || '-', '']), colors: rows.map(r => L.sectionColor(sec(r.m))) }, empty: 'No one is seated in this vehicle yet.' });
        });
        const all = []; (t.vehicles || []).forEach(v => Object.entries(v.seats || {}).forEach(([s2, m]) => m && all.push([nm(m), sec(m) || '-', v.label || 'Vehicle', s2])));
        B.push({ pagebreak: true }, { h: 'Alphabetical passenger list' }, { table: { head: ['Name', 'Section', 'Vehicle', 'Seat'], body: all.sort((x, y) => x[0].localeCompare(y[0])), colors: all.map(r => L.sectionColor(r[1])) }, empty: 'No seats allocated yet.' });
        if (stx.unseated.length) B.push({ h: 'Travellers without a seat' }, { p: stx.unseated.map(nm).sort().join(', ') });
        break;
      }
      case 'songplan': {
        const p = St.get('plans', o.planId); const ss = L.planSessions(p.id).filter(s => s.status !== 'cancelled' && U.inRange(s.date, o.period.kind === 'year' ? '0000' : a, o.period.kind === 'year' ? '9999' : b));
        const tgt = L.planTargetDate(p); M.title = 'Song practice planner: ' + p.name; M.subtitle = (tgt ? 'Performance ' + U.fmtD(tgt) : 'Practice plan') + ' · ' + ss.length + ' sessions'; M.landscape = o.orient !== 'portrait';
        const songs = L.planSongIds(p); const warm = p.warmupMin ?? 10;
        const colorOf = (s) => { const sr = St.get('series', s.seriesId); const sl = sr && St.get('slots', sr.slotId); return sl ? L.slotColor(sl) : L.planColor(p.id); };
        B.push({ stats: [['Sessions', ss.length, L.planColor(p.id)], ['Practice hours', (ss.reduce((t, s) => t + (L.sessNet(s) || 0), 0) / 60).toFixed(1), '#14a89b'], ['Songs', songs.length, '#6c6cf0'], ['Song-practices', ss.reduce((t, s) => t + L.sessAssign(s.id).length, 0), '#e0713a'], ['Ready', songs.filter(id => L.stage(p.id, id) === 'ready').length, '#C9922E']] });
        const chunks = []; for (let i = 0; i < ss.length; i += 16) chunks.push(ss.slice(i, i + 16));
        chunks.forEach((ch, ci) => B.push({ h: 'When to practise each song' + (chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : '') }, { matrix: { cols: ch.map(s => ({ label: U.fmtDs(s.date), sub: s.start, color: colorOf(s) })), rows: songs.map(id => ({ label: L.songTitle(id), cells: ch.map(s => L.sessAssign(s.id).some(a2 => a2.songId === id)), total: ss.filter(s => L.sessAssign(s.id).some(a2 => a2.songId === id)).length })) } }));
        B.push({ h: 'Session run sheets' }, { p: `Each session starts with a ${warm}-minute warm-up. Harder songs come first, there's a break at the midpoint, and remaining time goes to revision and full run-throughs. Times are planning estimates.` });
        B.push({ sheets: ss.filter(s => L.sessAssign(s.id).length).map(s => ({ title: `${U.fmtD(s.date)}  ${s.start}-${s.end}`, sub: s.venue || '', color: colorOf(s), rows: L.runSheet(s, L.sessAssign(s.id).map(a2 => a2.songId), p.id, warm).map(r => [`${r.from}-${r.to}`, r.label, r.kind]) })) });
        break;
      }
      case 'prep': {
        const p = St.get('plans', o.planId); const fz = L.feasibility(p); const m = fz.m; const ev = p.eventId && St.get('events', p.eventId);
        M.title = 'Event preparation plan: ' + (ev ? ev.title : p.name); M.subtitle = fz.tgt ? 'Performance ' + U.fmtD(fz.tgt) : 'No performance date';
        B.push({ kv: [['Practice plan', p.name], ['Performance date', fz.tgt ? U.fmtD(fz.tgt) : '-'], ['Preparation period', `${U.fmtD(p.start)} - ${fz.tgt ? U.fmtD(fz.tgt) : '-'}`], ['Plan owner', L.memberName(p.ownerId)], ['Sessions (eligible / completed / cancelled)', `${m.sessions} / ${m.completed} / ${m.cancelled}`], ['Practice days', m.practiceDays], ['Planned hours', (m.plannedMin / 60).toFixed(1)], ['Actual hours', m.actualMin == null ? 'no data' : (m.actualMin / 60).toFixed(1)], ['Unique songs / ready', `${m.unique} / ${m.ready}`], ['Remaining sessions before performance', m.beforeEvent], ['Estimated remaining workload', `${(m.workMin / 60).toFixed(1)} h vs ${(fz.usableMin / 60).toFixed(1)} h usable`], ['Assessment (estimate)', fz.tgt ? (fz.ok ? 'Current schedule appears sufficient' : 'Current schedule appears insufficient') : '-']] });
        B.unshift({ stats: [['Days left', fz.calDays == null ? '-' : fz.calDays, '#6c6cf0'], ['Sessions left', m.beforeEvent, '#C9922E'], ['Planned hours', (m.plannedMin / 60).toFixed(1), '#14a89b'], ['Songs ready', `${m.ready}/${m.unique}`, '#e0713a'], ['Workload left (h)', (m.workMin / 60).toFixed(1), fz.ok ? '#C9922E' : '#e0566b']] });
        if (fz.tips.length) B.push({ p: 'Suggestions: ' + fz.tips.join(' ') });
        B.push({ h: 'Required songs and readiness' }, { table: { head: ['Song', 'Difficulty', 'Readiness', 'Est. sessions x min', 'Practised / planned', 'Target date'], body: m.songs.map(id => { const e = L.songEst(p.id, id); const tl = L.songTimeline(p.id, id).filter(x => x.s.status !== 'cancelled'); return [L.songTitle(id), (St.get('songs', id) || {}).difficulty || 'moderate', L.label(L.STAGES, L.stage(p.id, id)), `${e.sessions} x ${e.min}`, `${tl.filter(x => x.a.done).length} / ${tl.length}`, (L.readiness(p.id, id) || {}).targetDate ? U.fmtDs(L.readiness(p.id, id).targetDate) : '-']; }) }, empty: 'No songs in the plan.' });
        const ss = L.planSessions(p.id);
        B.push({ h: 'Scheduled sessions and song assignments' }, { table: { head: SESS_HEAD(true), body: ss.map(s => sessRow(s, true)) }, empty: 'No sessions.' });
        const sids = new Set(ss.map(s => s.id)); const ts = St.live('tasks').filter(t => ((t.linkType === 'session' && sids.has(t.linkId)) || (ev && t.linkType === 'event' && t.linkId === ev.id)) && !['completed', 'cancelled'].includes(t.status)).sort(U.by('due'));
        B.push({ h: 'Outstanding preparation tasks' }, { table: { head: TASK_HEAD, body: ts.map(taskRow) }, empty: 'No outstanding tasks.' });
        B.push({ p: 'Readiness is recorded by music leaders. Scheduled practice does not by itself mean a song is ready. Workload figures are planning estimates.' });
        break;
      }
      case 'annual': {
        const y = +o.period.year || 2027; M.subtitle = 'Year ' + y; const [ya, yb] = [`${y}-01-01`, `${y}-12-31`];
        const acts = St.live('activities').filter(x => +x.year === y);
        B.push({ h: 'Planned vs completed activities' }, { table: { head: ['Quarter', 'Planned', 'Completed', 'In progress', 'Cancelled / deferred', 'Avg progress'], body: [1, 2, 3, 4].map(q => { const [qa, qb] = U.qRange(y, q); const xs = acts.filter(x => U.overlapRange(x.start || x.end, x.end || x.start, qa, qb)); return ['Q' + q, xs.length, xs.filter(x => x.status === 'completed').length, xs.filter(x => x.status === 'in_progress').length, xs.filter(x => ['cancelled', 'deferred'].includes(x.status)).length, xs.length ? Math.round(xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length) + '%' : '-']; }) } });
        const objs = St.all('objectives').filter(x => +x.year === y);
        B.push({ h: 'Annual objective completion' }, { table: { head: ['Objective', 'Target', 'Activities', 'Progress', 'Status'], body: objs.map(x => [x.title, x.target || '-', St.live('activities').filter(a2 => a2.objectiveId === x.id).length, L.objProgress(x) + '%', L.label(L.ACT_STATUS, x.status)]) }, empty: 'No objectives.' });
        const evs = evIn(ya, yb, {});
        B.push({ h: 'Events by quarter' }, { table: { head: ['Quarter', 'Events', 'Completed', 'Cancelled', 'Approved (internal)', 'Confirmed by host', 'Awaiting host'], body: [1, 2, 3, 4].map(q => { const [qa, qb] = U.qRange(y, q); const xs = evs.filter(e => U.inRange(e.startDate, qa, qb)); return ['Q' + q, xs.length, xs.filter(e => e.status === 'completed').length, xs.filter(e => e.status === 'cancelled').length, xs.filter(e => e.approval === 'approved').length, xs.filter(e => e.hostConf === 'confirmed').length, xs.filter(e => e.hostConf === 'awaiting').length]; }) } });
        const ss = sessIn(ya, yb, {}); B.push({ h: 'Rehearsals' }, { p: practiceSummary(ss) }, { p: (() => { const s = L.attStats(ss); return `Attendance: ${s.pct == null ? 'no data' : s.pct + '%'} across ${s.recorded} recorded session(s); ${s.missing} completed session(s) without records.`; })() });
        if (fin()) { const rows = evs.map(e => { const f2 = St.get('finance', e.id) || {}; return [e.title, U.money(f2.budget, St.cfg().currency), f2.actual == null ? 'not recorded' : U.money(f2.actual, St.cfg().currency)]; }); B.push({ h: 'Budget estimates vs recorded expenditure' }, { table: { head: ['Event', 'Estimated budget', 'Recorded actual'], body: rows }, empty: 'No events.' }); }
        const depts = St.live('departments'); B.push({ h: 'Department performance' }, { table: { head: ['Department', 'Activities', 'Completed', 'Tasks', 'Tasks completed', 'Overdue'], body: depts.map(d => { const xs = acts.filter(a2 => a2.deptId === d.id); const ts = St.live('tasks').filter(t => t.deptId === d.id && (!t.due || +t.due.slice(0, 4) === y)); return [d.name, xs.length, xs.filter(x => x.status === 'completed').length, ts.length, ts.filter(t => t.status === 'completed').length, ts.filter(t => L.taskOverdue(t)).length]; }) }, empty: 'No departments.' });
        const ll = acts.filter(x => x.lessons); B.push({ h: 'Lessons learned' }, { table: { head: ['Activity', 'Department', 'Lessons'], body: ll.map(x => [x.title, L.deptName(x.deptId), x.lessons]) }, empty: 'No lessons recorded yet. Add them to activities in the Annual Work-Plan.' });
        break;
      }
    }
    return M;
  };

  // ---------- HTML preview ----------
  P.preview = (M, cfg) => {
    const hdr = `<div class="hdr"><div><b style="font-size:13px">${esc(cfg.name || 'Choir')}</b><div style="font-size:9px;color:#5A6F8E">${esc(cfg.church || '')}</div></div><div style="text-align:right"><b style="font-size:12px">${esc(M.title)}</b><div style="font-size:9px;color:#5A6F8E">${esc(M.subtitle)}</div></div></div>`;
    let html = '';
    if (M.cover) { const [main, rest] = splitTitle(M.title); const w = main.split(' '); const st = M.blocks.find(b => b.stats); html += `<div class="page cover ${M.landscape ? 'land' : ''}"><div style="font-size:12px;opacity:.8;position:relative;z-index:1">${esc(cfg.name || 'Choir')} · ${esc(cfg.church || '')}</div><h4 style="position:relative;z-index:1">${esc(w.slice(0, -1).join(' ') || main)}<br><em>${esc(w.length > 1 ? w[w.length - 1] : '')}</em></h4><div style="font-size:15px;position:relative;z-index:1">${esc(rest || M.subtitle)}</div>${rest ? `<div style="opacity:.75;margin-top:4px">${esc(M.subtitle)}</div>` : ''}${st ? `<div style="display:flex;gap:10px;margin-top:40px;flex-wrap:wrap">${st.stats.slice(0, 3).map(x => `<div style="border:1px solid #C9922E;border-radius:10px;padding:8px 12px"><b style="font-size:18px">${esc(x[1])}</b><div style="font-size:9px;opacity:.8">${esc(x[0])}</div></div>`).join('')}</div>` : ''}</div>`; }
    html += `<div class="page ${M.landscape ? 'land' : ''}">${hdr}`;
    M.blocks.forEach(b => {
      if (b.h) html += `<h5>${esc(b.h)}</h5>`;
      if (b.p) html += `<p style="color:#33445E">${esc(b.p)}</p>`;
      if (b.stats) html += `<div class="tiles">${b.stats.map(x => `<div style="--c:${esc(x[2] || '#C9922E')}"><b>${esc(x[1])}</b><span>${esc(x[0])}</span></div>`).join('')}</div>`;
      if (b.kv) html += `<table>${b.kv.map(([k, v]) => `<tr><td style="width:30%;font-weight:700;color:#5A6F8E">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
      if (b.table) html += b.table.body.length ? `<table><tr>${b.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${b.table.body.slice(0, 60).map((r, i) => `<tr>${r.map((c, j) => `<td style="${j === 0 && b.table.colors ? 'border-left:3px solid ' + esc(b.table.colors[i]) : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>${b.table.body.length > 60 ? `<p><i>…${b.table.body.length - 60} more rows in the PDF</i></p>` : ''}` : `<p><i>${esc(b.empty || 'No data.')}</i></p>`;
      if (b.legend) html += `<p style="font-size:9px;color:#5A6F8E">Colors follow each event's category, practice plan and department.</p>`;
      if (b.matrix) html += `<table style="border-collapse:separate;border-spacing:2px"><tr><th style="background:none;color:#1A3358">Song</th>${b.matrix.cols.map(c => `<th style="background:${esc(c.color)};text-align:center;font-size:8px">${esc(c.label)}</th>`).join('')}</tr>${b.matrix.rows.map(r => { let n = 0; return `<tr><td style="background:none">${esc(r.label)} <span style="color:#5A6F8E">${r.total}x</span></td>${r.cells.map((on, i) => `<td style="text-align:center;border-radius:4px;background:${on ? esc(b.matrix.cols[i].color) : '#F2F5FA'};color:#fff;font-weight:700">${on ? ++n : ''}</td>`).join('')}</tr>`; }).join('')}</table>`;
      if (b.pagebreak) html += '<hr style="border:0;border-top:1px dashed #CFD8E6;margin:16px 0">';
      if (b.seatmap) html += `<div style="display:grid;grid-template-columns:repeat(${b.seatmap.cols},minmax(38px,60px));gap:4px;justify-content:center;border:2px solid #E3E9F2;border-radius:20px 20px 10px 10px;padding:12px;width:max-content;margin:6px auto">${b.seatmap.grid.map(r => r.map(c => c.t === 'seat' ? `<div style="border-radius:6px;padding:3px;min-height:30px;font-size:8px;text-align:center;background:${c.name ? 'color-mix(in srgb,' + esc(c.color) + ' 25%,#fff)' : '#F2F5FA'};border:1px solid ${c.name ? esc(c.color) : '#E3E9F2'}"><b>${esc(c.no)}</b><br>${esc(c.name ? c.name.split(' ')[0] : '')}</div>` : c.t === 'driver' ? '<div style="border:1px dashed #5A6F8E;border-radius:50%;font-size:8px;display:grid;place-items:center">Driver</div>' : '<div></div>').join('')).join('')}</div>`;
      if (b.sheets) html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">${b.sheets.slice(0, 12).map(sh => `<div style="border:1px solid #E3E9F2;border-top:4px solid ${esc(sh.color)};border-radius:8px;padding:6px 8px"><b>${esc(sh.title)}</b><div style="color:#5A6F8E;font-size:9px">${esc(sh.sub)}</div>${sh.rows.map(r => `<div style="display:flex;gap:6px;font-size:9px"><span style="color:#5A6F8E;min-width:62px">${esc(r[0])}</span><span style="${r[2] === 'song' ? 'font-weight:700' : ''}">${esc(r[1])}</span></div>`).join('')}</div>`).join('')}</div>`;
      if (b.cal) {
        const { y, m, days } = b.cal; const first = U.ymd(y, m, 1); const lead = (U.dow(first) + 6) % 7; const n = U.daysInMonth(y, m);
        html += `<h5>${U.MONTHS[m - 1]} ${y}</h5><div class="cg">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="h">${d}</div>`).join('')}${'<div></div>'.repeat(lead)}${Array.from({ length: n }, (_, i) => { const d = U.ymd(y, m, i + 1); const its = days[d] || []; return `<div class="c"><b>${i + 1}</b>${its.slice(0, 4).map(x => x.cont ? `<span class="it" style="--c:${esc(x.c)};height:4px;padding:0;font-size:0">.</span>` : `<span class="it" style="--c:${esc(x.c)}">${esc(x.t)}</span>`).join('')}${its.length > 4 ? `<span style="color:#5A6F8E">+${its.length - 4} more</span>` : ''}</div>`; }).join('')}</div>`;
      }
    });
    html += `<p style="margin-top:14px;font-size:8px;color:#5A6F8E">Generated ${U.stamp()} · Page numbers are added in the PDF</p></div>`;
    return html;
  };
  function splitTitle(t) { const i = t.indexOf(':'); return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : [t, '']; }

  // ---------- jsPDF renderer (modern layout, embedded Plus Jakarta Sans) ----------
  const INK = [26, 51, 88], GREEN = [201, 146, 46], MUTED = [90, 111, 142], SOFT = [242, 245, 250], LINE = [226, 232, 242], WHITE = [255, 255, 255];
  let FONT = 'helvetica', XB = 'helvetica';
  const cleanAscii = (s) => String(s == null ? '' : s).replace(/[→⇒]/g, '->').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[•·]/g, '-').replace(/♭/g, 'b').replace(/♯/g, '#').replace(/×/g, 'x').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
  const cleanU = (s) => String(s == null ? '' : s).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[☀-➿-]|[\uD800-\uDFFF]/g, '');
  let clean = cleanAscii;
  P.fontStatus = 'not loaded';
  async function loadFonts() {
    if (P._fonts !== undefined) return P._fonts;
    try {
      const get = async (f) => { const r = await fetch('fonts/' + f); if (!r.ok) throw new Error('font ' + r.status); const b = new Uint8Array(await r.arrayBuffer()); let s2 = ''; for (let i = 0; i < b.length; i += 0x8000) s2 += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s2); };
      P._fonts = { r: await get('PJS-Regular.ttf'), b: await get('PJS-Bold.ttf'), x: await get('PJS-ExtraBold.ttf') }; P.fontStatus = 'Plus Jakarta Sans';
    } catch (e) { P._fonts = null; P.fontStatus = 'Helvetica (font files unavailable)'; }
    return P._fonts;
  }
  const hex = (h) => L.hexRgb(h);
  P.render = async (M, cfg, onProgress) => {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) throw new Error('The PDF library did not load. Check your connection and reload the planner.');
    const doc = new J({ orientation: M.landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
    if (typeof doc.autoTable !== 'function') throw new Error('The PDF table plugin did not load. Reload the planner and try again.');
    const fonts = await loadFonts();
    if (fonts) { doc.addFileToVFS('PJS-R.ttf', fonts.r); doc.addFont('PJS-R.ttf', 'PJS', 'normal'); doc.addFileToVFS('PJS-B.ttf', fonts.b); doc.addFont('PJS-B.ttf', 'PJS', 'bold'); doc.addFileToVFS('PJS-X.ttf', fonts.x); doc.addFont('PJS-X.ttf', 'PJSX', 'normal'); FONT = 'PJS'; XB = 'PJSX'; clean = cleanU; }
    else { FONT = 'helvetica'; XB = 'helvetica'; clean = cleanAscii; }
    const F = (style, size, color) => { if (style === 'x') doc.setFont(XB, XB === 'helvetica' ? 'bold' : 'normal'); else doc.setFont(FONT, style === 'b' ? 'bold' : (style || 'normal')); if (size) doc.setFontSize(size); if (color) doc.setTextColor(...color); };
    doc.setProperties({ title: clean(M.title + ' - ' + M.subtitle), author: clean(cfg.name || 'Choir'), creator: 'AAC Choir Planner' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(); const mg = 36, top = 82, bot = 46;
    let y = top;
    const ensure = (h) => { if (y + h > H - bot) { doc.addPage(); y = top; } };
    const C = { get y() { return y; }, set y(v) { y = v; }, ensure, top, limit: H - bot };
    const img = (cfg.logo && /^data:image\/(png|jpe?g)/.test(cfg.logo)) ? cfg.logo : null;
    if (M.cover) {
      doc.setFillColor(...INK); doc.rect(0, 0, W, H, 'F');
      doc.setFillColor(...GREEN); doc.circle(W - 40, 40, 150, 'F');
      doc.setFillColor(...INK); doc.circle(W - 20, 70, 118, 'F');
      doc.setDrawColor(...GREEN); doc.setLineWidth(1); doc.circle(W - 40, 40, 190, 'S'); doc.setLineWidth(.6); doc.circle(30, H + 20, 160, 'S'); doc.circle(30, H + 20, 120, 'S');
      doc.setFillColor(...GREEN); for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) doc.circle(mg + i * 9, 40 + j * 9, 1.1, 'F');
      if (img) { try { doc.addImage(img, img.includes('png') ? 'PNG' : 'JPEG', mg, 82, 46, 46); } catch (e) { /* skip */ } }
      F('b', 11, [200, 212, 230]); doc.text(clean((cfg.name || 'Choir') + (cfg.church ? '  ·  ' + cfg.church : '')), mg, img ? 148 : 100);
      const [main, rest] = splitTitle(M.title); const words = clean(main).split(' ');
      const l1 = words.slice(0, -1).join(' ') || words[0], l2 = words.length > 1 ? words[words.length - 1] : '';
      const big = M.landscape ? 54 : 50; let ty = H * (M.landscape ? .42 : .38);
      F('x', big, WHITE); doc.text(doc.splitTextToSize(l1, W - 2 * mg - 40), mg, ty); ty += big * (doc.splitTextToSize(l1, W - 2 * mg - 40).length) * 1.0;
      if (l2) { F('x', big, GREEN); doc.text(l2, mg, ty); ty += big * .95; }
      F('normal', 16, WHITE); if (rest) { doc.text(doc.splitTextToSize(clean(rest), W - 2 * mg), mg, ty + 6); ty += 24 * doc.splitTextToSize(clean(rest), W - 2 * mg).length; }
      F('normal', 13, [200, 212, 230]); doc.text(clean(M.subtitle), mg, ty + 12);
      doc.setDrawColor(...GREEN); doc.setLineWidth(1.4); doc.line(mg, ty + 30, mg + 70, ty + 30);
      if (cfg.theme) { F('normal', 11, [200, 212, 230]); doc.text(clean('Theme: ' + cfg.theme), mg, ty + 50); }
      const st = M.blocks.find(b => b.stats);
      if (st) { const n = Math.min(3, st.stats.length); const bw = (W - 2 * mg - (n - 1) * 14) / n; st.stats.slice(0, n).forEach((x, i) => { const bx = mg + i * (bw + 14), by = H - 150; doc.setDrawColor(...GREEN); doc.setLineWidth(.8); doc.roundedRect(bx, by, bw, 62, 10, 10, 'S'); F('x', 22, WHITE); doc.text(clean(String(x[1])), bx + 16, by + 32); F('normal', 9.5, [200, 212, 230]); doc.text(clean(x[0]), bx + 16, by + 48); }); }
      F('normal', 8.5, [150, 170, 200]); doc.text(clean('Generated ' + U.stamp()), mg, H - 40);
      doc.addPage();
    }
    const startPage = doc.getNumberOfPages();
    let i = 0;
    for (const b of M.blocks) {
      i++; if (onProgress && i % 4 === 0) { onProgress(i / M.blocks.length); await new Promise(r => setTimeout(r, 0)); }
      if (b.h) { ensure(46); y += 6; doc.setFillColor(...GREEN); doc.roundedRect(mg, y + 1, 4, 14, 2, 2, 'F'); F('x', 13, INK); doc.text(clean(b.h), mg + 12, y + 12.5); y += 24; }
      if (b.p) { F('normal', 9, [50, 66, 92]); const lines = doc.splitTextToSize(clean(b.p), W - 2 * mg); for (const ln of lines) { ensure(13); doc.text(ln, mg, y + 9); y += 13; } y += 5; }
      if (b.stats) {
        const n = b.stats.length; const gap = 10; const bw = (W - 2 * mg - (n - 1) * gap) / n; ensure(62);
        b.stats.forEach((x, k) => { const bx = mg + k * (bw + gap); doc.setFillColor(...SOFT); doc.roundedRect(bx, y, bw, 52, 9, 9, 'F'); doc.setFillColor(...hex(x[2] || '#C9922E')); doc.roundedRect(bx, y + 10, 4, 32, 2, 2, 'F'); F('x', 17, INK); doc.text(clean(String(x[1])), bx + 14, y + 25); F('normal', 8, MUTED); doc.text(doc.splitTextToSize(clean(x[0]), bw - 20)[0], bx + 14, y + 40); });
        y += 66;
      }
      if (b.kv) { doc.autoTable({ startY: y, margin: { left: mg, right: mg, top, bottom: bot }, body: b.kv.map(([k, v]) => [clean(k), clean(v)]), theme: 'plain', styles: { font: FONT, fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, overflow: 'linebreak', valign: 'top', textColor: INK }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170, textColor: MUTED } }, alternateRowStyles: { fillColor: SOFT } }); y = doc.lastAutoTable.finalY + 12; }
      if (b.table) {
        if (!b.table.body.length) { F('normal', 9, MUTED); ensure(16); doc.text(clean(b.empty || 'No data.'), mg, y + 9); y += 18; }
        else {
          const colors = b.table.colors;
          doc.autoTable({ startY: y, margin: { left: mg, right: mg, top, bottom: bot }, head: [b.table.head.map(clean)], body: b.table.body.map(r => r.map(clean)), theme: 'plain',
            styles: { font: FONT, fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, overflow: 'linebreak', valign: 'top', textColor: INK },
            headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 8 }, alternateRowStyles: { fillColor: SOFT }, rowPageBreak: 'avoid',
            didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0 && colors) d.cell.styles.cellPadding = { top: 5, bottom: 5, left: 11, right: 6 }; if (d.section === 'body' && /OVERDUE|UNCONFIRMED|INSUFFICIENT/.test(d.cell.raw || '')) { d.cell.styles.textColor = [176, 65, 76]; d.cell.styles.fontStyle = 'bold'; } },
            didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 0 && colors && colors[d.row.index]) { doc.setFillColor(...hex(colors[d.row.index])); doc.roundedRect(d.cell.x + 3, d.cell.y + 4, 3, d.cell.height - 8, 1.5, 1.5, 'F'); } } });
          y = doc.lastAutoTable.finalY + 14;
        }
      }
      if (b.legend) { ensure(16); F('normal', 7.5, MUTED); doc.text(clean('Colors follow each event category, practice plan and department (set in Settings > Categories & colors).'), mg, y + 8); y += 18; }
      if (b.pagebreak) { if (y > top + 4) { doc.addPage(); y = top; } }
      if (b.seatmap) drawSeatmap(doc, b.seatmap, mg, W - 2 * mg, F, C);
      if (b.cal) { if (y > top + 4) { doc.addPage(); y = top; } y = drawMonth(doc, b.cal, mg, y, W - 2 * mg, H - bot - y, F); }
      if (b.matrix) drawMatrix(doc, b.matrix, mg, W - 2 * mg, F, C);
      if (b.sheets) drawSheets(doc, b.sheets, mg, W - 2 * mg, F, C);
    }
    const n = doc.getNumberOfPages(); const stamp = clean('Generated ' + U.stamp() + '  ·  Times in East Africa Time (UTC+3)');
    for (let p = startPage; p <= n; p++) {
      doc.setPage(p);
      if (img) { try { doc.addImage(img, img.includes('png') ? 'PNG' : 'JPEG', mg, 22, 30, 30); } catch (e) { /* ignore */ } }
      else { doc.setFillColor(...GREEN); doc.roundedRect(mg, 22, 30, 30, 8, 8, 'F'); F('x', 13, WHITE); doc.text(clean((cfg.name || 'C').trim()[0] || 'C'), mg + 15, 42, { align: 'center' }); }
      F('b', 11, INK); doc.text(clean(cfg.name || 'Choir'), mg + 40, 35);
      F('normal', 8, MUTED); doc.text(clean(cfg.church || ''), mg + 40, 47);
      F('b', 10.5, INK); doc.text(doc.splitTextToSize(clean(M.title), W / 2)[0], W - mg, 35, { align: 'right' });
      F('normal', 8, MUTED); doc.text(clean(M.subtitle), W - mg, 47, { align: 'right' });
      doc.setDrawColor(...LINE); doc.setLineWidth(.8); doc.line(mg, 62, W - mg, 62); doc.setDrawColor(...GREEN); doc.setLineWidth(2); doc.line(mg, 62, mg + 60, 62);
      F('normal', 7.5, MUTED); doc.text(stamp, mg, H - 22);
      const pg = `Page ${p - startPage + 1} of ${n - startPage + 1}`; const pw = doc.getTextWidth(pg) + 16;
      doc.setFillColor(...SOFT); doc.roundedRect(W - mg - pw, H - 33, pw, 16, 8, 8, 'F'); F('b', 7.5, INK); doc.text(pg, W - mg - pw / 2, H - 22, { align: 'center' });
    }
    return doc;
  };
  function drawMonth(doc, c, x, y, w, hAvail, F) {
    const { y: yr, m, days, from, to } = c;
    F('x', 18, INK); doc.text(U.MONTHS[m - 1], x, y + 16); const mw = doc.getTextWidth(U.MONTHS[m - 1]); F('normal', 18, GREEN); doc.text(' ' + yr, x + mw, y + 16); y += 28;
    const first = U.ymd(yr, m, 1); const lead = (U.dow(first) + 6) % 7; const n = U.daysInMonth(yr, m); const rows = Math.ceil((lead + n) / 7);
    const gap = 4, cw = (w - 6 * gap) / 7, hh = 14, ch = Math.max(46, (hAvail - 40 - hh) / rows - gap);
    F('b', 7.5, MUTED); ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((d, i) => doc.text(d, x + i * (cw + gap) + 4, y + 9));
    y += hh;
    const lineH = 8.2; const maxLines = Math.max(1, Math.floor((ch - 16) / lineH));
    for (let r = 0; r < rows; r++) for (let k = 0; k < 7; k++) {
      const idx = r * 7 + k - lead + 1; const cx = x + k * (cw + gap), cy = y + r * (ch + gap);
      if (idx < 1 || idx > n) continue;
      const d = U.ymd(yr, m, idx); const outRange = d < from || d > to; const its = days[d] || [];
      doc.setFillColor(...(outRange ? [249, 250, 250] : SOFT)); doc.roundedRect(cx, cy, cw, ch, 6, 6, 'F');
      F('b', 8.5, outRange ? [180, 188, 200] : INK); doc.text(String(idx), cx + 6, cy + 12);
      if (U.dow(d) === 0 || U.dow(d) === 6) { doc.setFillColor(...GREEN); doc.circle(cx + cw - 8, cy + 9, 1.4, 'F'); }
      F('normal', 6.4, INK);
      let ly = cy + 17; let shown = 0; const cap = maxLines - (its.length > maxLines ? 1 : 0);
      for (const it of its) {
        if (shown >= cap) break;
        if (it.cont) { doc.setFillColor(...L.tint(it.c || '#9b8cff', .45)); doc.roundedRect(cx + 3, ly + 1.5, cw - 6, 3.2, 1.6, 1.6, 'F'); ly += 5.5; shown++; continue; }
        const col = hex(it.c || '#C9922E'); doc.setFillColor(...L.tint(it.c || '#C9922E', .2)); doc.roundedRect(cx + 3, ly, cw - 6, lineH - 1, 2, 2, 'F'); doc.setFillColor(...col); doc.roundedRect(cx + 3, ly, 2.4, lineH - 1, 1.2, 1.2, 'F');
        let t = clean(it.t); doc.setTextColor(...INK); while (t.length > 1 && doc.getTextWidth(t) > cw - 13) t = t.slice(0, -2) + '…';
        doc.text(t, cx + 8, ly + lineH - 2.6); ly += lineH; shown++;
      }
      if (its.length > shown) { F('b', 6.2, MUTED); doc.text(`+${its.length - shown} more`, cx + 8, ly + 5); }
    }
    return y + rows * (ch + gap) + 12;
  }
  function drawSeatmap(doc, sm, x, w, F, C) {
    const gap = 5; const cw = Math.min(64, (w - 60 - (sm.cols - 1) * gap) / sm.cols); const ch = Math.min(34, cw * .62 + 8);
    const tw = sm.cols * cw + (sm.cols - 1) * gap; const bx = x + (w - tw) / 2; const rows = sm.grid.length; const th = rows * ch + (rows - 1) * gap;
    if (C.y + th + 50 > C.limit) { doc.addPage(); C.y = C.top; }
    let y = C.y + 4;
    doc.setDrawColor(...LINE); doc.setLineWidth(1.4); doc.roundedRect(bx - 14, y, tw + 28, th + 40, 22, 22, 'S');
    F('b', 7.5, MUTED); doc.text('FRONT', bx + tw / 2, y + 14, { align: 'center' });
    y += 24;
    sm.grid.forEach((row, r) => row.forEach((c, k) => {
      const cx = bx + k * (cw + gap), cy = y + r * (ch + gap);
      if (c.t === 'driver') { doc.setDrawColor(...MUTED); doc.setLineWidth(.8); doc.setLineDashPattern([2, 2], 0); doc.circle(cx + cw / 2, cy + ch / 2, Math.min(cw, ch) / 2 - 1, 'S'); doc.setLineDashPattern([], 0); F('b', 6.5, MUTED); doc.text('Driver', cx + cw / 2, cy + ch / 2 + 2, { align: 'center' }); return; }
      if (c.t !== 'seat') return;
      if (c.name) { doc.setFillColor(...L.tint(c.color || '#C9922E', .25)); doc.setDrawColor(...hex(c.color || '#C9922E')); } else { doc.setFillColor(...SOFT); doc.setDrawColor(...LINE); }
      doc.setLineWidth(.8); doc.roundedRect(cx, cy, cw, ch, 5, 5, 'FD');
      F('b', 6.8, c.name ? INK : MUTED); doc.text(String(c.no), cx + 4, cy + 8.5);
      let t = clean(c.name ? c.name.replace(/\(.*?\)/g, '').trim() : 'free'); F(c.name ? 'b' : 'normal', 6.4, c.name ? INK : [170, 180, 196]);
      const lines = doc.splitTextToSize(t, cw - 6).slice(0, 2); lines.forEach((ln, i) => { let s2 = ln; while (s2.length > 1 && doc.getTextWidth(s2) > cw - 6) s2 = s2.slice(0, -2) + '…'; doc.text(s2, cx + cw / 2, cy + 17 + i * 7.5, { align: 'center' }); });
    }));
    C.y = y + th + 26;
    if (sm.legend.length) { let lx = x; F('normal', 7.5, INK); sm.legend.forEach(([n, col]) => { doc.setFillColor(...hex(col)); doc.circle(lx + 4, C.y - 3, 3.5, 'F'); doc.text(clean(n), lx + 11, C.y); lx += doc.getTextWidth(clean(n)) + 26; }); C.y += 14; }
  }
  function drawMatrix(doc, mx, x, w, F, C) {
    const lw = Math.min(190, w * .3); const n = mx.cols.length; const gap = 3; const cw = Math.min(40, (w - lw - n * gap) / n); const rh = 15;
    const head = () => { C.ensure(30 + rh); mx.cols.forEach((c, i) => { const cx = x + lw + i * (cw + gap); doc.setFillColor(...hex(c.color)); doc.roundedRect(cx, C.y, cw, 24, 4, 4, 'F'); F('b', 6.8, WHITE); doc.text(clean(c.label), cx + cw / 2, C.y + 10, { align: 'center' }); F('normal', 6, WHITE); doc.text(clean(c.sub || ''), cx + cw / 2, C.y + 19, { align: 'center' }); }); C.y += 28; };
    head();
    mx.rows.forEach(r => {
      if (C.y + rh + gap > C.limit) { doc.addPage(); C.y = C.top; head(); }
      F('b', 7.8, INK); let t = clean(r.label); while (t.length > 1 && doc.getTextWidth(t + `  ${r.total}x`) > lw - 8) t = t.slice(0, -2) + '…'; doc.text(t, x, C.y + 10.5); const tw = doc.getTextWidth(t); F('normal', 7, MUTED); doc.text(`  ${r.total}x`, x + tw, C.y + 10.5);
      let k = 0;
      r.cells.forEach((on, i) => { const cx = x + lw + i * (cw + gap); if (on) { k++; doc.setFillColor(...hex(mx.cols[i].color)); doc.roundedRect(cx, C.y, cw, rh, 4, 4, 'F'); F('x', 7.5, WHITE); doc.text(String(k), cx + cw / 2, C.y + 10.5, { align: 'center' }); } else { doc.setFillColor(...SOFT); doc.roundedRect(cx, C.y, cw, rh, 4, 4, 'F'); } });
      C.y += rh + gap;
    });
    C.y += 10;
  }
  function drawSheets(doc, sheets, x, w, F, C) {
    const cols = w > 600 ? 3 : 2; const gap = 12; const cw = (w - (cols - 1) * gap) / cols;
    for (let i = 0; i < sheets.length; i += cols) {
      const row = sheets.slice(i, i + cols); const h = Math.max(...row.map(sh => 46 + sh.rows.length * 11.5));
      if (C.y + h > C.limit) { doc.addPage(); C.y = C.top; }
      row.forEach((sh, col) => {
        const cx = x + col * (cw + gap), y = C.y;
        doc.setFillColor(...WHITE); doc.setDrawColor(...LINE); doc.setLineWidth(.8); doc.roundedRect(cx, y, cw, h, 8, 8, 'FD');
        doc.setFillColor(...hex(sh.color)); doc.roundedRect(cx + 1, y + 1, cw - 2, 5, 2.5, 2.5, 'F');
        F('b', 8.6, INK); doc.text(clean(sh.title), cx + 9, y + 19); F('normal', 7, MUTED); doc.text(doc.splitTextToSize(clean(sh.sub), cw - 18)[0] || '', cx + 9, y + 29);
        let ly = y + 42;
        sh.rows.forEach(r => { F('normal', 7, MUTED); doc.text(clean(r[0]), cx + 9, ly); F(r[2] === 'song' ? 'b' : 'normal', 7.4, r[2] === 'song' ? INK : MUTED); let t = clean(r[1]); while (t.length > 1 && doc.getTextWidth(t) > cw - 80) t = t.slice(0, -2) + '…'; doc.text(t, cx + 68, ly); ly += 11.5; });
      });
      C.y += h + gap;
    }
  }

  /** generate → validate → offer download; never reports success without a valid PDF */
  P.generate = async (o, onProgress) => {
    const cfg = St.cfg(); const t0 = Date.now();
    const M = P.build(o);
    if (o.simulateFail) throw new Error('Simulated export failure (test mode). No PDF was created.');
    const doc = await P.render(M, cfg, onProgress);
    const buf = doc.output('arraybuffer');
    const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
    const tail = new TextDecoder().decode(new Uint8Array(buf.slice(Math.max(0, buf.byteLength - 1024))));
    if (head !== '%PDF-' || !tail.includes('%%EOF') || buf.byteLength < 800) throw new Error('The generated file failed PDF validation, so it was not offered for download.');
    return { M, buf, pages: doc.getNumberOfPages(), ms: Date.now() - t0 };
  };

  // ---------- Studio UI ----------
  A.M.pdf = {
    render(root) {
      if (!A.state.pdf || !A.state.pdf.__full) A.state.pdf = Object.assign(P.defaults(), A.state.pdf || {}, { __full: true });
      const o = A.state.pdf; o.period = Object.assign({ kind: 'quarter', year: 2027, q: 1, m: 1 }, o.period);
      const canX = A.Auth.can('export') || St.mode === 'local';
      const need = NEEDS[o.type];
      root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(280px,360px) minmax(0,1fr);align-items:start" id="pdfGrid">
        <div class="card"><h3>Document</h3>
          <div class="form" style="grid-template-columns:1fr">
            <label class="f"><span>Document type</span>${UI.sel('pT', P.TYPES.map(t => [t[0], t[1]]), o.type, null)}</label>
            ${need === 'event' || ['itinerary', 'eventcal', 'calendar', 'tasks', 'timetable', 'assign', 'readiness', 'workload', 'attendance'].includes(o.type) ? `<label class="f"><span>Event${need === 'event' ? ' <b>*</b>' : ' (optional filter)'}</span>${UI.sel('pE', UI.opt.events(), o.eventId, need === 'event' ? 'Choose…' : 'All events')}</label>` : ''}
            ${need === 'leg' ? `<label class="f"><span>Travel leg <b>*</b></span>${UI.sel('pL', St.all('travel').sort(U.by(t => t.departDate || '')).map(t => [t.id, `${(St.get('events', t.eventId) || {}).title || 'Event'} · ${t.dir === 'return' ? 'Return' : 'Outbound'} ${t.from || '?'}→${t.to || '?'} (${U.fmtDs(t.departDate)})`]), o.legId, 'Choose…')}</label>` : ''}
            ${need === 'plan' || ['timetable', 'assign', 'readiness', 'workload', 'attendance', 'hours', 'pcal'].includes(o.type) ? `<label class="f"><span>Practice plan${need === 'plan' ? ' <b>*</b>' : ' (optional filter)'}</span>${UI.sel('pP', UI.opt.plans(), o.planId, need === 'plan' ? 'Choose…' : 'All plans')}</label>` : ''}
            ${need === 'dept' || ['calendar', 'tasks', 'eventcal'].includes(o.type) ? `<label class="f"><span>Department${need === 'dept' ? ' <b>*</b>' : ' (optional filter)'}</span>${UI.sel('pD', UI.opt.depts(), o.dept, need === 'dept' ? 'Choose…' : 'All departments')}</label>` : ''}
            <label class="f"><span>Year</span>${UI.yearSel('pY', o.period.year)}</label>
            <label class="f"><span>Period</span>${UI.sel('pK', [['year', 'Full year'], ['quarter', 'Quarter'], ['month', 'Month'], ['custom', 'Custom date range']], o.period.kind, null)}</label>
            ${o.period.kind === 'quarter' ? `<label class="f"><span>Quarter</span>${UI.sel('pQ', [[1, 'Q1 (Jan–Mar)'], [2, 'Q2 (Apr–Jun)'], [3, 'Q3 (Jul–Sep)'], [4, 'Q4 (Oct–Dec)']], o.period.q, null)}</label>` : ''}
            ${o.period.kind === 'month' ? `<label class="f"><span>Month</span>${UI.sel('pM', U.MONTHS.map((m, i) => [i + 1, m]), o.period.m, null)}</label>` : ''}
            ${o.period.kind === 'custom' ? `<label class="f"><span>From</span><input type="date" id="pFrom" value="${o.period.from || `${o.period.year}-01-01`}"></label><label class="f"><span>To</span><input type="date" id="pTo" value="${o.period.to || `${o.period.year}-03-31`}"></label>` : ''}
            <label class="f"><span>Page orientation (A4)</span>${UI.sel('pO', [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], o.orient, null)}</label>
            <fieldset><legend>Content</legend><div class="checks" style="max-height:none;border:0;padding:0">
              ${[['events', 'Event details'], ['travel', 'Travel legs & departure times'], ['tasks', 'Task deadlines & departments'], ['plans', 'Work-plan activities (each department)'], ['practice', 'Practice sessions, duration & song targets'], ['songs', 'Song assignments & readiness']].map(([k, l]) => `<label><input type="checkbox" data-sec="${k}" ${o.sec[k] || (k === 'plans' && o.sec[k] !== false) ? 'checked' : ''}> ${l}</label>`).join('')}
              <label><input type="checkbox" id="pCover" ${o.cover ? 'checked' : ''}> Branded cover page</label>
            </div></fieldset>
            <details><summary class="small muted">Testing</summary><label class="small" style="display:flex;gap:6px;margin-top:6px"><input type="checkbox" id="pFail" ${o.simulateFail ? 'checked' : ''}> Simulate an export failure</label></details>
          </div>
          <div class="small muted" style="margin:10px 0">File name: <span class="mono">${esc(P.filename(o))}</span></div>
          <div class="row"><button class="btn pri" id="pGen" ${canX ? '' : 'disabled'}>Generate PDF</button><button class="btn" id="pDl" hidden>Download PDF</button></div>
          ${canX ? '' : '<p class="small muted">Your role cannot export documents.</p>'}
          <div id="pStatus" style="margin-top:10px" aria-live="polite"></div>
        </div>
        <div style="min-width:0"><div class="row between" style="margin-bottom:6px"><h3>Preview</h3><span class="small muted">Built from the latest saved data</span></div><div class="pv" id="pPrev"></div></div></div>`;
      if (window.matchMedia('(max-width: 900px)').matches) root.querySelector('#pdfGrid').style.gridTemplateColumns = '1fr';
      const set = (fn) => () => { fn(); A.state.pdf.__gen = null; A.state.pdf.__status = ''; A.render(); };
      const val = (id) => (root.querySelector('#' + id) || {}).value;
      const bind = (id, fn) => { const el = root.querySelector('#' + id); if (el) el.onchange = set(fn); };
      bind('pT', () => { o.type = val('pT'); if (['workplan', 'annual', 'deptplan', 'prep', 'brief'].includes(o.type)) o.period.kind = 'year'; });
      bind('pE', () => o.eventId = val('pE')); bind('pL', () => o.legId = val('pL')); bind('pP', () => o.planId = val('pP')); bind('pD', () => o.dept = val('pD'));
      bind('pY', () => { o.period.year = +val('pY'); o.period.from = ''; o.period.to = ''; }); bind('pK', () => o.period.kind = val('pK')); bind('pQ', () => o.period.q = +val('pQ')); bind('pM', () => o.period.m = +val('pM'));
      bind('pFrom', () => o.period.from = val('pFrom')); bind('pTo', () => o.period.to = val('pTo')); bind('pO', () => o.orient = val('pO'));
      root.querySelectorAll('[data-sec]').forEach(c => c.onchange = set(() => o.sec[c.dataset.sec] = c.checked));
      root.querySelector('#pCover').onchange = set(() => o.cover = root.querySelector('#pCover').checked);
      root.querySelector('#pFail').onchange = () => { o.simulateFail = root.querySelector('#pFail').checked; };
      const pv = root.querySelector('#pPrev');
      try { const M = P.build(o); pv.innerHTML = P.preview(M, St.cfg()); }
      catch (e) { pv.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      const status = root.querySelector('#pStatus'); const dl = root.querySelector('#pDl');
      const setStatus = (h) => { o.__status = h; status.innerHTML = h; };
      if (o.__status) status.innerHTML = o.__status;
      const showReady = (g) => { status.innerHTML = `<div class="banner info"><b>PDF ready:</b> <span class="mono">${esc(g.M.filename)}</span><br>${g.pages} page(s) · ${(g.buf.byteLength / 1024).toFixed(0)} KB · validated</div>`; dl.hidden = false; };
      if (o.__gen) showReady(o.__gen);
      dl.onclick = async () => {
        const g = o.__gen; if (!g) return;
        try { const ok = await UI.download(g.M.filename, new Blob([g.buf], { type: 'application/pdf' })); if (ok) { UI.toast('Saved ' + g.M.filename); await logExport(g.M.filename, 'ok', '', g); } }
        catch (e) { setStatus(`<div class="banner warn"><b>Download failed.</b> ${esc(e.message)}</div>`); logExport(g.M.filename, 'failed', e.message); }
      };
      root.querySelector('#pGen').onclick = async (ev) => {
        ev.target.disabled = true; dl.hidden = true; o.__gen = null; o.__status = '';
        status.innerHTML = `<div class="small">Generating PDF…</div><div class="progress"><i></i></div>`;
        try {
          const g = await P.generate(o);
          o.__gen = g; showReady(g);
          await logExport(g.M.filename, 'generated', '', g);
          dl.click();
        } catch (e) {
          setStatus(`<div class="banner warn"><b>Export failed. No PDF was created.</b><br>${esc(e.message)}</div>`);
          logExport(P.filename(o), 'failed', e.message);
        } finally { ev.target.disabled = !canX; }
      };
    },
  };
  async function logExport(filename, status, error, g) {
    if (!A.Auth.canWriteData() || St.mode === 'local') return;
    try { await St.put('exports', { filename, status: status === 'failed' ? 'failed' : 'ok', stage: status, error: error || '', pages: g ? g.pages : null, bytes: g ? g.buf.byteLength : null, by: A.Auth.uid || null }, { audit: false }); } catch (e) { /* logging is best effort */ }
  }
})(window.App);
