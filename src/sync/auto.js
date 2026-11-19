// Аутоматска синхронизација у апликацији: подешавање, пријава, лозинка за шифровање и
// распоред (при покретању, сваки минут док је апликација отворена, убрзо послије сваког уноса,
// при повратку интернета и при изласку из апликације). Supabase библиотека се учитава
// тек када је пренос подешен.
import { db, flushSaves } from '../ui/core.js';
import { deriveKey, randomSalt, makeCheck, verifyCheck } from './crypto.js';
import { createSyncEngine } from './engine.js';

const ENV_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const ENV_KEY = import.meta.env?.VITE_SUPABASE_KEY || '';
const INTERVAL = 60 * 1000;

const st = { phase: 'off', error: null, running: false, last: null, email: null, sb: null, backend: null, engine: null, timer: null, debounce: null };
const meta = { get: async (k) => (await db.meta.get(k))?.value ?? null, set: (k, v) => db.meta.put({ key: k, value: v }), del: (k) => db.meta.delete(k) };

const emit = () => document.dispatchEvent(new CustomEvent('sync-status', { detail: status() }));
export const status = () => ({ phase: st.phase, error: st.error, running: st.running, last: st.last, email: st.email, configured: !!st.sb });

async function config() {
  const c = await meta.get('sync.config');
  return c?.url && c?.key ? c : ENV_URL && ENV_KEY ? { url: ENV_URL, key: ENV_KEY } : null;
}
export const hasBuiltInConfig = () => !!(ENV_URL && ENV_KEY);

async function client() {
  if (st.sb) return st.sb;
  const c = await config();
  if (!c) return null;
  const { createSupabase } = await import('./supabase.js');
  st.sb = createSupabase(c.url, c.key);
  return st.sb;
}

/**
 * Фазе: off (није подешено) → login (треба пријава) → passphrase-new / passphrase (лозинка за
 * шифровање) → ready (аутоматски пренос ради).
 */
export async function start() {
  try {
    const sb = await client();
    if (!sb) { st.phase = 'off'; return emit(); }
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user;
    if (!user) { st.phase = 'login'; return emit(); }
    st.email = user.email;
    const { supabaseBackend } = await import('./supabase.js');
    st.backend = supabaseBackend(sb, user.id);
    const key = await meta.get('sync.key');
    if (key && (await meta.get('sync.userId')) === user.id) {
      st.engine = createSyncEngine({ db, backend: st.backend, key });
      st.phase = 'ready'; st.last = await meta.get('sync.lastAt');
      emit(); schedule(); syncNow();
      return;
    }
    const info = await st.backend.getKeyInfo();
    st.phase = info ? 'passphrase' : 'passphrase-new';
    emit();
  } catch (e) { st.error = e.message || String(e); emit(); }
}

export async function saveConfig(url, key) {
  url = (url || '').trim().replace(/\/+$/, ''); key = (key || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Адреса пројекта треба да изгледа као https://xxxx.supabase.co');
  if (!/^(sb_publishable_|eyJ)/.test(key)) throw new Error('Унесите „Publishable key“ (почиње са sb_publishable_). Никако не service_role / secret кључ.');
  await meta.set('sync.config', { url, key });
  st.sb = null; await start();
}

export async function login(email, password) {
  const sb = await client();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Погрешна е-пошта или лозинка.' : error.message);
  st.error = null; await start();
}

/** Први уређај: поставља лозинку за шифровање (сервер чува само со и контролну вриједност) */
export async function createPassphrase(pass) {
  if ((pass || '').length < 10) throw new Error('Лозинка за шифровање мора имати бар 10 знакова.');
  const salt = randomSalt();
  const key = await deriveKey(pass, salt);
  await st.backend.setKeyInfo(salt, await makeCheck(key));
  await keep(key);
}
/** Други уређај: провјерава лозинку контролном вриједношћу са сервера */
export async function unlock(pass) {
  const info = await st.backend.getKeyInfo();
  if (!info) throw new Error('На серверу још није постављена лозинка за шифровање.');
  const key = await deriveKey(pass, info.salt);
  if (!(await verifyCheck(key, info.check_val))) throw new Error('Погрешна лозинка за шифровање.');
  await keep(key);
}
async function keep(key) {
  const { data } = await st.sb.auth.getUser();
  await meta.set('sync.key', key);          // CryptoKey (не може се извући из прегледача)
  await meta.set('sync.userId', data.user.id);
  st.error = null; await start();
}

export async function logout() {
  clearInterval(st.timer); st.timer = null;
  try { await st.sb?.auth.signOut(); } catch { /* */ }
  await meta.del('sync.key'); await meta.del('sync.userId');
  st.engine = null; st.phase = 'login'; st.email = null; emit();
}

export async function syncNow() {
  if (!st.engine || st.running) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { st.error = 'Нема интернета — пренос ће се наставити када се веза врати.'; emit(); return null; }
  st.running = true; emit();
  try {
    await flushSaves();
    const res = await st.engine.sync();
    st.last = res.at; st.error = null;
    if (res.pulled) document.dispatchEvent(new CustomEvent('sync-applied', { detail: res }));
    return res;
  } catch (e) {
    st.error = (e.message || String(e)).replace(/Failed to fetch/i, 'Сервер није доступан (интернет или паузиран Supabase пројекат).');
    return null;
  } finally { st.running = false; emit(); }
}

function schedule() {
  if (st.timer) return;
  st.timer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, INTERVAL);
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); else syncNow(); });
  document.addEventListener('data-changed', () => { clearTimeout(st.debounce); st.debounce = setTimeout(syncNow, 5000); });
}
