/* m_seating.js — vehicles, seat layouts and seat allocation for travel legs */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;

  L.TRAVEL_TYPES = ['Hired coach / bus', 'Coaster', 'Minibus (Hiace)', 'Private cars', 'Public bus', 'Train', 'Flight', 'Ferry / boat', 'Walking', 'Other'];
  L.VEHICLES = [
    ['coaster', 'Coaster (30 seats)', { front: 1, rows: 6, left: 2, right: 2, back: 5 }],
    ['bus57', 'Large bus 2+2 (57 seats)', { front: 1, rows: 13, left: 2, right: 2, back: 4 }],
    ['bus65', 'Large bus 3+2 (65 seats)', { front: 1, rows: 12, left: 3, right: 2, back: 4 }],
    ['hiace', 'Minibus / Hiace (14 seats)', { front: 2, rows: 4, left: 1, right: 2, back: 0 }],
    ['noah', 'Noah / 7-seater', { front: 1, rows: 2, left: 1, right: 2, back: 0 }],
    ['car', 'Saloon car (4 seats)', { front: 1, rows: 0, left: 0, right: 0, back: 3 }],
    ['train', 'Train coach 2+2 (64 seats)', { front: 0, rows: 16, left: 2, right: 2, back: 0 }],
    ['custom', 'Custom layout', { front: 1, rows: 8, left: 2, right: 2, back: 4 }],
  ];
  L.vehicleTpl = (k) => (L.VEHICLES.find(v => v[0] === k) || L.VEHICLES[0]);

  /** Seat layout: rows of cells {t:'seat',id,no} | {t:'aisle'} | {t:'driver'} | {t:'gap'}. Driver sits on the right (East Africa). */
  L.seatLayout = (v) => {
    const left = +v.left || 0, right = +v.right || 0, rows = +v.rows || 0, front = +v.front || 0, back = +v.back || 0;
    const body = left + right > 0;
    const cols = body ? left + 1 + right : Math.max(back, front + 1, 3);
    const aisle = body ? left : -1;
    const grid = []; let n = 0; const seats = [];
    // front row: passenger seats from the left, driver at the far right
    const fr = Array.from({ length: cols }, () => ({ t: 'gap' }));
    fr[cols - 1] = { t: 'driver' };
    let placed = 0; for (let c = 0; c < cols - 1 && placed < front; c++) { if (c === aisle) continue; const id = 'F' + (placed + 1); fr[c] = { t: 'seat', id, no: id }; seats.push(id); placed++; }
    grid.push(fr);
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) { if (c === aisle) row.push({ t: 'aisle' }); else { n++; row.push({ t: 'seat', id: String(n), no: String(n) }); seats.push(String(n)); } }
      grid.push(row);
    }
    if (back > 0) {
      const row = Array.from({ length: cols }, () => ({ t: 'gap' }));
      const startC = Math.max(0, Math.floor((cols - back) / 2));
      for (let k = 0; k < Math.min(back, cols); k++) { n++; row[startC + k] = { t: 'seat', id: String(n), no: String(n) }; seats.push(String(n)); }
      grid.push(row);
    }
    return { grid, cols, seats, capacity: seats.length };
  };
  L.newVehicle = (k, i) => { const t = L.vehicleTpl(k); return Object.assign({ id: U.uid('vh_'), type: t[0], label: 'Vehicle ' + (i || 1), plate: '', driver: '', seats: {} }, t[2]); };
  L.legSeatStats = (leg) => {
    const vs = leg.vehicles || []; let cap = 0, used = 0;
    vs.forEach(v => { const lay = L.seatLayout(v); cap += lay.capacity; used += lay.seats.filter(s => v.seats && v.seats[s]).length; });
    const seated = new Set(); vs.forEach(v => Object.values(v.seats || {}).forEach(m => m && seated.add(m)));
    const unseated = (leg.travelers || []).filter(m => !seated.has(m));
    return { cap, used, vehicles: vs.length, unseated, seated };
  };
  const memName = (id) => (St.get('members', id) || {}).name || '(removed member)';
  const memSec = (id) => ((St.get('members', id) || {}).sections || [])[0] || '';
  const short = (nm) => { const p = String(nm).replace(/\(.*?\)/g, '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };

  // ---------- editor ----------
  A.Seating = {
    open(legId) {
      const leg0 = St.get('travel', legId); if (!leg0) return;
      const can = A.Auth.can('travel');
      const draft = JSON.parse(JSON.stringify({ vehicles: leg0.vehicles || [], travelers: leg0.travelers || [] }));
      let vi = 0, sel = null, dirty = false, q = '';
      const ev = St.get('events', leg0.eventId) || {};
      const body = document.createElement('div');
      const m = UI.modal({ title: `Seating plan · ${leg0.dir === 'return' ? 'Return' : leg0.dir === 'other' ? 'Other leg' : 'Outbound'} ${leg0.from || '?'} → ${leg0.to || '?'}`, wide: true, body, buttons: [
        { label: 'Close', onClick: async () => { if (dirty && !(await UI.confirm('You have unsaved seat changes. Close without saving?', { ok: 'Close without saving', danger: true }))) return false; } },
        { label: 'Seating plan PDF', onClick: async () => { if (dirty) { UI.toast('Save your changes first so the PDF matches.', true); return false; } A.state.pdf = { type: 'seating', legId, eventId: leg0.eventId, period: { kind: 'year', year: +((leg0.departDate || ev.startDate || '2027').slice(0, 4)) }, cover: false }; setTimeout(() => A.go('pdf'), 30); } },
        ...(can ? [{ label: 'Save seating', cls: 'pri', close: false, onClick: async () => { await St.patch('travel', legId, { vehicles: draft.vehicles, travelers: draft.travelers }, { summary: 'Seating ' + (leg0.from || '') + '→' + (leg0.to || '') }); dirty = false; UI.toast('Seating saved'); paint(); return false; } }] : []),
      ] });
      const change = () => { dirty = true; paint(); };
      const seatedWhere = (mid) => { for (let i = 0; i < draft.vehicles.length; i++) { const v = draft.vehicles[i]; for (const [s, x] of Object.entries(v.seats || {})) if (x === mid) return { vi: i, seat: s }; } return null; };
      const place = (mid, vIdx, seat) => {
        const v = draft.vehicles[vIdx]; v.seats = v.seats || {};
        const prev = seatedWhere(mid); const occupant = v.seats[seat];
        if (prev) delete draft.vehicles[prev.vi].seats[prev.seat];
        if (occupant && occupant !== mid && prev) draft.vehicles[prev.vi].seats[prev.seat] = occupant; // swap
        v.seats[seat] = mid;
        if (!draft.travelers.includes(mid)) draft.travelers.push(mid);
      };
      function paint() {
        const v = draft.vehicles[vi];
        const stats = L.legSeatStats(draft);
        const lay = v ? L.seatLayout(v) : null;
        const pool = draft.travelers.filter(id => !stats.seated.has(id)).filter(id => !q || memName(id).toLowerCase().includes(q.toLowerCase())).sort(U.by(id => memSec(id) + memName(id)));
        const secs = U.uniq(draft.travelers.map(memSec));
        body.innerHTML = `<div class="row" style="margin-bottom:10px;gap:14px"><span class="small muted">${esc(ev.title || '')} · ${U.fmtD(leg0.departDate)} ${esc(leg0.departTime || '')} · ${esc(leg0.mode || 'travel type not set')}</span><span class="spacer"></span>
            <span class="pill ${stats.unseated.length ? 'warn' : 'ok'}">${stats.used}/${stats.cap} seats filled</span>${stats.unseated.length ? `<span class="pill warn">${stats.unseated.length} traveller(s) without a seat</span>` : ''}${draft.travelers.length > stats.cap && stats.cap ? `<span class="pill bad">${draft.travelers.length - stats.cap} more travellers than seats</span>` : ''}</div>
          <div class="row" style="margin-bottom:12px">${draft.vehicles.map((x, i) => { const ly = L.seatLayout(x); const u = ly.seats.filter(s => x.seats && x.seats[s]).length; return `<button class="btn sm ${i === vi ? 'pri' : ''}" data-vi="${i}">${esc(x.label || 'Vehicle')} · ${u}/${ly.capacity}</button>`; }).join('')}
            ${can ? `<select id="seAddT" style="width:auto"><option value="">+ Add vehicle…</option>${L.VEHICLES.map(t => `<option value="${t[0]}">${esc(t[1])}</option>`).join('')}</select>` : ''}</div>
          ${!v ? `<div class="empty">No vehicles yet. Add the bus, coaster or cars for this leg, then allocate seats.</div>` : `
          <div class="grid" style="grid-template-columns:minmax(0,auto) minmax(260px,1fr);align-items:start" id="seGrid">
            <div class="card" style="padding:14px;overflow-x:auto"><div class="small muted" style="text-align:center;font-weight:800;letter-spacing:.1em">▲ FRONT</div>
              <div class="seatmap" style="--cols:${lay.cols}">${lay.grid.map(row => row.map(c => {
                if (c.t === 'aisle' || c.t === 'gap') return '<div class="sg"></div>';
                if (c.t === 'driver') return `<div class="sdrv">Driver${v.driver ? '<br><span>' + esc(short(v.driver)) + '</span>' : ''}</div>`;
                const mid = (v.seats || {})[c.id]; const col = mid ? L.sectionColor(memSec(mid)) : '';
                const isSel = sel && sel.seat === c.id && sel.vi === vi;
                return `<button class="seat ${mid ? 'on' : ''} ${isSel ? 'sel' : ''}" data-seat="${c.id}" style="${mid ? '--c:' + esc(col) : ''}" title="Seat ${c.no}${mid ? ': ' + esc(memName(mid)) + (memSec(mid) ? ' (' + esc(memSec(mid)) + ')' : '') : ' (free)'}"><b>${c.no}</b><span>${mid ? esc(short(memName(mid))) : 'free'}</span></button>`;
              }).join('')).join('')}</div>
              <div class="legend" style="margin:10px 0 0;justify-content:center">${secs.filter(Boolean).map(s => `<span style="--k:${esc(L.sectionColor(s))}"><i></i>${esc(s)}</span>`).join('')}</div></div>
            <div style="min-width:0">
              ${sel ? `<div class="banner info">${sel.seat ? `Seat <b>${esc(sel.seat)}</b>: ${esc(memName(sel.mid))}. Tap another seat to move or swap.` : `<b>${esc(memName(sel.mid))}</b> selected. Tap a seat.`} <button class="btn sm" id="seCancel">Cancel</button>${sel.seat && can ? ' <button class="btn sm danger" id="seUnseat">Remove from seat</button>' : ''}</div>` : `<p class="small muted" style="margin-top:0">${can ? 'Tap a traveller, then tap a seat. Or drag a name onto a seat. Tap a filled seat to move or swap someone.' : 'View only.'}</p>`}
              <div class="row" style="margin-bottom:8px">${can ? `<button class="btn sm" id="seAuto">Auto-assign by section</button><button class="btn sm" id="seClear">Clear this vehicle</button>${St.all('travel').some(t => t.id !== legId && (t.vehicles || []).length) ? '<button class="btn sm" id="seCopy">Copy from another leg</button>' : ''}` : ''}</div>
              <h3 style="margin:8px 0 6px">Travellers without a seat (${stats.unseated.length})</h3>
              <input type="search" id="seQ" placeholder="Find traveller" value="${esc(q)}" style="margin-bottom:6px">
              <div class="pool">${pool.map(id => `<button class="pchip ${sel && sel.mid === id && !sel.seat ? 'sel' : ''}" draggable="${can}" data-mid="${id}" style="--c:${esc(L.sectionColor(memSec(id)))}">${esc(memName(id))}<span>${esc(memSec(id))}</span></button>`).join('') || `<span class="small muted">${draft.travelers.length ? 'Everyone has a seat.' : 'No travellers on this leg yet.'}</span>`}</div>
              ${can ? `<div class="row" style="margin-top:8px"><select id="seAddM" style="flex:1;min-width:160px"><option value="">+ Add traveller…</option>${UI.opt.members().filter(([id]) => !draft.travelers.includes(id)).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select><button class="btn sm" id="seAll">Add all active members</button></div>` : ''}
              ${can ? `<details style="margin-top:14px"><summary class="small" style="cursor:pointer;font-weight:700">Vehicle details & layout</summary><div class="form" style="margin-top:10px">
                <label class="f"><span>Name</span><input type="text" id="vLabel" value="${esc(v.label || '')}"></label>
                <label class="f"><span>Vehicle type</span><select id="vType">${L.VEHICLES.map(t => `<option value="${t[0]}" ${v.type === t[0] ? 'selected' : ''}>${esc(t[1])}</option>`).join('')}</select></label>
                <label class="f"><span>Plate number</span><input type="text" id="vPlate" value="${esc(v.plate || '')}"></label>
                <label class="f"><span>Driver name & phone</span><input type="text" id="vDriver" value="${esc(v.driver || '')}"></label>
                <label class="f"><span>Seats beside driver</span><input type="number" min="0" max="4" id="vFront" value="${v.front}"></label>
                <label class="f"><span>Rows</span><input type="number" min="0" max="30" id="vRows" value="${v.rows}"></label>
                <label class="f"><span>Seats left of aisle</span><input type="number" min="0" max="4" id="vLeft" value="${v.left}"></label>
                <label class="f"><span>Seats right of aisle</span><input type="number" min="0" max="4" id="vRight" value="${v.right}"></label>
                <label class="f"><span>Back-row seats</span><input type="number" min="0" max="8" id="vBack" value="${v.back}"></label></div>
                <div class="row" style="margin-top:8px"><button class="btn sm" id="vApply">Apply layout</button><button class="btn sm danger" id="vDel">Remove vehicle</button></div></details>` : ''}
            </div></div>`}`;
        if (window.matchMedia('(max-width: 760px)').matches) { const g = body.querySelector('#seGrid'); if (g) g.style.gridTemplateColumns = '1fr'; }
        const on = (id, ev2, fn) => { const el = body.querySelector(id); if (el) el[ev2] = fn; };
        body.querySelectorAll('[data-vi]').forEach(b => b.onclick = () => { vi = +b.dataset.vi; sel = null; paint(); });
        on('#seAddT', 'onchange', (e) => { if (!e.target.value) return; draft.vehicles.push(L.newVehicle(e.target.value, draft.vehicles.length + 1)); vi = draft.vehicles.length - 1; change(); });
        on('#seCancel', 'onclick', () => { sel = null; paint(); });
        on('#seUnseat', 'onclick', () => { delete draft.vehicles[sel.vi].seats[sel.seat]; sel = null; change(); });
        on('#seQ', 'oninput', U.debounce((e) => { q = e.target.value; paint(); const i = body.querySelector('#seQ'); i.focus(); i.setSelectionRange(q.length, q.length); }, 200));
        on('#seAddM', 'onchange', (e) => { if (e.target.value) { draft.travelers.push(e.target.value); change(); } });
        on('#seAll', 'onclick', () => { draft.travelers = U.uniq([...draft.travelers, ...UI.opt.members().map(x => x[0])]); change(); });
        on('#seClear', 'onclick', () => { v.seats = {}; sel = null; change(); });
        on('#seAuto', 'onclick', () => {
          // keep current seats; fill free seats vehicle by vehicle, grouping travellers by section then name
          const st = L.legSeatStats(draft); const queue = st.unseated.slice().sort(U.by(id => memSec(id) + memName(id)));
          draft.vehicles.forEach(x => { x.seats = x.seats || {}; L.seatLayout(x).seats.filter(s => !s.startsWith('F')).concat(L.seatLayout(x).seats.filter(s => s.startsWith('F'))).forEach(s => { if (!x.seats[s] && queue.length) x.seats[s] = queue.shift(); }); });
          change(); UI.toast(queue.length ? `${queue.length} traveller(s) still need a seat. Add another vehicle.` : 'Everyone has a seat');
        });
        on('#seCopy', 'onclick', () => {
          const others = St.all('travel').filter(t => t.id !== legId && (t.vehicles || []).length);
          UI.modal({ title: 'Copy seating from another leg', body: `<select id="cpL">${others.map(t => `<option value="${t.id}">${esc((St.get('events', t.eventId) || {}).title || '')} · ${t.dir} ${esc(t.from || '')} → ${esc(t.to || '')} (${U.fmtDs(t.departDate)})</option>`).join('')}</select><p class="small muted">Replaces the vehicles and seats on this leg.</p>`, buttons: [{ label: 'Cancel' }, { label: 'Copy', cls: 'pri', onClick: ({ body: b2 }) => { const src = St.get('travel', b2.querySelector('#cpL').value); draft.vehicles = JSON.parse(JSON.stringify(src.vehicles || [])).map(x => Object.assign(x, { id: U.uid('vh_') })); draft.travelers = U.uniq([...draft.travelers, ...(src.travelers || [])]); vi = 0; change(); } }] });
        });
        on('#vApply', 'onclick', () => {
          const g = (id) => body.querySelector(id).value; const nv = { label: g('#vLabel'), type: g('#vType'), plate: g('#vPlate'), driver: g('#vDriver'), front: +g('#vFront') || 0, rows: +g('#vRows') || 0, left: +g('#vLeft') || 0, right: +g('#vRight') || 0, back: +g('#vBack') || 0 };
          const keep = new Set(L.seatLayout(nv).seats); const lost = Object.keys(v.seats || {}).filter(s => !keep.has(s));
          lost.forEach(s => delete v.seats[s]); Object.assign(v, nv); change();
          if (lost.length) UI.toast(`${lost.length} seat(s) no longer exist, so those travellers are back in the list.`);
        });
        on('#vType', 'onchange', (e) => { const t = L.vehicleTpl(e.target.value)[2]; ['Front', 'Rows', 'Left', 'Right', 'Back'].forEach(k => { body.querySelector('#v' + k).value = t[k.toLowerCase()]; }); });
        on('#vDel', 'onclick', async () => { if (!(await UI.confirm('Remove this vehicle? Its travellers go back to the unseated list.', { ok: 'Remove', danger: true }))) return; draft.vehicles.splice(vi, 1); vi = 0; sel = null; change(); });
        if (!can) return;
        body.querySelectorAll('.pchip').forEach(c => { c.onclick = () => { sel = sel && sel.mid === c.dataset.mid ? null : { mid: c.dataset.mid }; paint(); }; c.ondragstart = (e) => e.dataTransfer.setData('text/plain', 'm:' + c.dataset.mid); });
        body.querySelectorAll('.seat').forEach(s => {
          const seat = s.dataset.seat;
          s.onclick = () => {
            const occ = (v.seats || {})[seat];
            if (sel) { if (sel.seat === seat && sel.vi === vi) { sel = null; paint(); return; } place(sel.mid, vi, seat); sel = null; change(); }
            else if (occ) { sel = { mid: occ, seat, vi }; paint(); }
          };
          s.draggable = !!(v.seats || {})[seat]; s.ondragstart = (e) => e.dataTransfer.setData('text/plain', 'm:' + v.seats[seat]);
          s.ondragover = (e) => { e.preventDefault(); s.classList.add('drop'); }; s.ondragleave = () => s.classList.remove('drop');
          s.ondrop = (e) => { e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); if (d.startsWith('m:')) { place(d.slice(2), vi, seat); sel = null; change(); } };
        });
      }
      if (!draft.vehicles.length && can) { const k = /coaster/i.test(leg0.mode || '') ? 'coaster' : /hiace|minibus/i.test(leg0.mode || '') ? 'hiace' : /car/i.test(leg0.mode || '') ? 'car' : /train/i.test(leg0.mode || '') ? 'train' : 'bus57'; if (/bus|coach|coaster|minibus|hiace|car|train/i.test(leg0.mode || '')) draft.vehicles.push(L.newVehicle(k, 1)); }
      paint();
      return m;
    },
  };
})(window.App);
