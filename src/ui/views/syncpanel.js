// Одјељак „Аутоматски пренос“ на страници Подаци и копије: подешавање, пријава,
// лозинка за шифровање и стање.
import { esc, fmtDateTime } from '../../lib/util.js';
import { toast, confirmDlg } from '../core.js';
import * as cloud from '../../sync/auto.js';

export function syncSection() {
  return '<section class="card pad stack" id="syncsec"><h2>Аутоматски пренос (таблет ↔ рачунар)</h2><div id="syncbody"><p class="muted small">Учитавање…</p></div></section>';
}

export function bindSync(root) {
  const body = root.querySelector('#syncbody');
  const onStatus = () => { if (!body.isConnected) return document.removeEventListener('sync-status', onStatus); draw(); };
  document.addEventListener('sync-status', onStatus);

  const busy = (btn, fn) => async () => {
    const t = btn.textContent; btn.disabled = true; btn.textContent = 'Сачекајте…';
    const err = body.querySelector('.err'); if (err) err.textContent = '';
    try { await fn(); } catch (e) { const er = body.querySelector('.err'); if (er) er.textContent = e.message || String(e); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = t; } }
  };

  function draw() {
    const s = cloud.status();
    const intro = '<p class="small">Подаци се шифрују на овом уређају <b>вашом лозинком за шифровање</b> и тек онда шаљу у ваш Supabase пројекат; други уређај их преузима и дешифрује. Сервер не може да прочита клијенте, налазе ни прилоге. Локалне копије (JSON) и даље важе као додатна заштита.</p>';
    const err = `<p class="err">${s.error ? esc(s.error) : ''}</p>`;
    if (s.phase === 'off') {
      body.innerHTML = intro + `<div class="banner info small"><div>Пренос још није подешен. Унесите адресу и јавни кључ (Publishable key) вашег Supabase пројекта — <i>Project Settings → API Keys</i>.</div></div>
        <div class="fgrid"><div class="field full"><label for="sy-url">Адреса пројекта (Project URL)</label><input id="sy-url" class="inp" placeholder="https://xxxx.supabase.co" autocomplete="off"></div>
        <div class="field full"><label for="sy-key">Publishable key</label><input id="sy-key" class="inp" placeholder="sb_publishable_…" autocomplete="off"></div></div>
        <div class="row"><button class="btn primary" id="sy-cfg">Сачувај</button></div>${err}`;
      const b = body.querySelector('#sy-cfg'); b.onclick = busy(b, () => cloud.saveConfig(body.querySelector('#sy-url').value, body.querySelector('#sy-key').value));
    } else if (s.phase === 'login') {
      body.innerHTML = intro + `<div class="fgrid"><div class="field"><label for="sy-em">Е-пошта</label><input id="sy-em" class="inp" type="email" autocomplete="username"></div>
        <div class="field"><label for="sy-pw">Лозинка налога</label><input id="sy-pw" class="inp" type="password" autocomplete="current-password"></div></div>
        <div class="row"><button class="btn primary" id="sy-in">Пријава</button></div>${err}
        <p class="small muted">Налог прави власник у Supabase-у (<i>Authentication → Users → Add user</i>). Пријава се памти на уређају.</p>`;
      const b = body.querySelector('#sy-in'); b.onclick = busy(b, () => cloud.login(body.querySelector('#sy-em').value, body.querySelector('#sy-pw').value));
    } else if (s.phase === 'passphrase-new') {
      body.innerHTML = `<p>Пријављени сте као <b>${esc(s.email)}</b>. Ово је <b>први уређај</b>: поставите лозинку за шифровање.</p>
        <div class="banner warn small"><div><b>Запишите је и чувајте.</b> Потребна је на сваком уређају. Ако је изгубите, подаци на серверу се не могу дешифровати (подаци на уређајима остају). Ово није лозинка налога — изаберите другу, бар 10 знакова.</div></div>
        <div class="fgrid"><div class="field"><label for="sy-p1">Лозинка за шифровање</label><input id="sy-p1" class="inp" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="sy-p2">Поновите лозинку</label><input id="sy-p2" class="inp" type="password" autocomplete="new-password"></div></div>
        <div class="row"><button class="btn primary" id="sy-new">Постави и покрени пренос</button><button class="btn ghost" id="sy-out">Одјава</button></div>${err}`;
      const b = body.querySelector('#sy-new');
      b.onclick = busy(b, async () => {
        const p1 = body.querySelector('#sy-p1').value, p2 = body.querySelector('#sy-p2').value;
        if (p1 !== p2) throw new Error('Лозинке се не поклапају.');
        await cloud.createPassphrase(p1); toast('Аутоматски пренос је укључен.');
      });
      body.querySelector('#sy-out').onclick = () => cloud.logout();
    } else if (s.phase === 'passphrase') {
      body.innerHTML = `<p>Пријављени сте као <b>${esc(s.email)}</b>. Унесите <b>лозинку за шифровање</b> коју сте поставили на првом уређају.</p>
        <div class="fgrid"><div class="field"><label for="sy-p">Лозинка за шифровање</label><input id="sy-p" class="inp" type="password" autocomplete="current-password"></div></div>
        <div class="row"><button class="btn primary" id="sy-un">Откључај и покрени пренос</button><button class="btn ghost" id="sy-out">Одјава</button></div>${err}`;
      const b = body.querySelector('#sy-un'); b.onclick = busy(b, async () => { await cloud.unlock(body.querySelector('#sy-p').value); toast('Аутоматски пренос је укључен.'); });
      body.querySelector('#sy-out').onclick = () => cloud.logout();
    } else {
      body.innerHTML = `<div class="banner ${s.error ? 'bad' : 'info'}"><div style="flex:1"><b>${s.error ? 'Пренос тренутно не ради' : 'Аутоматски пренос је укључен'}</b><br>
          <span class="small">Налог: ${esc(s.email || '')} · посљедњи пренос: ${s.last ? fmtDateTime(s.last) : 'још није'}${s.running ? ' · у току…' : ''}</span>
          ${s.error ? `<br><span class="small">${esc(s.error)}</span>` : ''}</div>
        <button class="btn primary" id="sy-now" ${s.running ? 'disabled' : ''}>Пренеси сада</button></div>
        <p class="small muted">Пренос ради сам: при отварању апликације, сваки минут док је отворена, неколико секунди послије уноса и при изласку из апликације. Потребан је интернет; без њега се све чува локално и шаље чим се веза врати. Пробни подаци се не преносе.</p>
        <div class="row"><button class="btn ghost" id="sy-out">Одјава са овог уређаја</button></div>`;
      body.querySelector('#sy-now').onclick = async () => { const r = await cloud.syncNow(); if (r) toast(`Пренос завршен: послато ${r.pushed}, примљено ${r.pulled}.`); };
      body.querySelector('#sy-out').onclick = async () => {
        if (await confirmDlg('Одјавити овај уређај са аутоматског преноса? Подаци на уређају остају; поновна пријава тражи лозинку налога и лозинку за шифровање.', { okText: 'Одјава' })) cloud.logout();
      };
    }
  }
  draw();
}
