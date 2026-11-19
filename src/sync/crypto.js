// Шифровање на уређају (Web Crypto, AES-GCM 256). Кључ се изводи из лозинке за шифровање
// (PBKDF2-SHA-256, 310 000 понављања) и соли која се чува на серверу. Лозинка и кључ
// никад не напуштају уређај; сервер види само шифровани садржај.
const enc = new TextEncoder(), dec = new TextDecoder();
export const ITERATIONS = 310000;
export const CHECK_TEXT = 'trener-ok-v1';

export function b64(bytes) {
  let s = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

/** Кључ из лозинке; extractable=false — не може се извући из прегледача */
export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** bytes → iv(12) || шифровано */
export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
export async function decryptBytes(key, data) {
  const u = new Uint8Array(data);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12)));
}
export const encryptText = async (key, text) => b64(await encryptBytes(key, enc.encode(text)));
export const decryptText = async (key, b) => dec.decode(await decryptBytes(key, unb64(b)));

/** Провјера лозинке на другом уређају: контролни текст шифрован истим кључем */
export const makeCheck = (key) => encryptText(key, CHECK_TEXT);
export async function verifyCheck(key, check) {
  try { return (await decryptText(key, check)) === CHECK_TEXT; } catch { return false; }
}

/** data: URL ↔ bytes (прилози налаза) */
export function dataUrlToBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  return { mime: dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream', bytes: unb64(dataUrl.slice(i + 1)) };
}
export const bytesToDataUrl = (bytes, mime) => `data:${mime || 'application/octet-stream'};base64,${b64(bytes)}`;
