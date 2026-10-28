/* m_plan.js — Annual Work-Plan: year, objectives, activities by quarter, approvals, AI drafting */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const QN = ['Q1: January–March', 'Q2: April–June', 'Q3: July–September', 'Q4: October–December'];

  const objFields = (y) => [
    { k: 'title', label: 'Objective', req: true, full: true }, { k: 'description', label: 'Description', type: 'textarea', full: true },
    { k: 'target', label: 'Measurable target' }, { k: 'kpi', label: 'Performance indicator' }, { k: 'deptId', label: 'Responsible department', type: 'select', options: UI.opt.depts() },
    { k: 'status', label: 'Status', type: 'select', options: L.ACT_STATUS, blank: false }, { k: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100 },
  ];
  const actFields = (y, rec) => [
    { k: 'title', label: 'Activity', req: true, full: true }, { k: 'objectiveId', label: 'Annual objective', type: 'select', options: UI.opt.objectives(y) },
    { k: 'description', label: 'Description', type: 'textarea', full: true },
    { k: 'target', label: 'Measurable target' }, { k: 'kpi', label: 'Performance indicator' },
    { k: 'start', label: 'Start date', type: 'date', req: true }, { k: 'end', label: 'End date', type: 'date', req: true },
    { k: 'deptId', label: 'Responsible department', type: 'select', options: UI.opt.depts() }, { k: 'leaderId', label: 'Responsible leader', type: 'select', options: UI.opt.members() },
    { k: 'resources', label: 'Required resources', type: 'textarea' }, { k: 'outcome', label: 'Expected outcome', type: 'textarea' },
    ...(A.Auth.has('finance') || A.Store.mode === 'local' ? [{ k: 'budget', label: 'Estimated budget (' + (St.cfg().currency || 'TZS') + ')', type: 'number', min: 0 }] : []),
    { k: 'status', label: 'Progress status', type: 'select', options: L.ACT_STATUS, blank: false }, { k: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100 },
    { k: 'lessons', label: 'Evaluation / lessons learned', type: 'textarea', full: true },
  ];

  const M = A.M.workplan = {
    render(root, params) {
      const f = UI.stp('workplan', { year: St.cfg().year || 2027, tab: 'quarters', q: '', dept: '', status: '' }, params);
      const y = +f.year; const yd = St.get('years', String(y)) || { year: y };
      const canAll = A.Auth.can('workplan');
      const objs = St.all('objectives').filter(o => +o.year === y);
      let acts = St.live('activities').filter(a => +a.year === y);
      if (f.dept) acts = acts.filter(a => a.deptId === f.dept);
      if (f.status) acts = acts.filter(a => a.status === f.status);
      if (f.q) { const [a, b] = U.qRange(y, +f.q); acts = acts.filter(x => U.overlapRange(x.start || x.end, x.end || x.start, a, b)); }
      root.innerHTML = `
        <div class="card" style="margin-bottom:14px"><div class="row between"><div><div class="muted small">Planning year</div><h2>${y} Annual Work-Plan ${UI.pill(yd.approval || 'pending', L.APPROVAL)}</h2><div>Theme: <b style="color:var(--gold)">${esc(yd.theme || St.cfg().theme || 'not set')}</b></div></div>
        <div class="row">${canAll ? '<button class="btn" id="wYear">Edit year & theme</button>' : ''}${A.Auth.can('approve') ? `<button class="btn" id="wAppr">${yd.approval === 'approved' ? 'Mark pending' : 'Approve work-plan'}</button>` : ''}<button class="btn" id="wPdf">PDF</button></div></div></div>
        <div class="filters"><label>Year${UI.yearSel('wY', y)}</label><label>Quarter${UI.sel('wQ', [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']], f.q, 'All quarters')}</label><label>Department${UI.sel('wD', UI.opt.depts(), f.dept)}</label><label>Status${UI.sel('wS', L.ACT_STATUS, f.status)}</label></div>
        <div class="tabs">${[['quarters', 'By quarter'], ['objectives', 'Objectives (' + objs.length + ')'], ['activities', 'All activities (' + acts.length + ')']].concat(A.caps.sample ? [['ai', 'AI assistant']] : []).map(([k, t]) => `<button data-t="${k}" class="${f.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div id="wBody"></div>`;
      UI.bindFilters(root, f, { wY: 'year', wQ: 'q', wD: 'dept', wS: 'status' }, A.render);
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.tab = b.dataset.t; A.render(); });
      const yb = root.querySelector('#wYear'); if (yb) yb.onclick = () => UI.edit({ title: 'Planning year ' + y, fields: [{ k: 'theme', label: 'Annual theme', full: true }, { k: 'notes', label: 'Notes', type: 'textarea', full: true }], rec: yd, onSave: v => St.put('years', Object.assign({}, yd, v, { id: String(y), year: y, approval: yd.approval || 'pending' })) });
      const ab = root.querySelector('#wAppr'); if (ab) ab.onclick = async () => { try { if (!St.get('years', String(y))) await St.put('years', { id: String(y), year: y, approval: 'pending' }); await UI.approve('years', St.get('years', String(y)), yd.approval === 'approved' ? 'pending' : 'approved'); UI.toast('Updated'); } catch (e) { UI.fail(e); } };
      root.querySelector('#wPdf').onclick = () => { A.state.pdf = { type: 'workplan', period: { kind: 'year', year: y } }; A.go('pdf'); };
      const body = root.querySelector('#wBody');
      if (f.tab === 'quarters') quarters(body, y, acts, f);
      if (f.tab === 'objectives') objectives(body, y, objs);
      if (f.tab === 'activities') activityTable(body, acts);
      if (f.tab === 'ai') aiPanel(body, y, objs);
    },
    editActivity, newActivity: (pre) => editActivity(Object.assign({ year: +(A.state.workplan ? A.state.workplan.year : St.cfg().year || 2027), status: 'planned', approval: 'pending', progress: 0 }, pre || {})),
  };

  function quarters(el, y, acts, f) {
    const can = A.Auth.can('workplan') || A.Auth.has('workplan_dept');
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="wNew">Add activity</button>' : ''}<span class="muted small">Activities spanning quarters appear in each quarter they cover.</span></div>
      <div class="grid g2">${[1, 2, 3, 4].filter(q => !f.q || +f.q === q).map(q => { const [a, b] = U.qRange(y, q); const qa = acts.filter(x => U.overlapRange(x.start || x.end, x.end || x.start, a, b)).sort(U.by('start')); return `<div class="card"><div class="row between"><h3>${QN[q - 1]}</h3><span class="muted small">${qa.length} activit${qa.length === 1 ? 'y' : 'ies'}</span></div>
      ${qa.length ? qa.map(x => `<div class="click" data-a="${x.id}" style="padding:8px 0;border-top:1px solid var(--line);cursor:pointer"><div class="row between"><b>${esc(x.title)}</b>${UI.demo(x)}<span>${UI.pill(x.status, L.ACT_STATUS)} ${UI.pill(x.approval || 'pending', L.APPROVAL)}${x.aiSuggested ? ' <span class="pill gold">AI draft</span>' : ''}</span></div><div class="small muted">${U.fmtDs(x.start)} – ${U.fmtDs(x.end)} · ${esc(L.deptName(x.deptId))}${x.target ? ' · target: ' + esc(x.target) : ''}</div>${UI.bar(+x.progress || 0)}</div>`).join('') : '<div class="empty">No activities.</div>'}</div>`; }).join('')}</div>`;
    const nb = el.querySelector('#wNew'); if (nb) nb.onclick = () => M.newActivity({ year: y });
    el.querySelectorAll('[data-a]').forEach(d => d.onclick = () => editActivity(St.get('activities', d.dataset.a)));
  }
  function activityTable(el, acts) {
    const can = A.Auth.can('workplan') || A.Auth.has('workplan_dept'); const fin = A.Auth.has('finance');
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="wNew">Add activity</button>' : ''}<button class="btn" id="wCsv">CSV</button></div>` + UI.table([
      { label: 'Q', f: x => x.start ? 'Q' + U.qOf(x.start) : '—' }, { label: 'Activity', f: x => esc(x.title) + UI.demo(x) }, { label: 'Objective', f: x => esc((St.get('objectives', x.objectiveId) || {}).title || '—') },
      { label: 'Dates', f: x => `${U.fmtDs(x.start)} – ${U.fmtDs(x.end)}` }, { label: 'Department', f: x => esc(L.deptName(x.deptId)) }, { label: 'Leader', f: x => esc(L.memberName(x.leaderId)) },
      { label: 'Target', k: 'target' }, ...(fin ? [{ label: 'Budget', n: 1, f: x => U.money(x.budget, St.cfg().currency) }] : []),
      { label: 'Progress', f: x => `<span class="num">${+x.progress || 0}%</span>` }, { label: 'Status', f: x => UI.pill(x.status, L.ACT_STATUS) }, { label: 'Approval', f: x => UI.pill(x.approval || 'pending', L.APPROVAL) },
    ], acts.sort(U.by('start')), { click: 1, empty: 'No activities match.' });
    UI.bindRows(el, id => editActivity(St.get('activities', id)));
    const nb = el.querySelector('#wNew'); if (nb) nb.onclick = () => M.newActivity();
    el.querySelector('#wCsv').onclick = () => UI.csvDownload(`Choir_Activities_${A.state.workplan.year}.csv`, ['Quarter', 'Activity', 'Objective', 'Start', 'End', 'Department', 'Leader', 'Target', 'KPI', ...(fin ? ['Budget'] : []), 'Progress %', 'Status', 'Approval'], acts.map(x => ['Q' + (x.start ? U.qOf(x.start) : ''), x.title, (St.get('objectives', x.objectiveId) || {}).title || '', x.start, x.end, L.deptName(x.deptId), L.memberName(x.leaderId), x.target, x.kpi, ...(fin ? [x.budget] : []), x.progress || 0, x.status, x.approval])).catch(UI.fail);
  }
  function objectives(el, y, objs) {
    const can = A.Auth.can('workplan');
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="oNew">Add objective</button>' : ''}</div>` + UI.table([
      { label: 'Objective', f: o => esc(o.title) + UI.demo(o) }, { label: 'Target', k: 'target' }, { label: 'Indicator', k: 'kpi' }, { label: 'Department', f: o => esc(L.deptName(o.deptId)) },
      { label: 'Activities', n: 1, f: o => St.live('activities').filter(a => a.objectiveId === o.id).length }, { label: 'Progress', f: o => `<span class="num">${objProgress(o)}%</span>` }, { label: 'Status', f: o => UI.pill(o.status, L.ACT_STATUS) },
    ], objs, { click: 1, empty: 'No objectives for this year yet.' });
    UI.bindRows(el, id => { const o = St.get('objectives', id); UI.edit({ title: 'Objective', fields: objFields(y), rec: o, canEdit: can, onSave: v => St.put('objectives', Object.assign({}, o, v)), deleteFn: () => St.del('objectives', id) }); });
    const nb = el.querySelector('#oNew'); if (nb) nb.onclick = () => UI.edit({ title: 'New objective', fields: objFields(y), rec: { status: 'planned', progress: 0 }, onSave: v => St.put('objectives', Object.assign({ year: y }, v)) });
  }
  const objProgress = (o) => { const as = St.live('activities').filter(a => a.objectiveId === o.id); return as.length ? Math.round(as.reduce((t, a) => t + (+a.progress || 0), 0) / as.length) : (+o.progress || 0); };
  A.L.objProgress = objProgress;

  function editActivity(rec) {
    if (!rec) return;
    const y = +rec.year || 2027; const can = A.Auth.can('workplan', rec) || (!rec.id && A.Auth.has('workplan_dept'));
    const extra = [];
    if (rec.id && can) {
      extra.push({ label: 'Create event', onClick: () => { setTimeout(() => A.M.events.edit({ title: rec.title, startDate: rec.start, endDate: rec.end, activityId: rec.id, objectiveId: rec.objectiveId, depts: rec.deptId ? [rec.deptId] : [], leaderId: rec.leaderId }), 50); } });
      extra.push({ label: 'Create practice plan', onClick: () => { setTimeout(() => A.M.practice.editPlan({ name: rec.title, year: y, objectiveId: rec.objectiveId, start: rec.start, target: rec.end, depts: rec.deptId ? [rec.deptId] : [] }), 50); } });
      extra.push({ label: 'Add task', onClick: () => { setTimeout(() => A.M.tasks.edit({ linkType: 'activity', linkId: rec.id, deptId: rec.deptId, due: rec.end }), 50); } });
    }
    if (rec.id && A.Auth.can('approve')) {
      if (rec.approval !== 'approved') extra.push({ label: 'Approve', cls: 'gold', onClick: () => UI.approve('activities', rec, 'approved', { aiSuggested: false }) });
      if (rec.approval !== 'rejected') extra.push({ label: 'Reject', onClick: () => UI.approve('activities', rec, 'rejected') });
    }
    UI.edit({
      title: rec.id ? 'Activity' : 'New activity', fields: actFields(y, rec), rec, canEdit: can, extra,
      validate: v => { const e = []; if (v.start && v.end && v.end < v.start) e.push('End date must be on or after the start date.'); if (!A.Auth.has('workplan') && v.deptId && !A.Auth.myDepts().led.includes(v.deptId)) e.push('You can only plan activities for departments you lead.'); return e; },
      onSave: v => St.put('activities', Object.assign({}, rec, v, { year: y, approval: rec.approval || 'pending' })),
      deleteFn: rec.id ? () => St.put('activities', Object.assign({}, rec, { archived: true }), { summary: 'Archived ' + rec.title }) : null,
    });
  }

  // ---------- AI assistant (drafts only; never saved without review) ----------
  function aiPanel(el, y, objs) {
    const s = A.caps.sample; const can = A.Auth.can('workplan') && A.Auth.has('ai');
    el.innerHTML = `<div class="card"><h3>Draft activities with AI</h3>
      <p class="small muted">Suggestions appear below for review. Nothing is saved until you tick items and add them. Added items start as <b>Planned · Pending approval</b> and are marked "AI draft".</p>
      ${!s ? '<div class="banner info">The AI assistant is unavailable in this view. Everything else works normally.</div>' : ''}
      <label class="small muted" for="aiFocus">What should the plan focus on?</label>
      <textarea id="aiFocus" placeholder="e.g. two concerts, a recording project in Q3, outreach to two parishes, Christmas carol service">${esc((A.state.wpAi || {}).focus || '')}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="aiGo" ${s && can ? '' : 'disabled'}>Suggest activities</button><button class="btn" id="aiStop" hidden>Stop</button><span id="aiMsg" class="small muted"></span></div>
      <div id="aiOut" style="margin-top:12px"></div></div>`;
    const st = A.state.wpAi = A.state.wpAi || {};
    if (st.items) showItems();
    let ctl;
    el.querySelector('#aiStop').onclick = () => ctl && ctl.abort();
    el.querySelector('#aiGo').onclick = async () => {
      st.focus = el.querySelector('#aiFocus').value;
      const ctx = { year: y, choir: St.cfg().name, theme: (St.get('years', String(y)) || {}).theme || St.cfg().theme, objectives: objs.map(o => o.title), departments: St.live('departments').map(d => d.name), existingEvents: St.live('events').filter(e => (e.startDate || '').startsWith(String(y))).map(e => ({ title: e.title, date: e.startDate })), focus: st.focus };
      const prompt = `You help a church choir draft an annual work-plan. Propose 8-14 activities for the year ${y}, spread across Q1-Q4. Use ONLY the data given; do not invent confirmed invitations, dates promised by hosts, expenses, or completed work - these are drafts for leaders to review.\nData: ${JSON.stringify(ctx)}\nReply with only a JSON array of objects: {"title": string, "objective": one of the given objective titles or "", "department": one of the given department names or "", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "target": string, "kpi": string, "resources": string, "outcome": string}.`;
      ctl = new AbortController(); const go = el.querySelector('#aiGo'), stop = el.querySelector('#aiStop'), msg = el.querySelector('#aiMsg');
      go.disabled = true; stop.hidden = false; msg.textContent = 'Thinking…';
      try {
        const out = await s.json(prompt, { signal: ctl.signal });
        st.items = (Array.isArray(out) ? out : []).filter(x => x && x.title).map((x, i) => Object.assign({ _k: i, _on: true }, x));
        msg.textContent = st.items.length + ' suggestions (not saved)'; showItems();
      } catch (e) { msg.textContent = e.code === 'cancelled' ? 'Stopped.' : e.code === 'not_granted' ? 'AI access was not allowed for this page.' : e.code === 'rate_limited' ? 'Too many AI requests right now. Try again later.' : 'The AI request failed (' + (e.code || 'error') + '). You can try again.'; }
      finally { go.disabled = false; stop.hidden = true; }
    };
    function showItems() {
      const out = el.querySelector('#aiOut');
      out.innerHTML = `<div class="tw"><table class="t"><thead><tr><th></th><th>Draft activity</th><th>Dates</th><th>Department</th><th>Objective</th><th>Target / KPI</th></tr></thead><tbody>${st.items.map((x, i) => `<tr><td><input type="checkbox" data-i="${i}" ${x._on ? 'checked' : ''} aria-label="Select"></td><td><input type="text" data-e="${i}" data-k="title" value="${esc(x.title)}"></td><td class="small"><input type="date" data-e="${i}" data-k="start" value="${esc(x.start)}"><input type="date" data-e="${i}" data-k="end" value="${esc(x.end)}"></td><td class="small">${esc(x.department)}</td><td class="small">${esc(x.objective)}</td><td class="small">${esc(x.target)}<br><span class="muted">${esc(x.kpi)}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="aiAdd">Add selected as draft activities</button><button class="btn" id="aiDiscard">Discard suggestions</button></div>`;
      out.querySelectorAll('[data-i]').forEach(c => c.onchange = () => { st.items[+c.dataset.i]._on = c.checked; });
      out.querySelectorAll('[data-e]').forEach(c => c.onchange = () => { st.items[+c.dataset.e][c.dataset.k] = c.value; });
      out.querySelector('#aiDiscard').onclick = () => { st.items = null; out.innerHTML = ''; };
      out.querySelector('#aiAdd').onclick = async () => {
        let n = 0;
        for (const x of st.items.filter(i => i._on)) {
          const dept = St.live('departments').find(d => d.name === x.department); const ob = objs.find(o => o.title === x.objective);
          await St.put('activities', { year: y, title: x.title, start: U.validDate(x.start) ? x.start : '', end: U.validDate(x.end) ? x.end : '', deptId: dept ? dept.id : '', objectiveId: ob ? ob.id : '', target: x.target || '', kpi: x.kpi || '', resources: x.resources || '', outcome: x.outcome || '', status: 'planned', approval: 'pending', progress: 0, aiSuggested: true });
          n++;
        }
        st.items = null; UI.toast(`Added ${n} draft activities (pending approval)`); A.state.workplan.tab = 'quarters'; A.render();
      };
    }
  }
})(window.App);
