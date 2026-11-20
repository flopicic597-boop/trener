// Картица „Састав тијела“: % масти више метода, мишићна маса, FFMI; чување као мјерење.
import { repo, save, toast } from '../core.js';
import { esc, fmtNum, fmtDate, parseNum, today, isValidDate } from '../../lib/util.js';
import { ageAt } from '../../domain/assessment.js';
import { bodyComposition, MUSCLE_METHOD } from '../../domain/bodycomp.js';
import { clientCurrent } from './plan.js';
import { clientForm } from './clients.js';

// поље → [параметар у мјерењима, ознака, јединица, само за пол]
const FIELDS = [
  ['weightKg', 'tezina', 'Тјелесна маса', 'kg'],
  ['waistCm', 'struk', 'Обим струка', 'cm', null, 'Мушкарци: у висини пупка; жене: најужи дио'],
  ['neckCm', 'vrat', 'Обим врата', 'cm', null, 'Испод гркљана, трака благо нагнута надоље напријед'],
  ['hipCm', 'kukovi', 'Обим кукова', 'cm', 'f', 'Најшири дио седалног предјела'],
  ['armCm', 'nadlaktica', 'Обим надлактице', 'cm', null, 'Опуштена рука, средина између рамена и лакта'],
  ['thighCm', 'butina', 'Обим бутине', 'cm', null, 'Средина бутине'],
  ['calfCm', 'potkoljenica', 'Обим потколенице', 'cm', null, 'Најшири дио'],
  ['tricepsMm', 'sf_triceps', 'Набор: трицепс', 'mm'],
  ['thighMm', 'sf_thigh', 'Набор: бутина', 'mm'],
  ['calfMm', 'sf_calf', 'Набор: потколеница', 'mm'],
  ['scalePct', 'mast', 'Маст са ваге (биоимпеданца)', '%', null, 'Опционо, ако клијент има вагу/InBody'],
  ['scaleMuscleKg', 'misici', 'Мишићи са ваге', 'kg', null, 'Опционо (скелетна мишићна маса)'],
];

export async function renderClientBodyComp(root, c0) {
  const c = await repo.getClient(c0.id);
  const cur = await clientCurrent(c);
  const day = today();
  const v = {}, from = {}, touched = new Set();
  for (const [k, pid] of FIELDS) { const x = cur.last(pid); v[k] = x ? x.value : null; from[k] = x ? x.date : null; }
  const cal = cur.last('mast@caliper');
  const draw = () => {
    const age = ageAt(c.birthDate, day);
    const missing = [!c.sex && 'пол', age === null && 'датум рођења', !c.heightCm && 'висина'].filter(Boolean);
    root.innerHTML = `<div class="stack">
      ${missing.length ? `<div class="banner info"><div style="flex:1">За прорачун недостаје у профилу: <b>${missing.join(', ')}</b>.</div><button class="btn sm" id="bc-edit">Допуни профил</button></div>` : ''}
      <div class="grid2" style="align-items:start">
        <section class="card pad stack"><h3>Мјере</h3>
          <p class="small muted">Попуњено из посљедњих мјерења (датум испод поља); чувају се само мјере које сада унесете или измијените, а прорачун увијек. Довољни су маса, струк и врат (жене и кукови); за мишићну масу тачније је са обимима и наборима руке, бутине и потколенице.</p>
          <div class="fgrid">
            <div class="field"><label for="bc-date">Датум</label><input id="bc-date" class="inp" type="date" value="${day}"></div>
            ${FIELDS.filter((f) => !f[4] || f[4] === c.sex).map(([k, , name, unit, , hint]) => `<div class="field"><label for="bc-${k}">${esc(name)} (${unit})</label><input id="bc-${k}" data-k="${k}" class="inp" inputmode="decimal" value="${v[k] === null ? '' : fmtNum(v[k])}">${from[k] ? `<small class="muted" data-from="${k}">из мјерења ${fmtDate(from[k])}</small>` : ''}${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</div>`).join('')}
          </div>
          ${cal ? `<p class="small muted">Посљедњи калипер: ${fmtNum(cal.value, 1)} % (${fmtDate(cal.date)}) — улази у поређење.</p>` : ''}
          <div class="row"><button class="btn primary" id="bc-save">Сачувај као мјерење</button></div><p class="err" id="bc-err"></p>
        </section>
        <section class="card pad stack" id="bc-res"></section>
      </div></div>`;
    const pe = root.querySelector('#bc-edit'); if (pe) pe.onclick = () => clientForm(c, () => renderClientBodyComp(root, c0));
    root.querySelectorAll('[data-k]').forEach((i) => (i.oninput = () => { const n = parseNum(i.value); i.classList.toggle('bad', Number.isNaN(n)); v[i.dataset.k] = Number.isNaN(n) ? null : n; touched.add(i.dataset.k); root.querySelector(`[data-from="${i.dataset.k}"]`)?.remove(); result(); }));
    root.querySelector('#bc-save').onclick = saveIt;
    result();
  };
  const input = () => ({ ...v, sex: c.sex, age: ageAt(c.birthDate, root.querySelector('#bc-date')?.value || day), heightCm: c.heightCm, caliperPct: cal?.value ?? null });
  let R = null;
  const result = () => {
    R = bodyComposition(input());
    const box = root.querySelector('#bc-res');
    box.innerHTML = `<h3>Резултат</h3>
      ${R.best ? `<div class="cmp">
        <div class="c"><div class="lbl">Тјелесна маст</div><div class="v">${fmtNum(R.fatPct, 1)} %</div><div class="small muted">${esc(R.best.name)}</div></div>
        ${R.cls ? `<div class="c"><div class="lbl">Категорија</div><div class="v" style="font-size:1.1rem"><span class="chip ${R.cls.tone}">${esc(R.cls.label)}</span></div></div>` : ''}
        ${R.fatKg !== null ? `<div class="c"><div class="lbl">Маса масти</div><div class="v">${fmtNum(R.fatKg, 1)}</div><div class="small muted">kg</div></div>
        <div class="c"><div class="lbl">Немасна маса</div><div class="v">${fmtNum(R.leanKg, 1)}</div><div class="small muted">kg (мишићи, кости, вода, органи)</div></div>` : ''}
        ${R.muscleKg !== null ? `<div class="c"><div class="lbl">Скелетни мишићи</div><div class="v">${fmtNum(R.muscleKg, 1)}</div><div class="small muted">kg${R.musclePct !== null ? ` · ${fmtNum(R.musclePct, 1)} % масе` : ''}</div></div>` : ''}
        ${R.ffmi ? `<div class="c"><div class="lbl">FFMI</div><div class="v">${fmtNum(R.ffmi.normalized, 1)}</div><div class="small muted">kg/m² (нормализовано)</div></div>` : ''}
      </div>
      <div class="lbl">Поређење метода</div>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Метод</th><th class="r">% масти</th><th>Напомена</th></tr></thead><tbody>
        ${R.methods.map((m, i) => `<tr><td>${i === 0 ? '<b>' : ''}${esc(m.name)}${i === 0 ? '</b>' : ''}</td><td class="r num">${fmtNum(m.pct, 1)}</td><td class="small muted">${esc(m.note)}</td></tr>`).join('')}
      </tbody></table></div>
      ${R.muscle ? `<p class="small muted">Мишићна маса: ${esc(MUSCLE_METHOD[R.muscle.method])}.${R.muscle.method === 'lee-simple' ? ' За тачнију процјену унесите обиме и наборе руке, бутине и потколенице.' : ''}</p>` : ''}`
      : '<p class="muted small">Унесите бар тјелесну масу, струк и врат (жене и кукове), уз пол, датум рођења и висину у профилу.</p>'}
      <details><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Како тумачити</summary><ul class="find small">
        <li>Различите методе дају различите бројеве; важно је мјерити <b>увијек истом методом</b>, у исто доба дана, и пратити тренд.</li>
        <li>Обими (метод морнарице) и RFM имају грешку око ±3–4 % масти у односу на DEXA; калипер у искусним рукама ±3 %.</li>
        <li>Вага са биоимпеданцом јако зависи од воде у тијелу — мјерити ујутро, послије тоалета, прије доручка и тренинга.</li>
        <li>FFMI изнад око 25 код мушкараца (21–22 код жена) риједак је без изузетне генетике или анаболика; добар је показатељ напретка у хипертрофији.</li>
        <li>Скелетни мишићи су око 40–50 % масе код мушкараца и 30–40 % код жена нормалне ухрањености.</li>
      </ul></details>`;
  };
  async function saveIt() {
    const date = root.querySelector('#bc-date').value;
    const err = root.querySelector('#bc-err');
    if (!isValidDate(date)) { err.textContent = 'Неисправан датум.'; return; }
    if (!R?.best && !R?.muscle) { err.textContent = 'Нема резултата за чување.'; return; }
    const values = [];
    const put = (paramId, value, method, computed) => { if (value !== null && value !== undefined && Number.isFinite(value)) values.push({ paramId, value: Math.round(value * 10) / 10, ...(method ? { method } : {}), ...(computed ? { computed: 1 } : {}) }); };
    for (const [k, pid] of FIELDS) if (touched.has(k)) put(pid, v[k]); // само нове/измијењене мјере
    for (const m of R.methods) if (['navy', 'rfm'].includes(m.id)) put('mast', m.pct, m.id, true);
    if (R.muscle && R.muscle.method !== 'bia') put('misici', R.muscle.kg, R.muscle.method, true);
    put('misiciPct', R.musclePct, null, true);
    put('ffmi', R.ffmi?.normalized ?? null, null, true);
    if (R.fatKg !== null) { put('masaMasti', R.fatKg, null, true); put('lbm', R.leanKg, null, true); }
    const ok = await save(() => repo.saveFinding({ clientId: c.id, date, kind: 'body', title: 'Састав тијела', values, note: R.best ? `Препоручена процјена масти: ${R.best.name}, ${fmtNum(R.fatPct, 1)} %.` : '' }));
    if (ok) { toast('Мјерење састава тијела је сачувано (картица Мјерења и налази).'); renderClientBodyComp(root, c0); }
  }
  draw();
}
