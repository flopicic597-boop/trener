// Улазна тачка: распоред, навигација, регистрација service worker-а (рад без интернета).
import '@fontsource/roboto-condensed/cyrillic-700.css';
import '@fontsource/roboto-condensed/latin-700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { repo, flushSaves, hasUnsaved, ICONS, lastBackupText, toast } from './ui/core.js';
import * as clients from './ui/views/clients.js';
import * as client from './ui/views/client.js';
import * as session from './ui/views/session.js';
import * as programs from './ui/views/programs.js';
import * as overview from './ui/views/overview.js';
import * as progress from './ui/views/progress.js';
import * as library from './ui/views/library.js';
import * as data from './ui/views/data.js';
import { esc } from './lib/util.js';

const NAV = [
  ['klijenti', 'Клијенти', ICONS.users],
  ['pregled', 'Преглед по данима', ICONS.cal],
  ['napredak', 'Напредак', ICONS.chart],
  ['programi', 'Програми', ICONS.list],
  ['biblioteka', 'Библиотека вјежби', ICONS.dumbbell],
  ['podaci', 'Подаци и копије', ICONS.data],
];
const ROUTES = {
  klijenti: [clients.render, 'klijenti'],
  klijent: [client.render, 'klijenti'],
  trening: [session.render, 'klijenti'],
  pregled: [overview.render, 'pregled'],
  napredak: [progress.render, 'napredak'],
  programi: [programs.render, 'programi'],
  program: [programs.renderEditor, 'programi'],
  biblioteka: [library.render, 'biblioteka'],
  podaci: [data.render, 'podaci'],
};

function shell() {
  document.getElementById('app').innerHTML = `<div class="app">
    <aside class="side">
      <div class="brand"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6c90f2" stroke-width="2.4" aria-hidden="true"><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>
        <div><b>Тренер</b><small>евиденција</small></div></div>
      <nav class="nav" aria-label="Главна навигација">${NAV.map(([k, label, ico]) => `<a href="#/${k}" data-nav="${k}">${ico}<span>${label}</span></a>`).join('')}</nav>
      <div class="side-foot"><div>Резервна копија:<br><b id="lastbk" style="color:var(--side-fg)">…</b></div>
        <button id="theme">Тема: аутоматски</button><div>Ради без интернета. Подаци остају на овом уређају.</div></div>
    </aside>
    <main class="main" id="main" tabindex="-1"></main></div>
    <div id="savebar" class="savebar" role="status" aria-live="polite"><span class="dot"></span><span class="txt">Сви подаци су сачувани</span></div>
    <div id="update" class="banner warn" hidden style="position:fixed;left:12px;right:12px;bottom:64px;z-index:45;max-width:640px;margin:auto"></div>`;
}

async function route() {
  await flushSaves();
  const parts = (location.hash.replace(/^#\/?/, '') || 'klijenti').split('/').map(decodeURIComponent);
  const [view, ...params] = parts;
  const [fn, nav] = ROUTES[view] || ROUTES.klijenti;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  const main = document.getElementById('main');
  // сваки приказ добија нови контејнер: закашњело освјежавање претходне странице
  // (нпр. послије чувања) уписује у одвојени елемент и не може да прекрије нову страницу
  const box = document.createElement('div');
  main.replaceChildren(box);
  try { await fn(box, params); }
  catch (e) {
    console.error(e);
    if (box.isConnected) box.innerHTML = `<div class="wrap"><div class="banner bad"><div><b>Грешка при приказу.</b><br>${esc(e.message || e)}</div></div></div>`;
  }
  window.scrollTo(0, 0);
}

async function refreshBackupInfo() {
  const el = document.getElementById('lastbk'); if (el) el.textContent = await lastBackupText();
}

function theme() {
  const KEY = 'trener-tema';
  const order = ['auto', 'light', 'dark'], label = { auto: 'аутоматски', light: 'свијетла', dark: 'тамна' };
  let cur = 'auto';
  try { cur = localStorage.getItem(KEY) || 'auto'; } catch { /* приватни режим */ }
  const apply = () => {
    if (cur === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = cur;
    document.getElementById('theme').textContent = 'Тема: ' + label[cur];
  };
  apply();
  document.getElementById('theme').onclick = () => { cur = order[(order.indexOf(cur) + 1) % 3]; try { localStorage.setItem(KEY, cur); } catch { /* */ } apply(); };
}

/* Нова верзија: никад се не освјежава сама. Корисник бира тренутак, а дугме чека да се сачува сав унос. */
function setupUpdates() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      const el = document.getElementById('update');
      el.hidden = false;
      el.innerHTML = '<div style="flex:1"><b>Доступна је нова верзија апликације.</b><br><span class="small">Подаци остају сачувани. Ажурирајте када завршите унос.</span></div><button class="btn primary" id="upd-go">Ажурирај сада</button><button class="btn ghost" id="upd-later">Касније</button>';
      el.querySelector('#upd-later').onclick = () => { el.hidden = true; };
      el.querySelector('#upd-go').onclick = async () => {
        await flushSaves();
        if (hasUnsaved()) return toast('Постоје несачуване измјене или грешка чувања. Ажурирање је одложено.', 'bad');
        el.innerHTML = '<b>Ажурирање…</b>';
        await updateSW(true);
        // резервно: ако страница још није под контролом service worker-а, учитај је поново ручно
        setTimeout(() => { if (!hasUnsaved()) location.reload(); }, 1500);
      };
    },
    onOfflineReady() { toast('Апликација је спремна за рад без интернета.'); },
  });
}

window.addEventListener('beforeunload', (e) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); });
document.addEventListener('backup-done', refreshBackupInfo);

(async function start() {
  shell();
  theme();
  try {
    await repo.init();
  } catch (e) {
    document.getElementById('main').innerHTML = `<div class="wrap"><div class="banner bad"><div><b>Локална база није доступна.</b><br>${esc(e.message || e)}<br><span class="small">Провјерите да прегледач није у приватном режиму и да има слободног простора.</span></div></div></div>`;
    return;
  }
  // покушај трајног чувања (Chrome одлучује сам; не гарантује се)
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* */ }
  window.addEventListener('hashchange', route);
  await route();
  refreshBackupInfo();
  if (import.meta.env.PROD) setupUpdates();
})();
