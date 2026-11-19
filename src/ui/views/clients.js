// Списак клијената, претрага, додавање/измјена, архива.
import { repo, openModal, closeModal, toast, initials, fullName } from '../core.js';
import { esc, fmtDate, normSearch, today, isValidDate, fmtNum, parseNum } from '../../lib/util.js';
import { ACTIVITY } from '../../domain/assessment.js';
import { STATUS } from '../../domain/rules.js';
import { allStatuses, statusChip } from './membership.js';

const st = { q: '', archived: false };

export async function render(main) {
  const [clients, sessions, ms] = await Promise.all([repo.listClients({ includeArchived: true }), repo.listSessions(), allStatuses()]);
  const mstat = new Map(ms.rows.map((r) => [r.c.id, r.s]));
  const nExp = ms.rows.filter((r) => r.s.state === 'expired').length, nSoon = ms.rows.filter((r) => r.s.state === 'expiring').length;
  const last = new Map(), next = new Map();
  const t = today();
  for (const s of sessions) {
    if (s.date <= t && !last.has(s.clientId)) last.set(s.clientId, s);
    if (s.date >= t && s.status === 'planned') next.set(s.clientId, s); // листа је сортирана опадајуће → посљедњи је најближи
  }
  const list = clients
    .filter((c) => !!c.archived === st.archived)
    .filter((c) => !st.q || normSearch(`${c.firstName} ${c.lastName} ${c.goal} ${c.note}`).includes(normSearch(st.q)));
  const nArch = clients.filter((c) => c.archived).length;

  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Евиденција</div><h1>Клијенти</h1></div>
      <button class="btn primary big" data-act="new">+ Нови клијент</button></div>
    ${nExp || nSoon ? `<a class="banner ${nExp ? 'bad' : 'warn'}" href="#/clanarine" style="text-decoration:none;color:inherit"><div style="flex:1"><b>Чланарина:</b> ${nExp ? `истекла код ${nExp} ${nExp === 1 ? 'клијента' : 'клијената'}` : ''}${nExp && nSoon ? ', ' : ''}${nSoon ? `истиче ускоро код ${nSoon}` : ''}.</div><span class="btn sm">Прегледај</span></a>` : ''}
    <div class="card">
      <div class="pad toolbar">
        <div class="grow field"><label for="q">Претрага</label><input id="q" class="inp" type="search" placeholder="Име, презиме, циљ…" value="${esc(st.q)}" autocomplete="off"></div>
        <div class="seg"><button data-arch="0" class="${st.archived ? '' : 'on'}">Активни</button><button data-arch="1" class="${st.archived ? 'on' : ''}">Архива (${nArch})</button></div>
      </div>
      <div class="list" id="clist">
        ${list.length ? list.map((c) => {
          const l = last.get(c.id), n = next.get(c.id);
          return `<a class="litem" href="#/klijent/${c.id}">
            <div class="ava">${esc(initials(c))}</div>
            <div class="grow"><b>${esc(fullName(c))}</b><small>${esc(c.goal || 'Без циља')} · од ${fmtDate(c.startDate)}</small></div>
            <div class="small muted" style="text-align:right">${mstat.get(c.id) && mstat.get(c.id).state !== 'active' ? statusChip(mstat.get(c.id)) + '<br>' : ''}${l ? `Посљедњи: ${fmtDate(l.date)} <span class="chip st-${l.status}">${STATUS[l.status]}</span>` : 'Нема тренинга'}${n ? `<br>Сљедећи: ${fmtDate(n.date)}` : ''}</div>
          </a>`;
        }).join('') : `<p class="empty">${st.q ? 'Нема клијената за ову претрагу.' : st.archived ? 'Архива је празна.' : 'Још нема клијената. Додајте првог дугметом „Нови клијент“ или учитајте пробне податке у одјељку „Подаци“.'}</p>`}
      </div>
    </div></div>`;

  const q = main.querySelector('#q');
  q.oninput = () => { st.q = q.value; const pos = q.selectionStart; render(main).then(() => { const n = main.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); }); };
  main.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = () => { st.archived = b.dataset.arch === '1'; render(main); }));
  main.querySelector('[data-act="new"]').onclick = () => clientForm(null, (c) => { location.hash = `#/klijent/${c.id}`; });
}

/** Образац клијента (нови или измјена) */
export async function clientForm(client, onSaved) {
  const opts = await repo.getOptions();
  const c = client || { firstName: '', lastName: '', startDate: today(), goal: '', note: '', phone: '', email: '', sex: '', birthDate: '', heightCm: null, activity: null, consentDate: '', consentPhotos: 0 };
  const m = openModal({
    title: client ? 'Измјена клијента' : 'Нови клијент',
    body: `<form class="fgrid" id="cf" novalidate>
      <div class="field"><label for="fn">Име *</label><input id="fn" class="inp" name="firstName" value="${esc(c.firstName)}" autofocus autocomplete="off"></div>
      <div class="field"><label for="ln">Презиме *</label><input id="ln" class="inp" name="lastName" value="${esc(c.lastName)}" autocomplete="off"></div>
      <div class="field"><label for="sd">Датум почетка</label><input id="sd" class="inp" type="date" name="startDate" value="${esc(c.startDate || '')}"></div>
      <div class="field"><label for="gl">Циљ</label><input id="gl" class="inp" name="goal" list="goals" value="${esc(c.goal)}" autocomplete="off">
        <datalist id="goals">${opts.goalPresets.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div>
      <div class="field full"><label for="nt">Напомена (необавезно)</label><textarea id="nt" class="inp" name="note">${esc(c.note)}</textarea></div>
      <details class="full" ${client ? '' : 'open'}><summary class="lbl" style="cursor:pointer;min-height:40px;display:flex;align-items:center">Подаци за прорачуне (калипер, BMI, исхрана, пулсне зоне)</summary>
        <div class="fgrid" style="margin-top:8px">
          <div class="field"><span class="lbl">Пол</span><div class="seg" id="sexseg">${[['m', 'Мушки'], ['f', 'Женски']].map(([k, v]) => `<button type="button" data-sex="${k}" class="${c.sex === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
          <div class="field"><label for="bd">Датум рођења</label><input id="bd" class="inp" type="date" name="birthDate" value="${esc(c.birthDate || '')}"></div>
          <div class="field"><label for="hc">Висина (cm)</label><input id="hc" class="inp" name="heightCm" inputmode="decimal" value="${c.heightCm ? fmtNum(c.heightCm) : ''}" autocomplete="off"></div>
          <div class="field"><label for="ac">Ниво активности</label><select id="ac" class="inp" name="activity"><option value="">—</option>${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}" ${Number(k) === c.activity ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div></details>
      <details class="full"><summary class="lbl" style="cursor:pointer;min-height:40px;display:flex;align-items:center">Сагласност клијента (обрада података, фотографије)</summary>
        <div class="fgrid" style="margin-top:8px">
          <div class="field"><label for="cd">Датум потписане сагласности</label><input id="cd" class="inp" type="date" name="consentDate" value="${esc(c.consentDate || '')}"></div>
          <label class="row field" style="align-items:center"><input type="checkbox" name="consentPhotos" value="1" ${c.consentPhotos ? 'checked' : ''} style="width:24px;height:24px"> Дозвољено фотографисање напретка</label>
        </div></details>
      <details class="full"><summary class="lbl" style="cursor:pointer;min-height:40px;display:flex;align-items:center">Контакт (необавезно)</summary>
        <div class="fgrid" style="margin-top:8px">
          <div class="field"><label for="ph">Телефон</label><input id="ph" class="inp" name="phone" type="tel" value="${esc(c.phone || '')}"></div>
          <div class="field"><label for="em">Е-пошта</label><input id="em" class="inp" name="email" type="email" value="${esc(c.email || '')}"></div>
        </div></details>
      <p class="err full" id="cerr"></p>
    </form>`,
    foot: `<button class="btn" data-close>Одустани</button><button class="btn primary" id="csave">Сачувај</button>`,
  });
  let sex = c.sex || '';
  m.querySelectorAll('[data-sex]').forEach((b) => (b.onclick = () => { sex = sex === b.dataset.sex ? '' : b.dataset.sex; m.querySelectorAll('[data-sex]').forEach((x) => x.classList.toggle('on', x.dataset.sex === sex)); }));
  const submit = async () => {
    const fd = Object.fromEntries(new FormData(m.querySelector('#cf')));
    if (fd.startDate && !isValidDate(fd.startDate)) { m.querySelector('#cerr').textContent = 'Неисправан датум.'; return; }
    const h = parseNum(fd.heightCm);
    if (Number.isNaN(h)) { m.querySelector('#cerr').textContent = 'Висина мора бити број (нпр. 178).'; return; }
    Object.assign(fd, { sex, heightCm: h, activity: fd.activity ? Number(fd.activity) : null, consentPhotos: fd.consentPhotos ? 1 : 0 });
    const data = client ? { ...fd, id: client.id } : fd;
    let saved;
    try { saved = await repo.saveClient(data); } catch (e) { m.querySelector('#cerr').textContent = 'Није сачувано: ' + (e?.message || e); return; }
    closeModal(); toast('Клијент је сачуван.'); onSaved?.(saved);
  };
  m.querySelector('#csave').onclick = submit;
  m.querySelector('#cf').onsubmit = (e) => { e.preventDefault(); submit(); };
}
