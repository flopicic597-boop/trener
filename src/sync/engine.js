// Мотор аутоматске синхронизације (уређај ↔ сервер ↔ други уређај).
// Сервер чува сваки запис посебно, ШИФРОВАН кључем са уређаја. Спајање је по запису:
// побјеђује верзија са новијим временом измјене (updatedAt). Брисање је меко (deleted = 1),
// па се и оно преноси. Пробни подаци (demo) се не шаљу.
//
// backend (Supabase или тестни): {
//   push(rows) → [{tbl,id}] одбијених (сервер има новију верзију)
//   pull(sinceIso, limit) → [{tbl,id,updated_at,deleted,payload,server_at}] по server_at растуће
//   uploadFile(id, bytes) / downloadFile(id) → bytes | null
// }
import { SYNC_TABLES } from '../data/db.js';
import { nowIso } from '../lib/util.js';
import { encryptText, decryptText, encryptBytes, decryptBytes, dataUrlToBytes, bytesToDataUrl } from './crypto.js';

const K = (t, id) => `${t}/${id}`;
const PAGE = 500, CHUNK = 200;
const OVERLAP_MS = 2 * 60 * 1000;      // преклапање при преузимању (трансакције које касније заврше)
const SCAN_OVERLAP_MS = 60 * 60 * 1000; // преклапање при тражењу локалних измјена (сат уређаја)

export function createSyncEngine({ db, backend, key }) {
  const meta = {
    get: async (k, d = null) => (await db.meta.get(k))?.value ?? d,
    set: (k, v) => db.meta.put({ key: k, value: v }),
  };

  /** Примјењује један запис са сервера. Враћа true ако је локална база измијењена, null ако треба поновити. */
  async function apply(row, res) {
    if (!SYNC_TABLES.includes(row.tbl)) return false; // табела из новије верзије апликације
    let rec;
    try { rec = JSON.parse(await decryptText(key, row.payload)); }
    catch { throw new Error('Подаци на серверу се не могу дешифровати овом лозинком за шифровање.'); }
    const local = await db.table(row.tbl).get(row.id);
    if (local && local.updatedAt > rec.updatedAt) return false; // локална је новија — шаље се
    if (local && local.updatedAt === rec.updatedAt) { await db.cloudBase.put({ key: K(row.tbl, row.id), v: rec.updatedAt }); return false; }
    if (row.tbl === 'attachments') {
      if (!rec.deleted) {
        const enc = await backend.downloadFile(row.id);
        if (!enc) return null; // датотека још није стигла на сервер — покушај касније
        rec.data = bytesToDataUrl(await decryptBytes(key, enc), rec.mime);
        res.files++;
      } else rec.data = '';
    }
    await db.transaction('rw', db.table(row.tbl), db.cloudBase, async () => {
      await db.table(row.tbl).put(rec);
      await db.cloudBase.put({ key: K(row.tbl, row.id), v: rec.updatedAt });
    });
    res.pulled++;
    return true;
  }

  async function pull(res) {
    let since = await meta.get('sync.pullFrom', '1970-01-01T00:00:00.000Z');
    let maxServer = null, retryFrom = null;
    for (;;) {
      const rows = await backend.pull(since, PAGE);
      for (const row of rows) {
        const r = await apply(row, res);
        if (r === null && (!retryFrom || row.server_at < retryFrom)) retryFrom = row.server_at;
        maxServer = row.server_at;
      }
      if (rows.length < PAGE) break;
      since = maxServer;
    }
    if (maxServer || retryFrom) {
      const base = retryFrom ? new Date(Date.parse(retryFrom) - 1) : new Date(Date.parse(maxServer) - OVERLAP_MS);
      const cur = await meta.get('sync.pullFrom', null);
      const next = base.toISOString();
      if (retryFrom || !cur || next > cur) await meta.set('sync.pullFrom', next);
    }
  }

  async function push(res) {
    const mark = await meta.get('sync.scanMark', '');
    const from = mark ? new Date(Date.parse(mark) - SCAN_OVERLAP_MS).toISOString() : '';
    const started = nowIso();
    const out = [];
    for (const t of SYNC_TABLES) {
      const recs = from ? await db.table(t).where('updatedAt').above(from).toArray() : await db.table(t).toArray();
      if (!recs.length) continue;
      const bases = new Map((await db.cloudBase.bulkGet(recs.map((r) => K(t, r.id)))).filter(Boolean).map((b) => [b.key, b.v]));
      for (const r of recs) {
        if (r.demo || !r.updatedAt) continue;
        if (bases.get(K(t, r.id)) === r.updatedAt) continue;
        const rec = { ...r };
        if (t === 'attachments') {
          if (!rec.deleted && rec.data) {
            const { bytes } = dataUrlToBytes(rec.data);
            await backend.uploadFile(rec.id, await encryptBytes(key, bytes)); // датотека прије записа
            res.files++;
          }
          if (rec.deleted && backend.deleteFile) await backend.deleteFile(rec.id).catch(() => {});
          delete rec.data;
        }
        out.push({ t, r, row: { tbl: t, id: r.id, updated_at: r.updatedAt, deleted: !!r.deleted, payload: await encryptText(key, JSON.stringify(rec)) } });
      }
    }
    for (let i = 0; i < out.length; i += CHUNK) {
      const part = out.slice(i, i + CHUNK);
      const rejected = new Set((await backend.push(part.map((p) => p.row))).map((x) => K(x.tbl, x.id)));
      await db.cloudBase.bulkPut(part.filter((p) => !rejected.has(K(p.t, p.r.id))).map((p) => ({ key: K(p.t, p.r.id), v: p.r.updatedAt })));
      res.pushed += part.length - rejected.size;
      res.rejected += rejected.size;
    }
    await meta.set('sync.scanMark', started);
  }

  return {
    /** Пуна размјена: преузми → пошаљи → преузми (оно што је сервер одбио као старије) */
    async sync() {
      const res = { pushed: 0, pulled: 0, files: 0, rejected: 0, at: null };
      await pull(res);
      await push(res);
      if (res.rejected) await pull(res);
      res.at = nowIso();
      await meta.set('sync.lastAt', res.at);
      return res;
    },
  };
}

/** Послије увоза/замјене из датотеке: поново прегледај све локалне записе при сљедећем слању */
export async function resetScan(db) { await db.meta.put({ key: 'sync.scanMark', value: '' }); }
