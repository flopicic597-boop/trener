// Детаљан анатомски модел мушкарца: мишићи, кости и фасције из Z-Anatomy
// (CC BY-SA 4.0; изворни модел BodyParts3D, The Database Center for Life Science, CC BY-SA 2.1 JP).
// Датотеке: public/body/za/*.glb (Draco компресија), декодер у public/body/draco/.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { parseName, classifyPart, HIDE } from './za-map.js';
import { ZONE, MARK_TYPES } from '../data/body-zones.js';

let cache = null;
export async function loadZA() {
  if (cache) return cache;
  const draco = new DRACOLoader();
  draco.setDecoderPath(new URL('body/draco/', document.baseURI).href);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const load = (n) => loader.loadAsync(new URL(`body/za/${n}.glb`, document.baseURI).href).then((g) => g.scene);
  try {
    const [muscles, bones, fascia] = await Promise.all([load('muscles'), load('bones'), load('fascia')]);
    cache = { muscles, bones, fascia };
  } finally { draco.dispose(); }
  return cache;
}

const KIND = { muscle: 'muscles', skeleton: 'bones', fascia: 'fascia' };

/**
 * Тијело за приказ:
 * { root, layers: {skin, muscle, skeleton, fascia}, pickables, paintAll, setLayer, detailed: true }.
 * Сваки дио има userData { zone, side, muscleId, label (енглески анатомски назив) }.
 */
export function buildZABody(za, palette) {
  const root = new THREE.Group();
  const groups = { muscles: new THREE.Group(), bones: new THREE.Group(), fascia: new THREE.Group() };
  Object.values(groups).forEach((g) => root.add(g));
  const meshes = { muscles: [], bones: [], fascia: [] };
  const colorOf = { muscles: new THREE.Color(palette.muscle), bones: new THREE.Color(palette.bone), fascia: new THREE.Color(palette.fascia) };
  const tendonCol = new THREE.Color('#efe6d8');

  for (const src of ['muscles', 'bones', 'fascia']) {
    za[src].traverse((o) => {
      if (!o.isMesh) return;
      const { base: label, side: rawSide } = parseName(o.userData.name || o.name);
      if (HIDE.test(label)) return;
      const kind = src === 'fascia' && /^tensor fasciae latae$/i.test(label) ? 'muscles' : src;
      const { zone, muscleId } = classifyPart(kind, label);
      const side = zone && ZONE[zone] && !ZONE[zone].paired ? 'C' : rawSide;
      const c = colorOf[kind].clone();
      if (kind === 'muscles') {
        let h = 0; for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 997;
        c.offsetHSL(((h % 5) - 2) * 0.006, 0, ((h % 7) - 3) * 0.022);
        if (/tendon|septum|arch/i.test(label)) c.lerp(tendonCol, 0.75);
      }
      const mat = new THREE.MeshStandardMaterial({ color: c, roughness: kind === 'bones' ? 0.6 : 0.45, metalness: 0.03, emissive: c.clone(),
        emissiveIntensity: kind === 'fascia' ? 0.3 : 0.05, transparent: kind === 'fascia', opacity: kind === 'fascia' ? 0.42 : 1, depthWrite: kind !== 'fascia', side: THREE.DoubleSide });
      mat.userData.base = c.getHex();
      const m = new THREE.Mesh(o.geometry, mat);
      m.userData = { zone, side, muscleId, label, kind };
      groups[kind].add(m); meshes[kind].push(m);
    });
  }

  let layer = 'muscle';
  const pickables = { muscle: meshes.muscles, skeleton: meshes.bones, fascia: meshes.fascia };
  function setLayer(l) {
    layer = l;
    groups.bones.visible = true; // кости увијек (глава, шаке и стопала немају мишиће у моделу)
    groups.muscles.visible = l !== 'skeleton';
    groups.fascia.visible = l === 'fascia';
  }
  const tmp = new THREE.Color(), dimCol = new THREE.Color('#3a4150');

  /** state: { layer, selected }, markOf: Map('zone|side' → ознака) */
  function paintAll(state, markOf) {
    const sel = state.selected;
    const activeKind = KIND[layer];
    for (const kind of ['muscles', 'bones', 'fascia']) {
      const context = kind !== activeKind; // слој који је само позадина
      for (const m of meshes[kind]) {
        const { zone, side, label } = m.userData;
        const mat = m.material;
        const mk = !context && zone ? markOf.get(zone + '|' + side) || markOf.get(zone + '|C') : null;
        const exact = sel && sel.label === label && (sel.side === side || side === 'C');
        const inZone = sel && zone && sel.zone === zone && (sel.side === side || side === 'C' || sel.side === 'C');
        tmp.setHex(mat.userData.base);
        if (mk) tmp.set(MARK_TYPES[mk.type]?.color || '#ffffff');
        if (context) tmp.lerp(dimCol, kind === 'bones' && layer === 'muscle' ? 0.15 : 0.35);
        else if (sel && !inZone && !mk) tmp.lerp(dimCol, 0.6);
        mat.color.copy(tmp); mat.emissive.copy(tmp);
        mat.emissiveIntensity = exact ? 0.9 : inZone ? 0.45 : mk ? 0.5 : kind === 'fascia' ? 0.3 : 0.05;
      }
    }
  }
  setLayer(layer);
  return { root, layers: { skin: new THREE.Group(), muscle: groups.muscles, skeleton: groups.bones, fascia: groups.fascia }, pickables, paintAll, setLayer, detailed: true };
}
