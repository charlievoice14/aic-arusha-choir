/* boot.js — capabilities, navigation shell, rendering loop */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const I = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    workplan: '<path d="M9 4h6M9 4a2 2 0 0 0-2 2H5v15h14V6h-2a2 2 0 0 0-2-2"/><path d="M8 12l2 2 4-4M8 17h8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    events: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    practice: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    songs: '<path d="M4 5h11M4 10h11M4 15h7"/><path d="M17 19V9l4-1"/><circle cx="15" cy="19" r="2"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    departments: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    members: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    travel: '<rect x="4" y="5" width="16" height="12" rx="3"/><path d="M4 11h16M7 17v2M17 17v2"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    notifications: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    finance: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  };
  A.icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;
  A.NAV = [
    ['dashboard', 'Dashboard', 'Overview'], ['workplan', 'Annual Work-Plan', 'Planning'], ['calendar', 'Calendar'], ['events', 'Events'],
    ['schedule', 'Schedule', 'Music'], ['practice', 'Practice Planner'], ['songs', 'Song Library & Repertoire'], ['tasks', 'Tasks & Responsibilities', 'People & logistics'],
    ['departments', 'Department workspaces'], ['members', 'Members'], ['travel', 'Travel & Logistics'], ['finance', 'AAC Finance Manager'], ['pdf', 'Documents & PDF Studio', 'Outputs'],
    ['reports', 'Reports & Evaluation'], ['notifications', 'Notifications'], ['admin', 'Settings & Administration', 'System'],
  ];
  A.caps = {}; A.prefs = {};
  A.nav = { mod: 'dashboard', params: {} };

  function renderNav() {
    const cfg = St.cfg();
    const n = A.Store.mode === 'loading' ? 0 : visibleReminders().length;
    UI.$('#nav').innerHTML = `<a href="./" class="back-app" title="Back to the choir app"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span class="t">Choir app</span></a>` + A.NAV.map(([k, t, g]) => `${g ? `<div class="grp">${esc(g)}</div>` : ''}<a href="#${k}" data-k="${k}" class="${A.nav.mod === k ? 'on' : ''}" title="${esc(t)}">${A.icon(k)}<span class="t">${esc(t)}</span>${k === 'notifications' && n ? `<span class="badge">${n}</span>` : ''}</a>`).join('');
    UI.$$('#nav a[data-k]').forEach(a => a.onclick = (e) => { e.preventDefault(); A.go(a.dataset.k); });
    const quick = [['dashboard', 'Home'], ['calendar', 'Calendar'], ['schedule', 'Schedule'], ['practice', 'Practice'], ['more', 'More']];
    UI.$('#bnav').innerHTML = quick.map(([k, t]) => `<a href="#${k === 'more' ? '' : k}" data-k="${k}" class="${A.nav.mod === k || (k === 'more' && !quick.some(q => q[0] === A.nav.mod)) ? 'on' : ''}">${A.icon(k)}<span>${t}</span></a>`).join('');
    UI.$$('#bnav a').forEach(a => a.onclick = (e) => { e.preventDefault(); if (a.dataset.k === 'more') document.body.classList.add('navopen'); else A.go(a.dataset.k); });
    UI.$('#brand').innerHTML = `${cfg.logo ? `<img src="${esc(cfg.logo)}" alt="">` : '<div class="mark">♪</div>'}<div><div class="nm">${esc(cfg.name || 'Choir Planner')}</div><div class="sub">${esc(cfg.church || 'Annual planning & ministry')}</div></div>`;
    UI.$('#footInfo').textContent = `Planning year ${cfg.year || 2027} · ${U.TZ}`;
  }
  function visibleReminders() { const d = new Set((A.prefs.dismissed || [])); return L.reminders().filter(r => !d.has(r.id + '@' + r.when)); }
  A.visibleReminders = visibleReminders;

  function banners() {
    const b = [];
    if (St.mode === 'local') b.push(`<div class="banner warn"><b>Not connected to the shared database.</b> You are seeing a temporary preview: nothing you enter here is saved or shared. Check your internet connection and reload.</div>`);
    else if (!A.Auth.canWriteData()) b.push(`<div class="banner info">You have <b>read-only</b> access. Ask the choir administrator to give you a planner role in Settings → Roles & permissions.</div>`);
    if (St.error && St.error.code === 'revoked') b.push(`<div class="banner warn">Access to this planner changed while it was open. Reload to continue.</div>`);
    if (St.all('events').some(e => e.isDemo) || St.all('songs').some(s => s.isDemo)) b.push(`<div class="banner demo"><b>DEMO DATA present.</b> Records marked DEMO DATA are fictional examples, not real church commitments. Remove them in Settings → Demo data.</div>`);
    return b.join('');
  }

  A.render = () => {
    const mod = A.M[A.nav.mod] ? A.nav.mod : 'dashboard';
    const item = A.NAV.find(x => x[0] === mod);
    UI.$('#pageTitle').textContent = item ? item[1] : '';
    renderNav();
    const me = A.Auth.me;
    UI.$('#who').innerHTML = `<button class="btn sm ghost themebtn" id="themeBtn" aria-label="Switch light or dark">${document.documentElement.classList.contains('light') ? '☾ Dark' : '☀ Light'}</button>${me && me.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : ''}<span>${esc((me && me.name) || (St.mode === 'local' ? 'Preview' : 'You'))} · ${esc(A.Auth.roleName())}</span>`;
    UI.$('#themeBtn').onclick = () => { const l = document.documentElement.classList.toggle('light'); try { localStorage.setItem('aac_theme', l ? 'light' : 'dark'); } catch (e) { } A.render(); };
    const view = UI.$('#view');
    const keepScroll = window.scrollY;
    const inner = {}; view.querySelectorAll('[id]').forEach(e => { if (e.scrollTop > 0) inner[e.id] = e.scrollTop; });   // scrolled lists keep their place
    view.innerHTML = banners() + '<div id="mod"></div>';
    if (A._animate) { UI.$('#mod').classList.add('enter'); A._animate = false; }
    try { A.M[mod].render(UI.$('#mod'), A.nav.params || {}); A.Charts.bindTips(UI.$('#mod')); }
    catch (e) { console.error(e); UI.$('#mod').innerHTML = `<div class="banner warn">This module hit an error: ${esc(e.message)}</div>`; }
    if (A._keepScroll) { window.scrollTo(0, keepScroll); A._keepScroll = false; Object.entries(inner).forEach(([id, t]) => { const e = document.getElementById(id); if (e) e.scrollTop = t; }); }
  };
  let pending = false;
  A.rerender = () => {
    const ae = document.activeElement;
    if (ae && UI.$('#view').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.type !== 'checkbox') {
      if (!pending) { pending = true; ae.addEventListener('blur', () => { pending = false; A._keepScroll = true; A.render(); }, { once: true }); }
      return;
    }
    A._keepScroll = true; A.render();
  };

  async function boot() {
    if (window.ChoirReady && !(await window.ChoirReady)) return;   // not allowed in: bridge.js shows why
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.tabs button,[data-go],#nav a,#bnav a,tr.click,.stat,.kpi,[data-v],[data-t]')) { A._animate = true; setTimeout(() => { A._animate = false; }, 250); } }, true);
    UI.$('#burger').onclick = () => document.body.classList.toggle('navopen');
    UI.$('#scrim').onclick = () => document.body.classList.remove('navopen');
    UI.$('#collapseBtn').onclick = () => { document.body.classList.toggle('collapsed'); try { localStorage.setItem('aac_collapsed', document.body.classList.contains('collapsed') ? '1' : ''); } catch (e) { } };
    try { if (localStorage.getItem('aac_collapsed')) document.body.classList.add('collapsed'); } catch (e) { }
    try { if (localStorage.getItem('aac_theme') === 'light') document.documentElement.classList.add('light'); } catch (e) { }
    const c = window.claude;
    const names = ['db', 'user', 'downloads', 'sample'];
    const got = c && c.use ? await Promise.all(names.map(n => c.use(n).catch(() => null))) : names.map(() => null);
    names.forEach((n, i) => A.caps[n] = got[i]);
    await A.Auth.init(A.caps.user);
    await St.init(A.caps.db);
    if (A.caps.db && A.Auth.uid) {
      try { A.caps.db.doc('data/users/' + A.Auth.uid + '/prefs').onSnapshot(s => { A.prefs = (s.exists && s.data()) || {}; A.rerender(); }, () => { }); } catch (e) { }
    }
    const start = Date.now();
    await new Promise(res => { const t = setInterval(() => { if (St.allReady() || Date.now() - start > 6000) { clearInterval(t); res(); } }, 60); });
    St.onChange = () => A.rerender();
    const h = location.hash.replace('#', '');
    A.nav.mod = A.M[h] ? h : 'dashboard';
    A.render();
    window.addEventListener('hashchange', () => { if (A._silentHash) { A._silentHash = false; return; } const k = location.hash.replace('#', ''); if (A.M[k] && k !== A.nav.mod) A.go(k); });
    if (!St.get('cfg', 'org') && A.Auth.has('settings') && A.Auth.canWriteData()) { if (!(await offerImport())) A.M.admin.wizard(); }
  }
  /* First time on the choir app's database: offer the data saved in the claude.ai version. */
  async function offerImport() {
    const seed = window.PLANNER_SEED; if (!seed || !seed.cfg) return false;
    const n = (c) => Object.keys(seed[c] || {}).length;
    const list = [['departments', 'department'], ['events', 'event'], ['slots', 'practice time'], ['travel', 'travel plan'], ['years', 'planning year']].filter(([c]) => n(c)).map(([c, t]) => `${n(c)} ${t}${n(c) === 1 ? '' : 's'}`).join(', ');
    const ok = await UI.confirm(`Bring in the planner you set up before (${esc((seed.cfg.org || {}).name || 'your choir')}: ${esc(list)})?`, { ok: 'Bring it in' });
    if (!ok) return false;
    let k = 0;
    for (const c of Object.keys(seed)) {
      for (const [id, v] of Object.entries(seed[c])) {
        try { await St.db.collection(c).doc(id).set(v); k++; } catch (e) { console.warn('import', c, id, e); }
      }
    }
    UI.toast(`Brought in ${k} records`);
    return true;
  }
  A.savePrefs = async (part) => {
    A.prefs = Object.assign({}, A.prefs, part);
    if (!A.caps.db || !A.Auth.uid) return;
    try { await A.caps.db.doc('data/users/' + A.Auth.uid + '/prefs').set(A.prefs); } catch (e) { UI.toast('Could not save your preference: ' + St.errMsg(e), true); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.App);
