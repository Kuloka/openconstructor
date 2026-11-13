// scene3d.js: 3D models and scenes from a JSON description (written by the AI or by hand).
// No AI-written code ever runs: the model describes shapes, materials, lights and simple motion as data,
// and this trusted renderer (Three.js) builds them. Loaded on demand — only pages with 3D pay for it.
//
//   normalize(spec)        → a clean, clamped spec (unknown keys dropped, numbers bounded)
//   mountLive(el, spec)    → live, animated view in an element; returns { dispose, setInteractive }
//   snapshot(spec, scale)  → webp data URL of the view (used as the element's static picture)
//   toGLB(spec)            → Blob of a binary glTF (.glb) with just the model, for Blender / Unity / Roblox
//
// Spec (units are meters, y is up, the ground is y = 0):
// { size:[w,h] px, background:null|"#hex", environment:"studio"|"sunset"|"night", autoRotate:deg/s,
//   floor:{color,shadow}|false, camera:{position,target,fov}, lights:[{type,color,intensity,position}],
//   objects:[{ name, shape, …dimensions, position, rotation (deg), scale, color, metalness, roughness,
//              emissive, emissiveIntensity, opacity, flat, animate:{spin:[x,y,z] deg/s, bob, pulse}, children }] }
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'plane', 'icosahedron', 'dodecahedron', 'octahedron', 'tetrahedron', 'ring', 'lathe', 'extrude', 'group'];
const MAX_OBJECTS = 400, MAX_DEPTH = 8;
const num = (v, d, a = -1e4, b = 1e4) => { const n = +v; return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const vec = (v, d) => Array.isArray(v) ? [0, 1, 2].map(i => num(v[i], d[i], -1e3, 1e3)) : typeof v === 'number' ? [v, v, v].map(x => num(x, 1, 0.001, 1e3)) : d;
const color = (v, d) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim() : d;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function normalize(raw = {}){
  let count = 0;
  const pts = p => Array.isArray(p) ? p.slice(0, 64).map(q => [num(q?.[0], 0, -1e3, 1e3), num(q?.[1], 0, -1e3, 1e3)]) : null;
  const obj = (o, depth) => {
    if (!o || typeof o !== 'object' || ++count > MAX_OBJECTS || depth > MAX_DEPTH) return null;
    const shape = SHAPES.includes(o.shape) ? o.shape : (Array.isArray(o.children) ? 'group' : 'box');
    const out = {
      name: String(o.name || shape).slice(0, 60), shape,
      position: vec(o.position, [0, 0, 0]), rotation: vec(o.rotation, [0, 0, 0]), scale: o.scale == null ? [1, 1, 1] : vec(o.scale, [1, 1, 1]),
    };
    if (shape !== 'group') Object.assign(out, {
      size: vec(o.size, [1, 1, 1]).map(x => Math.max(0.001, Math.abs(x))),
      radius: num(o.radius, 0.5, 0.001, 1e3), height: num(o.height, 1, 0.001, 1e3),
      radiusTop: o.radiusTop == null ? null : num(o.radiusTop, 0.5, 0, 1e3), radiusBottom: o.radiusBottom == null ? null : num(o.radiusBottom, 0.5, 0, 1e3),
      tube: num(o.tube, 0.15, 0.001, 1e3), arc: num(o.arc, 360, 1, 360), sides: Math.round(num(o.sides, 32, 3, 96)), detail: Math.round(num(o.detail, 0, 0, 4)),
      inner: num(o.inner, 0.3, 0, 1e3), outer: num(o.outer, 0.5, 0.001, 1e3), length: num(o.length, 1, 0, 1e3),
      depth: num(o.depth, 0.2, 0.001, 1e3), bevel: num(o.bevel, 0, 0, 10), rounded: num(o.rounded, 0, 0, 10), points: pts(o.points),
      color: color(o.color, '#d4d4d8'), metalness: num(o.metalness, 0.1, 0, 1), roughness: num(o.roughness, 0.6, 0, 1),
      emissive: color(o.emissive, '#000000'), emissiveIntensity: num(o.emissiveIntensity, 1, 0, 20), opacity: num(o.opacity, 1, 0.05, 1), flat: !!o.flat,
    });
    const a = o.animate && typeof o.animate === 'object' ? o.animate : null;
    if (a) out.animate = { spin: vec(a.spin, [0, 0, 0]).map(x => num(x, 0, -1440, 1440)), bob: num(a.bob, 0, 0, 10), pulse: num(a.pulse, 0, 0, 1), speed: num(a.speed, 1, 0.05, 10) };
    if (Array.isArray(o.children)) out.children = o.children.map(c => obj(c, depth + 1)).filter(Boolean);
    return out;
  };
  const r = raw && typeof raw === 'object' ? raw : {};
  const size = Array.isArray(r.size) ? [Math.round(num(r.size[0], 520, 120, 1920)), Math.round(num(r.size[1], 400, 120, 1600))] : [520, 400];
  return {
    v: 1, size,
    background: r.background == null || r.background === 'transparent' ? null : color(r.background, null),
    environment: ['studio', 'sunset', 'night'].includes(r.environment) ? r.environment : 'studio',
    autoRotate: num(r.autoRotate, 0, -360, 360),
    floor: r.floor === false ? false : { color: color(r.floor?.color, null), shadow: r.floor?.shadow !== false },
    camera: r.camera && typeof r.camera === 'object' ? { position: r.camera.position ? vec(r.camera.position, [3, 2, 4]) : null, target: r.camera.target ? vec(r.camera.target, [0, 0.5, 0]) : null, fov: num(r.camera.fov, 40, 10, 100) } : {},
    lights: Array.isArray(r.lights) ? r.lights.slice(0, 8).map(l => ({ type: ['ambient', 'hemisphere', 'directional', 'point', 'spot'].includes(l?.type) ? l.type : 'directional', color: color(l?.color, '#ffffff'), intensity: num(l?.intensity, 1, 0, 50), position: vec(l?.position, [3, 5, 2]) })) : [],
    objects: (Array.isArray(r.objects) ? r.objects : []).map(o => obj(o, 0)).filter(Boolean),
  };
}

/* ── building ─────────────────────────────────────────────── */
function geometry(o){
  const seg = o.flat ? Math.min(o.sides, 8) : o.sides;
  switch (o.shape) {
    case 'box': return o.rounded > 0 ? new RoundedBoxGeometry(...o.size, 4, Math.min(o.rounded, Math.min(...o.size) / 2)) : new THREE.BoxGeometry(...o.size);
    case 'sphere': return new THREE.SphereGeometry(o.radius, o.flat ? 8 : 48, o.flat ? 6 : 32);
    case 'cylinder': return new THREE.CylinderGeometry(o.radiusTop ?? o.radius, o.radiusBottom ?? o.radius, o.height, seg);
    case 'cone': return new THREE.ConeGeometry(o.radius, o.height, seg);
    case 'torus': return new THREE.TorusGeometry(o.radius, o.tube, o.flat ? 6 : 24, o.flat ? 12 : 64, THREE.MathUtils.degToRad(o.arc));
    case 'capsule': return new THREE.CapsuleGeometry(o.radius, o.length, o.flat ? 2 : 8, seg);
    case 'plane': return new THREE.PlaneGeometry(o.size[0], o.size[1]);
    case 'icosahedron': return new THREE.IcosahedronGeometry(o.radius, o.detail);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(o.radius, o.detail);
    case 'octahedron': return new THREE.OctahedronGeometry(o.radius, o.detail);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(o.radius, o.detail);
    case 'ring': return new THREE.RingGeometry(o.inner, o.outer, seg);
    case 'lathe': return new THREE.LatheGeometry((o.points?.length >= 2 ? o.points : [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]).map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), seg);
    case 'extrude': {
      const p = o.points?.length >= 3 ? o.points : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      const s = new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: o.depth, bevelEnabled: o.bevel > 0, bevelSize: o.bevel, bevelThickness: o.bevel, bevelSegments: 3 });
      g.translate(0, 0, -o.depth / 2); return g;
    }
  }
  return new THREE.BoxGeometry(1, 1, 1);
}
function build(spec){
  const animated = [];
  const make = o => {
    let node;
    if (o.shape === 'group') node = new THREE.Group();
    else {
      const mat = new THREE.MeshStandardMaterial({
        color: o.color, metalness: o.metalness, roughness: o.roughness, emissive: o.emissive, emissiveIntensity: o.emissiveIntensity,
        flatShading: o.flat, transparent: o.opacity < 1, opacity: o.opacity, side: ['plane', 'ring', 'lathe'].includes(o.shape) ? THREE.DoubleSide : THREE.FrontSide,
      });
      node = new THREE.Mesh(geometry(o), mat); node.castShadow = node.receiveShadow = true;
    }
    node.name = o.name;
    node.position.set(...o.position);
    node.rotation.set(...o.rotation.map(THREE.MathUtils.degToRad));
    node.scale.set(...o.scale);
    if (o.animate) animated.push({ node, a: o.animate, base: node.position.clone(), baseScale: node.scale.clone() });
    for (const c of o.children || []) node.add(make(c));
    return node;
  };
  const model = new THREE.Group(); model.name = 'model';
  spec.objects.forEach(o => model.add(make(o)));
  return { model, animated };
}
function stage(spec, renderer){
  const scene = new THREE.Scene();
  if (spec.background) scene.background = new THREE.Color(spec.background);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.environmentIntensity = spec.environment === 'night' ? 0.25 : spec.environment === 'sunset' ? 0.6 : 0.9;
  const { model, animated } = build(spec);
  scene.add(model);
  // lights: the spec's, or a soft default rig with one shadow-casting key light
  const lights = spec.lights.length ? spec.lights : [
    { type: 'hemisphere', color: spec.environment === 'sunset' ? '#ffd2a6' : '#ffffff', intensity: spec.environment === 'night' ? 0.3 : 1.1 },
    { type: 'directional', color: spec.environment === 'sunset' ? '#ffb070' : spec.environment === 'night' ? '#9db4ff' : '#ffffff', intensity: spec.environment === 'night' ? 1.2 : 2.4, position: [3, 6, 4] },
  ];
  let shadowCaster = false;
  for (const l of lights) {
    let L;
    if (l.type === 'ambient') L = new THREE.AmbientLight(l.color, l.intensity);
    else if (l.type === 'hemisphere') L = new THREE.HemisphereLight(l.color, '#202024', l.intensity);
    else if (l.type === 'point') L = new THREE.PointLight(l.color, l.intensity * 10, 0, 2);
    else if (l.type === 'spot') L = new THREE.SpotLight(l.color, l.intensity * 10, 0, Math.PI / 5, 0.4, 2);
    else L = new THREE.DirectionalLight(l.color, l.intensity);
    if (l.position && L.position) L.position.set(...l.position);
    if (!shadowCaster && (l.type === 'directional' || l.type === 'spot')) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.0005; shadowCaster = true; }
    scene.add(L);
  }
  // frame the model
  const box = new THREE.Box3().setFromObject(model);
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const center = box.isEmpty() ? new THREE.Vector3(0, 0.5, 0) : box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.1);
  if (shadowCaster) scene.traverse(o => { if (o.isDirectionalLight) { const c = o.shadow.camera; c.left = c.bottom = -radius * 2; c.right = c.top = radius * 2; c.far = radius * 20 + 20; o.target.position.copy(center); scene.add(o.target); } });
  if (spec.floor) {
    const g = new THREE.CircleGeometry(radius * 6, 64); g.rotateX(-Math.PI / 2);
    const floor = spec.floor.color
      ? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: spec.floor.color, roughness: 0.9 }))
      : new THREE.Mesh(g, new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.position.y = Math.min(0, box.isEmpty() ? 0 : box.min.y) - 0.001; floor.receiveShadow = true; floor.name = '__floor';
    scene.add(floor);
  }
  const [w, h] = spec.size;
  const camera = new THREE.PerspectiveCamera(spec.camera.fov || 40, w / h, 0.01, radius * 100 + 100);
  const target = spec.camera.target ? new THREE.Vector3(...spec.camera.target) : center;
  if (spec.camera.position) camera.position.set(...spec.camera.position);
  else {
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.15;
    camera.position.copy(center).add(new THREE.Vector3(0.9, 0.55, 1.2).normalize().multiplyScalar(dist));
  }
  camera.lookAt(target);
  return { scene, camera, model, animated, target };
}
function makeRenderer(canvas, spec, pixelRatio){
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !spec.background, preserveDrawingBuffer: !!canvas._snapshot });
  r.setPixelRatio(pixelRatio); r.setSize(spec.size[0], spec.size[1], false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}
// Per-object motion: spin (deg/s around x/y/z), bob (meters up and down), pulse (scale ±fraction)
function tick(view, t){
  const s = t / 1000, dt = Math.min(0.1, view.last == null ? 0 : s - view.last); view.last = s;
  for (const { node, a, base, baseScale } of view.animated) {
    const k = a.speed || 1;
    if (a.spin) { node.rotateX(THREE.MathUtils.degToRad(a.spin[0]) * dt * k); node.rotateY(THREE.MathUtils.degToRad(a.spin[1]) * dt * k); node.rotateZ(THREE.MathUtils.degToRad(a.spin[2]) * dt * k); }
    if (a.bob) node.position.y = base.y + Math.sin(s * 2 * k) * a.bob;
    if (a.pulse) node.scale.copy(baseScale).multiplyScalar(1 + Math.sin(s * 3 * k) * a.pulse);
  }
}

/* ── public ───────────────────────────────────────────────── */
export function mountLive(container, rawSpec){
  const spec = normalize(rawSpec);
  const canvas = document.createElement('canvas');
  canvas.className = 'oc-3d-live';
  canvas.style.width = spec.size[0] + 'px'; canvas.style.height = spec.size[1] + 'px';
  container.append(canvas);
  const renderer = makeRenderer(canvas, spec, Math.min(2, devicePixelRatio || 1));
  const view = stage(spec, renderer);
  const controls = new OrbitControls(view.camera, canvas);
  controls.target.copy(view.target); controls.enableDamping = true; controls.enabled = false;
  controls.autoRotate = !!spec.autoRotate; controls.autoRotateSpeed = spec.autoRotate / 6;
  let raf = 0, visible = true, alive = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(performance.now()); });
  io.observe(canvas);
  const still = reduceMotion();
  function loop(t){
    raf = 0; if (!alive) return;
    if (!still) tick(view, t);
    controls.update();
    renderer.render(view.scene, view.camera);
    if (visible && !still) raf = requestAnimationFrame(loop);
  }
  loop(performance.now());
  return {
    canvas,
    setInteractive(on){ controls.enabled = on; canvas.style.pointerEvents = on ? 'auto' : 'none'; if (still && on && !raf) { const go = () => { controls.update(); renderer.render(view.scene, view.camera); if (controls.enabled) raf = requestAnimationFrame(go); else raf = 0; }; go(); } },
    dispose(){ alive = false; cancelAnimationFrame(raf); io.disconnect(); controls.dispose(); view.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove(); },
  };
}

export async function snapshot(rawSpec, scale = 2){
  const spec = normalize(rawSpec);
  const canvas = document.createElement('canvas'); canvas._snapshot = true;
  const renderer = makeRenderer(canvas, spec, scale);
  const view = stage(spec, renderer);
  tick(view, 0);
  renderer.render(view.scene, view.camera);
  const webp = canvas.toDataURL('image/webp', 0.9);
  const url = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  view.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  renderer.dispose(); renderer.forceContextLoss?.();
  return url;
}

export async function toGLB(rawSpec){
  const { model } = build(normalize(rawSpec));
  const data = await new GLTFExporter().parseAsync(model, { binary: true });
  model.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  return new Blob([data], { type: 'model/gltf-binary' });
}

export { parseModel, renderModel } from './model-kit.js';

export const imgCode = (spec, url, name) =>
  `<img class="oc-3d" src="${url}" width="${spec.size[0]}" height="${spec.size[1]}" alt="${String(name || '3D model').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}" style="display:block;width:${spec.size[0]}px;height:${spec.size[1]}px">`;
