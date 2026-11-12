// Унос тренинга: расположење, сан, статус и табела серија. Све се чува аутоматски.
import { repo, save, queueSave, flushSaves, confirmDlg, toast, katStyle, fullName, openModal, closeModal } from '../core.js';
import { esc, fmtDate, fmtDateLong, fmtNum, parseNum, parseDuration, isValidDate, isValidTime } from '../../lib/util.js';
import { STATUS, STATUS_ORDER, MOOD_LABEL, TEMPO_HELP, fmtTempo, normalizeTempo, validateSet } from '../../domain/rules.js';
import { TYPE_SHORT } from '../../data/exercises-seed.js';
import { pickExercise, scheduleDialog } from '../dialogs.js';

let ctx = null; // {session, client, exMap, opts, full}

export async function render(main, [id]) {
  const full = await repo.getSessionFull(id);
  if (!full) { main.innerHTML = '<div class="wrap"><p class="empty card">Тренинг није пронађен (можда је обрисан).</p></div>'; return; }
  const [client, exMap, opts, programs] = await Promise.all([repo.getClient(full.session.clientId), repo.exerciseMap(), repo.getOptions(), repo.listPrograms()]);
  ctx = { session: full.session, client, exMap, opts, full, main };
  const s = full.session;
  const progNames = [...new Set(programs.map((p) => p.name))];

  main.innerHTML = `<div class="wrap">
    <a href="#/klijent/${s.clientId}" class="muted" style="text-decoration:none">← ${esc(fullName(client))}</a>
    <div class="phead"><div><div class="eyebrow">${esc(fullName(client))}</div><h1>Тренинг</h1><div class="muted">${fmtDateLong(s.date)}</div></div>
      <div class="row"><button class="btn" data-act="copy">Копирај…</button><button class="btn" data-act="tpl">Сачувај као програм</button><button class="btn danger" data-act="del">Обриши</button></div></div>

    <section class="card pad stack">
      <div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="field"><label for="s-date">Датум</label><input id="s-date" class="inp" type="date" value="${s.date}"></div>
        <div class="field"><label for="s-time">Вријеме (необавезно)</label><input id="s-time" class="inp" type="time" value="${esc(s.time || '')}"></div>
        <div class="field" style="grid-column:span 2"><label for="s-prog">Назив програма</label><input id="s-prog" class="inp" list="prognames" value="${esc(s.programName || '')}" autocomplete="off">
          <datalist id="prognames">${progNames.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
      </div>
      <div class="field"><label>Статус</label><div class="statusbar" id="s-status">${STATUS_ORDER.map((k) => `<button data-st="${k}" class="st-${k} ${s.status === k ? 'on' : ''}" aria-pressed="${s.status === k}">${STATUS[k]}</button>`).join('')}</div></div>
    </section>

    <section class="card pad stack">
      <div class="row between"><div class="lbl">Расположење (1–5)</div><button class="btn ghost sm" data-act="mood-clear">Без уноса</button></div>
      <div class="moods" id="s-mood">${[1, 2, 3, 4, 5].map((v) => `<button class="mood ${s.mood === v ? 'on' : ''}" data-mood="${v}" aria-pressed="${s.mood === v}"><b>${v}</b><small>${MOOD_LABEL[v]}</small></button>`).join('')}</div>
      <p class="small muted" id="mood-txt">${s.mood ? `Изабрано: ${s.mood} – ${MOOD_LABEL[s.mood]}` : 'Није унесено (не рачуна се као нула).'}</p>
      <div class="row" style="align-items:flex-end">
        <div class="field" style="width:150px"><label for="s-sleep">Сан (сати)</label><input id="s-sleep" class="inp" inputmode="decimal" placeholder="нпр. 7,5" value="${s.sleep === null || s.sleep === undefined ? '' : fmtNum(s.sleep)}"></div>
        <div class="chips" id="s-sleepq">${opts.sleepPresets.map((v) => `<button class="qchip ${s.sleep === v ? 'on' : ''}" data-sleep="${v}">${fmtNum(v)}</button>`).join('')}<button class="qchip" data-sleep="">✕</button></div>
      </div>
      <p class="err" id="sleep-err"></p>
      <div class="field"><label for="s-note">Напомена (необавезно)</label><textarea id="s-note" class="inp" rows="2">${esc(s.note || '')}</textarea></div>
    </section>

    <details class="card pad"><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Шта значи темпо (нпр. 3–1–1–0)?</summary><p class="small" style="margin-top:6px">${esc(TEMPO_HELP)}</p></details>

    <div id="exlist" class="stack"></div>
    <button class="btn primary big" data-act="addex">+ Додај вјежбу из библиотеке</button>
  </div>`;

  bindHeader(main);
  await drawExercises();
}

/* ---------------- заглавље тренинга ---------------- */
function bindHeader(main) {
  const s = ctx.session;
  const upd = (changes) => save(async () => { ctx.session = await repo.updateSession(s.id, changes); return ctx.session; });
  main.querySelector('#s-date').onchange = async (e) => { if (!isValidDate(e.target.value)) return toast('Неисправан датум.', 'bad'); if (await upd({ date: e.target.value })) main.querySelector('.phead .muted').textContent = fmtDateLong(e.target.value); };
  main.querySelector('#s-time').onchange = (e) => { const v = e.target.value || null; if (v && !isValidTime(v)) return toast('Неисправно вријеме.', 'bad'); upd({ time: v }); };
  main.querySelector('#s-prog').oninput = (e) => queueSave('s-prog', () => repo.updateSession(s.id, { programName: e.target.value.trim() }));
  main.querySelector('#s-note').oninput = (e) => queueSave('s-note', () => repo.updateSession(s.id, { note: e.target.value }));
  main.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
    if (await upd({ status: b.dataset.st })) main.querySelectorAll('[data-st]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  }));
  const setMood = async (v) => {
    if (!(await upd({ mood: v }))) return;
    main.querySelectorAll('[data-mood]').forEach((x) => { const on = Number(x.dataset.mood) === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    main.querySelector('#mood-txt').textContent = v ? `Изабрано: ${v} – ${MOOD_LABEL[v]}` : 'Није унесено (не рачуна се као нула).';
  };
  main.querySelectorAll('[data-mood]').forEach((b) => (b.onclick = () => setMood(Number(b.dataset.mood))));
  main.querySelector('[data-act="mood-clear"]').onclick = () => setMood(null);
  const sleepInp = main.querySelector('#s-sleep'), sleepErr = main.querySelector('#sleep-err');
  const setSleep = (raw, immediate) => {
    const v = parseNum(raw);
    const bad = Number.isNaN(v) || (v !== null && (v < 0 || v > 24));
    sleepInp.classList.toggle('bad', bad);
    sleepErr.textContent = bad ? 'Сан мора бити број између 0 и 24 (нпр. 7,5). Није сачувано.' : '';
    main.querySelectorAll('[data-sleep]').forEach((x) => x.classList.toggle('on', x.dataset.sleep !== '' && Number(x.dataset.sleep) === v));
    if (bad) return;
    const fn = () => repo.updateSession(s.id, { sleep: v });
    immediate ? save(fn) : queueSave('s-sleep', fn);
  };
  sleepInp.oninput = () => setSleep(sleepInp.value, false);
  main.querySelectorAll('[data-sleep]').forEach((b) => (b.onclick = () => { sleepInp.value = b.dataset.sleep === '' ? '' : fmtNum(Number(b.dataset.sleep)); setSleep(sleepInp.value, true); }));

  main.querySelector('[data-act="addex"]').onclick = () => pickExercise(async (ex) => {
    const se = await save(() => repo.addExerciseToSession(s.id, ex.id, 1));
    if (se) { ctx.exMap.set(ex.id, ex); await drawExercises(); document.getElementById('se-' + se.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  main.querySelector('[data-act="del"]').onclick = async () => {
    if (!(await confirmDlg(`Трајно уклонити овај тренинг (${fmtDate(s.date)}) са свим серијама? Ако тренинг није одржан, боље је поставити статус „Прескочен“.`, { okText: 'Обриши тренинг', danger: true }))) return;
    if ((await save(() => repo.deleteSession(s.id))) !== null) { toast('Тренинг је обрисан.'); location.hash = `#/klijent/${s.clientId}`; }
  };
  main.querySelector('[data-act="copy"]').onclick = () => scheduleDialog({ clientId: s.clientId, date: s.date, title: 'Копирај тренинг на други датум / клијенту', copySessionId: s.id }, (n) => { location.hash = `#/trening/${n.id}`; });
  main.querySelector('[data-act="tpl"]').onclick = () => {
    const m = openModal({
      title: 'Сачувај као програм',
      body: `<div class="field"><label for="tn">Назив програма</label><input id="tn" class="inp" value="${esc(s.programName || 'Нови програм')}" autofocus></div>
        <label class="row"><input type="checkbox" id="tc" style="width:24px;height:24px"> Само за овог клијента (${esc(fullName(ctx.client))})</label>
        <p class="small muted">Одрађене вриједности (или план, гдје нема уноса) постају планиране вриједности шаблона.</p>`,
      foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="tok">Сачувај</button>',
    });
    m.querySelector('#tok').onclick = async () => {
      const p = await save(() => repo.sessionToProgram(s.id, { name: m.querySelector('#tn').value, clientId: m.querySelector('#tc').checked ? s.clientId : null }));
      if (p) { closeModal(); toast('Програм је сачуван.'); }
    };
  };
}

/* ---------------- вјежбе и серије ---------------- */
function prevText(ex, prev) {
  if (!prev) return 'Претходно: нема ранијег резултата за ову вјежбу.';
  const parts = prev.sets.map((x) => {
    if (ex.type === 'time') return x.durationSec !== null ? `${fmtNum(x.durationSec)} с${x.weightKg ? ' @' + fmtNum(x.weightKg) + ' кг' : ''}` : '—';
    if (ex.type === 'bw') return `${x.reps ?? '—'}${x.weightKg ? ' (+' + fmtNum(x.weightKg) + ' кг)' : ''}`;
    return `${x.weightKg !== null ? fmtNum(x.weightKg) : '—'} кг × ${x.reps ?? '—'}`;
  });
  return `Претходно (<b>${fmtDate(prev.session.date)}</b>${prev.session.programName ? ', ' + esc(prev.session.programName) : ''}): <b>${parts.join(' · ')}</b>`;
}

const val = (v, f = fmtNum) => (v === null || v === undefined ? '' : f(v));

function setRow(ex, se, st, i) {
  const isTime = ex.type === 'time';
  const a = isTime
    ? { f: 'durationSec', v: val(st.durationSec), plan: st.planDurationSec, ph: 'с', lbl: 'Трајање (с)', mode: 'decimal' }
    : { f: 'reps', v: val(st.reps, String), plan: st.planReps, ph: 'пон.', lbl: 'Понављања', mode: 'numeric' };
  const kgLbl = ex.type === 'load' ? 'Оптерећење (кг)' : 'Додатно кг';
  return `<div class="setgrid ${st.done ? 'done' : ''}" data-set="${st.id}">
    <div class="no" aria-label="Серија ${i + 1}">${i + 1}</div>
    <div class="c-a"><span class="mlbl">${a.lbl}</span><input class="inp num" data-f="${a.f}" inputmode="${a.mode}" value="${esc(a.v)}" placeholder="${a.plan !== null && a.plan !== undefined ? fmtNum(a.plan) : a.ph}" aria-label="${a.lbl}, серија ${i + 1}">
      ${a.plan !== null && a.plan !== undefined ? `<div class="plan">план ${fmtNum(a.plan)}</div>` : ''}</div>
    <div class="c-b"><span class="mlbl">${kgLbl}</span><input class="inp num" data-f="weightKg" inputmode="decimal" value="${esc(val(st.weightKg))}" placeholder="${st.planWeightKg !== null && st.planWeightKg !== undefined ? fmtNum(st.planWeightKg) : ex.type === 'load' ? 'кг' : '—'}" aria-label="${kgLbl}, серија ${i + 1}">
      ${st.planWeightKg !== null && st.planWeightKg !== undefined ? `<div class="plan">план ${fmtNum(st.planWeightKg)}</div>` : ''}</div>
    <div class="c-c"><span class="mlbl">Темпо</span><input class="inp num" data-f="tempo" value="${esc(fmtTempo(st.tempo))}" placeholder="3–1–1–0" aria-label="Темпо, серија ${i + 1}"></div>
    <div class="c-d"><span class="mlbl">Пауза (с)</span><input class="inp num" data-f="restSec" inputmode="numeric" value="${esc(val(st.restSec))}" placeholder="сек." aria-label="Пауза, серија ${i + 1}"></div>
    <div class="c-ok"><span class="mlbl">Готово</span><button class="chk ${st.done ? 'on' : ''}" data-done aria-pressed="${!!st.done}" aria-label="Завршено, серија ${i + 1}">✓</button></div>
    <div class="c-note"><span class="mlbl">Напомена</span><input class="inp note" data-f="note" value="${esc(st.note || '')}" placeholder="…" aria-label="Напомена, серија ${i + 1}"></div>
    <div class="setacts">
      ${i > 0 ? `<button class="btn sm" data-prevcopy title="Копирај вриједности претходне серије">= прет.</button>` : ''}
      <button class="btn sm" data-dup title="Направи копију ове серије">Копија</button>
      <button class="btn icon sm danger" data-rm title="Уклони серију" aria-label="Уклони серију">✕</button></div>
  </div>`;
}

async function drawExercises() {
  const full = await repo.getSessionFull(ctx.session.id);
  ctx.full = full;
  const root = ctx.main.querySelector('#exlist');
  if (!full.exercises.length) { root.innerHTML = '<p class="empty card">Тренинг још нема вјежби. Додајте вјежбу дугметом испод.</p>'; return; }
  const prevs = await Promise.all(full.exercises.map((e) => repo.previousResult(ctx.session.clientId, e.exerciseId, ctx.session)));
  const { opts } = ctx;
  root.innerHTML = full.exercises.map((se, idx) => {
    const ex = ctx.exMap.get(se.exerciseId) || { name: 'Непозната вјежба', type: 'load', category: '' };
    const doneN = se.sets.filter((x) => x.done).length;
    return `<section class="card exc" style="${katStyle(ex.category)}" id="se-${se.id}" data-se="${se.id}">
      <div class="exhead"><h3>${idx + 1}. ${esc(ex.name)}</h3><span class="kat" style="${katStyle(ex.category)}">${esc(ex.category)}</span><span class="chip muted">${TYPE_SHORT[ex.type]}</span><span class="chip ${doneN === se.sets.length && doneN ? 'ok' : 'muted'}">${doneN}/${se.sets.length}</span>
        <div class="row" style="gap:4px"><button class="btn icon sm" data-mv="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Помјери горе">↑</button><button class="btn icon sm" data-mv="1" ${idx === full.exercises.length - 1 ? 'disabled' : ''} aria-label="Помјери доле">↓</button><button class="btn icon sm danger" data-rmex aria-label="Уклони вјежбу">✕</button></div></div>
      <div class="prev">${prevText(ex, prevs[idx])}</div>
      <div class="presets"><span class="lbl">Темпо за све:</span>${opts.tempoPresets.map((t) => `<button class="qchip" data-alltempo="${esc(t)}">${esc(fmtTempo(t))}</button>`).join('')}</div>
      <div class="presets"><span class="lbl">Пауза за све:</span>${opts.restPresets.map((r) => `<button class="qchip" data-allrest="${r}">${r} с</button>`).join('')}
        ${ex.type === 'time' ? `<span class="lbl" style="margin-left:10px">Трајање за све:</span>${opts.durationPresets.map((d) => `<button class="qchip" data-alldur="${d}">${d >= 60 ? fmtNum(d / 60) + ' мин' : d + ' с'}</button>`).join('')}` : ''}</div>
      <div class="setgrid head"><div>Сер.</div><div>${ex.type === 'time' ? 'Трајање (с)' : 'Понављања'}</div><div>${ex.type === 'load' ? 'Оптерећење (кг)' : 'Додатно кг'}</div><div>Темпо</div><div>Пауза (с)</div><div>Готово</div><div>Напомена</div><div></div></div>
      ${se.sets.map((st, i) => setRow(ex, se, st, i)).join('')}
      <div class="exfoot"><button class="btn" data-addset>+ Серија</button>${se.sets.length ? '<button class="btn" data-copylast>+ Копија посљедње</button>' : ''}
        <input class="inp" data-senote style="flex:1 1 200px;width:auto" placeholder="Напомена уз вјежбу" value="${esc(se.note || '')}"></div>
    </section>`;
  }).join('');
  bindExercises(root);
}

function parseField(f, raw) {
  if (f === 'note') return { v: raw };
  if (f === 'tempo') { const t = normalizeTempo(raw); return t === false ? { err: 'Темпо: четири броја, нпр. 3-1-1-0' } : { v: t }; }
  const v = f === 'durationSec' ? parseDuration(raw) : parseNum(raw);
  if (Number.isNaN(v)) return { err: 'Унесите број (зарез или тачка за децимале).' };
  const e = validateSet({ [f]: v });
  return e[f] ? { err: e[f] } : { v };
}

function bindExercises(root) {
  root.oninput = (e) => {
    const inp = e.target;
    if (inp.dataset.senote !== undefined) {
      const seId = inp.closest('[data-se]').dataset.se;
      return queueSave('sen-' + seId, () => repo.updateSessionExercise(seId, { note: inp.value }));
    }
    const row = inp.closest('[data-set]'); if (!row || !inp.dataset.f) return;
    const f = inp.dataset.f;
    if (f === 'tempo') return; // темпо се чува при изласку из поља (change)
    const r = parseField(f, inp.value);
    inp.classList.toggle('bad', !!r.err); inp.title = r.err || '';
    if (r.err) return;
    queueSave(`set-${row.dataset.set}-${f}`, () => repo.updateSet(row.dataset.set, { [f]: r.v }));
  };
  root.onchange = (e) => {
    const inp = e.target; const row = inp.closest('[data-set]');
    if (!row || inp.dataset.f !== 'tempo') return;
    const r = parseField('tempo', inp.value);
    inp.classList.toggle('bad', !!r.err); inp.title = r.err || '';
    if (r.err) return toast(r.err, 'bad');
    inp.value = fmtTempo(r.v);
    save(() => repo.updateSet(row.dataset.set, { tempo: r.v }));
  };
  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const seEl = b.closest('[data-se]'); const seId = seEl?.dataset.se;
    const row = b.closest('[data-set]'); const setId = row?.dataset.set;
    const se = ctx.full.exercises.find((x) => x.id === seId);
    const redraw = async (p) => { if ((await save(() => p)) !== null) await drawExercises(); };

    if (b.hasAttribute('data-done')) {
      // прво сачувај текући унос, па читај серију из базе (не из старог приказа)
      await flushSaves();
      const st = await repo.getSet(setId);
      const on = !st.done;
      const ch = { done: on ? 1 : 0 };
      // брзи унос: ако нема стварног уноса, при означавању се преузима план
      if (on) {
        if (st.reps === null && st.planReps !== null) ch.reps = st.planReps;
        if (st.weightKg === null && st.planWeightKg !== null) ch.weightKg = st.planWeightKg;
        if (st.durationSec === null && st.planDurationSec !== null) ch.durationSec = st.planDurationSec;
      }
      const ok = await save(() => repo.updateSet(setId, ch));
      if (ok && on && ctx.session.status === 'planned') {
        ctx.session = await repo.updateSession(ctx.session.id, { status: 'active' });
        ctx.main.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x.dataset.st === 'active'));
      }
      return ok && drawExercises();
    }
    if (b.hasAttribute('data-prevcopy')) return redraw(flushThen(() => repo.copyPreviousSet(setId)));
    if (b.hasAttribute('data-dup')) return redraw(flushThen(() => repo.addSet(seId, setId)));
    if (b.hasAttribute('data-rm')) {
      if (!(await confirmDlg('Уклонити ову серију?', { okText: 'Уклони', danger: true }))) return;
      return redraw(repo.removeSet(setId));
    }
    if (b.hasAttribute('data-addset')) return redraw(flushThen(() => repo.addSet(seId)));
    if (b.hasAttribute('data-copylast')) return redraw(flushThen(() => repo.addSet(seId, se.sets[se.sets.length - 1].id)));
    if (b.dataset.mv) return redraw(repo.moveSessionExercise(seId, Number(b.dataset.mv)));
    if (b.hasAttribute('data-rmex')) {
      const ex = ctx.exMap.get(se.exerciseId);
      if (!(await confirmDlg(`Уклонити вјежбу „${esc(ex?.name || '')}“ и све њене серије из овог тренинга?`, { okText: 'Уклони', danger: true }))) return;
      return redraw(repo.removeSessionExercise(seId));
    }
    if (b.dataset.alltempo) return redraw(flushThen(() => repo.applyToAllSets(seId, { tempo: b.dataset.alltempo })));
    if (b.dataset.allrest) return redraw(flushThen(() => repo.applyToAllSets(seId, { restSec: Number(b.dataset.allrest) })));
    if (b.dataset.alldur) return redraw(flushThen(() => repo.applyToAllSets(seId, { durationSec: Number(b.dataset.alldur) })));
  };
}

/** Прво сачувај све што се још куца, па онда изврши структурну измјену */
async function flushThen(fn) {

  await flushSaves();
  return fn();
}
