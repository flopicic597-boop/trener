// Извоз и увоз JSON резервне копије, спајање по стабилним идентификаторима и снимци прије увоза.
// Пренос датотеком НИЈЕ аутоматска синхронизација: свака размјена је ручна.
import { SYNC_TABLES, SCHEMA_VERSION } from '../data/db.js';
import { uid, nowIso, isValidDate } from '../lib/util.js';
import { validateMood, validateSleep, SET_NUM_FIELDS, validateNonNeg } from '../domain/rules.js';

export const FORMAT = 'trener-evidencija-backup';
export const FORMAT_VERSION = 1;
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export const TABLE_LABEL = {
  clients: 'Клијенти', exercises: 'Вјежбе', programs: 'Програми', sessions: 'Тренинзи',
  sessionExercises: 'Вјежбе у тренинзима', sets: 'Серије', options: 'Изборне вриједности',
};

const baseKey = (t, id) => `${t}/${id}`;

/** Сви подаци (укључујући меко обрисане, да се брисање пренесе на други уређај) */
export async function collectAll(db) {
  const data = {};
  for (const t of SYNC_TABLES) data[t] = await db.table(t).toArray();
  return data;
}

export function buildBackup(data) {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    counts: Object.fromEntries(SYNC_TABLES.map((t) => [t, data[t].length])),
    data,
  };
}

/** Извоз: враћа објекат резервне копије и биљежи основу за касније спајање */
export async function exportBackup(db) {
  const data = await collectAll(db);
  const backup = buildBackup(data);
  await db.transaction('rw', db.syncBase, db.meta, async () => {
    const rows = [];
    for (const t of SYNC_TABLES) for (const r of data[t]) rows.push({ key: baseKey(t, r.id), v: r.updatedAt });
    await db.syncBase.bulkPut(rows);
    await db.meta.put({ key: 'lastBackupAt', value: backup.exportedAt });
  });
  return backup;
}

/** Назив датотеке са ЛОКАЛНИМ датумом и временом, нпр. trener-rezerva-2026-11-12_18-05.json */
export const backupFileName = (iso = nowIso(), prefix = 'trener-rezerva') => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}.json`;
};

/* ------------------------------------------------------------------ */
/* Провјера структуре                                                  */
/* ------------------------------------------------------------------ */

/** Миграције формата извоза: старије верзије датотеке подижу се на тренутну */
export function migrateBackup(obj) {
  const b = JSON.parse(JSON.stringify(obj));
  // formatVersion 0 (развојна верзија): табела „settings“ умјесто „options“ и без поља deleted
  if (b.formatVersion === 0) {
    if (b.data && b.data.settings && !b.data.options) { b.data.options = b.data.settings; delete b.data.settings; }
    for (const t of Object.keys(b.data || {})) for (const r of b.data[t] || []) if (r.deleted === undefined) r.deleted = 0;
    b.formatVersion = 1;
  }
  return b;
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const numOrNull = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));

/**
 * Провјерава датотеку. Враћа { ok, errors[], warnings[], backup } (backup је мигриран на тренутни формат).
 */
export function validateBackup(obj) {
  const errors = [], warnings = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Датотека није JSON објекат.'], warnings };
  if (obj.format !== FORMAT) return { ok: false, errors: ['Ово није резервна копија ове апликације (непознат формат).'], warnings };
  if (typeof obj.formatVersion !== 'number') return { ok: false, errors: ['Недостаје верзија формата.'], warnings };
  if (obj.formatVersion > FORMAT_VERSION) return { ok: false, errors: [`Датотека је из новије верзије апликације (формат ${obj.formatVersion}). Прво ажурирајте апликацију.`], warnings };
  const b = migrateBackup(obj);
  if (!b.data || typeof b.data !== 'object') return { ok: false, errors: ['Недостаје блок са подацима.'], warnings };

  for (const t of SYNC_TABLES) {
    if (b.data[t] === undefined) { b.data[t] = []; warnings.push(`Табела „${TABLE_LABEL[t]}“ не постоји у датотеци.`); continue; }
    if (!Array.isArray(b.data[t])) { errors.push(`Табела „${TABLE_LABEL[t]}“ није листа.`); continue; }
    const seen = new Set();
    b.data[t].forEach((r, i) => {
      const where = `${TABLE_LABEL[t]} #${i + 1}`;
      if (!r || typeof r !== 'object') { errors.push(`${where}: запис није објекат.`); return; }
      if (!isStr(r.id)) errors.push(`${where}: недостаје идентификатор.`);
      else if (seen.has(r.id)) errors.push(`${where}: идентификатор се понавља.`);
      else seen.add(r.id);
      if (!isIso(r.updatedAt)) errors.push(`${where}: неисправно вријеме измјене.`);
      if (r.deleted !== 0 && r.deleted !== 1) errors.push(`${where}: неисправно поље deleted.`);
      if (t === 'clients' && (typeof r.firstName !== 'string' || typeof r.lastName !== 'string')) errors.push(`${where}: недостаје име или презиме.`);
      if (t === 'exercises' && (!isStr(r.name) || !['load', 'bw', 'time'].includes(r.type))) errors.push(`${where}: неисправна вјежба.`);
      if (t === 'programs' && (typeof r.name !== 'string' || !Array.isArray(r.items))) errors.push(`${where}: неисправан програм.`);
      if (t === 'sessions') {
        if (!isStr(r.clientId)) errors.push(`${where}: недостаје клијент.`);
        if (!isValidDate(r.date)) errors.push(`${where}: неисправан датум.`);
        const m = validateMood(r.mood); if (m) errors.push(`${where}: ${m}`);
        const s = validateSleep(r.sleep); if (s) errors.push(`${where}: ${s}`);
      }
      if (t === 'sessionExercises' && (!isStr(r.sessionId) || !isStr(r.exerciseId))) errors.push(`${where}: недостаје веза.`);
      if (t === 'sets') {
        if (!isStr(r.sessionId) || !isStr(r.sessionExerciseId) || !isStr(r.exerciseId)) errors.push(`${where}: недостаје веза.`);
        for (const [k, o] of Object.entries(SET_NUM_FIELDS)) {
          if (!numOrNull(r[k])) { errors.push(`${where}: поље ${o.label} није број.`); continue; }
          const m = validateNonNeg(r[k] ?? null, o.label, o); if (m) errors.push(`${where}: ${m}`);
        }
        if (r.done !== 0 && r.done !== 1) errors.push(`${where}: неисправно поље „завршено“.`);
      }
    });
  }
  if (errors.length > 20) { const n = errors.length; errors.length = 20; errors.push(`… и још ${n - 20} грешака.`); }
  return { ok: errors.length === 0, errors, warnings, backup: b };
}

/* ------------------------------------------------------------------ */
/* Анализа и спајање                                                   */
/* ------------------------------------------------------------------ */

/** Кратак опис записа за приказ у сукобу */
export function describeRecord(t, r, ctx = {}) {
  if (!r) return '—';
  switch (t) {
    case 'clients': return `${r.firstName} ${r.lastName}`;
    case 'exercises': return r.name;
    case 'programs': return `Програм „${r.name}“`;
    case 'sessions': return `Тренинг ${r.date}${ctx.clientName ? ' · ' + ctx.clientName(r.clientId) : ''}`;
    case 'sessionExercises': return `Вјежба у тренингу${ctx.exName ? ': ' + ctx.exName(r.exerciseId) : ''}`;
    case 'sets': return `Серија ${(r.position ?? 0) + 1}${ctx.exName ? ' · ' + ctx.exName(r.exerciseId) : ''}`;
    case 'options': return 'Изборне вриједности';
    default: return r.id;
  }
}

const strip = (r) => { const { updatedAt, createdAt, ...rest } = r; return JSON.stringify(rest, Object.keys(rest).sort()); };

/**
 * Пореди датотеку са локалном базом, ништа не мијења.
 * Класификација по запису:
 *  add     — не постоји локално
 *  same    — исто вријеме измјене или исти садржај
 *  update  — локални запис није мијењан од посљедње размјене, у датотеци је новији → преузима се
 *  keep    — у датотеци је верзија коју смо већ видјели, локално има новије измјене → остаје локално
 *  conflict— запис је мијењан на оба уређаја → корисник бира
 */
export async function analyzeImport(db, backup) {
  const summary = {};
  const conflicts = [];
  const plan = [];
  for (const t of SYNC_TABLES) {
    const s = { add: 0, same: 0, update: 0, keep: 0, conflict: 0 };
    const incoming = backup.data[t] || [];
    const locals = new Map((await db.table(t).bulkGet(incoming.map((r) => r.id))).filter(Boolean).map((r) => [r.id, r]));
    const bases = new Map((await db.syncBase.bulkGet(incoming.map((r) => baseKey(t, r.id)))).filter(Boolean).map((b) => [b.key, b.v]));
    for (const inc of incoming) {
      const loc = locals.get(inc.id);
      let kind;
      if (!loc) kind = 'add';
      else if (strip(loc) === strip(inc)) kind = 'same';
      else if (loc.updatedAt === inc.updatedAt) kind = 'conflict'; // исто вријеме, различит садржај
      else {
        const base = bases.get(baseKey(t, inc.id));
        if (base && loc.updatedAt === base) kind = 'update';
        else if (base && inc.updatedAt === base) kind = 'keep';
        else kind = 'conflict';
      }
      s[kind]++;
      plan.push({ t, id: inc.id, kind });
      if (kind === 'conflict') conflicts.push({ key: baseKey(t, inc.id), table: t, id: inc.id, local: loc, incoming: inc });
    }
    summary[t] = s;
  }
  return { summary, conflicts, plan };
}

/** Снимак цијеле базе прије увоза (чува посљедњих 5) */
export async function createSnapshot(db, reason) {
  const data = await collectAll(db);
  const snap = { id: uid(), createdAt: nowIso(), reason, backup: buildBackup(data) };
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add(snap);
    const all = await db.snapshots.orderBy('createdAt').toArray();
    if (all.length > 5) await db.snapshots.bulkDelete(all.slice(0, all.length - 5).map((s) => s.id));
  });
  return snap;
}

/**
 * Примјењује увоз у ЈЕДНОЈ трансакцији: ако било шта не успије, база остаје непромијењена.
 * resolutions: { 'tabela/id': 'local' | 'incoming' } — обавезно за сваки сукоб.
 * hooks.beforeCommit — само за тестове (симулација грешке усред увоза).
 */
export async function applyImport(db, backup, analysis, resolutions = {}, hooks = {}) {
  for (const c of analysis.conflicts) {
    if (!['local', 'incoming'].includes(resolutions[c.key])) throw new Error(`Није изабрана верзија за: ${c.key}`);
  }
  const byKey = new Map();
  for (const t of SYNC_TABLES) for (const r of backup.data[t] || []) byKey.set(baseKey(t, r.id), r);
  const tables = [...SYNC_TABLES.map((t) => db.table(t)), db.syncBase];
  const result = { written: 0, kept: 0 };
  await db.transaction('rw', tables, async () => {
    for (const p of analysis.plan) {
      const key = baseKey(p.t, p.id);
      const inc = byKey.get(key);
      let take = false;
      if (p.kind === 'add' || p.kind === 'update') take = true;
      else if (p.kind === 'conflict') take = resolutions[key] === 'incoming';
      if (take) { await db.table(p.t).put(inc); result.written++; }
      else if (p.kind !== 'same') result.kept++;
      // основа за наредну размјену = верзија из датотеке (коју смо сада видјели)
      await db.syncBase.put({ key, v: inc.updatedAt });
    }
    if (hooks.beforeCommit) await hooks.beforeCommit();
  });
  return result;
}

/** Потпуна замјена базе садржајем резервне копије (враћање). Атомично. */
export async function replaceAll(db, backup) {
  const tables = [...SYNC_TABLES.map((t) => db.table(t)), db.syncBase];
  await db.transaction('rw', tables, async () => {
    for (const t of SYNC_TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkPut(backup.data[t] || []);
    }
    await db.syncBase.clear();
    const rows = [];
    for (const t of SYNC_TABLES) for (const r of backup.data[t] || []) rows.push({ key: baseKey(t, r.id), v: r.updatedAt });
    await db.syncBase.bulkPut(rows);
  });
}
