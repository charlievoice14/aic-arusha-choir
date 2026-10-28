/* m_dash.js — main dashboard: live statistics from saved records */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, C = A.Charts, esc = U.esc;

  /** shared scope helper: year + quarter + dept + event + status */
  A.scope = (f) => {
    const y = +(f.year || St.cfg().year || 2027);
    const [a, b] = f.q ? U.qRange(y, +f.q) : [`${y}-01-01`, `${y}-12-31`];
    return { y, a, b };
  };

  A.M.dashboard = {
    render(root) {
      const f = UI.st('dash', { year: St.cfg().year || 2027, q: '', dept: '', event: '', status: '' });
      const { y, a, b } = A.scope(f); const today = U.today();
      const cfg = St.cfg();
      // activities
      const acts = St.live('activities').filter(x => +x.year === y && (!f.q || U.overlapRange(x.start || x.end || `${y}-01-01`, x.end || x.start || `${y}-12-31`, a, b)) && (!f.dept || x.deptId === f.dept));
      const actDone = acts.filter(x => x.status === 'completed').length;
      // events
      const evs = St.live('events').filter(e => e.startDate && U.overlapRange(e.startDate, e.endDate || e.startDate, a, b) && (!f.dept || (e.depts || []).includes(f.dept)) && (!f.event || e.id === f.event) && (!f.status || e.status === f.status));
      const upcoming = evs.filter(e => e.startDate >= today && e.status !== 'cancelled');
      const approved = evs.filter(e => e.approval === 'approved').length, confirmed = evs.filter(e => e.hostConf === 'confirmed').length, unconf = evs.filter(e => e.hostConf === 'awaiting').length;
      // practice
      const plans = St.all('plans').filter(p => (+p.year === y || !p.year) && (!f.event || p.eventId === f.event) && (!f.dept || (p.depts || []).includes(f.dept)));
      let sess = []; plans.forEach(p => sess.push(...L.planSessions(p.id)));
      sess = sess.filter(s => U.inRange(s.date, a, b));
      const elig = sess.filter(L.eligible);
      const upSess = elig.filter(s => s.status === 'scheduled' && s.date >= today);
      const days = U.uniq(elig.map(s => s.date)).length;
      const pMin = elig.reduce((t, s) => t + (L.sessNet(s) || 0), 0);
      const aRec = elig.filter(s => s.status === 'completed' && L.sessActualNet(s) != null);
      const aMin = aRec.reduce((t, s) => t + L.sessActualNet(s), 0);
      const slots = elig.reduce((t, s) => t + L.sessSlots(s).n, 0);
      const doneSlots = elig.filter(s => s.status === 'completed').reduce((t, s) => { const as = L.sessAssign(s.id); return t + (as.length ? as.filter(x => x.done).length : (+s.actualSongs || 0)); }, 0);
      const songStage = new Map();
      plans.forEach(p => L.planSongIds(p).forEach(id => { const st = L.stage(p.id, id); const prev = songStage.get(id); songStage.set(id, prev && prev !== 'ready' ? prev : st); }));
      const ready = [...songStage.values()].filter(s => s === 'ready').length;
      const more = songStage.size - ready;
      // tasks
      const tasks = St.live('tasks').filter(t => (!f.dept || t.deptId === f.dept) && (!f.event || (t.linkType === 'event' && t.linkId === f.event)));
      const soon = tasks.filter(t => t.due && t.due >= today && U.diffDays(today, t.due) <= 14 && !['completed', 'cancelled'].includes(t.status));
      const overdue = tasks.filter(t => L.taskOverdue(t, today));
      const att = L.attStats(elig);
      const stat = UI.stat;
      root.innerHTML = `
        <div class="hero-h"><div style="flex:1;min-width:220px"><div class="muted small">${esc(cfg.church || '')}</div><h2>${esc(cfg.name || 'Choir Planner')}<br><em>${y} planning</em></h2>${cfg.theme ? `<div class="muted">Theme: <span style="color:var(--gold)">${esc(cfg.theme)}</span></div>` : ''}</div>
        <div class="row"><button class="btn" id="dNewEv">New event</button><button class="btn" id="dNewPlan">New practice plan</button><button class="btn pri" id="dPdf">Export Q1 calendar</button></div></div>
        <div class="filters">
          <label>Year${UI.yearSel('dY', f.year)}</label>
          <label>Quarter${UI.sel('dQ', [[1, 'Q1 Jan–Mar'], [2, 'Q2 Apr–Jun'], [3, 'Q3 Jul–Sep'], [4, 'Q4 Oct–Dec']], f.q, 'Full year')}</label>
          <label>Department${UI.sel('dD', UI.opt.depts(), f.dept)}</label>
          <label class="grow">Event${UI.sel('dE', UI.opt.events(), f.event)}</label>
          <label>Event status${UI.sel('dS', L.EVENT_STATUS, f.status)}</label>
          <span class="muted small" style="align-self:center">Period: ${U.fmtD(a)} – ${U.fmtD(b)}</span>
        </div>
        <div class="kpis">
          ${kpi('k1', 'events', 'Upcoming events', upcoming.length, `${approved} approved · ${unconf} awaiting host`, ['events', { when: 'upcoming', year: y }])}
          ${kpi('k2', 'practice', 'Practice sessions ahead', upSess.length, `${U.hrs(pMin)} scheduled`, ['practice', { tab: 'sessions', when: 'upcoming' }])}
          ${kpi('k3', 'songs', 'Songs ready', `${ready}/${songStage.size}`, `${more} need more work`, ['songs', { tab: 'readiness' }])}
          ${kpi('k4', 'tasks', 'Overdue tasks', overdue.length, `${soon.length} due in 14 days`, ['tasks', { view: 'overdue' }])}
        </div>
        <div class="stats">
          ${stat(acts.length, 'Annual activities', { go: ['workplan', { year: y, q: f.q, dept: f.dept }] })}
          ${stat(`${actDone}<span class="muted small"> / ${acts.length}</span>`, 'Activities completed vs planned', { go: ['workplan', { year: y, q: f.q, status: 'completed' }], tone: acts.length && actDone === acts.length ? 'ok' : '' })}
          ${stat(upcoming.length, 'Upcoming events', { go: ['events', { when: 'upcoming', year: y }] })}
          ${stat(approved, 'Approved events (internal)', { go: ['events', { approval: 'approved', year: y }], tone: 'ok' })}
          ${stat(confirmed, 'Confirmed by host', { go: ['events', { hostConf: 'confirmed', year: y }], tone: 'ok' })}
          ${stat(unconf, 'Awaiting host confirmation', { go: ['events', { hostConf: 'awaiting', year: y }], tone: unconf ? 'warn' : '' })}
          ${stat(upSess.length, 'Upcoming practice sessions', { go: ['practice', { tab: 'sessions', when: 'upcoming' }] })}
          ${stat(days, 'Planned practice days', { f: 'distinct dates', go: ['practice', { tab: 'sessions' }] })}
          ${stat(U.hrs(pMin), 'Scheduled practice hours', { f: aRec.length ? 'actual ' + U.hrs(aMin) : 'no actual times yet', go: ['reports', { tab: 'practice' }] })}
          ${stat(songStage.size, 'Unique songs in repertoire plans', { go: ['songs', { tab: 'readiness' }] })}
          ${stat(`${doneSlots}<span class="muted small"> / ${slots}</span>`, 'Song-practice slots done / planned', { f: `${Math.max(0, slots - doneSlots)} remaining`, go: ['practice', { tab: 'sessions' }] })}
          ${stat(ready, 'Songs ready for performance', { tone: 'ok', go: ['songs', { tab: 'readiness', stage: 'ready' }] })}
          ${stat(more, 'Songs needing more practice', { tone: more ? 'warn' : '', go: ['songs', { tab: 'readiness', stage: 'notready' }] })}
          ${stat(soon.length, 'Task deadlines (next 14 days)', { go: ['tasks', { view: 'list', due: 'soon' }] })}
          ${stat(overdue.length, 'Overdue tasks', { tone: overdue.length ? 'bad' : 'ok', go: ['tasks', { view: 'overdue' }] })}
          ${stat(att.pct == null ? '—' : att.pct + '%', 'Rehearsal attendance', { f: att.recorded ? `${att.recorded} session(s) recorded` : (att.missing ? `${att.missing} completed without records` : 'no attendance recorded'), go: ['reports', { tab: 'attendance' }] })}
        </div>
        <div class="grid g2">
          <div class="card"><h3>Events by status</h3>${C.donut(L.EVENT_STATUS.map(([k, l]) => ({ label: l, value: evs.filter(e => e.status === k).length, go: ['events', { status: k, year: y }] })).filter(x => x.value), String(evs.length), 'events')}${evs.length ? '' : '<p class="muted small">No events in this period.</p>'}</div>
          <div class="card"><h3>Events by category</h3>${C.donut(U.uniq(evs.map(e => e.category || 'Other')).map(c => ({ label: c, value: evs.filter(e => (e.category || 'Other') === c).length, color: L.catColor(c), go: ['events', { cat: c, year: y }] })), String(evs.length), 'events')}${evs.length ? '' : '<p class="muted small">No events in this period.</p>'}</div>
          <div class="card"><h3>Practice hours by month</h3><p class="muted small" style="margin:0 0 4px">Planned (scheduled, net of breaks) vs actual (recorded after practice)</p>${monthlyHours(elig, y, a, b)}</div>
          <div class="card"><h3>Repertoire readiness</h3>${C.donut(L.STAGES.map(([k, l]) => ({ label: l, value: [...songStage.values()].filter(s => s === k).length, go: ['songs', { tab: 'readiness', stage: k }] })).filter(x => x.value), String(songStage.size), 'unique songs')}${songStage.size ? '' : '<p class="muted small">Add songs to a practice plan to track readiness.</p>'}</div>
          <div class="card"><h3>Activity progress by department</h3>${deptProgress(acts) || '<p class="muted small">No activities in this period.</p>'}</div>
        </div>
        <div class="grid g2" style="margin-top:12px">
          <div class="card"><div class="row between"><h3>Coming up</h3><button class="btn sm ghost" data-go='["calendar",{}]'>Open calendar →</button></div><div class="agenda">${agenda(today)}</div></div>
          <div class="card"><div class="row between"><h3>Practice plans</h3><button class="btn sm ghost" data-go='["practice",{}]'>Practice Planner →</button></div>${planCards(plans, today)}</div>
        </div>`;
      UI.bindFilters(root, f, { dY: 'year', dQ: 'q', dD: 'dept', dE: 'event', dS: 'status' }, A.render);
      UI.bindGo(root);
      root.querySelector('#dNewEv').onclick = () => A.M.events.edit();
      root.querySelector('#dNewPlan').onclick = () => A.M.practice.editPlan();
      root.querySelector('#dPdf').onclick = () => { A.state.pdf = null; A.go('pdf'); };
      root.querySelectorAll('.agenda [data-open]').forEach(el => el.onclick = () => A.openItem(el.dataset.coll, el.dataset.open));
    },
  };
  const kpi = (k, ic, label, v, f, go) => `<button class="kpi ${k}" data-go='${esc(JSON.stringify(go))}'><span class="h"><i>${A.icon(ic)}</i>${esc(label)}</span><span class="b"><span class="v">${v}</span><span class="f">${esc(f)}</span></span></button>`;
  function monthlyHours(elig, y, a, b) {
    const months = []; for (let m = +a.slice(5, 7); m <= +b.slice(5, 7); m++) months.push(m);
    const plan = months.map(m => elig.filter(s => +s.date.slice(5, 7) === m && +s.date.slice(0, 4) === y).reduce((t, s) => t + (L.sessNet(s) || 0), 0) / 60);
    const act = months.map(m => { const c = elig.filter(s => +s.date.slice(5, 7) === m && s.status === 'completed' && L.sessActualNet(s) != null); return c.length ? c.reduce((t, s) => t + L.sessActualNet(s), 0) / 60 : null; });
    if (!plan.some(Boolean)) return '<p class="muted small">No practice sessions scheduled in this period.</p>';
    return C.lines(months.map(m => U.MON[m - 1]), [{ name: 'Planned hours', values: plan }, { name: 'Actual hours', values: act }], { unit: 'h', aria: 'Planned and actual practice hours by month' });
  }
  function deptProgress(acts) {
    const by = {}; acts.forEach(x => { const k = x.deptId || ''; (by[k] = by[k] || []).push(x); });
    return C.meters(Object.entries(by).map(([k, xs]) => ({ label: k ? L.deptName(k) : 'No department', value: xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length, max: 100, sub: `${xs.filter(x => x.status === 'completed').length}/${xs.length} done · ${Math.round(xs.reduce((t, x) => t + (+x.progress || 0), 0) / xs.length)}%` })));
  }
  function agenda(today) {
    const items = L.calItems(today, U.addDays(today, 21), { hideCancelledPractice: true }).slice(0, 10);
    if (!items.length) return '<div class="empty">Nothing scheduled in the next three weeks.</div>';
    return items.map(i => `<div class="it k-${i.kind}" style="--k:${esc(L.itemColor(i, "category"))}" data-open="${esc(i.id)}" data-coll="${i.coll}"><div class="tm">${U.fmtDs(i.date)}${i.time ? '<br>' + esc(i.time) : ''}</div><div style="min-width:0"><b>${esc(i.title)}</b>${i.demo ? ' <span class="pill demo">DEMO</span>' : ''}<div class="small muted">${esc(i.sub)}</div></div></div>`).join('');
  }
  function planCards(plans, today) {
    const ps = plans.filter(p => p.status !== 'cancelled').slice(0, 5);
    if (!ps.length) return '<div class="empty">No practice plans yet.</div>';
    return ps.map(p => { const fz = L.feasibility(p, today); const m = fz.m; const pr = m.unique ? Math.round(m.ready / m.unique * 100) : null; return `<div style="padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer" data-go='${esc(JSON.stringify(['practice', { plan: p.id }]))}'><div class="row between"><b>${esc(p.name)}</b>${UI.demo(p)}<span class="pill ${fz.tgt ? (fz.ok ? 'ok' : 'bad') : ''}">${fz.tgt ? (fz.ok ? 'On track (estimate)' : 'At risk (estimate)') : 'No target date'}</span></div><div class="small muted">${m.ready}/${m.unique} songs ready · ${m.sessions} sessions · ${U.hrs(m.plannedMin)} planned${fz.tgt ? ' · target ' + U.fmtD(fz.tgt) : ''}</div>${UI.bar(pr, 'gold')}</div>`; }).join('');
  }
  /** open any record by collection */
  A.openItem = (coll, id) => {
    if (coll === 'events') return A.M.events.view(id);
    if (coll === 'sessions') return A.M.practice.editSession(St.get('sessions', id));
    if (coll === 'tasks') return A.M.tasks.edit(St.get('tasks', id));
    if (coll === 'travel') return A.M.travel.edit(St.get('travel', id));
    if (coll === 'activities') return A.M.workplan.editActivity(St.get('activities', id));
  };
})(window.App);
