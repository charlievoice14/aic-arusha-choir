/* core.js — utilities, data store (choir Firebase database via bridge.js), auth & permissions */
'use strict';
window.App = window.App || {};
(function (A) {
  // ---------- utilities ----------
  const U = A.U = {};
  U.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.TZ = 'Africa/Dar_es_Salaam';
  U.TZ_OFFSET_MIN = 180; // EAT, no daylight saving
  U.nowEAT = () => new Date(Date.now() + U.TZ_OFFSET_MIN * 60000);
  U.today = () => U.nowEAT().toISOString().slice(0, 10);
  U.nowHM = () => U.nowEAT().toISOString().slice(11, 16);
  U.nowISO = () => new Date().toISOString();
  U.D = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  U.S = (ms) => new Date(ms).toISOString().slice(0, 10);
  U.addDays = (s, n) => U.S(U.D(s) + n * 864e5);
  U.dow = (s) => new Date(U.D(s)).getUTCDay();
  U.diffDays = (a, b) => Math.round((U.D(b) - U.D(a)) / 864e5);
  U.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1..12
  U.pad = (n) => String(n).padStart(2, '0');
  U.ymd = (y, m, d) => `${y}-${U.pad(m)}-${U.pad(d)}`;
  U.validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && U.S(U.D(s)) === s;
  U.qOf = (s) => Math.floor((+s.slice(5, 7) - 1) / 3) + 1;
  U.qRange = (y, q) => [U.ymd(y, (q - 1) * 3 + 1, 1), U.ymd(y, q * 3, U.daysInMonth(y, q * 3))];
  U.mRange = (y, m) => [U.ymd(y, m, 1), U.ymd(y, m, U.daysInMonth(y, m))];
  U.inRange = (d, a, b) => !!d && (!a || d >= a) && (!b || d <= b);
  U.overlapRange = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
  U.period = (p) => {
    const y = +p.year || 2027;
    if (p.kind === 'quarter') return U.qRange(y, +p.q || 1);
    if (p.kind === 'month') return U.mRange(y, +p.m || 1);
    if (p.kind === 'custom') return [p.from || `${y}-01-01`, p.to || `${y}-12-31`];
    return [`${y}-01-01`, `${y}-12-31`];
  };
  U.periodLabel = (p) => {
    const y = +p.year || 2027;
    if (p.kind === 'quarter') return `Q${p.q || 1} ${y}`;
    if (p.kind === 'month') return `${U.MONTHS[(+p.m || 1) - 1]} ${y}`;
    if (p.kind === 'custom') { const [a, b] = U.period(p); return `${U.fmtD(a)} – ${U.fmtD(b)}`; }
    return `Full year ${y}`;
  };
  U.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  U.MON = U.MONTHS.map(m => m.slice(0, 3));
  U.DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  U.fmtD = (s) => { if (!s) return '—'; if (!U.validDate(s)) return s; const [y, m, d] = s.split('-').map(Number); return `${U.DAYS[U.dow(s)]} ${d} ${U.MON[m - 1]} ${y}`; };
  U.fmtDs = (s) => { if (!s || !U.validDate(s)) return s || '—'; const [, m, d] = s.split('-').map(Number); return `${d} ${U.MON[m - 1]}`; };
  U.toMin = (t) => { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  U.fromMin = (n) => `${U.pad(Math.floor(n / 60) % 24)}:${U.pad(n % 60)}`;
  /** gross minutes between two HH:MM times (overnight wraps) */
  U.gross = (a, b) => { const x = U.toMin(a), y = U.toMin(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 1440; return d; };
  U.net = (a, b, brk) => { const g = U.gross(a, b); if (g == null) return null; return Math.max(0, g - (+brk || 0)); };
  U.hrs = (min) => (min == null ? '—' : (Math.round(min / 6) / 10).toFixed(1) + ' h');
  U.num = (n, d = 0) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }));
  U.money = (n, cur) => (n == null || n === '' || isNaN(n) ? '—' : (cur || 'TZS') + ' ' + Number(n).toLocaleString('en-GB'));
  U.pct = (a, b) => (!b ? null : Math.round((a / b) * 100));
  U.stamp = (dt) => { const d = dt ? new Date(dt) : new Date(); const e = new Date(d.getTime() + U.TZ_OFFSET_MIN * 60000); return e.toISOString().slice(0, 16).replace('T', ' ') + ' EAT'; };
  U.absMin = (date, time) => (date ? U.D(date) / 60000 + (U.toMin(time) ?? 0) : null);
  U.uniq = (a) => [...new Set(a.filter(x => x != null && x !== ''))];
  U.by = (k, dir = 1) => (a, b) => { const x = typeof k === 'function' ? k(a) : a[k], y = typeof k === 'function' ? k(b) : b[k]; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.csv = (head, rows) => [head, ...rows].map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  U.slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // ---------- local in-memory db (used only when the shared database is unavailable) ----------
  function MemoryDB() {
    const data = {}; const subs = {};
    const fire = (c) => (subs[c] || []).forEach(fn => fn());
    const snapOf = (c) => { const docs = Object.entries(data[c] || {}).map(([id, v]) => ({ id, exists: true, data: () => v })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
    const coll = (c) => {
      const q = {
        path: c, where: () => q, orderBy: () => q, limit: () => q,
        get: async () => snapOf(c),
        onSnapshot(next) { (subs[c] = subs[c] || []).push(() => next(snapOf(c))); setTimeout(() => next(snapOf(c)), 0); return () => { subs[c] = (subs[c] || []).filter(f => f !== next); }; },
        doc: (id) => ({
          id, path: c + '/' + id,
          get: async () => ({ id, exists: !!(data[c] || {})[id], data: () => (data[c] || {})[id] }),
          set: async (v) => { (data[c] = data[c] || {})[id] = JSON.parse(JSON.stringify(v)); fire(c); },
          delete: async () => { if (data[c]) delete data[c][id]; fire(c); },
        }),
      };
      return q;
    };
    return { collection: coll, doc: (p) => { const [c, id] = p.split('/'); return coll(c).doc(id); } };
  }

  // ---------- store ----------
  const COLLS = ['cfg', 'roles', 'departments', 'members', 'years', 'objectives', 'activities', 'events', 'finance', 'tasks', 'travel', 'songs', 'collections', 'plans', 'series', 'sessions', 'assignments', 'readiness', 'attendance', 'notifications', 'approvals', 'audit', 'exports', 'templates', 'slots', 'deptnotes', 'deptbudget', 'fin_payments', 'fin_contribs', 'fin_cpay', 'fin_income', 'fin_expenses', 'fin_openings', 'fin_settings', 'fin_transfers'];
  const LIMITED = { audit: 400, exports: 150, notifications: 300 };
  const Store = A.Store = {
    db: null, mode: 'loading', S: {}, ready: {}, error: null, onChange: null, denied: {}, unsub: {},
    writeChains: {},
    async init(db) {
      this.db = db || MemoryDB();
      this.mode = db ? 'db' : 'local';
      COLLS.forEach(c => { this.S[c] = new Map(); this.ready[c] = false; });
      const ch = U.debounce(() => this.onChange && this.onChange(), 50);
      this._ch = ch;
      COLLS.forEach(c => this.sub(c));
    },
    /** listen to one collection; a locked one (AAC Finance password) just stays empty until it is unlocked */
    sub(c) {
      if (this.unsub[c]) { try { this.unsub[c](); } catch (e) { } }
      let q = this.db.collection(c);
      if (LIMITED[c] && this.mode === 'db') q = q.orderBy('at', 'desc').limit(LIMITED[c]);
      this.denied[c] = false;
      this.unsub[c] = q.onSnapshot(snap => {
        const m = new Map();
        snap.docs.forEach(d => { const v = d.data(); if (v) m.set(d.id, Object.assign({}, v, { id: d.id })); });
        this.S[c] = m; this.ready[c] = true; this.denied[c] = false; A.L && A.L.invalidate(); this._ch();
      }, err => {
        if (err && err.code === 'permission-denied' && /^fin_/.test(c)) { this.S[c] = new Map(); this.ready[c] = true; this.denied[c] = true; A.L && A.L.invalidate(); this._ch(); return; }
        this.error = err; console.warn('subscription error', c, err); this._ch();
      });
    },
    /** listen again (after the finance password is entered) */
    resub(list) { if (!this.db) return; (list || COLLS).forEach(c => this.sub(c)); },
    FIN: COLLS.filter(c => /^fin_/.test(c)),
    allReady() { return COLLS.every(c => this.ready[c]); },
    get(c, id) { return id ? this.S[c].get(id) : undefined; },
    all(c) { return [...(this.S[c] || new Map()).values()]; },
    live(c) { return this.all(c).filter(x => !x.archived); },
    clean(o) { const x = JSON.parse(JSON.stringify(o)); delete x.id; return x; },
    async _write(path, fn) {
      const prev = this.writeChains[path] || Promise.resolve();
      const p = prev.catch(() => { }).then(fn);
      this.writeChains[path] = p;
      return p;
    },
    async put(c, obj, opts = {}) {
      if (!A.Auth.canWriteData()) throw new Error('Your access level is read-only, so changes cannot be saved.');
      const id = obj.id || U.uid(c.slice(0, 2) + '_');
      const prev = this.S[c].get(id);
      const now = U.nowISO();
      const body = Object.assign({}, prev || {}, obj, { id, updatedAt: now, updatedBy: A.Auth.uid || null });
      if (!prev) { body.createdAt = body.createdAt || now; body.createdBy = body.createdBy || A.Auth.uid || null; }
      if (c === 'audit' || c === 'exports' || c === 'notifications' || c === 'approvals') body.at = body.at || now;
      // optimistic local update so the UI responds before the server confirms
      this.S[c].set(id, body); A.L && A.L.invalidate();
      try {
        await this._write(c + '/' + id, () => this.db.collection(c).doc(id).set(this.clean(body)));
      } catch (e) {
        if (prev) this.S[c].set(id, prev); else this.S[c].delete(id);
        if (e && e.code === 'invalid_argument' && A.Auth.dataWrite == null) A.Auth.refusedWrite = true;
        throw new Error(Store.errMsg(e));
      }
      if (opts.audit !== false && !['audit', 'exports', 'notifications'].includes(c)) {
        Store.audit(prev ? 'update' : 'create', c, id, opts.summary || body.title || body.name || id).catch(() => { });
      }
      return body;
    },
    async patch(c, id, part, opts) { const cur = this.S[c].get(id); if (!cur) throw new Error('Record not found: ' + c + '/' + id); return this.put(c, Object.assign({}, cur, part), opts); },
    async del(c, id, opts = {}) {
      if (!A.Auth.canWriteData()) throw new Error('Your access level is read-only.');
      const prev = this.S[c].get(id);
      this.S[c].delete(id); A.L && A.L.invalidate();
      try { await this._write(c + '/' + id, () => this.db.collection(c).doc(id).delete()); }
      catch (e) { if (prev) this.S[c].set(id, prev); throw new Error(Store.errMsg(e)); }
      if (opts.audit !== false && !['audit', 'exports', 'notifications'].includes(c)) Store.audit('delete', c, id, opts.summary || (prev && (prev.title || prev.name)) || id).catch(() => { });
    },
    async audit(action, coll, docId, summary) {
      if (!A.Auth.canWriteData()) return;
      const id = U.uid('au_');
      const body = { action, coll, docId, summary: String(summary).slice(0, 200), by: A.Auth.uid || null, at: U.nowISO() };
      this.S.audit.set(id, Object.assign({ id }, body));
      return this.db.collection('audit').doc(id).set(body);
    },
    errMsg(e) {
      if (!e) return 'Unknown error';
      if (e.code === 'permission-denied') return 'The choir database refused this change. Make sure you are still an administrator or leader in the choir app.';
      if (e.code === 'invalid_argument') return 'The database refused this change (your access level may be read-only, or the record is too large).';
      if (e.code === 'quota_exceeded') return 'The database is full: ' + (e.message || '') + '. Archive or delete old records.';
      if (e.code === 'resource_exhausted') return 'Too many changes at once. Wait a moment and try again.';
      if (e.code === 'unavailable') return 'The database is temporarily unavailable. Try again shortly.';
      if (e.code === 'revoked') return 'Your access to this planner was withdrawn.';
      return e.message || String(e);
    },
    cfg() { return this.get('cfg', 'org') || {}; },
  };

  // ---------- auth, roles & permissions ----------
  const ROLES = A.ROLES = [
    ['admin', 'System Administrator'], ['chair', 'Choir Chairperson / Leader'], ['secretary', 'Secretary / Planner'],
    ['music', 'Music Director'], ['dept', 'Department Leader'], ['member', 'Choir Member'], ['viewer', 'Read-Only Viewer'],
  ];
  const PERMS = A.PERMS = [
    ['settings', 'Configure choir settings & branding'], ['roles', 'Assign roles & permissions'],
    ['workplan', 'Manage the whole annual work-plan'], ['workplan_dept', 'Manage own department\'s activities'], ['approve', 'Approve plans, events & activities'],
    ['events', 'Create & edit events'], ['practice', 'Manage practice plans & sessions'], ['songs', 'Manage song library & collections'],
    ['readiness', 'Update song readiness'], ['attendance', 'Record practice attendance & reports'],
    ['tasks_all', 'Manage all tasks'], ['tasks_dept', 'Manage own department\'s tasks'], ['tasks_own', 'Update own assigned tasks'],
    ['travel', 'Manage travel & logistics'], ['members', 'Manage members & departments'], ['finance', 'View & record budgets and expenses'],
    ['export', 'Generate PDF & CSV exports'], ['ai', 'Use the AI planning assistant'],
  ];
  const ALL = PERMS.map(p => p[0]);
  A.DEFAULT_MATRIX = {
    admin: ALL.slice(),
    chair: ALL.filter(p => p !== 'settings' && p !== 'roles'),
    secretary: ['workplan', 'events', 'practice', 'attendance', 'tasks_all', 'travel', 'members', 'finance', 'export', 'ai'],
    music: ['practice', 'songs', 'readiness', 'attendance', 'tasks_dept', 'tasks_own', 'export', 'ai'],
    dept: ['workplan_dept', 'tasks_dept', 'tasks_own', 'export'],
    member: ['tasks_own'],
    viewer: [],
  };
  /* Leadership titles imported from the choir app act as roles too (Settings → Roles & permissions). */
  A.titleKey = (t) => 't_' + String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  A.titles = () => ((A.Store.get('cfg', 'titles') || {}).list || []);
  A.allRoles = () => ROLES.concat(A.titles().map(t => [A.titleKey(t), t]));
  A.titleDefaults = (t) => { const base = (window.ChoirLink && window.ChoirLink.roleForPosition) ? window.ChoirLink.roleForPosition(t) : 'dept'; return (A.DEFAULT_MATRIX[base] || []).slice(); };
  /** planner role for a person: their own role setting → their imported title → a role suggested by the title */
  A.roleFor = (uid, title, isAdmin) => {
    if (isAdmin) return 'admin';
    const r = uid && A.Store.get('roles', uid); if (r && r.role) return r.role;
    if (title && A.titles().includes(title)) return A.titleKey(title);
    return title && window.ChoirLink ? window.ChoirLink.roleForPosition(title) : 'member';
  };
  A.roleLabel = (key) => (A.allRoles().find(x => x[0] === key) || [, key])[1];
  const Auth = A.Auth = {
    user: null, uid: null, me: null, isOwner: false, canEdit: false, dataWrite: null, refusedWrite: false,
    async init(user) {
      this.user = user;
      if (!user) return;
      try { this.me = await user.me(); } catch (e) { this.me = null; }
      this.uid = this.me && this.me.id; this.isOwner = !!(this.me && this.me.isOwner); this.canEdit = !!(this.me && this.me.canEdit);
      try { this.dataWrite = await user.can('data.write'); } catch (e) { this.dataWrite = null; }
    },
    canWriteData() { if (A.Store.mode === 'local') return true; if (this.refusedWrite) return false; if (this.dataWrite === false) return false; return !!this.uid || this.dataWrite === true; },
    roleDoc() { return this.uid ? A.Store.get('roles', this.uid) : null; },
    role() {
      if (A.Store.mode === 'local') return 'admin';
      if (!this.canWriteData()) return 'viewer';
      const r = this.roleDoc();
      if (this.isOwner) return 'admin';
      if (r && r.role) return r.role;
      const pos = window.ChoirLink && window.ChoirLink.me && window.ChoirLink.me.position;
      if (pos && A.titles().includes(pos)) return A.titleKey(pos);
      return (window.ChoirLink && window.ChoirLink.defaultRole) || 'member';
    },
    roleName() { return A.roleLabel(this.role()); },
    memberId() { const r = this.roleDoc(); if (r && r.memberId) return r.memberId; const m = A.Store.all('members').find(m => m.userId && m.userId === this.uid); return m ? m.id : null; },
    matrix() { const p = A.Store.get('cfg', 'perms'); const td = {}; A.titles().forEach(t => td[A.titleKey(t)] = A.titleDefaults(t)); return Object.assign({}, A.DEFAULT_MATRIX, td, (p && p.matrix) || {}); },
    has(perm) { const role = this.role(); if (role === 'admin') return true; return (this.matrix()[role] || []).includes(perm); },
    myDepts() { // departments the current member leads/co-leads (editors) or belongs to
      const mid = this.memberId(); if (!mid) return { led: [], member: [] };
      const led = A.Store.live('departments').filter(d => d.leaderId === mid || (d.editors || []).includes(mid)).map(d => d.id);
      const m = A.Store.get('members', mid); return { led, member: U.uniq([...((m && m.departments) || []), ...led]) };
    },
    /** may edit this department's workspace (profile, plans, tasks, notes, budget requests) */
    canDept(deptId) {
      if (!deptId || !this.canWriteData()) return false;
      if (['admin', 'chair', 'secretary'].includes(this.role()) || this.has('workplan')) return true;
      return this.myDepts().led.includes(deptId);
    },
    can(perm, rec) {
      if (perm === 'view') return true;
      if (!this.canWriteData()) return false;
      if (this.has(perm)) return true;
      if (perm === 'tasks' || perm === 'tasks_all') {
        if (this.has('tasks_all')) return true;
        if (rec && rec.deptId && this.myDepts().led.includes(rec.deptId)) return true; // department leaders & co-leaders
        return false;
      }
      if (perm === 'task_progress') { // update status/progress of a task
        if (this.can('tasks', rec)) return true;
        return !!(rec && this.has('tasks_own') && (rec.assignees || []).includes(this.memberId()));
      }
      if (perm === 'workplan' && rec && rec.deptId && this.myDepts().led.includes(rec.deptId)) return true; // department leaders & co-leaders
      return false;
    },
  };
})(window.App);
