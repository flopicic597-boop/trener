import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createDb, SCHEMA_V1 } from '../src/data/db.js';
import { createRepo } from '../src/data/repo.js';
import { exportBackup, validateBackup, analyzeImport, applyImport, FORMAT } from '../src/io/backup.js';
import { addMonths } from '../src/lib/util.js';
import { periodEnd, suggestPeriod, membershipStatus, validatePayment } from '../src/domain/membership.js';
import { parseFindingText, compareFindings, buildNotes, judge, goalDir, refStatus } from '../src/domain/findings.js';

let n = 0;
async function fresh() {
  const db = createDb('mf-' + ++n + '-' + Math.random());
  const repo = createRepo(db);
  await repo.init();
  return { db, repo };
}
const roundtrip = (o) => JSON.parse(JSON.stringify(o));
const pay = (from, to, paid = from) => ({ id: from, paidDate: paid, periodFrom: from, periodTo: to, deleted: 0 });

describe('чланарина', () => {
  it('мјесеци и крај периода', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-12', 1)).toBe('2026-12-12');
    expect(periodEnd('2026-11-12', 1)).toBe('2026-12-11');
    expect(periodEnd('2026-12-01', 3)).toBe('2027-02-28');
  });

  it('уплата унапријед наставља се на важећи период', () => {
    const ps = [pay('2026-11-01', '2026-11-30')];
    expect(suggestPeriod(ps, '2026-11-25', 1)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(suggestPeriod(ps, '2026-12-10', 1)).toEqual({ from: '2026-12-10', to: '2027-01-09' });
    expect(suggestPeriod([], '2026-11-12', 1)).toEqual({ from: '2026-11-12', to: '2026-12-11' });
  });

  it('статус: нема, важи, истиче, истекла, будућа', () => {
    expect(membershipStatus([], '2026-11-12').state).toBe('none');
    const ps = [pay('2026-11-01', '2026-11-30')];
    expect(membershipStatus(ps, '2026-11-10', 7)).toMatchObject({ state: 'active', daysLeft: 20, to: '2026-11-30' });
    expect(membershipStatus(ps, '2026-11-25', 7)).toMatchObject({ state: 'expiring', daysLeft: 5 });
    expect(membershipStatus(ps, '2026-11-30', 7)).toMatchObject({ state: 'expiring', daysLeft: 0 });
    expect(membershipStatus(ps, '2026-12-03', 7)).toMatchObject({ state: 'expired', daysOver: 3 });
    expect(membershipStatus([pay('2026-12-01', '2026-12-31')], '2026-11-20').state).toBe('future');
    // обрисана уплата се не рачуна
    expect(membershipStatus([{ ...pay('2026-11-01', '2026-12-31'), deleted: 1 }, ...ps], '2026-12-05').state).toBe('expired');
  });

  it('провјера уплате', () => {
    expect(validatePayment({ clientId: 'c', paidDate: '2026-11-12', periodFrom: '2026-11-12', periodTo: '2026-11-01' }).periodTo).toMatch(/прије почетка/);
    expect(validatePayment({ clientId: 'c', paidDate: '2026-11-12', periodFrom: '2026-11-12', periodTo: '2026-12-11', amount: -5 }).amount).toBeTruthy();
    expect(Object.keys(validatePayment({ clientId: 'c', paidDate: '2026-11-12', periodFrom: '2026-11-12', periodTo: '2026-12-11', amount: 35, method: 'cash' }))).toEqual([]);
  });
});

describe('налази: препознавање текста', () => {
  it('лабораторијски налаз латиницом, зарез и тачка, референце', () => {
    const txt = `Biohemija
Glukoza (GUK)  5,9  mmol/L  3,9 - 6,1
Holesterol ukupni 6.3 mmol/L < 5.2
HDL holesterol 0,9 mmol/L > 1,0
LDL-holesterol 4,1 mmol/L
Trigliceridi 1,4 mmol/L 0 - 1,7
Vitamin D (25-OH) 48 nmol/L 75 - 250
Hemoglobin 138 g/L 120-160`;
    const r = Object.fromEntries(parseFindingText(txt).map((v) => [v.paramId, v]));
    expect(r.glukoza).toMatchObject({ value: 5.9, refMin: 3.9, refMax: 6.1, unit: 'mmol/L' });
    expect(r.holesterol).toMatchObject({ value: 6.3, refMax: 5.2 });
    expect(r.hdl).toMatchObject({ value: 0.9, refMin: 1.0 });
    expect(r.ldl.value).toBe(4.1);
    expect(r.trigliceridi).toMatchObject({ value: 1.4, refMin: 0, refMax: 1.7 });
    expect(r.vitd).toMatchObject({ value: 48, refMin: 75, unit: 'nmol/L' });
    expect(r.hemoglobin).toMatchObject({ value: 138, unit: 'g/L' });
  });

  it('мјерење тијела ћирилицом', () => {
    const r = Object.fromEntries(parseFindingText('Тежина: 84,2 kg\nПроценат масти 24,5 %\nОбим струка 92 cm\nНешто непознато 12').map((v) => [v.paramId, v.value]));
    expect(r).toEqual({ tezina: 84.2, mast: 24.5, struk: 92 });
  });
});

describe('налази: поређење и напомене', () => {
  it('оцјена смјера', () => {
    expect(judge('down', 25, 23)).toBe('better');
    expect(judge('up', 30, 29)).toBe('worse');
    expect(judge('down', 100, 100.5)).toBe('same'); // < 1 %
    expect(judge('range', 6.8, 6.0, { min: 3.9, max: 6.1 })).toBe('better');
    expect(judge('range', 5.0, 5.5, { min: 3.9, max: 6.1 })).toBe('same'); // оба у опсегу
    expect(judge('none', 1, 2)).toBe('neutral');
    expect(goalDir('Смањење тјелесне масе')).toBe('down');
    expect(goalDir('Повећање мишићне масе')).toBe('up');
    expect(refStatus(6.3, { min: null, max: 5.2 })).toBe('high');
  });

  it('посљедње наспрам претходног, циљ клијента и напомене', () => {
    const t = '2026-01-01T00:00:00.000Z';
    const fs = [
      { id: 'a', date: '2026-09-01', createdAt: t, deleted: 0, values: [{ paramId: 'tezina', value: 90, unit: 'kg' }, { paramId: 'mast', value: 27, unit: '%' }, { paramId: 'glukoza', value: 6.6, unit: 'mmol/L', refMin: 3.9, refMax: 6.1 }] },
      { id: 'b', date: '2026-11-01', createdAt: t, deleted: 0, values: [{ paramId: 'tezina', value: 86, unit: 'kg' }, { paramId: 'mast', value: 28.5, unit: '%' }, { paramId: 'glukoza', value: 5.8, unit: 'mmol/L', refMin: 3.9, refMax: 6.1 }, { name: 'Мој тест', value: 3, unit: '' }] },
    ];
    const rows = Object.fromEntries(compareFindings(fs, { goal: 'Смањење тјелесне масе' }).map((r) => [r.key, r]));
    expect(rows.tezina).toMatchObject({ verdict: 'better', delta: -4 });
    expect(rows.mast.verdict).toBe('worse');
    expect(rows.glukoza).toMatchObject({ verdict: 'better', refStatus: 'ok' });
    expect(rows['custom:мој тест']).toMatchObject({ prev: null, verdict: 'neutral' });
    const notes = buildNotes(Object.values(rows));
    expect(notes.improved.join(' ')).toMatch(/Тјелесна маса/);
    expect(notes.toWork.join(' ')).toMatch(/Тјелесна маст.*погоршање/);
    expect(notes.notes.join(' ')).toMatch(/аеробни/);
    expect(notes.medical).toBe(false);
  });

  it('вриједност ван опсега даје напомену и упућивање љекару; различите јединице се не пореде', () => {
    const t = '2026-01-01T00:00:00.000Z';
    const fs = [
      { id: 'a', date: '2026-01-10', createdAt: t, deleted: 0, values: [{ paramId: 'vitd', value: 20, unit: 'ng/mL' }] },
      { id: 'b', date: '2026-06-10', createdAt: t, deleted: 0, values: [{ paramId: 'vitd', value: 48, unit: 'nmol/L', refMin: 75, refMax: 250 }, { paramId: 'pritisakS', value: 145, unit: 'mmHg' }] },
    ];
    const rows = compareFindings(fs);
    const vd = rows.find((r) => r.key === 'vitd');
    expect(vd).toMatchObject({ comparable: false, unitChanged: true, verdict: 'neutral', refStatus: 'low' });
    const notes = buildNotes(rows);
    expect(notes.medical).toBe(true);
    expect(notes.notes.join(' ')).toMatch(/Валсалва/);
    expect(notes.notes.join(' ')).toMatch(/Витамин D/);
    // избор два одређена налаза
    expect(compareFindings(fs, { fromId: 'b', toId: 'a' }).map((r) => r.key)).toEqual(['vitd', 'pritisakS']);
  });
});

describe('чланарина и налази у бази, увоз/извоз', () => {
  it('уплате, налази и прилози се преносе на другу инсталацију без дупликата', async () => {
    const A = await fresh();
    const c = await A.repo.saveClient({ firstName: 'Ана', lastName: 'Марковић' });
    await A.repo.savePayment({ clientId: c.id, paidDate: '2026-11-01', periodFrom: '2026-11-01', periodTo: '2026-11-30', amount: 35, method: 'cash' });
    const f = await A.repo.saveFinding({ clientId: c.id, date: '2026-11-05', kind: 'lab', title: 'Крвна слика', values: [{ paramId: 'glukoza', value: 5.4, unit: 'mmol/L' }] });
    const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 тест').toString('base64');
    await A.repo.addAttachment({ findingId: f.id, name: 'nalaz.pdf', mime: 'application/pdf', size: 20, dataUrl: pdf });
    await expect(A.repo.addAttachment({ findingId: f.id, name: 'x', size: 99 * 1024 * 1024, dataUrl: pdf })).rejects.toThrow(/превелика/);
    await expect(A.repo.savePayment({ clientId: c.id, paidDate: '2026-11-01', periodFrom: '2026-11-10', periodTo: '2026-11-01' })).rejects.toThrow(/прије почетка/);

    const file = roundtrip(await exportBackup(A.db));
    expect(file.formatVersion).toBe(2);
    expect(file.counts).toMatchObject({ payments: 1, findings: 1, attachments: 1 });
    const v = validateBackup(file);
    expect(v.ok).toBe(true);

    const B = await fresh();
    const an = await analyzeImport(B.db, v.backup);
    expect(an.summary.attachments.add).toBe(1);
    await applyImport(B.db, v.backup, an);
    expect((await B.repo.listPayments({ clientId: c.id }))[0].amount).toBe(35);
    expect((await B.repo.listFindings({ clientId: c.id }))[0].values[0].value).toBe(5.4);
    const atts = await B.repo.listAttachments({ findingId: f.id });
    expect(atts[0]).toMatchObject({ name: 'nalaz.pdf' });
    expect(atts[0].data).toBeUndefined(); // списак без садржаја
    expect((await B.repo.getAttachment(atts[0].id)).data).toBe(pdf);

    const an2 = await analyzeImport(B.db, validateBackup(roundtrip(await exportBackup(A.db))).backup);
    expect(an2.summary.payments.same + an2.summary.findings.same + an2.summary.attachments.same).toBe(3);
    expect(an2.conflicts.length).toBe(0);

    // брисање налаза брише и прилоге (меко) и преноси се
    await A.repo.deleteFinding(f.id);
    expect(await A.repo.listFindings({ clientId: c.id })).toEqual([]);
    expect(await A.repo.listAttachments({ findingId: f.id })).toEqual([]);
    const v3 = validateBackup(roundtrip(await exportBackup(A.db)));
    expect(v3.ok).toBe(true);
    await applyImport(B.db, v3.backup, await analyzeImport(B.db, v3.backup));
    expect(await B.repo.listFindings({ clientId: c.id })).toEqual([]);
  });

  it('стара датотека (формат 1) се увози, нове табеле су празне', () => {
    const t = new Date().toISOString();
    const v = validateBackup({ format: FORMAT, formatVersion: 1, data: { clients: [{ id: 'c', updatedAt: t, deleted: 0, firstName: 'А', lastName: 'Б' }] } });
    expect(v.ok).toBe(true);
    expect(v.backup.formatVersion).toBe(2);
    expect(v.backup.data.findings).toEqual([]);
    expect(v.warnings.join(' ')).not.toMatch(/Уплате|Налази/);
  });

  it('неисправан налаз у датотеци се одбија', () => {
    const t = new Date().toISOString();
    const v = validateBackup({ format: FORMAT, formatVersion: 2, data: { findings: [{ id: 'f', updatedAt: t, deleted: 0, clientId: 'c', date: '2026-13-01', kind: 'lab', values: [] }] } });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/датум налаза/);
  });

  it('миграција v2 → v3 задржава постојеће податке', async () => {
    const name = 'mig3-' + Math.random();
    const old = new Dexie(name);
    old.version(1).stores(SCHEMA_V1);
    old.version(2).stores({ options: 'id, updatedAt', syncBase: 'key', snapshots: 'id, createdAt' });
    await old.open();
    await old.clients.add({ id: 'c1', firstName: 'Стара', lastName: 'Клијенткиња', updatedAt: t0, createdAt: t0, deleted: 0, archived: 0 });
    await old.sessions.add({ id: 's1', clientId: 'c1', date: '2026-10-05', status: 'done', mood: 5, sleep: 8, updatedAt: t0, createdAt: t0, deleted: 0 });
    old.close();
    const db = createDb(name);
    const repo = createRepo(db);
    await repo.init();
    expect(db.verno).toBe(3);
    expect((await repo.getClient('c1')).firstName).toBe('Стара');
    expect((await repo.getSession('s1')).mood).toBe(5);
    expect(await repo.listPayments({ clientId: 'c1' })).toEqual([]);
    expect((await repo.getOptions()).membershipMonths).toBe(1);
  });
});
const t0 = '2026-10-05T10:00:00.000Z';
