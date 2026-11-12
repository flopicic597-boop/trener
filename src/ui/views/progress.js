// Графикони и напредак: за једног клијента и преглед свих клијената.
import { repo, fullName } from '../core.js';
import { esc, today, addDays, fmtDate, fmtNum, fmtInt, isValidDate, sortBy } from '../../lib/util.js';
import { sessionSeries, completedPerBucket, exerciseSeries, periodSummary, previousPeriod, progressFindings } from '../../domain/stats.js';
import { lineChart, barChart, dataTable, chartCard, bindChartToggles, NO_DATA } from '../../charts/charts.js';
import { MOOD_LABEL } from '../../domain/rules.js';

const PERIODS = [['28', '4 седмице'], ['91', '3 мјесеца'], ['182', '6 мјесеци'], ['365', '12 мјесеци'], ['custom', 'Прилагођено']];
const st = { p: '28', from: null, to: null, ex: null, bucket: 'week' };

function period() {
  if (st.p === 'custom' && isValidDate(st.from) && isValidDate(st.to) && st.from <= st.to) return { from: st.from, to: st.to };
  const to = today();
  return { from: addDays(to, -(Number(st.p === 'custom' ? 28 : st.p) - 1)), to };
}

function periodPicker() {
  const { from, to } = period();
  return `<div class="card pad stack">
    <div class="row between"><div class="lbl">Период</div><div class="seg" id="pp">${PERIODS.map(([k, v]) => `<button data-p="${k}" class="${st.p === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    ${st.p === 'custom' ? `<div class="row"><div class="field"><label for="pf">Од</label><input id="pf" class="inp" type="date" value="${from}"></div><div class="field"><label for="pt">До</label><input id="pt" class="inp" type="date" value="${to}"></div></div>` : ''}
  </div>`;
}
function bindPicker(root, rerender) {
  root.querySelectorAll('#pp button').forEach((b) => (b.onclick = () => { st.p = b.dataset.p; if (st.p === 'custom' && !st.from) { const p = period(); st.from = p.from; st.to = p.to; } rerender(); }));
  const f = root.querySelector('#pf'), t = root.querySelector('#pt');
  if (f) f.onchange = () => { st.from = f.value; rerender(); };
  if (t) t.onchange = () => { st.to = t.value; rerender(); };
}

const avgTxt = (v, n, unit = '') => (v === null ? 'Нема довољно података' : `${fmtNum(v, 1)}${unit} <span class="small muted">(${n} ${n === 1 ? 'унос' : 'уноса'})</span>`);
function delta(a, b, unit = '') {
  if (a === null || b === null) return '';
  const d = Math.round((a - b) * 100) / 100;
  return `<div class="small ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}">${d > 0 ? '+' : ''}${fmtNum(d, 1)}${unit} у односу на претходни</div>`;
}

export function comparisonHtml(cur, prev) {
  const row = (label, a, b, fmtA, fmtB, dl) => `<div class="c"><div class="lbl">${label}</div><div class="v">${fmtA}</div>${dl}<div class="small muted">Претходно: ${fmtB}</div></div>`;
  return `<div class="stack">
    <p class="small"><b>Тренутни период:</b> ${fmtDate(cur.from)} – ${fmtDate(cur.to)} · ${cur.completed} завршених од ${cur.sessions} тренинга.<br>
    <b>Претходни период исте дужине:</b> ${fmtDate(prev.from)} – ${fmtDate(prev.to)} · ${prev.completed} завршених од ${prev.sessions} тренинга.</p>
    <div class="cmp">
      ${row('Завршени тренинзи', cur.completed, prev.completed, cur.completed, prev.completed, delta(cur.completed, prev.completed))}
      ${row('Расположење (просјек)', 0, 0, avgTxt(cur.moodAvg, cur.moodN), prev.moodAvg === null ? '—' : fmtNum(prev.moodAvg, 1), delta(cur.moodAvg, prev.moodAvg))}
      ${row('Сан (просјек)', 0, 0, avgTxt(cur.sleepAvg, cur.sleepN, ' h'), prev.sleepAvg === null ? '—' : fmtNum(prev.sleepAvg, 1) + ' h', delta(cur.sleepAvg, prev.sleepAvg, ' h'))}
      ${row('Укупан обим (кг)', 0, 0, cur.volume === null ? 'Нема довољно података' : fmtInt(cur.volume), prev.volume === null ? '—' : fmtInt(prev.volume), '')}
    </div>
    <p class="small muted">Обим = збир „понављања × кг“ завршених серија вјежби са спољним оптерећењем. Збир обима зависи од броја тренинга и није сам по себи мјера напретка.</p>
  </div>`;
}

export function findingsHtml(findings) {
  if (!findings.length) return '<p class="muted">Нема довољно података за поређење (иста вјежба са истим бројем понављања или истом тежином у оба периода).</p>';
  return `<ul class="find" style="margin:0;padding-left:20px">${findings.map((f) => `<li><b>${esc(f.name)}</b> <span class="small muted">(${f.basis.prevSessions} → ${f.basis.curSessions} тренинга)</span>
    <ul style="padding-left:18px">${f.items.map((i) => `<li class="${i.dir}">${i.dir === 'up' ? '▲' : i.dir === 'down' ? '▼' : '='} ${esc(i.text)}</li>`).join('')}</ul></li>`).join('')}</ul>`;
}

/** Напредак једног клијента (картица у профилу) */
export async function renderClientProgress(root, clientId) {
  const rerender = () => renderClientProgress(root, clientId);
  const [sessions, sets, exMap] = await Promise.all([repo.listSessions({ clientId }), repo.listSets({ clientId }), repo.exerciseMap()]);
  const { from, to } = period();
  const prevP = previousPeriod(from, to);
  const cur = periodSummary(sessions, sets, exMap, from, to);
  const prev = periodSummary(sessions, sets, exMap, prevP.from, prevP.to);
  const findings = progressFindings(sessions, sets, exMap, { from, to }, prevP);

  const mood = sessionSeries(sessions, 'mood', from, to);
  const sleep = sessionSeries(sessions, 'sleep', from, to);
  const buckets = completedPerBucket(sessions, st.bucket, from, to);

  // вјежбе које клијент има у завршеним серијама
  const usedIds = [...new Set(sets.filter((s) => s.done === 1).map((s) => s.exerciseId))].filter((id) => exMap.has(id));
  const used = sortBy(usedIds.map((id) => exMap.get(id)), (e) => e.name);
  if (!st.ex || !usedIds.includes(st.ex)) st.ex = used[0]?.id || null;
  const ex = st.ex ? exMap.get(st.ex) : null;
  const es = ex ? exerciseSeries(sessions, sets, ex, from, to) : [];

  // обим по тренингу за све вјежбе са спољним оптерећењем
  const loadIds = new Set([...exMap.values()].filter((e) => e.type === 'load').map((e) => e.id));
  const volBy = new Map();
  for (const s of sessions) if (s.status !== 'skipped' && s.date >= from && s.date <= to) volBy.set(s.id, { date: s.date, v: null });
  for (const x of sets) if (volBy.has(x.sessionId) && loadIds.has(x.exerciseId) && x.done === 1 && x.reps > 0 && x.weightKg > 0) { const o = volBy.get(x.sessionId); o.v = (o.v || 0) + x.reps * x.weightKg; }
  const vol = [...volBy.values()].filter((o) => o.v !== null).map((o) => ({ x: o.date, y: Math.round(o.v) }));

  let exCharts = '';
  if (!ex) exCharts = `<section class="card pad"><h3>Вјежба</h3>${NO_DATA}</section>`;
  else {
    const picker = `<div class="field"><label for="exsel">Вјежба</label><select id="exsel" class="inp">${used.map((e) => `<option value="${e.id}" ${e.id === st.ex ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>`;
    if (ex.type === 'load') {
      exCharts = chartCard('exw', 'Оптерећење и понављања', lineChart([
        { name: 'Највећа тежина (кг)', points: es.filter((r) => r.maxWeight !== null).map((r) => ({ x: r.date, y: r.maxWeight, note: r.repsAtMax !== null ? `${r.repsAtMax} пон.` : '' })) },
      ], { from, to, label: 'Тежина', yFmt: (v) => fmtNum(v) }) +
        `<div class="lbl" style="margin-top:10px">Понављања (укупно у тренингу)</div>` +
        lineChart([{ name: 'Укупно понављања', points: es.filter((r) => r.totalReps !== null).map((r) => ({ x: r.date, y: r.totalReps })), cls: 'ln2' }], { from, to, height: 160 }),
      dataTable(['Датум', 'Највећа тежина (кг)', 'Понављања при највећој', 'Укупно понављања', 'Обим (кг)', 'Завршених серија'], es.map((r) => [fmtDate(r.date), fmtNum(r.maxWeight), r.repsAtMax, r.totalReps, r.volume === null ? null : fmtInt(r.volume), r.setsDone])), picker);
    } else if (ex.type === 'bw') {
      exCharts = chartCard('exw', 'Понављања', lineChart([{ name: 'Највише понављања у серији', points: es.filter((r) => r.maxReps !== null).map((r) => ({ x: r.date, y: r.maxReps })) }], { from, to }),
        dataTable(['Датум', 'Највише понављања', 'Укупно понављања', 'Завршених серија'], es.map((r) => [fmtDate(r.date), r.maxReps, r.totalReps, r.setsDone])), picker + '<p class="small muted">Вјежба са сопственом тежином: обим се не рачуна.</p>');
    } else {
      exCharts = chartCard('exw', 'Трајање', lineChart([{ name: 'Најдуже трајање (с)', points: es.filter((r) => r.maxDuration !== null).map((r) => ({ x: r.date, y: r.maxDuration })) }], { from, to, yFmt: (v) => fmtNum(v) + ' с' }),
        dataTable(['Датум', 'Најдуже трајање (с)', 'Завршених серија'], es.map((r) => [fmtDate(r.date), fmtNum(r.maxDuration), r.setsDone])), picker + '<p class="small muted">Вјежба на вријеме: обим се не рачуна.</p>');
    }
  }

  root.innerHTML = `<div class="stack">
    ${periodPicker()}
    <section class="card pad stack"><h3>Поређење са претходним периодом</h3>${comparisonHtml(cur, prev)}</section>
    <section class="card pad stack"><h3>Конкретне промјене</h3>${findingsHtml(findings)}</section>
    <div class="grid2">
      ${chartCard('mood', 'Расположење (1–5)', lineChart([{ name: 'Расположење', points: mood.map((p) => ({ x: p.date, y: p.value })) }], { from, to, yMin: 1, yMax: 5, label: 'Расположење' }),
        dataTable(['Датум', 'Расположење'], mood.map((p) => [fmtDate(p.date), `${p.value} – ${MOOD_LABEL[p.value]}`])))}
      ${chartCard('sleep', 'Сан (сати)', lineChart([{ name: 'Сан', points: sleep.map((p) => ({ x: p.date, y: p.value })) }], { from, to, yMin: 0, label: 'Сан', yFmt: (v) => fmtNum(v) }),
        dataTable(['Датум', 'Сан (h)'], sleep.map((p) => [fmtDate(p.date), fmtNum(p.value)])))}
    </div>
    ${chartCard('cnt', 'Завршени тренинзи', barChart(buckets.map((b) => ({ label: b.label, value: b.count }))),
      dataTable([st.bucket === 'month' ? 'Мјесец' : 'Седмица од', 'Завршених'], buckets.map((b) => [b.label, b.count])),
      `<div class="seg" id="bk"><button data-b="week" class="${st.bucket === 'week' ? 'on' : ''}">Седмично</button><button data-b="month" class="${st.bucket === 'month' ? 'on' : ''}">Мјесечно</button></div>`)}
    ${exCharts}
    ${chartCard('vol', 'Укупан обим по тренингу (кг)', lineChart([{ name: 'Обим', points: vol }], { from, to, yMin: 0, yFmt: (v) => fmtInt(v) }),
      dataTable(['Датум', 'Обим (кг)'], vol.map((p) => [fmtDate(p.x), fmtInt(p.y)])), '<p class="small muted">Само завршене серије вјежби са спољним оптерећењем.</p>')}
  </div>`;
  bindPicker(root, rerender);
  bindChartToggles(root);
  root.querySelectorAll('#bk button').forEach((b) => (b.onclick = () => { st.bucket = b.dataset.b; rerender(); }));
  const sel = root.querySelector('#exsel'); if (sel) sel.onchange = () => { st.ex = sel.value; rerender(); };
}

/** Преглед напретка свих клијената */
export async function render(main) {
  const rerender = () => render(main);
  const [clients, sessions, sets, exMap] = await Promise.all([repo.listClients(), repo.listSessions(), repo.listSets(), repo.exerciseMap()]);
  const { from, to } = period();
  const prevP = previousPeriod(from, to);
  const blocks = clients.map((c) => {
    const ss = sessions.filter((s) => s.clientId === c.id);
    const xs = sets.filter((s) => s.clientId === c.id);
    const cur = periodSummary(ss, xs, exMap, from, to);
    const prev = periodSummary(ss, xs, exMap, prevP.from, prevP.to);
    const f = progressFindings(ss, xs, exMap, { from, to }, prevP);
    return `<section class="card pad stack">
      <div class="row between"><h3><a href="#/klijent/${c.id}/napredak" style="color:inherit">${esc(fullName(c))}</a></h3>
      <span class="small muted">Завршено: ${cur.completed} (${fmtDate(from)} – ${fmtDate(to)}) · претходно: ${prev.completed} (${fmtDate(prevP.from)} – ${fmtDate(prevP.to)})</span></div>
      ${findingsHtml(f)}</section>`;
  });
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Сви клијенти</div><h1>Напредак</h1></div></div>
    ${periodPicker()}
    <p class="small muted">Приказују се само упоредиве промјене: иста вјежба са истим бројем понављања (тежина) или истом тежином (понављања). Збир килограма се не користи као доказ напретка.</p>
    ${blocks.join('') || '<p class="empty card">Нема активних клијената.</p>'}
  </div>`;
  bindPicker(main, rerender);
}
