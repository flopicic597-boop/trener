// Програми (шаблони): списак, уређивање, додјела, заказивање, копирање.
import { repo, save, queueSave, flushSaves, confirmDlg, toast, katStyle, fullName, openModal, closeModal } from '../core.js';
import { esc, fmtNum, parseNum, parseDuration } from '../../lib/util.js';
import { fmtTempo, normalizeTempo, validateSet, TEMPO_HELP } from '../../domain/rules.js';
import { TYPE_SHORT } from '../../data/exercises-seed.js';
import { pickExercise, scheduleDialog } from '../dialogs.js';

const st = { archived: false };

export async function render(main) {
  const [all, clients] = await Promise.all([repo.listPrograms({ includeArchived: true }), repo.listClients({ includeArchived: true })]);
  const list = all.filter((p) => !!p.archived === st.archived);
  const cname = (id) => fullName(clients.find((c) => c.id === id));
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Шаблони</div><h1>Програми</h1></div><button class="btn primary big" data-new>+ Нови програм</button></div>
    <p class="small muted">Програм је шаблон. При заказивању се копира у тренинг, па измјена шаблона не мијења већ сачуване тренинге. „Додијели“ прави засебну копију за клијента.</p>
    <div class="seg"><button data-arch="0" class="${st.archived ? '' : 'on'}">Активни</button><button data-arch="1" class="${st.archived ? 'on' : ''}">Архива</button></div>
    <section class="card list">${list.map((p) => `<div class="litem" style="cursor:default"><div class="grow"><b>${esc(p.name)}</b>
      <small>${p.clientId ? 'Клијент: ' + esc(cname(p.clientId)) : 'Општи шаблон'} · ${p.items.length} вјежби · ${p.items.reduce((a, i) => a + i.sets.length, 0)} серија</small></div>
      <div class="row"><a class="btn sm" href="#/program/${p.id}">Уреди</a><button class="btn sm primary" data-sched="${p.id}">Закажи</button><button class="btn sm" data-copy="${p.id}">Копирај…</button>
      <button class="btn sm ghost" data-arch-p="${p.id}">${p.archived ? 'Врати' : 'Архивирај'}</button></div></div>`).join('') || '<p class="empty">Нема програма.</p>'}</section></div>`;
  main.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = () => { st.archived = b.dataset.arch === '1'; render(main); }));
  main.querySelector('[data-new]').onclick = async () => { const p = await save(() => repo.saveProgram({ name: 'Нови програм', items: [] })); if (p) location.hash = `#/program/${p.id}`; };
  main.querySelectorAll('[data-sched]').forEach((b) => (b.onclick = () => { const p = all.find((x) => x.id === b.dataset.sched); scheduleDialog({ clientId: p.clientId, programId: p.id, title: 'Закажи тренинг' }, (s) => { location.hash = `#/trening/${s.id}`; }); }));
  main.querySelectorAll('[data-arch-p]').forEach((b) => (b.onclick = async () => { const p = all.find((x) => x.id === b.dataset.archP); if (await save(() => repo.setProgramArchived(p.id, !p.archived))) render(main); }));
  main.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyDialog(all.find((x) => x.id === b.dataset.copy), clients.filter((c) => !c.archived), () => render(main))));
}

function copyDialog(p, clients, done) {
  const m = openModal({
    title: `Копирај „${p.name}“`,
    body: `<div class="field"><label for="cn">Назив копије</label><input id="cn" class="inp" value="${esc(p.name)}"></div>
      <div class="field"><label for="cc">Коме</label><select id="cc" class="inp"><option value="">Општи шаблон</option>${clients.map((c) => `<option value="${c.id}">${esc(fullName(c))}</option>`).join('')}</select></div>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="cok">Копирај</button>',
  });
  m.querySelector('#cok').onclick = async () => {
    const r = await save(() => repo.copyProgram(p.id, { clientId: m.querySelector('#cc').value || null, name: m.querySelector('#cn').value }));
    if (r) { closeModal(); toast('Копија је направљена.'); done(); }
  };
}

/* ---------------- уређивач програма ---------------- */
let P = null; // програм који се уређује

export async function renderEditor(main, [id]) {
  P = await repo.getProgram(id);
  if (!P) { main.innerHTML = '<div class="wrap"><p class="empty card">Програм није пронађен.</p></div>'; return; }
  const [exMap, clients, opts] = await Promise.all([repo.exerciseMap(), repo.listClients(), repo.getOptions()]);
  const persist = () => queueSave('program-' + P.id, async () => { const r = await repo.saveProgram(P); P.updatedAt = r.updatedAt; P.createdAt = r.createdAt; return r; });

  const draw = () => {
    main.innerHTML = `<div class="wrap">
      <a href="#/programi" class="muted" style="text-decoration:none">← Програми</a>
      <div class="phead"><div><div class="eyebrow">Шаблон програма</div><h1>${esc(P.name)}</h1></div>
        <div class="row"><button class="btn primary" data-sched>Закажи</button></div></div>
      <section class="card pad fgrid">
        <div class="field"><label for="pn">Назив</label><input id="pn" class="inp" value="${esc(P.name)}"></div>
        <div class="field"><label for="pc">Власник</label><select id="pc" class="inp"><option value="">Општи шаблон</option>${clients.map((c) => `<option value="${c.id}" ${c.id === P.clientId ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('')}</select></div>
        <div class="field full"><label for="pno">Напомена</label><input id="pno" class="inp" value="${esc(P.note || '')}"></div>
      </section>
      <details class="card pad"><summary class="lbl" style="cursor:pointer">Темпо 3–1–1–0?</summary><p class="small">${esc(TEMPO_HELP)}</p></details>
      ${P.items.map((it, idx) => {
        const ex = exMap.get(it.exerciseId) || { name: '?', type: 'load', category: '' };
        const isTime = ex.type === 'time';
        return `<section class="card exc" style="${katStyle(ex.category)}" data-it="${idx}">
          <div class="exhead"><h3>${idx + 1}. ${esc(ex.name)}</h3><span class="chip muted">${TYPE_SHORT[ex.type]}</span>
            <div class="row" style="gap:4px"><button class="btn icon sm" data-mv="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Горе">↑</button><button class="btn icon sm" data-mv="1" ${idx === P.items.length - 1 ? 'disabled' : ''} aria-label="Доле">↓</button><button class="btn icon sm danger" data-rmit aria-label="Уклони">✕</button></div></div>
          <div class="presets"><span class="lbl">Темпо за све:</span>${opts.tempoPresets.map((t) => `<button class="qchip" data-allt="${esc(t)}">${esc(fmtTempo(t))}</button>`).join('')}</div>
          <div class="presets"><span class="lbl">Пауза за све:</span>${opts.restPresets.map((r) => `<button class="qchip" data-allr="${r}">${r} с</button>`).join('')}</div>
          <div class="tscroll"><table class="tbl"><thead><tr><th>Сер.</th><th>${isTime ? 'Трајање (с)' : 'Понављања'}</th><th>${ex.type === 'load' ? 'Кг' : 'Додатно кг'}</th><th>Темпо</th><th>Пауза (с)</th><th></th></tr></thead><tbody>
          ${it.sets.map((s, si) => `<tr data-si="${si}"><td class="num">${si + 1}</td>
            <td><input class="inp num" style="min-width:80px" data-pf="${isTime ? 'durationSec' : 'reps'}" inputmode="decimal" value="${isTime ? (s.durationSec ?? '') : (s.reps ?? '')}"></td>
            <td><input class="inp num" style="min-width:80px" data-pf="weightKg" inputmode="decimal" value="${s.weightKg === null || s.weightKg === undefined ? '' : fmtNum(s.weightKg)}"></td>
            <td><input class="inp num" style="min-width:96px" data-pf="tempo" value="${esc(fmtTempo(s.tempo))}" placeholder="3–1–1–0"></td>
            <td><input class="inp num" style="min-width:70px" data-pf="restSec" inputmode="numeric" value="${s.restSec ?? ''}"></td>
            <td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-dups>Копија</button><button class="btn icon sm danger" data-rms aria-label="Уклони серију">✕</button></div></td></tr>`).join('')}
          </tbody></table></div>
          <div class="exfoot"><button class="btn" data-adds>+ Серија</button></div></section>`;
      }).join('')}
      <button class="btn primary big" data-addex>+ Додај вјежбу</button></div>`;
    bind();
  };

  const bind = () => {
    main.querySelector('#pn').oninput = (e) => { P.name = e.target.value; if (P.name.trim()) persist(); };
    main.querySelector('#pno').oninput = (e) => { P.note = e.target.value; persist(); };
    main.querySelector('#pc').onchange = (e) => { P.clientId = e.target.value || null; persist(); };
    main.querySelector('[data-sched]').onclick = async () => { await flushSaves(); scheduleDialog({ clientId: P.clientId, programId: P.id, title: 'Закажи тренинг' }, (s) => { location.hash = `#/trening/${s.id}`; }); };
    main.querySelector('[data-addex]').onclick = () => pickExercise((ex) => {
      exMap.set(ex.id, ex);
      const isTime = ex.type === 'time';
      P.items.push({ exerciseId: ex.id, note: '', sets: Array.from({ length: isTime ? 1 : 3 }, () => ({ reps: isTime ? null : 10, weightKg: null, durationSec: isTime ? 60 : null, tempo: isTime ? null : '3-1-1-0', restSec: 90 })) });
      persist(); draw();
    });
    main.querySelectorAll('[data-pf]').forEach((inp) => {
      const handler = (final) => {
        const it = P.items[Number(inp.closest('[data-it]').dataset.it)];
        const s = it.sets[Number(inp.closest('[data-si]').dataset.si)];
        const f = inp.dataset.pf;
        let v;
        if (f === 'tempo') { if (!final) return; v = normalizeTempo(inp.value); if (v === false) { inp.classList.add('bad'); return toast('Темпо: четири броја, нпр. 3-1-1-0', 'bad'); } inp.value = fmtTempo(v); }
        else { v = f === 'durationSec' ? parseDuration(inp.value) : parseNum(inp.value); if (f === 'reps' && v !== null && !Number.isInteger(v)) v = NaN; }
        const bad = Number.isNaN(v) || !!validateSet({ [f]: v })[f];
        inp.classList.toggle('bad', bad);
        if (bad) return;
        s[f] = v; persist();
      };
      inp.oninput = () => handler(false);
      inp.onchange = () => handler(true);
    });
    main.querySelectorAll('[data-it]').forEach((sec) => {
      const idx = Number(sec.dataset.it), it = P.items[idx];
      sec.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const si = b.closest('[data-si]') ? Number(b.closest('[data-si]').dataset.si) : null;
        if (b.dataset.mv) { const j = idx + Number(b.dataset.mv); [P.items[idx], P.items[j]] = [P.items[j], P.items[idx]]; }
        else if (b.hasAttribute('data-rmit')) { if (!(await confirmDlg('Уклонити вјежбу из програма?', { okText: 'Уклони', danger: true }))) return; P.items.splice(idx, 1); }
        else if (b.hasAttribute('data-adds')) { const last = it.sets[it.sets.length - 1]; it.sets.push(last ? { ...last } : { reps: 10, weightKg: null, durationSec: null, tempo: null, restSec: 90 }); }
        else if (b.hasAttribute('data-dups')) it.sets.splice(si + 1, 0, { ...it.sets[si] });
        else if (b.hasAttribute('data-rms')) it.sets.splice(si, 1);
        else if (b.dataset.allt) it.sets.forEach((s) => (s.tempo = b.dataset.allt));
        else if (b.dataset.allr) it.sets.forEach((s) => (s.restSec = Number(b.dataset.allr)));
        else return;
        persist(); draw();
      };
    });
  };
  draw();
}
