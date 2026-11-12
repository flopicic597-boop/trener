// Дијалози који се користе на више мјеста: избор вјежбе, нова вјежба, заказивање тренинга.
import { repo, openModal, closeModal, toast, katStyle, fullName } from './core.js';
import { esc, normSearch, today, isValidDate, isValidTime } from '../lib/util.js';
import { TYPE_LABEL, TYPE_SHORT } from '../data/exercises-seed.js';

/** Избор вјежбе додиром. onPick(exercise) */
export async function pickExercise(onPick, { title = 'Изабери вјежбу' } = {}) {
  const [all, opts] = await Promise.all([repo.listExercises(), repo.getOptions()]);
  const st = { q: '', kat: '' };
  const m = openModal({
    title, wide: true,
    body: `<div class="toolbar"><div class="grow field"><label for="exq">Претрага</label><input id="exq" class="inp" type="search" placeholder="нпр. чучањ, cucanj, потисак" autofocus autocomplete="off"></div>
      <button class="btn" id="exnew">+ Нова вјежба</button></div>
      <div class="chips" id="exk"><button class="qchip on" data-k="">Све</button>${opts.categories.map((k) => `<button class="qchip" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <div class="list card" id="exl" style="max-height:52vh;overflow:auto"></div>`,
  });
  const draw = () => {
    const q = normSearch(st.q);
    const list = all.filter((e) => (!st.kat || e.category === st.kat) && (!q || normSearch(e.name).includes(q)));
    m.querySelector('#exl').innerHTML = list.length
      ? list.map((e) => `<button class="litem" style="all:unset;display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);min-height:56px;cursor:pointer" data-id="${e.id}">
          <span class="grow" style="flex:1"><b>${esc(e.name)}</b> <span class="kat" style="${katStyle(e.category)}">${esc(e.category)}</span></span>
          <span class="chip muted">${TYPE_SHORT[e.type]}</span></button>`).join('')
      : '<p class="empty">Нема вјежби за ову претрагу. Додајте нову дугметом „+ Нова вјежба“.</p>';
  };
  draw();
  m.querySelector('#exq').oninput = (e) => { st.q = e.target.value; draw(); };
  m.querySelectorAll('#exk .qchip').forEach((b) => (b.onclick = () => { st.kat = b.dataset.k; m.querySelectorAll('#exk .qchip').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  m.querySelector('#exl').onclick = (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const ex = all.find((x) => x.id === b.dataset.id);
    closeModal(); onPick(ex);
  };
  m.querySelector('#exnew').onclick = () => exerciseForm(null, (ex) => onPick(ex), st.q);
}

/** Образац вјежбе (нова или измјена) */
export async function exerciseForm(ex, onSaved, presetName = '') {
  const opts = await repo.getOptions();
  const e = ex || { name: presetName, category: opts.categories[0], type: 'load', note: '' };
  const m = openModal({
    title: ex ? 'Измјена вјежбе' : 'Нова вјежба',
    body: `<form class="fgrid" id="ef">
      <div class="field full"><label for="en">Назив *</label><input id="en" class="inp" name="name" value="${esc(e.name)}" autofocus autocomplete="off"></div>
      <div class="field"><label for="ek">Категорија</label><select id="ek" class="inp" name="category">${opts.categories.map((k) => `<option ${k === e.category ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div class="field"><label>Како се мјери</label><div class="seg" id="et">${Object.entries(TYPE_LABEL).map(([k, v]) => `<button type="button" data-t="${k}" class="${k === e.type ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <p class="small muted full">„Спољно оптерећење“: уносе се понављања и килограми, рачуна се обим. „Сопствена тежина“: понављања (килограми само као додатак, не рачуна се обим). „Трајање“: уноси се вријеме умјесто понављања.</p>
      <div class="field full"><label for="eno">Напомена</label><input id="eno" class="inp" name="note" value="${esc(e.note || '')}"></div>
      <p class="err full" id="eerr"></p></form>`,
    foot: `<button class="btn" data-close>Одустани</button><button class="btn primary" id="esave">Сачувај</button>`,
  });
  let type = e.type;
  m.querySelectorAll('#et button').forEach((b) => (b.onclick = () => { type = b.dataset.t; m.querySelectorAll('#et button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const submit = async () => {
    const fd = Object.fromEntries(new FormData(m.querySelector('#ef')));
    try {
      const saved = await repo.saveExercise({ ...(ex ? { id: ex.id } : {}), ...fd, type });
      closeModal(); toast('Вјежба је сачувана.'); onSaved?.(saved);
    } catch (err) { m.querySelector('#eerr').textContent = err.message; }
  };
  m.querySelector('#esave').onclick = submit;
  m.querySelector('#ef').onsubmit = (ev) => { ev.preventDefault(); submit(); };
}

/**
 * Заказивање / нови тренинг. Ако clientId или programId нису дати, бирају се у дијалогу.
 * onDone(session)
 */
export async function scheduleDialog({ clientId = null, programId = null, date = today(), title = 'Нови тренинг', copySessionId = null } = {}, onDone) {
  const [clients, programs] = await Promise.all([repo.listClients(), repo.listPrograms()]);
  const progs = programs.filter((p) => !clientId || !p.clientId || p.clientId === clientId);
  const cname = (id) => fullName(clients.find((c) => c.id === id));
  const m = openModal({
    title,
    body: `<form class="fgrid" id="sf">
      <div class="field full"><label for="sc">Клијент</label><select id="sc" class="inp" name="clientId">${clients.map((c) => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('')}</select></div>
      ${copySessionId ? '' : `<div class="field full"><label for="sp">Програм (полазна основа)</label><select id="sp" class="inp" name="programId">
        <option value="">— празан тренинг —</option>
        ${progs.map((p) => `<option value="${p.id}" ${p.id === programId ? 'selected' : ''}>${esc(p.name)}${p.clientId ? ' · ' + esc(cname(p.clientId)) : ''}</option>`).join('')}</select></div>`}
      <div class="field"><label for="sd">Датум</label><input id="sd" class="inp" type="date" name="date" value="${date}"></div>
      <div class="field"><label for="stm">Вријеме (необавезно)</label><input id="stm" class="inp" type="time" name="time"></div>
      <p class="small muted full">${copySessionId ? 'Копира вјежбе и серије; одрађене вриједности постају нови план.' : 'Вјежбе и серије програма се копирају у тренинг. Каснија измјена програма не мијења овај тренинг.'}</p>
      <p class="err full" id="serr"></p></form>`,
    foot: `<button class="btn" data-close>Одустани</button><button class="btn primary" id="ssave">Направи</button>`,
  });
  if (!clients.length) m.querySelector('#serr').textContent = 'Прво додајте клијента.';
  m.querySelector('#ssave').onclick = async () => {
    const fd = Object.fromEntries(new FormData(m.querySelector('#sf')));
    if (!fd.clientId) return (m.querySelector('#serr').textContent = 'Изаберите клијента.');
    if (!isValidDate(fd.date)) return (m.querySelector('#serr').textContent = 'Неисправан датум.');
    if (fd.time && !isValidTime(fd.time)) return (m.querySelector('#serr').textContent = 'Неисправно вријеме.');
    try {
      const s = copySessionId
        ? await repo.copySession(copySessionId, { clientId: fd.clientId, date: fd.date, time: fd.time || null })
        : await repo.createSession({ clientId: fd.clientId, date: fd.date, time: fd.time || null, programId: fd.programId || null });
      closeModal(); toast('Тренинг је направљен.'); onDone?.(s);
    } catch (e) { m.querySelector('#serr').textContent = e.message; }
  };
}
