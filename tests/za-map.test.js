import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseName, classifyPart, HIDE } from '../src/body/za-map.js';
import { ZONE } from '../src/data/body-zones.js';
import { MUSCLE } from '../src/data/muscles.js';

const names = JSON.parse(fs.readFileSync(new URL('./fixtures/za-names.json', import.meta.url), 'utf8'));

describe('Z-Anatomy повезивање', () => {
  it('рашчлањује назив и страну', () => {
    expect(parseName('Long head of biceps brachii.l.001')).toEqual({ base: 'Long head of biceps brachii', side: 'L' });
    expect(parseName('Diaphragm.001')).toEqual({ base: 'Diaphragm', side: 'C' });
  });
  it('сваки мишић модела има зону, а зоне и описи постоје', () => {
    for (const n of names.muscles) {
      const { base } = parseName(n); if (HIDE.test(base)) continue;
      const r = classifyPart('muscles', base);
      expect(r.zone, base).toBeTruthy();
      expect(ZONE[r.zone], base).toBeTruthy();
      if (r.muscleId) expect(MUSCLE[r.muscleId], base).toBeTruthy();
    }
  });
  it('кључни мишићи иду на прави опис', () => {
    expect(classifyPart('muscles', 'Clavicular part of deltoid muscle').muscleId).toBe('deltant');
    expect(classifyPart('muscles', 'Medial head of gastrocnemius').muscleId).toBe('gastroc');
    expect(classifyPart('muscles', 'Brachialis muscle').muscleId).toBe('brachialis');
    expect(classifyPart('fascia', 'Tensor fasciae latae').muscleId).toBe('tfl');
    expect(classifyPart('bones', 'Vertebra L3').zone).toBe('lspine');
  });
  it('зоне костију и фасција постоје', () => {
    for (const kind of ['bones', 'fascia']) for (const n of names[kind]) {
      const r = classifyPart(kind, parseName(n).base);
      if (r.zone) expect(ZONE[r.zone]).toBeTruthy();
    }
  });
});
