// Библиотека вјежби: претрага, филтер, додавање и измјена сопствених вјежби, архивирање.
import { repo, save, toast, katStyle } from '../core.js';
import { esc, normSearch } from '../../lib/util.js';
import { TYPE_LABEL } from '../../data/exercises-seed.js';
import { exerciseForm } from '../dialogs.js';

const st = { q: '', kat: '', type: '', archived: false };

export async function render(main) {
  const [all, opts] = await Promise.all([repo.listExercises({ includeArchived: true }), repo.getOptions()]);
  const q = normSearch(st.q);
  const list = all.filter((e) => !!e.archived === st.archived && (!st.kat || e.category === st.kat) && (!st.type || e.type === st.type) && (!q || normSearch(e.name).includes(q)));
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">${all.filter((e) => !e.archived).length} вјежби</div><h1>Библиотека вјежби</h1></div><button class="btn primary big" data-new>+ Нова вјежба</button></div>
    <section class="card pad stack">
      <div class="toolbar"><div class="grow field"><label for="lq">Претрага (ћирилица или латиница)</label><input id="lq" class="inp" type="search" value="${esc(st.q)}" placeholder="нпр. потисак / potisak" autocomplete="off"></div>
        <div class="field"><label for="lt">Врста</label><select id="lt" class="inp"><option value="">Све врсте</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === st.type ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="seg"><button data-arch="0" class="${st.archived ? '' : 'on'}">Активне</button><button data-arch="1" class="${st.archived ? 'on' : ''}">Архива</button></div></div>
      <div class="chips"><button class="qchip ${!st.kat ? 'on' : ''}" data-k="">Све</button>${opts.categories.map((k) => `<button class="qchip ${st.kat === k ? 'on' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
    </section>
    <section class="card list">${list.map((e) => `<div class="litem" style="cursor:default">
      <div class="grow"><b>${esc(e.name)}</b><small><span class="kat" style="${katStyle(e.category)}">${esc(e.category)}</span> · ${TYPE_LABEL[e.type]}${e.builtin ? '' : ' · <span class="chip accent">сопствена</span>'}${e.note ? ' · ' + esc(e.note) : ''}</small></div>
      <div class="row"><button class="btn sm" data-edit="${e.id}">Измијени</button><button class="btn sm ghost" data-arc="${e.id}">${e.archived ? 'Врати' : 'Архивирај'}</button></div></div>`).join('') || '<p class="empty">Нема вјежби за ову претрагу.</p>'}</section>
    <p class="small muted">Архивирана вјежба се не нуди при избору, али остаје у свим сачуваним тренинзима и графиконима.</p></div>`;
  const re = () => render(main);
  const lq = main.querySelector('#lq');
  lq.oninput = () => { st.q = lq.value; const p = lq.selectionStart; re().then(() => { const n = main.querySelector('#lq'); n.focus(); n.setSelectionRange(p, p); }); };
  main.querySelector('#lt').onchange = (e) => { st.type = e.target.value; re(); };
  main.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { st.kat = b.dataset.k; re(); }));
  main.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = () => { st.archived = b.dataset.arch === '1'; re(); }));
  main.querySelector('[data-new]').onclick = () => exerciseForm(null, re, st.q);
  main.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => exerciseForm(all.find((e) => e.id === b.dataset.edit), re)));
  main.querySelectorAll('[data-arc]').forEach((b) => (b.onclick = async () => {
    const e = all.find((x) => x.id === b.dataset.arc);
    if (await save(() => repo.setExerciseArchived(e.id, !e.archived))) { toast(e.archived ? 'Вјежба је враћена.' : 'Вјежба је архивирана.'); re(); }
  }));
}
