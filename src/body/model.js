// Стилизовани 3Д модел човјека (мушко/женско), изграђен од основних облика (без спољних датотека).
// Три слоја зона: мишићи, скелет и зглобови, фасцијални ланци. Свака зона је засебан
// mesh са userData {zone, side} за избор додиром. Јединице: метри, y нагоре, лице ка +z.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Пропорције тијела */
function proportions(sex) {
  const f = sex === 'f';
  return {
    f,
    head: { y: f ? 1.6 : 1.66, r: f ? 0.098 : 0.105 },
    neck: [f ? 1.43 : 1.47, f ? 1.52 : 1.56],
    shoulder: { x: f ? 0.175 : 0.2, y: f ? 1.39 : 1.43 },
    chest: { y: f ? 1.27 : 1.3, rx: f ? 0.145 : 0.17, ry: f ? 0.15 : 0.17, rz: f ? 0.1 : 0.11 },
    waist: { y: f ? 1.09 : 1.1, rx: f ? 0.11 : 0.135, rz: f ? 0.085 : 0.095 },
    pelvis: { y: f ? 0.93 : 0.95, rx: f ? 0.175 : 0.155, ry: 0.1, rz: f ? 0.115 : 0.105 },
    elbow: { x: f ? 0.22 : 0.25, y: f ? 1.12 : 1.15 }, wrist: { x: f ? 0.255 : 0.29, y: f ? 0.88 : 0.9 }, hand: { x: f ? 0.27 : 0.31, y: f ? 0.79 : 0.8 },
    hip: { x: f ? 0.095 : 0.09, y: f ? 0.91 : 0.93 }, knee: { x: f ? 0.09 : 0.1, y: 0.5 }, ankle: { x: 0.1, y: 0.08 },
    arm: f ? [0.04, 0.032] : [0.047, 0.038], leg: f ? [0.075, 0.048] : [0.076, 0.052],
  };
}

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
export function buildBody(sex, palette) {
  const P = proportions(sex);
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

  // кључне тачке
  // Модел гледа ка камери (+z): лијева страна особе је на десној страни гледаоца (+x).
  const J = {};
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? 1 : -1;
    J[s] = {
      sh: V(sg * P.shoulder.x, P.shoulder.y, 0), el: V(sg * P.elbow.x, P.elbow.y, -0.01), wr: V(sg * P.wrist.x, P.wrist.y, 0.02), ha: V(sg * P.hand.x, P.hand.y, 0.03),
      hip: V(sg * P.hip.x, P.hip.y, 0), kn: V(sg * P.knee.x, P.knee.y, 0.01), an: V(sg * P.ankle.x, P.ankle.y, -0.01), sg,
    };
  }

  /* ---------- кожа (провидни „холограм“) ---------- */
  const skin = layers.skin;
  skin.add(ellipsoid(skinMat, V(0, P.head.y, 0), [P.head.r, P.head.r * 1.18, P.head.r * 1.08]));
  skin.add(segment(skinMat, V(0, P.neck[0], -0.01), V(0, P.neck[1], -0.005), 0.052));
  skin.add(ellipsoid(skinMat, V(0, P.chest.y, 0), [P.chest.rx, P.chest.ry, P.chest.rz]));
  skin.add(ellipsoid(skinMat, V(0, P.waist.y, 0), [P.waist.rx, 0.12, P.waist.rz]));
  skin.add(ellipsoid(skinMat, V(0, P.pelvis.y, 0), [P.pelvis.rx, P.pelvis.ry, P.pelvis.rz]));
  if (P.f) for (const x of [0.072, -0.072]) skin.add(ellipsoid(skinMat, V(x, P.chest.y + 0.01, 0.085), [0.058, 0.055, 0.05]));
  for (const s of ['L', 'R']) {
    const j = J[s];
    skin.add(segment(skinMat, j.sh, j.el, P.arm[0]), segment(skinMat, j.el, j.wr, P.arm[1]), segment(skinMat, j.wr, j.ha, 0.03));
    skin.add(segment(skinMat, j.hip, j.kn, P.leg[0]), segment(skinMat, j.kn, j.an, P.leg[1]));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.24), skinMat); foot.position.set(j.an.x, 0.035, 0.06); skin.add(foot);
  }

  /* ---------- мишићи (обликовани из више дијелова, као праве главе мишића) ---------- */
  const fz = P.f ? 0.92 : 1; // жене: нешто мањи обим мишића
  const at = (a, b, t) => a.clone().lerp(b, t);
  zone('muscle', 'neck', 'C',
    segment(null, V(0.025, P.neck[0] - 0.01, 0.02), V(0.012, P.neck[1], 0.035), 0.022 * fz), segment(null, V(-0.025, P.neck[0] - 0.01, 0.02), V(-0.012, P.neck[1], 0.035), 0.022 * fz),
    segment(null, V(0, P.neck[0] - 0.01, -0.02), V(0, P.neck[1], -0.02), 0.035 * fz));
  zone('muscle', 'traps', 'C',
    ellipsoid(null, V(0.07, P.shoulder.y + 0.015, -0.035), [0.08 * fz, 0.035, 0.045], [0, 0, -0.35]), ellipsoid(null, V(-0.07, P.shoulder.y + 0.015, -0.035), [0.08 * fz, 0.035, 0.045], [0, 0, 0.35]),
    ellipsoid(null, V(0, P.chest.y - 0.02, -0.098), [0.06, 0.14, 0.025]));
  zone('muscle', 'upperback', 'C', ellipsoid(null, V(0.055, P.chest.y + 0.02, -0.1), [0.045 * fz, 0.07, 0.022], [0, 0, 0.3]), ellipsoid(null, V(-0.055, P.chest.y + 0.02, -0.1), [0.045 * fz, 0.07, 0.022], [0, 0, -0.3]));
  zone('muscle', 'erectors', 'C', ellipsoid(null, V(0.028, P.waist.y - 0.01, -P.waist.rz + 0.005), [0.026, 0.17, 0.028]), ellipsoid(null, V(-0.028, P.waist.y - 0.01, -P.waist.rz + 0.005), [0.026, 0.17, 0.028]));
  const absParts = [];
  for (const [dy, r] of [[0.105, 0.026], [0.05, 0.028], [-0.005, 0.028]]) for (const x of [0.03, -0.03]) absParts.push(ellipsoid(null, V(x, P.waist.y + dy, P.waist.rz + 0.004), [0.027 * fz, r, 0.018]));
  absParts.push(ellipsoid(null, V(0, P.waist.y - 0.075, P.waist.rz - 0.004), [0.055 * fz, 0.05, 0.02]));
  zone('muscle', 'abs', 'C', ...absParts);
  for (const s of ['L', 'R']) {
    const j = J[s], sg = j.sg;
    zone('muscle', 'delts', s,
      ellipsoid(null, j.sh.clone().add(V(sg * 0.005, -0.02, 0.03)), [0.035 * fz, 0.065, 0.035]),
      ellipsoid(null, j.sh.clone().add(V(sg * 0.025, -0.02, 0)), [0.035 * fz, 0.07, 0.04]),
      ellipsoid(null, j.sh.clone().add(V(sg * 0.005, -0.02, -0.03)), [0.035 * fz, 0.065, 0.035]));
    zone('muscle', 'rotator', s, ellipsoid(null, V(sg * 0.1, P.chest.y + 0.045, -0.1), [0.06 * fz, 0.05, 0.02], [0, 0, sg * 0.3]));
    zone('muscle', 'pecs', s,
      ellipsoid(null, V(sg * 0.07, P.chest.y + 0.075, P.chest.rz - 0.025), [0.07 * fz, 0.028, 0.03], [0, 0, sg * -0.15]),
      ellipsoid(null, V(sg * 0.072, P.chest.y + 0.025, P.chest.rz - 0.02), [0.082 * fz, 0.05, 0.035], [0, 0, sg * -0.2]));
    zone('muscle', 'biceps', s, ellipsoid(null, at(j.sh, j.el, 0.55).add(V(0, 0, 0.024)), [0.027 * fz, 0.09, 0.027 * fz]));
    zone('muscle', 'triceps', s, ellipsoid(null, at(j.sh, j.el, 0.45).add(V(sg * 0.01, 0, -0.026)), [0.026 * fz, 0.1, 0.026]), ellipsoid(null, at(j.sh, j.el, 0.5).add(V(-sg * 0.012, 0, -0.024)), [0.022 * fz, 0.085, 0.024]));
    zone('muscle', 'forearm', s, segment(null, j.el, j.wr, 0.026 * fz, 0.05, 0.75, V(sg * 0.01, 0, 0.01)), segment(null, j.el, j.wr, 0.024 * fz, 0.05, 0.7, V(-sg * 0.01, 0, -0.008)));
    zone('muscle', 'obliques', s, ellipsoid(null, V(sg * (P.waist.rx - 0.025), P.waist.y + 0.03, 0.04), [0.035, 0.11, 0.055], [0, 0, sg * 0.12]));
    zone('muscle', 'lats', s, ellipsoid(null, V(sg * 0.1, P.chest.y - 0.07, -0.072), [0.062 * fz, 0.14, 0.03], [0.1, sg * 0.25, sg * 0.28]));
    zone('muscle', 'glutemax', s, ellipsoid(null, V(sg * 0.072, P.pelvis.y - 0.045, -P.pelvis.rz + 0.02), [0.08, 0.09, 0.06 * (P.f ? 1.12 : 1)], [0, 0, sg * -0.15]));
    zone('muscle', 'glutemed', s, ellipsoid(null, V(sg * (P.pelvis.rx - 0.025), P.pelvis.y + 0.025, -0.025), [0.04, 0.055, 0.055]));
    zone('muscle', 'hipflex', s, ellipsoid(null, V(sg * 0.07, P.pelvis.y - 0.025, P.pelvis.rz - 0.012), [0.035, 0.06, 0.022], [0, 0, sg * 0.3]));
    zone('muscle', 'quads', s,
      segment(null, j.hip, j.kn, 0.034 * fz, 0.1, 0.85, V(0, 0, 0.042)),                      // прави бутни
      segment(null, j.hip, j.kn, 0.04 * fz, 0.18, 0.88, V(sg * 0.03, 0, 0.012)),              // спољни широки
      ellipsoid(null, at(j.hip, j.kn, 0.8).add(V(-sg * 0.03, 0, 0.022)), [0.03 * fz, 0.06, 0.028]));  // унутрашњи широки („суза“)
    zone('muscle', 'hams', s, segment(null, j.hip, j.kn, 0.03 * fz, 0.14, 0.9, V(sg * 0.02, 0, -0.035)), segment(null, j.hip, j.kn, 0.03 * fz, 0.14, 0.92, V(-sg * 0.018, 0, -0.035)));
    zone('muscle', 'adductors', s, segment(null, j.hip, j.kn, 0.04 * fz, 0.06, 0.55, V(-sg * 0.04, 0, 0.005)));
    zone('muscle', 'calves', s,
      ellipsoid(null, at(j.kn, j.an, 0.28).add(V(sg * 0.017, 0, -0.026)), [0.028 * fz, 0.11, 0.035]),
      ellipsoid(null, at(j.kn, j.an, 0.3).add(V(-sg * 0.017, 0, -0.026)), [0.03 * fz, 0.11, 0.036]),
      segment(null, j.kn, j.an, 0.03 * fz, 0.35, 0.7, V(0, 0, -0.012)));
    zone('muscle', 'tibialis', s, segment(null, j.kn, j.an, 0.02, 0.12, 0.8, V(sg * 0.014, 0, 0.034)));
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.2)); sole.position.set(j.an.x, 0.018, 0.065);
    zone('muscle', 'foot', s, sole);
  }

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
  return { root, layers, pickables };
}
