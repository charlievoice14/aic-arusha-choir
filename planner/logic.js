/* logic.js — domain rules: recurrence, practice metrics, feasibility, distribution, conflicts, calendar items, notifications */
'use strict';
(function (A) {
  const U = A.U, St = A.Store;
  const L = A.L = {};

  // ---------- vocabularies ----------
  L.EVENT_STATUS = [['proposed', 'Proposed'], ['awaiting_approval', 'Awaiting approval'], ['approved', 'Approved'], ['awaiting_host', 'Awaiting host confirmation'], ['confirmed', 'Confirmed'], ['in_preparation', 'In preparation'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  L.APPROVAL = [['pending', 'Pending approval'], ['approved', 'Approved'], ['rejected', 'Rejected']];
  L.HOSTCONF = [['not_required', 'Not required (internal)'], ['awaiting', 'Awaiting host confirmation'], ['confirmed', 'Confirmed by host'], ['declined', 'Declined by host']];
  L.CATEGORIES = ['Concert', 'Worship service', 'Recording', 'Wedding', 'Outreach', 'Conference', 'Retreat', 'Workshop', 'Rehearsal', 'Other'];
  L.TASK_STATUS = [['not_started', 'Not started'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  L.PRIORITY = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
  L.ACT_STATUS = [['planned', 'Planned'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['deferred', 'Deferred'], ['cancelled', 'Cancelled']];
  L.STAGES = [['not_scheduled', 'Not scheduled'], ['scheduled', 'Scheduled'], ['learning', 'Learning'], ['in_progress', 'In progress'], ['needs_more', 'Needs more practice'], ['ready', 'Ready for performance']];
  L.DIFF = { easy: { sessions: 2, min: 15 }, moderate: { sessions: 3, min: 20 }, difficult: { sessions: 5, min: 25 } };
  L.SESSION_STATUS = [['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  L.PLAN_STATUS = [['draft', 'Draft'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  L.FREQ = [['daily', 'Daily'], ['weekly', 'Weekly'], ['biweekly', 'Every two weeks'], ['monthly', 'Monthly (same date)'], ['custom', 'Custom weekly pattern']];
  L.MODES = ['Bus (hired)', 'Bus (public)', 'Private cars', 'Minibus', 'Train', 'Flight', 'Ferry', 'Walking', 'Other'];
  L.label = (list, v) => { const f = list.find(x => x[0] === v); return f ? f[1] : (v || '—'); };
  L.tone = (v) => ({
    approved: 'ok', confirmed: 'ok', completed: 'ok', ready: 'ok', active: 'ok', present: 'ok',
    proposed: '', awaiting_approval: 'warn', awaiting_host: 'warn', awaiting: 'warn', pending: 'warn', in_preparation: 'info', in_progress: 'info', learning: 'info', scheduled: 'info', planned: 'info',
    needs_more: 'warn', blocked: 'bad', cancelled: 'bad', rejected: 'bad', declined: 'bad', not_started: '', not_scheduled: '', draft: '', deferred: 'warn',
    high: 'warn', critical: 'bad', low: '', medium: 'info',
  }[v] || '');

  // ---------- memoised indexes (rebuilt when the store changes) ----------
  let IDX = null; L.invalidate = () => { IDX = null; };
  L.idx = () => {
    if (IDX) return IDX;
    const asBySess = new Map(), asByPlan = new Map(), asBySong = new Map();
    St.all('assignments').forEach(a => {
      (asBySess.get(a.sessionId) || asBySess.set(a.sessionId, []).get(a.sessionId)).push(a);
      (asByPlan.get(a.planId) || asByPlan.set(a.planId, []).get(a.planId)).push(a);
      (asBySong.get(a.songId) || asBySong.set(a.songId, []).get(a.songId)).push(a);
    });
    const sessByPlan = new Map();
    St.all('sessions').forEach(s => { (sessByPlan.get(s.planId) || sessByPlan.set(s.planId, []).get(s.planId)).push(s); });
    sessByPlan.forEach(v => v.sort(U.by(s => s.date + (s.start || ''))));
    IDX = { asBySess, asByPlan, asBySong, sessByPlan };
    return IDX;
  };
  L.sessAssign = (sid) => L.idx().asBySess.get(sid) || [];
  L.planSessions = (pid) => L.idx().sessByPlan.get(pid) || [];
  L.planAssign = (pid) => L.idx().asByPlan.get(pid) || [];

  // ---------- durations ----------
  L.sessNet = (s) => U.net(s.start, s.end, s.breakMin);
  L.sessGross = (s) => U.gross(s.start, s.end);
  L.sessActualNet = (s) => (s.actual && s.actual.start && s.actual.end ? U.net(s.actual.start, s.actual.end, s.actual.breakMin) : null);
  L.eligible = (s) => s.status !== 'cancelled';
  /** planned song-practice slots: explicit assignments win; otherwise the numeric target */
  L.sessSlots = (s) => { const n = L.sessAssign(s.id).length; return n > 0 ? { n, explicit: true } : { n: +s.songTarget || 0, explicit: false }; };

  // ---------- recurrence ----------
  /** All occurrence dates for a series, after exclusions. Deterministic. */
  L.genDates = (s, holidays) => {
    const out = [];
    if (!U.validDate(s.start) || !U.validDate(s.end) || s.end < s.start) return out;
    const ex = new Set([...(s.exclusions || []), ...(s.skipHolidays ? (holidays || []).map(h => h.date) : [])]);
    const wds = (s.weekdays && s.weekdays.length ? s.weekdays : [U.dow(s.start)]).map(Number);
    if (s.freq === 'monthly') {
      const day = +s.start.slice(8, 10); let y = +s.start.slice(0, 4), m = +s.start.slice(5, 7);
      while (out.length < 500) {
        const d = U.ymd(y, m, Math.min(day, U.daysInMonth(y, m)));
        if (d > s.end) break;
        if (d >= s.start) out.push(d);
        m++; if (m > 12) { m = 1; y++; }
      }
    } else {
      const wk0 = U.addDays(s.start, -U.dow(s.start));
      for (let d = s.start; d <= s.end && out.length < 1000; d = U.addDays(d, 1)) {
        if (s.freq === 'daily') out.push(d);
        else if (s.freq === 'biweekly') { const w = Math.floor(U.diffDays(wk0, d) / 7); if (w % 2 === 0 && wds.includes(U.dow(d))) out.push(d); }
        else if (wds.includes(U.dow(d))) out.push(d); // weekly & custom
      }
    }
    return out.filter(d => !ex.has(d));
  };
  L.occId = (seriesId, date) => seriesId + '_' + date.replace(/-/g, '');
  L.sessionFromSeries = (sr, date) => ({
    id: L.occId(sr.id, date), planId: sr.planId, seriesId: sr.id, title: sr.title || '', date,
    start: sr.startTime, end: sr.endTime, breakMin: +sr.breakMin || 0, venue: sr.venue || '', leaderId: sr.leaderId || '',
    sections: sr.sections || [], memberIds: sr.memberIds || [], songTarget: +sr.songTarget || 0, status: 'scheduled', detached: false, notes: sr.notes || '',
  });
  /** Plan what generating a series would do — never creates a second session for the same date. */
  L.previewSeries = (sr) => {
    const dates = L.genDates(sr, St.cfg().holidays);
    const rows = dates.map(d => { const id = L.occId(sr.id, d); const ex = St.get('sessions', id); return { date: d, id, exists: !!ex, existing: ex }; });
    const dateSet = new Set(dates);
    const orphans = St.all('sessions').filter(s => s.seriesId === sr.id && !dateSet.has(s.date));
    return { dates, rows, toCreate: rows.filter(r => !r.exists), existing: rows.filter(r => r.exists), orphans };
  };
  L.saveSeries = async (sr) => {
    await St.put('series', sr, { summary: 'Series ' + (sr.title || sr.id) });
    const pv = L.previewSeries(sr);
    for (const r of pv.toCreate) await St.put('sessions', L.sessionFromSeries(sr, r.date), { audit: false });
    // occurrences no longer in the pattern (newly excluded dates): cancel, never duplicate or silently delete history
    let cancelled = 0;
    for (const o of pv.orphans) if (o.status === 'scheduled' && !o.detached) { await St.patch('sessions', o.id, { status: 'cancelled', cancelReason: 'Removed from series pattern / excluded date' }, { audit: false }); cancelled++; }
    await St.audit('generate', 'series', sr.id, `${pv.toCreate.length} created, ${pv.existing.length} already existed, ${cancelled} cancelled`);
    return { created: pv.toCreate.length, existing: pv.existing.length, cancelled };
  };
  /** apply an edit to one occurrence, this-and-future, or the whole series */
  L.editOccurrence = async (sess, changes, scope) => {
    if (scope === 'one' || !sess.seriesId) return St.patch('sessions', sess.id, Object.assign({}, changes, { detached: !!sess.seriesId }));
    const sr = St.get('series', sess.seriesId);
    if (!sr) return St.patch('sessions', sess.id, changes);
    const map = { start: 'startTime', end: 'endTime', breakMin: 'breakMin', venue: 'venue', songTarget: 'songTarget', leaderId: 'leaderId', sections: 'sections', memberIds: 'memberIds', title: 'title', notes: 'notes' };
    const srCh = {}; Object.keys(changes).forEach(k => { if (map[k]) srCh[map[k]] = changes[k]; });
    if (scope === 'all') {
      const nsr = Object.assign({}, sr, srCh);
      await St.put('series', nsr);
      for (const s of St.all('sessions').filter(x => x.seriesId === sr.id && !x.detached && x.status === 'scheduled')) {
        const part = {}; Object.keys(changes).forEach(k => { if (k !== 'date') part[k] = changes[k]; });
        await St.patch('sessions', s.id, part, { audit: false });
      }
      return;
    }
    // this and future: split the series at this date
    const splitDate = sess.date;
    const nsr = Object.assign({}, sr, srCh, { id: U.uid('se_'), start: splitDate, parentSeries: sr.id });
    await St.put('series', Object.assign({}, sr, { end: U.addDays(splitDate, -1) }));
    const future = St.all('sessions').filter(x => x.seriesId === sr.id && x.date >= splitDate && !x.detached && x.status === 'scheduled');
    const moved = {};
    future.forEach(f => { moved[f.date] = L.sessAssign(f.id); });
    for (const f of future) await St.del('sessions', f.id, { audit: false });
    await L.saveSeries(nsr);
    let lost = 0;
    for (const d of Object.keys(moved)) {
      const nid = L.occId(nsr.id, d);
      for (const a of moved[d]) {
        if (St.get('sessions', nid)) await St.put('assignments', Object.assign({}, a, { id: nid + '__' + a.songId, sessionId: nid }), { audit: false });
        else lost++;
        await St.del('assignments', a.id, { audit: false });
      }
    }
    return { lost };
  };

  // ---------- song readiness ----------
  L.rdId = (planId, songId) => planId + '__' + songId;
  L.readiness = (planId, songId) => St.get('readiness', L.rdId(planId, songId)) || null;
  /** displayed stage: stored stage, except "not scheduled" becomes "scheduled" once an eligible session holds the song. Never auto-ready. */
  L.stage = (planId, songId) => {
    const r = L.readiness(planId, songId); const st = (r && r.stage) || 'not_scheduled';
    if (st === 'not_scheduled') {
      const has = L.planAssign(planId).some(a => a.songId === songId && (St.get('sessions', a.sessionId) || {}).status !== 'cancelled');
      return has ? 'scheduled' : 'not_scheduled';
    }
    return st;
  };
  L.songEst = (planId, songId) => {
    const r = L.readiness(planId, songId) || {}; const s = St.get('songs', songId) || {};
    const d = L.DIFF[s.difficulty] || L.DIFF.moderate;
    return { sessions: +r.estSessions || d.sessions, min: +r.estMin || d.min, custom: !!(r.estSessions || r.estMin) };
  };
  L.songTimeline = (planId, songId) => L.planAssign(planId).filter(a => a.songId === songId).map(a => ({ a, s: St.get('sessions', a.sessionId) })).filter(x => x.s).sort(U.by(x => x.s.date + x.s.start));
  L.lastNextPractice = (planId, songId, today) => {
    const tl = L.songTimeline(planId, songId).filter(x => x.s.status !== 'cancelled');
    const past = tl.filter(x => x.s.status === 'completed' || x.s.date < today), fut = tl.filter(x => x.s.status === 'scheduled' && x.s.date >= today);
    return { last: past.length ? past[past.length - 1].s.date : null, next: fut.length ? fut[0].s.date : null };
  };
  L.planSongIds = (plan) => U.uniq([...(plan.songIds || []), ...L.planAssign(plan.id).map(a => a.songId)]).filter(id => St.get('songs', id));
  L.planTargetDate = (plan) => { const ev = plan.eventId && St.get('events', plan.eventId); return (ev && ev.startDate) || plan.target || null; };

  // ---------- practice metrics (spec 8.7) ----------
  L.planMetrics = (plan, today = U.today(), range) => {
    let ss = L.planSessions(plan.id);
    if (range) ss = ss.filter(s => U.inRange(s.date, range[0], range[1]));
    const elig = ss.filter(L.eligible), canc = ss.filter(s => s.status === 'cancelled'), done = elig.filter(s => s.status === 'completed');
    const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
    const plannedMin = sum(elig, L.sessNet);
    const actualRec = done.filter(s => L.sessActualNet(s) != null);
    const actualMin = sum(actualRec, L.sessActualNet);
    const slots = elig.map(L.sessSlots);
    const plannedSlots = sum(slots, x => x.n), explicitSlots = sum(slots.filter(x => x.explicit), x => x.n), targetOnlySlots = plannedSlots - explicitSlots;
    const completedSlots = sum(done, s => { const a = L.sessAssign(s.id); return a.length ? a.filter(x => x.done).length : (+s.actualSongs || 0); });
    const songs = L.planSongIds(plan);
    const eligIds = new Set(elig.map(s => s.id));
    const scheduledSongs = U.uniq(L.planAssign(plan.id).filter(a => eligIds.has(a.sessionId)).map(a => a.songId));
    const stageOf = (id) => L.stage(plan.id, id);
    const ready = songs.filter(id => stageOf(id) === 'ready');
    const needsMore = songs.filter(id => stageOf(id) === 'needs_more');
    const inProg = songs.filter(id => ['learning', 'in_progress'].includes(stageOf(id)));
    const tgt = L.planTargetDate(plan);
    const remaining = elig.filter(s => s.status !== 'completed' && s.date >= today);
    const unrecorded = elig.filter(s => s.status === 'scheduled' && s.date < today);
    const beforeEvent = tgt ? remaining.filter(s => s.date <= tgt) : remaining;
    // workload: per non-ready song, estimated sessions minus completed practice of that song
    let workMin = 0, workSlots = 0; const perSong = [];
    songs.forEach(id => {
      if (stageOf(id) === 'ready') return;
      const est = L.songEst(plan.id, id);
      const doneCount = L.planAssign(plan.id).filter(a => a.songId === id && a.done && (St.get('sessions', a.sessionId) || {}).status === 'completed').length;
      const rem = Math.max(0, est.sessions - doneCount);
      workSlots += rem; workMin += rem * est.min; perSong.push({ id, est, doneCount, rem, min: rem * est.min });
    });
    const days = U.uniq(elig.map(s => s.date));
    const m = {
      sessions: elig.length, cancelled: canc.length, practiceDays: days.length, daysCompleted: U.uniq(done.map(s => s.date)).length,
      daysRemaining: U.uniq(remaining.map(s => s.date)).length,
      plannedMin, actualMin: actualRec.length ? actualMin : null, actualRecorded: actualRec.length, completed: done.length, remaining: remaining.length, unrecorded: unrecorded.length,
      plannedSlots, explicitSlots, targetOnlySlots, completedSlots, unique: songs.length, scheduledSongs: scheduledSongs.length,
      notScheduled: songs.filter(id => !scheduledSongs.includes(id)), ready: ready.length, readyIds: ready, needsMore, inProg, attention: songs.length - ready.length,
      avgSongs: elig.length ? plannedSlots / elig.length : null, avgMin: elig.length ? plannedMin / elig.length : null,
      beforeEvent: beforeEvent.length, beforeEventMin: sum(beforeEvent, L.sessNet), targetDate: tgt, workMin, workSlots, perSong, songs,
    };
    m.formulas = {
      sessions: 'count of sessions with status ≠ cancelled', practiceDays: 'distinct dates with ≥1 eligible session',
      plannedHours: 'Σ (end − start − breaks) of eligible sessions ÷ 60', actualHours: 'Σ (actual finish − actual start − actual breaks) of completed sessions with recorded times ÷ 60',
      plannedSlots: 'Σ per eligible session: assigned songs if any, else numeric song target', completedSlots: 'songs marked rehearsed in completed sessions (or recorded count where no list)',
      unique: 'distinct songs in plan repertoire ∪ assigned songs (each counted once)', scheduledSongs: 'distinct songs with ≥1 assignment in an eligible session',
      ready: 'songs a music leader marked "Ready for performance"', avgSongs: 'planned slots ÷ eligible sessions', avgMin: 'planned net minutes ÷ eligible sessions',
      beforeEvent: 'eligible, not completed sessions from today up to the target date', workMin: 'Σ over not-ready songs: max(0, est. sessions − completed practices) × est. minutes',
    };
    return m;
  };

  // ---------- feasibility (spec 8.8) ----------
  L.feasibility = (plan, today = U.today()) => {
    const m = L.planMetrics(plan, today); const tgt = m.targetDate;
    const reserve = plan.reservePct == null ? 15 : +plan.reservePct;
    const remaining = L.planSessions(plan.id).filter(s => L.eligible(s) && s.status !== 'completed' && s.date >= today && (!tgt || s.date <= tgt));
    const availMin = remaining.reduce((t, s) => t + (L.sessNet(s) || 0), 0);
    const usableMin = Math.round(availMin * (1 - reserve / 100));
    const slotCap = remaining.reduce((t, s) => t + (+s.songTarget || L.sessAssign(s.id).length || 0), 0);
    const calDays = tgt ? U.diffDays(today, tgt) : null;
    const perWeek = tgt && calDays > 0 ? remaining.length / (calDays / 7) : null;
    const deficitMin = Math.max(0, m.workMin - usableMin);
    const avgSess = remaining.length ? availMin / remaining.length : (m.avgMin || 120);
    const sufficientTime = m.workMin <= usableMin;
    const sufficientSlots = slotCap === 0 ? null : m.workSlots <= slotCap;
    const ok = sufficientTime && sufficientSlots !== false;
    const tips = [];
    if (!ok) {
      if (deficitMin > 0) {
        tips.push(`Add about ${Math.ceil(deficitMin / Math.max(30, avgSess * (1 - reserve / 100)))} more practice session(s) of ~${Math.round(avgSess)} min before ${U.fmtD(tgt)}.`);
        if (remaining.length) tips.push(`Or extend each remaining session by about ${Math.ceil(deficitMin / remaining.length / (1 - reserve / 100))} min.`);
      }
      if (sufficientSlots === false) tips.push(`Raise song targets or distribute songs across additional sessions: ${m.workSlots} song-practice slots are still needed but only ${slotCap} are planned.`);
      const hard = m.perSong.filter(p => (St.get('songs', p.id) || {}).difficulty === 'difficult' && p.rem > 0).map(p => (St.get('songs', p.id) || {}).title);
      if (hard.length) tips.push('Prioritise difficult songs early: ' + hard.slice(0, 6).join(', ') + (hard.length > 6 ? '…' : '') + '.');
      if (m.notScheduled.length) tips.push(`${m.notScheduled.length} required song(s) are not yet on any session.`);
    }
    return { m, tgt, calDays, daysLeft: U.uniq(remaining.map(s => s.date)).length, remaining: remaining.length, availMin, usableMin, reserve, slotCap, perWeek, deficitMin, ok, sufficientTime, sufficientSlots, tips };
  };

  // ---------- assisted song distribution (spec 8.9) ----------
  L.distribute = (plan, opts = {}) => {
    const E = (id) => { const e = L.songEst(plan.id, id); const o = opts.est && opts.est[id]; return o ? { sessions: +o.sessions || e.sessions, min: +o.min || e.min, custom: true } : e; };
    const today = opts.from || U.today(); const tgt = L.planTargetDate(plan);
    const reserve = opts.reservePct == null ? (plan.reservePct == null ? 15 : +plan.reservePct) : +opts.reservePct;
    const sess = (opts.sessions || L.planSessions(plan.id)).filter(s => s.status === 'scheduled' && s.date >= today && (!tgt || s.date <= tgt));
    const songIds = (opts.songIds && opts.songIds.length ? opts.songIds : L.planSongIds(plan)).filter(id => St.get('songs', id));
    const st = sess.map(s => {
      const locked = opts.ignoreExisting ? [] : L.sessAssign(s.id).filter(a => a.locked);
      const capMin = Math.round((L.sessNet(s) || 0) * (1 - reserve / 100));
      const usedMin = locked.reduce((t, a) => t + E(a.songId).min, 0);
      return { s, capMin, capCount: +s.songTarget > 0 ? +s.songTarget : Infinity, usedMin, songs: new Set(locked.map(a => a.songId)), rows: locked.map(a => ({ sessionId: s.id, songId: a.songId, locked: true, minutes: E(a.songId).min })) };
    });
    // pins: {songId,date} → place on that date's session as locked
    const warnings = [];
    (opts.pins || []).forEach(p => {
      const t = st.find(x => x.s.date === p.date && !x.songs.has(p.songId));
      if (!t) { warnings.push(`Pinned song "${(St.get('songs', p.songId) || {}).title}" has no available scheduled session on ${U.fmtD(p.date)}.`); return; }
      const mn = E(p.songId).min; t.songs.add(p.songId); t.usedMin += mn; t.rows.push({ sessionId: t.s.id, songId: p.songId, locked: true, pinned: true, minutes: mn });
    });
    const order = { difficult: 0, moderate: 1, easy: 2 };
    const needs = songIds.map(id => {
      const stg = L.stage(plan.id, id); const est = E(id);
      const done = L.planAssign(plan.id).filter(a => a.songId === id && a.done).length;
      const placed = st.reduce((t, x) => t + (x.songs.has(id) ? 1 : 0), 0);
      let need = stg === 'ready' ? (opts.revisionForReady ? 1 : 0) : Math.max(0, est.sessions - done) - placed;
      if (stg === 'needs_more') need = Math.max(need, 1) + (opts.extraForNeedsMore ? 1 : 0);
      return { id, need: Math.max(0, need), est, diff: (St.get('songs', id) || {}).difficulty || 'moderate' };
    }).filter(x => x.need > 0).sort((a, b) => (order[a.diff] - order[b.diff]) || (b.need - a.need));
    const S = st.length;
    if (!S) warnings.push('There are no future scheduled sessions before the target date to distribute songs into.');
    const unplaced = [];
    needs.forEach(n => {
      for (let k = 0; k < n.need && S; k++) {
        const ideal = Math.min(S - 1, Math.floor(((k + 0.5) * S) / n.need));
        let best = -1, overload = -1;
        for (let off = 0; off < S && best < 0; off++) {
          for (const i of [ideal + off, ideal - off]) {
            if (i < 0 || i >= S) continue; const x = st[i];
            if (x.songs.has(n.id) || x.rows.length >= x.capCount) continue;
            if (x.usedMin + n.est.min <= x.capMin) { best = i; break; }
            if (overload < 0) overload = i;
          }
        }
        let i = best; let over = false;
        if (i < 0 && opts.allowOverload && overload >= 0) { i = overload; over = true; }
        if (i < 0) { unplaced.push(n.id); continue; }
        const x = st[i]; x.songs.add(n.id); x.usedMin += n.est.min; x.rows.push({ sessionId: x.s.id, songId: n.id, locked: false, minutes: n.est.min, rep: k + 1, of: n.need, over });
      }
    });
    st.forEach(x => { if (x.usedMin > x.capMin) warnings.push(`${U.fmtD(x.s.date)}: assigned songs need ~${x.usedMin} min but only ~${x.capMin} min are available after the ${reserve}% revision reserve.`); });
    const un = U.uniq(unplaced);
    if (un.length) warnings.push(`${un.length} song(s) could not get all the sessions they need: ` + un.map(id => (St.get('songs', id) || {}).title).join(', ') + '. Add sessions, extend time, or raise song targets.');
    return { sessions: st, warnings, reserve, needs };
  };
  L.applyDistribution = async (plan, result) => {
    // replace unlocked, not-done assignments on the affected future sessions; keep locked ones
    for (const x of result.sessions) {
      for (const a of L.sessAssign(x.s.id)) if (!a.locked && !a.done) await St.del('assignments', a.id, { audit: false });
      for (const r of x.rows) {
        const id = r.sessionId + '__' + r.songId;
        const ex = St.get('assignments', id);
        await St.put('assignments', Object.assign({}, ex || {}, { id, sessionId: r.sessionId, songId: r.songId, planId: plan.id, locked: !!r.locked, done: ex ? !!ex.done : false, minutes: r.minutes }), { audit: false });
      }
    }
    await St.audit('distribute', 'plans', plan.id, 'Assisted song distribution applied');
  };

  // ---------- conflicts ----------
  L.evRange = (e) => [U.absMin(e.startDate, e.startTime || '00:00'), U.absMin(e.endDate || e.startDate, e.endTime || (e.endDate && e.endDate !== e.startDate ? '23:59' : (e.startTime ? U.fromMin(Math.min(1439, U.toMin(e.startTime) + 120)) : '23:59')))];
  L.sessRange = (s) => { const a = U.absMin(s.date, s.start || '00:00'); const g = L.sessGross(s); return [a, a + (g == null ? 120 : g)]; };
  L.conflicts = (kind, rec) => {
    const out = []; if (!rec) return out;
    const r = kind === 'event' ? L.evRange(rec) : L.sessRange(rec);
    if (r[0] == null) return out;
    const venue = (rec.venue || '').trim().toLowerCase();
    const eq = new Set((rec.equipment || []).map(x => x.trim().toLowerCase()).filter(Boolean));
    St.live('events').forEach(e => {
      if (e.id === rec.id || e.status === 'cancelled' || !e.startDate) return;
      const er = L.evRange(e); if (!(r[0] < er[1] && er[0] < r[1])) return;
      const why = ['overlaps in time'];
      if (venue && (e.venue || '').trim().toLowerCase() === venue) why.push('same venue');
      const sharedEq = (e.equipment || []).filter(x => eq.has(x.trim().toLowerCase()));
      if (sharedEq.length) why.push('shares equipment: ' + sharedEq.join(', '));
      if (rec.leaderId && rec.leaderId === e.leaderId) why.push('same leader');
      out.push({ kind: 'event', id: e.id, title: e.title, date: e.startDate, why, severe: why.length > 1 });
    });
    St.all('sessions').forEach(s => {
      if (s.id === rec.id || s.status === 'cancelled') return;
      const sr = L.sessRange(s); if (!(r[0] < sr[1] && sr[0] < r[1])) return;
      const why = ['overlaps in time'];
      if (venue && (s.venue || '').trim().toLowerCase() === venue) why.push('same venue');
      if (rec.leaderId && rec.leaderId === s.leaderId) why.push('same leader');
      const p = St.get('plans', s.planId);
      out.push({ kind: 'session', id: s.id, title: 'Practice: ' + (s.title || (p && p.name) || ''), date: s.date, why, severe: why.length > 1 });
    });
    return out;
  };

  // ---------- calendar items ----------
  L.calItems = (a, b, f = {}) => {
    const items = [];
    const show = Object.assign({ event: true, practice: true, deadline: true, travel: true, rehearsal: true, activity: true }, f.show || {});
    const q = (f.q || '').toLowerCase();
    St.all('events').forEach(e => {
      if (!e.startDate || (e.archived && !f.archived)) return;
      const end = e.endDate || e.startDate;
      if (!U.overlapRange(e.startDate, end, a, b)) return;
      if (f.dept && !(e.depts || []).includes(f.dept)) return;
      if (f.status && e.status !== f.status) return;
      const k = e.category === 'Rehearsal' ? 'rehearsal' : 'event';
      if (!show[k]) return;
      items.push({ kind: k, coll: 'events', id: e.id, date: e.startDate, endDate: end, time: e.startTime, endTime: e.endTime, title: e.title, status: e.status, cancelled: e.status === 'cancelled', sub: [e.venue, L.label(L.EVENT_STATUS, e.status)].filter(Boolean).join(' · '), demo: e.isDemo });
    });
    if (show.practice) St.all('sessions').forEach(s => {
      if (!U.inRange(s.date, a, b)) return;
      const p = St.get('plans', s.planId) || {};
      if (f.plan && s.planId !== f.plan) return;
      if (f.event && p.eventId !== f.event) return;
      if (f.dept && !(p.depts || []).includes(f.dept)) return;
      if (f.hideCancelledPractice && s.status === 'cancelled') return;
      const ev = p.eventId && St.get('events', p.eventId);
      const net = L.sessNet(s); const slots = L.sessSlots(s);
      items.push({ kind: 'practice', coll: 'sessions', id: s.id, date: s.date, endDate: s.date, time: s.start, endTime: s.end, title: (s.title || p.name || 'Practice'), status: s.status, cancelled: s.status === 'cancelled', sub: [s.venue, net != null ? net + ' min' : '', slots.n ? slots.n + ' songs' : '', ev ? 'for ' + ev.title : ''].filter(Boolean).join(' · '), demo: p.isDemo });
    });
    if (show.deadline) {
      St.all('tasks').forEach(t => {
        if (!t.due || !U.inRange(t.due, a, b) || t.archived) return;
        if (f.dept && t.deptId !== f.dept) return;
        if (f.event && !(t.linkType === 'event' && t.linkId === f.event)) return;
        items.push({ kind: 'deadline', coll: 'tasks', id: t.id, date: t.due, endDate: t.due, title: 'Due: ' + t.title, status: t.status, cancelled: t.status === 'cancelled', sub: [(St.get('departments', t.deptId) || {}).name, L.label(L.TASK_STATUS, t.status)].filter(Boolean).join(' · '), demo: t.isDemo });
      });
    }
    if (show.activity) St.all('activities').forEach(x => {
      const s = x.start || x.end, e = x.end || x.start;
      if (!s || x.archived || !U.overlapRange(s, e < s ? s : e, a, b)) return;
      if (f.dept && x.deptId !== f.dept) return; if (f.event && x.id !== (St.get('events', f.event) || {}).activityId) return;
      items.push({ kind: 'activity', coll: 'activities', id: x.id, date: s, endDate: e < s ? s : e, title: 'Plan: ' + x.title, status: x.status, cancelled: x.status === 'cancelled', sub: [L.deptName(x.deptId), L.label(L.ACT_STATUS, x.status), (+x.progress || 0) + '%', `${U.fmtDs(s)} – ${U.fmtDs(e)}`].join(' · '), demo: x.isDemo });
    });
    if (show.travel) St.all('travel').forEach(t => {
      if (!t.departDate || !U.inRange(t.departDate, a, b)) return;
      if (f.event && t.eventId !== f.event) return;
      const e = St.get('events', t.eventId) || {};
      items.push({ kind: 'travel', coll: 'travel', id: t.id, date: t.departDate, endDate: t.arriveDate && t.arriveDate >= t.departDate ? t.arriveDate : t.departDate, time: t.departTime, endTime: t.arriveTime, title: (t.dir === 'return' ? 'Return: ' : 'Depart: ') + (t.from || '?') + ' → ' + (t.to || '?'), status: t.confirmed ? 'confirmed' : 'unconfirmed', sub: [e.title, t.mode].filter(Boolean).join(' · '), demo: t.isDemo });
    });
    return items.filter(i => !q || (i.title + ' ' + i.sub).toLowerCase().includes(q)).sort(U.by(i => i.date + (i.time || '00:00')));
  };
  L.itemsOn = (items, d) => items.filter(i => d >= i.date && d <= (i.endDate || i.date));

  // ---------- attendance ----------
  L.expectedMembers = (s) => {
    const ids = new Set(s.memberIds || []);
    const secs = new Set(s.sections || []);
    if (secs.size) St.live('members').filter(m => m.status !== 'inactive' && (m.sections || []).some(x => secs.has(x))).forEach(m => ids.add(m.id));
    if (!ids.size && !secs.size) St.live('members').filter(m => m.status !== 'inactive' && (m.sections || []).length).forEach(m => ids.add(m.id));
    return [...ids];
  };
  L.attStats = (sessions) => {
    let recorded = 0, missing = 0, present = 0, expected = 0;
    sessions.filter(s => s.status === 'completed').forEach(s => {
      const at = St.get('attendance', s.id);
      if (!at || !at.records || !Object.keys(at.records).length) { missing++; return; }
      recorded++;
      const exp = L.expectedMembers(s); expected += exp.length;
      present += exp.filter(id => ['P', 'L'].includes(at.records[id])).length;
    });
    return { recorded, missing, present, expected, pct: expected ? Math.round((present / expected) * 100) : null };
  };

  // ---------- misc ----------
  L.nextEventCode = (year) => {
    const y = year || 2027; let max = 0;
    St.all('events').forEach(e => { const m = /^EV-(\d{4})-(\d+)$/.exec(e.code || ''); if (m && +m[1] === y) max = Math.max(max, +m[2]); });
    return `EV-${y}-${String(max + 1).padStart(3, '0')}`;
  };
  L.taskOverdue = (t, today = U.today()) => t.due && t.due < today && !['completed', 'cancelled'].includes(t.status);
  L.memberName = (id) => (St.get('members', id) || {}).name || '—';
  L.deptName = (id) => (St.get('departments', id) || {}).name || '—';
  L.songTitle = (id) => (St.get('songs', id) || {}).title || '(removed song)';
  L.linkLabel = (t) => {
    if (t.linkType === 'event') return 'Event: ' + ((St.get('events', t.linkId) || {}).title || '—');
    if (t.linkType === 'activity') return 'Activity: ' + ((St.get('activities', t.linkId) || {}).title || '—');
    if (t.linkType === 'session') { const s = St.get('sessions', t.linkId); return s ? 'Practice ' + U.fmtDs(s.date) : 'Practice —'; }
    return '';
  };
  L.eventPlan = (eid) => St.all('plans').find(p => p.eventId === eid);

  // ---------- notifications (computed from saved records) ----------
  L.reminders = (today = U.today()) => {
    const cfg = St.cfg(); const r = Object.assign({ eventDays: 7, practiceHours: 48, taskDays: 3, songDays: 14, confirmDays: 30 }, cfg.reminders || {});
    const out = []; const now = U.absMin(today, U.nowHM());
    St.live('events').forEach(e => {
      if (!e.startDate || e.status === 'cancelled' || e.status === 'completed') return;
      const d = U.diffDays(today, e.startDate);
      if (d >= 0 && d <= r.eventDays) out.push({ id: 'ev_' + e.id, type: 'Upcoming event', when: e.startDate, title: e.title, body: `${U.fmtD(e.startDate)}${e.startTime ? ' ' + e.startTime : ''} · ${e.venue || 'venue not set'}`, link: ['events', e.id], tone: 'info' });
      if (e.hostConf === 'awaiting' && d >= 0 && d <= r.confirmDays) out.push({ id: 'hc_' + e.id, type: 'Confirmation needed', when: e.startDate, title: e.title, body: `Host has not confirmed. Event in ${d} day(s).`, link: ['events', e.id], tone: 'warn' });
    });
    St.all('sessions').forEach(s => {
      if (s.status !== 'scheduled') return;
      const st = U.absMin(s.date, s.start || '00:00'); const h = (st - now) / 60;
      if (h >= 0 && h <= r.practiceHours) out.push({ id: 'ps_' + s.id, type: 'Upcoming practice', when: s.date, title: s.title || (St.get('plans', s.planId) || {}).name || 'Practice', body: `${U.fmtD(s.date)} ${s.start || ''}–${s.end || ''} · ${s.venue || 'venue not set'}`, link: ['practice', s.planId], tone: 'info' });
    });
    St.all('tasks').forEach(t => {
      if (!t.due || ['completed', 'cancelled'].includes(t.status) || t.archived) return;
      const d = U.diffDays(today, t.due);
      if (d < 0) out.push({ id: 'to_' + t.id, type: 'Overdue task', when: t.due, title: t.title, body: `Was due ${U.fmtD(t.due)} · ${L.deptName(t.deptId)}`, link: ['tasks', t.id], tone: 'bad', mine: (t.assignees || []).includes(A.Auth.memberId()) });
      else if (d <= r.taskDays) out.push({ id: 'td_' + t.id, type: 'Task deadline', when: t.due, title: t.title, body: `Due ${U.fmtD(t.due)} · ${L.deptName(t.deptId)}`, link: ['tasks', t.id], tone: 'warn', mine: (t.assignees || []).includes(A.Auth.memberId()) });
    });
    St.all('plans').filter(p => p.status !== 'cancelled' && p.status !== 'completed').forEach(p => {
      const tgt = L.planTargetDate(p); if (!tgt || tgt < today) return;
      L.planSongIds(p).forEach(id => {
        const rd = L.readiness(p.id, id); const stg = L.stage(p.id, id);
        if (rd && rd.targetDate && stg !== 'ready') { const d = U.diffDays(today, rd.targetDate); if (d <= r.songDays) out.push({ id: 'sd_' + p.id + id, type: d < 0 ? 'Song preparation overdue' : 'Song preparation deadline', when: rd.targetDate, title: L.songTitle(id), body: `${p.name}: target ${U.fmtD(rd.targetDate)}, now "${L.label(L.STAGES, stg)}"`, link: ['practice', p.id], tone: d < 0 ? 'bad' : 'warn' }); }
      });
      const fz = L.feasibility(p, today);
      if (!fz.ok && U.diffDays(today, tgt) <= 60) out.push({ id: 'risk_' + p.id, type: 'Songs at risk', when: tgt, title: p.name, body: `Estimated remaining work ~${Math.round(fz.m.workMin / 60 * 10) / 10} h vs ~${Math.round(fz.usableMin / 60 * 10) / 10} h usable before ${U.fmtD(tgt)}. ${fz.m.notScheduled.length} song(s) not scheduled.`, link: ['practice', p.id], tone: 'bad' });
    });
    St.all('notifications').forEach(n => { if (n.at && U.diffDays(n.at.slice(0, 10), today) <= 30) out.push({ id: 'n_' + n.id, type: n.type || 'Schedule change', when: n.at.slice(0, 10), title: n.title, body: n.body, link: n.link, tone: 'info', stored: true }); });
    return out.sort(U.by('when'));
  };
  L.notifyChange = async (type, title, body, link) => { try { await St.put('notifications', { type, title, body, link }, { audit: false }); } catch (e) { /* best effort */ } };
})(window.App);
/* ---------- color categories ---------- */
(function (A) {
  const L = A.L, St = A.Store, U = A.U;
  L.PALETTE = [['#2fb36a', 'Green'], ['#14a89b', 'Teal'], ['#6c6cf0', 'Indigo'], ['#e0713a', 'Orange'], ['#d1438f', 'Magenta'], ['#3a9be0', 'Sky'], ['#e3b04b', 'Amber'], ['#e0566b', 'Rose'], ['#7fa58f', 'Sage'], ['#e3a07f', 'Peach'], ['#9b8cff', 'Lavender'], ['#8a9399', 'Slate']];
  const hash = (s) => { let h = 0; String(s || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) | 0; }); return Math.abs(h); };
  L.autoColor = (key) => L.PALETTE[hash(key) % L.PALETTE.length][0];
  const DEF_CAT = { Concert: '#6c6cf0', 'Worship service': '#14a89b', Recording: '#d1438f', Wedding: '#e3a07f', Outreach: '#e0713a', Conference: '#3a9be0', Retreat: '#7fa58f', Workshop: '#e3b04b', Rehearsal: '#2fb36a', Other: '#8a9399' };
  L.catColor = (cat) => ((St.cfg().categoryColors || {})[cat]) || DEF_CAT[cat] || L.autoColor(cat);
  const DEF_SEC = { Soprano: '#d1438f', Alto: '#e3a07f', Tenor: '#3a9be0', Bass: '#6c6cf0' };
  L.sectionColor = (s) => ((St.cfg().sectionColors || {})[s]) || DEF_SEC[s] || L.autoColor(s);
  L.deptColor = (id) => { const d = St.get('departments', id); return (d && d.color) || (id ? L.autoColor(id) : '#8a9399'); };
  L.planColor = (id) => { const p = St.get('plans', id); if (!p) return '#2fb36a'; if (p.color) return p.color; const e = p.eventId && St.get('events', p.eventId); return e ? L.catColor(e.category) : '#2fb36a'; };
  L.colColor = (id) => { const c = St.get('collections', id); return (c && c.color) || L.autoColor(id); };
  L.slotColor = (s) => (s && s.color) || '#2fb36a';
  L.KIND_COLOR = { event: '#6c6cf0', rehearsal: '#14a89b', practice: '#2fb36a', deadline: '#e0566b', travel: '#e3b04b', activity: '#9b8cff' };
  /** a multi-day item shows its label on its first day, on Mondays and on the 1st of a month; other days get a thin continuation bar */
  L.isCont = (i, d) => i.endDate && i.endDate !== i.date && d !== i.date && U.dow(d) !== 1 && d.slice(8) !== '01';
  L.itemColor = (i, by) => {
    if (by !== 'category') return L.KIND_COLOR[i.kind];
    if (i.coll === 'events') return L.catColor((St.get('events', i.id) || {}).category);
    if (i.coll === 'sessions') return L.planColor((St.get('sessions', i.id) || {}).planId);
    if (i.coll === 'tasks') return L.deptColor((St.get('tasks', i.id) || {}).deptId);
    if (i.coll === 'activities') return L.deptColor((St.get('activities', i.id) || {}).deptId);
    return L.KIND_COLOR[i.kind];
  };
  L.hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [138, 147, 153]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  L.tint = (h, a) => { const [r, g, b] = L.hexRgb(h); return [r, g, b].map(v => Math.round(v * a + 255 * (1 - a))); };
})(window.App);

/* ---------- schedule slots & run sheets ---------- */
(function (A) {
  const L = A.L, St = A.Store, U = A.U;
  /** occurrences of an availability slot in [from,to], respecting its validity and holidays */
  L.slotDates = (slot, from, to, extraEx) => {
    const a = slot.validFrom && slot.validFrom > from ? slot.validFrom : from;
    const b = slot.validTo && slot.validTo < to ? slot.validTo : to;
    if (!a || !b || b < a) return [];
    return L.genDates({ start: a, end: b, freq: slot.freq === 'biweekly' ? 'biweekly' : 'custom', weekdays: slot.weekdays || [], exclusions: extraEx || [], skipHolidays: slot.skipHolidays !== false }, St.cfg().holidays);
  };
  L.slotSeriesId = (planId, slotId) => 'se_' + planId.replace(/[^A-Za-z0-9]/g, '').slice(-12) + '_' + slotId.replace(/[^A-Za-z0-9]/g, '').slice(-10);
  L.slotToSeries = (slot, plan, from, to, opts = {}) => ({
    id: L.slotSeriesId(plan.id, slot.id), planId: plan.id, slotId: slot.id, title: slot.name || 'Practice', start: slot.validFrom && slot.validFrom > from ? slot.validFrom : from, end: slot.validTo && slot.validTo < to ? slot.validTo : to,
    freq: slot.freq === 'biweekly' ? 'biweekly' : 'custom', weekdays: slot.weekdays || [], startTime: slot.start, endTime: slot.end, breakMin: +slot.breakMin || 0, songTarget: +opts.songTarget || 0,
    venue: slot.venue || '', sections: slot.sections && slot.sections.length ? slot.sections : (plan.sections || []), leaderId: slot.leaderId || '', exclusions: opts.exclusions || [], skipHolidays: slot.skipHolidays !== false,
  });
  /** a timed run sheet for one session: warm-up, songs (hardest first), break at the midpoint, revision/run-through at the end */
  L.runSheet = (s, songIds, planId, warmup = 10) => {
    const out = []; let t = U.toMin(s.start); if (t == null) return out;
    const gross = L.sessGross(s) || 0; const end = t + gross; const brk = +s.breakMin || 0;
    const order = { difficult: 0, moderate: 1, easy: 2 };
    const ids = songIds.slice().sort((x, y) => (order[(St.get('songs', x) || {}).difficulty] ?? 1) - (order[(St.get('songs', y) || {}).difficulty] ?? 1));
    const push = (min, label, songId, kind) => { if (min <= 0) return; out.push({ from: U.fromMin(t), to: U.fromMin(t + min), min, label, songId, kind }); t += min; };
    push(Math.min(warmup, gross), 'Warm-up & vocal exercises', null, 'warm');
    const half = Math.ceil(ids.length / 2); let breakDone = !brk;
    ids.forEach((id, i) => {
      if (!breakDone && i === half) { push(brk, 'Break', null, 'break'); breakDone = true; }
      const m = L.songEst(planId, id).min; const left = end - t - (breakDone ? 0 : brk);
      push(Math.max(0, Math.min(m, left)), L.songTitle(id), id, 'song');
    });
    if (!breakDone) push(brk, 'Break', null, 'break');
    if (end - t > 0) push(end - t, ids.length ? 'Revision & full run-through' : 'Open practice time', null, 'rev');
    const need = ids.reduce((x, id) => x + L.songEst(planId, id).min, 0) + Math.min(warmup, gross) + brk;
    out.over = need > gross ? need - gross : 0;
    return out;
  };
})(window.App);
