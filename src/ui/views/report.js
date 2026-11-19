// Извјештај за клијента (једна до двије стране): присуство, мјерења и поређење, рекорди,
// циљеви и коментар тренера. „Сачувај као PDF“ користи штампање прегледача
// (Android: Штампај → Сачувај као PDF; Windows: Microsoft Print to PDF / Сачувај као PDF).
import { repo, fullName } from '../core.js';
import { esc, today, addDays, fmtDate, fmtNum } from '../../lib/util.js';
import { periodSummary } from '../../domain/stats.js';
import { compareFindings, buildNotes, paramSeries } from '../../domain/findings.js';
import { attendance, personalRecords, ageAt } from '../../domain/assessment.js';
import { goalProgress } from '../../domain/goals.js';
import { lineChart } from '../../charts/charts.js';
import { clientCurrent, goalCurrent } from './plan.js';

const PERIODS = [[28, '4 седмице'], [91, '3 мјесеца'], [182, '6 мјесеци'], [365, '12 мјесеци']];
const st = { days: 91, comment: {} };

export async function render(main, [clientId]) {
  const c = await repo.getClient(clientId);
  if (!c) { main.innerHTML = '<div class="wrap"><p class="empty card">Клијент није пронађен.</p></div>'; return; }
  const to = today(), from = addDays(to, -(st.days - 1));
  const [sessions, sets, exMap, findings, goals, cur] = await Promise.all([
    repo.listSessions({ clientId }), repo.listSets({ clientId }), repo.exerciseMap(), repo.listFindings({ clientId }), repo.listGoals({ clientId }), clientCurrent(c),
  ]);
  const sum = periodSummary(sessions, sets, exMap, from, to);
  const att = attendance(sessions, from, to, to);
  const rows = compareFindings(findings, { goal: c.goal }).filter((r) => r.cur.date >= from || (r.prev && r.prev.date >= from));
  const notes = buildNotes(rows, (n) => fmtNum(n));
  const sesById = new Map(sessions.map((s) => [s.id, s]));
  const prs = personalRecords(sets, sesById).filter((r) => r.best1rmDate && r.best1rmDate >= from && exMap.get(r.exerciseId)?.type === 'load');
  const series = paramSeries(findings);
  const chartP = ['tezina', 'mast', 'struk'].filter((k) => (series.get(k) || []).length > 1);
  const age = ageAt(c.birthDate, to);

  main.innerHTML = `<div class="wrap report">
    <div class="noprint card pad stack">
      <a href="#/klijent/${c.id}" class="muted" style="text-decoration:none">← ${esc(fullName(c))}</a>
      <div class="row between"><div class="seg">${PERIODS.map(([d, l]) => `<button data-d="${d}" class="${st.days === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn primary big" id="print">Сачувај као PDF / Штампај</button></div>
      <div class="field"><label for="cm">Коментар тренера (иде у извјештај)</label><textarea id="cm" class="inp" rows="3" placeholder="нпр. Одличан напредак у снази; сљедећи циљ…">${esc(st.comment[c.id] || '')}</textarea></div>
      <p class="small muted">На Android-у: <b>Штампај → изаберите „Сачувај као PDF“</b>. На рачунару: изаберите штампач „Сачувај као PDF“ / „Microsoft Print to PDF“. Затим PDF пошаљите клијенту (Viber, WhatsApp, е-пошта).</p>
    </div>

    <article class="paper">
      <header class="row between"><div><div class="eyebrow">Извјештај о напретку</div><h1>${esc(fullName(c))}</h1>
        <div class="muted">${fmtDate(from)} – ${fmtDate(to)}${c.goal ? ' · циљ: ' + esc(c.goal) : ''}${age !== null ? ' · ' + age + ' год.' : ''}</div></div>
        <div class="muted small" style="text-align:right">Тренер<br>${fmtDate(to)}</div></header>

      <h2>Тренинзи</h2>
      <div class="cmp">
        <div class="c"><div class="lbl">Одржано</div><div class="v">${sum.completed}</div><div class="small muted">${att.pct === null ? '' : Math.round(att.pct * 100) + ' % присуство'}</div></div>
        <div class="c"><div class="lbl">Низ седмица</div><div class="v">${att.streak}</div><div class="small muted">без пропуста</div></div>
        <div class="c"><div class="lbl">Расположење</div><div class="v">${sum.moodAvg === null ? '—' : fmtNum(sum.moodAvg, 1)}</div><div class="small muted">просјек 1–5</div></div>
        <div class="c"><div class="lbl">Сан</div><div class="v">${sum.sleepAvg === null ? '—' : fmtNum(sum.sleepAvg, 1) + ' h'}</div><div class="small muted">просјек</div></div>
      </div>

      ${rows.length ? `<h2>Мјерења</h2><table class="tbl"><thead><tr><th>Параметар</th><th class="r">Прије</th><th class="r">Сада</th><th class="r">Промјена</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.name)} <span class="small muted">${esc(r.unit)}</span></td><td class="r num">${r.prev ? fmtNum(r.prev.value, 1) + `<br><span class="small muted">${fmtDate(r.prev.date)}</span>` : '—'}</td><td class="r num">${fmtNum(r.cur.value, 1)}<br><span class="small muted">${fmtDate(r.cur.date)}</span></td>
          <td class="r num ${r.verdict === 'better' ? 'up' : r.verdict === 'worse' ? 'down' : 'same'}">${r.delta === null ? '—' : (r.delta > 0 ? '+' : '') + fmtNum(r.delta, 1)} ${r.verdict === 'better' ? '▲' : r.verdict === 'worse' ? '▼' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${chartP.length ? `<div class="grid2">${chartP.map((k) => `<div><div class="lbl">${esc(series.get(k)[0].name)}</div>${lineChart([{ name: series.get(k)[0].name, points: series.get(k).map((p) => ({ x: p.date, y: p.value })) }], { height: 170 })}</div>`).join('')}</div>` : ''}

      ${prs.length ? `<h2>Нови рекорди у периоду</h2><table class="tbl"><thead><tr><th>Вјежба</th><th class="r">Процијењени 1RM</th><th class="r">Најтежа серија</th><th>Датум</th></tr></thead><tbody>
        ${prs.map((r) => `<tr><td>${esc(exMap.get(r.exerciseId)?.name || '?')}</td><td class="r num"><b>${fmtNum(r.best1rm, 1)} kg</b></td><td class="r num">${fmtNum(r.bestKg)} kg × ${r.bestKgReps}</td><td class="num">${fmtDate(r.best1rmDate)}</td></tr>`).join('')}</tbody></table>` : ''}

      ${goals.length ? `<h2>Циљеви</h2><div class="stack">${goals.map((g) => { const v = goalCurrent(g, cur), p = goalProgress(g, v, to); const pct = p.pct === null ? null : Math.max(0, Math.min(1, p.pct));
        return `<div><div class="row between"><b>${esc(g.title)}</b><span class="small">${p.reached ? 'остварено ✓' : pct === null ? '' : Math.round(pct * 100) + ' %'}${g.deadline ? ' · рок ' + fmtDate(g.deadline) : ''}</span></div>
          ${pct !== null ? `<div class="bar"><div style="width:${(pct * 100).toFixed(1)}%"></div></div>` : ''}</div>`; }).join('')}</div>` : ''}

      ${notes.improved.length || notes.toWork.length ? `<div class="grid2">
        <div><h2>Шта се поправило</h2>${notes.improved.length ? `<ul class="find">${notes.improved.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted small">—</p>'}</div>
        <div><h2>На чему радимо</h2>${notes.toWork.length ? `<ul class="find">${notes.toWork.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted small">—</p>'}</div></div>` : ''}

      <div id="cmout">${st.comment[c.id] ? `<h2>Коментар тренера</h2><p>${esc(st.comment[c.id]).replace(/\n/g, '<br>')}</p>` : ''}</div>
      <p class="small muted" style="margin-top:18px">Процјене (% масти, 1RM) су израчунате по стандардним формулама и служе за праћење напретка. Извјештај није медицински налаз.</p>
    </article></div>`;

  main.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { st.days = Number(b.dataset.d); render(main, [clientId]); }));
  const cm = main.querySelector('#cm');
  cm.oninput = () => { st.comment[c.id] = cm.value; main.querySelector('#cmout').innerHTML = cm.value.trim() ? `<h2>Коментар тренера</h2><p>${esc(cm.value).replace(/\n/g, '<br>')}</p>` : ''; };
  main.querySelector('#print').onclick = () => { const t = document.title; document.title = `Izvjestaj ${c.firstName} ${c.lastName} ${to}`; window.print(); setTimeout(() => { document.title = t; }, 1000); };
}
