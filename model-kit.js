// model-kit.js: real 3D objects for web pages, from a few words — <img src="model:letter D chrome"> in the AI's code.
// Shared by the editor (live objects on the canvas, static pictures for CSS backgrounds) and by oc3d.js,
// the runtime published and exported pages load (model-runtime.js): same shapes, materials and studio light everywhere.
//
//   parseModel(query)            → { shape, material, color, text }
//   renderModel(query, size)     → a transparent webp data URL (a poster / CSS background)
//   mountModel(canvas, query)    → a LIVE object in a <canvas>: real-time WebGL, follows the cursor, floats;
//                                  returns { setPointer(nx, ny), dispose() }
//   mountAll(doc)                → mounts every <canvas data-oc-model="…"> of a page and wires the mouse
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJSON from 'three/examples/fonts/helvetiker_bold.typeface.json';

const MODEL_SHAPES = {
  cube: ['cube', 'box', 'block', 'куб'], sphere: ['sphere', 'ball', 'orb', 'globe', 'planet', 'сфера', 'шар'],
  torus: ['torus', 'donut', 'doughnut', 'тор', 'бублик'], ring: ['ring', 'halo', 'кольцо'], knot: ['knot', 'узел'],
  pyramid: ['pyramid', 'пирамида'], cone: ['cone', 'конус'], cylinder: ['cylinder', 'can', 'tube', 'цилиндр'],
  capsule: ['capsule', 'pill', 'капсула', 'таблетка'], diamond: ['diamond', 'gem', 'crystal', 'jewel', 'алмаз', 'кристалл'],
  icosahedron: ['icosahedron', 'd20', 'polyhedron', 'икосаэдр'], dodecahedron: ['dodecahedron', 'додекаэдр'],
  blob: ['blob', 'liquid', 'organic', 'капля'], star: ['star', 'звезда'], heart: ['heart', 'сердце'],
  helix: ['helix', 'spiral', 'spring', 'dna', 'спираль'], ocmark: ['openconstructor'], coin: ['coin', 'token', 'монета'], shapes: ['shapes', 'composition', 'cluster'],
};
const MODEL_MATERIALS = {
  chrome: { color: '#f2f2f5', metalness: 1, roughness: 0.04 },
  gold: { color: '#e9b85a', metalness: 1, roughness: 0.16 },
  metal: { metalness: 1, roughness: 0.28 },
  glass: { metalness: 0, roughness: 0.02, glass: true, clearcoat: 1, clearcoatRoughness: 0.02 },
  iridescent: { color: '#ffffff', metalness: 0.75, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.7, clearcoat: 1 },
  pearl: { color: '#f4efe9', metalness: 0.2, roughness: 0.22, iridescence: 0.8, iridescenceIOR: 1.4, sheen: 1, clearcoat: 1 },
  plastic: { metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 },
  matte: { metalness: 0, roughness: 0.85 }, clay: { metalness: 0, roughness: 0.95, sheen: 0.4 },
  velvet: { metalness: 0, roughness: 0.9, sheen: 1, sheenRoughness: 0.4 },
  neon: { metalness: 0.1, roughness: 0.3, glow: 2.6 },
};
const MATERIAL_WORDS = { chrome: ['chrome', 'mirror', 'silver', 'liquid metal', 'хром', 'зеркал'], gold: ['gold', 'brass', 'золот'], metal: ['metal', 'steel', 'alumin', 'металл'], glass: ['glass', 'transparent', 'стекл', 'прозрачн'], iridescent: ['iridescent', 'holographic', 'holo', 'rainbow', 'oil', 'голограф', 'радуж'], pearl: ['pearl', 'жемчуж'], plastic: ['plastic', 'glossy', 'candy', 'пластик', 'глянц'], matte: ['matte', 'матов'], clay: ['clay', 'ceramic', 'глин', 'керамик'], velvet: ['velvet', 'fabric', 'бархат'], neon: ['neon', 'glow', 'emissive', 'неон', 'светящ'] };
const NAMED = { red: '#ef4444', orange: '#ff7a1a', coral: '#ff5a36', yellow: '#facc15', green: '#22c55e', mint: '#5eead4', teal: '#14b8a6', cyan: '#22d3ee', blue: '#3b82f6', navy: '#1e3a8a', indigo: '#6366f1', purple: '#8b5cf6', violet: '#8b5cf6', pink: '#ec4899', magenta: '#d946ef', white: '#f5f5f5', black: '#18181b', gray: '#9ca3af', grey: '#9ca3af', beige: '#e7d8c4' };

export function parseModel(query){
  const q = String(query || '').toLowerCase();
  const has = words => words.some(w => q.includes(w));
  // a letter or a short word in 3D (a logo mark): model:letter R chrome, model:text 24 gold
  const tm = String(query || '').match(/\b(?:letter|text|word|logo|буква|текст|слово)\s+(?:["“«']([^"”»']{1,24})["”»']|([^\s#"]{1,24}))/i);
  let text = tm ? (tm[1] || tm[2]).trim() : '';
  if (text.length === 1 && !/lower|строчн|маленьк/.test(q)) text = text.toUpperCase();
  const shape = text ? 'text' : Object.keys(MODEL_SHAPES).find(k => has(MODEL_SHAPES[k])) || 'blob';
  const material = Object.keys(MATERIAL_WORDS).find(k => has(MATERIAL_WORDS[k])) || 'iridescent';
  const hex = q.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/)?.[0] || Object.entries(NAMED).find(([n]) => new RegExp('\\b' + n + '\\b').test(q))?.[1] || null;
  // "interactive" (or cursor / hover / tilt): the object turns to follow the mouse — a sprite of angles, see renderModelSprite
  const interactive = /\b(interactive|cursor|hover|tilt|mouse|follow)\b|курсор|интерактив/.test(q);
  return { shape, material, color: hex, text, interactive };
}
// A photo studio for metals: black room, big soft boxes and thin strip lights — gives chrome the dark, high-contrast
// mirror look (sharp white streaks on black) instead of the flat gray of a plain room
function studioEnv(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030304');
  const panel = (w, h, power, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(power), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); scene.add(m); };
  panel(9, 3, 3.2, [0, 6, 0], [Math.PI / 2, 0, 0]);          // overhead soft box
  panel(0.5, 9, 7, [-6, 0.5, 1.5], [0, Math.PI / 2, 0]);      // left strip
  panel(0.35, 9, 5, [6, 0.5, -1], [0, -Math.PI / 2, 0]);      // right strip
  panel(5, 0.3, 6, [0, -1.2, -6], [0, 0, 0]);                 // horizon line behind
  panel(2.2, 2.2, 1.6, [3.5, 2.5, 6], [0, Math.PI, 0]);       // small front fill
  panel(12, 12, 0.05, [0, -5, 0], [-Math.PI / 2, 0, 0]);      // a faint floor bounce
  // behind the camera: a tall soft box that fades from white at the top to black — flat faces facing the viewer
  // mirror it as a bright-to-dark sweep (the classic product-shot chrome) instead of plain black
  const g = document.createElement('canvas'); g.width = 4; g.height = 256;
  const gc = g.getContext('2d'), grad = gc.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.32, '#e6e7ea'); grad.addColorStop(0.5, '#9a9da4'); grad.addColorStop(0.62, '#3a3b40'); grad.addColorStop(0.85, '#0c0c0d'); grad.addColorStop(1, '#2a2b2e');
  gc.fillStyle = grad; gc.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(g); tex.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(44, 14), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffffff').multiplyScalar(2.8), side: THREE.DoubleSide }));
  front.position.set(0, 0.6, 6); front.rotation.set(0, Math.PI, 0); scene.add(front);
  return scene;
}
// Glass needs darkness and thin lights: a black room crossed by narrow light strips (a product-shot "strip box").
// Clear faces stay dark and see-through, and every edge, bevel and curve catches a crisp line of light.
function glassEnv(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const strip = (w, h, power, pos, rot, tint = '#ffffff') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(power), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); scene.add(m); };
  strip(14, 0.6, 14, [0, 4.5, 3], [Math.PI / 2.6, 0, 0]);           // a long line high in front: the top bevels
  strip(14, 0.22, 7, [0, -3.5, 4], [-Math.PI / 2.8, 0, 0]);          // a low line: the bottom bevels
  strip(0.5, 10, 12, [-6, 0, 2], [0, Math.PI / 2.4, 0]);             // left and right uprights: the side walls
  strip(0.5, 10, 9, [6, 0, 2.5], [0, -Math.PI / 2.4, 0]);
  strip(6, 6, 2.4, [0, 1.5, 7], [0, Math.PI, 0], '#cfe0ff');         // a cool box behind the camera: the faint body of the glass
  strip(10, 0.2, 5, [0, 0.2, -6], [0, 0, 0], '#bcd4ff');             // a horizon line seen through the glass
  return scene;
}
function starShape(n = 5, r1 = 1, r2 = 0.45){ const s = new THREE.Shape(); for (let i = 0; i <= n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; }
function heartShape(){ const s = new THREE.Shape(); s.moveTo(0, -0.9); s.bezierCurveTo(-1.6, 0.1, -0.9, 1.25, 0, 0.55); s.bezierCurveTo(0.9, 1.25, 1.6, 0.1, 0, -0.9); return s; }
function modelGeometry(shape){
  const ext = s => { const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.14, bevelSegments: 8, curveSegments: 48 }); g.center(); return g; };
  switch (shape) {
    case 'cube': return new RoundedBoxGeometry(1.5, 1.5, 1.5, 6, 0.22);
    case 'sphere': return new THREE.SphereGeometry(1.1, 96, 64);
    case 'torus': return new THREE.TorusGeometry(0.95, 0.42, 64, 160);
    case 'ring': return new THREE.TorusGeometry(1.05, 0.16, 48, 200);
    case 'knot': return new THREE.TorusKnotGeometry(0.78, 0.27, 320, 48);
    case 'pyramid': { const g = new THREE.ConeGeometry(1.25, 1.7, 4, 1); g.rotateY(Math.PI / 4); return g; }
    case 'cone': return new THREE.ConeGeometry(1, 1.8, 96);
    case 'cylinder': return new THREE.CylinderGeometry(0.85, 0.85, 1.7, 96);
    case 'capsule': return new THREE.CapsuleGeometry(0.55, 1.2, 16, 64);
    case 'diamond': { const g = new THREE.OctahedronGeometry(1.15, 0).toNonIndexed(); g.scale(1, 1.35, 1); g.computeVertexNormals(); return g; }
    case 'icosahedron': return new THREE.IcosahedronGeometry(1.2, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(1.15, 0);
    case 'coin': { const g = new THREE.CylinderGeometry(1.1, 1.1, 0.22, 96); g.rotateX(Math.PI / 2); return g; }
    case 'star': return ext(starShape());
    case 'heart': return ext(heartShape());
    case 'helix': {
      const pts = []; for (let i = 0; i <= 240; i++) { const t = i / 240, a = t * Math.PI * 6; pts.push(new THREE.Vector3(Math.cos(a) * 0.75, t * 2.4 - 1.2, Math.sin(a) * 0.75)); }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 480, 0.18, 32, false);
    }
    default: { // blob: a sphere gently pushed in and out
      const g = new THREE.IcosahedronGeometry(1.1, 48), p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const d = 1 + 0.16 * Math.sin(n.x * 3.1 + 1) * Math.sin(n.y * 2.7 + 2) + 0.1 * Math.sin(n.z * 4.3); v.copy(n).multiplyScalar(1.1 * d); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g;
    }
  }
}
function modelMaterial(kind, color){
  const m = MODEL_MATERIALS[kind] || MODEL_MATERIALS.iridescent;
  const c = color || m.color || '#d4d4d8';
  const mat = new THREE.MeshPhysicalMaterial({
    color: kind === 'neon' ? new THREE.Color(c).multiplyScalar(0.25) : new THREE.Color(c),
    metalness: m.metalness ?? 0, roughness: m.roughness ?? 0.4,
    transmission: m.transmission || 0, thickness: m.thickness || 0, ior: m.ior || 1.5,
    iridescence: m.iridescence || 0, iridescenceIOR: m.iridescenceIOR || 1.3, iridescenceThicknessRange: [120, 720],
    clearcoat: m.clearcoat || 0, clearcoatRoughness: m.clearcoatRoughness ?? 0.1,
    sheen: m.sheen || 0, sheenRoughness: m.sheenRoughness ?? 0.5, sheenColor: new THREE.Color(c),
    emissive: new THREE.Color(m.glow ? c : '#000000'), emissiveIntensity: m.glow || 0,
  });
  if (m.glass) {
    // A canvas can't see the page behind it, so glass is drawn the way it actually looks on a dark site: the body
    // is clear and only the light it catches shows — reflections of the studio strips on every face and bevel,
    // a fresnel rim, the back faces glinting through. These are ADDED to the page under the canvas (colour on,
    // alpha untouched), so the real background shows through the letter. Tinted glass glows faintly in its colour.
    const tint = new THREE.Color(color ? c : '#dfe9ff');
    Object.assign(mat, {
      color: tint.clone().multiplyScalar(color ? 0.07 : 0.025), metalness: 0, roughness: 0.02, envMapIntensity: 2.4,
      clearcoat: 1, clearcoatRoughness: 0.01, iridescence: 0.22, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 600],
      specularColor: tint.clone().lerp(new THREE.Color('#ffffff'), 0.6), specularIntensity: 1,
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    mat.userData.additive = true;
  }
  return mat;
}

let font = null;
// A word or letter as solid 3D type (helvetiker bold): centred, its holes (D, O, A…) cut through, a rounded bevel
export function textGeometry(text, { size = 1.5, depth = 0.6, bevel = null } = {}){
  font ||= new FontLoader().parse(fontJSON);
  const b = bevel == null || bevel <= 0 ? size * 0.09 : bevel;
  // long words get fewer curve segments (a 15-letter word at 40 would be ~1M triangles)
  const g = new TextGeometry(String(text || 'A'), { font, size, depth: Math.max(depth, size * 0.16), curveSegments: String(text).length > 4 ? 14 : 40, bevelEnabled: true, bevelThickness: b * 2.2, bevelSize: b, bevelSegments: 16 });
  g.center(); g.computeVertexNormals();
  return g;
}
// The object for a query, centred at the origin inside a pivot group (the pivot is what turns after the cursor)
export function buildModel(query){
  const { shape, material, color, text } = parseModel(query);
  const group = new THREE.Group();
  const mat = modelMaterial(material, color);
  if (shape === 'ocmark') {
    // the openconstructor mark (the folded C): five planes, the two folds set back a little
    const planes = [[[17, 6], [42, 6], [31, 17], [17, 17]], [[6, 17], [17, 6], [17, 17]], [[6, 18.5], [17, 18.5], [17, 29.5], [6, 29.5]], [[6, 31], [17, 31], [17, 42]], [[17, 31], [31, 31], [42, 42], [17, 42]]];
    planes.forEach((pts, i) => {
      const fold = i === 1 || i === 3;
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 24) / 12, (24 - y) / 12)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: fold ? 0.4 : 0.62, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 8 });
      const mesh = new THREE.Mesh(g, mat); mesh.position.z = fold ? -0.12 : 0; group.add(mesh);
    });
    group.rotation.set(-0.28, 0.72, 0.06);
  } else if (shape === 'shapes') {
    [['sphere', [-0.95, -0.35, 0.2], 0.62], ['torus', [0.75, 0.55, -0.3], 0.55], ['cube', [0.55, -0.8, 0.5], 0.42]].forEach(([s, p, k]) => {
      const mesh = new THREE.Mesh(modelGeometry(s), mat); mesh.position.set(...p); mesh.scale.setScalar(k); mesh.rotation.set(0.5, 0.6, 0.2); group.add(mesh);
    });
  } else {
    let geo;
    if (shape === 'text') {
      geo = textGeometry(text, { size: 1.5, depth: text.length > 2 ? 0.32 : 0.6, bevel: text.length > 2 ? 0.1 : 0.13 });
    } else geo = modelGeometry(shape);
    const mesh = new THREE.Mesh(geo, mat);
    // a pleasing three-quarter angle per shape
    const tilt = { cube: [0.55, 0.75, 0.1], pyramid: [0.25, 0.35, 0], torus: [0.62, 0.35, 0.25], ring: [0.9, 0.3, 0.3], coin: [0.35, 0.6, 0.15], capsule: [0.2, 0, 0.75], diamond: [0.15, 0.4, 0], icosahedron: [0.4, 0.5, 0.1], dodecahedron: [0.4, 0.5, 0.1], knot: [0.3, 0.2, 0], star: [0.15, 0.45, 0.1], heart: [0.1, 0.45, 0.05], helix: [0.25, 0, 0.35], text: [0.08, 0.16, 0.02] }[shape] || [0.3, 0.4, 0];
    // a word leans back a little so its top faces and thickness show (straight-on it reads as flat type)
    const word = shape === 'text' && text.length > 2;
    mesh.rotation.set(...(word ? [0.22, -0.08, 0] : tilt));
    // a glass word: one clean shell (the near faces hide the far ones), else letters seen through letters turn to noise
    if (material === 'glass') {
      mat.side = THREE.FrontSide;
      const inner = mat.clone(); inner.side = THREE.BackSide; inner.envMapIntensity = 0.7; inner.color = new THREE.Color(color || '#9cc4ff').multiplyScalar(0.05);
      const back = new THREE.Mesh(geo, inner); back.rotation.copy(mesh.rotation); back.renderOrder = -1; group.add(back);
    }
    group.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
  group.position.sub(c);
  const pivot = new THREE.Group(); pivot.add(group);
  return { pivot, radius: box.getSize(new THREE.Vector3()).length() / 2, size: box.getSize(new THREE.Vector3()), material, color, shape };
}

function makeRenderer(canvas, w, h, ratio, keep){
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!keep, powerPreference: 'high-performance' });
  r.setPixelRatio(ratio); r.setSize(w, h, false); r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  return r;
}
// Studio light around the object: dark photo studio for metals, a soft room for the rest, plus a key, a tinted rim and a cool fill
function stage(renderer, built, aspect = 1, spare = 0.86){
  const scene = new THREE.Scene();
  // metals and glass live on reflections: the dark photo studio with light strips gives them crisp highlights
  const metal = ['chrome', 'gold', 'metal', 'glass'].includes(built.material);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(built.material === 'glass' ? glassEnv() : metal ? studioEnv() : new RoomEnvironment(), metal ? 0.005 : 0.02).texture; pm.dispose();
  scene.environmentIntensity = metal ? 1.1 : 1;
  const tint = new THREE.Color(built.color || '#cfd6e4');
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(tint, 30, 0, 2); rim.position.set(-3, 1.5, -2.5); scene.add(rim);
  const fill = new THREE.PointLight('#9db8ff', 8, 0, 2); fill.position.set(2.5, -2, 2); scene.add(fill);
  scene.add(built.pivot);
  const wide = built.size.x > built.size.y * 2.5, fov = wide ? 14 : 30;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
  // fit the object's sphere in the narrower side of the picture
  const v = Math.tan(THREE.MathUtils.degToRad(fov / 2)), sz = built.size;
  // fit the box in the picture (~10–20 % air, room to turn); again whenever the picture changes shape
  const fit = a => { camera.aspect = a; camera.updateProjectionMatrix(); camera.position.set(0, 0, Math.max(sz.y * 0.62 / v, sz.x * 0.58 / (v * a)) * (spare / 0.86) + sz.z / 2); camera.lookAt(0, 0, 0); };
  fit(aspect);
  return { scene, camera, fit };
}
const dispose = (scene, renderer) => { scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); scene.environment?.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); };

// A still picture of the object (CSS backgrounds, the poster shown before the live object starts)
// Stills are made one at a time: each needs a WebGL context for a moment, and a browser keeps only ~16 —
// a burst of them would make it drop the oldest, i.e. blank the live objects already on the page
let stillQueue = Promise.resolve();
export function renderModel(query, size = 640){
  const job = stillQueue.then(() => renderStill(query, size));
  stillQueue = job.catch(() => {});
  return job;
}
async function renderStill(query, size){
  const canvas = document.createElement('canvas');
  const renderer = makeRenderer(canvas, size, size, 1, true);
  const built = buildModel(query);
  const { scene, camera } = stage(renderer, built);
  renderer.render(scene, camera);
  let src = canvas;
  if (built.material === 'glass') {
    const gl = renderer.getContext(), w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4, a = Math.max(px[i], px[i + 1], px[i + 2], px[i + 3]);
      if (!a) continue;
      img.data[o] = Math.min(255, px[i] * 255 / a); img.data[o + 1] = Math.min(255, px[i + 1] * 255 / a); img.data[o + 2] = Math.min(255, px[i + 2] * 255 / a); img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0); src = out;
  }
  const webp = src.toDataURL('image/webp', 0.9);
  const url = webp.startsWith('data:image/webp') ? webp : src.toDataURL('image/png');
  dispose(scene, renderer);
  return url;
}

// A live object in a <canvas>: renders in real time, turns smoothly toward the cursor, floats when left alone.
// setPointer(nx, ny): the cursor relative to the object, −1…1 (the page wires it, the editor forwards it)
export function mountModel(canvas, query, { still = false } = {}){
  const built = buildModel(query);
  const size = () => [Math.max(40, canvas.clientWidth || +canvas.getAttribute('width') || 400), Math.max(40, canvas.clientHeight || +canvas.getAttribute('height') || 400)];
  let [w, h] = size();
  const ratio = Math.min(2, (globalThis.devicePixelRatio || 1) * 1.25);
  const renderer = makeRenderer(canvas, w, h, ratio, false);
  const { scene, camera, fit } = stage(renderer, built, w / h);
  let px = 0, py = 0, lastMove = -1e9, raf = 0, alive = true, t0 = performance.now(), cur = { x: 0, y: 0 }, shown = false;
  const resize = () => { const [nw, nh] = size(); if (nw === w && nh === h) return; w = nw; h = nh; renderer.setSize(w, h, false); fit(w / h); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(canvas);
  const frame = now => {
    raf = 0;
    if (!alive) return;
    if (!canvas.isConnected) return api.dispose();
    const t = (now - t0) / 1000, idle = now - lastMove > 2500;
    // where to look: the cursor, or a slow sway when nobody moves the mouse
    // letters and logos must stay readable: they turn less (±20°) than free shapes (±34°)
    const amp = built.shape === 'text' ? (built.size.x > built.size.y * 2.5 ? 0.16 : 0.35) : built.shape === 'ocmark' ? 0.35 : 0.6;
    const tx = idle ? Math.sin(t * 0.45) * amp * 0.6 : px * amp, ty = idle ? Math.sin(t * 0.33) * 0.1 : py * amp * 0.55;
    const k = still ? 1 : 0.075;
    cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k;
    built.pivot.rotation.set(cur.y, cur.x, 0);
    built.pivot.position.y = still ? 0 : Math.sin(t * 1.15) * built.radius * 0.035;
    renderer.render(scene, camera);
    if (!shown) { shown = true; canvas.style.backgroundImage = 'none'; }
    if (!still) raf = requestAnimationFrame(frame);
  };
  const api = {
    canvas,
    setPointer(nx, ny){ px = Math.max(-1, Math.min(1, nx)); py = Math.max(-1, Math.min(1, ny)); lastMove = performance.now(); if (still && !raf) raf = requestAnimationFrame(frame); },
    pause(){ cancelAnimationFrame(raf); raf = 0; },
    resume(){ if (!raf && alive) raf = requestAnimationFrame(frame); },
    dispose(){ if (!alive) return; alive = false; cancelAnimationFrame(raf); ro?.disconnect(); dispose(scene, renderer); },
  };
  raf = requestAnimationFrame(frame);
  return api;
}
// the cursor relative to an object's box: centre = 0, the box edge plus some margin = ±1
export function pointerFor(rect, x, y){
  const rx = rect.width / 2 + Math.min(500, rect.width), ry = rect.height / 2 + Math.min(400, rect.height);
  return [(x - rect.left - rect.width / 2) / rx, (y - rect.top - rect.height / 2) / ry];
}

// Every <canvas data-oc-model> of a page: live objects that follow the mouse, paused while off screen
export function mountAll(doc = document){
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const list = [...doc.querySelectorAll('canvas[data-oc-model]')].slice(0, 12).map(c => { try { return mountModel(c, c.dataset.ocModel, { still }); } catch { return null; } }).filter(Boolean);
  if (!list.length) return list;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => { const m = list.find(x => x.canvas === e.target); if (m) e.isIntersecting ? m.resume() : m.pause(); })) : null;
  list.forEach(m => io?.observe(m.canvas));
  const move = (x, y) => list.forEach(m => m.setPointer(...pointerFor(m.canvas.getBoundingClientRect(), x, y)));
  doc.defaultView.addEventListener('pointermove', e => move(e.clientX, e.clientY), { passive: true });
  doc.defaultView.addEventListener('deviceorientation', e => { if (e.gamma != null) list.forEach(m => m.setPointer(e.gamma / 35, (e.beta - 45) / 35)); }, { passive: true });
  return list;
}
