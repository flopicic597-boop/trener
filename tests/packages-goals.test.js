import { describe, it, expect } from 'vitest';
import { createDb } from '../src/data/db.js';
import { createRepo } from '../src/data/repo.js';
import { packageStatus, monthlyIncome } from '../src/domain/membership.js';
import { goalProgress } from '../src/domain/goals.js';
import { exportBackup, validateBackup, analyzeImport, applyImport, FORMAT } from '../src/io/backup.js';

const pkg = (id, startDate, total) => ({ id, startDate, total, createdAt: '2026-01-01T00:00:00.000Z', deleted: 0 });
const ses = (date, status = 'done') => ({ date, status, deleted: 0 });

describe('пакети тренинга', () => {
  it('одржани тренинзи се одбијају редом; пакет при крају и искоришћен', () => {
    const p = [pkg('a', '2026-10-01', 3), pkg('b', '2026-10-20', 4)];
    const s = [ses('2026-09-30'), ses('2026-10-02'), ses('2026-10-05'), ses('2026-10-06', 'skipped'), ses('2026-10-08'), ses('2026-10-21'), ses('2026-10-22'), ses('2026-11-01', 'planned')];
    const [a, b] = packageStatus(p, s, '2026-11-01');
    expect(a).toMatchObject({ used: 3, remaining: 0, state: 'used', lastDate: '2026-10-08' }); // 30.09. је прије почетка
    expect(b).toMatchObject({ used: 2, remaining: 2, state: 'low' });
    expect(packageStatus([pkg('c', '2026-12-01', 10)], s, '2026-11-01')[0].state).toBe('future');
  });
  it('приход по мјесецима (чланарине + пакети)', () => {
    const inc = monthlyIncome([{ paidDate: '2026-10-05', amount: 35 }, { paidDate: '2026-11-02', amount: 35 }, { paidDate: '2025-01-01', amount: 99 }], [{ startDate: '2026-11-03', paidDate: '2026-11-03', price: 180 }], 3, '2026-11-19');
    expect(inc).toEqual([{ x: '2026-09', y: 0 }, { x: '2026-10', y: 35 }, { x: '2026-11', y: 215 }]);
  });
});

describe('циљеви', () => {
  it('напредак и процјена рока', () => {
    const g = { startValue: 92, target: 85, startDate: '2026-09-01', deadline: '2026-12-30', done: 0 };
    const p = goalProgress(g, 88.5, '2026-10-31'); // пола времена, пола пута
    expect(p.pct).toBeCloseTo(0.5, 5);
    expect(p.expectedPct).toBeCloseTo(0.496, 2);
    expect(p.onTrack).toBe(true);
    expect(goalProgress(g, 91.5, '2026-11-30').onTrack).toBe(false);
    expect(goalProgress(g, 84, '2026-11-30').reached).toBe(true);
    expect(goalProgress(g, null, '2026-11-30').pct).toBeNull();
  });
});

describe('нови подаци у бази, копији и увозу', () => {
  it('пакет, циљ и нова поља клијента/тренинга се преносе; неисправни се одбијају', async () => {
    const A = createRepo(createDb('pg-' + Math.random())); await A.init();
    const c = await A.saveClient({ firstName: 'Ана', lastName: 'А', sex: 'f', birthDate: '1990-01-01', heightCm: 168, activity: 1.55, injuries: [{ id: 'i1', area: 'Раме', active: 1, avoidCats: ['Рамена'], avoidEx: [] }] });
    await expect(A.saveClient({ firstName: 'X', lastName: 'Y', heightCm: 20 })).rejects.toThrow(/Висина/);
    const s = await A.createSession({ clientId: c.id, date: '2026-11-19' });
    await A.updateSession(s.id, { rpe: 7, durationMin: 60, soreness: 4, energy: 5, stress: 3 });
    await expect(A.updateSession(s.id, { rpe: 11 })).rejects.toThrow(/RPE/);
    await A.savePackage({ clientId: c.id, total: 12, startDate: '2026-11-01', price: 180 });
    await expect(A.savePackage({ clientId: c.id, total: 0, startDate: '2026-11-01' })).rejects.toThrow(/Број тренинга/);
    await A.saveGoal({ clientId: c.id, title: 'Чучањ 100', kind: 'e1rm', exerciseId: 'ex-e1', startValue: 80, target: 100, startDate: '2026-11-01' });
    await expect(A.saveGoal({ clientId: c.id, title: '', kind: 'param', startDate: '2026-11-01' })).rejects.toThrow();

    const file = JSON.parse(JSON.stringify(await exportBackup(A.db)));
    expect(file.formatVersion).toBe(3);
    const v = validateBackup(file);
    expect(v.ok).toBe(true);
    const B = createRepo(createDb('pg-' + Math.random())); await B.init();
    await applyImport(B.db, v.backup, await analyzeImport(B.db, v.backup));
    expect((await B.getClient(c.id))).toMatchObject({ sex: 'f', heightCm: 168, injuries: [{ area: 'Раме' }] });
    expect((await B.getSession(s.id))).toMatchObject({ rpe: 7, durationMin: 60, energy: 5 });
    expect((await B.listPackages({ clientId: c.id }))[0].total).toBe(12);
    expect((await B.listGoals({ clientId: c.id }))[0].target).toBe(100);
  });

  it('стара датотека (формат 2) се увози; неисправан тренинг се одбија', () => {
    const t = new Date().toISOString();
    const v = validateBackup({ format: FORMAT, formatVersion: 2, data: { clients: [{ id: 'c', updatedAt: t, deleted: 0, firstName: 'А', lastName: 'Б' }] } });
    expect(v.ok).toBe(true);
    expect(v.backup.data.packages).toEqual([]);
    const bad = validateBackup({ format: FORMAT, formatVersion: 3, data: { sessions: [{ id: 's', updatedAt: t, deleted: 0, clientId: 'c', date: '2026-11-19', status: 'done', rpe: 15 }] } });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/RPE/);
  });
});
