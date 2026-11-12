// CSV извоз за Excel. UTF-8 са BOM ознаком (Excel тада исправно приказује ћирилицу),
// раздвајач „;“ и децимални зарез — одговара регионалним подешавањима Србије/БиХ/ЦГ.
import { fmtNum, fmtDate } from '../lib/util.js';
import { STATUS } from '../domain/rules.js';
import { fmtTempo } from '../domain/rules.js';
import { TYPE_LABEL } from '../data/exercises-seed.js';

const BOM = '﻿';

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? fmtNum(v, 3) : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header, rows) {
  return BOM + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** Дневни преглед: један ред по тренингу */
export function dailyCsv(rows) {
  const header = ['Датум', 'Вријеме', 'Клијент', 'Програм', 'Расположење (1–5)', 'Сан (сати)', 'Одрађене вјежбе', 'Завршене серије', 'Укупно серија', 'Статус', 'Напомена'];
  return toCsv(header, rows.map((r) => [fmtDate(r.session.date), r.session.time || '', r.clientName, r.session.programName || '', r.session.mood, r.session.sleep, r.exercisesDone, r.setsDone, r.setsTotal, STATUS[r.session.status], r.session.note || '']));
}

/** Детаљне серије: један ред по серији */
export function setsCsv(rows) {
  const header = ['Датум', 'Клијент', 'Програм', 'Статус тренинга', 'Вјежба', 'Врста', 'Серија', 'План понављања', 'План кг', 'План трајања (с)', 'Понављања', 'Трајање (с)', 'Темпо', 'Пауза (сек.)', 'Оптерећење (кг)', 'Завршено', 'Напомена'];
  return toCsv(header, rows.map((r) => [
    fmtDate(r.session.date), r.clientName, r.session.programName || '', STATUS[r.session.status], r.exercise?.name || '?', TYPE_LABEL[r.exercise?.type] || '',
    r.set.position + 1, r.set.planReps, r.set.planWeightKg, r.set.planDurationSec, r.set.reps, r.set.durationSec, fmtTempo(r.set.tempo), r.set.restSec, r.set.weightKg,
    r.set.done ? 'да' : 'не', r.set.note || '',
  ]));
}
