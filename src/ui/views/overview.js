// Преглед по данима: календар, филтери и дневна табела са детаљима тренинга.
import { repo, fullName } from '../core.js';
import { esc, fmtDate, fmtNum, today, addDays, parseDate, isoDate, monthStart, MONTHS_CAP, DAYS_SHORT } from '../../lib/util.js';
import { STATUS, STATUS_ORDER, fmtTempo } from '../../domain/rules.js';
import { dailyCsv, setsCsv } from '../../io/csv.js';
import { downloadText } from '../download.js';

const st = { client: '', from: addDays(today(), -30), to: addDays(today(), 14), program: '', status: '', open: null, month: monthStart(today()) };

/** Подаци за табелу (дијели се са CSV извозом) */
export async function buildRows(filter = st) {
  const [clients, sessions, exMap] = await Promise.all([repo.listClients({ includeArchived: true }), repo.listSessions({
    clientId: filter.client || undefined, from: filter.from || undefined, to: filter.to || undefined, status: filter.status || undefined, programName: filter.program || undefined,
  }), repo.exerciseMap()]);
  const ids = sessions.map((s) => s.id);
  const [sets, sexs] = await Promise.all([repo.listSets({ sessionIds: ids }), repo.listSessionExercises({ sessionIds: ids })]);
  const cmap = new Map(clients.map((c) => [c.id, c]));
  const setsBy = new Map(), exBy = new Map();
  for (const x of sets) { if (!setsBy.has(x.sessionId)) setsBy.set(x.sessionId, []); setsBy.get(x.sessionId).push(x); }
  for (const e of sexs) { if (!exBy.has(e.sessionId)) exBy.set(e.sessionId, []); exBy.get(e.sessionId).push(e); }
  const rows = sessions.map((s) => {
    const ss = setsBy.get(s.id) || [];
    const ex = (exBy.get(s.id) || []).sort((a, b) => a.position - b.position);
    const exDone = ex.filter((e) => ss.some((x) => x.sessionExerciseId === e.id && x.done)).length;
    return { session: s, clientName: fullName(cmap.get(s.clientId)), exercises: ex, sets: ss, exercisesDone: exDone, exercisesTotal: ex.length, setsDone: ss.filter((x) => x.done).length, setsTotal: ss.length };
  });
  return { rows, clients, exMap };
}

function detail(r, exMap) {
  if (!r.exercises.length) return '<p class="muted small">Тренинг нема вјежби.</p>';
  return r.exercises.map((e) => {
    const ex = exMap.get(e.exerciseId) || { name: '?', type: 'load' };
    const ss = r.sets.filter((x) => x.sessionExerciseId === e.id).sort((a, b) => a.position - b.position);
    return `<div style="margin-bottom:8px"><b>${esc(ex.name)}</b>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Сер.</th><th>${ex.type === 'time' ? 'Трајање (с)' : 'Понављања'}</th><th>Кг</th><th>Темпо</th><th>Пауза</th><th>Завршено</th><th>Напомена</th></tr></thead><tbody>
      ${ss.map((x) => `<tr><td class="num">${x.position + 1}</td><td class="num">${ex.type === 'time' ? (x.durationSec ?? '—') : (x.reps ?? '—')}${(ex.type === 'time' ? x.planDurationSec : x.planReps) !== null ? ` <span class="muted small">(план ${ex.type === 'time' ? x.planDurationSec : x.planReps})</span>` : ''}</td>
        <td class="num">${x.weightKg === null ? '—' : fmtNum(x.weightKg)}${x.planWeightKg !== null ? ` <span class="muted small">(план ${fmtNum(x.planWeightKg)})</span>` : ''}</td><td class="num">${esc(fmtTempo(x.tempo)) || '—'}</td><td class="num">${x.restSec ?? '—'}</td><td>${x.done ? '<span class="chip ok">да</span>' : '<span class="chip muted">не</span>'}</td><td class="small">${esc(x.note || '')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }).join('');
}

export async function render(main) {
  const { rows, clients, exMap } = await buildRows();
  const programs = [...new Set((await repo.listSessions()).map((s) => s.programName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sr'));
  // календар мјесеца (сви клијенти, по тренутном филтеру клијента/статуса/програма)
  const m0 = st.month, first = parseDate(m0), gridStart = addDays(m0, -((first.getDay() + 6) % 7));
  const calRows = (await buildRows({ ...st, from: gridStart, to: addDays(gridStart, 41) })).rows;
  const perDay = new Map(); for (const r of calRows) perDay.set(r.session.date, (perDay.get(r.session.date) || 0) + 1);
  const t = today();
  let cells = DAYS_SHORT.map((d) => `<div class="dh">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i), n = perDay.get(d) || 0;
    cells += `<button data-day="${d}" class="${d.slice(0, 7) !== m0.slice(0, 7) ? 'out' : ''} ${d === t ? 'today' : ''} ${st.from === d && st.to === d ? 'sel' : ''}"><span>${parseDate(d).getDate()}</span><span class="small" style="font-size:12px">${n ? n + ' тр.' : ''}</span></button>`;
  }

  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Сви клијенти</div><h1>Преглед по данима</h1></div>
      <div class="row"><button class="btn" data-csv="daily">CSV: дневни преглед</button><button class="btn" data-csv="sets">CSV: детаљне серије</button></div></div>
    <div class="grid2" style="align-items:start">
      <section class="card pad">
        <div class="calhead"><button class="btn icon" data-m="-1" aria-label="Претходни мјесец">‹</button><h3>${MONTHS_CAP[first.getMonth()]} ${first.getFullYear()}</h3><button class="btn icon" data-m="1" aria-label="Сљедећи мјесец">›</button></div>
        <div class="cal">${cells}</div><p class="small muted" style="margin-top:6px">Додир на дан филтрира табелу на тај дан.</p></section>
      <section class="card pad fgrid">
        <div class="field full"><label for="fc">Клијент</label><select id="fc" class="inp"><option value="">Сви клијенти</option>${clients.map((c) => `<option value="${c.id}" ${c.id === st.client ? 'selected' : ''}>${esc(fullName(c))}${c.archived ? ' (архива)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label for="ff">Од датума</label><input id="ff" class="inp" type="date" value="${st.from}"></div>
        <div class="field"><label for="ft">До датума</label><input id="ft" class="inp" type="date" value="${st.to}"></div>
        <div class="field"><label for="fp">Програм</label><select id="fp" class="inp"><option value="">Сви програми</option>${programs.map((p) => `<option ${p === st.program ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div class="field"><label for="fs">Статус</label><select id="fs" class="inp"><option value="">Сви статуси</option>${STATUS_ORDER.map((k) => `<option value="${k}" ${k === st.status ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}</select></div>
        <div class="row full"><button class="btn sm" data-q="7">Посљедњих 7 дана</button><button class="btn sm" data-q="30">30 дана</button><button class="btn sm" data-q="today">Данас</button><button class="btn sm ghost" data-q="all">Сви датуми</button></div>
      </section></div>
    <p class="small muted">Пронађено тренинга: <b>${rows.length}</b>${st.from || st.to ? ` · ${st.from ? fmtDate(st.from) : '…'} – ${st.to ? fmtDate(st.to) : '…'}` : ''}. Додир на ред отвара вјежбе и серије.</p>
    <section class="card wide-only tscroll"><table class="tbl"><thead><tr><th>Датум</th><th>Клијент</th><th>Програм</th><th class="r">Расположење (1–5)</th><th class="r">Сан (сати)</th><th class="r">Одрађене вјежбе</th><th class="r">Завршене серије</th><th>Статус</th><th>Напомена</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click ${st.open === r.session.id ? 'open' : ''}" data-open="${r.session.id}"><td class="num">${fmtDate(r.session.date)}${r.session.time ? ' ' + esc(r.session.time) : ''}</td><td>${esc(r.clientName)}</td><td>${esc(r.session.programName || '—')}</td>
        <td class="r num">${r.session.mood ?? '—'}</td><td class="r num">${r.session.sleep === null || r.session.sleep === undefined ? '—' : fmtNum(r.session.sleep)}</td><td class="r num">${r.exercisesDone}/${r.exercisesTotal}</td><td class="r num">${r.setsDone}/${r.setsTotal}</td>
        <td><span class="chip st-${r.session.status}">${STATUS[r.session.status]}</span></td><td class="small">${esc(r.session.note || '')}</td></tr>
        ${st.open === r.session.id ? `<tr><td colspan="9" class="detail">${detail(r, exMap)}<a class="btn primary" href="#/trening/${r.session.id}">Отвори тренинг за унос</a></td></tr>` : ''}`).join('') || '<tr><td colspan="9" class="empty">Нема тренинга за изабране филтере.</td></tr>'}
    </tbody></table></section>
    <div class="cards">${rows.map((r) => `<section class="card"><div class="dcard" data-open="${r.session.id}">
      <div class="row between"><b>${fmtDate(r.session.date)}${r.session.time ? ' · ' + esc(r.session.time) : ''} · ${esc(r.clientName)}</b><span class="chip st-${r.session.status}">${STATUS[r.session.status]}</span></div>
      <div>${esc(r.session.programName || 'Без програма')}</div>
      <div class="meta"><span>Расположење: <b>${r.session.mood ?? '—'}</b></span><span>Сан: <b>${r.session.sleep === null || r.session.sleep === undefined ? '—' : fmtNum(r.session.sleep) + ' h'}</b></span><span>Вјежбе: <b>${r.exercisesDone}/${r.exercisesTotal}</b></span><span>Серије: <b>${r.setsDone}/${r.setsTotal}</b></span></div>
      ${r.session.note ? `<div class="small">${esc(r.session.note)}</div>` : ''}</div>
      ${st.open === r.session.id ? `<div class="detail">${detail(r, exMap)}<a class="btn primary" href="#/trening/${r.session.id}">Отвори тренинг за унос</a></div>` : ''}</section>`).join('') || '<p class="empty card">Нема тренинга за изабране филтере.</p>'}</div>
  </div>`;

  const re = () => render(main);
  main.querySelector('#fc').onchange = (e) => { st.client = e.target.value; re(); };
  main.querySelector('#ff').onchange = (e) => { st.from = e.target.value; re(); };
  main.querySelector('#ft').onchange = (e) => { st.to = e.target.value; re(); };
  main.querySelector('#fp').onchange = (e) => { st.program = e.target.value; re(); };
  main.querySelector('#fs').onchange = (e) => { st.status = e.target.value; re(); };
  main.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
    const q = b.dataset.q;
    if (q === 'all') { st.from = ''; st.to = ''; } else if (q === 'today') { st.from = st.to = today(); } else { st.to = today(); st.from = addDays(st.to, -(Number(q) - 1)); }
    re();
  }));
  main.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.from = st.to = b.dataset.day; re(); }));
  main.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const d = parseDate(st.month); d.setMonth(d.getMonth() + Number(b.dataset.m)); st.month = isoDate(d); re(); }));
  main.querySelectorAll('[data-open]').forEach((r) => (r.onclick = (e) => { if (e.target.closest('a')) return; st.open = st.open === r.dataset.open ? null : r.dataset.open; re(); }));
  main.querySelectorAll('[data-csv]').forEach((b) => (b.onclick = () => exportCsv(b.dataset.csv, rows, exMap)));
}

export function exportCsv(kind, rows, exMap) {
  const stamp = today();
  if (kind === 'daily') return downloadText(dailyCsv(rows), `trener-dnevni-pregled-${stamp}.csv`, 'text/csv;charset=utf-8');
  const flat = [];
  for (const r of rows) for (const e of r.exercises) for (const x of r.sets.filter((s) => s.sessionExerciseId === e.id).sort((a, b) => a.position - b.position)) flat.push({ session: r.session, clientName: r.clientName, exercise: exMap.get(e.exerciseId), set: x });
  return downloadText(setsCsv(flat), `trener-serije-${stamp}.csv`, 'text/csv;charset=utf-8');
}
