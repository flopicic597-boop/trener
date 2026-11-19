// Распоред: седмица свих клијената по данима и терминима, са упозорењем на преклапање.
import { repo, fullName } from '../core.js';
import { esc, today, addDays, weekStart, fmtDate, parseDate, DAYS_LONG } from '../../lib/util.js';
import { STATUS } from '../../domain/rules.js';
import { scheduleDialog } from '../dialogs.js';

const st = { week: null };
const mins = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

/** Преклапање: два тренинга истог дана чији се почеци разликују мање од 60 минута */
export function overlaps(daySessions, length = 60) {
  const timed = daySessions.filter((s) => s.time && s.status !== 'skipped').sort((a, b) => a.time.localeCompare(b.time));
  const bad = new Set();
  for (let i = 1; i < timed.length; i++) if (mins(timed[i].time) - mins(timed[i - 1].time) < length) { bad.add(timed[i].id); bad.add(timed[i - 1].id); }
  return bad;
}

export async function render(main) {
  if (!st.week) st.week = weekStart(today());
  const from = st.week, to = addDays(from, 6), t = today();
  const [sessions, clients] = await Promise.all([repo.listSessions({ from, to }), repo.listClients({ includeArchived: true })]);
  const cmap = new Map(clients.map((c) => [c.id, c]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const byDay = new Map(days.map((d) => [d, sessions.filter((s) => s.date === d).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))]));
  const clash = new Set(); for (const d of days) for (const id of overlaps(byDay.get(d))) clash.add(id);

  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Сви клијенти</div><h1>Распоред</h1></div>
      <div class="row"><button class="btn icon" data-w="-7" aria-label="Претходна седмица">‹</button><button class="btn" data-w="0">Ова седмица</button><button class="btn icon" data-w="7" aria-label="Сљедећа седмица">›</button></div></div>
    <p class="muted">${fmtDate(from)} – ${fmtDate(to)} · тренинга: ${sessions.length}${clash.size ? ` · <b class="down">преклапања термина: ${clash.size / 2 >= 1 ? Math.ceil(clash.size / 2) : 1}</b>` : ''}</p>
    <div class="stack">${days.map((d) => {
      const list = byDay.get(d);
      return `<section class="card ${d === t ? 'today-card' : ''}" style="${d === t ? 'border-color:var(--accent);box-shadow:var(--glow)' : ''}">
        <div class="pad row between" style="padding-bottom:8px"><h3>${DAYS_LONG[(parseDate(d).getDay() + 6) % 7]}, ${fmtDate(d)}${d === t ? ' · данас' : ''}</h3>
          <button class="btn sm" data-new="${d}">+ Тренинг</button></div>
        <div class="list">${list.length ? list.map((s) => `<a class="litem" href="#/trening/${s.id}">
          <div style="width:64px;font-family:var(--f-display);font-weight:700;font-size:18px;color:var(--accent)">${esc(s.time || '—')}</div>
          <div class="grow"><b>${esc(fullName(cmap.get(s.clientId)))}</b><small>${esc(s.programName || 'Тренинг без програма')}${clash.has(s.id) ? ' · <span class="down">⚠ преклапа се са другим термином</span>' : ''}</small></div>
          <span class="chip st-${s.status}">${STATUS[s.status]}</span></a>`).join('') : '<p class="small muted" style="padding:0 18px 14px">Нема заказаних тренинга.</p>'}</div></section>`;
    }).join('')}</div>
    <p class="small muted">Преклапање: два тренинга истог дана са почетком мање од 60 минута један од другог. Тренинзи без времена се не провјеравају.</p>
  </div>`;
  main.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { const n = Number(b.dataset.w); st.week = n === 0 ? weekStart(today()) : addDays(st.week, n); render(main); }));
  main.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => scheduleDialog({ date: b.dataset.new, title: 'Нови тренинг' }, (s) => { location.hash = `#/trening/${s.id}`; })));
}
