// CSV извоз за Excel. UTF-8 са BOM ознаком (Excel тада исправно приказује ћирилицу),
// раздвајач „;“ и децимални зарез — одговара регионалним подешавањима Србије/БиХ/ЦГ.
import { fmtNum, fmtDate } from '../lib/util.js';
import { STATUS } from '../domain/rules.js';
import { fmtTempo } from '../domain/rules.js';
import { TYPE_LABEL } from '../data/exercises-seed.js';
import { PAY_METHODS } from '../domain/membership.js';
import { FINDING_KINDS, paramName, effRef, refStatus } from '../domain/findings.js';

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

/** Уплате чланарине: један ред по уплати */
export function paymentsCsv(rows) {
  const header = ['Клијент', 'Датум уплате', 'Плаћено од', 'Плаћено до', 'Износ (€)', 'Начин', 'Напомена'];
  return toCsv(header, rows.map((r) => [r.clientName, fmtDate(r.p.paidDate), fmtDate(r.p.periodFrom), fmtDate(r.p.periodTo), r.p.amount, PAY_METHODS[r.p.method] || '', r.p.note || '']));
}

/** Налази: један ред по измјереној вриједности */
export function findingsCsv(rows) {
  const header = ['Клијент', 'Датум', 'Врста', 'Назив налаза', 'Параметар', 'Вриједност', 'Јединица', 'Опсег од', 'Опсег до', 'Оцјена'];
  const RS = { low: 'испод опсега', high: 'изнад опсега', ok: 'у опсегу' };
  const out = [];
  for (const r of rows) for (const v of r.f.values || []) {
    const ref = effRef(v);
    out.push([r.clientName, fmtDate(r.f.date), FINDING_KINDS[r.f.kind] || '', r.f.title || '', paramName(v), v.value, v.unit || '', ref.min, ref.max, RS[refStatus(v.value, ref)] || '']);
  }
  return toCsv(header, out);
}
