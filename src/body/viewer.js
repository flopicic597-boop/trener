// 3Д приказ тијела: окретање прстом/мишем, зумирање, избор зоне додиром, бојење ознака.
// Црта само када се нешто промијени (штеди батерију таблета).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildBody } from './model.js';
import { loadHumanData } from './human.js';
import { MARK_TYPES } from '../data/body-zones.js';

const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

export async function createBodyViewer(container, { sex = 'm', layer = 'muscle', marks = [], onPick } = {}) {
  const w = () => Math.max(200, container.clientWidth), h = () => Math.max(260, container.clientHeight);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w(), h());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.setAttribute('aria-label', '3Д модел тијела — превуците за окретање, додирните зону');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w() / h(), 0.05, 50);
  camera.position.set(0, 1.0, 3.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.92, 0);
  controls.enablePan = false; controls.minDistance = 1.0; controls.maxDistance = 5;
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.minPolarAngle = 0.2; controls.maxPolarAngle = Math.PI - 0.2;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(2.2, 2.6, 2.0); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffeedd, 0.5); fill.position.set(-2, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x88ccff, 1.0); rim.position.set(-2, 1.5, -2.5); scene.add(rim);
  // постоље (холограмски круг)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.45, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--p1', '#22d3ee')), transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);

  let body = null, state = { sex, layer, marks, selected: null };
  const palette = () => ({ muscle: '#c23a4e', joint: '#f5b84a', bone: '#e8e2d4', fascia: css('--p1', '#22d3ee'), skin: css('--p2', '#a78bfa'), skinSolid: '#c9a58f' });

  function build() {
    if (body) { scene.remove(body.root); body.root.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); } }); }
    body = buildBody(state.sex, palette(), data);
    scene.add(body.root);
    applyLayer(); paint();
  }
  function applyLayer() {
    for (const k of ['muscle', 'skeleton', 'fascia']) body.layers[k].visible = state.layer === k;
    body.layers.skin.visible = state.layer !== 'muscle';
    body.layers.skin.traverse((o) => { if (o.isMesh) o.material.opacity = state.layer === 'skeleton' ? 0.12 : 0.2; });
    ring.material.color.set(css('--p1', '#22d3ee'));
  }
  /** Боје: ознака клијента (бол/повреда/…) > изабрана зона > основна боја слоја */
  function paint() {
    const base = palette();
    const markOf = new Map(state.marks.filter((m) => m.active !== 0).map((m) => [m.zone + '|' + (m.side || 'C'), m]));
    // мишићи: боје по тачкама површине
    body.paintMuscle((zone, side) => {
      const mk = markOf.get(zone + '|' + side) || markOf.get(zone + '|C');
      const sel = state.selected && state.selected.zone === zone && (state.selected.side === side || side === 'C');
      return { color: mk ? new THREE.Color(MARK_TYPES[mk.type]?.color || '#ffffff') : null, dim: !!state.selected && !sel && !mk, glow: sel };
    });
    for (const layer of ['skeleton', 'fascia']) {
      for (const m of body.pickables[layer]) {
        const { zone, side } = m.userData;
        const mk = markOf.get(zone + '|' + side) || markOf.get(zone + '|C');
        const sel = state.selected && state.selected.zone === zone && (state.selected.side === side || side === 'C');
        const c = new THREE.Color(mk ? MARK_TYPES[mk.type]?.color || '#ffffff' : m.material.userData.base ?? base[layer === 'skeleton' ? 'joint' : layer]);
        m.material.color.copy(c); m.material.emissive.copy(c);
        m.material.emissiveIntensity = sel ? 0.95 : mk ? 0.55 : layer === 'fascia' ? 0.5 : 0.12;
        if (layer !== 'fascia') { m.material.transparent = !!state.selected && !sel; m.material.opacity = state.selected && !sel ? 0.55 : 1; }
      }
    }
    render();
  }

  let raf = 0;
  function render() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (controls.update()) render(); renderer.render(scene, camera); }); }
  controls.addEventListener('change', render);

  // додир/клик без превлачења = избор зоне
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(body.pickables[state.layer], false)[0];
    state.selected = !hit ? null : hit.object.userData.zoneAt ? hit.object.userData.zoneAt(hit.face) : { zone: hit.object.userData.zone, side: hit.object.userData.side };
    paint();
    onPick?.(state.selected);
  });

  const data = await loadHumanData();
  const ro = new ResizeObserver(() => { renderer.setSize(w(), h()); camera.aspect = w() / h(); camera.updateProjectionMatrix(); render(); });
  ro.observe(container);
  build();

  return {
    setSex(s) { if (s !== state.sex) { state.sex = s; build(); } },
    setLayer(l) { state.layer = l; state.selected = null; applyLayer(); paint(); },
    setMarks(mk) { state.marks = mk || []; paint(); },
    select(sel) { state.selected = sel; paint(); },
    /** Окреће модел: напријед или позади */
    view(dir) { const d = camera.position.distanceTo(controls.target); camera.position.set(0, 1.0, dir === 'back' ? -d : d); controls.update(); render(); },
    refreshColors() { applyLayer(); paint(); },
    dispose() { ro.disconnect(); controls.dispose(); renderer.dispose(); body?.root.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } }); renderer.domElement.remove(); },
  };
}
