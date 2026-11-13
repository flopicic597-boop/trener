// Подаци: резервна копија (JSON), увоз са спајањем, CSV, снимци, пробни подаци, изборне вриједности.
import { repo, db, save, flushSaves, confirmDlg, toast, openModal, closeModal, fullName } from '../core.js';
import { esc, fmtDateTime, fmtNum, parseNum, daysBetween, today } from '../../lib/util.js';
import { exportBackup, validateBackup, analyzeImport, applyImport, createSnapshot, replaceAll, backupFileName, describeRecord, TABLE_LABEL, APP_VERSION, FORMAT_VERSION } from '../../io/backup.js';
import { SCHEMA_VERSION } from '../../data/db.js';
import { loadDemo } from '../../data/demo.js';
import { downloadText, shareText } from '../download.js';
import { buildRows, exportCsv } from './overview.js';
import { normalizeTempo } from '../../domain/rules.js';
import { paymentsCsv, findingsCsv } from '../../io/csv.js';

export async function render(main) {
  const [last, demoN, opts, snaps, persisted, est] = await Promise.all([
    repo.getMeta('lastBackupAt'), repo.countDemo(), repo.getOptions(), db.snapshots.orderBy('createdAt').reverse().toArray(),
    navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null),
    navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(null),
  ]);
  const age = last ? daysBetween(last.slice(0, 10), today()) : null;
  main.innerHTML = `<div class="wrap">
    <div class="phead"><div><div class="eyebrow">Пренос и резервне копије</div><h1>Подаци</h1></div></div>

    <div class="banner ${!last || age > 7 ? 'warn' : 'info'}"><div>
      <b>Посљедња резервна копија: ${last ? fmtDateTime(last) : 'још није направљена'}</b>${age > 7 ? ` (прије ${age} дана)` : ''}<br>
      <span class="small">Подаци се чувају само локално у овом прегледачу на овом уређају. <b>Локално чување није резервна копија</b>: брисање података апликације или прегледача, деинсталација или квар уређаја трајно уклањају записе. Редовно правите JSON копију и сачувајте је ван уређаја.</span></div></div>

    <section class="card pad stack">
      <h2>1. Резервна копија (JSON)</h2>
      <p class="small">Садржи све клијенте, вјежбе, програме, тренинге, серије, уплате чланарине, налазе са приложеним датотекама и изборне вриједности (UTF-8). Приложени PDF-ови и слике повећавају величину датотеке. Ова датотека служи и за пренос на компјутер.</p>
      <div class="row"><button class="btn primary big" data-exp>Сачувај резервну копију</button><button class="btn big" data-share>Подијели датотеку…</button></div>
      <p class="small muted">„Сачувај“ спушта датотеку у фасциклу Преузимања (Download). „Подијели“ отвара Android дијељење (Quick Share, е-пошта, Google Drive…), ако га уређај подржава.</p>
    </section>

    <section class="card pad stack">
      <h2>2. Увоз на овом уређају</h2>
      <div class="banner info small"><div><b>Пренос датотеком није аутоматска синхронизација.</b> Измјене се преносе тек када на једном уређају направите резервну копију и увезете је на другом. Поновни увоз исте датотеке не прави дупликате (записи имају сталне идентификаторе). Ако је исти запис мијењан на оба уређаја, апликација вас пита коју верзију да задржи.</div></div>
      <div class="row"><label class="btn primary big" style="cursor:pointer">Изабери JSON датотеку за увоз<input type="file" accept=".json,application/json" data-imp hidden></label></div>
      <p class="small muted">Прије сваког увоза аутоматски се прави локални снимак тренутног стања (одјељак 4).</p>
      <details><summary class="lbl" style="cursor:pointer;min-height:40px;display:flex;align-items:center">Потпуна замјена (враћање из копије)</summary>
        <p class="small">Брише СВЕ тренутне податке на овом уређају и замјењује их садржајем датотеке. Користите за опоравак (нпр. нови таблет). Прије замјене се прави снимак.</p>
        <label class="btn danger" style="cursor:pointer">Изабери датотеку за замјену<input type="file" accept=".json,application/json" data-rep hidden></label></details>
    </section>

    <section class="card pad stack">
      <h2>3. CSV за Excel</h2>
      <p class="small">UTF-8 са BOM ознаком (ћирилица исправна у Excel-у), раздвајач тачка-зарез, децимални зарез. За филтриран извоз користите дугмад у „Преглед по данима“.</p>
      <div class="row"><button class="btn" data-csv="daily">Дневни преглед (сви тренинзи)</button><button class="btn" data-csv="sets">Детаљне серије (све)</button><button class="btn" data-csv2="pay">Уплате чланарине</button><button class="btn" data-csv2="find">Вриједности налаза</button></div>
    </section>

    <section class="card pad stack">
      <h2>4. Локални снимци прије увоза</h2>
      ${snaps.length ? `<div class="list">${snaps.map((s) => `<div class="litem" style="cursor:default"><div class="grow"><b>${fmtDateTime(s.createdAt)}</b><small>${esc(s.reason)} · клијената: ${s.backup.counts.clients}, тренинга: ${s.backup.counts.sessions}</small></div>
        <div class="row"><button class="btn sm" data-sdl="${s.id}">Преузми</button><button class="btn sm danger" data-sres="${s.id}">Врати</button></div></div>`).join('')}</div>` : '<p class="muted small">Нема снимака.</p>'}
      <p class="small muted">Чува се посљедњих 5 снимака, у истој локалној бази — нису замјена за резервну копију ван уређаја.</p>
    </section>

    <section class="card pad stack">
      <h2>5. Простор за чување</h2>
      <p class="small">Трајно чување: <b>${persisted === null ? 'прегледач не даје податак' : persisted ? 'одобрено (прегледач неће сам брисати податке при мањку простора)' : 'није одобрено'}</b>${est ? ` · заузето око ${fmtNum((est.usage || 0) / 1048576, 1)} MB` : ''}</p>
      ${persisted === false ? '<button class="btn" data-persist>Затражи трајно чување</button><p class="small muted">Chrome одобрава ово аутоматски, најчешће када је апликација инсталирана на почетни екран. Ни трајно чување не штити од ручног брисања података.</p>' : ''}
    </section>

    <section class="card pad stack">
      <h2>6. Пробни подаци</h2>
      <p class="small">Пробни клијенти, програми и тренинзи служе за упознавање са апликацијом. Означени су засебно и уклањају се без утицаја на стварне податке.</p>
      <div class="row">${demoN ? `<span class="chip warn">Учитано пробних записа: ${demoN}</span><button class="btn danger" data-demo-rm>Уклони пробне податке</button>` : '<button class="btn" data-demo>Учитај пробне податке</button>'}</div>
    </section>

    <section class="card pad stack">
      <h2>7. Изборне вриједности</h2>
      <p class="small">Ове листе мијењате сами, без надоградње апликације. Одвојите вриједности зарезом или тачка-зарезом.</p>
      <form class="fgrid" id="of">
        <div class="field"><label for="o-rest">Брзе паузе (сек.)</label><input id="o-rest" class="inp" name="restPresets" value="${opts.restPresets.join('; ')}"></div>
        <div class="field"><label for="o-tempo">Брзи темпо</label><input id="o-tempo" class="inp" name="tempoPresets" value="${opts.tempoPresets.join('; ')}"></div>
        <div class="field"><label for="o-sleep">Брзи избор сна (сати)</label><input id="o-sleep" class="inp" name="sleepPresets" value="${opts.sleepPresets.map((v) => fmtNum(v)).join('; ')}"></div>
        <div class="field"><label for="o-dur">Брзо трајање (сек.)</label><input id="o-dur" class="inp" name="durationPresets" value="${opts.durationPresets.join('; ')}"></div>
        <div class="field full"><label for="o-goal">Циљеви клијената</label><input id="o-goal" class="inp" name="goalPresets" value="${esc(opts.goalPresets.join('; '))}"></div>
        <div class="field"><label for="o-mm">Чланарина: трајање (мјесеци)</label><input id="o-mm" class="inp" name="membershipMonths" inputmode="numeric" value="${opts.membershipMonths ?? 1}"></div>
        <div class="field"><label for="o-mp">Чланарина: износ (€, необавезно)</label><input id="o-mp" class="inp" name="membershipPrice" inputmode="decimal" value="${opts.membershipPrice === null || opts.membershipPrice === undefined ? '' : fmtNum(opts.membershipPrice)}"></div>
        <div class="field"><label for="o-mw">Упозорење прије истека (дана)</label><input id="o-mw" class="inp" name="membershipWarnDays" inputmode="numeric" value="${opts.membershipWarnDays ?? 7}"></div>
        <div class="field full"><label for="o-cat">Категорије вјежби</label><input id="o-cat" class="inp" name="categories" value="${esc(opts.categories.join('; '))}"></div>
        <p class="err full" id="oerr"></p>
        <div class="full"><button class="btn primary" type="submit">Сачувај изборне вриједности</button></div>
      </form>
      <details><summary class="lbl" style="cursor:pointer">Шта могу сам да мијењам, а шта захтијева надоградњу?</summary>
        <div class="small stack" style="margin-top:8px">
          <p><b>Сами, у апликацији (подаци):</b> клијенти, вјежбе (назив, категорија, начин мјерења), програми, тренинзи, уплате и налази (уз своје параметре), брзе паузе/темпо/сан/трајање, циљеви, категорије и подешавања чланарине.</p>
          <p><b>Захтијева надоградњу кода:</b> нова поља (нпр. пулс, тјелесна мјерења), нове врсте графикона, облачна синхронизација, више тренера, PIN/шифровање. Надоградња користи миграције базе, па постојећи подаци остају.</p></div></details>
    </section>

    <p class="small muted">Верзија апликације ${esc(APP_VERSION)} · шема базе ${SCHEMA_VERSION} · формат резервне копије ${FORMAT_VERSION}</p>
  </div>`;

  const re = () => render(main);
  const doExport = async (share) => {
    await flushSaves();
    const b = await save(() => exportBackup(db));
    if (!b) return;
    const text = JSON.stringify(b, null, 1), name = backupFileName(b.exportedAt);
    if (share) { if (!(await shareText(text, name))) { toast('Дијељење није подржано — датотека је сачувана у Преузимања.'); downloadText(text, name); } }
    else { downloadText(text, name); toast('Резервна копија је сачувана: ' + name); }
    document.dispatchEvent(new CustomEvent('backup-done'));
    re();
  };
  main.querySelector('[data-exp]').onclick = () => doExport(false);
  main.querySelector('[data-share]').onclick = () => doExport(true);
  main.querySelector('[data-imp]').onchange = (e) => readFile(e.target, (obj) => importFlow(obj, re));
  main.querySelector('[data-rep]').onchange = (e) => readFile(e.target, (obj) => replaceFlow(obj, re));
  main.querySelectorAll('[data-csv]').forEach((b) => (b.onclick = async () => { const { rows, exMap } = await buildRows({ client: '', from: '', to: '', program: '', status: '' }); exportCsv(b.dataset.csv, rows, exMap); }));
  main.querySelectorAll('[data-csv2]').forEach((b) => (b.onclick = async () => {
    const clients = new Map((await repo.listClients({ includeArchived: true })).map((c) => [c.id, fullName(c)]));
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (b.dataset.csv2 === 'pay') {
      const rows = (await repo.listPayments()).filter((p) => clients.has(p.clientId)).map((p) => ({ p, clientName: clients.get(p.clientId) }));
      downloadText(paymentsCsv(rows), `trener-clanarine-${stamp}.csv`, 'text/csv;charset=utf-8');
    } else {
      const rows = (await repo.listFindings()).filter((f) => clients.has(f.clientId)).map((f) => ({ f, clientName: clients.get(f.clientId) }));
      downloadText(findingsCsv(rows), `trener-nalazi-${stamp}.csv`, 'text/csv;charset=utf-8');
    }
  }));
  main.querySelectorAll('[data-sdl]').forEach((b) => (b.onclick = () => { const s = snaps.find((x) => x.id === b.dataset.sdl); downloadText(JSON.stringify(s.backup, null, 1), backupFileName(s.createdAt, 'trener-snimak')); }));
  main.querySelectorAll('[data-sres]').forEach((b) => (b.onclick = async () => {
    const s = snaps.find((x) => x.id === b.dataset.sres);
    if (!(await confirmDlg(`Вратити стање од ${fmtDateTime(s.createdAt)}? Тренутни подаци ће бити замијењени (прије тога се прави нови снимак).`, { okText: 'Врати', danger: true }))) return;
    if ((await save(async () => { await createSnapshot(db, 'Прије враћања снимка'); await replaceAll(db, s.backup); return true; })) !== null) { toast('Стање је враћено.'); re(); }
  }));
  const pb = main.querySelector('[data-persist]');
  if (pb) pb.onclick = async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Трајно чување је одобрено.' : 'Прегледач није одобрио трајно чување. Инсталирајте апликацију на почетни екран и покушајте поново.'); re(); };
  const dl = main.querySelector('[data-demo]');
  if (dl) dl.onclick = async () => { if ((await save(() => loadDemo(db))) !== null) { toast('Пробни подаци су учитани.'); re(); } };
  const dr = main.querySelector('[data-demo-rm]');
  if (dr) dr.onclick = async () => {
    if (!(await confirmDlg('Трајно уклонити све пробне клијенте, програме и тренинге? Стварни подаци остају нетакнути.', { okText: 'Уклони пробне', danger: true }))) return;
    if ((await save(() => repo.removeDemo())) !== null) { toast('Пробни подаци су уклоњени.'); re(); }
  };
  main.querySelector('#of').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const split = (s) => s.split(/[;\n]|,(?!\d)/).map((x) => x.trim()).filter(Boolean);
    const nums = (s, label, max) => { const a = split(s).map(parseNum); if (a.some((v) => v === null || Number.isNaN(v) || v < 0 || v > max)) throw new Error(`${label}: само бројеви од 0 до ${max}.`); return a; };
    try {
      const tempos = split(fd.tempoPresets).map(normalizeTempo);
      if (tempos.some((t) => !t)) throw new Error('Темпо: свака вриједност мора имати четири броја, нпр. 3-1-1-0.');
      const cats = split(fd.categories); if (!cats.length) throw new Error('Потребна је бар једна категорија.');
      const mm = parseNum(fd.membershipMonths), mp = parseNum(fd.membershipPrice), mw = parseNum(fd.membershipWarnDays);
      if (!Number.isInteger(mm) || mm < 1 || mm > 24) throw new Error('Трајање чланарине: цио број мјесеци од 1 до 24.');
      if (Number.isNaN(mp) || (mp !== null && (mp < 0 || mp > 100000))) throw new Error('Износ чланарине: број или празно.');
      if (!Number.isInteger(mw) || mw < 0 || mw > 60) throw new Error('Упозорење: цио број дана од 0 до 60.');
      await repo.saveOptions({ membershipMonths: mm, membershipPrice: mp, membershipWarnDays: mw, restPresets: nums(fd.restPresets, 'Паузе', 3600), tempoPresets: tempos, sleepPresets: nums(fd.sleepPresets, 'Сан', 24), durationPresets: nums(fd.durationPresets, 'Трајање', 86400), goalPresets: split(fd.goalPresets), categories: cats });
      toast('Изборне вриједности су сачуване.'); re();
    } catch (err) { main.querySelector('#oerr').textContent = err.message; }
  };
}

function readFile(input, cb) {
  const f = input.files[0]; input.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let obj;
    try { obj = JSON.parse(String(r.result).replace(/^﻿/, '')); }
    catch { return showErrors(['Датотека није исправан JSON (можда је оштећена или није резервна копија).']); }
    cb(obj);
  };
  r.onerror = () => showErrors(['Датотеку није могуће прочитати.']);
  r.readAsText(f, 'utf-8');
}

function showErrors(errors) {
  openModal({ title: 'Увоз није могућ', body: `<div class="banner bad"><div><b>Датотека није увезена. Подаци на уређају нису мијењани.</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div></div>`, foot: '<button class="btn primary" data-close>У реду</button>' });
}

async function importFlow(obj, done) {
  await flushSaves();
  const v = validateBackup(obj);
  if (!v.ok) return showErrors(v.errors);
  const b = v.backup;
  const an = await analyzeImport(db, b);
  const clients = new Map([...(await db.clients.toArray()), ...(b.data.clients || [])].map((c) => [c.id, c]));
  const exs = new Map([...(await db.exercises.toArray()), ...(b.data.exercises || [])].map((e) => [e.id, e]));
  const ctx = { clientName: (id) => fullName(clients.get(id)), exName: (id) => exs.get(id)?.name || '?' };
  const LBL = { firstName: 'Име', lastName: 'Презиме', startDate: 'Почетак', goal: 'Циљ', note: 'Напомена', phone: 'Телефон', email: 'Е-пошта', archived: 'Архивиран', deleted: 'Обрисан',
    name: 'Назив', category: 'Категорија', type: 'Врста', date: 'Датум', time: 'Вријеме', programName: 'Програм', status: 'Статус', mood: 'Расположење', sleep: 'Сан',
    reps: 'Понављања', weightKg: 'Кг', durationSec: 'Трајање (с)', tempo: 'Темпо', restSec: 'Пауза', done: 'Завршено', position: 'Редни број', planReps: 'План пон.', planWeightKg: 'План кг', planDurationSec: 'План трајања',
    paidDate: 'Датум уплате', amount: 'Износ', periodFrom: 'Плаћено од', periodTo: 'Плаћено до', method: 'Начин', kind: 'Врста', title: 'Назив налаза', size: 'Величина' };
  const SKIP = ['data', 'values', 'text', 'findingId', 'mime', 'id', 'createdAt', 'updatedAt', 'items', 'clientId', 'sessionId', 'sessionExerciseId', 'exerciseId', 'programId', 'demo', 'builtin'];
  const fmtRec = (t, r, other) => {
    const keys = Object.keys(LBL).filter((k) => k in r && !SKIP.includes(k));
    // прво прикажи поља која се разликују
    const diff = keys.filter((k) => JSON.stringify(r[k]) !== JSON.stringify(other?.[k]));
    return [...diff, ...keys.filter((k) => !diff.includes(k))].slice(0, 8)
      .map((k) => `${diff.includes(k) ? '<b>' : ''}${LBL[k]}: ${esc(r[k] === null || r[k] === '' ? '—' : String(r[k]))}${diff.includes(k) ? '</b>' : ''}`).join(' · ');
  };
  const resolutions = {};
  const rows = Object.entries(an.summary).map(([t, s]) => `<tr><td>${TABLE_LABEL[t]}</td><td class="r num">${s.add}</td><td class="r num">${s.update}</td><td class="r num">${s.same}</td><td class="r num">${s.keep}</td><td class="r num ${s.conflict ? 'down' : ''}">${s.conflict}</td></tr>`).join('');
  const m = openModal({
    title: 'Сажетак увоза', wide: true,
    body: `<p class="small">Датотека: направљена <b>${fmtDateTime(b.exportedAt)}</b>, верзија апликације ${esc(b.appVersion || '?')}, формат ${b.formatVersion}.</p>
      ${v.warnings.length ? `<div class="banner warn small"><div>${v.warnings.map(esc).join('<br>')}</div></div>` : ''}
      <div class="tscroll"><table class="tbl"><thead><tr><th>Табела</th><th class="r">Нови</th><th class="r">Ажурирање</th><th class="r">Исти</th><th class="r">Остаје локално</th><th class="r">Сукоби</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">„Ажурирање“: запис није мијењан на овом уређају од посљедње размјене, у датотеци је новији. „Остаје локално“: на овом уређају постоји новија измјена. Ништа се не брише.</p>
      ${an.conflicts.length ? `<h3>Сукоби (${an.conflicts.length}) — изаберите верзију за сваки</h3>
        <div class="row"><button class="btn sm" data-all="local">Све: задржи ову (локалну)</button><button class="btn sm" data-all="incoming">Све: узми из датотеке</button></div>
        <div class="stack">${an.conflicts.map((c) => `<div class="card pad stack" data-key="${esc(c.key)}"><b>${esc(describeRecord(c.table, c.local, ctx))}</b>
          <label class="row" style="align-items:flex-start"><input type="radio" name="${esc(c.key)}" value="local" style="width:24px;height:24px"><span><b>Овај уређај</b> (измијењено ${fmtDateTime(c.local.updatedAt)})<br><span class="small muted">${fmtRec(c.table, c.local, c.incoming)}</span></span></label>
          <label class="row" style="align-items:flex-start"><input type="radio" name="${esc(c.key)}" value="incoming" style="width:24px;height:24px"><span><b>Датотека</b> (измијењено ${fmtDateTime(c.incoming.updatedAt)})<br><span class="small muted">${fmtRec(c.table, c.incoming, c.local)}</span></span></label></div>`).join('')}</div>` : '<p class="ok"><b>Нема сукоба.</b></p>'}
      <p class="err" id="ierr"></p>`,
    foot: '<button class="btn" data-close>Одустани</button><button class="btn primary" id="iok">Примијени увоз</button>',
  });
  m.querySelectorAll('[data-all]').forEach((b2) => (b2.onclick = () => m.querySelectorAll(`input[type=radio][value="${b2.dataset.all}"]`).forEach((r) => (r.checked = true))));
  m.querySelector('#iok').onclick = async () => {
    for (const c of an.conflicts) {
      const sel = m.querySelector(`input[name="${CSS.escape(c.key)}"]:checked`);
      if (!sel) { m.querySelector('#ierr').textContent = 'Изаберите верзију за сваки сукоб.'; return; }
      resolutions[c.key] = sel.value;
    }
    m.querySelector('#iok').disabled = true;
    try {
      await createSnapshot(db, 'Прије увоза датотеке од ' + fmtDateTime(b.exportedAt));
      const r = await applyImport(db, b, an, resolutions);
      closeModal(); toast(`Увоз је завршен. Уписано записа: ${r.written}.`); done();
    } catch (err) {
      m.querySelector('#iok').disabled = false;
      m.querySelector('#ierr').textContent = 'Увоз није успио, база није мијењана: ' + err.message;
    }
  };
}

async function replaceFlow(obj, done) {
  await flushSaves();
  const v = validateBackup(obj);
  if (!v.ok) return showErrors(v.errors);
  const c = v.backup.counts || {};
  if (!(await confirmDlg(`Замијенити СВЕ податке на овом уређају садржајем датотеке од ${fmtDateTime(v.backup.exportedAt)} (клијената: ${c.clients ?? '?'}, тренинга: ${c.sessions ?? '?'})? Прије замјене се прави локални снимак.`, { okText: 'Замијени све', danger: true }))) return;
  const ok = await save(async () => { await createSnapshot(db, 'Прије потпуне замјене'); await replaceAll(db, v.backup); await repo.init(); return true; });
  if (ok) { toast('Подаци су замијењени садржајем датотеке.'); done(); }
}
