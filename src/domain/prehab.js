// Тренинг из обиљежених зона тијела: приједлог вјежби превенције/опоравка и снаге.
import { ZONE, zoneLabel } from '../data/body-zones.js';

export const MODES = {
  prehab: 'Превенција и опоравак (лакше, контролисано)',
  strength: 'Јачање зоне (вјежбе снаге из библиотеке)',
};

/**
 * marks: [{zone, side, type, active}] — активне ознаке клијента
 * exercises: листа вјежби из библиотеке (са zones за prehab вјежбе)
 * Враћа [{exercise, zones:[ознаке због којих је предложена], sets:[план серија]}] без дупликата.
 */
export function suggestExercises(marks, exercises, { mode = 'prehab', perZone = 3 } = {}) {
  const byId = new Map(exercises.filter((e) => !e.archived && !e.deleted).map((e) => [e.id, e]));
  const out = new Map();
  const add = (ex, mark) => {
    if (!ex) return;
    const o = out.get(ex.id) || { exercise: ex, zones: [], gentle: false };
    const lbl = zoneLabel(mark.zone, mark.side);
    if (!o.zones.includes(lbl)) o.zones.push(lbl);
    if (mark.type === 'pain' || mark.type === 'injury') o.gentle = true;
    out.set(ex.id, o);
  };
  for (const m of marks.filter((x) => x.active !== 0)) {
    const z = ZONE[m.zone]; if (!z) continue;
    const list = [...(z.ex || []).map((id) => byId.get(id)), ...[...byId.values()].filter((e) => e.prehab && (e.zones || []).includes(m.zone))];
    const uniq = [...new Map(list.filter(Boolean).map((e) => [e.id, e])).values()];
    uniq.slice(0, perZone).forEach((e) => add(e, m));
    if (mode === 'strength' && m.type !== 'pain' && m.type !== 'injury') {
      [...byId.values()].filter((e) => !e.prehab && (z.cats || []).includes(e.category) && e.type !== 'time').slice(0, 2).forEach((e) => add(e, m));
    }
  }
  return [...out.values()].map((o) => ({ ...o, sets: planSets(o.exercise, o.gentle) }));
}

/** Доза из упутства вјежбе, нпр. „2–3 × 12–15“, „почните са 2 × 3–5“, „30–45 с“ */
export function doseFromCue(cue = '') {
  const t = String(cue).replace(/\s+/g, ' ');
  const sr = t.match(/(\d+)(?:–(\d+))?\s*×\s*(\d+)(?:–(\d+))?/);
  const sec = t.match(/(\d+)(?:–(\d+))?\s*с(?![\p{L}])/u);
  return sr ? { setsLo: +sr[1], setsHi: +(sr[2] || sr[1]), repsLo: +sr[3], sec: sec ? +sec[1] : null } : { setsLo: null, setsHi: null, repsLo: null, sec: sec ? +sec[1] : null };
}

/** Подразумијевани план: по упутству вјежбе; блаже (мање серија, спорији темпо) за зоне са болом/повредом */
export function planSets(ex, gentle) {
  const d = doseFromCue(ex.note);
  const n = Math.max(1, Math.min(5, (gentle ? d.setsLo : d.setsHi) || (gentle ? 2 : 3)));
  if (ex.type === 'time') return Array.from({ length: n }, () => ({ durationSec: d.sec || (gentle ? 20 : 30), restSec: 30 }));
  const reps = d.repsLo || (gentle ? 10 : 12);
  return Array.from({ length: n }, () => ({ reps, restSec: gentle ? 45 : 60, tempo: gentle ? '3-1-1-0' : null }));
}
