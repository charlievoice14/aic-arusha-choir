/* m_cal.js — calendar: year, quarter, month, week, day and list views with drag-to-reschedule */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const KINDS = [['event', 'Events'], ['rehearsal', 'Rehearsal events'], ['practice', 'Practice sessions'], ['deadline', 'Task deadlines'], ['activity', 'Work-plan activities'], ['travel', 'Travel legs']];
  const defAnchor = () => { const y = +(St.cfg().year || 2027); const t = U.today(); return +t.slice(0, 4) === y ? t : `${y}-01-01`; };

  A.M.calendar = {
    render(root, params) {
      const f = UI.stp('calendar', { view: 'month', anchor: defAnchor(), q: '', dept: '', event: '', colorBy: 'category', show: { event: true, rehearsal: true, practice: true, deadline: true, activity: true, travel: true } }, params);
      const range = rangeOf(f);
      const items = L.calItems(range[0], range[1], { show: f.show, q: f.q, dept: f.dept, event: f.event });
      COLOR_BY = f.colorBy || 'category'; items.forEach(i => { i.color = L.itemColor(i, COLOR_BY); });
      const catLegend = COLOR_BY === 'category' ? catKeys(items) : [];
      root.innerHTML = `<div class="filters cal-f">
        <label class="grow">Search<input type="search" id="cQ" value="${esc(f.q)}" placeholder="Title, venue, event"></label>
        <label>Department${UI.sel('cD', UI.opt.depts(), f.dept)}</label><label class="grow">Event${UI.sel('cE', UI.opt.events(), f.event)}</label>
        <label>Go to date<input type="date" id="cGo" value="${f.anchor}"></label><label>Color by${UI.sel('cB', [['category', 'Category (event type, plan, department)'], ['type', 'Item type']], f.colorBy || 'category', null)}</label></div>
        <div class="row between cal-bar" style="margin-bottom:10px"><div class="tabs cal-vt" style="margin:0;border:0">${[['year', 'Year'], ['quarter', 'Quarter'], ['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List']].map(([k, t]) => `<button data-v="${k}" class="${f.view === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="row cal-nav"><span class="cal-step"><button class="btn sm" id="cPrev" aria-label="Previous">◀</button><b id="cLabel">${esc(label(f))}</b><button class="btn sm" id="cNext" aria-label="Next">▶</button><button class="btn sm" id="cToday">Today</button></span>${A.Auth.can('events') ? '<button class="btn sm pri" id="cNew">New event</button>' : ''}<button class="btn sm" id="cPdf">PDF</button></div></div>
        <div class="legend cal-lg">${KINDS.map(([k, t]) => `<span class="k-${k}"><label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" data-k="${k}" ${f.show[k] !== false ? 'checked' : ''}><i></i>${t}</label></span>`).join('')}</div>${catLegend.length ? `<div class="legend">${catLegend.map(([t, c]) => `<span style="--k:${esc(c)}"><i></i>${esc(t)}</span>`).join('')}</div>` : ''}<p class="small muted" style="margin:-4px 0 10px">Times are East Africa Time (${U.TZ}). Drag items in month view to reschedule.</p>
        <div id="cBody"></div>`;
      UI.bindFilters(root, f, { cQ: 'q', cD: 'dept', cE: 'event', cB: 'colorBy' }, A.render);
      root.querySelector('#cGo').onchange = (e) => { if (U.validDate(e.target.value)) { f.anchor = e.target.value; A.render(); } };
      root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { f.view = b.dataset.v; A.render(); });
      root.querySelectorAll('[data-k]').forEach(c => c.onchange = () => { f.show = Object.assign({}, f.show, { [c.dataset.k]: c.checked }); A.render(); });
      root.querySelector('#cPrev').onclick = () => { f.anchor = shift(f, -1); A.render(); };
      root.querySelector('#cNext').onclick = () => { f.anchor = shift(f, 1); A.render(); };
      root.querySelector('#cToday').onclick = () => { f.anchor = U.today(); A.render(); };
      const nb = root.querySelector('#cNew'); if (nb) nb.onclick = () => A.M.events.edit({ startDate: f.view === 'day' ? f.anchor : '' });
      root.querySelector('#cPdf').onclick = () => { const y = +f.anchor.slice(0, 4); const p = f.view === 'year' ? { kind: 'year', year: y } : f.view === 'quarter' ? { kind: 'quarter', year: y, q: U.qOf(f.anchor) } : f.view === 'month' ? { kind: 'month', year: y, m: +f.anchor.slice(5, 7) } : { kind: 'custom', year: y, from: range[0], to: range[1] }; A.state.pdf = { type: 'calendar', period: p }; A.go('pdf'); };
      const body = root.querySelector('#cBody');
      ({ year: yearView, quarter: quarterView, month: monthView, week: weekView, day: dayView, list: listView })[f.view](body, f, items, range);
      body.querySelectorAll('.ci[data-id],.it[data-id]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); A.openItem(el.dataset.coll, el.dataset.id); }));
    },
  };
  function rangeOf(f) {
    const d = f.anchor, y = +d.slice(0, 4), m = +d.slice(5, 7);
    if (f.view === 'year') return [`${y}-01-01`, `${y}-12-31`];
    if (f.view === 'quarter') return U.qRange(y, U.qOf(d));
    if (f.view === 'month' || f.view === 'list') return U.mRange(y, m);
    if (f.view === 'week') { const s = U.addDays(d, -((U.dow(d) + 6) % 7)); return [s, U.addDays(s, 6)]; }
    return [d, d];
  }
  function label(f) {
    const d = f.anchor, y = +d.slice(0, 4), m = +d.slice(5, 7);
    if (f.view === 'year') return String(y);
    if (f.view === 'quarter') return `Q${U.qOf(d)} ${y}`;
    if (f.view === 'month' || f.view === 'list') return `${U.MONTHS[m - 1]} ${y}`;
    if (f.view === 'week') { const r = rangeOf(f); return `${U.fmtDs(r[0])} – ${U.fmtDs(r[1])} ${y}`; }
    return U.fmtD(d);
  }
  function shift(f, n) {
    const d = f.anchor, y = +d.slice(0, 4), m = +d.slice(5, 7);
    if (f.view === 'year') return `${y + n}-01-01`;
    if (f.view === 'quarter') { let q = U.qOf(d) + n, yy = y; if (q < 1) { q = 4; yy--; } if (q > 4) { q = 1; yy++; } return U.qRange(yy, q)[0]; }
    if (f.view === 'month' || f.view === 'list') { let mm = m + n, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } return U.ymd(yy, mm, 1); }
    if (f.view === 'week') return U.addDays(d, 7 * n);
    return U.addDays(d, n);
  }
  let COLOR_BY = 'category';
  function catKeys(items) {
    const m = new Map();
    items.forEach(i => {
      let t;
      if (i.coll === 'events') t = (St.get('events', i.id) || {}).category || 'Event';
      else if (i.coll === 'sessions') t = 'Practice: ' + ((St.get('plans', (St.get('sessions', i.id) || {}).planId) || {}).name || 'plan');
      else if (i.coll === 'tasks') t = 'Deadline: ' + L.deptName((St.get(i.coll, i.id) || {}).deptId);
      else if (i.coll === 'activities') t = 'Plan: ' + L.deptName((St.get(i.coll, i.id) || {}).deptId);
      else t = 'Travel';
      if (!m.has(t)) m.set(t, i.color);
    });
    return [...m.entries()].slice(0, 18);
  }
  const ci = (i, d) => `<span class="ci ${i.cancelled ? 'x' : ''} ${d && i.kind === 'activity' && L.isCont(i, d) ? 'cont' : ''} k-${i.kind}" style="--k:${esc(i.color || '')}" data-id="${esc(i.id)}" data-coll="${i.coll}" draggable="true" title="${esc(i.title + ' — ' + i.sub)}">${i.time && i.date ? '<span class="mono">' + esc(i.time) + '</span> ' : ''}${esc(i.title)}</span>`;

  function monthGrid(y, m, items, f, compact) {
    const first = U.ymd(y, m, 1); const start = U.addDays(first, -((U.dow(first) + 6) % 7));
    const today = U.today(); let html = `<div class="mgrid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dh">${d}</div>`).join('')}`;
    for (let i = 0; i < 42; i++) {
      const d = U.addDays(start, i); if (i >= 35 && +d.slice(5, 7) !== m) break;
      const its = L.itemsOn(items, d).sort((x, y) => (y.kind === 'activity') - (x.kind === 'activity'));
      html += `<div class="d ${+d.slice(5, 7) !== m ? 'out' : ''} ${d === today ? 'today' : ''}" data-date="${d}"><span class="dn">${+d.slice(8)}</span>${its.slice(0, compact ? 3 : 6).map(i => ci(i, d)).join('')}${its.length > (compact ? 3 : 6) ? `<span class="small muted">+${its.length - (compact ? 3 : 6)} more</span>` : ''}</div>`;
    }
    return html + '</div>';
  }
  function bindDays(el, f) {
    el.querySelectorAll('.d[data-date]').forEach(c => {
      c.addEventListener('click', () => { f.anchor = c.dataset.date; f.view = 'day'; A.render(); });
      c.addEventListener('dragover', e => { e.preventDefault(); c.classList.add('drop'); });
      c.addEventListener('dragleave', () => c.classList.remove('drop'));
      c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('drop'); const [coll, id] = (e.dataTransfer.getData('text/plain') || '').split('|'); if (coll && id) reschedule(coll, id, c.dataset.date); });
    });
    el.querySelectorAll('.ci[draggable]').forEach(x => x.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', x.dataset.coll + '|' + x.dataset.id)));
  }
  function monthView(el, f, items) { const y = +f.anchor.slice(0, 4), m = +f.anchor.slice(5, 7); el.innerHTML = monthGrid(y, m, items, f); bindDays(el, f); }
  function quarterView(el, f, items) {
    const y = +f.anchor.slice(0, 4), q = U.qOf(f.anchor);
    el.innerHTML = [0, 1, 2].map(k => `<h3 style="margin:12px 0 6px">${U.MONTHS[(q - 1) * 3 + k]} ${y}</h3>${monthGrid(y, (q - 1) * 3 + k + 1, items, f, true)}`).join('');
    bindDays(el, f);
  }
  function yearView(el, f, items) {
    const y = +f.anchor.slice(0, 4);
    el.innerHTML = `<div class="yr">${U.MONTHS.map((mn, k) => {
      const m = k + 1; const first = U.ymd(y, m, 1); const lead = (U.dow(first) + 6) % 7; const n = U.daysInMonth(y, m);
      const mi = items.filter(i => U.overlapRange(i.date, i.endDate || i.date, ...U.mRange(y, m)));
      let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<b>${d}</b>`).join('') + '<span></span>'.repeat(lead);
      for (let d = 1; d <= n; d++) { const ds = U.ymd(y, m, d); const its = L.itemsOn(mi, ds); const k0 = its[0] ? its[0].kind : ''; cells += `<span class="${its.length ? 'has k-' + k0 : ''}" style="${its.length ? '--k:' + esc(its[0].color) : ''}" data-day="${ds}" title="${esc(its.map(i => i.title).join('\n'))}">${d}</span>`; }
      const counts = KINDS.map(([k, t]) => [t, mi.filter(i => i.kind === k).length]).filter(x => x[1]);
      return `<div class="mini"><h3 data-m="${m}">${mn}</h3><div class="mg">${cells}</div><div class="small muted" style="margin-top:4px">${counts.map(c => c[1] + ' ' + c[0].toLowerCase()).join(' · ') || 'Nothing scheduled'}</div></div>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-m]').forEach(h => h.onclick = () => { f.anchor = U.ymd(y, +h.dataset.m, 1); f.view = 'month'; A.render(); });
    el.querySelectorAll('[data-day]').forEach(s => s.onclick = () => { f.anchor = s.dataset.day; f.view = 'day'; A.render(); });
  }
  function weekView(el, f, items, range) {
    let html = '<div style="overflow-x:auto"><div class="wk">';
    for (let i = 0; i < 7; i++) { const d = U.addDays(range[0], i); const its = L.itemsOn(items, d); html += `<div class="col d" data-date="${d}"><h3>${U.DAYS[U.dow(d)]} ${U.fmtDs(d)}</h3>${its.map(i => ci(i)).join('') || '<span class="small muted">—</span>'}</div>`; }
    el.innerHTML = html + '</div></div>'; bindDays(el, f);
  }
  function agendaList(items) {
    return items.length ? `<div class="agenda">${items.map(i => `<div class="it k-${i.kind}" style="--k:${esc(i.color || "")}" data-id="${esc(i.id)}" data-coll="${i.coll}"><div class="tm">${U.fmtDs(i.date)}${i.endDate && i.endDate !== i.date ? '–' + U.fmtDs(i.endDate) : ''}<br>${esc(i.time || 'all day')}${i.endTime ? '–' + esc(i.endTime) : ''}</div><div style="min-width:0;flex:1"><b style="${i.cancelled ? 'text-decoration:line-through' : ''}">${esc(i.title)}</b>${i.demo ? ' <span class="pill demo">DEMO</span>' : ''}<div class="small muted">${esc(KINDS.find(k => k[0] === i.kind)[1].replace(/s$/, ''))} · ${esc(i.sub)}</div></div></div>`).join('')}</div>` : '<div class="empty">Nothing scheduled.</div>';
  }
  function dayView(el, f, items) {
    el.innerHTML = `<h3 style="margin-bottom:8px">${U.fmtD(f.anchor)}</h3>${agendaList(L.itemsOn(items, f.anchor))}<div class="row" style="margin-top:10px">${A.Auth.can('events') ? '<button class="btn" id="dEv">Add event on this day</button>' : ''}${A.Auth.can('practice') ? '<button class="btn" id="dPr">Add practice session on this day</button>' : ''}</div>`;
    const a = el.querySelector('#dEv'); if (a) a.onclick = () => A.M.events.edit({ startDate: f.anchor, endDate: f.anchor });
    const b = el.querySelector('#dPr'); if (b) b.onclick = () => A.M.practice.newSingle({ date: f.anchor });
  }
  function listView(el, f, items) { el.innerHTML = agendaList(items); }

  async function reschedule(coll, id, date) {
    const rec = St.get(coll, id); if (!rec) return;
    try {
      if (coll === 'events') {
        if (!A.Auth.can('events')) throw new Error('You cannot reschedule events.');
        const delta = U.diffDays(rec.startDate, date); if (!delta) return;
        const next = Object.assign({}, rec, { startDate: date, endDate: U.addDays(rec.endDate || rec.startDate, delta) });
        const cf = L.conflicts('event', next);
        if (!(await UI.confirm(`Move <b>${esc(rec.title)}</b> from ${U.fmtD(rec.startDate)} to <b>${U.fmtD(date)}</b>?${cf.length ? `<br><br><b>Conflicts:</b> ${cf.map(c => esc(c.title + ' (' + c.why.join(', ') + ')')).join('; ')}` : ''}${rec.hostConf === 'confirmed' ? '<br><br>The host had confirmed the old date, so confirmation will be reset to "awaiting".' : ''}`, { ok: 'Move event' }))) return;
        if (rec.hostConf === 'confirmed') next.hostConf = 'awaiting';
        const saved = await St.put('events', next);
        setTimeout(() => A.M.events.dateChanged(rec, saved), 80);
        L.notifyChange('Event rescheduled', rec.title, `${U.fmtD(rec.startDate)} → ${U.fmtD(date)}`, ['events', id]);
        UI.toast('Event moved');
      } else if (coll === 'sessions') {
        if (!A.Auth.can('practice')) throw new Error('You cannot reschedule practice sessions.');
        if (rec.status === 'completed') throw new Error('Completed sessions cannot be moved.');
        const next = Object.assign({}, rec, { date }); const cf = L.conflicts('session', next);
        if (!(await UI.confirm(`Move this practice session from ${U.fmtD(rec.date)} to <b>${U.fmtD(date)}</b>? ${rec.seriesId ? 'Only this occurrence moves; the rest of the series stays.' : ''}${cf.length ? `<br><br><b>Conflicts:</b> ${cf.map(c => esc(c.title + ' (' + c.why.join(', ') + ')')).join('; ')}` : ''}`, { ok: 'Move session' }))) return;
        await L.editOccurrence(rec, { date }, 'one');
        L.notifyChange('Practice rescheduled', rec.title || (St.get('plans', rec.planId) || {}).name || 'Practice', `${U.fmtD(rec.date)} → ${U.fmtD(date)}`, ['practice', rec.planId]);
        UI.toast('Session moved');
      } else if (coll === 'tasks') {
        if (!A.Auth.can('tasks', rec)) throw new Error('You cannot change this task.');
        if (!(await UI.confirm(`Change the deadline of <b>${esc(rec.title)}</b> to ${U.fmtD(date)}?`, { ok: 'Change deadline' }))) return;
        await St.patch('tasks', id, { due: date }); UI.toast('Deadline changed');
      } else if (coll === 'travel') {
        if (!A.Auth.can('travel')) throw new Error('You cannot change travel.');
        const delta = U.diffDays(rec.departDate, date);
        if (!(await UI.confirm(`Move this travel leg to ${U.fmtD(date)}? It will be marked unconfirmed until the booking is re-confirmed with the provider.`, { ok: 'Move leg' }))) return;
        await St.patch('travel', id, { departDate: date, arriveDate: rec.arriveDate ? U.addDays(rec.arriveDate, delta) : rec.arriveDate, confirmed: false }); UI.toast('Travel leg moved');
      } else UI.toast('This item is moved from its own page.', true);
    } catch (e) { UI.fail(e); }
  }
})(window.App);
