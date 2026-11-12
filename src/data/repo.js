// Слој приступа подацима (repository). Интерфејс користи САМО ове функције, никад директно базу.
// Касније се може направити друга имплементација истог интерфејса која разговара са API-јем
// (облачна синхронизација, више тренера) без промјене интерфејса.
import { uid, nowIso, today, sortBy } from '../lib/util.js';
import { BUILTIN_EXERCISES } from './exercises-seed.js';
import { DEFAULT_OPTIONS, validateClient, validateSession, validateSet, validateExercise, normalizeTempo } from '../domain/rules.js';

export class ValidationError extends Error {
  constructor(errors) { super(Object.values(errors).join(' ')); this.errors = errors; this.name = 'ValidationError'; }
}
const check = (errs) => { if (Object.keys(errs).length) throw new ValidationError(errs); };
const live = (r) => r && !r.deleted;
const PLAN_FIELDS = ['planReps', 'planWeightKg', 'planDurationSec'];

export function createRepo(db) {
  const stamp = (rec, isNew) => {
    const t = nowIso();
    if (isNew || !rec.createdAt) rec.createdAt = t;
    // updatedAt мора строго да расте да би спајање увоза препознало измјену
    rec.updatedAt = rec.updatedAt && rec.updatedAt >= t ? new Date(Date.parse(rec.updatedAt) + 1).toISOString() : t;
    if (rec.deleted === undefined) rec.deleted = 0;
    return rec;
  };
  const put = async (table, rec, isNew = false) => { stamp(rec, isNew); await db.table(table).put(rec); return rec; };
  const patch = async (table, id, changes) => {
    const rec = await db.table(table).get(id);
    if (!rec) throw new Error('Запис не постоји.');
    Object.assign(rec, changes);
    return put(table, rec);
  };

  const repo = {
    db,

    /** Почетна припрема: уграђене вјежбе и подразумијеване опције (никад не преписује измјене) */
    async init() {
      await db.open();
      await db.transaction('rw', db.exercises, db.options, async () => {
        const existing = new Set(await db.exercises.toCollection().primaryKeys());
        const missing = BUILTIN_EXERCISES.filter((e) => !existing.has(e.id));
        if (missing.length) await db.exercises.bulkAdd(missing.map((e) => ({ ...e })));
        if (!(await db.options.get('settings'))) await db.options.add({ ...DEFAULT_OPTIONS, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deleted: 0 });
      });
    },

    /* ---------------- опције (изборне вриједности) ---------------- */
    async getOptions() { return { ...DEFAULT_OPTIONS, ...((await db.options.get('settings')) || {}) }; },
    async saveOptions(o) { const cur = (await db.options.get('settings')) || { id: 'settings' }; return put('options', { ...cur, ...o, id: 'settings' }); },

    /* ---------------- мета (датум резервне копије и сл.; не извози се) ---------------- */
    async getMeta(key) { return (await db.meta.get(key))?.value ?? null; },
    async setMeta(key, value) { await db.meta.put({ key, value }); },

    /* ---------------- клијенти ---------------- */
    async listClients({ includeArchived = false } = {}) {
      const all = (await db.clients.toArray()).filter(live);
      return sortBy(all.filter((c) => includeArchived || !c.archived), (c) => (c.lastName + ' ' + c.firstName).toLocaleLowerCase('sr'));
    },
    async getClient(id) { const c = await db.clients.get(id); return live(c) ? c : null; },
    async saveClient(data) {
      const isNew = !data.id;
      const base = isNew
        ? { id: uid(), firstName: '', lastName: '', startDate: today(), goal: '', note: '', phone: '', email: '', archived: 0 }
        : (await db.clients.get(data.id)) || {};
      const c = { ...base, ...data, id: base.id || data.id };
      c.firstName = (c.firstName || '').trim(); c.lastName = (c.lastName || '').trim();
      check(validateClient(c));
      return put('clients', c, isNew);
    },
    async setClientArchived(id, archived) { return patch('clients', id, { archived: archived ? 1 : 0 }); },

    /* ---------------- вјежбе ---------------- */
    async listExercises({ includeArchived = false } = {}) {
      const all = (await db.exercises.toArray()).filter(live);
      return sortBy(all.filter((e) => includeArchived || !e.archived), (e) => e.name.toLocaleLowerCase('sr'));
    },
    async exerciseMap() { return new Map((await db.exercises.toArray()).map((e) => [e.id, e])); },
    async saveExercise(data) {
      const isNew = !data.id;
      const base = isNew ? { id: uid(), name: '', category: 'Ноге', type: 'load', note: '', builtin: 0, archived: 0 } : (await db.exercises.get(data.id)) || {};
      const e = { ...base, ...data, id: base.id || data.id };
      e.name = (e.name || '').trim();
      check(validateExercise(e));
      return put('exercises', e, isNew);
    },
    async setExerciseArchived(id, archived) { return patch('exercises', id, { archived: archived ? 1 : 0 }); },

    /* ---------------- програми (шаблони) ---------------- */
    async listPrograms({ clientId, includeArchived = false } = {}) {
      let all = (await db.programs.toArray()).filter(live).filter((p) => includeArchived || !p.archived);
      if (clientId !== undefined) all = all.filter((p) => p.clientId === clientId);
      return sortBy(all, (p) => p.name.toLocaleLowerCase('sr'));
    },
    async getProgram(id) { const p = await db.programs.get(id); return live(p) ? p : null; },
    async saveProgram(data) {
      const p = { name: '', note: '', clientId: null, items: [], archived: 0, ...data };
      p.name = (p.name || '').trim();
      if (!p.name) throw new ValidationError({ name: 'Унесите назив програма.' });
      for (const it of p.items) {
        if (!it.id) it.id = uid();
        for (const s of it.sets) {
          if (s.tempo) { const t = normalizeTempo(s.tempo); if (t === false) throw new ValidationError({ tempo: 'Темпо у облику 3-1-1-0.' }); s.tempo = t; }
          const errs = validateSet({ reps: s.reps, weightKg: s.weightKg, durationSec: s.durationSec, restSec: s.restSec });
          check(errs);
        }
      }
      const isNew = !p.id;
      if (isNew) p.id = uid();
      return put('programs', JSON.parse(JSON.stringify(p)), isNew);
    },
    /** Копија програма (нпр. додјела другом клијенту) — нови id, оригинал остаје непромијењен */
    async copyProgram(id, { clientId = null, name } = {}) {
      const p = await repo.getProgram(id);
      const copy = JSON.parse(JSON.stringify(p));
      delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy.demo;
      copy.clientId = clientId; copy.name = name || p.name;
      copy.items.forEach((it) => { it.id = uid(); });
      return repo.saveProgram(copy);
    },
    async setProgramArchived(id, archived) { return patch('programs', id, { archived: archived ? 1 : 0 }); },

    /* ---------------- тренинзи ---------------- */
    async listSessions({ clientId, from, to, status, programName } = {}) {
      let coll = clientId ? db.sessions.where('clientId').equals(clientId) : db.sessions.toCollection();
      let all = (await coll.toArray()).filter(live);
      if (from) all = all.filter((s) => s.date >= from);
      if (to) all = all.filter((s) => s.date <= to);
      if (status) all = all.filter((s) => s.status === status);
      if (programName) all = all.filter((s) => (s.programName || '') === programName);
      return all.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    },
    async getSession(id) { const s = await db.sessions.get(id); return live(s) ? s : null; },
    /** Тренинг са вјежбама и серијама, сортирано по редослиједу */
    async getSessionFull(id) {
      const s = await repo.getSession(id);
      if (!s) return null;
      const exs = sortBy((await db.sessionExercises.where('sessionId').equals(id).toArray()).filter(live), 'position');
      const sets = (await db.sets.where('sessionId').equals(id).toArray()).filter(live);
      const bySe = new Map(exs.map((e) => [e.id, []]));
      for (const st of sets) if (bySe.has(st.sessionExerciseId)) bySe.get(st.sessionExerciseId).push(st);
      return { session: s, exercises: exs.map((e) => ({ ...e, sets: sortBy(bySe.get(e.id), 'position') })) };
    },
    async listSets({ clientId, sessionIds } = {}) {
      let all = clientId ? await db.sets.where('clientId').equals(clientId).toArray() : await db.sets.toArray();
      all = all.filter(live);
      if (sessionIds) { const ids = new Set(sessionIds); all = all.filter((s) => ids.has(s.sessionId)); }
      return all;
    },
    async listSessionExercises({ sessionIds } = {}) {
      const all = (await db.sessionExercises.toArray()).filter(live);
      if (!sessionIds) return all;
      const ids = new Set(sessionIds);
      return all.filter((e) => ids.has(e.sessionId));
    },

    /**
     * Нови тренинг. Ако је дат програм, вјежбе и планиране серије се КОПИРАЈУ у тренинг —
     * каснија измјена шаблона не мијења већ сачуване тренинге.
     */
    async createSession({ clientId, date, time = null, programId = null, status = 'planned', programName = '' }) {
      const program = programId ? await repo.getProgram(programId) : null;
      const s = { id: uid(), clientId, date, time: time || null, programId: program?.id || null, programName: program?.name || programName || '', status, mood: null, sleep: null, note: '' };
      check(validateSession(s));
      await db.transaction('rw', db.sessions, db.sessionExercises, db.sets, async () => {
        await put('sessions', s, true);
        if (program) {
          let pos = 0;
          for (const it of program.items) await repo._addExerciseRows(s, it.exerciseId, pos++, it.sets, it.note || '');
        }
      });
      return s;
    },
    async _addExerciseRows(session, exerciseId, position, planSets, note = '') {
      const se = { id: uid(), sessionId: session.id, clientId: session.clientId, exerciseId, position, note };
      await put('sessionExercises', se, true);
      let i = 0;
      for (const p of planSets) {
        await put('sets', {
          id: uid(), sessionId: session.id, sessionExerciseId: se.id, clientId: session.clientId, exerciseId, position: i++,
          planReps: p.reps ?? null, planWeightKg: p.weightKg ?? null, planDurationSec: p.durationSec ?? null,
          reps: null, weightKg: null, durationSec: null,
          tempo: p.tempo ?? null, restSec: p.restSec ?? null, done: 0, note: '',
        }, true);
      }
      return se;
    },
    async updateSession(id, changes) {
      const cur = await db.sessions.get(id);
      const next = { ...cur, ...changes };
      check(validateSession(next));
      return put('sessions', next);
    },
    async deleteSession(id) {
      await db.transaction('rw', db.sessions, db.sessionExercises, db.sets, async () => {
        await patch('sessions', id, { deleted: 1 });
        for (const e of await db.sessionExercises.where('sessionId').equals(id).toArray()) await put('sessionExercises', { ...e, deleted: 1 });
        for (const st of await db.sets.where('sessionId').equals(id).toArray()) await put('sets', { ...st, deleted: 1 });
      });
    },
    /** Копира тренинг на други датум и/или другом клијенту. Одрађене вриједности постају нови план. */
    async copySession(id, { clientId, date, time = null }) {
      const full = await repo.getSessionFull(id);
      const src = full.session;
      const s = { id: uid(), clientId: clientId || src.clientId, date, time, programId: src.programId, programName: src.programName, status: 'planned', mood: null, sleep: null, note: '' };
      check(validateSession(s));
      await db.transaction('rw', db.sessions, db.sessionExercises, db.sets, async () => {
        await put('sessions', s, true);
        let pos = 0;
        for (const e of full.exercises) {
          const plan = e.sets.map((st) => ({
            reps: st.reps ?? st.planReps, weightKg: st.weightKg ?? st.planWeightKg, durationSec: st.durationSec ?? st.planDurationSec,
            tempo: st.tempo, restSec: st.restSec,
          }));
          await repo._addExerciseRows(s, e.exerciseId, pos++, plan, e.note);
        }
      });
      return s;
    },
    /** Сачува тренинг као нови шаблон програма */
    async sessionToProgram(id, { name, clientId = null }) {
      const full = await repo.getSessionFull(id);
      return repo.saveProgram({
        name, clientId,
        items: full.exercises.map((e) => ({
          exerciseId: e.exerciseId, note: e.note || '',
          sets: e.sets.map((st) => ({ reps: st.reps ?? st.planReps, weightKg: st.weightKg ?? st.planWeightKg, durationSec: st.durationSec ?? st.planDurationSec, tempo: st.tempo, restSec: st.restSec })),
        })),
      });
    },

    /* ---------------- вјежбе и серије у тренингу ---------------- */
    async addExerciseToSession(sessionId, exerciseId, setCount = 1) {
      const s = await repo.getSession(sessionId);
      const exs = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).filter(live);
      const pos = exs.length ? Math.max(...exs.map((e) => e.position)) + 1 : 0;
      let se;
      await db.transaction('rw', db.sessionExercises, db.sets, async () => {
        se = await repo._addExerciseRows(s, exerciseId, pos, Array.from({ length: setCount }, () => ({})));
      });
      return se;
    },
    async removeSessionExercise(seId) {
      await db.transaction('rw', db.sessionExercises, db.sets, async () => {
        await patch('sessionExercises', seId, { deleted: 1 });
        for (const st of await db.sets.where('sessionExerciseId').equals(seId).toArray()) await put('sets', { ...st, deleted: 1 });
      });
    },
    async updateSessionExercise(seId, changes) { return patch('sessionExercises', seId, changes); },
    /** Помјера вјежбу горе (-1) или доле (+1) */
    async moveSessionExercise(seId, dir) {
      const se = await db.sessionExercises.get(seId);
      const list = sortBy((await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray()).filter(live), 'position');
      const i = list.findIndex((x) => x.id === seId), j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await db.transaction('rw', db.sessionExercises, async () => {
        for (let k = 0; k < list.length; k++) if (list[k].position !== k) await put('sessionExercises', { ...list[k], position: k });
      });
    },
    /** Нова серија; са copyFromId копира вриједности те серије */
    async addSet(seId, copyFromId = null) {
      const se = await db.sessionExercises.get(seId);
      const sets = sortBy((await db.sets.where('sessionExerciseId').equals(seId).toArray()).filter(live), 'position');
      const last = sets[sets.length - 1];
      const src = copyFromId ? await db.sets.get(copyFromId) : null;
      const rec = {
        id: uid(), sessionId: se.sessionId, sessionExerciseId: seId, clientId: se.clientId, exerciseId: se.exerciseId,
        position: last ? last.position + 1 : 0,
        planReps: src?.planReps ?? null, planWeightKg: src?.planWeightKg ?? null, planDurationSec: src?.planDurationSec ?? null,
        reps: src?.reps ?? null, weightKg: src?.weightKg ?? null, durationSec: src?.durationSec ?? null,
        tempo: src?.tempo ?? last?.tempo ?? null, restSec: src?.restSec ?? last?.restSec ?? null, done: 0, note: '',
      };
      if (src) {
        // копија се умеће одмах иза изворне серије
        rec.position = src.position + 0.5;
      }
      await put('sets', rec, true);
      if (src) await repo._renumberSets(seId);
      return rec;
    },
    async _renumberSets(seId) {
      const sets = sortBy((await db.sets.where('sessionExerciseId').equals(seId).toArray()).filter(live), 'position');
      for (let k = 0; k < sets.length; k++) if (sets[k].position !== k) await put('sets', { ...sets[k], position: k });
    },
    async getSet(id) { const s = await db.sets.get(id); return live(s) ? s : null; },
    async updateSet(id, changes) {
      const cur = await db.sets.get(id);
      const next = { ...cur, ...changes };
      if ('tempo' in changes && changes.tempo !== null) {
        const t = normalizeTempo(changes.tempo);
        if (t === false) throw new ValidationError({ tempo: 'Темпо у облику 3-1-1-0 (четири броја).' });
        next.tempo = t;
      }
      check(validateSet(next));
      return put('sets', next);
    },
    /** Преноси вриједности претходне серије у ову серију */
    async copyPreviousSet(id) {
      const cur = await db.sets.get(id);
      const sets = sortBy((await db.sets.where('sessionExerciseId').equals(cur.sessionExerciseId).toArray()).filter(live), 'position');
      const i = sets.findIndex((s) => s.id === id);
      if (i <= 0) return cur;
      const p = sets[i - 1];
      return repo.updateSet(id, {
        reps: p.reps ?? p.planReps, weightKg: p.weightKg ?? p.planWeightKg, durationSec: p.durationSec ?? p.planDurationSec,
        tempo: p.tempo, restSec: p.restSec,
      });
    },
    async removeSet(id) {
      const st = await patch('sets', id, { deleted: 1 });
      await repo._renumberSets(st.sessionExerciseId);
    },
    /** Примјењује темпо или паузу на све серије вјежбе */
    async applyToAllSets(seId, changes) {
      const sets = (await db.sets.where('sessionExerciseId').equals(seId).toArray()).filter(live);
      await db.transaction('rw', db.sets, async () => { for (const s of sets) await repo.updateSet(s.id, changes); });
    },

    /** Посљедњи ранији тренинг клијента са истом вјежбом: {session, sets} или null */
    async previousResult(clientId, exerciseId, beforeSession) {
      const sets = (await db.sets.where('clientId').equals(clientId).toArray()).filter((s) => live(s) && s.exerciseId === exerciseId && s.sessionId !== beforeSession.id);
      if (!sets.length) return null;
      const sessIds = [...new Set(sets.map((s) => s.sessionId))];
      const sessions = (await db.sessions.bulkGet(sessIds)).filter((s) => live(s) && s.status !== 'skipped');
      const key = (s) => s.date + (s.time || '') + s.createdAt;
      const bkey = key(beforeSession);
      const earlier = sessions.filter((s) => key(s) < bkey && sets.some((x) => x.sessionId === s.id && x.done === 1));
      if (!earlier.length) return null;
      const last = earlier.sort((a, b) => key(b).localeCompare(key(a)))[0];
      return { session: last, sets: sortBy(sets.filter((x) => x.sessionId === last.id && x.done === 1), 'position') };
    },

    /* ---------------- пробни подаци ---------------- */
    async countDemo() {
      let n = 0;
      for (const t of ['clients', 'programs', 'sessions']) n += (await db.table(t).toArray()).filter((r) => r.demo && !r.deleted).length;
      return n;
    },
    /** Трајно уклања САМО записе означене као пробни (demo: 1) */
    async removeDemo() {
      const tables = ['clients', 'programs', 'sessions', 'sessionExercises', 'sets'];
      await db.transaction('rw', tables.map((t) => db.table(t)), async () => {
        for (const t of tables) {
          const ids = (await db.table(t).toArray()).filter((r) => r.demo).map((r) => r.id);
          await db.table(t).bulkDelete(ids);
        }
      });
    },
  };
  return repo;
}
