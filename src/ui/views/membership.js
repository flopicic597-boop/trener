// Чланарина: уплате по клијенту, статус истека и преглед свих клијената.
import { repo, save, confirmDlg, toast, openModal, closeModal, fullName, initials } from '../core.js';
import { esc, fmtDate, fmtNum, parseNum, today, isValidDate, monthStart, addMonths, addDays } from '../../lib/util.js';
import { PAY_METHODS, suggestPeriod, periodEnd, membershipStatus, statusLabel } from '../../domain/membership.js';

export const statusOf = (payments, opts) => membershipStatus(payments, today(), opts.membershipWarnDays ?? 7);
export const statusChip = (s) => { const l = statusLabel(s, fmtDate); return `<span class="chip ${l.cls}">${esc(l.text)}</span>`; };
const money = (v) => (v === null || v === undefined ? '—' : fmtNum(v) + ' €');

/** Картица „Чланарина“ на профилу клијента */
export async function renderClientMembership(root, c) {
  const [payments, opts] = await Promise.all([repo.listPayments({ clientId: c.id }), repo.getOptions()]);
  const s = statusOf(payments, opts);
  const l = statusLabel(s, fmtDate);
  const total = payments.reduce((a, p) => a + (p.amount || 0), 0);
  const re = () => renderClientMembership(root, c);
  root.innerHTML = `<div class="stack">
    <div class="banner ${l.cls === 'ok' ? 'info' : l.cls === 'muted' ? 'info' : l.cls}"><div style="flex:1">
      <div class="eyebrow">Чланарина</div><b style="font-size:20px">${esc(l.text)}</b>
      ${s.lastPaid ? `<div class="small">Посљедња уплата: ${fmtDate(s.lastPaid.paidDate)}${s.lastPaid.amount !== null ? ' · ' + money(s.lastPaid.amount) : ''}</div>` : '<div class="small">Унесите прву уплату дугметом испод.</div>'}</div>
      <button class="btn primary big" data-new>+ Нова уплата</button></div>
    <section class="card">
      <div class="pad row between"><h3>Уплате</h3><span class="small muted">Укупно уплаћено: <b>${money(total)}</b> · уплата: ${payments.length}</span></div>
      ${payments.length ? `<div class="wide-only tscroll"><table class="tbl"><thead><tr><th>Датум уплате</th><th>Плаћени период</th><th class="r">Износ</th><th>Начин</th><th>Напомена</th><th></th></tr></thead><tbody>
        ${payments.map((p) => `<tr><td class="num">${fmtDate(p.paidDate)}</td><td class="num">${fmtDate(p.periodFrom)} – ${fmtDate(p.periodTo)}</td><td class="r num">${money(p.amount)}</td><td>${esc(PAY_METHODS[p.method] || '—')}</td><td class="small">${esc(p.note || '')}</td>
          <td class="r"><button class="btn sm" data-edit="${p.id}">Измијени</button> <button class="btn sm danger" data-del="${p.id}">Обриши</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="cards list">${payments.map((p) => `<div class="litem" style="cursor:default"><div class="grow"><b>${fmtDate(p.periodFrom)} – ${fmtDate(p.periodTo)}</b>
        <small>Уплаћено ${fmtDate(p.paidDate)} · ${money(p.amount)}${p.method ? ' · ' + esc(PAY_METHODS[p.method]) : ''}${p.note ? ' · ' + esc(p.note) : ''}</small></div>
        <div class="row"><button class="btn sm" data-edit="${p.id}">Измијени</button><button class="btn sm danger" data-del="${p.id}">Обриши</button></div></div>`).join('')}</div>`
      : '<p class="empty">Још нема уплата.</p>'}
    </section></div>`;
  root.querySelector('[data-new]').onclick = () => paymentForm(c, null, re);
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => paymentForm(c, payments.find((p) => p.id === b.dataset.edit), re)));
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const p = payments.find((x) => x.id === b.dataset.del);
    if (!(await confirmDlg(`Обрисати уплату од ${fmtDate(p.paidDate)} (период ${fmtDate(p.periodFrom)} – ${fmtDate(p.periodTo)})?`, { okText: 'Обриши', danger: true }))) return;
    if (await save(() => repo.deletePayment(p.id))) { toast('Уплата је обрисана.'); re(); }
  }));
}

/** Образац уплате (нова или измјена) */
export async function paymentForm(c, payment, onSaved) {
  const [payments, opts] = await Promise.all([repo.listPayments({ clientId: c.id }), repo.getOptions()]);
  const others = payments.filter((p) => !payment || p.id !== payment.id);
  const months0 = opts.membershipMonths || 1;
  const p = payment || { paidDate: today(), amount: opts.membershipPrice ?? null, method: 'cash', note: '', ...suggestPeriod(others, today(), months0) };
  if (!payment) { p.periodFrom = p.from; p.periodTo = p.to; }
  let manual = !!payment; // корисник је ручно мијењао период
  const m = openModal({
    title: `${payment ? 'Измјена уплате' : 'Нова уплата'} · ${fullName(c)}`,
    body: `<form class="fgrid" id="pf" novalidate>
      <div class="field"><label for="p-paid">Датум уплате</label><input id="p-paid" class="inp" type="date" value="${esc(p.paidDate)}"></div>
      <div class="field"><label for="p-amt">Износ (€)</label><input id="p-amt" class="inp" inputmode="decimal" autocomplete="off" placeholder="нпр. 35" value="${p.amount === null || p.amount === undefined ? '' : fmtNum(p.amount)}"></div>
      <div class="field full"><span class="lbl">Трајање</span><div class="chips">${[1, 2, 3, 6, 12].map((n) => `<button type="button" class="qchip ${n === months0 && !payment ? 'on' : ''}" data-mon="${n}">${n} ${n === 1 ? 'мјесец' : n < 5 ? 'мјесеца' : 'мјесеци'}</button>`).join('')}</div></div>
      <div class="field"><label for="p-from">Плаћено од</label><input id="p-from" class="inp" type="date" value="${esc(p.periodFrom)}"></div>
      <div class="field"><label for="p-to">Плаћено до (закључно)</label><input id="p-to" class="inp" type="date" value="${esc(p.periodTo)}"></div>
      <div class="field full"><span class="lbl">Начин плаћања</span><div class="chips">${Object.entries(PAY_METHODS).map(([k, v]) => `<button type="button" class="qchip ${p.method === k ? 'on' : ''}" data-meth="${k}">${v}</button>`).join('')}</div></div>
      <div class="field full"><label for="p-note">Напомена (необавезно)</label><input id="p-note" class="inp" value="${esc(p.note || '')}" autocomplete="off"></div>
      <p class="small muted full" id="p-hint"></p>
      <p class="err full" id="perr"></p>
    </form>`,
    foot: `<button class="btn" data-close>Одустани</button><button class="btn primary" id="psave">Сачувај уплату</button>`,
  });
  const $ = (s) => m.querySelector(s);
  let months = months0, method = p.method || 'cash';
  const hint = () => {
    const f = $('#p-from').value, t = $('#p-to').value;
    const lastTo = others.map((x) => x.periodTo).sort().pop();
    $('#p-hint').textContent = isValidDate(f) && isValidDate(t) ? `Чланарина ће важити до ${fmtDate(t)}${lastTo && f > addDays(lastTo, 1) ? ` Између претходног периода (до ${fmtDate(lastTo)}) и овог постоји прекид.` : ''}` : '';
  };
  const recalc = () => {
    if (manual) return hint();
    const paid = $('#p-paid').value;
    if (!isValidDate(paid)) return;
    const s = suggestPeriod(others, paid, months);
    $('#p-from').value = s.from; $('#p-to').value = s.to; hint();
  };
  $('#p-paid').onchange = recalc;
  m.querySelectorAll('[data-mon]').forEach((b) => (b.onclick = () => {
    months = Number(b.dataset.mon);
    m.querySelectorAll('[data-mon]').forEach((x) => x.classList.toggle('on', x === b));
    const f = $('#p-from').value;
    if (isValidDate(f)) { $('#p-to').value = periodEnd(f, months); hint(); }
  }));
  $('#p-from').onchange = () => { manual = true; const f = $('#p-from').value; if (isValidDate(f)) $('#p-to').value = periodEnd(f, months); hint(); };
  $('#p-to').onchange = () => { manual = true; hint(); };
  m.querySelectorAll('[data-meth]').forEach((b) => (b.onclick = () => { method = b.dataset.meth; m.querySelectorAll('[data-meth]').forEach((x) => x.classList.toggle('on', x === b)); }));
  hint();
  const submit = async () => {
    const amount = parseNum($('#p-amt').value);
    if (Number.isNaN(amount)) { $('#perr').textContent = 'Износ: унесите број (нпр. 35 или 35,50).'; $('#p-amt').classList.add('bad'); return; }
    const data = { clientId: c.id, paidDate: $('#p-paid').value, amount, periodFrom: $('#p-from').value, periodTo: $('#p-to').value, method, note: $('#p-note').value };
    if (payment) data.id = payment.id;
    try { await repo.savePayment(data); } catch (e) { $('#perr').textContent = 'Није сачувано: ' + (e?.message || e); return; }
    closeModal(); toast('Уплата је сачувана.'); onSaved?.();
  };
  $('#psave').onclick = submit;
  $('#pf').onsubmit = (e) => { e.preventDefault(); submit(); };
}

/* ------------------------------------------------------------------ */
/* Страница „Чланарине“: сви активни клијенти                           */
/* ------------------------------------------------------------------ */
const st = { filter: 'all' };
const ORDER = { expired: 0, expiring: 1, none: 2, future: 3, active: 4 };

/** Статус свих (неархивираних) клијената */
export async function allStatuses() {
  const [clients, payments, opts] = await Promise.all([repo.listClients(), repo.listPayments(), repo.getOptions()]);
  const by = new Map(clients.map((c) => [c.id, []]));
  for (const p of payments) if (by.has(p.clientId)) by.get(p.clientId).push(p);
  return { opts, payments, rows: clients.map((c) => ({ c, s: statusOf(by.get(c.id), opts) })) };
}

export async function render(main) {
  const { rows, payments, opts } = await allStatuses();
  const cnt = { expired: 0, expiring: 0, active: 0, none: 0, future: 0 };
  for (const r of rows) cnt[r.s.state]++;
  const m0 = monthStart(today()), m1 = addDays(addMonths(m0, 1), -1);
  const monthSum = payments.filter((p) => p.paidDate >= m0 && p.paidDate <= m1).reduce((a, p) => a + (p.amount || 0), 0);
  const monthN = payments.filter((p) => p.paidDate >= m0 && p.paidDate <= m1).length;
  const F = [['all', `Сви (${rows.length})`], ['expired', `Истекле (${cnt.expired})`], ['expiring', `Истичу (${cnt.expiring})`], ['active', `Плаћено (${cnt.active + cnt.future})`], ['none', `Без уплата (${cnt.none})`]];
  const list = rows
    .filter((r) => st.filter === 'all' || r.s.state === st.filter || (st.filter === 'active' && r.s.state === 'future'))
    .sort((a, b) => ORDER[a.s.state] - ORDER[b.s.state] || (a.s.to || '').localeCompare(b.s.to || ''));
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Уплате и истек</div><h1>Чланарине</h1></div></div>
    <div class="cmp">
      <div class="c"><div class="lbl">Истекле</div><div class="v ${cnt.expired ? 'down' : ''}">${cnt.expired}</div></div>
      <div class="c"><div class="lbl">Истичу за ${opts.membershipWarnDays ?? 7} дана</div><div class="v">${cnt.expiring}</div></div>
      <div class="c"><div class="lbl">Плаћено</div><div class="v up">${cnt.active + cnt.future}</div></div>
      <div class="c"><div class="lbl">Уплаћено у овом мјесецу</div><div class="v">${fmtNum(monthSum)} €</div><div class="small muted">уплата: ${monthN}</div></div>
    </div>
    <section class="card">
      <div class="pad"><div class="seg" style="flex-wrap:wrap">${F.map(([k, v]) => `<button data-f="${k}" class="${st.filter === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <div class="list">${list.length ? list.map(({ c, s }) => `<div class="litem" style="cursor:default">
          <a class="ava" href="#/klijent/${c.id}/clanarina" style="text-decoration:none">${esc(initials(c))}</a>
          <a class="grow" href="#/klijent/${c.id}/clanarina" style="text-decoration:none;color:inherit"><b>${esc(fullName(c))}</b>
            <small>${s.lastPaid ? `Посљедња уплата ${fmtDate(s.lastPaid.paidDate)} · ${money(s.lastPaid.amount)}` : 'Нема уплата'}</small></a>
          <div class="row">${statusChip(s)}<button class="btn sm primary" data-pay="${c.id}">+ Уплата</button></div></div>`).join('')
        : '<p class="empty">Нема клијената у овој групи.</p>'}</div>
    </section>
    <p class="small muted">Статус се рачуна на основу посљедњег плаћеног периода. Колико дана прије истека се приказује упозорење и подразумијевани износ подешавате у „Подаци и копије → Изборне вриједности“.</p>
  </div>`;
  main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; render(main); }));
  main.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => paymentForm(rows.find((r) => r.c.id === b.dataset.pay).c, null, () => render(main))));
}
