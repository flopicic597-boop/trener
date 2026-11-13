// Слој базе: шема IndexedDB (преко Dexie) и миграције.
// ПРАВИЛО: никада не мијењати постојећу version(N) — увијек додати нову version(N+1)
// са upgrade() функцијом. Тако надоградња апликације не брише постојеће податке.
import Dexie from 'dexie';

export const DB_NAME = 'trener-evidencija';
export const SCHEMA_VERSION = 3;

/** Табеле које се извозе/увозе и синхронизују по стабилном id-у */
export const SYNC_TABLES = ['clients', 'exercises', 'programs', 'sessions', 'sessionExercises', 'sets', 'options', 'payments', 'findings', 'attachments'];

export const SCHEMA_V1 = {
  clients: 'id, updatedAt',
  exercises: 'id, name, updatedAt',
  programs: 'id, clientId, updatedAt',
  sessions: 'id, clientId, date, [clientId+date], status, updatedAt',
  sessionExercises: 'id, sessionId, exerciseId, updatedAt',
  sets: 'id, sessionId, sessionExerciseId, clientId, exerciseId, updatedAt',
  meta: 'key',
};

export function createDb(name = DB_NAME, opts = {}) {
  const db = new Dexie(name, opts);

  // Верзија 1: прва шема.
  db.version(1).stores(SCHEMA_V1);

  // Верзија 2: подесиве изборне вриједности (options), подаци за спајање увоза (syncBase),
  // локални снимци прије увоза (snapshots) и обавезно поље deleted (0/1) за меко брисање.
  db.version(2)
    .stores({ options: 'id, updatedAt', syncBase: 'key', snapshots: 'id, createdAt' })
    .upgrade(async (tx) => {
      const stamp = new Date().toISOString();
      for (const t of ['clients', 'exercises', 'programs', 'sessions', 'sessionExercises', 'sets']) {
        await tx.table(t).toCollection().modify((r) => {
          if (r.deleted === undefined) r.deleted = 0;
          if (!r.createdAt) r.createdAt = r.updatedAt || stamp;
          if (!r.updatedAt) r.updatedAt = r.createdAt;
        });
      }
      await tx.table('exercises').toCollection().modify((e) => { if (!e.type) e.type = 'load'; });
      // подешавања из v1 (meta.settings) прелазе у табелу options
      const old = await tx.table('meta').get('settings');
      if (old && old.value) {
        await tx.table('options').put({ id: 'settings', ...old.value, createdAt: stamp, updatedAt: stamp, deleted: 0 });
        await tx.table('meta').delete('settings');
      }
    });

  // Верзија 3: уплате чланарине, налази/анализе клијената и приложене датотеке налаза.
  // Само нове табеле — постојећи подаци остају непромијењени.
  db.version(3).stores({
    payments: 'id, clientId, updatedAt',
    findings: 'id, clientId, date, updatedAt',
    attachments: 'id, findingId, clientId, updatedAt',
  });

  return db;
}
