/* m_finance.js — AAC Finance Manager (Finance & Fundraising department): fees, contributions, income, expenses, ledger, reports.
   Ported from the standalone Choir Finance Manager, now on the shared database and linked to planner members, events and departments. */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, C = A.Charts, esc = U.esc;
  const F = A.Fin = {};
  F.INCOME_CATS = ['Membership Fees', 'Special Contribution', 'Donation', 'Concert Income', 'Sponsorship', 'Album/Music Sales', 'Church Support', 'Fundraising', 'Other'];
  F.EXPENSE_CATS = ['Transport', 'Food', 'Venue', 'Music Production', 'Recording', 'Instruments', 'Equipment', 'Uniforms', 'Advertising', 'Printing', 'Church Activities', 'Accommodation', 'Communication', 'Maintenance', 'Emergency', 'Other'];
  F.METHODS = ['Cash', 'Bank', 'M-Pesa', 'Airtel Money', 'Tigo Pesa', 'HaloPesa', 'Mixx by Yas', 'Other'];
  const OVERRIDES = ['Inactive', 'Suspended', 'Former Member'];

  // ---------- access ----------
  F.canEdit = () => St.mode === 'local' || (A.Auth.canWriteData() && (A.Auth.has('finance') || (L.financeDept() && A.Auth.canDept(L.financeDept().id))));
  F.canView = () => F.canEdit() || ['admin', 'chair'].includes(A.Auth.role()) || A.Auth.has('finance') || (L.financeDept() && A.Auth.myDepts().member.includes(L.financeDept().id));

  // ---------- data helpers ----------
  F.set = () => Object.assign({ monthlyFee: 10000, threshold: 5, feesFrom: '2024-01' }, St.get('fin_settings', 'main') || {});
  const CUR = () => U.today().slice(0, 7);
  /** income & expense categories: editable in the Categories tab (records keep their category even if it is removed) */
  F.incomeCats = () => { const l = (St.get('fin_settings', 'main') || {}).incomeCats; return Array.isArray(l) && l.length ? l : F.INCOME_CATS; };
  F.expenseCats = () => { const l = (St.get('fin_settings', 'main') || {}).expenseCats; return Array.isArray(l) && l.length ? l : F.EXPENSE_CATS; };
  const withCur = (list, cur) => cur && !list.includes(cur) ? list.concat([cur]) : list;
  /** member contribution categories (stored as contributions): ongoing ones (tithe, welfare…) and fundraising goals */
  const isOngoing = (c) => c && c.kind === 'ongoing';
  const openCats = () => CO().filter(c => c.status !== 'Closed').sort((a, b) => (isOngoing(b) - isOngoing(a)) || (a.name || '').localeCompare(b.name || ''));
  const fmt = (n) => (St.cfg().currency || 'TZS') + ' ' + Math.round(n || 0).toLocaleString('en-US');
  F.fmt = fmt;
  const mLabel = (m) => m ? U.MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '—';
  const nextM = (m) => { let [y, mm] = m.split('-').map(Number); mm++; if (mm > 12) { mm = 1; y++; } return y + '-' + U.pad(mm); };
  const monthRange = (a, b) => { const r = []; let m = a; let g = 0; while (m <= b && g < 240) { r.push(m); m = nextM(m); g++; } return r; };
  const last6 = (end) => { const r = []; let [y, m] = end.split('-').map(Number); for (let i = 5; i >= 0; i--) { let yy = y, mm = m - i; while (mm <= 0) { mm += 12; yy--; } r.push(yy + '-' + U.pad(mm)); } return r; };
  const bucket = (method) => method === 'Cash' ? 'Cash' : 'Bank';
  const P = () => St.all('fin_payments'), CO = () => St.all('fin_contribs'), CP = () => St.all('fin_cpay'), INC = () => St.all('fin_income'), EXP = () => St.all('fin_expenses'), OP = () => St.all('fin_openings');
  F.members = () => St.all('members').filter(m => !m.archived || P().some(p => p.memberId === m.id)).sort(U.by('name'));
  const memberFee = (m) => +m.monthlyFee || F.set().monthlyFee;
  const paidFor = (mid, month) => P().filter(p => p.memberId === mid && p.month === month).reduce((s, p) => s + (+p.amount || 0), 0);
  const monthStatus = (m, month) => { const e = memberFee(m), p = paidFor(m.id, month); if (p <= 0) return 'Unpaid'; if (p < e) return 'Partial'; if (p > e) return 'Overpaid'; return 'Paid'; };
  const paidMonths = (m) => U.uniq(P().filter(p => p.memberId === m.id).map(p => p.month)).filter(mo => ['Paid', 'Overpaid'].includes(monthStatus(m, mo))).length;
  const status = (m) => m.finStatus || (m.status === 'inactive' ? 'Inactive' : (paidMonths(m) >= F.set().threshold ? 'Active' : 'Pending'));
  const obligated = () => F.members().filter(m => !m.finStatus && m.status !== 'inactive' && !m.archived);
  const joinMonth = (m) => (m.dateJoined || '').slice(0, 7) || CUR();
  const feeMonths = (m) => monthRange(joinMonth(m) < F.set().feesFrom ? CUR() : joinMonth(m), CUR());
  const cCollected = (cid) => CP().filter(p => p.contribId === cid).reduce((s, p) => s + (+p.amount || 0), 0);
  const cPaidBy = (cid, mid) => CP().filter(p => p.contribId === cid && p.memberId === mid).reduce((s, p) => s + (+p.amount || 0), 0);
  const outstanding = (m) => { let o = 0; feeMonths(m).forEach(mo => { const e = memberFee(m), p = paidFor(m.id, mo); if (p < e) o += e - p; }); CO().forEach(c => { if (c.perMember) { const p = cPaidBy(c.id, m.id); if (p < c.perMember) o += c.perMember - p; } }); return o; };
  const openings = () => { let cash = 0, bank = 0; OP().forEach(o => { if (o.type === 'Cash') cash += +o.amount || 0; else bank += +o.amount || 0; }); return { cash, bank, total: cash + bank }; };
  const totals = () => { const o = openings(); let cash = o.cash, bank = o.bank; const add = (method, a) => { if (bucket(method) === 'Cash') cash += a; else bank += a; }; INC().forEach(i => add(i.method, +i.amount || 0)); P().forEach(p => add(p.method, +p.amount || 0)); CP().forEach(p => add(p.method, +p.amount || 0)); EXP().forEach(e => add(e.method, -(+e.amount || 0))); return { cash, bank, total: cash + bank }; };
  const inMonth = (d, m) => d && d.startsWith(m);
  const monthIncome = (m) => INC().filter(i => inMonth(i.date, m)).reduce((s, i) => s + (+i.amount || 0), 0) + P().filter(p => p.month === m).reduce((s, p) => s + (+p.amount || 0), 0) + CP().filter(p => inMonth(p.date, m)).reduce((s, p) => s + (+p.amount || 0), 0);
  const monthExpense = (m) => EXP().filter(e => inMonth(e.date, m)).reduce((s, e) => s + (+e.amount || 0), 0);
  const mName = (id) => (St.get('members', id) || {}).name || 'Unknown member';
  /** 🗑 on any row: coll|id, or fee|memberId|month for a whole month of fee payments */
  const bin = (key, what) => F.canEdit() ? `<button class="btn sm danger rowdel" data-del="${esc(key)}" data-what="${esc(what || 'this entry')}" aria-label="Delete ${esc(what || 'entry')}" title="Delete">🗑</button>` : '';
  const bindBins = (root, after) => root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!(await UI.confirm(`Delete <b>${esc(b.dataset.what)}</b>? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
    try {
      guard(); const [coll, id, month] = b.dataset.del.split('|');
      if (coll === 'fee') { for (const p of P().filter(p => p.memberId === id && p.month === month)) await St.del('fin_payments', p.id, { summary: 'Fee deleted ' + mName(id) + ' ' + month }); }
      else await St.del(coll, id, { summary: 'Deleted ' + b.dataset.what });
      UI.toast('Deleted'); if (after) after();
    } catch (x) { UI.fail(x); }
  }, true);
  /** a member's name that opens their full finance page */
  const nameLink = (id) => St.get('members', id) ? `<a href="#" class="mlink" data-mem="${esc(id)}">${esc(mName(id))}</a>` : esc(mName(id));
  const bindNames = (root) => root.addEventListener('click', (e) => { const a = e.target.closest('.mlink'); if (!a) return; e.preventDefault(); e.stopPropagation(); memberDetail(a.dataset.mem); }, true);
  F.ledger = () => {
    const rows = [];
    OP().forEach(o => rows.push({ date: o.date, type: 'Balance', category: 'Balance recorded', desc: (o.type === 'Cash' ? 'Cash in hand' : 'Bank balance') + (o.note ? ' — ' + o.note : ''), method: o.type, inAmt: o.amount > 0 ? +o.amount : 0, outAmt: o.amount < 0 ? -o.amount : 0, coll: 'fin_openings', id: o.id }));
    INC().forEach(i => rows.push({ date: i.date, type: 'Income', category: i.category, desc: i.description || '—', method: i.method, inAmt: +i.amount || 0, outAmt: 0, coll: 'fin_income', id: i.id }));
    EXP().forEach(e => rows.push({ date: e.date, type: 'Expense', category: e.category, desc: e.description || '—', method: e.method, inAmt: 0, outAmt: +e.amount || 0, coll: 'fin_expenses', id: e.id }));
    P().forEach(p => rows.push({ date: p.date, type: 'Income', category: 'Membership Fee', desc: mName(p.memberId) + ' — ' + mLabel(p.month), mid: p.memberId, descRest: ' — ' + mLabel(p.month), method: p.method, inAmt: +p.amount || 0, outAmt: 0, coll: 'fin_payments', id: p.id }));
    CP().forEach(p => rows.push({ date: p.date, type: 'Income', category: 'Contribution', desc: mName(p.memberId) + ' — ' + ((St.get('fin_contribs', p.contribId) || {}).name || 'Deleted'), mid: p.memberId, descRest: ' — ' + ((St.get('fin_contribs', p.contribId) || {}).name || 'Deleted'), method: p.method, inAmt: +p.amount || 0, outAmt: 0, coll: 'fin_cpay', id: p.id }));
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let c = 0, bk = 0; return rows.map(r => { const n = r.inAmt - r.outAmt; if (bucket(r.method) === 'Cash') c += n; else bk += n; return Object.assign(r, { cashBal: c, bankBal: bk, bal: c + bk }); });
  };
  F.byIncome = () => { const o = {}; INC().forEach(i => o[i.category] = (o[i.category] || 0) + (+i.amount || 0)); const f = P().reduce((s, p) => s + (+p.amount || 0), 0); if (f) o['Membership Fees'] = (o['Membership Fees'] || 0) + f; CP().forEach(p => { const n = (St.get('fin_contribs', p.contribId) || {}).name || 'Special Contribution'; o[n] = (o[n] || 0) + (+p.amount || 0); }); return o; };
  F.byExpense = () => { const o = {}; EXP().forEach(e => o[e.category] = (o[e.category] || 0) + (+e.amount || 0)); return o; };
  F.summary = () => ({ totals: totals(), cur: CUR(), inc: monthIncome(CUR()), exp: monthExpense(CUR()), months: last6(CUR()).map(m => [m, monthIncome(m), monthExpense(m)]), feeExpected: obligated().reduce((s, m) => s + memberFee(m), 0), feeCollected: P().filter(p => p.month === CUR()).reduce((s, p) => s + (+p.amount || 0), 0), contribs: CO().map(c => [c, cCollected(c.id)]), members: F.members().map(m => ({ m, status: status(m), months: paidMonths(m), out: outstanding(m) })) });
  F.eventMoney = (eid) => ({ income: INC().filter(i => i.eventId === eid).reduce((s, i) => s + (+i.amount || 0), 0), expense: EXP().filter(e => e.eventId === eid).reduce((s, e) => s + (+e.amount || 0), 0) });

  const methodPill = (m) => `<span class="pill ${bucket(m) === 'Cash' ? 'ok' : 'info'}">${bucket(m)}${m && m !== bucket(m) ? ' · ' + esc(m) : ''}</span>`;
  const statusPill = (s) => `<span class="pill ${({ Paid: 'ok', Active: 'ok', Partial: 'warn', Pending: 'warn', Overpaid: 'info', Unpaid: 'bad' })[s] || ''}">${esc(s)}</span>`;
  const methodField = { k: 'method', label: 'Payment type (Cash / Bank / mobile money)', type: 'select', options: F.METHODS, blank: false };
  const guard = () => { if (F.locked()) throw new Error('Unlock the AAC Finance Manager with the finance password first.'); if (!F.canEdit()) throw new Error('Only the Finance & Fundraising team can record finance entries.'); };


  // ---------- password lock: set by an administrator or the treasurer, entered once on each device ----------
  const LK = F.lock = { on: false, open: true, loaded: false, busy: false };
  const CL = () => window.ChoirLink;
  F.canManagePw = () => !!CL() && (CL().isAdmin || CL().isTreasurer);
  F.locked = () => !!CL() && LK.on && !LK.open;
  /** can this device read finance data right now? (the database decides) */
  async function probe() {
    if (!LK.on) return true;
    try { await CL().fs.collection('pl_fin_settings').limit(1).get(); return true; } catch (e) { return !(e && e.code === 'permission-denied'); }
  }
  async function refreshLock(draw = true) {
    const was = LK.open, first = !LK.loaded;
    LK.open = await probe(); LK.loaded = true;
    if (LK.open && (!was || St.FIN.some(c => St.denied[c]))) St.resub(St.FIN);
    if (draw && St.db && (first || was !== LK.open)) A.render && A.render();
  }
  if (window.ChoirReady) window.ChoirReady.then(c => {
    const L0 = CL(); if (!c || !L0) return;
    L0.fs.collection('finLock').doc('status').onSnapshot(d => { LK.on = !!(d.exists && (d.data() || {}).on); refreshLock(); }, () => { LK.loaded = true; });
  });
  const pwErr = (pw, pw2) => !pw || pw.length < 4 ? 'The password must have at least 4 characters.' : pw.length > 64 ? 'The password is too long.' : pw !== pw2 ? 'The two passwords are not the same.' : '';
  async function claim(pw) { const L0 = CL(); await L0.fs.collection('finClaims').doc(L0.uid).set({ password: pw, memberId: L0.me.id, at: Date.now() }); }
  async function setStatus(on) { const L0 = CL(); await L0.fs.collection('finLock').doc('status').set({ on, by: L0.me.name, at: Date.now() }); }
  /** create, change or (admin) reset the password */
  async function setPassword(pw) {
    const L0 = CL();
    await L0.fs.collection('secrets').doc('finance').set({ password: pw, by: L0.me.name, at: Date.now() });
    await claim(pw); await setStatus(true);
    LK.on = true; await refreshLock(false);
  }
  async function removePassword() {
    const L0 = CL();
    await L0.fs.collection('secrets').doc('finance').delete();
    await setStatus(false); LK.on = false; await refreshLock(false);
  }
  function pwForm(title, intro, onSave) {
    UI.modal({ title, body: `<p class="small muted" style="margin-top:0">${intro}</p><label class="f full"><span>New password</span><input type="password" id="fpw1" autocomplete="new-password" maxlength="64"></label><label class="f full" style="margin-top:10px"><span>Type it again</span><input type="password" id="fpw2" autocomplete="new-password" maxlength="64"></label><label class="small" style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="fpwShow"> Show password</label>`,
      buttons: [{ label: 'Cancel' }, { label: 'Save password', cls: 'pri', onClick: async ({ body }) => {
        const a = body.querySelector('#fpw1').value, b = body.querySelector('#fpw2').value, e = pwErr(a, b);
        if (e) { UI.toast(e, true); return false; }
        await onSave(a); } }] }).body.querySelector('#fpwShow').onchange = (e) => document.querySelectorAll('#fpw1,#fpw2').forEach(i => i.type = e.target.checked ? 'text' : 'password');
  }
  function lockScreen(el) {
    const mgr = F.canManagePw(), admin = CL() && CL().isAdmin;
    el.innerHTML = `<div class="card fin-lock"><div class="fin-lock-ic">🔒</div><h3>AAC Finance Manager is locked</h3><p class="small muted">Enter the finance password to open it on this device. ${mgr ? '' : 'Ask the treasurer or an administrator for the password.'}</p>
      <form id="flForm" class="fin-lock-row" autocomplete="off"><input type="password" id="flPw" placeholder="Finance password" maxlength="64" aria-label="Finance password"><button class="btn pri" id="flGo">Unlock</button></form>
      ${admin ? '<button class="btn ghost sm" id="flReset" style="margin-top:12px">Forgot the password? Set a new one</button>' : (mgr ? '<p class="small muted" style="margin-top:12px">Forgot it? An administrator can set a new password.</p>' : '')}</div>`;
    el.querySelector('#flForm').onsubmit = async (e) => {
      e.preventDefault(); const pw = el.querySelector('#flPw').value; if (!pw) return;
      const b = el.querySelector('#flGo'); b.disabled = true; b.textContent = 'Checking…';
      try { await claim(pw); await refreshLock(false); if (F.locked()) throw new Error('x'); UI.toast('Finance Manager unlocked'); A.render(); }
      catch (x) { b.disabled = false; b.textContent = 'Unlock'; UI.toast('That password is not correct.', true); el.querySelector('#flPw').select(); }
    };
    const r = el.querySelector('#flReset'); if (r) r.onclick = () => pwForm('Set a new finance password', 'The old password stops working on every device. Share the new one with the finance team.', async (pw) => { await setPassword(pw); UI.toast('New finance password saved'); A.render(); });
    setTimeout(() => { const i = el.querySelector('#flPw'); if (i) i.focus(); }, 50);
  }
  function pwCard() {
    if (!F.canManagePw()) return LK.on ? '<div class="card"><h3>Finance password</h3><p class="small muted">The Finance Manager is protected with a password. Only the treasurer and administrators can change it.</p></div>' : '';
    return `<div class="card"><h3>Finance password</h3>${LK.on
      ? '<p class="small muted">On. Everyone, including leaders, must enter the password once on each device before they can see finance records.</p><div class="row"><button class="btn" id="fpChange">Change password</button><button class="btn danger" id="fpOff">Remove password</button></div>'
      : '<p class="small muted">Off. Every leader with finance access can open the Finance Manager. Set a password so only people who know it can see the records.</p><button class="btn pri" id="fpOn">Set a password</button>'}</div>`;
  }
  function bindPwCard(el) {
    const on = el.querySelector('#fpOn'); if (on) on.onclick = () => pwForm('Set a finance password', 'Everyone will need this password once on each device to open the AAC Finance Manager.', async (pw) => { await setPassword(pw); UI.toast('Finance password set'); A.render(); });
    const ch = el.querySelector('#fpChange'); if (ch) ch.onclick = () => pwForm('Change the finance password', 'The old password stops working on every device. Share the new one with the finance team.', async (pw) => { await setPassword(pw); UI.toast('Finance password changed'); A.render(); });
    const off = el.querySelector('#fpOff'); if (off) off.onclick = async () => { if (!(await UI.confirm('Remove the finance password? Every leader with finance access will be able to open the Finance Manager without it.', { ok: 'Remove', danger: true }))) return; try { await removePassword(); UI.toast('Finance password removed'); A.render(); } catch (x) { UI.fail(x); } };
  }

  // ---------- module shell ----------
  const TABS = [['dash', 'Dashboard'], ['members', 'Members'], ['fees', 'Fees'], ['contribs', 'Fundraising & contributions'], ['income', 'Income'], ['expenses', 'Expenses'], ['ledger', 'Ledger'], ['reports', 'Reports'], ['cats', 'Categories'], ['settings', 'Settings & import']];
  F.render = (el) => {
    if (CL() && !LK.loaded) { el.innerHTML = '<div class="empty">Checking access…</div>'; return; }
    if (F.locked()) return lockScreen(el);
    if (!F.canView()) return myStatement(el);
    const s = A.state.fin = A.state.fin || { tab: 'dash', mf: 'all', q: '', month: CUR() };
    el.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="small muted">${F.canEdit() ? 'You can record finance entries.' : 'View only: the Finance & Fundraising team records entries.'} All amounts in ${esc(St.cfg().currency || 'TZS')}.</div></div>
      <div class="tabs">${TABS.map(([k, t]) => `<button data-ft="${k}" class="${s.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="finBody"></div>`;
    el.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => { s.tab = b.dataset.ft; A._animate = true; A.render(); });
    const body = el.querySelector('#finBody'); bindNames(body); bindBins(body);
    ({ dash, members, fees, contribs, income, expenses, ledger, reports, cats, settings })[s.tab](body, s);
    A.Charts.bindTips(body); UI.bindGo(body);
  };
  A.M.finance = { render(root) { root.innerHTML = `<div class="hero-h"><div><div class="muted small">Finance & Fundraising department</div><h2>AAC <em>Finance Manager</em></h2></div></div><div id="finRoot"></div>`; F.render(root.querySelector('#finRoot')); } };

  function myStatement(el) {
    const mid = A.Auth.memberId(); const m = mid && St.get('members', mid);
    if (!m) { el.innerHTML = '<div class="empty">Finance records are kept by the Finance & Fundraising team. Link your account to your member profile (Settings → Roles) to see your own statement here.</div>'; return; }
    const fp = P().filter(p => p.memberId === mid), cp = CP().filter(p => p.memberId === mid);
    el.innerHTML = `<div class="card"><h3>My statement · ${esc(m.name)}</h3><dl class="kv"><dt>Status</dt><dd>${statusPill(status(m))}</dd><dt>Months fully paid</dt><dd>${paidMonths(m)}</dd><dt>Total fees paid</dt><dd>${fmt(fp.reduce((s, p) => s + (+p.amount || 0), 0))}</dd><dt>Total contributions</dt><dd>${fmt(cp.reduce((s, p) => s + (+p.amount || 0), 0))}</dd><dt>Outstanding</dt><dd>${fmt(outstanding(m))}</dd></dl></div>`;
  }

  // ---------- dashboard ----------
  function dash(el) {
    const t = totals(), cur = CUR(), inc = monthIncome(cur), exp = monthExpense(cur); const obl = obligated();
    let paid = 0, part = 0, unpaid = 0; obl.forEach(m => { const st = monthStatus(m, cur); if (st === 'Paid' || st === 'Overpaid') paid++; else if (st === 'Partial') part++; else unpaid++; });
    const feeOut = obl.reduce((s, m) => s + Math.max(0, memberFee(m) - paidFor(m.id, cur)), 0);
    const cTot = CO().reduce((s, c) => s + cCollected(c.id), 0), cTar = CO().reduce((s, c) => s + (+c.target || 0), 0);
    const act = F.members().filter(m => status(m) === 'Active').length;
    const m6 = last6(cur); const led = F.ledger();
    el.innerHTML = `<div class="kpis">
        <div class="kpi k1"><span class="h"><i>${A.icon('reports')}</i>Total balance</span><span class="b"><span class="v">${U.num(t.total)}</span><span class="f">Cash + bank</span></span></div>
        <div class="kpi k2"><span class="h"><i>${A.icon('finance')}</i>Cash in hand</span><span class="b"><span class="v">${U.num(t.cash)}</span><span class="f">${esc(St.cfg().currency || 'TZS')}</span></span></div>
        <div class="kpi k3"><span class="h"><i>${A.icon('finance')}</i>Bank & mobile money</span><span class="b"><span class="v">${U.num(t.bank)}</span><span class="f">${esc(St.cfg().currency || 'TZS')}</span></span></div>
        <div class="kpi k4"><span class="h"><i>${A.icon('reports')}</i>Net this month</span><span class="b"><span class="v">${inc - exp >= 0 ? '+' : ''}${U.num(inc - exp)}</span><span class="f">${mLabel(cur)}</span></span></div></div>
      <div class="stats">${UI.stat(fmt(inc), 'Income this month', { tone: 'ok' })}${UI.stat(fmt(exp), 'Expenses this month', { tone: 'bad' })}${UI.stat(fmt(P().filter(p => p.month === cur).reduce((s, p) => s + (+p.amount || 0), 0)), 'Fees collected (' + mLabel(cur) + ')')}${UI.stat(fmt(feeOut), 'Fees outstanding this month', { tone: feeOut ? 'warn' : '' })}${UI.stat(fmt(cTot), 'Contributions collected', { f: 'of ' + fmt(cTar) + ' target' })}${UI.stat(`${act} / ${obl.length - Math.min(act, obl.length)}`, 'Members active / pending', { f: `${paid} paid · ${part} partial · ${unpaid} unpaid this month` })}</div>
      <div class="grid g2">
        <div class="card"><h3>Income vs expenses (last 6 months)</h3>${m6.some(m => monthIncome(m) || monthExpense(m)) ? C.lines(m6.map(mLabel), [{ name: 'Income', values: m6.map(monthIncome), color: 'var(--s1)' }, { name: 'Expenses', values: m6.map(monthExpense), color: 'var(--s3)' }], { unit: St.cfg().currency || 'TZS' }) : '<p class="muted small">No income or expenses recorded yet.</p>'}</div>
        <div class="card"><h3>Membership fees · ${mLabel(cur)}</h3>${obl.length ? C.donut([{ label: 'Paid', value: paid, color: '#2fb36a' }, { label: 'Partial', value: part, color: '#e3b04b' }, { label: 'Unpaid', value: unpaid, color: '#e0566b' }].filter(x => x.value), String(obl.length), 'members') : '<p class="muted small">No members yet.</p>'}</div>
        <div class="card"><h3>Fundraising progress</h3>${C.meters(CO().map(c => ({ label: c.name, value: cCollected(c.id), max: +c.target || 0, sub: `${fmt(cCollected(c.id))} / ${fmt(c.target)}` }))) || '<p class="muted small">No contributions yet.</p>'}</div>
        <div class="card"><h3>Recent transactions</h3>${led.slice(-7).reverse().map(r => `<div class="row between small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${U.fmtDs(r.date)} · ${esc(r.category)} — ${esc(r.desc)}</span><b style="color:var(--${r.inAmt ? 'ok' : 'bad'})">${r.inAmt ? '+' : '−'}${fmt(r.inAmt || r.outAmt)}</b></div>`).join('') || '<p class="muted small">No transactions yet.</p>'}</div></div>`;
  }

  // ---------- members ----------
  function members(el, s) {
    let list = F.members().filter(m => { const st = status(m); if (s.mf === 'active' && st !== 'Active') return false; if (s.mf === 'pending' && st !== 'Pending') return false; if (s.mf === 'removed' && !m.finStatus) return false; if (s.mf === 'unpaid' && (m.finStatus || monthStatus(m, CUR()) !== 'Unpaid')) return false; if (s.mf === 'outstanding' && outstanding(m) <= 0) return false; if (s.q && !(m.name + ' ' + (m.memberCode || '')).toLowerCase().includes(s.q.toLowerCase())) return false; return true; });
    el.innerHTML = `<div class="banner info">A member becomes <b>Active</b> once they have fully paid ${F.set().threshold} months of fees. Until then they show as <b>Pending</b>. These are the same members as the rest of the planner. Add new members under Members.</div>
      <div class="filters"><label class="grow">Search<input type="search" id="fq" value="${esc(s.q)}" placeholder="Name or member ID"></label><label>Show${UI.sel('fmf', [['all', 'All'], ['active', 'Active'], ['pending', 'Pending'], ['removed', 'Inactive / suspended / former'], ['unpaid', 'Unpaid this month'], ['outstanding', 'Has outstanding balance']], s.mf, null)}</label></div>` +
      UI.table([{ label: 'Name', f: m => `<b>${nameLink(m.id)}</b>` }, { label: 'Member ID', f: m => esc(m.memberCode || '—') }, { label: 'Section', f: m => (m.sections || []).map(x => UI.chip(x, L.sectionColor(x))).join(' ') || '—' }, { label: 'Status', f: m => statusPill(status(m)) }, { label: 'Months paid', n: 1, f: m => paidMonths(m) }, { label: 'Outstanding', n: 1, f: m => fmt(outstanding(m)) }], list, { click: 1, empty: 'No members match.' });
    UI.bindFilters(el, s, { fq: 'q', fmf: 'mf' }, A.render);
    UI.bindRows(el, id => memberDetail(id));
  }
  /** Everything recorded for one member, with edit and delete for each entry. */
  function memberDetail(id, tab) {
    const m = St.get('members', id); if (!m) return; const can = F.canEdit();
    let view = tab || 'pay'; const picked = new Set();
    const body = document.createElement('div');
    const entries = () => [
      ...P().filter(p => p.memberId === id).map(p => ({ k: 'p', id: p.id, date: p.date, what: 'Membership fee · ' + mLabel(p.month), sort: p.month, method: p.method, amount: +p.amount || 0 })),
      ...CP().filter(p => p.memberId === id).map(p => ({ k: 'c', id: p.id, date: p.date, what: ((St.get('fin_contribs', p.contribId) || {}).name || 'Deleted contribution') + (p.note ? ' · ' + p.note : ''), sort: '', method: p.method, amount: +p.amount || 0 }))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.sort || '').localeCompare(a.sort || ''));
    const paint = () => {
      const es = entries(); const months = feeMonths(m);
      const feeTot = es.filter(x => x.k === 'p').reduce((t, x) => t + x.amount, 0), conTot = es.filter(x => x.k === 'c').reduce((t, x) => t + x.amount, 0);
      [...picked].forEach(k => { if (!es.some(x => x.k + ':' + x.id === k)) picked.delete(k); });
      body.innerHTML = `<div class="stats" style="margin-bottom:12px">${UI.stat(fmt(feeTot), 'Fees paid (all time)', { tone: 'ok' })}${UI.stat(fmt(conTot), 'Contributions paid', { tone: 'ok' })}${UI.stat(fmt(outstanding(m)), 'Outstanding', { tone: outstanding(m) > 0 ? 'bad' : 'ok' })}${UI.stat(paidMonths(m) + ' / ' + F.set().threshold, 'Months fully paid')}</div>
        <dl class="kv"><dt>Member ID</dt><dd>${esc(m.memberCode || '—')}</dd><dt>Section</dt><dd>${esc((m.sections || []).join(', ') || '—')}</dd><dt>Phone</dt><dd>${esc(m.phone || '—')}</dd><dt>Joined</dt><dd>${U.fmtD(m.dateJoined)}</dd><dt>Monthly fee</dt><dd>${fmt(memberFee(m))}${m.monthlyFee ? '' : ' (standard)'}</dd><dt>Status</dt><dd>${statusPill(status(m))}</dd></dl>
        <div class="tabs" style="margin-top:14px"><button data-mv="pay" class="${view === 'pay' ? 'on' : ''}">Payments (${es.length})</button><button data-mv="months" class="${view === 'months' ? 'on' : ''}">Months</button><button data-mv="con" class="${view === 'con' ? 'on' : ''}">Contributions</button></div>
        ${view === 'pay' ? (es.length ? `
          ${can ? `<div class="row" style="margin-bottom:8px"><label class="small row" style="gap:6px"><input type="checkbox" id="mdAll" ${picked.size && picked.size === es.length ? 'checked' : ''}> Select all</label><button class="btn sm danger" id="mdDel" ${picked.size ? '' : 'disabled'}>🗑 Delete selected${picked.size ? ' (' + picked.size + ')' : ''}</button></div>` : ''}
          <div class="elist">${es.map(x => `<div class="eitem ${picked.has(x.k + ':' + x.id) ? 'sel' : ''}">
            ${can ? `<input type="checkbox" data-pk="${x.k}:${x.id}" ${picked.has(x.k + ':' + x.id) ? 'checked' : ''} aria-label="Select">` : ''}
            <div class="emain"><b>${esc(x.what)}</b><span>${U.fmtD(x.date)} ${methodPill(x.method)}</span></div>
            <div class="eamt">${fmt(x.amount)}</div>
            ${can ? `<div class="eact"><button class="btn sm" data-ed="${x.k}:${x.id}">Edit</button><button class="btn sm danger" data-rm="${x.k}:${x.id}" aria-label="Delete">🗑</button></div>` : ''}
          </div>`).join('')}</div>` : '<div class="empty">No payments recorded for this member yet.</div>') : ''}
        ${view === 'months' ? UI.table([{ label: 'Month', f: mo => mLabel(mo) }, { label: 'Expected', n: 1, f: mo => fmt(memberFee(m)) }, { label: 'Paid', n: 1, f: mo => fmt(paidFor(m.id, mo)) }, { label: 'Balance', n: 1, f: mo => fmt(Math.max(0, memberFee(m) - paidFor(m.id, mo))) }, { label: 'Status', f: mo => statusPill(monthStatus(m, mo)) }, { label: '', f: mo => can ? (paidFor(m.id, mo) > 0 ? `<button class="btn sm" data-em="${mo}">Edit / delete</button>` : '') + (paidFor(m.id, mo) < memberFee(m) ? ` <button class="btn sm pri" data-rp="${mo}">Record</button>` : '') : '' }], months.slice().reverse(), { empty: 'No months yet.' }) : ''}
        ${view === 'con' ? `${can ? '<div class="row" style="margin-bottom:8px"><button class="btn sm pri" id="mdCon">+ Record contribution</button><span class="small muted">Categories are managed in the Categories tab.</span></div>' : ''}` + UI.table([{ label: 'Category', f: c => `<b>${esc(c.name)}</b>${c.status === 'Closed' ? ' <span class="pill">closed</span>' : ''}<div class="small muted">${isOngoing(c) ? 'Ongoing' : 'Fundraising goal'}</div>` }, { label: 'Expected', n: 1, f: c => c.perMember ? fmt(c.perMember) : '—' }, { label: 'Paid', n: 1, f: c => fmt(cPaidBy(c.id, m.id)) }, { label: 'Times', n: 1, f: c => CP().filter(p => p.contribId === c.id && p.memberId === m.id).length }, { label: 'Last paid', f: c => { const l = CP().filter(p => p.contribId === c.id && p.memberId === m.id).sort(U.by('date', -1))[0]; return l ? U.fmtD(l.date) : '—'; } }, { label: 'Balance', n: 1, f: c => c.perMember ? fmt(Math.max(0, c.perMember - cPaidBy(c.id, m.id))) : '—' }, { label: '', f: c => can && c.status !== 'Closed' ? `<button class="btn sm pri" data-cp="${c.id}">Record</button>` : '' }], CO().filter(c => c.status !== 'Closed' || cPaidBy(c.id, m.id) > 0).sort((a, b) => (isOngoing(b) - isOngoing(a)) || (a.name || '').localeCompare(b.name || '')), { empty: 'No contribution categories yet. Add them in the Categories tab.' }) : ''}`;
      body.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { view = b.dataset.mv; paint(); });
      body.querySelectorAll('[data-pk]').forEach(c => c.onchange = () => { c.checked ? picked.add(c.dataset.pk) : picked.delete(c.dataset.pk); paint(); });
      const all = body.querySelector('#mdAll'); if (all) all.onchange = () => { if (all.checked) es.forEach(x => picked.add(x.k + ':' + x.id)); else picked.clear(); paint(); };
      const del = async (keys) => {
        if (!keys.length) return;
        const list = keys.map(k => es.find(x => x.k + ':' + x.id === k)).filter(Boolean);
        if (!(await UI.confirm(`Delete ${list.length === 1 ? 'this payment' : list.length + ' payments'}?<br><span class="small muted">${list.map(x => esc(x.what) + ' · ' + fmt(x.amount)).join('<br>')}</span><br><br>This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
        try { guard(); for (const x of list) await St.del(x.k === 'p' ? 'fin_payments' : 'fin_cpay', x.id, { summary: 'Deleted ' + x.what + ' · ' + m.name }); list.forEach(x => picked.delete(x.k + ':' + x.id)); UI.toast(list.length === 1 ? 'Payment deleted' : `${list.length} payments deleted`); paint(); }
        catch (e) { UI.fail(e); }
      };
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => del([b.dataset.rm]));
      const bd = body.querySelector('#mdDel'); if (bd) bd.onclick = () => del([...picked]);
      body.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { const [k, x] = b.dataset.ed.split(':'); md.close(); if (k === 'p') editPayment(St.get('fin_payments', x), () => memberDetail(id, view)); else { const p = St.get('fin_cpay', x); const c = St.get('fin_contribs', p.contribId); if (c) contribPay(c, p); } });
      body.querySelectorAll('[data-em]').forEach(b => b.onclick = () => { md.close(); editMonth(m, b.dataset.em); });
      body.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { md.close(); payFee(m, [b.dataset.rp]); });
      body.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => memberContrib(m, b.dataset.cp, paint));
      const mc = body.querySelector('#mdCon'); if (mc) mc.onclick = () => memberContrib(m, null, paint);
    };
    paint();
    const md = UI.modal({ title: m.name + ' · finance', wide: true, body, buttons: [{ label: 'Close' }, { label: 'Statement CSV', onClick: () => { UI.csvDownload(`Statement_${U.slug(m.name)}.csv`, ['Date paid', 'For', 'Type', 'Amount'], entries().map(x => [x.date, x.what, x.method, x.amount])).catch(UI.fail); return false; } }, ...(can ? [{ label: 'Finance details', onClick: () => setTimeout(() => memberFinEdit(m), 40) }, { label: 'Record contribution', onClick: () => { memberContrib(m, null, paint); return false; } }, { label: 'Record fee payment', cls: 'pri', onClick: () => setTimeout(() => payFee(m), 40) }] : [])] });
  }
  /** edit one fee payment entry (month, amount, date, type) */
  function editPayment(p, after) {
    if (!p) return; const m = St.get('members', p.memberId);
    UI.edit({ title: 'Edit fee payment · ' + mName(p.memberId), rec: { month: p.month, amount: p.amount, date: p.date, method: p.method || 'Cash' }, fields: [{ k: 'month', label: 'Month paid for', type: 'month', req: true }, { k: 'amount', label: 'Amount', type: 'number', min: 1, req: true }, { k: 'date', label: 'Date paid', type: 'date', req: true }, methodField],
      validate: v => /^\d{4}-\d{2}$/.test(v.month || '') ? [] : ['Choose the month this payment is for.'],
      onSave: async v => { guard(); await St.put('fin_payments', Object.assign({}, p, v), { summary: 'Fee edit ' + mName(p.memberId) + ' ' + v.month }); if (after) setTimeout(after, 60); },
      deleteFn: async () => { guard(); await St.del('fin_payments', p.id, { summary: 'Fee deleted ' + mName(p.memberId) + ' ' + p.month }); if (after) setTimeout(after, 60); }, deleteLabel: 'Delete this payment' });
  }
  function memberFinEdit(m) {
    UI.edit({ title: 'Finance details · ' + m.name, rec: Object.assign({ finStatus: '' }, m), fields: [{ k: 'memberCode', label: 'Member ID', placeholder: 'CH-001' }, { k: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male'] }, { k: 'dateJoined', label: 'Date joined', type: 'date' }, { k: 'monthlyFee', label: `Monthly fee (blank = standard ${fmt(F.set().monthlyFee)})`, type: 'number', min: 0 }, { k: 'finStatus', label: 'Status override', type: 'select', options: OVERRIDES, blank: 'No override (automatic)' }],
      onSave: (v) => { guard(); return St.patch('members', m.id, Object.assign(v, { finStatus: v.finStatus || null, monthlyFee: v.monthlyFee || null }), { summary: 'Finance details ' + m.name }); } });
  }
  const prevM = (m) => { let [y, mm] = m.split('-').map(Number); mm--; if (mm < 1) { mm = 12; y--; } return y + '-' + U.pad(mm); };
  const addM = (m, n) => { let x = m; for (let k = 0; k < Math.abs(n); k++) x = n < 0 ? prevM(x) : nextM(x); return x; };
  /** Record a fee payment: tap the months it covers (earlier months are one tap away). */
  function payFee(m, preset) {
    if (!m) return;
    const fee = memberFee(m); const cur = CUR();
    const owed = (mo) => Math.max(0, fee - paidFor(m.id, mo));
    const unpaid = feeMonths(m).filter(mo => owed(mo) > 0);
    let from = [addM(cur, -11), joinMonth(m) < cur ? joinMonth(m) : cur, unpaid[0] || cur, ...(preset || [])].sort()[0];
    const to = addM(cur, 3);   // allow paying a few months in advance
    let sel = new Set(preset && preset.length ? preset : (unpaid.length ? [unpaid[0]] : [cur]));
    let amtTouched = false;
    const body = document.createElement('div');
    const due = () => [...sel].reduce((t, mo) => t + (owed(mo) || 0), 0);
    const paint = () => {
      const months = monthRange(from, to); const years = U.uniq(months.map(x => x.slice(0, 4)));
      const sorted = [...sel].sort();
      body.innerHTML = `<p class="small muted" style="margin:0 0 10px">Tap every month this payment covers. Red = unpaid, amber = part paid, green = paid, grey = not due (before joining or in advance). Monthly fee: <b>${fmt(fee)}</b>.</p>
        <div class="row" style="gap:6px;margin-bottom:10px">
          <button type="button" class="btn sm" data-q="unpaid" ${unpaid.length ? '' : 'disabled'}>All unpaid (${unpaid.length}${unpaid.length ? ' · ' + fmt(unpaid.reduce((t, mo) => t + owed(mo), 0)) : ''})</button>
          <button type="button" class="btn sm" data-q="clear">Clear</button>
          <button type="button" class="btn sm ghost" data-q="earlier">⟵ Show earlier months</button>
        </div>
        ${years.map(y => `<div class="fy"><b>${y}</b><div class="fmonths">${months.filter(x => x.startsWith(y)).map(mo => { const due0 = feeMonths(m).includes(mo); const st = paidFor(m.id, mo) <= 0 ? (due0 ? 'u' : 'n') : owed(mo) > 0 ? 'p' : 'd'; return `<button type="button" class="fm ${st} ${sel.has(mo) ? 'on' : ''} ${mo === cur ? 'now' : ''}" data-mo="${mo}" title="${mLabel(mo)} · ${st === 'd' ? 'paid' : st === 'p' ? 'owes ' + fmt(owed(mo)) : st === 'n' ? (mo > cur ? 'in advance' : 'before joining') : 'unpaid'}">${U.MON[+mo.slice(5, 7) - 1]}${st === 'p' ? '<i>½</i>' : st === 'd' ? '<i>✓</i>' : ''}</button>`; }).join('')}</div></div>`).join('')}
        <div class="small" style="margin:10px 0 12px;min-height:18px">${sorted.length ? `<b>${sorted.length} month${sorted.length === 1 ? '' : 's'}:</b> ${sorted.map(mLabel).join(', ')} · due <b>${fmt(due())}</b>` : '<span class="muted">No month selected yet.</span>'}</div>
        <div class="form">
          <label class="f"><span>Total amount paid</span><input type="number" id="pfAmt" min="1" value="${amtTouched ? (body.__amt || '') : (due() || fee)}"></label>
          <label class="f"><span>Date paid</span><input type="date" id="pfDate" value="${body.__date || U.today()}"></label>
          <label class="f"><span>Payment type</span><select id="pfMeth">${F.METHODS.map(x => `<option ${x === (body.__meth || 'Cash') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        </div><p class="small muted" style="margin-top:6px">The amount is shared across the months oldest first; anything extra stays on the last month.</p>`;
      const amt = body.querySelector('#pfAmt');
      amt.oninput = () => { amtTouched = true; body.__amt = amt.value; };
      body.querySelector('#pfDate').onchange = (e) => body.__date = e.target.value;
      body.querySelector('#pfMeth').onchange = (e) => body.__meth = e.target.value;
      body.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => { const mo = b.dataset.mo; sel.has(mo) ? sel.delete(mo) : sel.add(mo); paint(); });
      body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const q = b.dataset.q; if (q === 'unpaid') sel = new Set(unpaid); if (q === 'clear') sel = new Set(); if (q === 'earlier') from = addM(from, -12); paint(); });
    };
    paint();
    UI.modal({ title: 'Record fee payment · ' + m.name, wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'Save payment', cls: 'pri', onClick: async () => {
      guard();
      const ms = [...sel].sort(); let amt = +body.querySelector('#pfAmt').value; const date = body.querySelector('#pfDate').value || U.today(); const method = body.querySelector('#pfMeth').value;
      if (!ms.length) { UI.toast('Tap at least one month.', true); return false; }
      if (!(amt > 0)) { UI.toast('Enter the amount paid.', true); return false; }
      for (let i = 0; i < ms.length && amt > 0; i++) {
        const alloc = i === ms.length - 1 ? amt : Math.min(amt, owed(ms[i]));
        if (alloc <= 0) continue;
        await St.put('fin_payments', { memberId: m.id, month: ms[i], amount: alloc, date, method }, { summary: 'Fee ' + m.name + ' ' + ms[i] });
        amt -= alloc;
      }
      UI.toast(`Saved for ${ms.map(mLabel).join(', ')}`);
    } }] });
  }
  function editMonth(m, month) {
    const ex = P().filter(p => p.memberId === m.id && p.month === month); const tot = ex.reduce((s, p) => s + (+p.amount || 0), 0);
    UI.edit({ title: `Fee payment · ${m.name} · ${mLabel(month)}`, rec: { amount: tot, date: (ex[0] || {}).date || U.today(), method: (ex[0] || {}).method || 'Cash' }, fields: [{ k: 'amount', label: 'Amount paid (0 removes the payment)', type: 'number', min: 0 }, { k: 'date', label: 'Date', type: 'date' }, methodField],
      onSave: async (v) => { guard(); for (const p of ex) await St.del('fin_payments', p.id, { audit: false }); if (+v.amount > 0) await St.put('fin_payments', { memberId: m.id, month, amount: +v.amount, date: v.date, method: v.method }, { summary: 'Fee edit ' + m.name + ' ' + month }); },
      deleteFn: ex.length ? async () => { guard(); for (const p of ex) await St.del('fin_payments', p.id, { summary: 'Fee deleted ' + m.name + ' ' + month }); UI.toast(`Payment for ${mLabel(month)} deleted`); } : null, deleteLabel: 'Delete this payment' });
  }

  // ---------- fees ----------
  function fees(el, s) {
    const mo = s.month || CUR(); const obl = obligated(); const can = F.canEdit();
    const exp = obl.reduce((t, m) => t + memberFee(m), 0), col = obl.reduce((t, m) => t + paidFor(m.id, mo), 0);
    const owesHere = (m) => paidFor(m.id, mo) < memberFee(m);
    el.innerHTML = `<div class="filters" style="align-items:center">
        <div class="row" style="gap:6px;flex:0 0 auto;flex-wrap:nowrap;align-items:flex-end"><button class="btn sm" id="fPrev" aria-label="Previous month" style="height:38px">‹</button><label style="min-width:160px;flex:0 0 170px">Month<input type="month" id="fmo" value="${mo}"></label><button class="btn sm" id="fNext" aria-label="Next month" style="height:38px">›</button>${mo !== CUR() ? '<button class="btn sm ghost" id="fNow">This month</button>' : ''}</div>
        <span class="small muted">${mLabel(mo)} · Standard fee ${fmt(F.set().monthlyFee)} · Expected ${fmt(exp)} · Collected ${fmt(col)} · Outstanding ${fmt(Math.max(0, exp - col))}</span></div>
      ${can && obl.some(owesHere) ? `<div class="row" style="margin-bottom:10px"><button class="btn" id="fAll">Select all who owe</button><button class="btn gold" id="fBulk" disabled>Mark selected as paid for ${mLabel(mo)}</button><span class="small muted" id="fSelN"></span></div>` : ''}` +
      UI.table([
        ...(can ? [{ label: '', f: m => owesHere(m) ? `<input type="checkbox" data-sel="${m.id}" aria-label="Select ${esc(m.name)}">` : '' }] : []),
        { label: 'Member', f: m => `<b>${nameLink(m.id)}</b>` }, { label: 'Expected', n: 1, f: m => fmt(memberFee(m)) }, { label: 'Paid', n: 1, f: m => fmt(paidFor(m.id, mo)) }, { label: 'Balance', n: 1, f: m => fmt(Math.max(0, memberFee(m) - paidFor(m.id, mo))) }, { label: 'Status', f: m => statusPill(monthStatus(m, mo)) },
        { label: 'Other months owed', f: m => { const n = feeMonths(m).filter(x => x !== mo && paidFor(m.id, x) < memberFee(m)).length; return n ? `<span class="pill bad">${n}</span>` : '<span class="muted small">—</span>'; } },
        { label: 'Type', f: m => { const p = P().find(x => x.memberId === m.id && x.month === mo); return p ? methodPill(p.method) : '—'; } },
        { label: '', f: m => can ? `<span style="white-space:nowrap">${paidFor(m.id, mo) > 0 ? `<button class="btn sm" data-edm="${m.id}">Edit</button> ` + bin(`fee|${m.id}|${mo}`, `${m.name}'s ${mLabel(mo)} fee payment (${fmt(paidFor(m.id, mo))})`) + ' ' : ''}${owesHere(m) ? `<button class="btn sm pri" data-pay="${m.id}">Record payment</button>` : ''}</span>` : '' }], obl, { click: 1, empty: 'No members yet.' });
    const go = (v) => { s.month = v; A._keepScroll = true; A.render(); };
    el.querySelector('#fmo').onchange = (e) => go(e.target.value || CUR());
    el.querySelector('#fPrev').onclick = () => go(prevM(mo));
    el.querySelector('#fNext').onclick = () => go(nextM(mo));
    const fn = el.querySelector('#fNow'); if (fn) fn.onclick = () => go(CUR());
    UI.bindRows(el, id => memberDetail(id));
    el.querySelectorAll('[data-sel]').forEach(c => c.onclick = (e) => e.stopPropagation());
    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = (e) => { e.stopPropagation(); payFee(St.get('members', b.dataset.pay), [mo]); });
    el.querySelectorAll('[data-edm]').forEach(b => b.onclick = (e) => { e.stopPropagation(); editMonth(St.get('members', b.dataset.edm), mo); });
    const bulk = el.querySelector('#fBulk');
    if (bulk) {
      const picked = () => [...el.querySelectorAll('[data-sel]:checked')].map(c => c.dataset.sel);
      const upd = () => { const n = picked().length; bulk.disabled = !n; el.querySelector('#fSelN').textContent = n ? `${n} selected · ${fmt(picked().reduce((t, id) => { const m = St.get('members', id); return t + Math.max(0, memberFee(m) - paidFor(id, mo)); }, 0))}` : ''; };
      el.querySelectorAll('[data-sel]').forEach(c => c.onchange = upd);
      el.querySelector('#fAll').onclick = () => { const all = [...el.querySelectorAll('[data-sel]')]; const on = !all.every(c => c.checked); all.forEach(c => c.checked = on); upd(); };
      bulk.onclick = () => {
        const ids = picked(); if (!ids.length) return;
        UI.modal({ title: `Mark ${ids.length} as paid · ${mLabel(mo)}`, body: `<p class="small">Each selected member is recorded as paying the rest of their ${mLabel(mo)} fee.</p><div class="form"><label class="f"><span>Date paid</span><input type="date" id="bkDate" value="${U.today()}"></label><label class="f"><span>Payment type</span><select id="bkMeth">${F.METHODS.map(x => `<option>${esc(x)}</option>`).join('')}</select></label></div>`,
          buttons: [{ label: 'Cancel' }, { label: 'Save payments', cls: 'pri', onClick: async ({ body }) => { guard(); const date = body.querySelector('#bkDate').value || U.today(), method = body.querySelector('#bkMeth').value; let n = 0;
            for (const id of ids) { const m = St.get('members', id); const rest = Math.max(0, memberFee(m) - paidFor(id, mo)); if (rest > 0) { await St.put('fin_payments', { memberId: id, month: mo, amount: rest, date, method }, { audit: false }); n++; } }
            await St.audit('bulk', 'fin_payments', mo, `${n} fee payments for ${mo}`).catch(() => { }); UI.toast(`Recorded ${n} payment${n === 1 ? '' : 's'} for ${mLabel(mo)}`); } }] });
      };
    }
  }

  // ---------- contributions / fundraising ----------
  function contribs(el) {
    const can = F.canEdit();
    el.innerHTML = `<div class="row" style="margin-bottom:12px">${can ? '<button class="btn pri" id="cNew">New fundraising goal</button><button class="btn" id="cNewO">New contribution category</button>' : ''}</div>` + (CO().length ? `<div class="grid g2">${CO().map(c => { const col = cCollected(c.id); const pct = c.target ? Math.min(100, Math.round(col / c.target * 100)) : 0; const payers = U.uniq(CP().filter(p => p.contribId === c.id).map(p => p.memberId)).length; return `<div class="card"><div class="row between"><h3 style="margin:0">${esc(c.name)}</h3><span class="pill ${c.status === 'Closed' ? '' : 'ok'}">${esc(c.status === 'Closed' ? 'Closed' : isOngoing(c) ? 'Ongoing' : 'Active')}</span></div><p class="small muted">${esc(c.description || '')}${c.eventId ? ' · for ' + esc((St.get('events', c.eventId) || {}).title || '') : ''}</p>
      ${c.target ? `<div class="row between small"><b>${fmt(col)}</b><span>${pct}% of ${fmt(c.target)}</span></div>${UI.bar(pct, 'gold')}` : `<div class="row between small"><b>${fmt(col)}</b><span class="muted">${isOngoing(c) ? 'Ongoing contribution' : 'collected'}</span></div>`}
      <dl class="kv" style="margin-top:10px"><dt>Per member</dt><dd>${c.perMember ? fmt(c.perMember) : 'Flexible'}</dd><dt>Deadline</dt><dd>${U.fmtD(c.deadline)}</dd><dt>Contributed</dt><dd>${payers} of ${obligated().length} members</dd><dt>Responsible</dt><dd>${esc(c.responsible || '—')}</dd></dl>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-cd="${c.id}">Payments</button>${can ? `<button class="btn sm pri" data-cp="${c.id}">Record payment</button><button class="btn sm" data-ce="${c.id}">Edit</button>` : ''}</div></div>`; }).join('')}</div>` : '<div class="empty">No contributions yet. Create one to track a fundraising goal.</div>');
    const nb = el.querySelector('#cNew'); if (nb) nb.onclick = () => contribEdit(null, 'goal');
    const no = el.querySelector('#cNewO'); if (no) no.onclick = () => contribEdit(null, 'ongoing');
    el.querySelectorAll('[data-ce]').forEach(b => b.onclick = () => contribEdit(St.get('fin_contribs', b.dataset.ce)));
    el.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => contribPay(St.get('fin_contribs', b.dataset.cp)));
    el.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => contribDetail(St.get('fin_contribs', b.dataset.cd)));
  }
  function contribEdit(c, kind) {
    c = c || { status: 'Active', start: U.today(), kind: kind || 'goal' };
    UI.edit({ title: c.id ? c.name : (c.kind === 'ongoing' ? 'New contribution category' : 'New fundraising goal'), rec: c, fields: [{ k: 'name', label: 'Name', req: true, full: true, placeholder: c.kind === 'ongoing' ? 'e.g. Tithe, Welfare, Thanksgiving, Building fund' : 'e.g. Christmas uniforms' }, { k: 'kind', label: 'Type', type: 'select', options: [['ongoing', 'Ongoing — members give any time, any amount'], ['goal', 'Fundraising goal — has a target / deadline']], blank: false, full: true }, { k: 'description', label: 'Description', full: true }, { k: 'target', label: 'Target amount', type: 'number', min: 0 }, { k: 'perMember', label: 'Required per member (optional)', type: 'number', min: 0 }, { k: 'start', label: 'Start date', type: 'date' }, { k: 'deadline', label: 'Deadline', type: 'date' }, { k: 'responsible', label: 'Responsible person' }, { k: 'eventId', label: 'For event (optional)', type: 'select', options: UI.opt.events() }, { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Closed'], blank: false }],
      onSave: v => { guard(); return St.put('fin_contribs', Object.assign({}, c, v, { perMember: v.perMember || null, target: v.target || null })); },
      deleteFn: c.id ? async () => { guard(); for (const p of CP().filter(p => p.contribId === c.id)) await St.del('fin_cpay', p.id, { audit: false }); await St.del('fin_contribs', c.id); } : null });
  }
  /** record a contribution from one member: pick the category (or create one) */
  function memberContrib(m, contribId, after) {
    const cats = openCats();
    const body = document.createElement('div');
    body.innerHTML = `<div class="form">
      <label class="f full"><span>Contribution category <b>*</b></span><select id="mcCat">${cats.map(c => `<option value="${c.id}" ${c.id === contribId ? 'selected' : ''}>${esc(c.name)}${c.perMember ? ' · ' + fmt(c.perMember) + ' each' : ''}</option>`).join('')}<option value="__new">+ New category…</option></select></label>
      <label class="f full" id="mcNewWrap" hidden><span>New category name</span><input type="text" id="mcNew" placeholder="e.g. Tithe, Welfare, Thanksgiving"></label>
      <label class="f"><span>Amount <b>*</b></span><input type="number" id="mcAmt" min="1"></label>
      <label class="f"><span>Date paid</span><input type="date" id="mcDate" value="${U.today()}"></label>
      <label class="f"><span>Payment type</span><select id="mcMeth">${F.METHODS.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label class="f full"><span>Note (optional)</span><input type="text" id="mcNote" placeholder="e.g. for October"></label></div>`;
    const sel = body.querySelector('#mcCat'), amt = body.querySelector('#mcAmt');
    const sync = () => { body.querySelector('#mcNewWrap').hidden = sel.value !== '__new'; const c = St.get('fin_contribs', sel.value); if (c && c.perMember) { const rest = Math.max(0, c.perMember - cPaidBy(c.id, m.id)); if (!amt.value) amt.value = rest || ''; } };
    if (!cats.length) sel.value = '__new';
    sel.onchange = sync; sync();
    UI.modal({ title: 'Record contribution · ' + m.name, body, buttons: [{ label: 'Cancel' }, { label: 'Save', cls: 'pri', onClick: async () => {
      guard();
      let cid = sel.value;
      if (cid === '__new') { const name = body.querySelector('#mcNew').value.trim(); if (!name) { UI.toast('Type a name for the new category.', true); return false; } const c = await St.put('fin_contribs', { name, kind: 'ongoing', status: 'Active', start: U.today() }, { summary: 'New contribution category ' + name }); cid = c.id; }
      const a = +amt.value; if (!(a > 0)) { UI.toast('Enter the amount.', true); return false; }
      await St.put('fin_cpay', { contribId: cid, memberId: m.id, amount: a, date: body.querySelector('#mcDate').value || U.today(), method: body.querySelector('#mcMeth').value, note: body.querySelector('#mcNote').value.trim() }, { summary: 'Contribution ' + m.name });
      UI.toast('Contribution saved'); if (after) setTimeout(after, 60);
    } }] });
  }
  F.memberContrib = memberContrib;
  function contribPay(c, rec) {
    rec = rec || { contribId: c.id, amount: c.perMember || '', date: U.today(), method: 'Cash' };
    UI.edit({ title: (rec.id ? 'Edit payment · ' : 'Record payment · ') + c.name, rec, fields: [{ k: 'memberId', label: 'Member', type: 'select', options: obligated().map(m => [m.id, m.name]), req: true }, { k: 'amount', label: 'Amount', type: 'number', min: 1, req: true }, { k: 'date', label: 'Date', type: 'date', req: true }, methodField],
      onSave: v => { guard(); return St.put('fin_cpay', Object.assign({}, rec, v, { contribId: c.id }), { summary: 'Contribution ' + c.name }); }, deleteFn: rec.id ? () => { guard(); return St.del('fin_cpay', rec.id); } : null });
  }
  function contribDetail(c) {
    const pays = CP().filter(p => p.contribId === c.id).sort(U.by('date', -1));
    const md = UI.modal({ title: c.name, wide: true, body: `<h3>Member status</h3>${UI.table([{ label: 'Member', f: m => nameLink(m.id) }, { label: 'Required', n: 1, f: m => c.perMember ? fmt(c.perMember) : '—' }, { label: 'Paid', n: 1, f: m => fmt(cPaidBy(c.id, m.id)) }, { label: 'Balance', n: 1, f: m => c.perMember ? fmt(Math.max(0, c.perMember - cPaidBy(c.id, m.id))) : '—' }, { label: 'Status', f: m => { const p = cPaidBy(c.id, m.id); return statusPill(c.perMember ? (p <= 0 ? 'Unpaid' : p < c.perMember ? 'Partial' : 'Paid') : (p > 0 ? 'Paid' : 'Unpaid')); } }], obligated(), { empty: 'No members.' })}
      <h3 style="margin-top:14px">Payments</h3>${UI.table([{ label: 'Member', f: p => nameLink(p.memberId) }, { label: 'Date', f: p => U.fmtD(p.date) }, { label: 'Amount', n: 1, f: p => fmt(p.amount) }, { label: 'Type', f: p => methodPill(p.method) }, { label: '', f: p => bin('fin_cpay|' + p.id, `${mName(p.memberId)} · ${c.name} · ${fmt(p.amount)}`) }], pays, { click: F.canEdit() ? 1 : 0, empty: 'No payments yet.' })}`, buttons: [{ label: 'Close' }] });
    bindBins(md.body, () => { md.close(); contribDetail(c); });
    md.body.addEventListener('click', (e) => { const a = e.target.closest('.mlink'); if (!a) return; e.preventDefault(); e.stopPropagation(); md.close(); memberDetail(a.dataset.mem); }, true);
    UI.bindRows(md.body, id => { md.close(); contribPay(c, St.get('fin_cpay', id)); });
  }

  // ---------- income & expenses ----------
  function incomeRows() {
    const r = [];
    INC().forEach(i => r.push({ id: 'i:' + i.id, date: i.date, cat: i.category, desc: i.description || '—', method: i.method, amount: +i.amount || 0, ev: i.eventId }));
    P().forEach(p => r.push({ id: 'p:' + p.id, date: p.date, cat: 'Membership Fee', desc: mName(p.memberId) + ' — ' + mLabel(p.month), descRest: ' — ' + mLabel(p.month), method: p.method, amount: +p.amount || 0, mid: p.memberId, month: p.month }));
    CP().forEach(p => r.push({ id: 'c:' + p.id, date: p.date, cat: 'Contribution', desc: mName(p.memberId) + ' — ' + ((St.get('fin_contribs', p.contribId) || {}).name || 'Deleted'), descRest: ' — ' + ((St.get('fin_contribs', p.contribId) || {}).name || 'Deleted'), method: p.method, amount: +p.amount || 0, mid: p.memberId }));
    return r.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  function income(el) {
    const rows = incomeRows(); const can = F.canEdit(); const tot = (b) => rows.filter(r => !b || bucket(r.method) === b).reduce((s, r) => s + r.amount, 0);
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="iNew">Record income</button>' : ''}<span class="small muted">Includes membership fees and contribution payments. Total ${fmt(tot())} · Cash ${fmt(tot('Cash'))} · Bank ${fmt(tot('Bank'))}</span></div>` +
      UI.table([{ label: 'Date', f: r => U.fmtD(r.date) }, { label: 'Category', k: 'cat' }, { label: 'Description', f: r => (r.mid ? nameLink(r.mid) + esc(r.descRest) : esc(r.desc)) + (r.ev ? `<div class="small muted">Event: ${esc((St.get('events', r.ev) || {}).title || '')}</div>` : '') }, { label: 'Type', f: r => methodPill(r.method) }, { label: 'Amount', n: 1, f: r => `<b style="color:var(--ok)">+${fmt(r.amount)}</b>` }, { label: '', f: r => { const [t, x] = r.id.split(':'); return bin((t === 'i' ? 'fin_income' : t === 'p' ? 'fin_payments' : 'fin_cpay') + '|' + x, `${r.cat}: ${r.desc} · ${fmt(r.amount)}`); } }], rows, { click: 1, empty: 'No income recorded yet.' });
    const nb = el.querySelector('#iNew'); if (nb) nb.onclick = () => incomeForm();
    UI.bindRows(el, id => { const [t, x] = id.split(':'); if (t === 'i') incomeForm(St.get('fin_income', x)); else if (t === 'p') { const p = St.get('fin_payments', x); can ? editPayment(p) : memberDetail(p.memberId); } else { const p = St.get('fin_cpay', x); const c = St.get('fin_contribs', p.contribId); if (c && can) contribPay(c, p); } });
  }
  function incomeForm(rec) {
    rec = rec || { date: U.today(), category: 'Donation', method: 'Cash' };
    UI.edit({ title: rec.id ? 'Edit income' : 'Record income', rec, canEdit: F.canEdit(), fields: [{ k: 'date', label: 'Date', type: 'date', req: true }, { k: 'amount', label: 'Amount', type: 'number', min: 1, req: true }, { k: 'category', label: 'Category', type: 'select', options: withCur(F.incomeCats(), rec.category), blank: false }, methodField, { k: 'description', label: 'Description', full: true }, { k: 'receivedFrom', label: 'Received from' }, { k: 'ref', label: 'Reference / receipt no.' }, { k: 'eventId', label: 'Linked event (optional)', type: 'select', options: UI.opt.events() }],
      onSave: v => { guard(); return St.put('fin_income', Object.assign({}, rec, v, { recordedBy: rec.recordedBy || A.Auth.uid || null }), { summary: 'Income ' + v.category }); }, deleteFn: rec.id ? () => { guard(); return St.del('fin_income', rec.id); } : null });
  }
  F.expenseForm = (rec, after) => {
    rec = Object.assign({ date: U.today(), category: 'Other', method: 'Cash' }, rec || {});
    UI.edit({ title: rec.id ? 'Edit expense' : 'Record expense', rec, canEdit: F.canEdit(), fields: [{ k: 'date', label: 'Date', type: 'date', req: true }, { k: 'amount', label: 'Amount', type: 'number', min: 1, req: true }, { k: 'category', label: 'Category', type: 'select', options: withCur(F.expenseCats(), rec.category), blank: false }, methodField, { k: 'description', label: 'Description', full: true }, { k: 'paidTo', label: 'Paid to' }, { k: 'approvedBy', label: 'Approved by' }, { k: 'eventId', label: 'Linked event (optional)', type: 'select', options: UI.opt.events() }, { k: 'deptId', label: 'Department (optional)', type: 'select', options: UI.opt.depts() }, { k: 'ref', label: 'Receipt / reference no.' }],
      onSave: async v => { guard(); const saved = await St.put('fin_expenses', Object.assign({}, rec, v, { recordedBy: rec.recordedBy || A.Auth.uid || null }), { summary: 'Expense ' + v.category }); if (after) await after(saved); }, deleteFn: rec.id ? () => { guard(); return St.del('fin_expenses', rec.id); } : null });
  };
  function expenses(el) {
    const es = EXP().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')); const can = F.canEdit(); const tot = (b) => es.filter(e => !b || bucket(e.method) === b).reduce((s, e) => s + (+e.amount || 0), 0);
    el.innerHTML = `<div class="row" style="margin-bottom:10px">${can ? '<button class="btn pri" id="eNew">Record expense</button>' : ''}<span class="small muted">Total ${fmt(tot())} · Cash ${fmt(tot('Cash'))} · Bank ${fmt(tot('Bank'))}</span></div>` +
      UI.table([{ label: 'Date', f: e => U.fmtD(e.date) }, { label: 'Category', k: 'category' }, { label: 'Description', f: e => esc(e.description || '—') + ([e.eventId && 'Event: ' + ((St.get('events', e.eventId) || {}).title || ''), e.deptId && L.deptName(e.deptId)].filter(Boolean).length ? `<div class="small muted">${esc([e.eventId && 'Event: ' + ((St.get('events', e.eventId) || {}).title || ''), e.deptId && L.deptName(e.deptId)].filter(Boolean).join(' · '))}</div>` : '') }, { label: 'Paid to', f: e => esc(e.paidTo || '—') }, { label: 'Type', f: e => methodPill(e.method) }, { label: 'Amount', n: 1, f: e => `<b style="color:var(--bad)">−${fmt(e.amount)}</b>` }, { label: '', f: e => bin('fin_expenses|' + e.id, `${e.category} expense · ${fmt(e.amount)}${e.description ? ' · ' + e.description : ''}`) }], es, { click: 1, empty: 'No expenses recorded yet.' });
    const nb = el.querySelector('#eNew'); if (nb) nb.onclick = () => F.expenseForm();
    UI.bindRows(el, id => F.expenseForm(St.get('fin_expenses', id)));
  }
  function ledger(el) {
    const rows = F.ledger(); const t = totals();
    el.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="pill ok">Cash ${fmt(t.cash)}</span><span class="pill info">Bank ${fmt(t.bank)}</span><span class="pill gold">Total ${fmt(t.total)}</span><button class="btn sm" id="lCsv">CSV</button></div>` +
      UI.table([{ label: 'Date', f: r => U.fmtD(r.date) }, { label: 'Category', k: 'category' }, { label: 'Description', f: r => r.mid ? nameLink(r.mid) + esc(r.descRest) : esc(r.desc) }, { label: 'Type', f: r => methodPill(r.method) }, { label: 'Income', n: 1, f: r => r.inAmt ? `<span style="color:var(--ok)">${fmt(r.inAmt)}</span>` : '' }, { label: 'Expense', n: 1, f: r => r.outAmt ? `<span style="color:var(--bad)">${fmt(r.outAmt)}</span>` : '' }, { label: 'Cash bal.', n: 1, f: r => fmt(r.cashBal) }, { label: 'Bank bal.', n: 1, f: r => fmt(r.bankBal) }, { label: '', f: r => bin(r.coll + '|' + r.id, `${r.category}: ${r.desc} · ${fmt(r.inAmt || r.outAmt)}`) }], rows.slice().reverse(), { empty: 'No transactions yet.' });
    el.querySelector('#lCsv').onclick = () => UI.csvDownload('AAC_Finance_Ledger.csv', ['Date', 'Category', 'Description', 'Method', 'Type', 'Income', 'Expense', 'Cash balance', 'Bank balance'], rows.map(r => [r.date, r.category, r.desc, r.method, bucket(r.method), r.inAmt || '', r.outAmt || '', r.cashBal, r.bankBal])).catch(UI.fail);
  }

  // ---------- categories ----------
  function cats(el) {
    const can = F.canEdit(); const st = St.get('fin_settings', 'main') || {};
    const used = (c) => CP().filter(p => p.contribId === c.id).length;
    const listCard = (title, key, list, defaults, usedIn) => `<div class="card"><h3>${title}</h3>
      <div class="catlist">${list.map(n => `<span class="catchip">${esc(n)}${can ? `<button data-rmc="${key}" data-n="${esc(n)}" aria-label="Remove ${esc(n)}">✕</button>` : ''}</span>`).join('')}</div>
      ${can ? `<div class="row" style="margin-top:10px"><input type="text" data-addin="${key}" placeholder="New category name" style="flex:1;min-width:160px"><button class="btn sm pri" data-add="${key}">Add</button>${JSON.stringify(list) !== JSON.stringify(defaults) ? `<button class="btn sm ghost" data-reset="${key}">Restore defaults</button>` : ''}</div>` : ''}
      <p class="small muted" style="margin-top:8px">Removing a category doesn't change ${usedIn} already recorded with it.</p></div>`;
    el.innerHTML = `<div class="card"><div class="row between"><h3 style="margin:0">Member contribution categories</h3>${can ? '<div class="row"><button class="btn sm pri" id="ccNew">+ Add category</button><button class="btn sm" id="ccGoal">+ Fundraising goal</button></div>' : ''}</div>
        <p class="small muted">These appear on every member's finance page, so you can record contributions other than fees — e.g. Tithe, Welfare, Thanksgiving, Uniform, Building fund.</p>
        ${UI.table([{ label: 'Category', f: c => `<b>${esc(c.name)}</b>${c.description ? `<div class="small muted">${esc(c.description)}</div>` : ''}` }, { label: 'Type', f: c => isOngoing(c) ? '<span class="pill info">Ongoing</span>' : '<span class="pill gold">Fundraising goal</span>' }, { label: 'Expected per member', n: 1, f: c => c.perMember ? fmt(c.perMember) : 'Any amount' }, { label: 'Collected', n: 1, f: c => fmt(cCollected(c.id)) }, { label: 'Payments', n: 1, f: c => used(c) }, { label: 'Status', f: c => c.status === 'Closed' ? '<span class="pill">Closed</span>' : '<span class="pill ok">Open</span>' },
          { label: '', f: c => can ? `<span style="white-space:nowrap"><button class="btn sm" data-cce="${c.id}">Edit</button> ${c.status === 'Closed' ? `<button class="btn sm" data-cco="${c.id}">Reopen</button>` : `<button class="btn sm" data-ccc="${c.id}">Close</button>`} <button class="btn sm danger" data-ccd="${c.id}">🗑</button></span>` : '' }],
          CO().slice().sort((a, b) => (a.status === 'Closed') - (b.status === 'Closed') || (isOngoing(b) - isOngoing(a)) || (a.name || '').localeCompare(b.name || '')), { empty: 'No contribution categories yet. Add one to start recording contributions from members.' })}
        <p class="small muted" style="margin-top:8px"><b>Close</b> hides a category from new recordings but keeps its history. <b>🗑</b> deletes it together with its payments.</p></div>
      <div class="grid g2" style="margin-top:14px">${listCard('Income categories (other income)', 'incomeCats', F.incomeCats(), F.INCOME_CATS, 'income')}${listCard('Expense categories', 'expenseCats', F.expenseCats(), F.EXPENSE_CATS, 'expenses')}</div>`;
    const saveList = async (key, list) => { guard(); await St.put('fin_settings', Object.assign({}, St.get('fin_settings', 'main') || {}, { id: 'main', [key]: list }), { summary: 'Finance categories' }); A.render(); };
    const cur = (key) => key === 'incomeCats' ? F.incomeCats() : F.expenseCats();
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { const inp = el.querySelector(`[data-addin="${b.dataset.add}"]`); const n = inp.value.trim().replace(/\s+/g, ' '); if (!n) { inp.focus(); return; } const l = cur(b.dataset.add); if (l.some(x => x.toLowerCase() === n.toLowerCase())) { UI.toast('That category already exists.', true); return; } try { await saveList(b.dataset.add, l.concat([n])); UI.toast('Category added'); } catch (e) { UI.fail(e); } });
    el.querySelectorAll('[data-addin]').forEach(i => i.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector(`[data-add="${i.dataset.addin}"]`).click(); });
    el.querySelectorAll('[data-rmc]').forEach(b => b.onclick = async () => { const l = cur(b.dataset.rmc).filter(x => x !== b.dataset.n); if (!l.length) { UI.toast('Keep at least one category.', true); return; } try { await saveList(b.dataset.rmc, l); UI.toast('Removed ' + b.dataset.n); } catch (e) { UI.fail(e); } });
    el.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { try { await saveList(b.dataset.reset, (b.dataset.reset === 'incomeCats' ? F.INCOME_CATS : F.EXPENSE_CATS).slice()); } catch (e) { UI.fail(e); } });
    const cn = el.querySelector('#ccNew'); if (cn) cn.onclick = () => contribEdit(null, 'ongoing');
    const cg = el.querySelector('#ccGoal'); if (cg) cg.onclick = () => contribEdit(null, 'goal');
    el.querySelectorAll('[data-cce]').forEach(b => b.onclick = () => contribEdit(St.get('fin_contribs', b.dataset.cce)));
    el.querySelectorAll('[data-ccc]').forEach(b => b.onclick = async () => { try { guard(); await St.patch('fin_contribs', b.dataset.ccc, { status: 'Closed' }); } catch (e) { UI.fail(e); } });
    el.querySelectorAll('[data-cco]').forEach(b => b.onclick = async () => { try { guard(); await St.patch('fin_contribs', b.dataset.cco, { status: 'Active' }); } catch (e) { UI.fail(e); } });
    el.querySelectorAll('[data-ccd]').forEach(b => b.onclick = async () => {
      const c = St.get('fin_contribs', b.dataset.ccd); const n = used(c);
      if (!(await UI.confirm(`Delete "${esc(c.name)}"${n ? ` and its <b>${n} payment${n === 1 ? '' : 's'}</b> (${fmt(cCollected(c.id))})` : ''}? This cannot be undone.${n ? '<br><span class="small muted">To keep the history, use Close instead.</span>' : ''}`, { ok: 'Delete', danger: true }))) return;
      try { guard(); for (const p of CP().filter(p => p.contribId === c.id)) await St.del('fin_cpay', p.id, { audit: false }); await St.del('fin_contribs', c.id, { summary: 'Deleted category ' + c.name }); UI.toast('Category deleted'); } catch (e) { UI.fail(e); }
    });
  }

  // ---------- reports ----------
  function reports(el) {
    const t = totals(), cur = CUR(), inc = monthIncome(cur), exp = monthExpense(cur); const bi = F.byIncome(), be = F.byExpense();
    const obl = obligated(); const fe = obl.reduce((s, m) => s + memberFee(m), 0), fc = P().filter(p => p.month === cur).reduce((s, p) => s + (+p.amount || 0), 0);
    el.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn pri" id="rPdf">Finance report PDF</button><button class="btn" id="rXls">Export Excel</button></div>
      <div class="grid g2">
        <div class="card"><h3>Financial position (all time)</h3><dl class="kv"><dt>Cash</dt><dd>${fmt(t.cash)}</dd><dt>Bank & mobile money</dt><dd>${fmt(t.bank)}</dd><dt><b>Total</b></dt><dd><b>${fmt(t.total)}</b></dd></dl></div>
        <div class="card"><h3>${mLabel(cur)}</h3><dl class="kv"><dt>Income</dt><dd style="color:var(--ok)">+${fmt(inc)}</dd><dt>Expenses</dt><dd style="color:var(--bad)">−${fmt(exp)}</dd><dt><b>Net</b></dt><dd><b>${fmt(inc - exp)}</b></dd><dt>Fees expected / collected</dt><dd>${fmt(fe)} / ${fmt(fc)}</dd></dl></div>
        <div class="card"><h3>Income by source</h3>${C.donut(Object.entries(bi).filter(([, v]) => v > 0).map(([k, v], i) => ({ label: k, value: Math.round(v), color: L.PALETTE[i % 12][0] })), U.num(Object.values(bi).reduce((a, b) => a + b, 0)), 'total income')}</div>
        <div class="card"><h3>Expenses by category</h3>${C.donut(Object.entries(be).map(([k, v], i) => ({ label: k, value: Math.round(v), color: L.PALETTE[(i + 3) % 12][0] })), U.num(Object.values(be).reduce((a, b) => a + b, 0)), 'total expenses')}</div>
      </div>
      <h3 style="margin:14px 0 6px">Contributions</h3>${UI.table([{ label: 'Contribution', f: x => esc(x.name) }, { label: 'Target', n: 1, f: x => fmt(x.target) }, { label: 'Collected', n: 1, f: x => fmt(cCollected(x.id)) }, { label: 'Outstanding', n: 1, f: x => fmt(Math.max(0, (+x.target || 0) - cCollected(x.id))) }, { label: '%', n: 1, f: x => (x.target ? Math.min(100, Math.round(cCollected(x.id) / x.target * 100)) : 0) + '%' }], CO(), { empty: 'No contributions yet.' })}
      <div class="card" style="margin-top:14px"><h3>Member statement</h3><select id="stM" style="max-width:320px">${F.members().map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><div id="stOut" style="margin-top:10px"></div></div>`;
    const st = () => { const m = St.get('members', el.querySelector('#stM').value); if (!m) return; const fp = P().filter(p => p.memberId === m.id).reduce((s, p) => s + (+p.amount || 0), 0), cp = CP().filter(p => p.memberId === m.id).reduce((s, p) => s + (+p.amount || 0), 0); el.querySelector('#stOut').innerHTML = `<dl class="kv"><dt>Fees paid</dt><dd>${fmt(fp)}</dd><dt>Contributions paid</dt><dd>${fmt(cp)}</dd><dt><b>Total paid</b></dt><dd><b>${fmt(fp + cp)}</b></dd><dt>Outstanding</dt><dd style="color:var(--bad)">${fmt(outstanding(m))}</dd></dl>`; };
    const sm = el.querySelector('#stM'); if (sm) { sm.onchange = st; st(); }
    el.querySelector('#rPdf').onclick = () => { A.state.pdf = { type: 'finance', period: { kind: 'year', year: +cur.slice(0, 4) } }; A.go('pdf'); };
    el.querySelector('#rXls').onclick = () => exportExcel().catch(UI.fail);
  }
  async function exportExcel() {
    if (typeof XLSX === 'undefined') throw new Error('The Excel library did not load. Check your connection and reload.');
    const wb = XLSX.utils.book_new(); const add = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name); const t = totals();
    add([['Metric', 'Amount'], ['Cash balance', t.cash], ['Bank balance', t.bank], ['Total balance', t.total]], 'Summary');
    add([['Date', 'Category', 'Description', 'Type', 'Income', 'Expense', 'Cash Balance', 'Bank Balance'], ...F.ledger().map(r => [r.date, r.category, r.desc, bucket(r.method), r.inAmt || '', r.outAmt || '', r.cashBal, r.bankBal])], 'Ledger');
    add([['Name', 'Member ID', 'Phone', 'Email', 'Gender', 'Section', 'Date Joined', 'Monthly Fee', 'Status', 'Months Paid', 'Outstanding'], ...F.members().map(m => [m.name, m.memberCode || '', m.phone || '', m.email || '', m.gender || '', (m.sections || [])[0] || '', m.dateJoined || '', m.monthlyFee || '', status(m), paidMonths(m), outstanding(m)])], 'Members');
    add([['Name', 'Description', 'Target', 'Required Per Member', 'Start Date', 'Deadline', 'Responsible', 'Collected'], ...CO().map(c => [c.name, c.description || '', c.target || 0, c.perMember || '', c.start || '', c.deadline || '', c.responsible || '', cCollected(c.id)])], 'Contributions');
    add([['Member', 'Member ID', 'Month', 'Amount', 'Date', 'Type (Cash/Bank)'], ...P().map(p => [mName(p.memberId), (St.get('members', p.memberId) || {}).memberCode || '', p.month, p.amount, p.date, p.method])], 'Fee Payments');
    add([['Contribution', 'Member', 'Member ID', 'Amount', 'Date', 'Type (Cash/Bank)'], ...CP().map(p => [(St.get('fin_contribs', p.contribId) || {}).name || '', mName(p.memberId), (St.get('members', p.memberId) || {}).memberCode || '', p.amount, p.date, p.method])], 'Contribution Payments');
    add([['Date', 'Category', 'Description', 'Type (Cash/Bank)', 'Amount', 'Received From', 'Reference'], ...INC().map(i => [i.date, i.category, i.description || '', i.method, i.amount, i.receivedFrom || '', i.ref || ''])], 'Income');
    add([['Date', 'Category', 'Description', 'Paid To', 'Type (Cash/Bank)', 'Amount', 'Approved By'], ...EXP().map(e => [e.date, e.category, e.description || '', e.paidTo || '', e.method, e.amount, e.approvedBy || ''])], 'Expenses');
    add([['Type', 'Amount', 'Date', 'Note'], ...OP().map(o => [o.type, o.amount, o.date, o.note || ''])], 'Cash & Bank Balances');
    const ok = await UI.download(`AAC_Finance_${U.today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })])); if (ok) UI.toast('Excel file ready');
  }

  // ---------- settings, balances, import ----------
  function settings(el) {
    const can = F.canEdit(); const o = openings(); const s = F.set();
    el.innerHTML = `<div class="grid g2">${pwCard()}<div class="card"><h3>Fee settings</h3>${UI.form([{ k: 'monthlyFee', label: 'Standard monthly fee', type: 'number', min: 0 }, { k: 'threshold', label: 'Months fully paid before a member is Active', type: 'number', min: 1 }, { k: 'feesFrom', label: 'Count unpaid fees from (YYYY-MM)', hint: 'Members who joined earlier are only charged from the current month.' }], s)}<button class="btn pri" id="fsSave" style="margin-top:10px" ${can ? '' : 'disabled'}>Save fee settings</button></div>
      <div class="card"><h3>Cash in hand & bank balance</h3><p class="small muted">Money you already have. Added to cash and bank totals, not counted as income.</p><div class="row" style="margin-bottom:8px"><span class="pill ok">Cash ${fmt(o.cash)}</span><span class="pill info">Bank ${fmt(o.bank)}</span>${can ? '<button class="btn sm pri" id="obNew">Record balance</button>' : ''}</div>
        ${UI.table([{ label: 'As of', f: x => U.fmtD(x.date) }, { label: 'Type', f: x => methodPill(x.type) }, { label: 'Note', f: x => esc(x.note || '—') }, { label: 'Amount', n: 1, f: x => fmt(x.amount) }, { label: '', f: x => bin('fin_openings|' + x.id, `${x.type} balance · ${fmt(x.amount)}`) }], OP().sort(U.by('date', -1)), { click: can ? 1 : 0, empty: 'No balances recorded.' })}</div>
      <div class="card"><h3>Bring in data from the old Choir Finance Manager</h3><p class="small muted">In the old app go to Settings → Download backup file (or Show backup as text). Then choose the file or paste the text here. Members are matched to planner members by member ID or name, and new ones are created. Importing the same backup twice does not duplicate anything.</p>
        <div class="row"><label class="btn ${can ? '' : 'disabled'}" for="bkFile">Choose backup file</label><input type="file" id="bkFile" accept=".json,application/json" hidden ${can ? '' : 'disabled'}><button class="btn" id="bkPaste" ${can ? '' : 'disabled'}>Paste backup text</button></div><div id="bkMsg" class="small" style="margin-top:8px">${esc((A.state.fin || {}).bkMsg || '')}</div></div>
      <div class="card"><h3>Excel import & backup</h3><p class="small muted">Use the same Excel template as the old app (Members, Contributions, Fee Payments, Contribution Payments, Income, Expenses, Cash & Bank Balances).</p>
        <div class="row"><button class="btn" id="xTpl">Download Excel template</button><label class="btn" for="xFile">Import Excel file</label><input type="file" id="xFile" accept=".xlsx,.xls" hidden ${can ? '' : 'disabled'}><button class="btn" id="bkOut">Download backup (JSON)</button></div></div></div>`;
    const sv = el.querySelector('#fsSave'); sv.onclick = async () => { const { vals } = UI.read(el.querySelector('#fsSave').closest('.card'), [{ k: 'monthlyFee', type: 'number' }, { k: 'threshold', type: 'number' }, { k: 'feesFrom' }]); if (vals.feesFrom && !/^\d{4}-\d{2}$/.test(vals.feesFrom)) return UI.toast('Use YYYY-MM for "Count unpaid fees from".', true); try { guard(); await St.put('fin_settings', Object.assign({}, St.get('fin_settings', 'main') || {}, vals, { id: 'main' }), { summary: 'Finance settings' }); UI.toast('Saved'); } catch (e) { UI.fail(e); } };
    bindPwCard(el);
    const ob = el.querySelector('#obNew'); if (ob) ob.onclick = () => balForm();
    UI.bindRows(el, id => balForm(St.get('fin_openings', id)));
    el.querySelector('#bkFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { e.target.value = ''; importBackup(String(r.result), el.querySelector('#bkMsg')); }; r.readAsText(f); };
    el.querySelector('#bkPaste').onclick = () => UI.modal({ title: 'Paste backup text', body: '<textarea id="bkT" style="width:100%;min-height:220px;font-family:monospace;font-size:12px"></textarea>', buttons: [{ label: 'Cancel' }, { label: 'Continue', cls: 'pri', onClick: ({ body }) => { setTimeout(() => importBackup(body.querySelector('#bkT').value, el.querySelector('#bkMsg')), 30); } }] });
    el.querySelector('#xTpl').onclick = () => template().catch(UI.fail);
    el.querySelector('#xFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; if (typeof XLSX === 'undefined') return UI.toast('The Excel library did not load.', true); const r = new FileReader(); r.onload = () => { e.target.value = ''; try { excelPreview(XLSX.read(r.result, { type: 'array', cellDates: true })); } catch (x) { UI.toast('Could not read that file. Use an Excel .xlsx file.', true); } }; r.readAsArrayBuffer(f); };
    el.querySelector('#bkOut').onclick = async () => { const data = { members: F.members().map(m => ({ id: m.id, name: m.name, memberId: m.memberCode || '', phone: m.phone || '', email: m.email || '', gender: m.gender || '', section: (m.sections || [])[0] || 'Other', dateJoined: m.dateJoined || '', fee: m.monthlyFee || null, overrideStatus: m.finStatus || null })), payments: P(), contributions: CO(), contribPayments: CP(), income: INC(), expenses: EXP(), openings: OP(), settings: Object.assign({ choirName: St.cfg().name || '' }, F.set()) }; try { const ok = await UI.download(`AAC_Finance_backup_${U.today()}.json`, JSON.stringify({ app: 'choir-finance-manager', version: 2, exportedAt: new Date().toISOString(), data }, null, 2)); if (ok) UI.toast('Backup downloaded'); } catch (e) { UI.fail(e); } };
  }
  function balForm(rec) {
    rec = rec || { type: 'Cash', date: U.today() };
    UI.edit({ title: rec.id ? 'Edit balance' : 'Record cash in hand / bank balance', rec, fields: [{ k: 'type', label: 'What is this amount?', type: 'select', options: [['Cash', 'Cash in hand'], ['Bank', 'Bank balance']], blank: false }, { k: 'amount', label: 'Amount (negative to correct)', type: 'number', req: true }, { k: 'date', label: 'As of date', type: 'date', req: true }, { k: 'note', label: 'Note', full: true }], validate: v => (!v.amount ? ['Amount cannot be zero.'] : []), onSave: v => { guard(); return St.put('fin_openings', Object.assign({}, rec, v)); }, deleteFn: rec.id ? () => { guard(); return St.del('fin_openings', rec.id); } : null });
  }

  /** match or create a planner member for an imported finance member */
  async function linkMember(om, cache) {
    const code = String(om.memberId || '').trim().toLowerCase(), nm = String(om.name || '').trim().toLowerCase();
    let m = St.all('members').find(x => (code && String(x.memberCode || '').toLowerCase() === code) || (nm && String(x.name || '').trim().toLowerCase() === nm));
    const fin = { memberCode: om.memberId || '', gender: om.gender || '', dateJoined: om.dateJoined || '', monthlyFee: om.fee || null, finStatus: om.overrideStatus || null };
    if (m) { const part = {}; Object.entries(fin).forEach(([k, v]) => { if (v && !m[k]) part[k] = v; }); if (!m.phone && om.phone) part.phone = om.phone; if (!m.email && om.email) part.email = om.email; if (Object.keys(part).length) await St.patch('members', m.id, part, { audit: false }); cache.matched++; }
    else { const sec = ['Soprano', 'Alto', 'Tenor', 'Bass'].includes(om.section) ? [om.section] : []; m = await St.put('members', Object.assign({ id: 'fm_' + String(om.id || U.uid('')).replace(/[^A-Za-z0-9_-]/g, ''), name: om.name, phone: om.phone || '', email: om.email || '', sections: sec, departments: [], status: 'active' }, fin), { audit: false }); cache.created++; }
    return m.id;
  }
  const safeId = (p, id) => p + String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  async function importBackup(text, msg) {
    let obj; try { obj = JSON.parse(text); } catch (e) { return UI.toast("That doesn't look like a valid backup.", true); }
    const d = obj && obj.data ? obj.data : obj;
    if (!d || !Array.isArray(d.members) || !Array.isArray(d.income)) return UI.toast("That isn't a Choir Finance Manager backup.", true);
    const n = ['payments', 'contributions', 'contribPayments', 'income', 'expenses', 'openings'].reduce((t, k) => t + (d[k] || []).length, 0);
    if (!(await UI.confirm(`Import this backup${obj.exportedAt ? ' from ' + esc(new Date(obj.exportedAt).toLocaleString()) : ''}?<br><br>${d.members.length} members · ${(d.payments || []).length} fee payments · ${(d.contributions || []).length} contributions / ${(d.contribPayments || []).length} payments · ${(d.income || []).length} income · ${(d.expenses || []).length} expenses · ${(d.openings || []).length} balances.<br><br>Records already imported are skipped.`, { ok: 'Import', title: 'Import finance backup' }))) return;
    try {
      guard(); const cache = { matched: 0, created: 0 }; const map = {}; let done = 0, skipped = 0;
      const prog = () => { if (msg) msg.textContent = `Importing… ${done}/${n + d.members.length}`; };
      for (const om of d.members) { map[om.id] = await linkMember(om, cache); done++; prog(); }
      const put = async (coll, id, body) => { if (St.get(coll, id)) { skipped++; return; } await St.put(coll, Object.assign({ id, importedFrom: 'finance-manager' }, body), { audit: false }); done++; if (done % 10 === 0) prog(); };
      for (const c of d.contributions || []) await put('fin_contribs', safeId('ic_', c.id), { name: c.name, description: c.description || '', target: +c.target || 0, perMember: c.perMember || null, start: c.start || '', deadline: c.deadline || '', responsible: c.responsible || '', status: c.status || 'Active' });
      for (const p of d.payments || []) if (map[p.memberId]) await put('fin_payments', safeId('ip_', p.id), { memberId: map[p.memberId], month: p.month, amount: +p.amount || 0, date: p.date, method: p.method || 'Cash' });
      for (const p of d.contribPayments || []) if (map[p.memberId]) await put('fin_cpay', safeId('iq_', p.id), { contribId: safeId('ic_', p.contribId), memberId: map[p.memberId], amount: +p.amount || 0, date: p.date, method: p.method || 'Cash' });
      for (const i of d.income || []) await put('fin_income', safeId('ii_', i.id), { date: i.date, amount: +i.amount || 0, category: i.category || 'Other', description: i.description || '', method: i.method || 'Cash', receivedFrom: i.receivedFrom || '', ref: i.ref || '' });
      for (const e of d.expenses || []) await put('fin_expenses', safeId('ie_', e.id), { date: e.date, amount: +e.amount || 0, category: e.category || 'Other', description: e.description || '', paidTo: e.paidTo || '', method: e.method || 'Cash', approvedBy: e.approvedBy || '', ref: e.ref || '' });
      for (const o of d.openings || []) await put('fin_openings', safeId('io_', o.id), { type: o.type === 'Cash' ? 'Cash' : 'Bank', amount: +o.amount || 0, date: o.date, note: o.note || '' });
      if (d.settings && d.settings.monthlyFee && !St.get('fin_settings', 'main')) await St.put('fin_settings', { id: 'main', monthlyFee: +d.settings.monthlyFee, threshold: 5, feesFrom: '2024-01' }, { audit: false });
      await St.audit('import', 'fin', 'backup', `Finance backup: ${done} records, ${cache.created} new members, ${cache.matched} matched, ${skipped} skipped`);
      A.state.fin.bkMsg = `Done: ${done - d.members.length} records imported, ${cache.matched} members matched, ${cache.created} new members created, ${skipped} already imported (skipped).`; A.rerender();
      if (msg) msg.textContent = `Done: ${done - d.members.length} records imported, ${cache.matched} members matched, ${cache.created} new members created, ${skipped} already imported (skipped).`;
      UI.toast('Finance backup imported');
    } catch (e) { UI.fail(e); if (msg) msg.textContent = 'Import stopped: ' + e.message; }
  }

  // Excel import (same template as the old app)
  const SHEETS = { 'Members': ['Name', 'Member ID', 'Phone', 'Email', 'Gender', 'Section', 'Date Joined', 'Monthly Fee'], 'Contributions': ['Name', 'Description', 'Target', 'Required Per Member', 'Start Date', 'Deadline', 'Responsible'], 'Fee Payments': ['Member', 'Member ID', 'Month', 'Amount', 'Date', 'Type (Cash/Bank)'], 'Contribution Payments': ['Contribution', 'Member', 'Member ID', 'Amount', 'Date', 'Type (Cash/Bank)'], 'Income': ['Date', 'Category', 'Description', 'Type (Cash/Bank)', 'Amount', 'Received From', 'Reference'], 'Expenses': ['Date', 'Category', 'Description', 'Paid To', 'Type (Cash/Bank)', 'Amount', 'Approved By'], 'Cash & Bank Balances': ['Type', 'Amount', 'Date', 'Note'] };
  const KEYS = { members: ['members', 'member'], contributions: ['contributions', 'contribution'], fee: ['feepayments', 'feepayment', 'fees', 'membershipfees'], cpay: ['contributionpayments', 'contributionspayments', 'contribpayments'], income: ['income'], expenses: ['expenses', 'expense'], bal: ['cashbankbalances', 'balances', 'openingbalances'] };
  const nk = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const pick = (r, ns) => { for (const n of ns) { const v = r[n]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };
  const num = (v) => typeof v === 'number' ? v : (parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0);
  const xd = (v) => { if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) { const d = new Date(v.getTime() + 432e5); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); } if (typeof v === 'number' && XLSX.SSF) { const p = XLSX.SSF.parse_date_code(v); if (p) return p.y + '-' + U.pad(p.m) + '-' + U.pad(p.d); } if (typeof v === 'string') { const s = v.trim(); let m; if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return m[1] + '-' + U.pad(m[2]) + '-' + U.pad(m[3]); if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return m[3] + '-' + U.pad(m[2]) + '-' + U.pad(m[1]); } return ''; };
  const xm = (v) => { if (typeof v === 'string') { const s = v.trim(); const m = s.match(/^(\d{4})[-/.](\d{1,2})$/); if (m) return m[1] + '-' + U.pad(m[2]); const m2 = s.match(/^(\d{1,2})[-/.](\d{4})$/); if (m2) return m2[2] + '-' + U.pad(m2[1]); } const d = xd(v); return d ? d.slice(0, 7) : ''; };
  const xmeth = (v) => { const s = String(v || '').trim(); if (!s) return 'Cash'; const h = F.METHODS.find(m => m.toLowerCase() === s.toLowerCase()); if (h) return h; const l = s.toLowerCase(); if (l.includes('cash')) return 'Cash'; if (l.includes('airtel')) return 'Airtel Money'; if (l.includes('tigo')) return 'Tigo Pesa'; if (l.includes('halo')) return 'HaloPesa'; if (l.includes('mixx') || l.includes('yas')) return 'Mixx by Yas'; if (l.includes('pesa')) return 'M-Pesa'; if (l.includes('bank')) return 'Bank'; return 'Other'; };
  const MK = ['method', 'type', 'typecashbank', 'paymenttype', 'paymentmethod'];
  const cat = (v, list) => list.find(c => c.toLowerCase() === String(v || '').trim().toLowerCase()) || 'Other';
  function excelPreview(wb) {
    const rows = {}; const sheets = [];
    wb.SheetNames.forEach(name => { const k = nk(name); for (const key in KEYS) if (KEYS[key].includes(k)) { rows[key] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }).map(r => { const o = {}; Object.keys(r).forEach(x => o[nk(x)] = r[x]); return o; }); sheets.push(name); } });
    if (!sheets.length) return UI.toast('No recognised sheets found. Download the template to see the sheet names.', true);
    const count = Object.entries(rows).map(([k, v]) => `${k}: ${v.length}`).join(' · ');
    UI.confirm(`Sheets found: ${esc(sheets.join(', '))}<br>${esc(count)} rows.<br><br>Members are matched by member ID or name (new ones are created). Rows identical to existing records are skipped.`, { ok: 'Import', title: 'Import from Excel' }).then(async ok => {
      if (!ok) return;
      try {
        guard(); const cache = { matched: 0, created: 0 }; let added = 0, dup = 0; const issues = [];
        const findM = (idv, nv) => { const id = String(idv || '').trim().toLowerCase(), nm = String(nv || '').trim().toLowerCase(); return St.all('members').find(m => (id && String(m.memberCode || '').toLowerCase() === id) || (nm && String(m.name || '').trim().toLowerCase() === nm)); };
        for (const r of rows.members || []) { const name = String(pick(r, ['name', 'fullname', 'membername', 'member'])).trim(); if (!name) continue; await linkMember({ name, memberId: String(pick(r, ['memberid', 'id'])).trim(), phone: String(pick(r, ['phone', 'phonenumber', 'mobile'])).trim(), email: String(pick(r, ['email'])).trim(), gender: /^m/i.test(String(pick(r, ['gender', 'sex']))) ? 'Male' : (pick(r, ['gender', 'sex']) ? 'Female' : ''), section: String(pick(r, ['section', 'voice'])).trim().replace(/^./, c => c.toUpperCase()), dateJoined: xd(pick(r, ['datejoined', 'joined'])), fee: num(pick(r, ['monthlyfee', 'fee'])) || null, id: U.uid('x') }, cache); }
        for (const r of rows.contributions || []) { const name = String(pick(r, ['name', 'contribution', 'title'])).trim(); if (!name) continue; if (CO().some(c => c.name.trim().toLowerCase() === name.toLowerCase())) { dup++; continue; } await St.put('fin_contribs', { name, description: String(pick(r, ['description'])), target: num(pick(r, ['target', 'targetamount'])), perMember: num(pick(r, ['requiredpermember', 'permember'])) || null, start: xd(pick(r, ['startdate', 'start'])) || U.today(), deadline: xd(pick(r, ['deadline', 'enddate'])), responsible: String(pick(r, ['responsible'])), status: 'Active' }, { audit: false }); added++; }
        for (const [i, r] of (rows.fee || []).entries()) { const m = findM(pick(r, ['memberid']), pick(r, ['member', 'membername', 'name'])); if (!m) { issues.push(`Fee Payments row ${i + 2}: member not found`); continue; } const amount = num(pick(r, ['amount', 'paid'])); if (amount <= 0) continue; let date = xd(pick(r, ['date', 'datepaid'])); let month = xm(pick(r, ['month', 'feemonth'])) || (date ? date.slice(0, 7) : ''); if (!month) { issues.push(`Fee Payments row ${i + 2}: month missing`); continue; } if (!date) date = month + '-01'; const method = xmeth(pick(r, MK)); if (P().some(p => p.memberId === m.id && p.month === month && +p.amount === amount && p.date === date && p.method === method)) { dup++; continue; } await St.put('fin_payments', { memberId: m.id, month, amount, date, method }, { audit: false }); added++; }
        for (const [i, r] of (rows.cpay || []).entries()) { const c = CO().find(x => x.name.trim().toLowerCase() === String(pick(r, ['contribution'])).trim().toLowerCase()); const m = findM(pick(r, ['memberid']), pick(r, ['member', 'membername'])); if (!c || !m) { issues.push(`Contribution Payments row ${i + 2}: ${!c ? 'contribution' : 'member'} not found`); continue; } const amount = num(pick(r, ['amount', 'paid'])); if (amount <= 0) continue; const date = xd(pick(r, ['date'])) || U.today(), method = xmeth(pick(r, MK)); if (CP().some(p => p.contribId === c.id && p.memberId === m.id && +p.amount === amount && p.date === date)) { dup++; continue; } await St.put('fin_cpay', { contribId: c.id, memberId: m.id, amount, date, method }, { audit: false }); added++; }
        for (const r of rows.income || []) { const amount = num(pick(r, ['amount', 'total'])); if (amount <= 0) continue; const date = xd(pick(r, ['date'])) || U.today(), category = cat(pick(r, ['category', 'source']), F.incomeCats()), description = String(pick(r, ['description', 'details'])).trim(), method = xmeth(pick(r, MK)); if (INC().some(x => x.date === date && +x.amount === amount && x.category === category && (x.description || '') === description)) { dup++; continue; } await St.put('fin_income', { date, amount, category, description, method, receivedFrom: String(pick(r, ['receivedfrom', 'from'])), ref: String(pick(r, ['reference', 'ref', 'receiptno'])) }, { audit: false }); added++; }
        for (const r of rows.expenses || []) { const amount = num(pick(r, ['amount', 'total'])); if (amount <= 0) continue; const date = xd(pick(r, ['date'])) || U.today(), category = cat(pick(r, ['category']), F.expenseCats()), description = String(pick(r, ['description', 'details'])).trim(), method = xmeth(pick(r, MK)); if (EXP().some(x => x.date === date && +x.amount === amount && x.category === category && (x.description || '') === description)) { dup++; continue; } await St.put('fin_expenses', { date, amount, category, description, method, paidTo: String(pick(r, ['paidto', 'payee'])), approvedBy: String(pick(r, ['approvedby'])) }, { audit: false }); added++; }
        for (const r of rows.bal || []) { const amount = num(pick(r, ['amount'])); if (!amount) continue; const t = String(pick(r, ['type', 'account'])).toLowerCase(); const type = t.includes('bank') || t.includes('mobile') ? 'Bank' : 'Cash'; const date = xd(pick(r, ['date'])) || U.today(); if (OP().some(o => o.type === type && +o.amount === amount && o.date === date)) { dup++; continue; } await St.put('fin_openings', { type, amount, date, note: String(pick(r, ['note', 'notes'])) }, { audit: false }); added++; }
        await St.audit('import', 'fin', 'excel', `Excel: ${added} added, ${dup} skipped`);
        UI.modal({ title: 'Import complete', body: `<p>${added} record(s) added · ${cache.created} new member(s) · ${cache.matched} matched · ${dup} already present (skipped).</p>${issues.length ? `<div class="banner warn">${issues.length} row(s) skipped:<br>${issues.slice(0, 8).map(esc).join('<br>')}</div>` : ''}`, buttons: [{ label: 'OK', cls: 'pri' }] });
      } catch (e) { UI.fail(e); }
    });
  }
  async function template() {
    if (typeof XLSX === 'undefined') throw new Error('The Excel library did not load.');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['AAC Finance Manager — Excel import template'], [''], ['Fill only the sheets you need and keep sheet names and headings as they are.'], ['Dates: YYYY-MM-DD. Month (Fee Payments): YYYY-MM.'], ['Type (Cash/Bank): Cash, Bank, M-Pesa, Airtel Money, Tigo Pesa, HaloPesa, Mixx by Yas or Other. Blank means Cash.'], ['Members are matched to planner members by Member ID or name; new names are added as members.']]), 'Instructions');
    Object.keys(SHEETS).forEach(n => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([SHEETS[n]]), n));
    const ok = await UI.download('AAC_Finance_import_template.xlsx', new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })])); if (ok) UI.toast('Template ready');
  }
})(window.App);
