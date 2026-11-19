import { describe, it, expect } from 'vitest';
import { MUSCLES, musclesForZone, searchMuscles } from '../src/data/muscles.js';
import { ZONES, ZONE } from '../src/data/body-zones.js';

describe('детаљни описи мишића', () => {
  it('сваки мишић има јединствен id, латински назив и основне податке', () => {
    expect(MUSCLES.length).toBeGreaterThanOrEqual(85);
    expect(new Set(MUSCLES.map((m) => m.id)).size).toBe(MUSCLES.length);
    for (const m of MUSCLES) {
      for (const k of ['lat', 'name', 'origin', 'insertion', 'nerve', 'action']) expect(m[k], `${m.id}.${k}`).toBeTruthy();
      expect(m.zones.length, m.id).toBeGreaterThan(0);
      for (const z of m.zones) expect(ZONE[z], `${m.id} → ${z}`).toBeTruthy();
      const text = Object.values(m).filter((v) => typeof v === 'string').join(' ');
      expect(text, m.id).not.toMatch(/[Ѐ-ӿ][a-zA-Z]|[a-zA-Z][Ѐ-ӿ]|­/); // без мијешања писама
    }
  });
  it('свака мишићна зона атласа има бар један детаљно описан мишић', () => {
    for (const z of ZONES.filter((x) => x.layer === 'muscle')) expect(musclesForZone(z.id).length, z.id).toBeGreaterThan(0);
  });
  it('претрага по латинском и српском називу', () => {
    expect(searchMuscles('supraspinatus').map((m) => m.id)).toContain('supraspinatus');
    expect(searchMuscles('примицач').length).toBeGreaterThanOrEqual(3);
    expect(searchMuscles('primicac').length).toBeGreaterThanOrEqual(3); // латиница без квачица
    expect(searchMuscles('')).toEqual([]);
  });
});
