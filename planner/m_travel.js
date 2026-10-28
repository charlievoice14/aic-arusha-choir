/* m_travel.js — Travel & Logistics: outbound/return legs linked to events */
'use strict';
(function (A) {
  const U = A.U, St = A.Store, UI = A.UI, L = A.L, esc = U.esc;
  const canT = () => A.Auth.can('travel');
  A.L.legFlags = (t) => { const f = []; if (!t.departDate || !t.departTime) f.push('Missing departure date/time'); if (!t.from) f.push('Missing departure point'); if (!t.to) f.push('Missing destination'); if (!t.confirmed) f.push('Unconfirmed'); if (!t.coordinatorId) f.push('No coordinator'); return f; };
  const fields = () => [
    { k: 'eventId', label: 'Event', type: 'select', options: UI.opt.events(), req: true }, { k: 'dir', label: 'Leg', type: 'select', options: [['outbound', 'Outbound'], ['return', 'Return'], ['other', 'Other / connecting']], blank: false },
    { k: 'from', label: 'Departure location', req: true }, { k: 'to', label: 'Arrival location', req: true },
    { k: 'departDate', label: 'Departure date', type: 'date', req: true }, { k: 'departTime', label: 'Departure time (EAT)', type: 'time' },
    { k: 'arriveDate', label: 'Arrival date', type: 'date' }, { k: 'arriveTime', label: 'Arrival time (EAT)', type: 'time' },
    { k: 'mode', label: 'Travel type', type: 'select', options: U.uniq([...L.TRAVEL_TYPES, ...St.all('travel').map(t => t.mode)]) }, { k: 'provider', label: 'Provider / operator' },
    { k: 'booking', label: 'Booking reference (as issued by the provider)', hint: 'Leave empty until you have a real reference.' },
    { k: 'confirmed', label: 'Arrangement confirmed with provider', type: 'checkbox' },
    { k: 'coordinatorId', label: 'Responsible coordinator', type: 'select', options: UI.opt.members() },
    { k: 'travelers', label: 'Travellers', type: 'multi', options: UI.opt.members() },
    { k: 'accommodation', label: 'Accommodation', type: 'textarea' }, { k: 'equipment', label: 'Equipment to transport', type: 'textarea' },
    ...(A.Auth.has('finance') || St.mode === 'local' ? [{ k: 'cost', label: 'Cost (' + (St.cfg().currency || 'TZS') + ')', type: 'number', min: 0 }] : []),
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  const M = A.M.travel = {
    render(root, params) {
      const f = UI.stp('travel', { event: '', flag: '' }, params);
      let legs = St.all('travel');
      if (f.event) legs = legs.filter(t => t.eventId === f.event);
      if (f.flag === 'unconfirmed') legs = legs.filter(t => !t.confirmed);
      if (f.flag === 'missing') legs = legs.filter(t => L.legFlags(t).some(x => x.startsWith('Missing')));
      const byEv = {}; legs.forEach(t => (byEv[t.eventId] = byEv[t.eventId] || []).push(t));
      const all = St.all('travel');
      root.innerHTML = `<div class="stats">${UI.stat(all.length, 'Travel legs')}${UI.stat(all.filter(t => !t.confirmed).length, 'Unconfirmed', { tone: all.some(t => !t.confirmed) ? 'warn' : 'ok', go: ['travel', { flag: 'unconfirmed' }] })}${UI.stat(all.filter(t => L.legFlags(t).some(x => x.startsWith('Missing'))).length, 'Missing departure details', { tone: 'bad', go: ['travel', { flag: 'missing' }] })}</div>
        <div class="filters"><label class="grow">Event${UI.sel('trE', UI.opt.events(), f.event)}</label><label>Show${UI.sel('trF', [['unconfirmed', 'Unconfirmed only'], ['missing', 'Missing details']], f.flag, 'All legs')}</label></div>
        <div class="row" style="margin-bottom:10px">${canT() ? '<button class="btn pri" id="trNew">Add travel leg</button>' : ''}<span class="small muted">Travel legs also appear on the calendar and in event itinerary PDFs. Booking references are only what you enter, never generated.</span></div>
        ${Object.keys(byEv).length ? Object.entries(byEv).map(([eid, ls]) => { const e = St.get('events', eid) || { title: '(event removed)' }; ls.sort(U.by(t => (t.departDate || '') + (t.departTime || ''))); return `<div class="card" style="margin-bottom:12px"><div class="row between"><h3>${esc(e.title)} ${UI.demo(e)}</h3><div class="row"><span class="small muted">${U.fmtD(e.startDate)} · ${esc(e.venue || '')}</span><button class="btn sm" data-it="${eid}">Itinerary PDF</button></div></div>${UI.table([
          { label: 'Leg', f: t => `<b>${t.dir === 'return' ? 'Return' : t.dir === 'other' ? 'Other' : 'Outbound'}</b>` }, { label: 'Route', f: t => `${esc(t.from || '?')} → ${esc(t.to || '?')}` },
          { label: 'Departs', f: t => `${U.fmtD(t.departDate)} <span class="mono">${esc(t.departTime || '--:--')}</span>` }, { label: 'Arrives', f: t => t.arriveDate ? `${U.fmtD(t.arriveDate)} <span class="mono">${esc(t.arriveTime || '--:--')}</span>` : '—' },
          { label: 'Travel type / provider', f: t => esc([t.mode, t.provider].filter(Boolean).join(' · ') || '—') }, { label: 'Booking', f: t => t.booking ? `<span class="mono">${esc(t.booking)}</span>` : '<span class="muted">none</span>' },
          { label: 'Travellers', n: 1, f: t => (t.travelers || []).length }, { label: 'Seating', f: t => { const x = L.legSeatStats(t); return `<button class="btn sm" data-seat="${t.id}">${x.vehicles ? `${x.used}/${x.cap} seats` : 'Plan seats'}</button>${x.vehicles && x.unseated.length ? ` <span class="pill warn">${x.unseated.length} unseated</span>` : ''}`; } }, { label: 'Status', f: t => (t.confirmed ? '<span class="pill ok">Confirmed</span>' : '<span class="pill warn">Unconfirmed</span>') + L.legFlags(t).filter(x => x !== 'Unconfirmed').map(x => ` <span class="pill bad">${esc(x)}</span>`).join('') },
        ], ls, { click: 1 })}</div>`; }).join('') : '<div class="empty">No travel legs. Add outbound and return legs for events away from your home venue.</div>'}`;
      UI.bindFilters(root, f, { trE: 'event', trF: 'flag' }, A.render);
      UI.bindRows(root, id => M.edit(St.get('travel', id)));
      root.querySelectorAll('[data-seat]').forEach(b => b.onclick = (e) => { e.stopPropagation(); A.Seating.open(b.dataset.seat); });
      root.querySelectorAll('[data-it]').forEach(b => b.onclick = () => { const e = St.get('events', b.dataset.it) || {}; A.state.pdf = { type: 'itinerary', eventId: b.dataset.it, period: { kind: 'year', year: +((e.startDate || '2027').slice(0, 4)) } }; A.go('pdf'); });
      const nb = root.querySelector('#trNew'); if (nb) nb.onclick = () => M.edit({ eventId: f.event });
    },
    edit(rec) {
      rec = Object.assign({ dir: 'outbound', confirmed: false, travelers: [] }, rec || {});
      const ev = rec.eventId && St.get('events', rec.eventId);
      if (!rec.id && ev) { if (!rec.departDate) rec.departDate = rec.dir === 'return' ? (ev.endDate || ev.startDate) : ev.startDate; if (!rec.to && rec.dir === 'outbound') rec.to = ev.venue || ''; }
      UI.edit({ title: rec.id ? 'Travel leg' : 'Add travel leg', fields: fields(), rec, canEdit: canT(), wide: true, extra: rec.id ? [{ label: 'Seating plan', onClick: () => setTimeout(() => A.Seating.open(rec.id), 50) }] : [],
        validate: v => { const e = []; if (v.arriveDate && v.arriveDate < v.departDate) e.push('Arrival is before departure.'); if (v.arriveDate === v.departDate && v.arriveTime && v.departTime && v.arriveTime < v.departTime) e.push('Arrival time is before departure time.'); return e; },
        onSave: v => St.put('travel', Object.assign({}, rec, v), { summary: `${v.dir} ${v.from}→${v.to}` }), deleteFn: rec.id ? () => St.del('travel', rec.id) : null });
    },
  };
})(window.App);
