// Човјеколико тијело: мрежа из MakeHuman модела (CC0 1.0), мушко и женско (public/body/human.bin,
// прави га scripts/build-body-mesh.mjs). Свакој тачки површине додјељује се мишићна зона
// (по најближем дијелу костура и смјеру површине) за бојење и избор додиром.
import * as THREE from 'three';

let cache = null;
/** Учитава и распакује тијело (једном; ради и без интернета јер је у кешу апликације) */
export async function loadHumanData() {
  if (cache) return cache;
  const buf = await (await fetch(new URL('body/human.bin', document.baseURI))).arrayBuffer();
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  let off = 4 + n; off += (4 - (off % 4)) % 4;
  const index = new Uint16Array(buf, off, header.triangles * 3); off += index.byteLength; off += (4 - (off % 4)) % 4;
  const male = new Float32Array(buf, off, header.vertices * 3); off += male.byteLength;
  const female = new Float32Array(buf, off, header.vertices * 3);
  cache = { header, index, pos: { m: male, f: female }, joints: { m: header.joints.male, f: header.joints.female } };
  return cache;
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Зглобови (J) и пропорције (P) из модела — користе их и слојеви скелета и фасција */
export function skeletonOf(data, sex) {
  const f = sex === 'f', jt = data.joints[f ? 'f' : 'm'];
  const J = {};
  for (const s of ['L', 'R']) {
    const k = s === 'L' ? 'l' : 'r', sg = s === 'L' ? 1 : -1;
    const wr = V(jt[`${k}-hand`]), el = V(jt[`${k}-elbow`]);
    J[s] = { sh: V(jt[`${k}-shoulder`]), el, wr, ha: wr.clone().add(wr.clone().sub(el).normalize().multiplyScalar(0.09)),
      hip: V(jt[`${k}-upper-leg`]), kn: V(jt[`${k}-knee`]), an: V(jt[`${k}-ankle`]), toe: V(jt[`${k}-foot-2`]), sg };
  }
  const y = (k) => jt[k][1];
  const P = {
    f,
    head: { y: y('head') + 0.045, r: f ? 0.092 : 0.1 },
    neck: [y('neck') - 0.035, y('neck') + 0.05],
    shoulder: { x: J.L.sh.x, y: J.L.sh.y + 0.035 },
    chest: { y: y('spine-1'), rx: f ? 0.14 : 0.16, ry: 0.15, rz: f ? 0.1 : 0.105 },
    waist: { y: y('spine-3'), rx: f ? 0.115 : 0.13, rz: 0.09 },
    pelvis: { y: y('pelvis'), rx: f ? 0.17 : 0.155, ry: 0.1, rz: 0.105 },
  };
  return { J, P };
}

/** Удаљеност тачке од дужи a–b и положај дуж ње (0..1) */
function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return [p.distanceTo(a.clone().add(ab.multiplyScalar(t))), t];
}

/** Мрежа тијела са бојама по тачки и мапом мишићних зона */
export function buildHuman(data, sex, J, P) {
  const pos = data.pos[sex === 'f' ? 'f' : 'm'];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));

  // дијелови тијела као дужи костура са приближним полупречником
  const torsoA = new THREE.Vector3(0, P.pelvis.y - 0.06, 0), torsoB = new THREE.Vector3(0, P.neck[0], -0.01);
  const segs = [['torso', 'C', torsoA, torsoB, P.f ? 0.125 : 0.13], ['neck', 'C', new THREE.Vector3(0, P.neck[0], 0), new THREE.Vector3(0, P.head.y - 0.06, 0.01), 0.05],
    ['head', 'C', new THREE.Vector3(0, P.head.y - 0.03, 0.02), new THREE.Vector3(0, P.head.y + 0.04, 0), P.head.r * 0.85]];
  for (const s of ['L', 'R']) {
    const j = J[s];
    segs.push(['upperArm', s, j.sh, j.el, 0.048], ['forearm', s, j.el, j.wr, 0.038], ['hand', s, j.wr, j.ha, 0.03],
      ['thigh', s, j.hip, j.kn, 0.075], ['shin', s, j.kn, j.an, 0.048], ['foot', s, j.an, j.toe, 0.035]);
  }
  const pa = geometry.attributes.position, na = geometry.attributes.normal;
  const vz = new Array(pa.count), vs = new Array(pa.count);
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    p.fromBufferAttribute(pa, i); nv.fromBufferAttribute(na, i);
    let best = null, bs = Infinity, bt = 0;
    for (const [part, side, a, b, r] of segs) {
      const [d, t] = segDist(p, a, b);
      const sc = d - r;
      if (sc < bs) { bs = sc; best = [part, side]; bt = t; }
    }
    const side = best[1] !== 'C' ? best[1] : p.x >= 0 ? 'L' : 'R';
    vz[i] = classify(best[0], side, p, nv, P, J, bt); vs[i] = side;
  }
  return { geometry, vertexZone: vz, vertexSide: vs };
}

/** Мишићна зона за тачку површине (null = глава, шаке) */
function classify(part, s, p, n, P, J, t) {
  const j = J[s], sg = j.sg;
  const front = n.z > 0.32, back = n.z < -0.32, lateral = !front && !back && n.x * sg > 0.3, medial = !front && !back && n.x * sg < -0.3;
  switch (part) {
    case 'head': case 'hand': return null;
    case 'neck': return back && p.y < P.neck[0] + 0.05 ? 'traps' : 'neck';
    case 'foot': return 'foot';
    case 'upperArm': {
      if (t < 0.2) return 'delts';
      // рука у А-пози: „напријед“ је према стомаку/напријед, „назад“ према леђима
      return n.z > 0.15 || (medial && n.z > -0.2) ? 'biceps' : 'triceps';
    }
    case 'forearm': return 'forearm';
    case 'thigh':
      if (back) return t < 0.14 ? 'glutemax' : 'hams';
      if (medial || (front && n.x * sg < -0.55)) return t < 0.72 ? 'adductors' : 'quads';
      if (front && t < 0.1) return 'hipflex';
      return 'quads';
    case 'shin':
      if (back || (medial && n.z < 0.1) || (lateral && n.z < -0.1)) return 'calves';
      return t > 0.92 ? 'calves' : 'tibialis';
    case 'torso': {
      const y = p.y, ax = Math.abs(p.x), cy = P.chest.y, sy = P.shoulder.y;
      if (y > sy - 0.06 && ax > P.shoulder.x - 0.06 - (y - (sy - 0.06)) * 0.6) return 'delts';
      if (y > P.neck[0] - 0.02) return back || ax > 0.055 ? 'traps' : 'neck';
      if (back) {
        const trapW = 0.035 + Math.max(0, y - (cy - 0.14)) * 0.75;
        if (ax < trapW && y > cy - 0.14) return 'traps';
        if (y > cy - 0.03 && y < sy - 0.02) return ax > 0.065 ? 'rotator' : 'upperback';
        if (y > P.pelvis.y + 0.05) return ax < 0.055 ? 'erectors' : y > P.waist.y - 0.03 ? 'lats' : ax > 0.105 ? 'glutemed' : 'erectors';
        return ax > P.pelvis.rx * 0.8 && y > P.pelvis.y - 0.02 ? 'glutemed' : 'glutemax';
      }
      if (front) {
        const pecLow = cy - 0.07 + Math.max(0, ax - 0.03) * 0.35 - (P.f ? 0.02 : 0);
        if (y > pecLow) return ax > P.shoulder.x - 0.035 ? 'delts' : 'pecs';
        const absW = 0.068 - Math.max(0, P.waist.y - y) * 0.15;
        if (y > P.pelvis.y - 0.02) return ax < absW ? 'abs' : 'obliques';
        return ax < 0.045 ? 'abs' : 'hipflex';
      }
      if (y > cy - 0.02) return 'lats';
      if (y > P.pelvis.y + 0.02) return 'obliques';
      return 'glutemed';
    }
    default: return null;
  }
}
