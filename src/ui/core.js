// Заједнички дијелови интерфејса: репозиторијум, статус чувања, модали, обавјештења.
import { createDb } from '../data/db.js';
import { createRepo, ValidationError } from '../data/repo.js';
import { esc, fmtDateTime } from '../lib/util.js';

export const db = createDb();
export const repo = createRepo(db);

/* ---------------- статус чувања ---------------- */
// Сваки унос се чува аутоматски (са кратким кашњењем док корисник куца).
const pending = new Map(); // кључ → {timer, fn}
let inflight = 0;
let lastError = null;
const bar = () => document.getElementById('savebar');

function setBar(state, text) {
  const b = bar(); if (!b) return;
  b.className = 'savebar ' + state;
  b.querySelector('.txt').textContent = text;
}
function refreshBar() {
  if (lastError) return setBar('error', 'Грешка: ' + lastError + ' — подаци НИСУ сачувани');
  if (pending.size || inflight) return setBar('saving', 'Чување…');
  const d = new Date();
  setBar('saved', `Сачувано ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`);
}
export const hasUnsaved = () => pending.size > 0 || inflight > 0 || !!lastError;

/** Изврши чување одмах, уз приказ статуса. Враћа резултат или null при грешци. */
export async function save(fn, { quiet = false } = {}) {
  inflight++; refreshBar();
  try {
    const r = await fn();
    lastError = null;
    return r;
  } catch (e) {
    lastError = e instanceof ValidationError ? e.message : (e?.message || String(e));
    if (!quiet) toast(lastError, 'bad');
    console.error(e);
    return null;
  } finally { inflight--; refreshBar(); }
}
/** Одложено чување (док се куца). Исти кључ замјењује претходни захтјев. */
export function queueSave(key, fn, delay = 450) {
  const p = pending.get(key); if (p) clearTimeout(p.timer);
  const entry = { fn, timer: setTimeout(() => { pending.delete(key); save(fn, { quiet: true }); }, delay) };
  pending.set(key, entry); refreshBar();
}
export async function flushSaves() {
  const all = [...pending.values()]; pending.clear();
  for (const p of all) { clearTimeout(p.timer); await save(p.fn, { quiet: true }); }
}
export const clearError = () => { lastError = null; refreshBar(); };

/* ---------------- модал, потврда, обавјештење ---------------- */
let modalEl = null;
export function openModal({ title, body, foot = '', wide = false, onClose }) {
  closeModal();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-bg';
  modalEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(980px,100%)"' : ''}>
    <div class="mh"><h2>${esc(title)}</h2><button class="btn ghost icon" data-close aria-label="Затвори">✕</button></div>
    <div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl || e.target.closest('[data-close]')) { closeModal(); onClose?.(); } });
  document.body.appendChild(modalEl);
  const f = modalEl.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30);
  return modalEl;
}
export function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }

export function confirmDlg(message, { okText = 'Потврди', danger = false, title = 'Потврда' } = {}) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      body: `<p>${message}</p>`,
      foot: `<button class="btn" data-no>Одустани</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes autofocus>${esc(okText)}</button>`,
      onClose: () => resolve(false),
    });
    m.querySelector('[data-no]').onclick = () => { closeModal(); resolve(false); };
    m.querySelector('[data-yes]').onclick = () => { closeModal(); resolve(true); };
  });
}

let toastT;
export function toast(msg, type = '') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = 'toast ' + type; t.textContent = msg;
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), type === 'bad' ? 6000 : 2600);
}

/* ---------------- помоћно за приказ ---------------- */
export const KAT_VAR = { 'Ноге': '--k-noge', 'Леђа': '--k-leda', 'Груди': '--k-grudi', 'Рамена': '--k-ramena', 'Руке': '--k-ruke', 'Кор': '--k-core', 'Кардио': '--k-kardio', 'Мобилност': '--k-mob' };
export const katStyle = (k) => `--kc:var(${KAT_VAR[k] || '--k-core'})`;
export const initials = (c) => ((c.firstName || '?')[0] + (c.lastName || '')[0] || '').toUpperCase();
export const fullName = (c) => (c ? `${c.firstName} ${c.lastName}` : 'Непознат клијент');

export async function lastBackupText() {
  const v = await repo.getMeta('lastBackupAt');
  return v ? fmtDateTime(v) : 'никад';
}

export const ICONS = {
  users: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.6"/></svg>',
  cal: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  chart: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  list: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  dumbbell: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>',
  data: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
};
