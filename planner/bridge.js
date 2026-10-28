/* bridge.js — runs the AAC Planner on the choir app's own Firebase (no claude.ai needed).
   Gives the planner the same "capabilities" it had on claude.ai:
     db        → Firestore collections named pl_<name>
     user      → the member who is logged in to the choir app on this device
     downloads → normal file downloads (Android app: saved to Downloads)
   Only administrators and leaders may open the planner. */
'use strict';
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAHzxcFb9O2NGiC_NVSZsiujDL51k6F4Mc",
    authDomain: "aic-arusha-choir.firebaseapp.com",
    projectId: "aic-arusha-choir",
    storageBucket: "aic-arusha-choir.firebasestorage.app",
    messagingSenderId: "79314643242",
    appId: "1:79314643242:web:6985febc11feadcfe7d653"
  };
  const USER_KEY = 'choir_current_member_id';
  const PREFIX = 'pl_';

  /* Planner role suggested by the member's choir position (an admin can change it in Settings → Roles). */
  function roleForPosition(pos) {
    pos = String(pos || '').toLowerCase();
    if (/chair|choir leader/.test(pos)) return 'chair';
    if (/secretary|treasurer/.test(pos)) return 'secretary';
    if (/music director/.test(pos)) return 'music';
    return 'dept';
  }

  function gate(title, text) {
    document.documentElement.classList.add('gated');
    const el = document.getElementById('gate');
    el.innerHTML = `<div class="gate-card"><div class="gate-mark">♪</div><h2>${title}</h2><p>${text}</p><a class="btn pri" href="./">Back to the choir app</a></div>`;
    el.hidden = false;
  }

  /* ---------- Firestore, shaped like the claude.ai db capability ---------- */
  function makeDb(fs) {
    const coll = (c) => fs.collection(PREFIX + c);
    return {
      collection: coll,
      doc(path) {
        const p = String(path).split('/');
        if (p[0] === 'data' && p[1] === 'users') return fs.collection(PREFIX + 'prefs').doc(p[2]);   // per-person preferences
        return coll(p[0]).doc(p[1]);
      }
    };
  }

  /* ---------- downloads ---------- */
  function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  }
  const MIME = { pdf: 'application/pdf', csv: 'text/csv', json: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain' };
  const downloads = {
    async save({ filename, data }) {
      const ext = (String(filename).split('.').pop() || '').toLowerCase();
      const type = (data && data.type) || MIME[ext] || 'application/octet-stream';
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
        const ok = window.AndroidBridge.saveFile(filename, await blobToBase64(blob), type);
        if (!ok) throw Object.assign(new Error('Could not save the file on this phone.'), { code: 'failed' });
        return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  };

  /* ---------- start ---------- */
  const ready = (async () => {
    if (!window.firebase) { gate('Can\'t reach the choir database', 'Check your internet connection and reload.'); return null; }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const fs = firebase.firestore();
    try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { }
    let uid = null;
    try { const cred = await firebase.auth().signInAnonymously(); uid = cred.user.uid; } catch (e) { }
    if (!uid) { gate('Can\'t sign in', 'Check your internet connection and reload.'); return null; }

    let memberId = null; try { memberId = localStorage.getItem(USER_KEY); } catch (e) { }
    if (!memberId) { gate('Log in first', 'Open the choir app and log in, then come back to the planner.'); return null; }
    let choir = {};
    try { const d = await fs.doc('choir/data').get(); choir = d.exists ? d.data() : {}; } catch (e) { }
    const members = choir.members || [];
    const me = members.find(m => m.id === memberId);
    if (!me) { gate('Log in first', 'Open the choir app and log in, then come back to the planner.'); return null; }

    const isAdmin = me.role === 'admin';
    let claim = false;
    try { claim = (await fs.collection(isAdmin ? 'adminClaims' : 'leaderClaims').doc(uid).get()).exists; } catch (e) { }
    if (!isAdmin && !me.isLeader) { gate('For leaders only', 'The AAC Planner is open to choir administrators and leaders.'); return null; }
    if (!claim) {
      gate('Almost there', isAdmin
        ? 'Unlock admin access on this device first: in the choir app open <b>Members</b> and enter the admin passcode. Then come back here.'
        : 'Your leader access is still being set up. An administrator needs to open the choir app once, then reload this page.');
      return null;
    }

    const leaders = members.filter(m => m.authUid && (m.role === 'admin' || m.isLeader));
    const user = {
      async me() { return { id: uid, name: me.name, isOwner: isAdmin, canEdit: isAdmin, avatarUrl: '' }; },
      async can() { return true; },
      async profiles(ids) { const out = {}; (ids || []).forEach(id => { const m = members.find(x => x.authUid === id); if (m) out[id] = { id, name: m.name }; }); return out; },
      async search(q) { q = String(q || '').toLowerCase(); return leaders.filter(m => !q || m.name.toLowerCase().includes(q)).slice(0, 20).map(m => ({ id: m.authUid, name: m.name + (m.position ? ' · ' + m.position : '') })); }
    };
    window.ChoirLink = {
      uid, me, isAdmin, members, fs,
      defaultRole: isAdmin ? 'admin' : roleForPosition(me.position),
      /* choir members not yet in the planner, ready to be added */
      choirMembers: members.filter(m => m && m.name).map(m => ({ choirId: m.id, name: m.name, sections: m.voicePart ? [m.voicePart] : [], role: m.position && m.position !== 'Choir Member' ? m.position : '', userId: m.authUid || '' }))
    };
    return { db: makeDb(fs), user, downloads, sample: null };
  })();

  /* The planner asks for capabilities the same way it did on claude.ai. */
  window.claude = { use: async (name) => { const caps = await ready; if (!caps) throw new Error('not available'); return caps[name] || null; } };
  window.ChoirReady = ready;
})();
