// Чланарина: уплате по клијенту, статус истека и преглед свих клијената.
import { repo, save, confirmDlg, toast, openModal, closeModal, fullName, initials } from '../core.js';
import { esc, fmtDate, fmtNum, parseNum, today, isValidDate, monthStart, addMonths, addDays } from '../../lib/util.js';
import { PAY_METHODS, suggestPeriod, periodEnd, membershipStatus, statusLabel, packageStatus, monthlyIncome } from '../../domain/membership.js';
import { barChart, dataTable, chartCard, bindChartToggles } from '../../charts/charts.js';

export const statusOf = (payments, opts) => membershipStatus(payments, today(), opts.membershipWarnDays ?? 7);
export const statusChip = (s) => { const l = statusLabel(s, fmtDate); return `<span class="chip ${l.cls}">${esc(l.text)}</span>`; };
const money = (v) => (v === null || v === undefined ? '—' : fmtNum(v) + ' €');
export const PKG_CHIP = (o) => o.state === 'used' ? '<span class="chip muted">искоришћен</span>' : o.state === 'low' ? `<span class="chip warn">остало ${o.remaining}</span>` : o.state === 'future' ? '<span class="chip muted">почиње касније</span>' : `<span class="chip ok">остало ${o.remaining}</span>`;

/** Образац пакета тренинга */
function packageForm(c, p0, onSaved) {
  const p = p0 || { name: '', total: 12, startDate: today(), price: null, paidDate: today(), note: '' };
  const m = openModal({
    title: (p0 ? 'Измјена пакета' : 'Нови пакет тренинга') + ' · ' + fullName(c),
    body: `<div class="fgrid">
      <div class="field"><label for="k-total">Број тренинга *</label><input id="k-total" class="inp" inputmode="numeric" value="${p.total}"></div>
      <div class="field"><span class="lbl">Брзи избор</span><div class="chips">${[4, 8, 10, 12, 16, 20].map((n) => `<button type="button" class="qchip" data-n="${n}">${n}</button>`).join('')}</div></div>
      <div class="field"><label for="k-start">Почетак (одбијају се тренинзи од овог дана)</label><input id="k-start" class="inp" type="date" value="${esc(p.startDate)}"></div>
      <div class="field"><label for="k-price">Цијена (€, необавезно)</label><input id="k-price" class="inp" inputmode="decimal" value="${p.price === null || p.price === undefined ? '' : fmtNum(p.price)}"></div>
      <div class="field"><label for="k-paid">Датум уплате</label><input id="k-paid" class="inp" type="date" value="${esc(p.paidDate || '')}"></div>
      <div class="field"><label for="k-name">Назив (необавезно)</label><input id="k-name" class="inp" value="${esc(p.name || '')}" placeholder="нпр. Персонални 12"></div>
      <div class="field full"><label for="k-note">Напомена</label><input id="k-note" class="inp" value="${esc(p.note || '')}"></div>
      <p class="err full" id="k-err"></p></div>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="k-ok">Сачувај</button>',
  });
  m.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { m.querySelector('#k-total').value = b.dataset.n; }));
  m.querySelector('#k-ok').onclick = async () => {
    const total = parseNum(m.querySelector('#k-total').value), price = parseNum(m.querySelector('#k-price').value);
    if (!Number.isInteger(total) || Number.isNaN(price)) { m.querySelector('#k-err').textContent = 'Број тренинга мора бити цио број, а цијена број.'; return; }
    const paid = m.querySelector('#k-paid').value;
    if (paid && !isValidDate(paid)) { m.querySelector('#k-err').textContent = 'Неисправан датум уплате.'; return; }
    const data = { clientId: c.id, total, price, startDate: m.querySelector('#k-start').value, paidDate: paid, name: m.querySelector('#k-name').value, note: m.querySelector('#k-note').value };
    if (p0) data.id = p0.id;
    try { await repo.savePackage(data); } catch (e) { m.querySelector('#k-err').textContent = e.message; return; }
    closeModal(); toast('Пакет је сачуван.'); onSaved?.();
  };
}

/** Картица „Чланарина“ на профилу клијента */
export async function renderClientMembership(root, c) {
  const [payments, opts] = await Promise.all([repo.listPayments({ clientId: c.id }), repo.getOptions()]);
  const s = statusOf(payments, opts);
  const l = statusLabel(s, fmtDate);
  const total = payments.reduce((a, p) => a + (p.amount || 0), 0);
  const re = () => renderClientMembership(root, c);
  const [pkgs, sessions] = await Promise.all([repo.listPackages({ clientId: c.id }), repo.listSessions({ clientId: c.id })]);
  const pst = packageStatus(pkgs, sessions, today()).reverse();
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
    </section>
    <section class="card">
      <div class="pad row between"><div><h3>Пакети тренинга</h3><p class="small muted">Сваки тренинг са статусом „Завршен“ аутоматски се одбија од пакета (редом, од најстаријег).</p></div><button class="btn primary" data-newpkg>+ Нови пакет</button></div>
      <div class="list">${pst.length ? pst.map((o) => `<div class="litem" style="cursor:default;flex-wrap:wrap">
        <div class="grow"><b>${esc(o.pkg.name || 'Пакет ' + o.pkg.total + ' тренинга')} ${PKG_CHIP(o)}</b>
          <small>Од ${fmtDate(o.pkg.startDate)} · искоришћено ${o.used} од ${o.pkg.total}${o.lastDate ? ' · посљедњи ' + fmtDate(o.lastDate) : ''}${o.pkg.price !== null && o.pkg.price !== undefined ? ' · ' + money(o.pkg.price) : ''}${o.pkg.note ? ' · ' + esc(o.pkg.note) : ''}</small>
          <div style="height:8px;border-radius:6px;background:var(--line);overflow:hidden;margin-top:6px;max-width:360px"><div style="height:100%;width:${Math.min(100, (o.used / o.pkg.total) * 100).toFixed(1)}%;background:var(--grad)"></div></div></div>
        <div class="row"><button class="btn sm" data-epkg="${o.pkg.id}">Измијени</button><button class="btn sm danger" data-dpkg="${o.pkg.id}">Обриши</button></div></div>`).join('') : '<p class="empty">Нема пакета.</p>'}</div>
    </section></div>`;
  root.querySelector('[data-newpkg]').onclick = () => packageForm(c, null, re);
  root.querySelectorAll('[data-epkg]').forEach((b) => (b.onclick = () => packageForm(c, pkgs.find((p) => p.id === b.dataset.epkg), re)));
  root.querySelectorAll('[data-dpkg]').forEach((b) => (b.onclick = async () => {
    const p = pkgs.find((x) => x.id === b.dataset.dpkg);
    if (await confirmDlg(`Обрисати пакет од ${p.total} тренинга (${fmtDate(p.startDate)})? Тренинзи остају, само се више не одбијају од овог пакета.`, { okText: 'Обриши', danger: true }) && (await save(() => repo.deletePackage(p.id))) !== null) { toast('Пакет је обрисан.'); re(); }
  }));
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
  const allPkgs = await repo.listPackages();
  const inc = monthlyIncome(payments, allPkgs, 12, today());
  const MONTHS_SHORT = ['јан', 'феб', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'нов', 'дец'];
  const incLabel = (k) => MONTHS_SHORT[Number(k.slice(5)) - 1] + ' ' + k.slice(2, 4);
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
    ${chartCard('inc', 'Приход по мјесецима (чланарине и пакети, €)', barChart(inc.map((p) => ({ label: incLabel(p.x), value: Math.round(p.y) }))), dataTable(['Мјесец', 'Приход (€)'], inc.map((p) => [incLabel(p.x), fmtNum(p.y)])), `<p class="small muted">Укупно за 12 мјесеци: <b>${fmtNum(inc.reduce((a, p) => a + p.y, 0))} €</b> · просјечно мјесечно ${fmtNum(inc.reduce((a, p) => a + p.y, 0) / 12, 0)} €. Пакети се рачунају по датуму уплате.</p>`)}
    <p class="small muted">Статус се рачуна на основу посљедњег плаћеног периода. Колико дана прије истека се приказује упозорење и подразумијевани износ подешавате у „Подаци и копије → Изборне вриједности“.</p>
  </div>`;
  main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; render(main); }));
  bindChartToggles(main);
  main.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => paymentForm(rows.find((r) => r.c.id === b.dataset.pay).c, null, () => render(main))));
}
