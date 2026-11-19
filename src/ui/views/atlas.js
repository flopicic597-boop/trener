// Атлас тијела (3Д): истраживање зона са описима и занимљивостима, и 3Д аватар клијента
// са ознакама (бол, повреда, укоченост, фокус) и прављењем тренинга из обиљежених зона.
import { repo, save, toast, openModal, closeModal, confirmDlg, fullName } from '../core.js';
import { esc, fmtDate, today, uid, isValidDate } from '../../lib/util.js';
import { ZONES, ZONE, LAYERS, MARK_TYPES, SCIENCE, zoneLabel } from '../../data/body-zones.js';
import { suggestExercises, MODES } from '../../domain/prehab.js';
import { TYPE_SHORT } from '../../data/exercises-seed.js';

const st = { sex: 'm', layer: 'muscle', sel: null, cid: null };

/** Учитава 3Д приказ (three.js се учитава тек овдје); без WebGL-а враћа null */
async function mountViewer(box, opts) {
  try {
    const { createBodyViewer } = await import('../../body/viewer.js');
    return await createBodyViewer(box, opts);
  } catch (e) {
    console.error(e);
    box.innerHTML = '<p class="empty">3Д приказ није доступан на овом уређају (WebGL). Зоне можете бирати са списка испод.</p>';
    return null;
  }
}

function controlsHtml(sexToggle = true) {
  return `<div class="row between" style="gap:8px">
    ${sexToggle ? `<div class="seg">${[['m', 'Мушко'], ['f', 'Женско']].map(([k, v]) => `<button data-sex="${k}" class="${st.sex === k ? 'on' : ''}">${v}</button>`).join('')}</div>` : ''}
    <div class="seg">${Object.entries(LAYERS).map(([k, v]) => `<button data-layer="${k}" class="${st.layer === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="seg"><button data-view="front">Напријед</button><button data-view="back">Позади</button></div></div>`;
}
function zoneListHtml() {
  return `<details class="card pad"><summary class="lbl" style="cursor:pointer;min-height:40px;display:flex;align-items:center">Све зоне (списак)</summary>
    <div class="stack" style="margin-top:8px">${Object.entries(LAYERS).map(([l, ln]) => `<div><div class="small muted">${ln}</div><div class="chips">${ZONES.filter((z) => z.layer === l).map((z) => z.paired
      ? ['L', 'R'].map((s) => `<button class="qchip" data-z="${z.id}" data-s="${s}" data-l="${l}">${esc(zoneLabel(z.id, s))}</button>`).join('')
      : `<button class="qchip" data-z="${z.id}" data-s="C" data-l="${l}">${esc(z.name)}</button>`).join('')}</div></div>`).join('')}</div></details>`;
}

/** Опис зоне са вјежбама */
export function zoneInfoHtml(id, side, exMap) {
  const z = ZONE[id]; if (!z) return '';
  const exs = (z.ex || []).map((x) => exMap.get(x)).filter(Boolean);
  const row = (t, v) => `<div><div class="lbl">${t}</div><p>${esc(v)}</p></div>`;
  return `<div class="stack">
    <div><span class="chip accent">${LAYERS[z.layer]}</span><h2 style="margin-top:6px">${esc(zoneLabel(id, side))}</h2></div>
    ${row('Опис', z.desc)}${row('Функција', z.func)}${row('Чести проблеми', z.issues)}${row('Превенција', z.prehab)}
    <div class="banner info small"><div><b>Занимљивост:</b> ${esc(z.fact)}</div></div>
    ${exs.length ? `<div><div class="lbl">Препоручене вјежбе</div><div class="list">${exs.map((e) => `<div class="litem" style="cursor:default;min-height:0;padding:8px 0"><div class="grow"><b>${esc(e.name)}</b><small>${esc(e.note || '')}</small></div><span class="chip muted">${TYPE_SHORT[e.type]}</span></div>`).join('')}</div></div>` : ''}
    <p class="small muted">Опште едукативни опис, не дијагноза. Код бола или повреде упутите клијента љекару/физиотерапеуту.</p></div>`;
}

function bindControls(root, viewer, onChange) {
  root.querySelectorAll('[data-sex]').forEach((b) => (b.onclick = () => { st.sex = b.dataset.sex; root.querySelectorAll('[data-sex]').forEach((x) => x.classList.toggle('on', x === b)); viewer?.setSex(st.sex); }));
  root.querySelectorAll('[data-layer]').forEach((b) => (b.onclick = () => { st.layer = b.dataset.layer; st.sel = null; root.querySelectorAll('[data-layer]').forEach((x) => x.classList.toggle('on', x === b)); viewer?.setLayer(st.layer); onChange(null); }));
  root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => viewer?.view(b.dataset.view)));
  root.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
    const sel = { zone: b.dataset.z, side: b.dataset.s };
    if (b.dataset.l !== st.layer) { st.layer = b.dataset.l; root.querySelectorAll('[data-layer]').forEach((x) => x.classList.toggle('on', x.dataset.layer === st.layer)); viewer?.setLayer(st.layer); }
    viewer?.select(sel); onChange(sel); root.querySelector('#info')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ------------------------------------------------------------------ */
/* Страница „Атлас тијела“                                              */
/* ------------------------------------------------------------------ */
export async function render(main) {
  const exMap = await repo.exerciseMap();
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Анатомија и превенција</div><h1>Атлас тијела</h1></div></div>
    ${controlsHtml(true)}
    <div class="grid2" style="align-items:start">
      <div class="card body3d"><div id="v3d" class="v3d"></div><p class="small muted v3d-hint">Превуците за окретање · два прста за зум · додирните зону</p></div>
      <section class="card pad" id="info"></section>
    </div>
    ${zoneListHtml()}
  </div>`;
  const info = main.querySelector('#info');
  const show = (sel) => { st.sel = sel; info.innerHTML = sel ? zoneInfoHtml(sel.zone, sel.side, exMap) : `<h3>Занимљивости из науке</h3><ul class="find">${SCIENCE.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="small muted">Додирните зону на моделу за опис, честе проблеме, превенцију и вјежбе. Слојеви: мишићи, скелет и зглобови, мишићно-фасцијални ланци.</p>`; };
  show(null);
  const viewer = await mountViewer(main.querySelector('#v3d'), { sex: st.sex, layer: st.layer, onPick: show });
  bindControls(main, viewer, show);
  disposeOnLeave(main, viewer);
}

/** Ослобађа WebGL када корисник напусти страницу */
function disposeOnLeave(main, viewer) {
  if (!viewer) return;
  const check = () => { if (!main.isConnected) { viewer.dispose(); window.removeEventListener('hashchange', later); } };
  const later = () => setTimeout(check, 50);
  window.addEventListener('hashchange', later);
}

/* ------------------------------------------------------------------ */
/* Картица „Тијело 3Д“ на профилу клијента                              */
/* ------------------------------------------------------------------ */
export async function renderClientBody(root, c0) {
  const c = await repo.getClient(c0.id);
  const exMap = await repo.exerciseMap();
  if (st.cid !== c.id) { st.cid = c.id; st.sel = null; st.sex = c.sex === 'f' ? 'f' : 'm'; }
  let marks = (c.bodyMarks || []).slice();
  const active = () => marks.filter((m) => m.active !== 0);

  root.innerHTML = `<div class="stack">
    ${controlsHtml(true)}
    <div class="grid2" style="align-items:start">
      <div class="card body3d"><div id="v3d" class="v3d"></div><p class="small muted v3d-hint">Додирните зону и обиљежите: бол, повреда, укоченост или фокус</p></div>
      <div class="stack"><section class="card pad" id="info"></section>
        <section class="card pad stack" id="markslist"></section></div>
    </div>
    ${zoneListHtml()}
  </div>`;
  const info = root.querySelector('#info'), list = root.querySelector('#markslist');
  const persist = async (next, msg) => { const ok = await save(() => repo.saveClient({ id: c.id, bodyMarks: next })); if (ok) { marks = next; viewer?.setMarks(active()); drawList(); if (msg) toast(msg); } return ok; };

  function drawInfo(sel) {
    st.sel = sel;
    if (!sel) { info.innerHTML = `<h3>${esc(fullName(c))} — карта тијела</h3><p class="small muted">Додирните зону на моделу. Обиљежене зоне се памте у профилу клијента и користе за прављење тренинга превенције.</p><div class="chips">${Object.entries(MARK_TYPES).map(([, t]) => `<span class="chip" style="color:${t.color}">● ${t.label}</span>`).join('')}</div>`; return; }
    const cur = active().find((m) => m.zone === sel.zone && (m.side || 'C') === sel.side);
    info.innerHTML = `<div class="stack">
      <div class="card pad stack" style="background:var(--surface-2)">
        <div class="lbl">Ознака за: ${esc(zoneLabel(sel.zone, sel.side))}</div>
        <div class="chips">${Object.entries(MARK_TYPES).map(([k, t]) => `<button class="qchip ${cur?.type === k ? 'on' : ''}" data-mt="${k}" style="${cur?.type === k ? '' : `color:${t.color}`}">${t.label}</button>`).join('')}</div>
        <div class="fgrid"><div class="field"><label for="m-int">Јачина бола 0–10 (за бол)</label><input id="m-int" class="inp" inputmode="numeric" value="${cur?.intensity ?? ''}"></div>
          <div class="field"><label for="m-date">Датум</label><input id="m-date" class="inp" type="date" value="${cur?.date || today()}"></div>
          <div class="field full"><label for="m-note">Напомена</label><input id="m-note" class="inp" value="${esc(cur?.note || '')}" placeholder="нпр. боли при чучњу испод 90°"></div></div>
        <div class="row"><button class="btn primary" id="m-save">${cur ? 'Сачувај измјене' : 'Обиљежи зону'}</button>${cur ? '<button class="btn ok" id="m-done">Ријешено</button><button class="btn danger" id="m-del">Уклони</button>' : ''}</div>
        <p class="err" id="m-err"></p></div>
      <details><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Опис зоне и вјежбе</summary>${zoneInfoHtml(sel.zone, sel.side, exMap)}</details></div>`;
    let type = cur?.type || null;
    info.querySelectorAll('[data-mt]').forEach((b) => (b.onclick = () => { type = b.dataset.mt; info.querySelectorAll('[data-mt]').forEach((x) => { x.classList.toggle('on', x === b); x.style.color = x === b ? '' : MARK_TYPES[x.dataset.mt].color; }); }));
    info.querySelector('#m-save').onclick = async () => {
      const iv = info.querySelector('#m-int').value.trim(), date = info.querySelector('#m-date').value;
      const intensity = iv === '' ? null : Number(iv);
      if (!type) { info.querySelector('#m-err').textContent = 'Изаберите врсту ознаке.'; return; }
      if (intensity !== null && !(Number.isInteger(intensity) && intensity >= 0 && intensity <= 10)) { info.querySelector('#m-err').textContent = 'Јачина бола: цио број од 0 до 10.'; return; }
      if (!isValidDate(date)) { info.querySelector('#m-err').textContent = 'Неисправан датум.'; return; }
      const rec = { id: cur?.id || uid(), zone: sel.zone, side: sel.side, type, intensity, date, note: info.querySelector('#m-note').value.trim(), active: 1 };
      await persist(cur ? marks.map((m) => (m.id === cur.id ? rec : m)) : [...marks, rec], 'Ознака је сачувана.');
      drawInfo(sel);
    };
    const done = info.querySelector('#m-done');
    if (done) done.onclick = async () => { await persist(marks.map((m) => (m.id === cur.id ? { ...m, active: 0, resolvedDate: today() } : m)), 'Означено као ријешено (остаје у историји).'); drawInfo(sel); };
    const del = info.querySelector('#m-del');
    if (del) del.onclick = async () => { if (await confirmDlg('Уклонити ознаку без чувања у историји? За опорављену зону користите „Ријешено“.', { okText: 'Уклони', danger: true })) { await persist(marks.filter((m) => m.id !== cur.id), 'Ознака је уклоњена.'); drawInfo(sel); } };
  }

  function drawList() {
    const a = active(), past = marks.filter((m) => m.active === 0);
    list.innerHTML = `<div class="row between"><h3>Обиљежене зоне (${a.length})</h3><button class="btn primary" id="mk-train" ${a.length ? '' : 'disabled'}>Направи тренинг</button></div>
      ${a.length ? `<div class="list">${a.map((m) => `<div class="litem" style="cursor:pointer" data-go="${m.zone}|${m.side}|${ZONE[m.zone]?.layer}"><span style="color:${MARK_TYPES[m.type]?.color};font-size:20px">●</span>
        <div class="grow"><b>${esc(zoneLabel(m.zone, m.side))}</b><small>${MARK_TYPES[m.type]?.label}${m.intensity !== null && m.intensity !== undefined ? ' · бол ' + m.intensity + '/10' : ''} · од ${fmtDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</small></div></div>`).join('')}</div>` : '<p class="small muted">Нема активних ознака.</p>'}
      ${past.length ? `<details><summary class="lbl" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Историја (ријешено: ${past.length})</summary><div class="list">${past.map((m) => `<div class="litem" style="cursor:default"><div class="grow"><b>${esc(zoneLabel(m.zone, m.side))}</b><small>${MARK_TYPES[m.type]?.label} · ${fmtDate(m.date)} → ријешено ${fmtDate(m.resolvedDate)}${m.note ? ' · ' + esc(m.note) : ''}</small></div></div>`).join('')}</div></details>` : ''}`;
    list.querySelectorAll('[data-go]').forEach((el) => (el.onclick = () => {
      const [zone, side, layer] = el.dataset.go.split('|');
      if (layer !== st.layer) { st.layer = layer; root.querySelectorAll('[data-layer]').forEach((x) => x.classList.toggle('on', x.dataset.layer === layer)); viewer?.setLayer(layer); }
      viewer?.select({ zone, side }); drawInfo({ zone, side });
    }));
    const tb = list.querySelector('#mk-train'); if (tb) tb.onclick = () => trainingDialog(c, active());
  }

  drawInfo(null); drawList();
  const viewer = await mountViewer(root.querySelector('#v3d'), { sex: st.sex, layer: st.layer, marks: active(), onPick: drawInfo });
  bindControls(root, viewer, drawInfo);
  disposeOnLeave(root, viewer);
}

/** Тренинг из обиљежених зона: приједлог вјежби → програм клијента и (опционо) заказан тренинг */
async function trainingDialog(c, marks) {
  const exercises = await repo.listExercises();
  let mode = 'prehab';
  const m = openModal({
    title: `Тренинг из ознака · ${fullName(c)}`, wide: true,
    body: `<div class="stack">
      <div class="seg">${Object.entries(MODES).map(([k, v]) => `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div id="sug"></div>
      <div class="fgrid"><div class="field"><label for="t-name">Назив програма</label><input id="t-name" class="inp" value="Превенција — ${esc(marks.map((x) => zoneLabel(x.zone, x.side)).slice(0, 3).join(', '))}"></div>
        <div class="field"><label for="t-date">Закажи тренинг за датум (необавезно)</label><input id="t-date" class="inp" type="date" value="${today()}"></div></div>
      <p class="small muted">Зоне са болом или повредом добијају блажи план (мање серија, спорији темпо). Радите у границама без бола (0–3/10) и прилагодите план клијенту.</p>
      <p class="err" id="t-err"></p></div>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn" id="t-prog">Само сачувај програм</button><button class="btn primary" id="t-go">Направи тренинг</button>',
  });
  let sug = [];
  const draw = () => {
    sug = suggestExercises(marks, exercises, { mode });
    m.querySelector('#sug').innerHTML = sug.length ? `<div class="list">${sug.map((s, i) => `<label class="litem" style="cursor:pointer;align-items:flex-start"><input type="checkbox" data-i="${i}" checked style="width:24px;height:24px;margin-top:4px">
      <div class="grow"><b>${esc(s.exercise.name)}</b><small>${s.sets.length} × ${s.sets[0].reps ? s.sets[0].reps + ' пон.' : s.sets[0].durationSec + ' с'} · због: ${esc(s.zones.join(', '))}${s.exercise.note ? '<br>' + esc(s.exercise.note) : ''}</small></div></label>`).join('')}</div>` : '<p class="empty">Нема приједлога за изабране зоне.</p>';
  };
  draw();
  m.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; m.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  const create = async (schedule) => {
    const chosen = [...m.querySelectorAll('[data-i]:checked')].map((cb) => sug[Number(cb.dataset.i)]);
    if (!chosen.length) { m.querySelector('#t-err').textContent = 'Изаберите бар једну вјежбу.'; return; }
    const date = m.querySelector('#t-date').value;
    if (schedule && !isValidDate(date)) { m.querySelector('#t-err').textContent = 'Изаберите датум.'; return; }
    try {
      const p = await repo.saveProgram({ name: m.querySelector('#t-name').value.trim() || 'Превенција', clientId: c.id, note: 'Направљено из ознака на карти тијела.', items: chosen.map((s) => ({ exerciseId: s.exercise.id, note: 'Због: ' + s.zones.join(', '), sets: s.sets })) });
      if (!schedule) { closeModal(); toast('Програм је сачуван (картица Програми).'); return; }
      const ses = await repo.createSession({ clientId: c.id, date, programId: p.id });
      closeModal(); toast('Тренинг је направљен.'); location.hash = `#/trening/${ses.id}`;
    } catch (e) { m.querySelector('#t-err').textContent = e.message; }
  };
  m.querySelector('#t-go').onclick = () => create(true);
  m.querySelector('#t-prog').onclick = () => create(false);
}
