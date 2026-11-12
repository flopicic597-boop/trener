// Лаки SVG графикони без спољних библиотека (раде без интернета, мало меморије).
// Недостајуће вриједности се НЕ цртају (нема лажних нула).
import { esc, parseDate, fmtDateShort, fmtNum } from '../lib/util.js';

const W = 640, PADL = 46, PADR = 16, PADT = 16, PADB = 30;
export const NO_DATA = '<p class="empty">Нема довољно података.</p>';

function niceTicks(min, max, n = 4) {
  if (min === max) { min = min - 1; max = max + 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const t = []; for (let v = lo; v <= hi + 1e-9; v += step) t.push(Math.round(v * 1000) / 1000);
  return t;
}

/**
 * series: [{ name, points:[{x:'ГГГГ-ММ-ДД', y:number}], cls:'ln'|'ln2' }]
 * opts: { from, to, yMin, yMax, yFmt, height, unit }
 */
export function lineChart(series, opts = {}) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return NO_DATA;
  const H = opts.height || 220;
  const xs = pts.map((p) => parseDate(p.x).getTime());
  let x0 = opts.from ? parseDate(opts.from).getTime() : Math.min(...xs);
  let x1 = opts.to ? parseDate(opts.to).getTime() : Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  const ys = pts.map((p) => p.y);
  const ticks = niceTicks(opts.yMin ?? Math.min(...ys), opts.yMax ?? Math.max(...ys));
  const y0 = opts.yMin ?? ticks[0], y1 = opts.yMax ?? ticks[ticks.length - 1];
  const X = (t) => PADL + ((t - x0) / (x1 - x0)) * (W - PADL - PADR);
  const Y = (v) => H - PADB - ((v - y0) / (y1 - y0 || 1)) * (H - PADT - PADB);
  const yFmt = opts.yFmt || ((v) => fmtNum(v));
  let g = '';
  for (const t of ticks) if (t >= y0 && t <= y1) g += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${PADL - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(yFmt(t))}</text>`;
  // ознаке датума на X оси (до 6)
  const nx = 5;
  for (let i = 0; i <= nx; i++) {
    const t = x0 + ((x1 - x0) * i) / nx; const d = new Date(t);
    const s = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
    g += `<text class="ax" x="${X(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === nx ? 'end' : 'middle'}">${s}</text>`;
  }
  for (const s of series) {
    const p = [...s.points].sort((a, b) => a.x.localeCompare(b.x));
    if (!p.length) continue;
    const cls = s.cls || 'ln';
    if (p.length > 1) g += `<polyline class="${cls}" points="${p.map((q) => `${X(parseDate(q.x).getTime()).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ')}"/>`;
    for (const q of p) g += `<circle class="${cls === 'ln' ? 'pt' : 'pt2'}" cx="${X(parseDate(q.x).getTime()).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="4.5"><title>${esc(fmtDateShort(q.x))}: ${esc(yFmt(q.y))}${q.note ? ' · ' + esc(q.note) : ''}</title></circle>`;
  }
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i class="${s.cls === 'ln2' ? 'l2' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Графикон')}">${g}</svg>${legend}`;
}

/** bars: [{label, value}] — вриједност 0 је стварна нула (нпр. ниједан завршен тренинг) */
export function barChart(bars, opts = {}) {
  if (!bars.length) return NO_DATA;
  const H = opts.height || 200;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1];
  const Y = (v) => H - PADB - (v / top) * (H - PADT - PADB);
  const bw = (W - PADL - PADR) / bars.length;
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${PADL - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`;
  const every = Math.ceil(bars.length / 10);
  bars.forEach((b, i) => {
    const x = PADL + i * bw + bw * 0.15, w = bw * 0.7;
    g += `<rect class="bar ${b.cls || ''}" x="${x.toFixed(1)}" y="${Y(b.value).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - PADB - Y(b.value)).toFixed(1)}" rx="3"><title>${esc(b.label)}: ${b.value}</title></rect>`;
    if (b.value > 0 && bars.length <= 16) g += `<text class="vl" x="${(x + w / 2).toFixed(1)}" y="${(Y(b.value) - 4).toFixed(1)}" text-anchor="middle">${b.value}</text>`;
    if (i % every === 0) g += `<text class="ax" x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Графикон')}">${g}</svg>`;
}

/** Табеларни приказ уз графикон */
export function dataTable(headers, rows) {
  if (!rows.length) return NO_DATA;
  return `<div class="tscroll"><table class="tbl"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r num' : ''}">${c === null || c === undefined || c === '' ? '—' : esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

/** Картица са графиконом и прекидачем „Графикон / Табела“ */
export function chartCard(id, title, chartHtml, tableHtml, extra = '') {
  return `<section class="card pad stack" data-chart="${id}">
    <div class="row between"><h3>${esc(title)}</h3>
      <div class="seg" role="tablist"><button class="on" data-view="g">Графикон</button><button data-view="t">Табела</button></div></div>
    ${extra}
    <div data-pane="g">${chartHtml}</div><div data-pane="t" hidden>${tableHtml}</div></section>`;
}
/** Повезује прекидаче графикон/табела унутар коријена */
export function bindChartToggles(root) {
  root.querySelectorAll('[data-chart] .seg button').forEach((b) => {
    b.onclick = () => {
      const card = b.closest('[data-chart]');
      card.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      card.querySelector('[data-pane="g"]').hidden = b.dataset.view !== 'g';
      card.querySelector('[data-pane="t"]').hidden = b.dataset.view !== 't';
    };
  });
}
