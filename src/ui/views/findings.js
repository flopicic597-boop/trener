// Налази и анализе: списак по клијенту, поређење и напомене, уређивање налаза са прилозима.
import { repo, save, queueSave, flushSaves, confirmDlg, toast, openModal, closeModal, fullName } from '../core.js';
import { esc, fmtDate, fmtNum, parseNum, today, isValidDate, uid } from '../../lib/util.js';
import { FINDING_KINDS, PARAMS, PARAM, parseFindingText, compareFindings, buildNotes, paramSeries, paramKey, paramName, effRef, refStatus } from '../../domain/findings.js';
import { lineChart, dataTable, chartCard, bindChartToggles } from '../../charts/charts.js';
import { PROTOCOLS, SITES, caliperResult, avgSite, ageAt, bmi, whr, whtr, whrLimit } from '../../domain/assessment.js';

const KIND_CHIP = { body: 'accent', caliper: 'accent', lab: 'warn', fitness: 'ok', posture: 'ok', photos: 'muted', other: 'muted' };
const VERDICT = { better: ['▲ боље', 'up'], worse: ['▼ лошије', 'down'], same: ['= исто', 'same'], neutral: ['—', 'same'] };
const REF_LBL = { low: ['испод опсега', 'bad'], high: ['изнад опсега', 'bad'], ok: ['у опсегу', 'ok'] };
const fmtRef = (r) => (!r || (r.min === null && r.max === null) ? '—' : r.min !== null && r.max !== null ? `${fmtNum(r.min)}–${fmtNum(r.max)}` : r.min !== null ? `> ${fmtNum(r.min)}` : `< ${fmtNum(r.max)}`);
const fmtSize = (b) => (b > 1048576 ? fmtNum(b / 1048576, 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const st = { from: '', to: '', param: '', cid: null, pa: '', pb: '' };

/* ------------------------------------------------------------------ */
/* Картица „Налази“ на профилу клијента                                 */
/* ------------------------------------------------------------------ */
export async function renderClientFindings(root, c) {
  if (st.cid !== c.id) Object.assign(st, { from: '', to: '', param: '', cid: c.id });
  const [findings, atts] = await Promise.all([repo.listFindings({ clientId: c.id }), repo.listAttachments({ clientId: c.id })]);
  const attN = new Map(); for (const a of atts) attN.set(a.findingId, (attN.get(a.findingId) || 0) + 1);
  const withVals = findings.filter((f) => (f.values || []).some((v) => v.value !== null && v.value !== undefined));
  if (st.from && !findings.some((f) => f.id === st.from)) st.from = '';
  if (st.to && !findings.some((f) => f.id === st.to)) st.to = '';
  const pair = st.from && st.to && st.from !== st.to;
  const rows = compareFindings(findings, { goal: c.goal, ...(pair ? { fromId: st.from, toId: st.to } : {}) });
  const notes = buildNotes(rows, (n) => fmtNum(n));
  const series = paramSeries(findings);
  const keys = [...series.keys()];
  if (!st.param || !series.has(st.param)) st.param = keys.find((k) => series.get(k).length > 1) || keys[0] || '';
  const label = (f) => `${fmtDate(f.date)} · ${f.title || FINDING_KINDS[f.kind]}`;

  root.innerHTML = `<div class="stack">
    <div class="row between"><p class="small muted" style="max-width:640px">Налази, мјерења тијела и тестови кондиције. Приложите документ (PDF, слика) са уређаја, а вриједности унесите или их апликација прочита из PDF-а/текста. Све остаје на уређају и преноси се резервном копијом.</p>
      <button class="btn primary big" data-new>+ Нови налаз</button></div>
    <section class="card">
      <div class="pad"><h3>Налази (${findings.length})</h3></div>
      <div class="list">${findings.length ? findings.map((f) => `<a class="litem" href="#/nalaz/${f.id}">
        <div class="grow"><b>${fmtDate(f.date)} · ${esc(f.title || FINDING_KINDS[f.kind])}</b>
          <small>${(f.values || []).length} вриједности${attN.get(f.id) ? ` · прилога: ${attN.get(f.id)}` : ''}${f.note ? ' · ' + esc(f.note) : ''}</small></div>
        <span class="chip ${KIND_CHIP[f.kind]}">${FINDING_KINDS[f.kind]}</span></a>`).join('') : '<p class="empty">Још нема налаза. Додајте први дугметом „Нови налаз“.</p>'}</div>
    </section>

    <div id="photocmp"></div>

    ${withVals.length ? `<section class="card pad stack">
      <div class="row between"><h3>Поређење</h3>
        <div class="row"><div class="field"><label for="cmp-a">Од</label><select id="cmp-a" class="inp"><option value="">Претходна вриједност</option>${withVals.map((f) => `<option value="${f.id}" ${st.from === f.id ? 'selected' : ''}>${esc(label(f))}</option>`).join('')}</select></div>
          <div class="field"><label for="cmp-b">До</label><select id="cmp-b" class="inp"><option value="">Посљедња вриједност</option>${withVals.map((f) => `<option value="${f.id}" ${st.to === f.id ? 'selected' : ''}>${esc(label(f))}</option>`).join('')}</select></div></div></div>
      <p class="small muted">${pair ? 'Пореде се вриједности из два изабрана налаза.' : 'За сваки параметар посљедња измјерена вриједност се пореди са претходном (из било ког ранијег налаза).'} Смјер „боље/лошије“ за тјелесну масу зависи од циља клијента (${esc(c.goal || 'циљ није унесен')}).</p>
      ${rows.length ? `<div class="tscroll"><table class="tbl"><thead><tr><th>Параметар</th><th class="r">Претходно</th><th class="r">Посљедње</th><th class="r">Промјена</th><th class="r">Опсег</th><th>Оцјена</th></tr></thead><tbody>
        ${rows.map((r) => { const v = VERDICT[r.verdict], rf = REF_LBL[r.refStatus]; return `<tr>
          <td><b>${esc(r.name)}</b>${r.unit ? ` <span class="small muted">${esc(r.unit)}</span>` : ''}</td>
          <td class="r num">${r.prev ? `${fmtNum(r.prev.value)}<br><span class="small muted">${fmtDate(r.prev.date)}</span>` : '—'}</td>
          <td class="r num">${fmtNum(r.cur.value)}<br><span class="small muted">${fmtDate(r.cur.date)}</span></td>
          <td class="r num ${v[1]}">${r.delta !== null ? (r.delta > 0 ? '+' : '') + fmtNum(r.delta) : r.unitChanged ? '<span class="small">друга јединица</span>' : '—'}</td>
          <td class="r num small">${fmtRef(r.ref)}${r.ref && !r.ref.own && (r.ref.min !== null || r.ref.max !== null) ? '*' : ''}</td>
          <td><span class="${v[1]}"><b>${v[0]}</b></span>${rf ? ` <span class="chip ${rf[1]}">${rf[0]}</span>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div><p class="small muted">* оријентациони опсег за одрасле — ако је на налазу наведен опсег лабораторије, унесите га у налаз и користиће се он.</p>` : '<p class="empty">Изабрани налази немају заједничких вриједности.</p>'}
    </section>` : ''}

    <div class="grid2" style="align-items:start">
      <section class="card pad stack"><h3>Шта се поправило</h3>
        ${notes.improved.length ? `<ul class="find">${notes.improved.map((t) => `<li class="up">▲ ${esc(t)}</li>`).join('')}</ul>` : '<p class="muted small">Нема упоредивих побољшања (потребна су бар два мјерења истог параметра).</p>'}</section>
      <section class="card pad stack"><h3>На чему треба радити</h3>
        ${notes.toWork.length ? `<ul class="find">${notes.toWork.map((t) => `<li class="down">▼ ${esc(t)}</li>`).join('')}</ul>` : '<p class="muted small">Нема погоршања ни вриједности ван опсега.</p>'}</section>
    </div>
    <section class="card pad stack"><h3>Напомене за рад</h3>
      ${notes.medical ? '<div class="banner bad small"><div><b>Неке лабораторијске/медицинске вриједности су ван опсега.</b> Упутите клијента љекару прије повећања интензитета. Апликација не поставља дијагнозу.</div></div>' : ''}
      ${notes.notes.length ? `<ul class="find">${notes.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted small">Нема посебних напомена. Наставите по плану и поновите мјерење за 4–8 седмица.</p>'}
      <p class="small muted">Напомене су опште смјернице за тренинг на основу унесених вриједности, не медицински савјет.</p>
    </section>

    ${keys.length ? chartCard('fparam', 'Кретање параметра',
      lineChart([{ name: paramNameOf(series, st.param), points: (series.get(st.param) || []).map((p) => ({ x: p.date, y: p.value })) }], { label: paramNameOf(series, st.param) }),
      dataTable(['Датум', 'Вриједност', 'Јединица', 'Опсег'], (series.get(st.param) || []).map((p) => [fmtDate(p.date), fmtNum(p.value), p.unit, fmtRef(p.ref)])),
      `<div class="field"><label for="fpar">Параметар</label><select id="fpar" class="inp">${keys.map((k) => `<option value="${esc(k)}" ${k === st.param ? 'selected' : ''}>${esc(paramNameOf(series, k))} (${series.get(k).length})</option>`).join('')}</select></div>`) : ''}
  </div>`;

  const re = () => renderClientFindings(root, c);
  root.querySelector('[data-new]').onclick = () => newFindingDialog(c);
  const a = root.querySelector('#cmp-a'), b = root.querySelector('#cmp-b');
  if (a) a.onchange = () => { st.from = a.value; re(); };
  if (b) b.onchange = () => { st.to = b.value; re(); };
  const fp = root.querySelector('#fpar');
  if (fp) fp.onchange = () => { st.param = fp.value; re(); };
  bindChartToggles(root);
  drawPhotoCompare(root.querySelector('#photocmp'), findings, atts);
}

/** Двије фотографије напретка једна поред друге, по погледу (напријед/бочно/назад) */
async function drawPhotoCompare(box, findings, atts) {
  const photoF = findings.filter((f) => f.kind === 'photos' && atts.some((a) => a.findingId === f.id && a.mime.startsWith('image/'))).sort((a, b) => a.date.localeCompare(b.date));
  if (!photoF.length) { box.innerHTML = ''; return; }
  if (!photoF.some((f) => f.id === st.pa)) st.pa = photoF[0].id;
  if (!photoF.some((f) => f.id === st.pb)) st.pb = photoF[photoF.length - 1].id;
  const opt = (sel) => photoF.map((f) => `<option value="${f.id}" ${sel === f.id ? 'selected' : ''}>${fmtDate(f.date)}${f.title ? ' · ' + esc(f.title) : ''}</option>`).join('');
  const pick = (fid, view) => atts.find((a) => a.findingId === fid && a.mime.startsWith('image/') && (a.note || 'other') === view);
  const views = Object.keys(VIEWS).filter((v) => pick(st.pa, v) || pick(st.pb, v));
  box.innerHTML = `<section class="card pad stack"><div class="row between"><h3>Фотографије напретка</h3>
      <div class="row"><select class="inp" id="pa" style="width:auto">${opt(st.pa)}</select><span>→</span><select class="inp" id="pb" style="width:auto">${opt(st.pb)}</select></div></div>
    ${views.map((v) => `<div><div class="lbl" style="margin-bottom:6px">${VIEWS[v]}</div><div class="grid2">${[st.pa, st.pb].map((fid) => { const a = pick(fid, v); return a ? `<img data-img="${a.id}" alt="${esc(VIEWS[v])}" style="width:100%;max-height:520px;object-fit:contain;border-radius:12px;background:var(--surface-2)">` : '<p class="empty card">Нема фотографије</p>'; }).join('')}</div></div>`).join('')}
  </section>`;
  for (const img of box.querySelectorAll('[data-img]')) repo.getAttachment(img.dataset.img).then((a) => { if (a) img.src = a.data; });
  box.querySelector('#pa').onchange = (e) => { st.pa = e.target.value; drawPhotoCompare(box, findings, atts); };
  box.querySelector('#pb').onchange = (e) => { st.pb = e.target.value; drawPhotoCompare(box, findings, atts); };
}
const paramNameOf = (series, k) => (series.get(k)?.[0]?.name || '?');

function newFindingDialog(c) {
  const m = openModal({
    title: `Нови налаз · ${fullName(c)}`,
    body: `<div class="stack"><div class="field"><label for="nf-date">Датум налаза / мјерења</label><input id="nf-date" class="inp" type="date" value="${today()}"></div>
      <span class="lbl">Врста</span><div class="stack">${Object.entries(FINDING_KINDS).map(([k, v]) => `<button class="btn big" data-kind="${k}" style="justify-content:flex-start">${v}</button>`).join('')}</div>
      <p class="err" id="nferr"></p></div>`,
  });
  m.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = async () => {
    const date = m.querySelector('#nf-date').value;
    if (!isValidDate(date)) { m.querySelector('#nferr').textContent = 'Изаберите датум.'; return; }
    const f = await save(() => repo.saveFinding({ clientId: c.id, date, kind: b.dataset.kind, title: '', values: [] }));
    if (f) { closeModal(); location.hash = `#/nalaz/${f.id}`; }
  }));
}

/* ------------------------------------------------------------------ */
/* Уређивање налаза                                                    */
/* ------------------------------------------------------------------ */
const QUICK = { body: ['tezina', 'mast', 'misici', 'struk', 'kukovi', 'grudi', 'nadlaktica', 'butina', 'puls', 'pritisakS', 'pritisakD'], fitness: ['vo2', 'sklekovi', 'cucnjevi', 'plank', 'pretklon'], lab: ['glukoza', 'holesterol', 'ldl', 'hdl', 'trigliceridi', 'hemoglobin', 'vitd', 'feritin'], posture: ['mob_cucanj', 'mob_iskorak', 'mob_ramena', 'mob_kuk', 'mob_trup'], caliper: ['tezina'], photos: [], other: [] };
export const POSTURE = {
  glava: 'Глава испружена напријед', ramena: 'Заобљена рамена', kifoza: 'Појачана грудна кривина (кифоза)', lordoza: 'Појачана слабинска кривина (лордоза)',
  karlica: 'Нагнута карлица (лијево/десно)', skolioza: 'Бочно искривљење кичме', asimetrija: 'Неједнака висина рамена', valgus: 'Кољена ка унутра (валгус)', stopala: 'Спуштени свод стопала',
};
export const VIEWS = { front: 'Напријед', side: 'Бочно', back: 'Назад', other: 'Друго' };

/** Изведене вриједности (израчунато, означено): BMI, WHR, WHtR и резултат калипера */
export function applyDerived(F, c) {
  const plain = (pid) => F.values.find((v) => v.paramId === pid && !v.computed && v.value !== null && v.value !== undefined)?.value ?? null;
  const set = (pid, value, extra = {}) => {
    const i = F.values.findIndex((v) => v.paramId === pid && v.computed && (v.method || '') === (extra.method || ''));
    if (value === null || value === undefined || !Number.isFinite(value)) { if (i >= 0) F.values.splice(i, 1); return; }
    if (!extra.method && F.values.some((v) => v.paramId === pid && !v.computed)) { if (i >= 0) F.values.splice(i, 1); return; } // ручни унос има предност
    const rec = { paramId: pid, name: PARAM[pid].name, unit: PARAM[pid].unit, value: Math.round(value * 1000) / 1000, refMin: null, refMax: null, computed: 1, ...extra };
    if (i >= 0) Object.assign(F.values[i], rec); else F.values.push({ id: uid(), ...rec });
  };
  if (F.kind === 'caliper' && F.caliper) {
    const k = F.caliper, sex = c.sex, age = ageAt(c.birthDate, F.date);
    const sitesMm = {}; for (const [site, arr] of Object.entries(k.sites || {})) sitesMm[site] = avgSite(arr);
    const r = caliperResult({ protocol: k.protocol, sex, age, sitesMm, weightKg: k.weightKg });
    const M = { method: 'caliper' };
    for (const site of Object.keys(SITES)) set('sf_' + site, PROTOCOLS[k.protocol]?.sites[sex]?.includes(site) ? sitesMm[site] : null, M);
    set('sumaNabora', r ? r.sum : null, M); set('mast', r ? r.fatPct : null, M); set('masaMasti', r ? r.fatKg : null, M); set('lbm', r ? r.leanKg : null, M); set('tezina', k.weightKg || null);
  }
  const w = plain('tezina') ?? F.values.find((v) => v.paramId === 'tezina')?.value ?? null, waist = plain('struk'), hip = plain('kukovi');
  set('bmi', bmi(w, c.heightCm), { refMin: 18.5, refMax: 24.9 });
  set('whr', whr(waist, hip), { refMax: whrLimit(c.sex) });
  set('whtr', whtr(waist, c.heightCm), { refMax: 0.5 });
}
const GROUPS = [['body', 'Тијело'], ['fitness', 'Кондиција'], ['lab', 'Лабораторија']];

export async function renderEditor(main, [id]) {
  const F = await repo.getFinding(id);
  if (!F) { main.innerHTML = '<div class="wrap"><p class="empty card">Налаз није пронађен.</p></div>'; return; }
  const c = await repo.getClient(F.clientId);
  F.values = F.values || [];
  const queue = () => { applyDerived(F, c); queueSave('finding:' + F.id, () => repo.saveFinding(F)); };

  main.innerHTML = `<div class="wrap">
    <a href="#/klijent/${F.clientId}/nalazi" class="muted" style="text-decoration:none">← ${esc(fullName(c))} · налази</a>
    <div class="card pad stack">
      <div class="row between"><h1>Налаз</h1><button class="btn danger" data-del>Обриши налаз</button></div>
      <div class="fgrid">
        <div class="field"><label for="f-date">Датум</label><input id="f-date" class="inp" type="date" value="${esc(F.date)}"></div>
        <div class="field"><label for="f-kind">Врста</label><select id="f-kind" class="inp">${Object.entries(FINDING_KINDS).map(([k, v]) => `<option value="${k}" ${F.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field full"><label for="f-title">Назив (необавезно)</label><input id="f-title" class="inp" value="${esc(F.title || '')}" placeholder="нпр. Крвна слика, InBody, Иницијално тестирање" autocomplete="off"></div>
        <div class="field full"><label for="f-note">Напомена (необавезно)</label><textarea id="f-note" class="inp">${esc(F.note || '')}</textarea></div>
      </div>
    </div>

    <div id="special"></div>

    <section class="card pad stack">
      <h2>Документ налаза</h2>
      <p class="small muted">Приложите PDF или слику налаза из фасцикле Преузимања (Download) или Мојих датотека. Датотека се чува у апликацији на овом уређају (највише 15 MB по датотеци) и улази у резервну копију.</p>
      <div class="row"><label class="btn primary big" style="cursor:pointer">Приложи датотеку<input type="file" data-file multiple hidden accept="application/pdf,.pdf,image/*,.txt,text/plain"></label></div>
      <div id="atts"></div>
    </section>

    <section class="card pad stack">
      <h2>Текст налаза</h2>
      <p class="small muted">Ако PDF нема текст (скениран је) или је налаз у другом облику, отворите га, копирајте текст и залијепите овдје. Апликација препознаје познате параметре (нпр. глукоза, холестерол, тјелесна маса, % масти) и нуди их за унос — провјерите их прије додавања.</p>
      <textarea id="f-text" class="inp" style="min-height:120px" placeholder="Залијепите текст налаза…">${esc(F.text || '')}</textarea>
      <div class="row"><button class="btn" data-parse>Препознај вриједности из текста</button></div>
    </section>

    <section class="card pad stack">
      <div class="row between"><h2>Вриједности</h2><button class="btn" data-add>+ Додај параметар</button></div>
      <div class="row small" id="quick"></div>
      <div id="vals"></div>
      <p class="small muted">Унесите референтни опсег са налаза ако га лабораторија наводи — тада се оцјена „у опсегу / ван опсега“ ради по њему. Без опсега се користи оријентациони опсег за одрасле (означен *).</p>
    </section>
  </div>`;
  const $ = (s) => main.querySelector(s);

  $('#f-date').onchange = () => { if (isValidDate($('#f-date').value)) { F.date = $('#f-date').value; queue(); } };
  $('#f-kind').onchange = () => { F.kind = $('#f-kind').value; queue(); drawQuick(); drawSpecial(); drawVals(); };
  $('#f-title').oninput = () => { F.title = $('#f-title').value; queue(); };
  $('#f-note').oninput = () => { F.note = $('#f-note').value; queue(); };
  $('#f-text').oninput = () => { F.text = $('#f-text').value; queue(); };
  $('[data-del]').onclick = async () => {
    if (!(await confirmDlg('Обрисати овај налаз заједно са приложеним датотекама? Брисање се преноси и на други уређај при увозу.', { okText: 'Обриши', danger: true }))) return;
    await flushSaves();
    if ((await save(() => repo.deleteFinding(F.id))) !== null) { toast('Налаз је обрисан.'); location.hash = `#/klijent/${F.clientId}/nalazi`; }
  };
  $('[data-parse]').onclick = () => offerParsed(parseFindingText($('#f-text').value), 'тексту');
  $('[data-add]').onclick = () => { F.values.push({ id: uid(), paramId: null, name: '', unit: '', value: null, refMin: null, refMax: null }); queue(); drawVals(true); };

  const drawQuick = () => {
    const have = new Set(F.values.map((v) => v.paramId));
    const q = (QUICK[F.kind] || []).filter((k) => !have.has(k));
    $('#quick').innerHTML = q.length ? `<span class="lbl">Брзо додај:</span> ${q.map((k) => `<button class="qchip" data-q="${k}">${esc(PARAM[k].name)}</button>`).join('')}` : '';
    main.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const p = PARAM[b.dataset.q]; F.values.push({ id: uid(), paramId: p.id, name: p.name, unit: p.unit, value: null, refMin: null, refMax: null }); queue(); drawVals(true); }));
  };

  const paramSelect = (v) => `<select class="inp" data-k="param">${GROUPS.map(([g, gl]) => `<optgroup label="${gl}">${PARAMS.filter((p) => p.kind === g).map((p) => `<option value="${p.id}" ${v.paramId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}<option value="" ${!v.paramId ? 'selected' : ''}>Друго (свој назив)…</option></select>`;
  const drawVals = (focusLast = false) => {
    $('#vals').innerHTML = F.values.length ? `<div class="stack">${F.values.map((v) => {
      if (v.computed) { const rs0 = REF_LBL[refStatus(v.value, effRef(v))]; return `<div class="card pad row between" style="background:var(--surface-2)"><span><b>${esc(paramName(v))}</b> <span class="chip accent">израчунато</span></span><span class="num"><b>${fmtNum(v.value, v.unit === '' ? 3 : 1)}</b> ${esc(v.unit || '')} ${rs0 ? `<span class="chip ${rs0[1]}">${rs0[0]}</span>` : ''}</span></div>`; }
      const rs = REF_LBL[refStatus(v.value, effRef(v))];
      const ref0 = effRef(v);
      return `<div class="card pad" data-row="${v.id}" style="background:var(--surface-2)"><div class="fgrid" style="align-items:end">
        <div class="field full"><label>Параметар</label>${paramSelect(v)}</div>
        ${!v.paramId ? `<div class="field full"><label>Назив параметра</label><input class="inp" data-k="name" value="${esc(v.name)}" autocomplete="off" placeholder="нпр. Обим листа"></div>` : ''}
        <div class="field"><label>Вриједност</label><input class="inp" data-k="value" inputmode="decimal" autocomplete="off" value="${v.value === null ? '' : fmtNum(v.value, 3)}"></div>
        <div class="field"><label>Јединица</label><input class="inp" data-k="unit" autocomplete="off" value="${esc(v.unit || '')}"></div>
        <div class="field"><label>Опсег од</label><input class="inp" data-k="refMin" inputmode="decimal" autocomplete="off" value="${v.refMin === null ? '' : fmtNum(v.refMin, 3)}" placeholder="${!ref0.own && ref0.min !== null ? fmtNum(ref0.min) + '*' : ''}"></div>
        <div class="field"><label>Опсег до</label><input class="inp" data-k="refMax" inputmode="decimal" autocomplete="off" value="${v.refMax === null ? '' : fmtNum(v.refMax, 3)}" placeholder="${!ref0.own && ref0.max !== null ? fmtNum(ref0.max) + '*' : ''}"></div>
        <div class="full row between">${rs ? `<span class="chip ${rs[1]}">${rs[0]}</span>` : '<span></span>'}<button class="btn sm danger" data-rm="${v.id}">Уклони</button></div>
      </div></div>`; }).join('')}</div>` : '<p class="empty">Још нема вриједности. Додајте параметар, изаберите из брзог избора или препознајте вриједности из PDF-а/текста.</p>';
    main.querySelectorAll('[data-row]').forEach((row) => {
      if (!row.querySelector('[data-rm]')) return;
      const v = F.values.find((x) => x.id === row.dataset.row);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        const k = inp.dataset.k;
        if (k === 'param') inp.onchange = () => { const p = PARAM[inp.value]; v.paramId = p ? p.id : null; v.name = p ? p.name : ''; if (p) v.unit = p.unit; queue(); drawVals(); drawQuick(); };
        else if (k === 'name' || k === 'unit') inp.oninput = () => { v[k] = inp.value; queue(); };
        else inp.oninput = () => {
          const n = parseNum(inp.value);
          if (Number.isNaN(n)) { inp.classList.add('bad'); return; }
          inp.classList.remove('bad'); v[k] = n; queue();
          const chip = row.querySelector('.chip'); const r = REF_LBL[refStatus(v.value, effRef(v))];
          if (chip && r) { chip.className = 'chip ' + r[1]; chip.textContent = r[0]; } else if (chip && !r) chip.remove();
        };
      });
      row.querySelector('[data-rm]').onclick = () => { F.values = F.values.filter((x) => x.id !== v.id); queue(); drawVals(); drawQuick(); };
    });
    if (focusLast) { const last = main.querySelector('[data-row]:last-child [data-k="value"]'); if (last) { last.scrollIntoView({ block: 'center' }); last.focus(); } }
  };

  /** Приказ препознатих вриједности са избором шта се додаје */
  const offerParsed = (found, src) => {
    if (!found.length) { toast(`У ${src} нису препознати познати параметри. Унесите вриједности ручно.`, 'bad'); return; }
    const m = openModal({
      title: `Препознато (${found.length})`, wide: true,
      body: `<p class="small">Провјерите вриједности прије додавања. Ако параметар већ постоји у налазу, замијениће се.</p>
        <div class="tscroll"><table class="tbl"><thead><tr><th></th><th>Параметар</th><th class="r">Вриједност</th><th>Јединица</th><th class="r">Опсег</th><th>Ред из налаза</th></tr></thead><tbody>
        ${found.map((v, i) => `<tr><td><input type="checkbox" data-i="${i}" checked style="width:24px;height:24px"></td><td><b>${esc(v.name)}</b></td><td class="r num">${fmtNum(v.value, 3)}</td><td>${esc(v.unit)}</td><td class="r num small">${fmtRef({ min: v.refMin, max: v.refMax })}</td><td class="small muted">${esc(v.line)}</td></tr>`).join('')}
        </tbody></table></div>`,
      foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="padd">Додај изабране</button>',
    });
    m.querySelector('#padd').onclick = () => {
      let n = 0;
      m.querySelectorAll('[data-i]:checked').forEach((cb) => {
        const v = found[Number(cb.dataset.i)];
        const ex = F.values.find((x) => paramKey(x) === paramKey(v));
        const rec = { paramId: v.paramId, name: v.name, unit: v.unit, value: v.value, refMin: v.refMin, refMax: v.refMax };
        if (ex) Object.assign(ex, rec); else F.values.push({ id: uid(), ...rec });
        n++;
      });
      closeModal(); queue(); drawVals(); drawQuick(); toast(`Додато вриједности: ${n}.`);
    };
  };

  /** Објашњење када се из PDF-а не могу аутоматски прочитати вриједности */
  const unreadable = (why, textOk = false) => openModal({
    title: 'Вриједности нису прочитане аутоматски',
    body: `<div class="stack"><p>${esc(why)}</p>
      <p><b>Шта можете урадити:</b></p>
      <ul class="find">
        <li>Унесите вриједности ручно: <b>+ Додај параметар</b> или брзи избор испод наслова „Вриједности“. Приложени PDF остаје сачуван уз налаз.</li>
        ${textOk ? '' : '<li>Отворите PDF у другом прегледачу (нпр. Google Drive или Chrome), означите текст табеле и копирајте га. Ако се копира читљив текст, залијепите га у поље <b>Текст налаза</b> и додирните <b>Препознај вриједности из текста</b>.</li><li>Затражите од лабораторије налаз у PDF облику послат е-поштом (такви PDF-ови обично имају исправан текст).</li>'}
      </ul></div>`,
    foot: '<button class="btn primary" data-close>У реду</button>',
  });

  /* ---------- прилози ---------- */
  const drawAtts = async () => {
    const list = await repo.listAttachments({ findingId: F.id });
    const box = $('#atts');
    if (!box) return;
    box.innerHTML = list.length ? `<div class="list">${list.map((a) => `<div class="litem" style="cursor:default;flex-wrap:wrap">
      ${a.mime.startsWith('image/') ? `<img data-thumb="${a.id}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:var(--surface-2)">` : `<div class="ava" style="font-size:13px">${a.mime === 'application/pdf' ? 'PDF' : 'DOK'}</div>`}
      <div class="grow"><b style="word-break:break-all">${esc(a.name)}</b><small>${fmtSize(a.size)} · додато ${fmtDate(a.createdAt.slice(0, 10))}</small></div>
      <div class="row">${a.mime === 'application/pdf' || a.mime.startsWith('text/') ? `<button class="btn sm primary" data-read="${a.id}">Прочитај вриједности</button>` : ''}
        <button class="btn sm" data-open="${a.id}">Отвори</button><button class="btn sm" data-dl="${a.id}">Сачувај</button><button class="btn sm danger" data-arm="${a.id}">Уклони</button></div></div>`).join('')}</div>` : '<p class="muted small">Нема приложених датотека.</p>';
    for (const img of box.querySelectorAll('[data-thumb]')) repo.getAttachment(img.dataset.thumb).then((a) => { if (a) img.src = a.data; });
    const blobOf = async (aid) => { const a = await repo.getAttachment(aid); return { a, blob: await (await fetch(a.data)).blob() }; };
    box.querySelectorAll('[data-open]').forEach((b) => (b.onclick = async () => {
      const { blob } = await blobOf(b.dataset.open);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) toast('Прегледач је блокирао отварање — користите „Сачувај“.', 'bad');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }));
    box.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = async () => {
      const { a, blob } = await blobOf(b.dataset.dl);
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a'); el.href = url; el.download = a.name; document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }));
    box.querySelectorAll('[data-arm]').forEach((b) => (b.onclick = async () => {
      const a = list.find((x) => x.id === b.dataset.arm);
      if (!(await confirmDlg(`Уклонити прилог „${esc(a.name)}“ из налаза? Оригинална датотека на уређају остаје.`, { okText: 'Уклони', danger: true }))) return;
      if ((await save(() => repo.deleteAttachment(a.id))) !== null) { toast('Прилог је уклоњен.'); drawAtts(); }
    }));
    box.querySelectorAll('[data-read]').forEach((b) => (b.onclick = async () => {
      const a = await repo.getAttachment(b.dataset.read);
      b.disabled = true; b.textContent = 'Читам…';
      try {
        const { pdfToText, isReadable } = await import('../pdftext.js');
        const text = a.mime === 'application/pdf' ? await pdfToText(a.data) : await (await fetch(a.data)).text();
        if (!text.trim()) return unreadable('Овај PDF не садржи текст — највјероватније је скениран или фотографисан налаз (слика).');
        if (!isReadable(text)) return unreadable('Текст у овом PDF-у је записан фонтом без исправне ознаке слова, па се умјесто слова добијају симболи.');
        // замијени ранији нечитљив текст (из старије верзије) новим, исправним
        if (!(F.text || '').trim() || !isReadable(F.text)) { F.text = text; $('#f-text').value = text; queue(); }
        const found = parseFindingText(text);
        if (!found.length) return unreadable('Текст је прочитан, али у њему нису пронађени називи анализа које апликација познаје. Текст је уписан у поље „Текст налаза“ — пошаљите га за допуну препознавања (без имена клијента).', true);
        offerParsed(found, 'датотеци');
      } catch (e) {
        console.error(e); toast('Датотеку није могуће прочитати: ' + (e?.message || e), 'bad');
      } finally { b.disabled = false; b.textContent = 'Прочитај вриједности'; }
    }));
  };
  $('[data-file]').onchange = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) { toast(`„${file.name}“ је већа од 15 MB и није додата.`, 'bad'); continue; }
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      if ((await save(() => repo.addAttachment({ findingId: F.id, name: file.name, mime, size: file.size, dataUrl }))) !== null) toast(`Додато: ${file.name}`);
    }
    drawAtts();
  };

  /* ---------- посебни дијелови: калипер, држање, фотографије ---------- */
  function drawSpecial() {
    const box = $('#special');
    if (F.kind === 'caliper') {
      F.caliper = F.caliper || { protocol: 'jp3', sites: {}, weightKg: null };
      const k = F.caliper, sex = c.sex, age = ageAt(c.birthDate, F.date);
      const sites = sex ? PROTOCOLS[k.protocol].sites[sex] : [];
      const sitesMm = {}; for (const st of sites) sitesMm[st] = avgSite(k.sites[st]);
      const r = sex ? caliperResult({ protocol: k.protocol, sex, age, sitesMm, weightKg: k.weightKg }) : null;
      box.innerHTML = `<section class="card pad stack"><h2>Калипер — кожни набори</h2>
        ${!sex || age === null ? '<div class="banner warn"><div>За прорачун су потребни <b>пол и датум рођења</b> клијента (профил → Измијени → Подаци за прорачуне).</div></div>' : ''}
        <div class="fgrid">
          <div class="field"><label for="k-prot">Протокол</label><select id="k-prot" class="inp">${Object.entries(PROTOCOLS).map(([id, p]) => `<option value="${id}" ${k.protocol === id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="field"><label for="k-w">Тјелесна маса (kg)</label><input id="k-w" class="inp" inputmode="decimal" value="${k.weightKg ? fmtNum(k.weightKg) : ''}" placeholder="за масу масти и LBM"></div>
        </div>
        <p class="small muted">Мјерите на десној страни тијела, 2–3 пута на сваком мјесту (апликација рачуна просјек). Унесите у милиметрима.</p>
        ${sites.length ? `<div class="tscroll"><table class="tbl"><thead><tr><th>Мјесто</th><th class="r">1. мјерење</th><th class="r">2.</th><th class="r">3.</th><th class="r">Просјек</th></tr></thead><tbody>
          ${sites.map((st) => `<tr><td>${esc(SITES[st])}</td>${[0, 1, 2].map((i) => `<td class="r"><input class="inp" style="width:80px;text-align:center" inputmode="decimal" data-site="${st}" data-i="${i}" value="${k.sites[st]?.[i] ? fmtNum(k.sites[st][i]) : ''}"></td>`).join('')}<td class="r num">${sitesMm[st] ? fmtNum(sitesMm[st], 1) : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
        ${r ? `<div class="cmp">
            <div class="c"><div class="lbl">Тјелесна маст</div><div class="v">${fmtNum(r.fatPct, 1)} %</div></div>
            <div class="c"><div class="lbl">Маса масти</div><div class="v">${r.fatKg === null ? '—' : fmtNum(r.fatKg, 1) + ' kg'}</div></div>
            <div class="c"><div class="lbl">Немасна маса (LBM)</div><div class="v">${r.leanKg === null ? '—' : fmtNum(r.leanKg, 1) + ' kg'}</div></div>
            <div class="c"><div class="lbl">Збир набора</div><div class="v">${fmtNum(r.sum, 1)} mm</div><div class="small muted">густина ${fmtNum(r.density, 4)}</div></div>
          </div><p class="small muted">Процјена: ${esc(PROTOCOLS[k.protocol].name)} → густина тијела → % масти по Siri формули. Вриједности се аутоматски уписују у „Вриједности“ испод и улазе у поређење и графиконе.</p>`
          : sex && age !== null ? '<p class="small muted">Унесите све наборе за изабрани протокол.</p>' : ''}
      </section>`;
      $('#k-prot').onchange = () => { k.protocol = $('#k-prot').value; queue(); drawSpecial(); drawVals(); };
      $('#k-w').onchange = () => { const v = parseNum($('#k-w').value); if (Number.isNaN(v)) return toast('Маса мора бити број.', 'bad'); k.weightKg = v; queue(); drawSpecial(); drawVals(); };
      box.querySelectorAll('[data-site]').forEach((inp) => (inp.onchange = () => {
        const v = parseNum(inp.value);
        if (Number.isNaN(v) || (v !== null && (v <= 0 || v > 100))) { inp.classList.add('bad'); return toast('Набор: број од 1 до 100 mm.', 'bad'); }
        const arr = (k.sites[inp.dataset.site] = k.sites[inp.dataset.site] || [null, null, null]); arr[Number(inp.dataset.i)] = v; queue(); drawSpecial(); drawVals();
      }));
    } else if (F.kind === 'posture') {
      F.checks = F.checks || {};
      box.innerHTML = `<section class="card pad stack"><h2>Процјена држања</h2><p class="small muted">Означите уочено (посматрање сприједа, бочно и позади). Оцјене покретљивости 0–3 додајте брзим избором у „Вриједности“: 3 = без ограничења, 2 = уз компензацију, 1 = не може, 0 = бол.</p>
        <div class="chips">${Object.entries(POSTURE).map(([key, l]) => `<button type="button" class="qchip ${F.checks[key] ? 'on' : ''}" data-chk="${key}">${esc(l)}</button>`).join('')}</div></section>`;
      box.querySelectorAll('[data-chk]').forEach((b) => (b.onclick = () => { F.checks[b.dataset.chk] = F.checks[b.dataset.chk] ? 0 : 1; b.classList.toggle('on'); queue(); }));
    } else if (F.kind === 'photos') {
      box.innerHTML = `<section class="card pad stack"><h2>Фотографије напретка</h2>
        ${c.consentPhotos ? '' : '<div class="banner warn"><div>У профилу клијента није означена <b>сагласност за фотографисање</b>.</div></div>'}
        <p class="small muted">Сликајте увијек под истим условима (исто мјесто, свјетло, одјећа, удаљеност). Изаберите поглед, па додајте фотографију — камером или из галерије. Поређење двије фотографије је у картици „Мјерења и налази“.</p>
        <div class="row"><div class="seg" id="view-seg">${Object.entries(VIEWS).map(([k2, l]) => `<button data-view="${k2}" class="${k2 === 'front' ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label class="btn primary" style="cursor:pointer">+ Фотографија<input type="file" accept="image/*" data-photo hidden></label></div></section>`;
      let view = 'front';
      box.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { view = b.dataset.view; box.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); }));
      box.querySelector('[data-photo]').onchange = async (e) => {
        const file = e.target.files[0]; e.target.value = ''; if (!file) return;
        if (file.size > 15 * 1024 * 1024) return toast('Фотографија је већа од 15 MB.', 'bad');
        const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        if ((await save(() => repo.addAttachment({ findingId: F.id, name: `${VIEWS[view]} ${F.date}.${ext}`, mime: file.type || 'image/jpeg', size: file.size, dataUrl, note: view }))) !== null) { toast('Фотографија је додата.'); drawAtts(); }
      };
    } else box.innerHTML = '';
  }

  drawQuick(); drawSpecial(); drawVals(); drawAtts();
}

export { paramName };
