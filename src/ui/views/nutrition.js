// Исхрана: планови (посно/мрсно по циљу) прилагођени клијенту, суплементи, намирнице, мјере руком.
import { repo, toast, fullName } from '../core.js';
import { esc, fmtNum, parseNum, today } from '../../lib/util.js';
import { FOODS, FOOD, FOOD_GROUPS, FAST_LEVELS } from '../../data/foods.js';
import { DIET_PLANS, DIET_CATS, DIET_GOALS } from '../../data/nutrition-plans.js';
import { SUPPLEMENTS, EVIDENCE, THYROID_NOTES } from '../../data/supplements.js';
import { scaleMeals, mealTotals, planTargets, handPortions } from '../../domain/nutrition.js';
import { ageAt, nutritionTargets } from '../../domain/assessment.js';
import { clientCurrent } from './plan.js';

const st = { tab: 'planovi', cat: 'mrsno', goal: '', kg: 75, tdee: 2500, cid: '', fast: '' };

const r0 = (n) => fmtNum(Math.round(n), 0);
const macroLine = (t) => `${r0(t.kcal)} kcal · П ${r0(t.p)} g · УХ ${r0(t.c)} g · М ${r0(t.f)} g`;

/** Јеловник плана, прилагођен циљу (kcal, протеини) */
export function menuHtml(plan, targets) {
  const s = targets ? scaleMeals(plan.meals, targets) : { meals: plan.meals, totals: plan.meals.reduce((a, m) => { const t = mealTotals(m); return { kcal: a.kcal + t.kcal, p: a.p + t.p, c: a.c + t.c, f: a.f + t.f }; }, { kcal: 0, p: 0, c: 0, f: 0 }), exact: true };
  const piece = (f, g) => (f.piece ? ` <span class="muted small">(≈ ${fmtNum(Math.round((g / f.piece) * 2) / 2, 1)} ком)</span>` : '');
  return `<div class="stack" style="gap:10px">
    ${s.meals.map((m) => { const t = mealTotals(m); return `<div class="card pad" style="background:var(--surface-2)">
      <div class="row between"><b>${esc(m.name)}</b><span class="small muted">${macroLine(t)}</span></div>
      <div class="tscroll"><table class="tbl"><tbody>${m.items.map(([id, g]) => { const f = FOOD[id]; return `<tr><td>${esc(f.name)}${piece(f, g)}</td><td class="r num"><b>${fmtNum(g, 0)} g</b></td><td class="r small muted">${r0(f.kcal * g / 100)} kcal</td></tr>`; }).join('')}</tbody></table></div></div>`; }).join('')}
    <div class="banner ${targets && !s.exact ? 'warn' : 'info'} small"><div><b>Укупно:</b> ${macroLine(s.totals)}${targets ? ` · циљ ${r0(targets.kcal)} kcal и ${r0(targets.protein)} g протеина${s.exact ? '' : ' — протеини одступају; додати/одузети протеинску намирницу'}` : ''}</div></div>
  </div>`;
}

export function planInfoHtml(p) {
  return `<div class="stack" style="gap:8px">
    <p>${esc(p.summary)}</p>
    <div class="chips"><span class="chip accent">${esc(DIET_GOALS[p.goal])}</span><span class="chip muted">${esc(FAST_LEVELS[p.fast])}</span><span class="chip muted">енергија ${p.kcalFactor === 1 ? 'на нивоу потрошње' : (p.kcalFactor > 1 ? '+' : '−') + Math.round(Math.abs(p.kcalFactor - 1) * 100) + ' %'}</span><span class="chip muted">протеини ${fmtNum(p.proteinPerKg, 1)} g/kg</span></div>
    <div><div class="lbl">Принципи</div><ul class="find">${p.principles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div><div class="lbl">Распоред оброка и тренинг</div><p>${esc(p.timing)}</p></div>
    <div><div class="lbl">Замјене</div><p>${esc(p.swaps)}</p></div></div>`;
}

export function handHtml(targets, meals = 4) {
  const h = handPortions({ protein: targets.protein, kcal: targets.kcal, mealsPerDay: meals });
  if (!h) return '';
  return `<div class="cmp">
    <div class="c"><div class="lbl">Протеини</div><div class="v">${fmtNum(h.palms, 1)}</div><div class="small muted">длана по оброку (месо, риба, тофу)</div></div>
    <div class="c"><div class="lbl">Угљени хидрати</div><div class="v">${fmtNum(h.cupped, 1)}</div><div class="small muted">шаке по оброку (пиринач, кромпир, воће)</div></div>
    <div class="c"><div class="lbl">Поврће</div><div class="v">${fmtNum(h.fists, 1)}</div><div class="small muted">песнице по оброку</div></div>
    <div class="c"><div class="lbl">Масти</div><div class="v">${fmtNum(h.thumbs, 1)}</div><div class="small muted">палца по оброку (уље, орашасти)</div></div></div>
    <p class="small muted">За ${meals} оброка дневно. Длан (дебљина и величина длана) ≈ 20–25 g протеина; шака ≈ 20–25 g угљених хидрата; палац ≈ 7–10 g масти. Код крупних мушкараца порције су природно веће јер је и шака већа.</p>`;
}

export function supplementHtml(s) {
  const e = EVIDENCE[s.ev];
  return `<details class="card pad"><summary style="cursor:pointer;list-style:none"><div class="row between"><b>${esc(s.name)}</b><span class="chip ${e.tone}">${e.label}</span></div><div class="small muted" style="margin-top:4px">${esc(s.use)}</div></summary>
    <dl class="mdl" style="margin-top:8px"><dt>Доза</dt><dd>${esc(s.dose)}</dd><dt>Када</dt><dd>${esc(s.timing)}</dd><dt>Пост</dt><dd>${esc(s.posno)}</dd><dt>Опрез</dt><dd>${esc(s.caution)}</dd></dl></details>`;
}

/** Циљеви клијента из профила и посљедњег мјерења масе */
export async function clientTargetsBase(c) {
  const cur = await clientCurrent(c);
  const w = cur.last('tezina');
  const nt = nutritionTargets({ sex: c.sex, kg: w?.value, cm: c.heightCm, age: ageAt(c.birthDate, today()), activity: c.activity || 1.375 });
  return nt ? { tdee: nt.tdee, kg: w.value, bmr: nt.bmr } : null;
}

export async function render(main, [tab] = []) {
  if (tab) st.tab = tab;
  const clients = await repo.listClients();
  const TABS = [['planovi', 'Планови исхране'], ['suplementi', 'Суплементи'], ['ruka', 'Мјере руком'], ['namirnice', 'Намирнице']];
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Исхрана и суплементација</div><h1>Исхрана</h1></div></div>
    <nav class="tabs">${TABS.map(([k, v]) => `<a href="#/ishrana/${k}" class="${k === st.tab ? 'on' : ''}">${v}</a>`).join('')}</nav>
    <div id="ntab" class="stack"></div>
    <p class="small muted">Смјернице за тренера по савременим научним препорукама; вриједности намирница су приближне. Код болести (дијабетес, болести бубрега, поремећаји исхране, трудноћа) план одређује љекар или нутрициониста.</p></div>`;
  const box = main.querySelector('#ntab');
  if (st.tab === 'suplementi') return suppTab(box);
  if (st.tab === 'namirnice') return foodsTab(box);
  if (st.tab === 'ruka') return handTab(box, clients);
  return plansTab(box, clients);
}

async function targetFor(p) {
  return planTargets(p, { tdee: st.tdee, kg: st.kg });
}

async function controlsHtml(clients) {
  return `<section class="card pad stack"><div class="fgrid">
    <div class="field"><label for="n-cl">Прилагоди за клијента</label><select id="n-cl" class="inp"><option value="">— ручни унос —</option>${clients.map((c) => `<option value="${c.id}" ${st.cid === c.id ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('')}</select></div>
    <div class="field"><label for="n-kg">Тјелесна маса (kg)</label><input id="n-kg" class="inp" inputmode="decimal" value="${fmtNum(st.kg)}"></div>
    <div class="field"><label for="n-td">Дневна потрошња (kcal)</label><input id="n-td" class="inp" inputmode="numeric" value="${Math.round(st.tdee)}"></div>
  </div><p class="small muted" id="n-msg">Јеловници се прерачунавају на ову масу и потрошњу: протеинске намирнице по циљу протеина, остало по енергији. Потрошњу клијента апликација рачуна из профила (Mifflin-St Jeor × активност).</p></section>`;
}
function bindControls(box, clients, redraw) {
  box.querySelector('#n-kg').onchange = (e) => { const n = parseNum(e.target.value); if (n > 25 && n < 300) { st.kg = n; redraw(); } else e.target.classList.add('bad'); };
  box.querySelector('#n-td').onchange = (e) => { const n = parseNum(e.target.value); if (n > 800 && n < 7000) { st.tdee = n; redraw(); } else e.target.classList.add('bad'); };
  box.querySelector('#n-cl').onchange = async (e) => {
    st.cid = e.target.value;
    if (!st.cid) return redraw();
    const c = clients.find((x) => x.id === st.cid);
    const b = await clientTargetsBase(c);
    if (!b) { toast('За клијента недостаје пол, датум рођења, висина или мјерење масе — унесите ручно.', 'bad'); return; }
    st.kg = b.kg; st.tdee = Math.round(b.tdee); redraw();
  };
}

async function plansTab(box, clients) {
  const list = DIET_PLANS.filter((p) => p.cat === st.cat && (!st.goal || p.goal === st.goal));
  box.innerHTML = `${await controlsHtml(clients)}
    <div class="seg">${DIET_CATS.map(([k, v]) => `<button data-cat="${k}" class="${st.cat === k ? 'on' : ''}">${v} (${DIET_PLANS.filter((p) => p.cat === k).length})</button>`).join('')}</div>
    <div class="chips"><button class="qchip ${!st.goal ? 'on' : ''}" data-goal="">Сви циљеви</button>${Object.entries(DIET_GOALS).map(([k, v]) => `<button class="qchip ${st.goal === k ? 'on' : ''}" data-goal="${k}">${v}</button>`).join('')}</div>
    ${(await Promise.all(list.map(async (p) => { const t = await targetFor(p); return `<details class="card pad">
      <summary style="cursor:pointer;list-style:none"><div class="row between" style="align-items:flex-start;gap:8px"><div class="grow"><h3 style="margin:0">${esc(p.name)}</h3><div class="small muted" style="margin-top:4px">${t ? `за ${fmtNum(st.kg)} kg: <b>${r0(t.kcal)} kcal</b>, <b>${t.protein} g протеина</b>` : ''}</div></div><span class="small muted">детаљи ▾</span></div></summary>
      <div class="stack" style="margin-top:12px">${planInfoHtml(p)}<div class="lbl">Примјер дана (прилагођен)</div>${menuHtml(p, t)}</div></details>`; }))).join('') || '<p class="empty card">Нема плана за овај избор.</p>'}`;
  bindControls(box, clients, () => plansTab(box, clients));
  box.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { st.cat = b.dataset.cat; plansTab(box, clients); }));
  box.querySelectorAll('[data-goal]').forEach((b) => (b.onclick = () => { st.goal = b.dataset.goal; plansTab(box, clients); }));
}

function suppTab(box) {
  box.innerHTML = `<div class="banner info small"><div>Редослијед: прво сан, исхрана и тренинг, па тек онда суплементи. Ниво доказа: ${Object.values(EVIDENCE).map((e) => `<span class="chip ${e.tone}">${e.label}</span>`).join(' ')}</div></div>
    ${Object.keys(EVIDENCE).map((k) => { const l = SUPPLEMENTS.filter((s) => s.ev === k); return l.length ? `<div><div class="lbl" style="margin:6px 0">${EVIDENCE[k].label} — ${esc(EVIDENCE[k].desc)}</div><div class="stack" style="gap:8px">${l.map(supplementHtml).join('')}</div></div>` : ''; }).join('')}
    <section class="card pad"><h3>Клијенти на терапији за штитну жлијезду (Хашимото, хипотиреоза)</h3><ul class="find">${THYROID_NOTES.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
}

function foodsTab(box) {
  const draw = () => {
    const l = FOODS.filter((f) => st.fast === '' || f.fast <= Number(st.fast));
    box.innerHTML = `<div class="chips"><button class="qchip ${st.fast === '' ? 'on' : ''}" data-f="">Све</button>${Object.entries(FAST_LEVELS).slice(0, 3).map(([k, v]) => `<button class="qchip ${st.fast === k ? 'on' : ''}" data-f="${k}">${v}</button>`).join('')}</div>
      ${Object.entries(FOOD_GROUPS).map(([g, gn]) => { const x = l.filter((f) => f.group === g); return x.length ? `<section class="card pad"><h3>${gn}</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Намирница (100 g)</th><th class="r">kcal</th><th class="r">П</th><th class="r">УХ</th><th class="r">М</th><th>Пост</th></tr></thead><tbody>
        ${x.map((f) => `<tr><td>${esc(f.name)}</td><td class="r num">${f.kcal}</td><td class="r num">${fmtNum(f.p)}</td><td class="r num">${fmtNum(f.c)}</td><td class="r num">${fmtNum(f.f)}</td><td class="small">${esc(FAST_LEVELS[f.fast])}</td></tr>`).join('')}</tbody></table></div></section>` : ''; }).join('')}
      <p class="small muted">Пост на уљу дозвољава и уље, орашасте плодове и бескичмењаке из мора (лигње, шкампи); праксе се разликују по крају и по савјету свештеника — ово је оријентација.</p>`;
    box.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.fast = b.dataset.f; draw(); }));
  };
  draw();
}

async function handTab(box, clients) {
  const t = { kcal: st.tdee, protein: Math.round(st.kg * 1.8) };
  box.innerHTML = `${await controlsHtml(clients)}<section class="card pad stack"><h3>Мјере руком — без ваге</h3>
    <p class="small">За клијенте који не желе да мјере храну. Рука расте са тијелом, па су порције природно прилагођене. Рачунато за ${r0(t.kcal)} kcal и ${t.protein} g протеина (1,8 g/kg); за мршављење смањити угљене хидрате и масти за по пола мјере, за масу додати.</p>
    ${handHtml(t, 4)}
    <ul class="find small"><li>Сваки оброк почети протеином и поврћем — ситост и мање преједања.</li><li>Ако тјелесна маса стоји 2–3 седмице, а циљ је губитак: уклонити пола шаке угљених хидрата или палац масти из 1–2 оброка.</li><li>За раст мишића: ако маса не расте 2 седмице, додати шаку угљених хидрата и палац масти дневно.</li></ul></section>`;
  bindControls(box, clients, () => handTab(box, clients));
}
