/* ai.js — optional AI assistant (advisory text only; never writes records) */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const AI = A.AI = {};
  AI.available = () => !!A.caps.sample && (A.Auth.has('ai') || St.mode === 'local');
  const RULES = 'You are a planning assistant for a church choir. Use ONLY the data provided. Never invent invitations, confirmed dates, attendance, expenses or completed musical preparation. Label every estimate as an estimate. Be concise and practical; use short headings and bullet points. Dates are in East Africa Time.';
  AI.ask = (title, task, data) => {
    const body = document.createElement('div');
    body.innerHTML = `<p class="small muted">Advisory only. Nothing here is saved or applied automatically. Review it, then make any changes yourself.</p><div class="ai-out" id="aiTxt">Thinking…</div><div class="row" style="margin-top:8px"><button class="btn sm" id="aiStop">Stop</button><button class="btn sm" id="aiCopy" hidden>Copy text</button></div>`;
    const m = UI.modal({ title, wide: true, body, buttons: [{ label: 'Close' }] });
    const out = body.querySelector('#aiTxt'); const ctl = new AbortController();
    body.querySelector('#aiStop').onclick = () => ctl.abort();
    const prompt = `${RULES}\n\nTask: ${task}\n\nData (JSON):\n${JSON.stringify(data).slice(0, 60000)}`;
    A.caps.sample(prompt, { signal: ctl.signal, onText: ({ text }) => { out.textContent = text; } })
      .then(({ text, truncated }) => { out.textContent = text + (truncated ? '\n\n[Answer was cut short]' : ''); body.querySelector('#aiStop').hidden = true; const c = body.querySelector('#aiCopy'); c.hidden = false; c.onclick = () => navigator.clipboard.writeText(out.textContent).then(() => UI.toast('Copied'), () => UI.toast('Copy is not available here. Select the text instead.', true)); })
      .catch(e => { out.textContent = (e.text ? e.text + '\n\n' : '') + ({ cancelled: 'Stopped.', not_granted: 'AI access was not allowed for this page. The rest of the planner works normally.', rate_limited: 'Too many AI requests right now. Try again later.', refused: 'The assistant declined this request.' }[e.code] || 'The AI request failed. You can try again.'); body.querySelector('#aiStop').hidden = true; });
    return m;
  };
  AI.planData = (p) => {
    const fz = L.feasibility(p); const m = fz.m;
    return { plan: p.name, target: fz.tgt, today: U.today(), reservePct: fz.reserve, metrics: { sessions: m.sessions, completed: m.completed, remaining: m.remaining, plannedHours: +(m.plannedMin / 60).toFixed(1), actualHours: m.actualMin == null ? 'not recorded' : +(m.actualMin / 60).toFixed(1), uniqueSongs: m.unique, ready: m.ready, workloadHoursEstimate: +(m.workMin / 60).toFixed(1), usableHoursEstimate: +(fz.usableMin / 60).toFixed(1), scheduleSufficientEstimate: fz.ok },
      songs: m.songs.map(id => { const s = St.get('songs', id) || {}; const e = L.songEst(p.id, id); const tl = L.songTimeline(p.id, id).filter(x => x.s.status !== 'cancelled'); return { title: s.title, difficulty: s.difficulty, stage: L.label(L.STAGES, L.stage(p.id, id)), estSessions: e.sessions, estMin: e.min, practisedSessions: tl.filter(x => x.a.done).length, plannedSessions: tl.length, nextPractice: (tl.find(x => x.s.date >= U.today()) || {}).s?.date || null }; }),
      sessions: L.planSessions(p.id).map(s => ({ date: s.date, start: s.start, end: s.end, netMin: L.sessNet(s), status: s.status, songTarget: s.songTarget, assigned: L.sessAssign(s.id).map(a => L.songTitle(a.songId)), estLoadMin: L.sessAssign(s.id).reduce((t, a) => t + L.songEst(p.id, a.songId).min, 0), report: s.report || null, attendancePct: L.attStats([s]).pct })) };
  };
})(window.App);
