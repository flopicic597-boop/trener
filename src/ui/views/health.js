// Здравље клијента: упитник о спремности за вјежбање (у стилу PAR-Q), лијекови и дијагнозе,
// повреде и ограничења која упозоравају у тренингу.
import { repo, save, toast, openModal, closeModal, confirmDlg, katStyle } from '../core.js';
import { esc, fmtDate, today, isValidDate, uid } from '../../lib/util.js';
import { pickExercise } from '../dialogs.js';

export const HEALTH_Q = [
  ['heart', 'Да ли вам је љекар рекао да имате срчано обољење или повишен крвни притисак?'],
  ['chest', 'Да ли осјећате бол у грудима у мировању, при свакодневним активностима или током вјежбања?'],
  ['dizzy', 'Да ли губите равнотежу због вртоглавице или сте у посљедњих 12 мјесеци губили свијест?'],
  ['chronic', 'Да ли имате другу дијагностиковану хроничну болест (нпр. дијабетес, астма, болест штитне жлијезде)?'],
  ['meds', 'Да ли тренутно узимате лијекове прописане за хроничну болест?'],
  ['joints', 'Да ли имате проблем са костима, зглобовима или мишићима који би се могао погоршати вјежбањем?'],
  ['supervised', 'Да ли вам је љекар рекао да се физичком активношћу бавите само под медицинским надзором?'],
  ['pregnant', 'Трудноћа или период до 6 мјесеци послије порођаја?'],
];

/** Стање упитника: {filled, flagged (бар један „да“), cleared (сагласност љекара)} */
export function healthState(c) {
  const h = c?.health;
  if (!h || !h.filledDate) return { filled: false, flagged: false, cleared: false };
  const flagged = HEALTH_Q.some(([k]) => h.q?.[k] === 1);
  return { filled: true, flagged, cleared: !!h.doctorOkDate };
}
/** Активне повреде и шта избјегавати */
export const activeInjuries = (c) => (c?.injuries || []).filter((i) => i.active);
/** Упозорења за вјежбу у тренингу (по категорији или конкретној вјежби) */
export function injuryWarnings(c, ex) {
  if (!ex) return [];
  return activeInjuries(c).filter((i) => (i.avoidEx || []).includes(ex.id) || (i.avoidCats || []).includes(ex.category)).map((i) => i.area + (i.note ? ': ' + i.note : ''));
}

export async function renderClientHealth(root, c0) {
  const c = await repo.getClient(c0.id);
  const opts = await repo.getOptions();
  const exMap = await repo.exerciseMap();
  const h = c.health || { q: {}, meds: '', conditions: '', surgeries: '', note: '', filledDate: '', doctorOkDate: '' };
  const hs = healthState(c);
  const inj = c.injuries || [];
  const re = () => renderClientHealth(root, c0);

  root.innerHTML = `<div class="stack">
    ${hs.flagged && !hs.cleared ? '<div class="banner bad"><div><b>Потребна је сагласност љекара</b> прије интензивнијег тренинга: на бар једно питање одговорено је „да“. Када клијент донесе сагласност, унесите датум испод.</div></div>' : ''}
    ${!hs.filled ? '<div class="banner warn"><div><b>Упитник о здрављу није попуњен.</b> Препорука: попуните га прије првог тренинга и поново једном годишње.</div></div>' : ''}
    <section class="card pad stack">
      <div class="row between"><h3>Упитник о спремности за вјежбање</h3><span class="small muted">${h.filledDate ? 'Попуњено ' + fmtDate(h.filledDate) : ''}</span></div>
      <div class="stack" id="hq">${HEALTH_Q.map(([k, q]) => `<div class="row between" style="gap:12px;border-bottom:1px solid var(--line);padding-bottom:8px">
        <span style="flex:1 1 300px">${esc(q)}</span>
        <div class="seg">${[[1, 'Да'], [0, 'Не']].map(([v, l]) => `<button data-q="${k}" data-v="${v}" class="${h.q?.[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="fgrid">
        <div class="field"><label for="h-med">Лијекови</label><textarea id="h-med" class="inp" rows="2">${esc(h.meds || '')}</textarea></div>
        <div class="field"><label for="h-con">Болести и дијагнозе</label><textarea id="h-con" class="inp" rows="2">${esc(h.conditions || '')}</textarea></div>
        <div class="field"><label for="h-sur">Операције и повреде у прошлости</label><textarea id="h-sur" class="inp" rows="2">${esc(h.surgeries || '')}</textarea></div>
        <div class="field"><label for="h-note">Напомена</label><textarea id="h-note" class="inp" rows="2">${esc(h.note || '')}</textarea></div>
        <div class="field"><label for="h-fd">Датум попуњавања</label><input id="h-fd" class="inp" type="date" value="${esc(h.filledDate || '')}"></div>
        <div class="field"><label for="h-doc">Сагласност љекара (датум)</label><input id="h-doc" class="inp" type="date" value="${esc(h.doctorOkDate || '')}"></div>
      </div>
      <div class="row"><button class="btn primary" id="h-save">Сачувај упитник</button><span class="small muted">Упитник не замјењује љекарски преглед.</span></div>
      <p class="err" id="h-err"></p>
    </section>

    <section class="card">
      <div class="pad row between"><div><h3>Повреде и ограничења</h3><p class="small muted">Активне повреде се приказују у сваком тренингу; вјежбе које треба избјегавати добијају упозорење.</p></div>
        <button class="btn primary" id="inj-add">+ Додај</button></div>
      <div class="list">${inj.length ? inj.map((i) => `<div class="litem" style="cursor:default">
        <div class="grow"><b>${esc(i.area)} ${i.active ? '<span class="chip bad">активно</span>' : '<span class="chip muted">прошло</span>'}</b>
          <small>${i.since ? 'од ' + fmtDate(i.since) + ' · ' : ''}${esc(i.note || '')}${(i.avoidCats || []).length ? ' · избјегавати: ' + (i.avoidCats || []).map(esc).join(', ') : ''}${(i.avoidEx || []).length ? ' · вјежбе: ' + i.avoidEx.map((x) => esc(exMap.get(x)?.name || '?')).join(', ') : ''}</small></div>
        <div class="row"><button class="btn sm" data-ie="${i.id}">Измијени</button><button class="btn sm danger" data-id="${i.id}">Обриши</button></div></div>`).join('') : '<p class="empty">Нема унесених повреда.</p>'}</div>
    </section></div>`;

  const q = { ...(h.q || {}) };
  root.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
    q[b.dataset.q] = Number(b.dataset.v);
    root.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle('on', x === b));
  }));
  root.querySelector('#h-save').onclick = async () => {
    const fd = root.querySelector('#h-fd').value || today(), doc = root.querySelector('#h-doc').value;
    if (!isValidDate(fd) || (doc && !isValidDate(doc))) { root.querySelector('#h-err').textContent = 'Неисправан датум.'; return; }
    const health = { q, meds: root.querySelector('#h-med').value.trim(), conditions: root.querySelector('#h-con').value.trim(), surgeries: root.querySelector('#h-sur').value.trim(), note: root.querySelector('#h-note').value.trim(), filledDate: fd, doctorOkDate: doc };
    if (await save(() => repo.saveClient({ id: c.id, health }))) { toast('Упитник је сачуван.'); re(); }
  };
  const saveInj = (list) => save(() => repo.saveClient({ id: c.id, injuries: list }));
  root.querySelector('#inj-add').onclick = () => injuryForm(null, opts, exMap, async (i) => { if (await saveInj([...inj, i])) { toast('Сачувано.'); re(); } });
  root.querySelectorAll('[data-ie]').forEach((b) => (b.onclick = () => injuryForm(inj.find((x) => x.id === b.dataset.ie), opts, exMap, async (i) => { if (await saveInj(inj.map((x) => (x.id === i.id ? i : x)))) { toast('Сачувано.'); re(); } })));
  root.querySelectorAll('[data-id]').forEach((b) => (b.onclick = async () => {
    const i = inj.find((x) => x.id === b.dataset.id);
    if (!(await confirmDlg(`Обрисати запис о повреди „${esc(i.area)}“? Ако је повреда прошла, боље је означити је као „прошло“ (остаје у историји).`, { okText: 'Обриши', danger: true }))) return;
    if (await saveInj(inj.filter((x) => x.id !== i.id))) re();
  }));
}

function injuryForm(i0, opts, exMap, onSave) {
  const i = i0 ? { ...i0, avoidCats: [...(i0.avoidCats || [])], avoidEx: [...(i0.avoidEx || [])] } : { id: uid(), area: '', note: '', since: today(), active: 1, avoidCats: [], avoidEx: [] };
  const m = openModal({
    title: i0 ? 'Измјена повреде/ограничења' : 'Нова повреда или ограничење',
    body: `<div class="fgrid">
      <div class="field"><label for="i-area">Подручје *</label><input id="i-area" class="inp" list="areas" value="${esc(i.area)}" autocomplete="off" placeholder="нпр. Лијево раме">
        <datalist id="areas">${['Врат', 'Лијево раме', 'Десно раме', 'Лакат', 'Ручни зглоб', 'Доња леђа', 'Кук', 'Лијево кољено', 'Десно кољено', 'Скочни зглоб', 'Тетива'].map((a) => `<option value="${a}">`).join('')}</datalist></div>
      <div class="field"><label for="i-since">Од датума</label><input id="i-since" class="inp" type="date" value="${esc(i.since || '')}"></div>
      <div class="field full"><label for="i-note">Опис и ограничење</label><textarea id="i-note" class="inp" rows="2" placeholder="нпр. без потиска изнад главе, без скокова">${esc(i.note || '')}</textarea></div>
      <div class="field full"><span class="lbl">Избјегавати категорије вјежби</span><div class="chips">${opts.categories.map((k) => `<button type="button" class="qchip ${i.avoidCats.includes(k) ? 'on' : ''}" data-cat="${esc(k)}" style="${katStyle(k)}">${esc(k)}</button>`).join('')}</div></div>
      <div class="field full"><span class="lbl">Избјегавати конкретне вјежбе</span><div class="chips" id="i-exs"></div><div><button type="button" class="btn sm" id="i-addex">+ Изабери вјежбу</button></div></div>
      <label class="row full" style="align-items:center"><input type="checkbox" id="i-act" ${i.active ? 'checked' : ''} style="width:24px;height:24px"> Повреда је тренутно активна</label>
      <p class="err full" id="i-err"></p></div>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="i-ok">Сачувај</button>',
  });
  const drawEx = () => {
    m.querySelector('#i-exs').innerHTML = i.avoidEx.map((x) => `<button type="button" class="qchip on" data-rmex="${x}">${esc(exMap.get(x)?.name || '?')} ✕</button>`).join('') || '<span class="small muted">нема</span>';
    m.querySelectorAll('[data-rmex]').forEach((b) => (b.onclick = () => { i.avoidEx = i.avoidEx.filter((x) => x !== b.dataset.rmex); drawEx(); }));
  };
  drawEx();
  m.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { const k = b.dataset.cat; i.avoidCats = i.avoidCats.includes(k) ? i.avoidCats.filter((x) => x !== k) : [...i.avoidCats, k]; b.classList.toggle('on'); }));
  m.querySelector('#i-addex').onclick = () => {
    const snapshot = { ...i, area: m.querySelector('#i-area').value, note: m.querySelector('#i-note').value, since: m.querySelector('#i-since').value, active: m.querySelector('#i-act').checked ? 1 : 0 };
    pickExercise((ex) => { snapshot.avoidEx = [...new Set([...snapshot.avoidEx, ex.id])]; injuryForm({ ...snapshot, id: i.id }, opts, exMap, onSave); });
  };
  m.querySelector('#i-ok').onclick = () => {
    const area = m.querySelector('#i-area').value.trim(), since = m.querySelector('#i-since').value;
    if (!area) { m.querySelector('#i-err').textContent = 'Унесите подручје.'; return; }
    if (since && !isValidDate(since)) { m.querySelector('#i-err').textContent = 'Неисправан датум.'; return; }
    closeModal();
    onSave({ ...i, area, since, note: m.querySelector('#i-note').value.trim(), active: m.querySelector('#i-act').checked ? 1 : 0 });
  };
}
