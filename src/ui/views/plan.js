// Циљеви са роком, процјена исхране (Mifflin-St Jeor) и пулсне зоне (Karvonen).
import { repo, save, toast, openModal, closeModal, confirmDlg } from '../core.js';
import { esc, fmtDate, fmtNum, parseNum, today, isValidDate } from '../../lib/util.js';
import { PARAMS, PARAM, paramSeries, goalDir } from '../../domain/findings.js';
import { ageAt, nutritionTargets, karvonen, ACTIVITY, personalRecords } from '../../domain/assessment.js';
import { GOAL_KINDS, goalProgress } from '../../domain/goals.js';
import { pickExercise } from '../dialogs.js';
import { clientForm } from './clients.js';
import { DIET_PLANS, DIET_PLAN, DIET_CATS } from '../../data/nutrition-plans.js';
import { SUPPLEMENTS, SUPPLEMENT, EVIDENCE } from '../../data/supplements.js';
import { planTargets } from '../../domain/nutrition.js';
import { menuHtml, planInfoHtml, handHtml } from './nutrition.js';

/** Тренутне вриједности клијента: посљедња мјерења по параметру и рекорди по вјежби */
export async function clientCurrent(c) {
  const [findings, sets, sessions, exMap] = await Promise.all([repo.listFindings({ clientId: c.id }), repo.listSets({ clientId: c.id }), repo.listSessions({ clientId: c.id }), repo.exerciseMap()]);
  const series = paramSeries(findings);
  const last = (pid) => { const s = series.get(pid); return s ? s[s.length - 1] : null; };
  const prs = new Map(personalRecords(sets, new Map(sessions.map((s) => [s.id, s]))).map((r) => [r.exerciseId, r]));
  return { last, prs, exMap, series };
}
export function goalCurrent(g, cur) {
  if (g.kind === 'param') return cur.last(g.paramId)?.value ?? null;
  if (g.kind === 'e1rm') return cur.prs.get(g.exerciseId)?.best1rm ?? null;
  return g.manualValue ?? null;
}

export async function renderClientPlan(root, c0) {
  const c = await repo.getClient(c0.id);
  const [goals, cur] = await Promise.all([repo.listGoals({ clientId: c.id }), clientCurrent(c)]);
  const day = today(), age = ageAt(c.birthDate, day);
  const w = cur.last('tezina'), rest = cur.last('puls');
  const nt = nutritionTargets({ sex: c.sex, kg: w?.value, cm: c.heightCm, age, activity: c.activity || 1.375, goalDir: goalDir(c.goal) });
  const kv = karvonen(age, rest?.value);
  const missing = [!c.sex && 'пол', age === null && 'датум рођења', !c.heightCm && 'висина', !w && 'тјелесна маса (мјерење)'].filter(Boolean);
  const re = () => renderClientPlan(root, c0);
  const plan = DIET_PLAN[c.dietPlanId] || null;
  const supps = (c.supplements || []).filter((id) => SUPPLEMENT[id]);
  const dietTargets = () => {
    if (!plan || !nt) return null;
    const t = planTargets(plan, { tdee: nt.tdee, kg: w.value });
    if (c.kcalOverride > 0) t.kcal = c.kcalOverride;
    return t;
  };
  const dietHtml = () => { const t = dietTargets(); return `<section class="card pad stack"><div class="row between"><h3>План исхране</h3><a class="btn sm" href="#/ishrana">Сви планови</a></div>
    <div class="fgrid">
      <div class="field"><label for="dp">План</label><select id="dp" class="inp"><option value="">— није изабран —</option>${DIET_CATS.map(([k, v]) => `<optgroup label="${v}">${DIET_PLANS.filter((x) => x.cat === k).map((x) => `<option value="${x.id}" ${x.id === c.dietPlanId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label for="dkc">Дневни унос kcal (празно = аутоматски)</label><input id="dkc" class="inp" inputmode="numeric" value="${c.kcalOverride || ''}" placeholder="${plan && nt ? Math.round(nt.tdee * plan.kcalFactor / 10) * 10 : ''}"></div>
    </div>
    ${plan ? (nt ? `<div class="small muted">Циљ: <b>${fmtNum(t.kcal, 0)} kcal</b> и <b>${t.protein} g протеина</b> (${fmtNum(plan.proteinPerKg, 1)} g/kg × ${fmtNum(w.value)} kg). Јеловник је прилагођен клијенту; примјер дана, намирнице се мијењају по табели замјена.</div>
      <details><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">О плану (принципи, замјене)</summary>${planInfoHtml(plan)}</details>
      ${menuHtml(plan, t)}
      <details><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Мјере руком (без ваге)</summary>${handHtml(t, plan.meals.length)}</details>`
      : '<p class="muted small">За прилагођен јеловник потребни су пол, датум рођења, висина и мјерење масе.</p>') : '<p class="muted small">Изаберите посни или мрсни план — јеловник ће се прерачунати на потрошњу и масу клијента.</p>'}
    <div><div class="lbl">Суплементи клијента</div><div class="chips">${SUPPLEMENTS.filter((x) => x.ev !== 'X').map((x) => `<button class="qchip ${supps.includes(x.id) ? 'on' : ''}" data-sup="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      ${supps.length ? `<ul class="find small">${supps.map((id) => { const x = SUPPLEMENT[id]; return `<li><b>${esc(x.name)}</b> (${EVIDENCE[x.ev].label.toLowerCase()}): ${esc(x.dose)} ${esc(x.timing)}${plan && plan.cat === 'posno' ? ' Пост: ' + esc(x.posno) : ''}</li>`; }).join('')}</ul>` : '<p class="small muted">Додирните суплемент да га додате клијенту (опис и упозорења: Исхрана → Суплементи).</p>'}</div>
  </section>`; };
  const bindDiet = () => {
    root.querySelector('#dp').onchange = async (e) => { if (await save(() => repo.saveClient({ id: c.id, dietPlanId: e.target.value || null }))) re(); };
    root.querySelector('#dkc').onchange = async (e) => { const n = parseNum(e.target.value); if (Number.isNaN(n) || (n !== null && (n < 800 || n > 7000))) { e.target.classList.add('bad'); toast('Унос између 800 и 7000 kcal, или празно.', 'bad'); return; } if (await save(() => repo.saveClient({ id: c.id, kcalOverride: n || null }))) re(); };
    root.querySelectorAll('[data-sup]').forEach((b) => (b.onclick = async () => { const id = b.dataset.sup; const next = supps.includes(id) ? supps.filter((x) => x !== id) : [...supps, id]; if (await save(() => repo.saveClient({ id: c.id, supplements: next }))) re(); }));
  };

  root.innerHTML = `<div class="stack">
    <section class="card pad stack">
      <div class="row between"><h3>Циљеви</h3><button class="btn primary" id="g-add">+ Нови циљ</button></div>
      ${goals.length ? `<div class="stack">${goals.map((g) => {
        const v = goalCurrent(g, cur), p = goalProgress(g, v, day);
        const pct = p.pct === null ? null : Math.max(0, Math.min(1, p.pct));
        const status = p.reached ? ['ok', 'Остварен'] : p.onTrack === true ? ['ok', 'На добром путу'] : p.onTrack === false ? ['bad', 'Касни у односу на рок'] : ['muted', 'Без рока'];
        const unit = g.unit || (g.kind === 'param' ? PARAM[g.paramId]?.unit : g.kind === 'e1rm' ? 'kg' : '') || '';
        return `<div class="card pad stack" style="background:var(--surface-2)">
          <div class="row between"><b>${esc(g.title)}</b><span class="chip ${status[0]}">${status[1]}</span></div>
          <div class="small muted">${g.kind === 'e1rm' ? 'Процијењени 1RM: ' + esc(cur.exMap.get(g.exerciseId)?.name || '?') + ' · ' : ''}Почетно ${fmtNum(g.startValue)} → циљ ${fmtNum(g.target)} ${esc(unit)} · тренутно <b>${v === null ? '—' : fmtNum(v, 1)} ${esc(unit)}</b>${g.deadline ? ' · рок ' + fmtDate(g.deadline) + (p.daysLeft !== null && !p.reached ? ` (${p.daysLeft >= 0 ? 'још ' + p.daysLeft + ' дана' : 'истекао'})` : '') : ''}</div>
          ${pct !== null ? `<div style="height:12px;border-radius:8px;background:var(--line);overflow:hidden;position:relative"><div style="height:100%;width:${(pct * 100).toFixed(1)}%;background:var(--grad);box-shadow:var(--glow)"></div>${p.expectedPct !== null ? `<div title="очекивано до данас" style="position:absolute;top:0;bottom:0;left:${(p.expectedPct * 100).toFixed(1)}%;width:2px;background:var(--fg);opacity:.6"></div>` : ''}</div>
            <div class="small muted">${Math.round(pct * 100)} % пута${p.expectedPct !== null ? ` · очекивано до данас ${Math.round(p.expectedPct * 100)} % (танка линија)` : ''}</div>` : '<div class="small muted">Напредак ће се приказати када постоји тренутна вриједност.</div>'}
          <div class="row">${g.kind === 'manual' ? `<button class="btn sm" data-gv="${g.id}">Унеси тренутну вриједност</button>` : ''}<button class="btn sm" data-ge="${g.id}">Измијени</button>
            <button class="btn sm ${g.done ? '' : 'ok'}" data-gd="${g.id}">${g.done ? 'Врати у активне' : 'Означи као остварен'}</button><button class="btn sm danger" data-gx="${g.id}">Обриши</button></div></div>`; }).join('')}</div>`
      : '<p class="muted small">Још нема циљева. Мјерљив циљ са роком (нпр. „−5 kg до 1. марта“, „чучањ 100 kg“) клијенту даје јасан правац, а вама доказ напретка.</p>'}
    </section>

    ${missing.length ? `<div class="banner info"><div style="flex:1">За прорачуне исхране и пулсних зона недостаје: <b>${missing.join(', ')}</b>.</div><button class="btn sm" id="p-edit">Допуни профил</button></div>` : ''}
    <div class="grid2" style="align-items:start">
      <section class="card pad stack"><h3>Исхрана — дневна процјена</h3>
        ${nt ? `<div class="cmp">
            <div class="c"><div class="lbl">Базални метаболизам</div><div class="v">${fmtNum(nt.bmr, 0)}</div><div class="small muted">kcal</div></div>
            <div class="c"><div class="lbl">Дневна потрошња</div><div class="v">${fmtNum(nt.tdee, 0)}</div><div class="small muted">kcal · ${esc(ACTIVITY[c.activity] || ACTIVITY[1.375])}</div></div>
            <div class="c"><div class="lbl">Циљ уноса</div><div class="v">${fmtNum(Math.round(nt.kcal / 10) * 10, 0)}</div><div class="small muted">kcal · ${goalDir(c.goal) === 'down' ? 'умјерен дефицит (−15 %)' : goalDir(c.goal) === 'up' ? 'благ суфицит (+10 %)' : 'одржавање'}</div></div>
            <div class="c"><div class="lbl">Протеини</div><div class="v">${fmtNum(nt.protein[0], 0)}–${fmtNum(nt.protein[1], 0)}</div><div class="small muted">g дневно</div></div>
            <div class="c"><div class="lbl">Вода</div><div class="v">${fmtNum(nt.waterL, 1)}</div><div class="small muted">литара дневно (+ уз тренинг)</div></div>
          </div><p class="small muted">Процјена по формули Mifflin-St Jeor на основу посљедње измјерене масе (${fmtNum(w.value)} kg, ${fmtDate(w.date)}). Смјерница, не нутриционистички план; код болести исхрану одређује љекар/нутрициониста.</p>`
          : '<p class="muted small">Нема довољно података (потребни пол, датум рођења, висина и бар једно мјерење тјелесне масе).</p>'}
      </section>
      <section class="card pad stack"><h3>Пулсне зоне (Karvonen)</h3>
        ${kv ? `<div class="tscroll"><table class="tbl"><thead><tr><th>Зона</th><th>Намјена</th><th class="r">Пулс (отк/мин)</th></tr></thead><tbody>
          ${kv.zones.map((z) => `<tr><td><b>${z.n}</b></td><td>${esc(z.name)}</td><td class="r num">${z.from}–${z.to}</td></tr>`).join('')}</tbody></table></div>
          <p class="small muted">Максимални пулс процијењен као 208 − 0,7 × узраст (${kv.max}); пулс у мировању ${kv.rest} (мјерење ${fmtDate(rest.date)}). Процјена — тачније вриједности даје тест оптерећења.</p>`
          : '<p class="muted small">Потребни су датум рођења и мјерење „Пулс у мировању“ (картица Мјерења и налази).</p>'}
      </section>
    </div>
    ${dietHtml()}</div>`;

  const pe = root.querySelector('#p-edit'); if (pe) pe.onclick = () => clientForm(c, re);
  bindDiet();
  root.querySelector('#g-add').onclick = () => goalForm(c, null, cur, re);
  root.querySelectorAll('[data-ge]').forEach((b) => (b.onclick = () => goalForm(c, goals.find((g) => g.id === b.dataset.ge), cur, re)));
  root.querySelectorAll('[data-gd]').forEach((b) => (b.onclick = async () => { const g = goals.find((x) => x.id === b.dataset.gd); if (await save(() => repo.saveGoal({ id: g.id, done: g.done ? 0 : 1 }))) re(); }));
  root.querySelectorAll('[data-gx]').forEach((b) => (b.onclick = async () => { const g = goals.find((x) => x.id === b.dataset.gx); if (await confirmDlg(`Обрисати циљ „${esc(g.title)}“?`, { okText: 'Обриши', danger: true }) && (await save(() => repo.deleteGoal(g.id))) !== null) re(); }));
  root.querySelectorAll('[data-gv]').forEach((b) => (b.onclick = () => {
    const g = goals.find((x) => x.id === b.dataset.gv);
    const m = openModal({ title: 'Тренутна вриједност', body: `<div class="field"><label for="gv">${esc(g.title)}</label><input id="gv" class="inp" inputmode="decimal" value="${g.manualValue ?? ''}" autofocus></div><p class="err" id="gverr"></p>`, foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="gvok">Сачувај</button>' });
    m.querySelector('#gvok').onclick = async () => { const v = parseNum(m.querySelector('#gv').value); if (Number.isNaN(v)) { m.querySelector('#gverr').textContent = 'Унесите број.'; return; } closeModal(); if (await save(() => repo.saveGoal({ id: g.id, manualValue: v }))) re(); };
  }));
}

function goalForm(c, g0, cur, onSaved) {
  const g = g0 ? { ...g0 } : { clientId: c.id, title: '', kind: 'param', paramId: 'tezina', exerciseId: null, startValue: null, target: null, unit: '', startDate: today(), deadline: '', note: '' };
  const m = openModal({
    title: g0 ? 'Измјена циља' : 'Нови циљ',
    body: `<div class="fgrid">
      <div class="field full"><label for="g-title">Назив *</label><input id="g-title" class="inp" value="${esc(g.title)}" placeholder="нпр. Мршављење 5 kg до љета" autocomplete="off"></div>
      <div class="field full"><label for="g-kind">Врста</label><select id="g-kind" class="inp">${Object.entries(GOAL_KINDS).map(([k, v]) => `<option value="${k}" ${g.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field full" id="g-src"></div>
      <div class="field"><label for="g-start">Почетна вриједност</label><input id="g-start" class="inp" inputmode="decimal" value="${g.startValue ?? ''}"></div>
      <div class="field"><label for="g-target">Циљна вриједност *</label><input id="g-target" class="inp" inputmode="decimal" value="${g.target ?? ''}"></div>
      <div class="field"><label for="g-sd">Почетак</label><input id="g-sd" class="inp" type="date" value="${esc(g.startDate)}"></div>
      <div class="field"><label for="g-dl">Рок</label><input id="g-dl" class="inp" type="date" value="${esc(g.deadline || '')}"></div>
      <div class="field" id="g-unitf"><label for="g-unit">Јединица</label><input id="g-unit" class="inp" value="${esc(g.unit || '')}" placeholder="нпр. пута"></div>
      <p class="err full" id="g-err"></p></div>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="g-ok">Сачувај</button>',
  });
  const $ = (s) => m.querySelector(s);
  const drawSrc = () => {
    const k = $('#g-kind').value; g.kind = k;
    $('#g-unitf').hidden = k !== 'manual';
    if (k === 'param') {
      $('#g-src').innerHTML = `<label for="g-param">Параметар</label><select id="g-param" class="inp">${PARAMS.map((p) => `<option value="${p.id}" ${g.paramId === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select>`;
      const fill = () => { g.paramId = $('#g-param').value; const v = cur.last(g.paramId)?.value; if (!g0 && v !== undefined) $('#g-start').value = fmtNum(v); };
      $('#g-param').onchange = fill; fill();
    } else if (k === 'e1rm') {
      $('#g-src').innerHTML = `<span class="lbl">Вјежба</span><div class="row"><b id="g-exn">${esc(cur.exMap.get(g.exerciseId)?.name || 'није изабрана')}</b><button type="button" class="btn sm" id="g-pick">Изабери</button></div>`;
      $('#g-pick').onclick = () => pickExercise((ex) => { g.exerciseId = ex.id; const st = { ...g, title: $('#g-title').value, target: parseNum($('#g-target').value), deadline: $('#g-dl').value, startDate: $('#g-sd').value }; const v = cur.prs.get(ex.id)?.best1rm; if (v && !g0) st.startValue = Math.round(v * 10) / 10; goalForm(c, { ...st, id: g0?.id }, cur, onSaved); });
    } else $('#g-src').innerHTML = '';
  };
  $('#g-kind').onchange = drawSrc; drawSrc();
  $('#g-ok').onclick = async () => {
    const start = parseNum($('#g-start').value), target = parseNum($('#g-target').value);
    if (Number.isNaN(start) || Number.isNaN(target) || target === null) { $('#g-err').textContent = 'Почетна и циљна вриједност морају бити бројеви (циљна је обавезна).'; return; }
    const data = { ...g, clientId: c.id, title: $('#g-title').value, startValue: start, target, startDate: $('#g-sd').value, deadline: $('#g-dl').value, unit: g.kind === 'manual' ? $('#g-unit').value.trim() : '' };
    if (data.deadline && !isValidDate(data.deadline)) { $('#g-err').textContent = 'Неисправан рок.'; return; }
    try { await repo.saveGoal(data); } catch (e) { $('#g-err').textContent = e.message; return; }
    closeModal(); toast('Циљ је сачуван.'); onSaved();
  };
}
