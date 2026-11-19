// Детаљни описи појединачних мишића (оригинални текст апликације, по стандардној анатомској
// литератури), повезани са зонама 3Д атласа.
import { MUSCLES_UPPER } from './muscles-upper.js';
import { MUSCLES_LOWER } from './muscles-lower.js';
import { MUSCLES_EXTRA } from './muscles-extra.js';
import { normSearch } from '../lib/util.js';

export const MUSCLES = [...MUSCLES_UPPER, ...MUSCLES_LOWER, ...MUSCLES_EXTRA];
export const MUSCLE = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));

/** Мишићи који припадају зони (први наведени су главни) */
export const musclesForZone = (zoneId) => MUSCLES.filter((m) => m.zones.includes(zoneId)).sort((a, b) => a.zones.indexOf(zoneId) - b.zones.indexOf(zoneId));

/** Претрага по српском или латинском називу, функцији и проблемима */
export function searchMuscles(q) {
  const n = normSearch(q || '').trim();
  if (!n) return [];
  return MUSCLES.filter((m) => normSearch(`${m.name} ${m.lat} ${m.action} ${m.issues}`).includes(n)).slice(0, 30);
}

export const MUSCLE_FIELDS = [
  ['origin', 'Почетак'], ['insertion', 'Припој'], ['nerve', 'Инервација'], ['action', 'Функција'], ['rel', 'Синергисти и антагонисти'],
  ['issues', 'Чести проблеми'], ['test', 'Процјена / тест'], ['train', 'Јачање'], ['stretch', 'Истезање и мобилност'],
];
