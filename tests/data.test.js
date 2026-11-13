import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createDb, SCHEMA_V1 } from '../src/data/db.js';
import { createRepo } from '../src/data/repo.js';
import { exportBackup, validateBackup, analyzeImport, applyImport, createSnapshot, replaceAll, FORMAT } from '../src/io/backup.js';
import { dailyCsv } from '../src/io/csv.js';
import { BUILTIN_EXERCISES } from '../src/data/exercises-seed.js';
import { loadDemo } from '../src/data/demo.js';

let n = 0;
async function fresh() {
  const db = createDb('test-' + ++n + '-' + Math.random());
  const repo = createRepo(db);
  await repo.init();
  return { db, repo };
}
const roundtrip = (o) => JSON.parse(JSON.stringify(o)); // симулација датотеке
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedBasic(repo) {
  const c = await repo.saveClient({ firstName: 'Ана', lastName: 'Марковић', goal: 'Снага' });
  const p = await repo.saveProgram({ name: 'Доњи дио', items: [{ exerciseId: 'ex-e1', sets: [{ reps: 8, weightKg: 60, tempo: '3-1-1-0', restSec: 90 }, { reps: 8, weightKg: 60, tempo: '3-1-1-0', restSec: 90 }] }] });
  const s = await repo.createSession({ clientId: c.id, date: '2026-11-10', programId: p.id });
  return { c, p, s };
}

describe('репозиторијум: основни ток', () => {
  it('клијент, програм, тренинг из програма, унос серија', async () => {
    const { repo } = await fresh();
    const { c, p, s } = await seedBasic(repo);
    let full = await repo.getSessionFull(s.id);
    expect(full.exercises).toHaveLength(1);
    expect(full.exercises[0].sets).toHaveLength(2);
    expect(full.exercises[0].sets[0]).toMatchObject({ planReps: 8, planWeightKg: 60, reps: null, weightKg: null, done: 0 });

    // измјена шаблона НЕ мијења сачуван тренинг
    p.items[0].sets[0].weightKg = 100;
    await repo.saveProgram(p);
    full = await repo.getSessionFull(s.id);
    expect(full.exercises[0].sets[0].planWeightKg).toBe(60);

    // унос, копирање претходне серије
    const [s1, s2] = full.exercises[0].sets;
    await repo.updateSet(s1.id, { reps: 8, weightKg: 62.5, done: 1 });
    await repo.copyPreviousSet(s2.id);
    full = await repo.getSessionFull(s.id);
    expect(full.exercises[0].sets[1]).toMatchObject({ reps: 8, weightKg: 62.5 });

    await repo.updateSession(s.id, { mood: 4, sleep: 7.5, status: 'done' });
    await expect(repo.updateSession(s.id, { mood: 6 })).rejects.toThrow(/1 до 5/);
    await expect(repo.updateSession(s.id, { sleep: 30 })).rejects.toThrow(/0 и 24/);
    await expect(repo.updateSet(s1.id, { weightKg: -5 })).rejects.toThrow(/негативна/);

    // више тренинга истог дана
    await repo.createSession({ clientId: c.id, date: '2026-11-10' });
    expect(await repo.listSessions({ clientId: c.id, from: '2026-11-10', to: '2026-11-10' })).toHaveLength(2);

    // претходни резултат за исту вјежбу
    const next = await repo.createSession({ clientId: c.id, date: '2026-11-12', programId: p.id });
    const prev = await repo.previousResult(c.id, 'ex-e1', next);
    expect(prev.session.id).toBe(s.id);
    expect(prev.sets.map((x) => x.weightKg)).toEqual([62.5]);
  });

  it('архивирање клијента чува историју', async () => {
    const { repo } = await fresh();
    const { c, s } = await seedBasic(repo);
    await repo.setClientArchived(c.id, true);
    expect(await repo.listClients()).toHaveLength(0);
    expect(await repo.listClients({ includeArchived: true })).toHaveLength(1);
    expect(await repo.getSession(s.id)).not.toBeNull();
  });

  it('промјена редослиједа вјежби и копирање серије', async () => {
    const { repo } = await fresh();
    const { s } = await seedBasic(repo);
    const se2 = await repo.addExerciseToSession(s.id, 'ex-e3', 1);
    await repo.moveSessionExercise(se2.id, -1);
    let full = await repo.getSessionFull(s.id);
    expect(full.exercises.map((e) => e.exerciseId)).toEqual(['ex-e3', 'ex-e1']);
    const first = full.exercises[1].sets[0];
    await repo.updateSet(first.id, { reps: 5 });
    await repo.addSet(full.exercises[1].id, first.id);
    full = await repo.getSessionFull(s.id);
    expect(full.exercises[1].sets.map((x) => x.reps)).toEqual([5, 5, null]);
    await repo.removeSet(full.exercises[1].sets[2].id);
    full = await repo.getSessionFull(s.id);
    expect(full.exercises[1].sets).toHaveLength(2);
  });

  it('пробни подаци се уклањају без утицаја на стварне', async () => {
    const { db, repo } = await fresh();
    await seedBasic(repo);
    await loadDemo(db);
    expect(await repo.countDemo()).toBeGreaterThan(0);
    await repo.removeDemo();
    expect(await repo.countDemo()).toBe(0);
    expect(await repo.listClients()).toHaveLength(1);
  });
});

describe('извоз и увоз', () => {
  it('пренос на другу инсталацију и поновни увоз без дупликата', async () => {
    const A = await fresh();
    await seedBasic(A.repo);
    const file = roundtrip(await exportBackup(A.db));
    expect(file.format).toBe(FORMAT);

    const B = await fresh();
    const v = validateBackup(file);
    expect(v.ok).toBe(true);
    const an = await analyzeImport(B.db, v.backup);
    expect(an.summary.clients.add).toBe(1);
    expect(an.summary.exercises.same).toBe(BUILTIN_EXERCISES.length); // уграђене вјежбе су исте
    expect(an.conflicts).toHaveLength(0);
    await applyImport(B.db, v.backup, an);
    expect(await B.repo.listClients()).toHaveLength(1);
    const setsB = await B.db.sets.count();
    expect(setsB).toBe(await A.db.sets.count());

    // поновни увоз исте датотеке
    const an2 = await analyzeImport(B.db, v.backup);
    expect(an2.summary.clients).toMatchObject({ add: 0, same: 1 });
    await applyImport(B.db, v.backup, an2);
    expect(await B.db.clients.count()).toBe(1);
    expect(await B.db.sets.count()).toBe(setsB);
    expect(await B.db.exercises.count()).toBe(BUILTIN_EXERCISES.length);
  });

  it('измјена на једном уређају се преузима, на оба — сукоб са избором', async () => {
    const A = await fresh();
    const { c } = await seedBasic(A.repo);
    const f1 = roundtrip(await exportBackup(A.db));
    const B = await fresh();
    let an = await analyzeImport(B.db, f1);
    await applyImport(B.db, f1, an);

    // измјена само на Б → А преузима без питања
    await sleep(3);
    await B.repo.saveClient({ id: c.id, goal: 'Нови циљ са Б' });
    const f2 = roundtrip(await exportBackup(B.db));
    an = await analyzeImport(A.db, f2);
    expect(an.summary.clients.update).toBe(1);
    expect(an.conflicts).toHaveLength(0);
    await applyImport(A.db, f2, an);
    expect((await A.repo.getClient(c.id)).goal).toBe('Нови циљ са Б');

    // измјена на оба уређаја → сукоб
    await sleep(3);
    await A.repo.saveClient({ id: c.id, note: 'А напомена' });
    await B.repo.saveClient({ id: c.id, note: 'Б напомена' });
    const f3 = roundtrip(await exportBackup(B.db));
    an = await analyzeImport(A.db, f3);
    expect(an.conflicts).toHaveLength(1);
    await expect(applyImport(A.db, f3, an, {})).rejects.toThrow(/Није изабрана/);
    expect((await A.repo.getClient(c.id)).note).toBe('А напомена'); // ништа није тихо преписано
    await applyImport(A.db, f3, an, { [an.conflicts[0].key]: 'incoming' });
    expect((await A.repo.getClient(c.id)).note).toBe('Б напомена');

    // поновни увоз исте датотеке више не пријављује сукоб
    an = await analyzeImport(A.db, f3);
    expect(an.conflicts).toHaveLength(0);
  });

  it('избор локалне верзије задржава локалне податке', async () => {
    const A = await fresh();
    const { c } = await seedBasic(A.repo);
    const f1 = roundtrip(await exportBackup(A.db));
    const B = await fresh();
    await applyImport(B.db, f1, await analyzeImport(B.db, f1));
    await sleep(3);
    await A.repo.saveClient({ id: c.id, note: 'А' });
    await B.repo.saveClient({ id: c.id, note: 'Б' });
    const fB = roundtrip(await exportBackup(B.db));
    const an = await analyzeImport(A.db, fB);
    await applyImport(A.db, fB, an, { [an.conflicts[0].key]: 'local' });
    expect((await A.repo.getClient(c.id)).note).toBe('А');
  });

  it('неисправне датотеке се одбијају', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ hello: 1 }).errors[0]).toMatch(/непознат формат/);
    expect(validateBackup({ format: FORMAT, formatVersion: 99, data: {} }).errors[0]).toMatch(/новије верзије/);
    const bad = validateBackup({ format: FORMAT, formatVersion: 1, data: { clients: [{ id: 'x', updatedAt: 'нијеДатум', deleted: 0, firstName: 'А', lastName: 'Б' }], sessions: [{ id: 's', updatedAt: new Date().toISOString(), deleted: 0, clientId: 'x', date: '2026-02-31', mood: 9 }] } });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/вријеме измјене/);
    expect(bad.errors.join(' ')).toMatch(/датум/);
    expect(bad.errors.join(' ')).toMatch(/1 до 5/);
  });

  it('стари формат (0) се мигрира', () => {
    const t = new Date().toISOString();
    const v = validateBackup({ format: FORMAT, formatVersion: 0, data: { settings: [{ id: 'settings', updatedAt: t }], clients: [{ id: 'c', updatedAt: t, firstName: 'А', lastName: 'Б' }] } });
    expect(v.ok).toBe(true);
    expect(v.backup.formatVersion).toBe(2);
    expect(v.backup.data.payments).toEqual([]);
    expect(v.backup.data.options[0].deleted).toBe(0);
  });

  it('неуспјео увоз не оставља базу дјелимично измијењену', async () => {
    const A = await fresh();
    await seedBasic(A.repo);
    const file = roundtrip(await exportBackup(A.db));
    const B = await fresh();
    const before = await B.db.clients.count();
    const an = await analyzeImport(B.db, file);
    await expect(applyImport(B.db, file, an, {}, { beforeCommit: async () => { throw new Error('симулирана грешка'); } })).rejects.toThrow('симулирана');
    expect(await B.db.clients.count()).toBe(before);
    expect(await B.db.sets.count()).toBe(0);
  });

  it('снимак прије увоза и враћање', async () => {
    const A = await fresh();
    await seedBasic(A.repo);
    const snap = await createSnapshot(A.db, 'тест');
    await A.repo.saveClient({ firstName: 'Нови', lastName: 'Клијент' });
    expect(await A.db.clients.count()).toBe(2);
    await replaceAll(A.db, snap.backup);
    expect(await A.db.clients.count()).toBe(1);
  });

  it('CSV има BOM и ћирилицу', () => {
    const csv = dailyCsv([{ session: { date: '2026-11-10', time: '08:00', programName: 'Доњи; дио', mood: 4, sleep: 7.5, status: 'done', note: 'Добро "јако"' }, clientName: 'Ана Марковић', exercisesDone: 3, setsDone: 10, setsTotal: 12 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Ана Марковић');
    expect(csv).toContain('"Доњи; дио"');
    expect(csv).toContain('7,5');
    expect(csv).toContain('"Добро ""јако"""');
  });
});

describe('миграције базе', () => {
  it('v1 → v2 без губитка података', async () => {
    const name = 'mig-' + Math.random();
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    await old.open();
    await old.clients.add({ id: 'c1', firstName: 'Стара', lastName: 'Верзија', updatedAt: '2026-01-05T10:00:00.000Z' });
    await old.exercises.add({ id: 'my-ex', name: 'Моја вјежба', updatedAt: '2026-01-05T10:00:00.000Z' });
    await old.sessions.add({ id: 's1', clientId: 'c1', date: '2026-01-05', status: 'done', mood: 4, sleep: 7, updatedAt: '2026-01-05T10:00:00.000Z' });
    await old.meta.put({ key: 'settings', value: { restPresets: [60, 120] } });
    await old.meta.put({ key: 'lastBackupAt', value: '2026-01-04T00:00:00.000Z' });
    old.close();

    const db = createDb(name);
    const repo = createRepo(db);
    await repo.init();
    expect(db.verno).toBe(3);
    const c = await db.clients.get('c1');
    expect(c).toMatchObject({ firstName: 'Стара', deleted: 0, createdAt: '2026-01-05T10:00:00.000Z' });
    expect((await db.exercises.get('my-ex')).type).toBe('load');
    expect((await db.sessions.get('s1')).mood).toBe(4);
    expect((await repo.getOptions()).restPresets).toEqual([60, 120]);
    expect(await repo.getMeta('lastBackupAt')).toBe('2026-01-04T00:00:00.000Z');
    expect(await db.exercises.count()).toBe(BUILTIN_EXERCISES.length + 1);
  });
});
