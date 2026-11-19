// Стилизовани 3Д модел човјека (мушко/женско), изграђен од основних облика (без спољних датотека).
// Три слоја зона: мишићи, скелет и зглобови, фасцијални ланци. Свака зона је засебан
// mesh са userData {zone, side} за избор додиром. Јединице: метри, y нагоре, лице ка +z.
import * as THREE from 'three';
import { buildHuman, skeletonOf } from './human.js';
import { ZONE } from '../data/body-zones.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------------- помоћне функције за облике ---------------------- */
const sphereGeo = new THREE.SphereGeometry(1, 32, 22);
function ellipsoid(mat, pos, r, rot) {
  const m = new THREE.Mesh(sphereGeo, mat);
  m.position.copy(pos); m.scale.set(r[0], r[1], r[2]);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  return m;
}
/** Капсула између двије тачке */
function segment(mat, a, b, r, from = 0, to = 1, offset = V(0, 0, 0)) {
  const A = a.clone().lerp(b, from), B = a.clone().lerp(b, to);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r * 0.6), 8, 18), mat);
  m.position.copy(A.clone().add(B).multiplyScalar(0.5).add(offset));
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}
function tube(mat, pts, r = 0.009) {
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), r, 8, false), mat);
}

/* ------------------------------- модел ------------------------------- */
/**
 * Враћа { root, layers: {skin, muscle, skeleton, fascia}, pickables: {muscle:[], skeleton:[], fascia:[]} }
 * palette: { muscle, bone, joint, fascia, skin } боје
 */
export function buildBody(sex, palette, data) {
  const { J, P } = skeletonOf(data, sex);
  const root = new THREE.Group();
  const layers = { skin: new THREE.Group(), muscle: new THREE.Group(), skeleton: new THREE.Group(), fascia: new THREE.Group() };
  Object.values(layers).forEach((g) => root.add(g));
  const pickables = { muscle: [], skeleton: [], fascia: [] };

  // материјали
  const skinMat = new THREE.MeshStandardMaterial({ color: palette.skin, transparent: true, opacity: 0.16, roughness: 0.6, metalness: 0.1, depthWrite: false });
  const boneMat = new THREE.MeshStandardMaterial({ color: palette.bone, roughness: 0.55, metalness: 0.05 });
  const zoneMat = (layer) => new THREE.MeshStandardMaterial({
    color: palette[layer], roughness: layer === 'fascia' ? 0.3 : 0.5, metalness: 0.1,
    emissive: palette[layer], emissiveIntensity: layer === 'fascia' ? 0.55 : 0.12,
    transparent: layer === 'fascia', opacity: layer === 'fascia' ? 0.9 : 1,
  });
  /** Додаје mesh као зону (сваки mesh добија свој материјал ради истицања) */
  const zone = (layer, id, side, ...meshes) => {
    const mat = zoneMat(layer === 'skeleton' ? 'joint' : layer);
    if (layer === 'muscle') { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997; mat.color.offsetHSL(((h % 5) - 2) * 0.004, 0, ((h % 5) - 2) * 0.035); mat.userData.base = mat.color.getHex(); }
    for (const m of meshes) { m.material = mat; m.userData = { zone: id, side, layer }; layers[layer].add(m); pickables[layer].push(m); }
  };

  // Модел гледа ка камери (+z): лијева страна особе је на десној страни гледаоца (+x).

  /* ---------- тијело: глатка човјеколика површина ---------- */
  const human = buildHuman(data, sex, J, P);
  // провидна кожа за слојеве скелета и фасција
  layers.skin.add(new THREE.Mesh(human.geometry, skinMat));
  // мишићни слој: иста површина, обојена по мишићним зонама (боја по тачки)
  const muscleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
  const muscleMesh = new THREE.Mesh(human.geometry, muscleMat);
  const vz = human.vertexZone, vs = human.vertexSide;
  const sideOf = (i) => (ZONE[vz[i]]?.paired ? vs[i] : 'C');
  muscleMesh.userData = { layer: 'muscle', zoneAt: (face) => { const i = [face.a, face.b, face.c].find((k) => vz[k]) ?? face.a; return vz[i] ? { zone: vz[i], side: sideOf(i) } : null; } };
  layers.muscle.add(muscleMesh); pickables.muscle.push(muscleMesh);
  // ивице између мишића (тамније линије)
  const border = new Uint8Array(vz.length), ix = human.geometry.index.array;
  for (let t = 0; t < ix.length; t += 3) { const a = ix[t], b = ix[t + 1], c = ix[t + 2]; if (vz[a] !== vz[b] || vz[b] !== vz[c]) border[a] = border[b] = border[c] = 2; }
  // шира ивица: сусједи ивичних тачака добијају благо затамњење
  for (let t = 0; t < ix.length; t += 3) { const a = ix[t], b = ix[t + 1], c = ix[t + 2]; if (border[a] === 2 || border[b] === 2 || border[c] === 2) for (const k of [a, b, c]) if (!border[k]) border[k] = 1; }
  const shade = new Map();
  const zoneBase = (z) => { if (!shade.has(z)) { let h = 0; for (const ch of z) h = (h * 31 + ch.charCodeAt(0)) % 997; const c = new THREE.Color(palette.muscle); const ZL = ['neck', 'traps', 'delts', 'rotator', 'pecs', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'lats', 'upperback', 'erectors', 'glutemax', 'glutemed', 'hipflex', 'quads', 'hams', 'adductors', 'calves', 'tibialis', 'foot']; const k = Math.max(0, ZL.indexOf(z)); c.offsetHSL(((k % 3) - 1) * 0.012, 0, [0, 0.07, -0.05, 0.035][k % 4]); shade.set(z, c); } return shade.get(z); };
  const neutral = new THREE.Color(palette.skinSolid || '#5b6478');
  /** Боји мишићни слој: colorFor(zone, side) → { color, dim } или null за основну боју */
  const paintMuscle = (colorFor) => {
    const col = human.geometry.attributes.color, c = new THREE.Color();
    for (let i = 0; i < vz.length; i++) {
      const z = vz[i];
      if (!z) { c.copy(neutral); } else {
        const o = colorFor(z, sideOf(i));
        c.copy(o?.color || zoneBase(z));
        if (o?.dim) c.multiplyScalar(0.45);
        if (o?.glow) c.lerp(new THREE.Color('#ffffff'), 0.25);
      }
      if (border[i] === 2) c.multiplyScalar(0.4); else if (border[i] === 1) c.multiplyScalar(0.72);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  paintMuscle(() => null);

  /* ---------- скелет (кости + зглобови као зоне) ---------- */
  const sk = layers.skeleton;
  sk.add(ellipsoid(boneMat, V(0, P.head.y + 0.01, -0.005), [P.head.r * 0.9, P.head.r * 1.05, P.head.r * 1.0]));
  sk.add(ellipsoid(boneMat, V(0, P.head.y - 0.07, 0.04), [0.05, 0.03, 0.04])); // вилица
  const vert = (y0, y1, z, n, w) => { const out = []; for (let i = 0; i < n; i++) { const y = y0 + ((y1 - y0) * (i + 0.5)) / n; const b = new THREE.Mesh(new THREE.BoxGeometry(w, ((y1 - y0) / n) * 0.7, w * 0.8)); b.position.set(0, y, z); out.push(b); } return out; };
  zone('skeleton', 'cspine', 'C', ...vert(P.neck[0], P.neck[1] + 0.02, -0.02, 7, 0.028));
  zone('skeleton', 'tspine', 'C', ...vert(P.chest.y - 0.13, P.neck[0], -0.07, 12, 0.03));
  zone('skeleton', 'lspine', 'C', ...vert(P.pelvis.y + 0.06, P.chest.y - 0.13, -0.05, 5, 0.038));
  const ribs = [];
  for (let i = 0; i < 7; i++) {
    const y = P.chest.y + 0.11 - i * 0.035, sc = 1 - Math.abs(i - 3) * 0.06;
    const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40));
    t.rotation.x = Math.PI / 2; t.position.set(0, y, -0.005); t.scale.set(P.chest.rx * 0.82 * sc, P.chest.rz * 0.88 * sc, 0.28);
    ribs.push(t);
  }
  zone('skeleton', 'ribs', 'C', ...ribs);
  const pel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 10, 40)); pel.rotation.x = Math.PI / 2 - 0.3; pel.position.set(0, P.pelvis.y, -0.01); pel.scale.set(P.pelvis.rx * 0.75, P.pelvis.rz * 0.8, 0.08);
  zone('skeleton', 'si', 'C', pel);
  for (const s of ['L', 'R']) {
    const j = J[s], sg = j.sg;
    sk.add(segment(boneMat, V(sg * 0.02, P.shoulder.y + 0.02, 0.06), j.sh.clone().add(V(0, 0.015, 0.02)), 0.011)); // кључна кост
    const scap = ellipsoid(boneMat, V(sg * 0.1, P.chest.y + 0.03, -0.095), [0.05, 0.065, 0.008], [0, 0, sg * 0.2]); sk.add(scap);
    sk.add(segment(boneMat, j.sh, j.el, 0.014, 0.08, 0.92), segment(boneMat, j.el, j.wr, 0.011, 0.08, 0.92, V(sg * 0.008, 0, 0)), segment(boneMat, j.el, j.wr, 0.01, 0.08, 0.92, V(-sg * 0.008, 0, 0)));
    sk.add(segment(boneMat, j.hip, j.kn, 0.02, 0.08, 0.92), segment(boneMat, j.kn, j.an, 0.017, 0.08, 0.9, V(-sg * 0.006, 0, 0.004)), segment(boneMat, j.kn, j.an, 0.009, 0.1, 0.9, V(sg * 0.02, 0, -0.008)));
    for (let k = 0; k < 5; k++) sk.add(segment(boneMat, V(j.an.x - 0.03 + k * 0.015, 0.03, 0.02), V(j.an.x - 0.035 + k * 0.018, 0.015, 0.16), 0.006));
    zone('skeleton', 'shoulderj', s, ellipsoid(null, j.sh, [0.036, 0.036, 0.036]));
    zone('skeleton', 'elbow', s, ellipsoid(null, j.el, [0.028, 0.028, 0.028]));
    zone('skeleton', 'wrist', s, ellipsoid(null, j.wr, [0.024, 0.02, 0.022]), segment(null, j.wr, j.ha, 0.022, 0.25, 1));
    zone('skeleton', 'hipj', s, ellipsoid(null, j.hip, [0.04, 0.04, 0.04]));
    zone('skeleton', 'knee', s, ellipsoid(null, j.kn, [0.042, 0.04, 0.042]));
    zone('skeleton', 'ankle', s, ellipsoid(null, j.an, [0.03, 0.026, 0.03]));
  }

  /* ---------- фасције и ланци ---------- */
  const back = [], front = [], lat = [], spiral = [];
  for (const s of ['L', 'R']) {
    const j = J[s], sg = j.sg;
    back.push(tube(null, [V(j.an.x, 0.02, 0.0), V(j.an.x, 0.12, -0.05), j.kn.clone().add(V(0, 0.12, -0.065)), j.hip.clone().add(V(0, -0.05, -0.085)), V(sg * 0.04, P.pelvis.y + 0.05, -0.12), V(sg * 0.035, P.chest.y, -0.13), V(sg * 0.025, P.neck[1], -0.07), V(sg * 0.02, P.head.y + 0.1, -0.06), V(sg * 0.02, P.head.y + 0.08, 0.08)], 0.008));
    front.push(tube(null, [V(j.an.x, 0.05, 0.16), V(j.an.x, 0.12, 0.05), j.kn.clone().add(V(0, -0.05, 0.05)), j.kn.clone().add(V(0, 0.1, 0.075)), j.hip.clone().add(V(0, -0.02, 0.085)), V(sg * 0.045, P.waist.y, P.waist.rz + 0.008), V(sg * 0.04, P.chest.y + 0.04, P.chest.rz + 0.005), V(sg * 0.04, P.neck[1], 0.045), V(sg * 0.06, P.head.y - 0.02, 0.05)], 0.008));
    lat.push(tube(null, [V(j.an.x + sg * 0.035, 0.03, 0.0), j.kn.clone().add(V(sg * 0.05, 0, 0)), j.hip.clone().add(V(sg * 0.075, 0, 0)), V(sg * (P.waist.rx + 0.01), P.waist.y, 0), V(sg * (P.chest.rx + 0.005), P.chest.y, 0), V(sg * 0.05, P.neck[1], 0), V(sg * 0.09, P.head.y, 0)], 0.008));
  }
  const L = J.L, R = J.R;
  spiral.push(tube(null, [V(0.06, P.head.y, -0.07), V(-0.08, P.chest.y + 0.08, -0.11), V(-P.chest.rx, P.chest.y - 0.05, 0.02), V(0.0, P.waist.y, P.waist.rz + 0.01), V(L.hip.x + 0.04, P.pelvis.y - 0.02, 0.07), L.kn.clone().add(V(0.05, 0.05, 0.03)), V(L.an.x, 0.05, 0.07)], 0.008));
  spiral.push(tube(null, [V(-0.06, P.head.y, -0.07), V(0.08, P.chest.y + 0.08, -0.11), V(P.chest.rx, P.chest.y - 0.05, 0.02), V(0.0, P.waist.y - 0.02, P.waist.rz + 0.01), V(R.hip.x - 0.04, P.pelvis.y - 0.02, 0.07), R.kn.clone().add(V(-0.05, 0.05, 0.03)), V(R.an.x, 0.05, 0.07)], 0.008));
  zone('fascia', 'f_back', 'C', ...back);
  zone('fascia', 'f_front', 'C', ...front);
  zone('fascia', 'f_lateral', 'C', ...lat);
  zone('fascia', 'f_spiral', 'C', ...spiral);
  zone('fascia', 'f_tl', 'C', ellipsoid(null, V(0, P.waist.y - 0.03, -P.waist.rz - 0.012), [0.11, 0.1, 0.012], [0, 0, Math.PI / 4]));
  for (const s of ['L', 'R']) {
    const j = J[s];
    zone('fascia', 'f_it', s, segment(null, j.hip.clone().add(V(j.sg * 0.07, 0.02, 0)), j.kn.clone().add(V(j.sg * 0.045, -0.02, 0)), 0.014));
    const pl = ellipsoid(null, V(j.an.x, 0.006, 0.06), [0.035, 0.006, 0.11]);
    zone('fascia', 'f_plantar', s, pl);
  }
  return { root, layers, pickables, paintMuscle };
}
