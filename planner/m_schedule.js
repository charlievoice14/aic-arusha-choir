/* m_schedule.js — Schedule: the choir's available practice times, and the song planner built from them */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const WD = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
  const KINDS = [['practice', 'Practice / rehearsal'], ['service', 'Service / ministry'], ['other', 'Other availability']];
  const can = () => A.Auth.can('practice');
  const slots = (all) => St.all('slots').filter(s => all || s.active !== false).sort(U.by(s => (s.start || '') + s.name));
  const slotLabel = (s) => `${s.name} · ${(s.weekdays || []).map(d => U.DAYS[d]).join('/')} ${s.start}–${s.end}`;
  const netOf = (s) => U.net(s.start, s.end, s.breakMin) || 0;

  const fields = () => [
    { k: 'name', label: 'Name', req: true, placeholder: 'e.g. Weekday rehearsal' }, { k: 'kind', label: 'Type', type: 'select', options: KINDS, blank: false },
    { k: 'weekdays', label: 'Days', type: 'multi', req: true, options: WD.map(([a, b]) => [String(a), b]) },
    { k: 'freq', label: 'Repeats', type: 'select', options: [['weekly', 'Every week'], ['biweekly', 'Every two weeks']], blank: false },
    { k: 'start', label: 'Start time', type: 'time', req: true }, { k: 'end', label: 'End time', type: 'time', req: true }, { k: 'breakMin', label: 'Break (minutes)', type: 'number', min: 0 },
    { k: 'venue', label: 'Venue' }, { k: 'leaderId', label: 'Usual leader', type: 'select', options: UI.opt.members() },
    { k: 'sections', label: 'Sections who attend (empty = full choir)', type: 'multi', options: UI.opt.sections() },
    { k: 'validFrom', label: 'Available from', type: 'date' }, { k: 'validTo', label: 'Available until', type: 'date' },
    { k: 'color', label: 'Color', type: 'color', full: true },
    { k: 'skipHolidays', label: 'Skip choir holidays', type: 'checkbox' }, { k: 'active', label: 'Active', type: 'checkbox' },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  function edit(rec) {
    const isNew = !rec;
    rec = Object.assign({ kind: 'practice', freq: 'weekly', weekdays: [], start: '17:30', end: '19:30', breakMin: 10, skipHolidays: true, active: true, color: L.PALETTE[St.all('slots').length % L.PALETTE.length][0], validFrom: `${St.cfg().year || 2027}-01-01`, validTo: `${St.cfg().year || 2027}-12-31` }, rec || {});
    UI.edit({
      title: isNew ? 'Add available time' : rec.name, fields: fields(), rec: Object.assign({}, rec, { weekdays: (rec.weekdays || []).map(String) }), canEdit: can(), wide: true,
      after: (b) => { const out = document.createElement('div'); out.className = 'calc'; out.style.marginTop = '8px'; b.appendChild(out); const upd = () => { const s = b.querySelector('[name=start]').value, e = b.querySelector('[name=end]').value, br = b.querySelector('[name=breakMin]').value; const n = U.net(s, e, br); out.textContent = n == null ? '' : `Each session: ${U.gross(s, e)} min − ${+br || 0} min break = ${n} min of practice`; }; b.addEventListener('input', upd); upd(); },
      validate: v => { const e = []; if (U.gross(v.start, v.end) === 0) e.push('End time must differ from start time.'); if (v.validFrom && v.validTo && v.validTo < v.validFrom) e.push('"Available until" is before "Available from".'); return e; },
      onSave: (v) => St.put('slots', Object.assign({}, rec, v, { weekdays: (v.weekdays || []).map(Number) }), { summary: 'Schedule ' + v.name }),
      deleteFn: !isNew ? async () => { const used = St.all('series').some(s => s.slotId === rec.id); if (used) { await St.patch('slots', rec.id, { active: false }); UI.toast('This time is used by practice plans, so it was set to inactive instead of deleted.'); } else await St.del('slots', rec.id); } : null,
    });
  }

  A.M.schedule = {
    render(root, params) {
      const f = UI.stp('schedule', { tab: 'week' }, params);
      root.innerHTML = `<div class="row between" style="margin-bottom:12px"><div class="tabs" style="margin:0">${[['week', 'Weekly availability'], ['planner', 'Song practice planner'], ['upcoming', 'Next 4 weeks']].map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>${can() ? '<button class="btn pri" id="slNew">Add available time</button>' : ''}</div><div id="slBody"></div>`;
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
      const nb = root.querySelector('#slNew'); if (nb) nb.onclick = () => edit();
      const el = root.querySelector('#slBody');
      ({ week, planner, upcoming })[f.tab](el, f, params);
    },
    edit, slots, slotLabel,
  };

  function week(el) {
    const all = slots(true); const act = all.filter(s => s.active !== false); const pr = act.filter(s => s.kind === 'practice');
    const perWeek = pr.reduce((t, s) => t + (s.weekdays || []).length * (s.freq === 'biweekly' ? .5 : 1), 0);
    const minWeek = pr.reduce((t, s) => t + (s.weekdays || []).length * netOf(s) * (s.freq === 'biweekly' ? .5 : 1), 0);
    el.innerHTML = `<div class="stats">${UI.stat(pr.length, 'Active practice times')}${UI.stat(perWeek % 1 ? perWeek.toFixed(1) : perWeek, 'Practice sessions per week')}${UI.stat(U.hrs(minWeek), 'Practice hours per week', { f: 'net of breaks' })}${UI.stat(act.length - pr.length, 'Other available times')}</div>
      <p class="small muted">These are the times your choir can meet. Practice plans, single practices and events read their times, durations and venues from here, and the Song practice planner turns them into a dated plan of which songs to practise when.</p>
      <div class="sched">${WD.map(([d, n]) => { const ds = all.filter(s => (s.weekdays || []).includes(d)); return `<div class="day"><h3>${n.slice(0, 3)}</h3>${ds.map(s => `<div class="slot ${s.active === false ? 'off' : ''}" style="--c:${esc(L.slotColor(s))}" data-s="${s.id}"><b>${esc(s.name)}</b><span class="num">${esc(s.start)}–${esc(s.end)}</span> · ${netOf(s)} min<div class="muted">${esc(s.venue || 'venue not set')}${s.freq === 'biweekly' ? ' · every 2 weeks' : ''}</div></div>`).join('') || '<span class="small muted">—</span>'}</div>`; }).join('')}</div>
      ${all.length ? '' : `<div class="empty" style="margin-top:12px">No available times yet. Add your regular rehearsal times, e.g. Tuesday & Thursday 17:30–19:30 and Saturday 14:00–17:00.${can() ? '<br><br><button class="btn pri" id="slFirst">Add available time</button>' : ''}</div>`}`;
    el.querySelectorAll('[data-s]').forEach(c => c.onclick = () => edit(St.get('slots', c.dataset.s)));
    const fb = el.querySelector('#slFirst'); if (fb) fb.onclick = () => edit();
  }

  function upcoming(el) {
    const t = U.today(); const end = U.addDays(t, 27);
    const rows = []; slots().forEach(s => L.slotDates(s, t, end).forEach(d => rows.push({ d, s })));
    rows.sort(U.by(r => r.d + r.s.start));
    const booked = (r) => St.all('sessions').find(x => x.date === r.d && x.status !== 'cancelled' && x.start === r.s.start);
    el.innerHTML = rows.length ? `<div class="agenda">${rows.map(r => { const b = booked(r); const p = b && St.get('plans', b.planId); return `<div class="it" style="--k:${esc(L.slotColor(r.s))}"><div class="tm">${U.fmtD(r.d)}<br>${esc(r.s.start)}–${esc(r.s.end)}</div><div style="flex:1;min-width:0"><b>${esc(r.s.name)}</b><div class="small muted">${esc(r.s.venue || '')} · ${netOf(r.s)} min · ${b ? 'Booked: ' + esc((p && p.name) || 'practice') + ` (${L.sessSlots(b).n} songs)` : 'Free'}</div></div>${b ? '<span class="pill ok">Planned</span>' : '<span class="pill">Open</span>'}</div>`; }).join('')}</div>` : '<div class="empty">No available times in the next four weeks.</div>';
  }

  // ---------- Song practice planner ----------
  function planner(el, f, params) {
    const st = A.state.sp = Object.assign({ planId: '', eventId: '', from: '', to: '', slotIds: null, songIds: null, est: {}, warmup: 10, reserve: 15, perSession: 0, result: null, tempId: U.uid('pl_') }, A.state.sp || {}, params && params.planId && !params.__sp ? { planId: params.planId, result: null, slotIds: null, songIds: null } : {});
    if (params) params.__sp = true;
    const plan = st.planId && St.get('plans', st.planId);
    const ev = (plan && plan.eventId && St.get('events', plan.eventId)) || (st.eventId && St.get('events', st.eventId));
    const target = plan ? L.planTargetDate(plan) : (ev && ev.startDate);
    if (!st.from) st.from = (plan && plan.start && plan.start > U.today() ? plan.start : U.today() > `${St.cfg().year || 2027}-01-01` ? U.today() : `${St.cfg().year || 2027}-01-01`);
    if (!st.to && target) st.to = U.addDays(target, -1);
    const prs = slots().filter(s => s.kind === 'practice');
    if (!st.slotIds) st.slotIds = prs.map(s => s.id);
    const lib = St.live('songs').filter(s => s.status !== 'retired').sort(U.by('title'));
    if (!st.songIds) st.songIds = plan ? L.planSongIds(plan) : (ev && ev.songIds) || [];
    const est = (id) => Object.assign({}, L.songEst(plan ? plan.id : st.tempId, id), st.est[id] || {});
    const occ = (st.from && st.to) ? prs.filter(s => st.slotIds.includes(s.id)).reduce((t, s) => t + L.slotDates(s, st.from, st.to).length, 0) : 0;
    const occMin = (st.from && st.to) ? prs.filter(s => st.slotIds.includes(s.id)).reduce((t, s) => t + L.slotDates(s, st.from, st.to).length * netOf(s), 0) : 0;
    const need = st.songIds.reduce((t, id) => t + est(id).sessions * est(id).min, 0);
    el.innerHTML = `<div class="grid g2">
      <div class="card"><h3>1 · What are you preparing for?</h3><div class="form">
        <label class="f full"><span>Existing practice plan</span>${UI.sel('spPlan', UI.opt.plans(), st.planId, 'None, start a new plan')}</label>
        ${plan ? '' : `<label class="f full"><span>…or an event (creates a plan)</span>${UI.sel('spEv', UI.opt.events(), st.eventId, 'No event (general development)')}</label>`}
        <label class="f"><span>First practice from</span><input type="date" id="spFrom" value="${esc(st.from)}"></label>
        <label class="f"><span>Last practice by</span><input type="date" id="spTo" value="${esc(st.to)}"></label>
        </div>${target ? `<p class="small muted" style="margin-top:8px">Performance: <b>${U.fmtD(target)}</b>. Practices end the day before.</p>` : ''}</div>
      <div class="card"><h3>2 · Practice times from your schedule</h3>${prs.length ? prs.map(s => `<label class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-sl="${s.id}" ${st.slotIds.includes(s.id) ? 'checked' : ''}> ${UI.chip(s.name, L.slotColor(s))} <span class="small">${(s.weekdays || []).map(d => U.DAYS[d]).join(', ')} · ${esc(s.start)}–${esc(s.end)} · ${netOf(s)} min${s.freq === 'biweekly' ? ' · fortnightly' : ''}</span></label>`).join('') : `<div class="empty">No practice times in the schedule yet.${can() ? ' <button class="btn sm" id="spAddSlot">Add one</button>' : ''}</div>`}
        <p class="small" style="margin-top:8px"><b class="num">${occ}</b> session(s) · <b class="num">${U.hrs(occMin)}</b> available between ${U.fmtDs(st.from)} and ${U.fmtDs(st.to)}</p></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="row between"><h3>3 · Songs to prepare</h3><span class="small muted">${st.songIds.length} selected · estimated need ${U.hrs(need)} (before revision time)</span></div>
      <div class="filters" style="margin:6px 0"><label class="grow">Find<input type="search" id="spQ" placeholder="Filter songs" value="${esc(st.q || '')}"></label><label>Add a collection${UI.sel('spCol', UI.opt.collections(), '', 'Choose…')}</label></div>
      <div class="tw" style="max-height:360px;overflow:auto"><table class="t"><thead><tr><th></th><th>Song</th><th>Difficulty</th><th>Sessions needed</th><th>Minutes each</th><th>Readiness</th></tr></thead><tbody>
      ${lib.filter(s => !st.q || (s.title || '').toLowerCase().includes(st.q.toLowerCase())).map(s => { const e = est(s.id); const on = st.songIds.includes(s.id); return `<tr><td><input type="checkbox" data-song="${s.id}" ${on ? 'checked' : ''} aria-label="Select"></td><td><b>${esc(s.title)}</b>${s.key ? ` <span class="muted small">${esc(s.key)}</span>` : ''}</td><td>${UI.pill(s.difficulty || 'moderate', null, s.difficulty === 'difficult' ? 'warn' : s.difficulty === 'easy' ? 'ok' : 'info')}</td><td><input type="number" min="1" max="20" data-es="${s.id}" value="${e.sessions}" style="width:70px" ${on ? '' : 'disabled'}></td><td><input type="number" min="5" max="90" step="5" data-em="${s.id}" value="${e.min}" style="width:70px" ${on ? '' : 'disabled'}></td><td>${plan ? UI.pill(L.stage(plan.id, s.id), L.STAGES) : '<span class="muted small">new</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">The song library is empty. Add songs in Song Library first.</td></tr>'}
      </tbody></table></div></div>
    <div class="card" style="margin-top:14px"><h3>4 · Session settings</h3><div class="form">
      <label class="f"><span>Warm-up at the start (minutes)</span><input type="number" id="spWarm" min="0" max="60" value="${st.warmup}"></label>
      <label class="f"><span>Time kept for revision & run-throughs (%)</span><input type="number" id="spRes" min="0" max="70" value="${st.reserve}"></label>
      <label class="f"><span>Most songs per session (0 = fit by time)</span><input type="number" id="spMax" min="0" max="20" value="${st.perSession}"></label></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="spBuild" ${can() && prs.length ? '' : 'disabled'}>Build the song planner</button><span class="small muted">You'll see a preview before anything is saved.</span></div></div>
    <div id="spOut" style="margin-top:14px"></div>`;
    const sync = () => { st.from = el.querySelector('#spFrom').value; st.to = el.querySelector('#spTo').value; st.warmup = +el.querySelector('#spWarm').value || 0; st.reserve = +el.querySelector('#spRes').value || 0; st.perSession = +el.querySelector('#spMax').value || 0; };
    const rer = () => { sync(); st.result = null; A.rerender(); };
    el.querySelector('#spPlan').onchange = (e) => { st.planId = e.target.value; st.from = ''; st.to = ''; st.songIds = null; st.result = null; st.eventId = ''; A.render(); };
    const se = el.querySelector('#spEv'); if (se) se.onchange = (e) => { st.eventId = e.target.value; st.to = ''; st.songIds = null; st.result = null; A.render(); };
    ['#spFrom', '#spTo'].forEach(id => el.querySelector(id).onchange = rer);
    el.querySelectorAll('[data-sl]').forEach(c => c.onchange = () => { st.slotIds = c.checked ? U.uniq([...st.slotIds, c.dataset.sl]) : st.slotIds.filter(x => x !== c.dataset.sl); rer(); });
    el.querySelectorAll('[data-song]').forEach(c => c.onchange = () => { st.songIds = c.checked ? U.uniq([...st.songIds, c.dataset.song]) : st.songIds.filter(x => x !== c.dataset.song); rer(); });
    el.querySelectorAll('[data-es],[data-em]').forEach(i => i.onchange = () => { const id = i.dataset.es || i.dataset.em; st.est[id] = Object.assign({}, st.est[id] || {}, i.dataset.es ? { sessions: +i.value } : { min: +i.value }); rer(); });
    const q = el.querySelector('#spQ'); q.oninput = U.debounce(() => { st.q = q.value; sync(); A.rerender(); }, 250);
    el.querySelector('#spCol').onchange = (e) => { const c = St.get('collections', e.target.value); if (c) { st.songIds = U.uniq([...st.songIds, ...(c.songIds || [])]); rer(); } };
    const as = el.querySelector('#spAddSlot'); if (as) as.onclick = () => edit();
    el.querySelector('#spBuild').onclick = () => { sync(); try { st.result = build(st, plan, ev); showResult(el.querySelector('#spOut'), st, plan, ev); el.querySelector('#spOut').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { UI.fail(e); } };
    if (st.result) showResult(el.querySelector('#spOut'), st, plan, ev);
  }

  function build(st, plan, ev) {
    if (!U.validDate(st.from) || !U.validDate(st.to) || st.to < st.from) throw new Error('Choose a valid date range.');
    if (!st.slotIds.length) throw new Error('Tick at least one practice time from the schedule.');
    if (!st.songIds.length) throw new Error('Tick at least one song.');
    const pl = plan || { id: st.tempId, sections: [], target: ev ? ev.startDate : st.to, eventId: ev ? ev.id : '', reservePct: st.reserve };
    const series = slots().filter(s => st.slotIds.includes(s.id)).map(s => L.slotToSeries(s, pl, st.from, st.to, { songTarget: st.perSession || 0 }));
    const virt = []; const clash = [];
    series.forEach(sr => {
      const cover = [];
      L.genDates(sr, St.cfg().holidays).forEach(d => {
        const own = St.get('sessions', L.occId(sr.id, d));
        if (own) { if (own.status === 'scheduled') virt.push(own); return; }
        const probe = L.sessionFromSeries(sr, d); const pr = L.sessRange(probe);
        const other = St.all('sessions').find(x => x.date === d && x.status !== 'cancelled' && (() => { const r = L.sessRange(x); return pr[0] < r[1] && r[0] < pr[1]; })());
        if (other) { cover.push(d); if (other.planId === pl.id) { if (other.status === 'scheduled' && !virt.some(v => v.id === other.id)) virt.push(other); } else clash.push(`${U.fmtD(d)} ${sr.startTime}: already used by "${(St.get('plans', other.planId) || {}).name || 'another plan'}"`); return; }
        virt.push(probe);
      });
      sr.exclusions = U.uniq([...(sr.exclusions || []), ...cover]);
    });
    const sessions = virt.sort(U.by(s => s.date + s.start));
    // other already-scheduled sessions of this plan inside the range also take songs
    if (plan) L.planSessions(plan.id).filter(s => s.status === 'scheduled' && U.inRange(s.date, st.from, st.to) && !sessions.some(x => x.id === s.id)).forEach(s => sessions.push(s));
    sessions.sort(U.by(s => s.date + s.start));
    const planLike = Object.assign({}, pl, { target: plan ? L.planTargetDate(plan) : (ev ? ev.startDate : U.addDays(st.to, 1)) });
    const res = L.distribute(planLike, { sessions, from: st.from, songIds: st.songIds, reservePct: st.reserve, est: st.est, ignoreExisting: !plan, extraForNeedsMore: true });
    res.series = series; res.warmup = st.warmup;
    if (clash.length) res.warnings.unshift(`${clash.length} time(s) skipped because another practice plan already uses them: ` + clash.slice(0, 4).join('; ') + (clash.length > 4 ? '…' : ''));
    return res;
  }

  /** matrix (songs × dates) + per-session run sheets */
  A.SP = {};
  A.SP.matrix = (sessRows, songIds, colorOf) => {
    if (!sessRows.length || !songIds.length) return '<div class="empty">Nothing to show yet.</div>';
    const head = sessRows.map(x => `<th title="${esc(U.fmtD(x.s.date) + ' ' + x.s.start)}">${U.fmtDs(x.s.date).replace(' ', '<br>')}</th>`).join('');
    const body = songIds.map(id => { let n = 0; const total = sessRows.filter(x => x.ids.includes(id)).length; return `<tr><th class="song">${esc(L.songTitle(id))} <span class="muted small">${total}×</span></th>${sessRows.map(x => { const on = x.ids.includes(id); if (on) n++; return `<td class="${on ? 'on' : ''} ${on && x.locked && x.locked.includes(id) ? 'lock' : ''}" style="${on ? '--c:' + esc(colorOf(x.s)) : ''}" title="${on ? esc(L.songTitle(id) + ' · ' + U.fmtD(x.s.date) + ' (' + n + '/' + total + ')') : ''}">${on ? n : ''}</td>`; }).join('')}</tr>`; }).join('');
    return `<div style="overflow-x:auto"><table class="matrix"><thead><tr><th class="song">Song \\ session</th>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="small muted">Each colored cell is a practice of that song on that date. The number counts its practices so far. Cells with a dark outline are locked or pinned.</p>`;
  };
  A.SP.runsheets = (sessRows, planId, warmup, colorOf) => `<div class="runsheet">${sessRows.map(x => { const rs = L.runSheet(x.s, x.ids, planId, warmup); return `<div class="rs" style="--c:${esc(colorOf(x.s))}"><h4>${U.fmtD(x.s.date)} · ${esc(x.s.start)}–${esc(x.s.end)}</h4><div class="small muted" style="display:block">${esc(x.s.venue || '')}</div>${rs.map(r => `<div><span>${r.from}–${r.to}</span><span style="${r.kind === 'song' ? 'font-weight:700' : 'color:var(--muted)'}">${esc(r.label)}</span></div>`).join('')}${rs.over ? `<div style="color:var(--bad)">⚠ about ${rs.over} min more than the session allows</div>` : ''}</div>`; }).join('')}</div>`;

  function showResult(out, st, plan, ev) {
    const r = st.result; if (!r) return;
    const slotOf = (s) => St.get('slots', (St.get('series', s.seriesId) || r.series.find(x => x.id === s.seriesId) || {}).slotId);
    const colorOf = (s) => L.slotColor(slotOf(s));
    const rows = r.sessions.map(x => ({ s: x.s, ids: x.rows.map(y => y.songId), locked: x.rows.filter(y => y.locked).map(y => y.songId) }));
    const placed = U.uniq(rows.flatMap(x => x.ids));
    out.innerHTML = `<div class="card"><div class="row between"><div><h3>Song practice planner</h3><div class="small muted">${rows.length} sessions · ${placed.length} songs · ${rows.reduce((t, x) => t + x.ids.length, 0)} song-practices · warm-up ${st.warmup} min · ${r.reserve}% kept for revision</div></div>
      <div class="row"><button class="btn" id="spDiscard">Discard</button><button class="btn pri" id="spSave">${plan ? 'Save to plan' : 'Create plan & save'}</button></div></div>
      ${r.warnings.length ? `<div class="banner warn" style="margin-top:10px"><ul class="list-plain">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '<div class="banner info" style="margin-top:10px">Every selected song gets the practices it needs within the available time. This is a planning estimate. It does not mean the songs will be ready.</div>'}
      <div class="tabs" style="margin-top:6px"><button data-v2="m" class="on">When to practise each song</button><button data-v2="r">Session run sheets</button></div><div id="spView">${A.SP.matrix(rows, st.songIds.filter(id => placed.includes(id)).concat(st.songIds.filter(id => !placed.includes(id))), colorOf)}</div></div>`;
    out.querySelectorAll('[data-v2]').forEach(b => b.onclick = () => { out.querySelectorAll('[data-v2]').forEach(x => x.classList.toggle('on', x === b)); out.querySelector('#spView').innerHTML = b.dataset.v2 === 'm' ? A.SP.matrix(rows, st.songIds, colorOf) : A.SP.runsheets(rows, plan ? plan.id : st.tempId, st.warmup, colorOf); });
    out.querySelector('#spDiscard').onclick = () => { st.result = null; out.innerHTML = ''; };
    out.querySelector('#spSave').onclick = async (e) => {
      e.target.disabled = true;
      try {
        let p = plan;
        if (!p) {
          const tgt = ev ? ev.startDate : U.addDays(st.to, 1);
          p = await St.put('plans', { id: st.tempId, name: ev ? ev.title + ' preparation' : 'Song practice plan ' + U.fmtDs(st.from) + '–' + U.fmtDs(st.to), year: +st.from.slice(0, 4), eventId: ev ? ev.id : '', start: st.from, target: tgt, status: 'active', approval: 'pending', songIds: st.songIds, reservePct: st.reserve, warmupMin: st.warmup, sections: [], color: ev ? L.catColor(ev.category) : L.PALETTE[0][0] });
          if (ev && !ev.planId) await St.patch('events', ev.id, { planId: p.id }, { audit: false });
        } else await St.patch('plans', p.id, { songIds: U.uniq([...(p.songIds || []), ...st.songIds]), warmupMin: st.warmup, reservePct: st.reserve });
        for (const id of st.songIds) { const cur = L.readiness(p.id, id); const o = st.est[id] || {}; await St.put('readiness', Object.assign({ id: L.rdId(p.id, id), planId: p.id, songId: id, stage: 'not_scheduled' }, cur || {}, o.sessions ? { estSessions: o.sessions } : {}, o.min ? { estMin: o.min } : {}), { audit: false }); }
        let created = 0; for (const sr of r.series) { const x = await L.saveSeries(Object.assign({}, St.get('series', sr.id) || {}, sr)); created += x.created; }
        await L.applyDistribution(St.get('plans', p.id), r);
        L.notifyChange('Song practice planner saved', p.name, `${r.sessions.length} sessions (${created} new) with song assignments from ${U.fmtD(st.from)}`, ['practice', p.id]);
        UI.toast(`Saved: ${created} new session(s), songs assigned`);
        A.state.sp = null; A.go('practice', { plan: p.id, ptab: 'planner' });
      } catch (x) { UI.fail(x); e.target.disabled = false; }
    };
  }

  /** a "fill from schedule" picker placed at the top of a form */
  UI.slotPicker = (body, onPick, label = 'Fill from schedule') => {
    const ss = slots(); if (!ss.length) return;
    const w = document.createElement('div'); w.className = 'row'; w.style.marginBottom = '12px';
    w.innerHTML = `<label class="small" style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:3px;font-weight:700;color:var(--muted)">${esc(label)}<select id="slotPick"><option value="">Choose an available time…</option>${ss.map(s => `<option value="${s.id}">${esc(slotLabel(s))}${s.venue ? ' · ' + esc(s.venue) : ''}</option>`).join('')}</select></label>`;
    body.prepend(w);
    w.querySelector('select').onchange = (e) => { const s = St.get('slots', e.target.value); if (s) { onPick(s, (name, v) => { const el = body.querySelector(`[name="${name}"]`); if (el && v != null) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, (name, vals) => { const box = body.querySelector(`[data-multi="${name}"]`); if (box) box.querySelectorAll('input').forEach(i => i.checked = vals.map(String).includes(i.value)); }); UI.toast('Filled from "' + s.name + '"'); } };
  };
})(window.App);
