// Профил клијента: календар и дневни унос, историја, програми, напредак.
import { repo, save, confirmDlg, toast, initials, fullName } from '../core.js';
import { esc, fmtDate, fmtDateLong, today, addDays, parseDate, isoDate, MONTHS_CAP, DAYS_SHORT, fmtNum, monthStart } from '../../lib/util.js';
import { STATUS } from '../../domain/rules.js';
import { clientForm } from './clients.js';
import { scheduleDialog } from '../dialogs.js';
import { renderClientProgress } from './progress.js';
import { renderClientMembership, statusOf, statusChip } from './membership.js';
import { renderClientFindings } from './findings.js';

const st = { day: today(), month: monthStart(today()), cid: null };

export async function render(main, [id, tab = 'trening']) {
  const c = await repo.getClient(id);
  if (!c) { main.innerHTML = '<div class="wrap"><p class="empty card">Клијент није пронађен.</p></div>'; return; }
  if (st.cid !== id) { st.cid = id; st.day = today(); st.month = monthStart(today()); }
  const TABS = [['trening', 'Календар и унос'], ['istorija', 'Историја'], ['programi', 'Програми'], ['napredak', 'Напредак'], ['clanarina', 'Чланарина'], ['nalazi', 'Налази']];
  const [pays, opts] = await Promise.all([repo.listPayments({ clientId: id }), repo.getOptions()]);
  const ms = statusOf(pays, opts);
  main.innerHTML = `<div class="wrap">
    <a href="#/klijenti" class="muted" style="text-decoration:none">← Сви клијенти</a>
    <div class="card pad"><div class="row" style="gap:16px">
      <div class="ava big">${esc(initials(c))}</div>
      <div style="flex:1 1 260px;min-width:0"><h1>${esc(fullName(c))}</h1>
        <div class="row small muted">${c.archived ? '<span class="chip warn">Архивиран</span>' : ''}<a href="#/klijent/${id}/clanarina" style="text-decoration:none" title="Чланарина">${statusChip(ms)}</a><span>Циљ: <b style="color:var(--fg)">${esc(c.goal || '—')}</b></span><span>Почетак: ${fmtDate(c.startDate)}</span>${c.phone ? `<span>Тел: ${esc(c.phone)}</span>` : ''}${c.email ? `<span>${esc(c.email)}</span>` : ''}</div>
        ${c.note ? `<p class="small" style="margin-top:6px">${esc(c.note)}</p>` : ''}</div>
      <div class="row"><button class="btn" data-act="edit">Измијени</button>
        <button class="btn ${c.archived ? '' : 'danger'}" data-act="arch">${c.archived ? 'Врати из архиве' : 'Архивирај'}</button></div>
    </div></div>
    <nav class="tabs">${TABS.map(([k, v]) => `<a href="#/klijent/${id}/${k}" class="${k === tab ? 'on' : ''}">${v}</a>`).join('')}</nav>
    <div id="tab"></div></div>`;
  main.querySelector('[data-act="edit"]').onclick = () => clientForm(c, () => render(main, [id, tab]));
  main.querySelector('[data-act="arch"]').onclick = async () => {
    if (!c.archived && !(await confirmDlg(`Архивирати клијента <b>${esc(fullName(c))}</b>? Историја тренинга остаје сачувана, а клијент се може вратити из архиве.`, { okText: 'Архивирај' }))) return;
    if (await save(() => repo.setClientArchived(id, !c.archived))) { toast(c.archived ? 'Клијент је враћен.' : 'Клијент је архивиран.'); render(main, [id, tab]); }
  };
  const root = main.querySelector('#tab');
  if (tab === 'istorija') return history(root, c);
  if (tab === 'programi') return programs(root, c);
  if (tab === 'napredak') return renderClientProgress(root, c.id);
  if (tab === 'clanarina') return renderClientMembership(root, c);
  if (tab === 'nalazi') return renderClientFindings(root, c);
  return calendar(root, c);
}

function sessionCard(s, counts) {
  const k = counts.get(s.id) || { done: 0, total: 0 };
  return `<a class="litem" href="#/trening/${s.id}">
    <div class="grow"><b>${s.time ? esc(s.time) + ' · ' : ''}${esc(s.programName || 'Тренинг без програма')}</b>
      <small>Серије: ${k.done}/${k.total}${s.mood ? ` · Расположење ${s.mood}` : ''}${s.sleep !== null && s.sleep !== undefined ? ` · Сан ${fmtNum(s.sleep)} h` : ''}${s.note ? ' · ' + esc(s.note) : ''}</small></div>
    <span class="chip st-${s.status}">${STATUS[s.status]}</span></a>`;
}

async function setCounts(sessions) {
  const sets = await repo.listSets({ sessionIds: sessions.map((s) => s.id) });
  const m = new Map();
  for (const x of sets) { const o = m.get(x.sessionId) || { done: 0, total: 0 }; o.total++; if (x.done) o.done++; m.set(x.sessionId, o); }
  return m;
}

async function calendar(root, c) {
  const draw = async () => {
    const m0 = st.month;
    const first = parseDate(m0);
    const gridStart = addDays(m0, -((first.getDay() + 6) % 7));
    const sessions = await repo.listSessions({ clientId: c.id, from: gridStart, to: addDays(gridStart, 41) });
    const byDay = new Map();
    for (const s of sessions) { if (!byDay.has(s.date)) byDay.set(s.date, []); byDay.get(s.date).push(s); }
    const daySessions = (byDay.get(st.day) || []).slice().reverse();
    const counts = await setCounts(daySessions);
    const t = today();
    let cells = DAYS_SHORT.map((d) => `<div class="dh">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const ss = byDay.get(d) || [];
      cells += `<button data-day="${d}" class="${d.slice(0, 7) !== m0.slice(0, 7) ? 'out' : ''} ${d === t ? 'today' : ''} ${d === st.day ? 'sel' : ''}" aria-label="${fmtDateLong(d)}${ss.length ? ', тренинга: ' + ss.length : ''}">
        <span>${parseDate(d).getDate()}</span><span class="dots">${ss.slice(0, 4).map((s) => `<i class="${s.status}"></i>`).join('')}</span></button>`;
    }
    root.innerHTML = `<div class="grid2" style="align-items:start">
      <section class="card pad">
        <div class="calhead"><button class="btn icon" data-m="-1" aria-label="Претходни мјесец">‹</button>
          <h3>${MONTHS_CAP[first.getMonth()]} ${first.getFullYear()}</h3>
          <button class="btn icon" data-m="1" aria-label="Сљедећи мјесец">›</button></div>
        <div class="cal">${cells}</div>
        <div class="row" style="margin-top:10px"><button class="btn sm" data-today>Данас</button><span class="small muted">Тачке: <span style="color:var(--accent)">●</span> планиран <span style="color:var(--warn)">●</span> у току <span style="color:var(--ok)">●</span> завршен <span style="color:var(--faint)">●</span> прескочен</span></div>
      </section>
      <section class="card">
        <div class="pad" style="border-bottom:1px solid var(--line)"><div class="eyebrow">${st.day === t ? 'Данас' : st.day < t ? 'Претходни дан' : 'Будући дан'}</div><h2>${fmtDateLong(st.day)}</h2></div>
        <div class="list">${daySessions.length ? daySessions.map((s) => sessionCard(s, counts)).join('') : '<p class="empty">Нема тренинга за овај дан.</p>'}</div>
        <div class="pad row"><button class="btn primary big" data-new>+ Нови тренинг за ${fmtDate(st.day)}</button></div>
      </section></div>`;
    root.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.day = b.dataset.day; if (st.day.slice(0, 7) !== st.month.slice(0, 7)) st.month = monthStart(st.day); draw(); }));
    root.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const d = parseDate(st.month); d.setMonth(d.getMonth() + Number(b.dataset.m)); st.month = isoDate(d); draw(); }));
    root.querySelector('[data-today]').onclick = () => { st.day = today(); st.month = monthStart(st.day); draw(); };
    root.querySelector('[data-new]').onclick = () => scheduleDialog({ clientId: c.id, date: st.day }, (s) => { location.hash = `#/trening/${s.id}`; });
  };
  await draw();
}

async function history(root, c) {
  const sessions = await repo.listSessions({ clientId: c.id });
  const counts = await setCounts(sessions);
  root.innerHTML = `<section class="card">${sessions.length ? `<div class="wide-only tscroll"><table class="tbl"><thead><tr><th>Датум</th><th>Програм</th><th class="r">Распол.</th><th class="r">Сан (h)</th><th class="r">Серије</th><th>Статус</th><th>Напомена</th></tr></thead><tbody>
    ${sessions.map((s) => { const k = counts.get(s.id) || { done: 0, total: 0 }; return `<tr class="click" data-go="${s.id}"><td class="num">${fmtDate(s.date)} ${s.time ? esc(s.time) : ''}</td><td>${esc(s.programName || '—')}</td><td class="r num">${s.mood ?? '—'}</td><td class="r num">${s.sleep === null || s.sleep === undefined ? '—' : fmtNum(s.sleep)}</td><td class="r num">${k.done}/${k.total}</td><td><span class="chip st-${s.status}">${STATUS[s.status]}</span></td><td class="small">${esc(s.note || '')}</td></tr>`; }).join('')}
    </tbody></table></div><div class="cards list">${sessions.map((s) => sessionCard(s, counts).replace('<b>', `<b>${fmtDate(s.date)} · `)).join('')}</div>` : '<p class="empty">Још нема тренинга.</p>'}</section>`;
  root.querySelectorAll('[data-go]').forEach((r) => (r.onclick = () => { location.hash = `#/trening/${r.dataset.go}`; }));
}

async function programs(root, c) {
  const all = await repo.listPrograms();
  const mine = all.filter((p) => p.clientId === c.id), general = all.filter((p) => !p.clientId);
  const item = (p, own) => `<div class="litem" style="cursor:default"><div class="grow"><b>${esc(p.name)}</b><small>${p.items.length} вјежби · ${p.items.reduce((a, i) => a + i.sets.length, 0)} серија${p.note ? ' · ' + esc(p.note) : ''}</small></div>
    <div class="row"><button class="btn sm primary" data-sched="${p.id}">Закажи</button>${own ? `<a class="btn sm" href="#/program/${p.id}">Уреди</a>` : `<button class="btn sm" data-assign="${p.id}">Додијели</button>`}</div></div>`;
  root.innerHTML = `<div class="grid2" style="align-items:start">
    <section class="card"><div class="pad"><h3>Програми клијента</h3><p class="small muted">Копије шаблона додијељене овом клијенту. Измјене се не преносе на друге клијенте ни на сачуване тренинге.</p></div>
      <div class="list">${mine.map((p) => item(p, true)).join('') || '<p class="empty">Нема додијељених програма.</p>'}</div></section>
    <section class="card"><div class="pad row between"><h3>Општи шаблони</h3><a class="btn sm" href="#/program/novi">+ Нови шаблон</a></div>
      <div class="list">${general.map((p) => item(p, false)).join('') || '<p class="empty">Нема шаблона.</p>'}</div></section></div>`;
  root.querySelectorAll('[data-sched]').forEach((b) => (b.onclick = () => scheduleDialog({ clientId: c.id, programId: b.dataset.sched, date: st.day, title: 'Закажи тренинг' }, (s) => { location.hash = `#/trening/${s.id}`; })));
  root.querySelectorAll('[data-assign]').forEach((b) => (b.onclick = async () => {
    const p = await save(() => repo.copyProgram(b.dataset.assign, { clientId: c.id }));
    if (p) { toast('Програм је додијељен (копија).'); programs(root, c); }
  }));
}
