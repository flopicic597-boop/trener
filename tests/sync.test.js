// Аутоматска синхронизација: два уређаја (засебне базе) и тестни сервер са истим правилима
// као supabase/setup.sql (уписује се само новија верзија, server_at расте).
import { describe, it, expect } from 'vitest';
import { createDb } from '../src/data/db.js';
import { createRepo } from '../src/data/repo.js';
import { createSyncEngine, resetScan } from '../src/sync/engine.js';
import { deriveKey, randomSalt, makeCheck, verifyCheck, encryptText, decryptText } from '../src/sync/crypto.js';
import { loadDemo } from '../src/data/demo.js';
import { exportBackup, validateBackup, analyzeImport, applyImport } from '../src/io/backup.js';

function memoryServer() {
  const rows = new Map(), files = new Map();
  let clock = Date.parse('2026-11-19T10:00:00.000Z');
  const tick = () => new Date(++clock).toISOString();
  return {
    rows, files,
    backend: {
      async push(list) {
        const rejected = [];
        for (const r of list) {
          const k = r.tbl + '/' + r.id, cur = rows.get(k);
          if (cur && !(r.updated_at > cur.updated_at)) { rejected.push({ tbl: r.tbl, id: r.id }); continue; }
          rows.set(k, { ...r, server_at: tick() });
        }
        return rejected;
      },
      async pull(since, limit) {
        return [...rows.values()].filter((r) => r.server_at > since).sort((a, b) => a.server_at.localeCompare(b.server_at)).slice(0, limit);
      },
      async uploadFile(id, bytes) { files.set(id, new Uint8Array(bytes)); },
      async downloadFile(id) { return files.get(id) || null; },
      async deleteFile(id) { files.delete(id); },
    },
  };
}
let n = 0;
async function device(server, key) {
  const db = createDb('sync-' + ++n + '-' + Math.random());
  const repo = createRepo(db);
  await repo.init();
  return { db, repo, engine: createSyncEngine({ db, backend: server.backend, key }) };
}
const salt = randomSalt();
const keyP = deriveKey('тачна лозинка 123', salt, 1000);

describe('шифровање', () => {
  it('исправна лозинка дешифрује, погрешна не', async () => {
    const key = await keyP;
    const c = await encryptText(key, 'Глукоза 5,4');
    expect(c).not.toContain('Глукоза');
    expect(await decryptText(key, c)).toBe('Глукоза 5,4');
    const check = await makeCheck(key);
    expect(await verifyCheck(key, check)).toBe(true);
    expect(await verifyCheck(await deriveKey('погрешна', salt, 1000), check)).toBe(false);
  });
});

describe('синхронизација два уређаја', () => {
  it('унос на таблету стиже на рачунар, и обрнуто; сервер види само шифровано', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key), R = await device(S, key);
    const c = await T.repo.saveClient({ firstName: 'Ана', lastName: 'Марковић', goal: 'Снага' });
    const s = await T.repo.createSession({ clientId: c.id, date: '2026-11-19' });
    const se = await T.repo.addExerciseToSession(s.id, 'ex-e1', 2);
    await T.repo.savePayment({ clientId: c.id, paidDate: '2026-11-19', periodFrom: '2026-11-19', periodTo: '2026-12-18', amount: 35 });
    const r1 = await T.engine.sync();
    expect(r1.pushed).toBeGreaterThan(150); // клијент, тренинг, серије, уплата + уграђене вјежбе и опције
    for (const row of S.rows.values()) expect(row.payload).not.toMatch(/Ана|Марковић/);

    const r2 = await R.engine.sync();
    expect(r2.pulled).toBeGreaterThan(0);
    expect((await R.repo.getClient(c.id)).firstName).toBe('Ана');
    expect((await R.repo.getSessionFull(s.id)).exercises[0].sets.length).toBe(2);
    expect((await R.repo.listPayments({ clientId: c.id }))[0].amount).toBe(35);

    // измјена на рачунару → таблет
    await R.repo.saveClient({ id: c.id, goal: 'Мршављење' });
    await R.engine.sync(); await T.engine.sync();
    expect((await T.repo.getClient(c.id)).goal).toBe('Мршављење');

    // поновна синхронизација без измјена ништа не шаље
    const idle = await T.engine.sync();
    expect(idle.pushed).toBe(0);
    expect(idle.pulled).toBe(0);
    void se;
  });

  it('исти запис мијењан на оба уређаја: побјеђује новија измјена, нема дупликата', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key), R = await device(S, key);
    const c = await T.repo.saveClient({ firstName: 'Иван', lastName: 'Ивић' });
    await T.engine.sync(); await R.engine.sync();
    await R.repo.saveClient({ id: c.id, note: 'рачунар' });
    await new Promise((r) => setTimeout(r, 5));
    await T.repo.saveClient({ id: c.id, note: 'таблет (касније)' });
    await R.engine.sync(); await T.engine.sync(); await R.engine.sync();
    expect((await R.repo.getClient(c.id)).note).toBe('таблет (касније)');
    expect((await T.repo.getClient(c.id)).note).toBe('таблет (касније)');
    expect((await R.repo.listClients()).length).toBe(1);
  });

  it('брисање и прилози (шифрована датотека) се преносе', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key), R = await device(S, key);
    const c = await T.repo.saveClient({ firstName: 'Мила', lastName: 'Мић' });
    const f = await T.repo.saveFinding({ clientId: c.id, date: '2026-11-19', kind: 'lab', values: [{ paramId: 'glukoza', value: 5.1, unit: 'mmol/L' }] });
    const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 Мила').toString('base64');
    const a = await T.repo.addAttachment({ findingId: f.id, name: 'nalaz.pdf', mime: 'application/pdf', size: 20, dataUrl: pdf });
    await T.engine.sync();
    expect(Buffer.from(S.files.get(a.id)).toString()).not.toContain('PDF');
    await R.engine.sync();
    expect((await R.repo.getAttachment(a.id)).data).toBe(pdf);
    const s = await T.repo.createSession({ clientId: c.id, date: '2026-11-19' });
    await T.engine.sync(); await R.engine.sync();
    await R.repo.deleteSession(s.id);
    await R.repo.deleteFinding(f.id);
    await R.engine.sync(); await T.engine.sync();
    expect(await T.repo.getSession(s.id)).toBeNull();
    expect(await T.repo.listFindings({ clientId: c.id })).toEqual([]);
    expect(S.files.has(a.id)).toBe(false); // обрисана датотека уклоњена и са сервера
  });

  it('прилог чији запис стигне прије датотеке се преузима при сљедећој синхронизацији', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key), R = await device(S, key);
    const c = await T.repo.saveClient({ firstName: 'Ј', lastName: 'Ј' });
    const f = await T.repo.saveFinding({ clientId: c.id, date: '2026-11-19', kind: 'body', values: [] });
    const a = await T.repo.addAttachment({ findingId: f.id, name: 'x.png', mime: 'image/png', size: 4, dataUrl: 'data:image/png;base64,AAAA' });
    await T.engine.sync();
    const saved = S.files.get(a.id); S.files.delete(a.id); // симулација: датотека још није видљива
    await R.engine.sync();
    expect(await R.repo.getAttachment(a.id)).toBeNull();
    S.files.set(a.id, saved);
    await R.engine.sync();
    expect((await R.repo.getAttachment(a.id)).data).toBe('data:image/png;base64,AAAA');
  });

  it('пробни подаци се не шаљу; увоз из датотеке се шаље', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key), R = await device(S, key);
    await loadDemo(T.db);
    await T.engine.sync();
    for (const row of S.rows.values()) expect(['exercises', 'options']).toContain(row.tbl);
    // податак унесен на трећем мјесту и увезен датотеком
    const X = await device(memoryServer(), key);
    const c = await X.repo.saveClient({ firstName: 'Из', lastName: 'Датотеке' });
    const file = validateBackup(JSON.parse(JSON.stringify(await exportBackup(X.db)))).backup;
    await applyImport(T.db, file, await analyzeImport(T.db, file));
    await resetScan(T.db);
    await T.engine.sync(); await R.engine.sync();
    expect((await R.repo.getClient(c.id)).lastName).toBe('Датотеке');
  });

  it('погрешан кључ не може да прочита сервер', async () => {
    const key = await keyP, S = memoryServer();
    const T = await device(S, key);
    await T.repo.saveClient({ firstName: 'А', lastName: 'Б' });
    await T.engine.sync();
    const W = await device(S, await deriveKey('погрешна', salt, 1000));
    await expect(W.engine.sync()).rejects.toThrow(/дешифровати/);
  });
});
