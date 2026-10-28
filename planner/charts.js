/* charts.js — small hand-drawn SVG charts (donut, bars, lines) with hover tooltips */
'use strict';
(function (A) {
  const U = A.U, esc = U.esc;
  const C = A.Charts = {};
  C.color = (i) => `var(--s${(i % 5) + 1})`;
  let tip;
  C.bindTips = (root) => {
    root.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('mouseenter', () => { tip = tip || Object.assign(document.createElement('div'), { className: 'ctip' }); document.body.appendChild(tip); tip.innerHTML = el.dataset.tip; });
      el.addEventListener('mousemove', (e) => { if (tip) { tip.style.left = Math.min(window.innerWidth - 220, e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; } });
      el.addEventListener('mouseleave', () => tip && tip.remove());
      if (el.dataset.go) el.style.cursor = 'pointer';
    });
  };
  /** donut: items [{label, value, color?, go?}] */
  C.donut = (items, center, sub) => {
    const tot = items.reduce((t, x) => t + (x.value || 0), 0);
    const R = 60, r = 42, cx = 75, cy = 75; let a0 = -Math.PI / 2;
    const gap = tot && items.filter(x => x.value).length > 1 ? 0.03 : 0;
    const arcs = tot ? items.map((x, i) => {
      if (!x.value) return '';
      const a = (x.value / tot) * Math.PI * 2; const s = a0 + gap / 2, e = a0 + a - gap / 2; a0 += a;
      const large = e - s > Math.PI ? 1 : 0;
      const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)].map(n => n.toFixed(2)).join(' ');
      const d = a >= Math.PI * 2 - 0.001 ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} L ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} Z` : `M ${p(R, s)} A ${R} ${R} 0 ${large} 1 ${p(R, e)} L ${p(r, e)} A ${r} ${r} 0 ${large} 0 ${p(r, s)} Z`;
      return `<path d="${d}" fill="${x.color || C.color(i)}" data-tip="${esc(x.label)}: <b>${x.value}</b> (${Math.round(x.value / tot * 100)}%)" ${x.go ? `data-go='${esc(JSON.stringify(x.go))}'` : ''}/>`;
    }).join('') : `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--line)" stroke-width="${R - r}"/>`;
    const lg = items.map((x, i) => `<div ${x.go ? `data-go='${esc(JSON.stringify(x.go))}' style="cursor:pointer"` : ''}><i style="background:${x.color || C.color(i)}"></i><span>${esc(x.label)}</span><span class="num">${x.value}${tot ? ` <span class="muted">${Math.round(x.value / tot * 100)}%</span>` : ''}</span></div>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 150 150" role="img" aria-label="${esc(center + ' ' + (sub || ''))}">${arcs}<text x="75" y="74" text-anchor="middle" style="font-size:22px;fill:var(--fg);font-family:var(--f-mono)">${esc(center)}</text><text x="75" y="92" text-anchor="middle" style="font-size:10px">${esc(sub || '')}</text></svg><div class="lg">${lg}</div></div>`;
  };
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  /** vertical bars, one series: labels[], values[], opts {unit, highlight: index, color} */
  C.bars = (labels, values, o = {}) => {
    const W = 560, H = 200, L = 34, B = 22, T = 14;
    const max = niceMax(Math.max(...values.map(v => v || 0), o.minMax || 0));
    const bw = (W - L) / labels.length; const y = (v) => T + (H - T - B) * (1 - v / max);
    const ticks = [0, max / 2, max];
    let g = `<g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end">${U.num(t, t % 1 ? 1 : 0)}</text>`).join('')}</g>`;
    labels.forEach((lb, i) => {
      const v = values[i] || 0; const x = L + i * bw + bw * 0.22; const w = bw * 0.56; const top = y(v); const h = Math.max(0, H - B - top);
      const fill = o.highlight === i ? 'var(--gold)' : (o.color || 'url(#bgrad)');
      g += `<path d="M${x} ${H - B} V${top + Math.min(4, h)} q0 -4 4 -4 h${w - 8} q4 0 4 4 V${H - B} Z" fill="${fill}" opacity="${v ? 1 : .25}"/>`;
      if (v && o.labels !== false) g += `<text x="${x + w / 2}" y="${top - 4}" text-anchor="middle" style="fill:var(--fg)">${U.num(v, v % 1 ? 1 : 0)}</text>`;
      g += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`;
      g += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T}" data-tip="${esc(o.tipLabel ? o.tipLabel(i) : lb)}: <b>${U.num(v, v % 1 ? 1 : 0)}${o.unit ? ' ' + esc(o.unit) : ''}</b>" ${o.go ? `data-go='${esc(JSON.stringify(o.go(i)))}'` : ''}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'bar chart')}"><defs><linearGradient id="bgrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--s2)"/><stop offset="1" stop-color="var(--s1)"/></linearGradient></defs>${g}</svg>`;
  };
  /** lines on one shared axis (same unit): series [{name, values, color}] */
  C.lines = (labels, series, o = {}) => {
    const W = 560, H = 200, L = 34, B = 22, T = 12;
    const all = series.flatMap(s => s.values.filter(v => v != null));
    const max = niceMax(Math.max(1, ...all));
    const step = (W - L - 10) / Math.max(1, labels.length - 1);
    const X = (i) => L + 5 + i * step, Y = (v) => T + (H - T - B) * (1 - v / max);
    let g = `<g class="grid">${[0, max / 2, max].map(t => `<line x1="${L}" x2="${W}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 3}" text-anchor="end">${U.num(t, t % 1 ? 1 : 0)}</text>`).join('')}</g>`;
    labels.forEach((lb, i) => { g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`; });
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      if (!pts.length) return;
      const col = s.color || C.color(k);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (k === 0) g += `<path d="${d} L${pts[pts.length - 1][0]} ${H - B} L${pts[0][0]} ${H - B} Z" fill="${col}" opacity=".14"/>`;
      g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      const last = pts[pts.length - 1]; g += `<circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
    });
    labels.forEach((lb, i) => { g += `<rect class="hit" x="${X(i) - step / 2}" y="${T}" width="${step}" height="${H - T - B}" data-tip="<b>${esc(lb)}</b><br>${series.map(s => `${esc(s.name)}: ${s.values[i] == null ? 'no data' : U.num(s.values[i], 1) + (o.unit ? ' ' + esc(o.unit) : '')}`).join('<br>')}"/>`; });
    const lg = `<div class="legend" style="margin:6px 0 0">${series.map((s, k) => `<span><i style="background:${s.color || C.color(k)}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'line chart')}">${g}</svg>${series.length > 1 ? lg : ''}`;
  };
  /** horizontal meters: rows [{label, value, max, sub}] */
  C.meters = (rows) => rows.map(r => { const p = r.max ? Math.round(r.value / r.max * 100) : null; return `<div style="margin-bottom:9px"><div class="row between small"><span>${esc(r.label)}</span><span class="num">${r.sub || (p == null ? '—' : p + '%')}</span></div>${A.UI.bar(p)}</div>`; }).join('');
})(window.App);
