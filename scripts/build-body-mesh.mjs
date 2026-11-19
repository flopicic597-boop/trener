// Прави public/body/human.bin из MakeHuman модела (CC0 1.0, https://github.com/makehumancommunity/makehuman):
//   node scripts/build-body-mesh.mjs <фасцикла са base.obj и *-male-young / *-female-young .target>
// Резултат: заједничка мрежа троуглова (само „body“ група) + положаји тачака за мушко и женско
// тијело (просјек три групе MakeHuman облика) + положаји зглобова. Јединице: метри, стопала на y = 0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Употреба: node scripts/build-body-mesh.mjs <фасцикла>'); process.exit(1); }

const V = [], faces = [], groups = new Map();
let g = '';
for (const line of readFileSync(join(dir, 'base.obj'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('v ')) { const [, x, y, z] = line.split(/\s+/); V.push([+x, +y, +z]); }
  else if (line.startsWith('g ')) g = line.slice(2).trim();
  else if (line.startsWith('f ')) {
    const idx = line.slice(2).trim().split(/\s+/).map((t) => Number(t.split('/')[0]) - 1);
    if (g === 'body') faces.push(idx);
    else if (g.startsWith('joint-')) { const s = groups.get(g) || new Set(); idx.forEach((i) => s.add(i)); groups.set(g, s); }
  }
}
const target = (name) => {
  const off = new Map();
  for (const line of readFileSync(join(dir, name), 'utf8').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const [i, x, y, z] = line.trim().split(/\s+/).map(Number);
    off.set(i, [x, y, z]);
  }
  return off;
};
const shape = (sex) => {
  const ts = ['caucasian', 'african', 'asian'].map((r) => target(`${r}-${sex}-young.target`));
  return V.map((p, i) => {
    const o = [0, 0, 0];
    for (const t of ts) { const d = t.get(i); if (d) { o[0] += d[0] / 3; o[1] += d[1] / 3; o[2] += d[2] / 3; } }
    return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  });
};

// само тачке тијела, нумерисане редом
const used = [...new Set(faces.flat())].sort((a, b) => a - b);
const remap = new Map(used.map((v, i) => [v, i]));
const tris = [];
for (const f of faces) for (let k = 1; k + 1 < f.length; k++) tris.push(remap.get(f[0]), remap.get(f[k]), remap.get(f[k + 1]));

const JOINTS = ['head', 'neck', 'spine-1', 'spine-2', 'spine-3', 'spine-4', 'pelvis',
  ...['l', 'r'].flatMap((s) => ['clavicle', 'scapula', 'shoulder', 'elbow', 'hand', 'upper-leg', 'knee', 'ankle', 'foot-1', 'foot-2'].map((n) => `${s}-${n}`))];
const out = { sexes: {} };
for (const sex of ['male', 'female']) {
  const P = shape(sex);
  // стопала на 0, метри
  let minY = Infinity;
  for (const v of used) minY = Math.min(minY, P[v][1]);
  const S = 0.1;
  const pos = used.map((v) => [P[v][0] * S, (P[v][1] - minY) * S, P[v][2] * S]);
  const joints = {};
  for (const j of JOINTS) {
    const s = groups.get('joint-' + j);
    if (!s) { console.warn('нема зглоба', j); continue; }
    const c = [0, 0, 0]; for (const i of s) { c[0] += P[i][0]; c[1] += P[i][1]; c[2] += P[i][2]; }
    joints[j] = [c[0] / s.size * S, (c[1] / s.size - minY) * S, c[2] / s.size * S].map((x) => Math.round(x * 10000) / 10000);
  }
  out.sexes[sex] = { pos, joints };
}
// бинарни формат: [u32 дужина JSON заглавља][JSON][u16 индекси][f32 положаји мушко][f32 положаји женско]
const header = { vertices: used.length, triangles: tris.length / 3, joints: { male: out.sexes.male.joints, female: out.sexes.female.joints }, source: 'MakeHuman base mesh + macro targets, CC0 1.0' };
const hj = Buffer.from(JSON.stringify(header));
const pad = (n) => (4 - (n % 4)) % 4;
const idx = Buffer.from(new Uint16Array(tris).buffer);
const f32 = (pos) => Buffer.from(new Float32Array(pos.flat()).buffer);
const len = Buffer.alloc(4); len.writeUInt32LE(hj.length);
const parts = [len, hj, Buffer.alloc(pad(4 + hj.length)), idx, Buffer.alloc(pad(idx.length)), f32(out.sexes.male.pos), f32(out.sexes.female.pos)];
mkdirSync('public/body', { recursive: true });
writeFileSync('public/body/human.bin', Buffer.concat(parts));
console.log(`тијело: ${used.length} тачака, ${tris.length / 3} троуглова → public/body/human.bin (${Buffer.concat(parts).length} B)`);
console.log('висина m:', Math.max(...out.sexes.male.pos.map((p) => p[1])).toFixed(3), Math.max(...out.sexes.female.pos.map((p) => p[1])).toFixed(3));
console.log('зглобови m:', JSON.stringify({ lsh: out.sexes.male.joints['l-shoulder'], rsh: out.sexes.male.joints['r-shoulder'], lknee: out.sexes.male.joints['l-knee'], head: out.sexes.male.joints.head }));
