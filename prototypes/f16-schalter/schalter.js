// PROTOTYP (Wegwerf-Code, Ticket #19): Wie bedient man kleine Cockpit-Schalter in VR?
// Ein Testpanel in echter Größe vorn auf der linken Konsole, zwei Bedienarten zum Vergleich:
// "Finger" (Controller-Spitze berührt und schiebt) und "Strahl" (zielen und Stick/Trigger).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// ---- Szene (wie Graumodell #17) ----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
document.body.prepend(renderer.domElement);
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => {
  if (ok) document.body.appendChild(VRButton.createButton(renderer));
}).catch(() => {});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a7c4);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xbcd4f0, 0x2a2c26, 0.5));
const sun = new THREE.DirectionalLight(0xfff4e2, 2.6);
sun.position.set(-1.2, 2.4, 1.0);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x5d6b4a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -400;
scene.add(ground);

// Augpunkt aus masse.py (Blender x, y, z) -> glTF (x, z, -y)
const EYE = new THREE.Vector3(0, 0.44, 0.72);
const TARGET = new THREE.Vector3(0, 0.06, 0);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.005, 4000);
camera.position.copy(EYE);
const rig = new THREE.Group();
rig.position.copy(EYE);
scene.add(rig);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.minDistance = 0.05;
controls.update();
window.__view = { camera, controls };

const canopy = [];
let pending = 2;
function load(file) {
  fetch(file).then((r) => { if (!r.ok) throw new Error(file + ': ' + r.status); return r.text(); }).then((b64) => {
    const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
    new GLTFLoader().parse(bin.buffer, '', (gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        if (/^Canopy/.test(o.name) || o.material.name === 'CanopyGlas') canopy.push(o);
        if (o.material.name === 'CanopyGlas') { o.material.side = THREE.DoubleSide; o.material.depthWrite = false; }
        else if (o.material.transparent) o.material.depthWrite = false;
      });
      scene.add(gltf.scene);
      if (--pending === 0) document.getElementById('loading').remove();
    }, onError);
  }).catch(onError);
}
function onError(err) { document.getElementById('loading').textContent = 'Modell konnte nicht geladen werden: ' + (err.message || err); }
load('f16_frontpanel.glb.txt');
load('f16_graumodell.glb.txt');

// ---- Rückmeldung: Klick-Ton und Haptik ---------------------------------------------------------

let audio = null;
function click(strength = 1) {
  audio ??= new AudioContext();
  const n = Math.floor(audio.sampleRate * 0.025);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.12));
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2600;
  const g = audio.createGain();
  g.gain.value = 0.6 * strength;
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
function buzz(hand, strength = 0.5, ms = 25) {
  hand?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms);
}

// ---- Testpanel ---------------------------------------------------------------------------------

// Vorn auf der linken Konsole: breite Spalte (145,5 mm), vor der Throttle-Schiene
const PW = 0.1455, PD = 0.185;
const panel = new THREE.Group();
panel.position.set(-0.3516, -0.22 + 0.004, 0.08 + PD / 2);
scene.add(panel);

const PX = 4000;
const canvas = document.createElement('canvas');
canvas.width = PW * PX;
canvas.height = PD * PX;
const ctx = canvas.getContext('2d');
const plateTex = new THREE.CanvasTexture(canvas);
plateTex.colorSpace = THREE.SRGBColorSpace;
plateTex.anisotropy = 8;
const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, emissiveMap: plateTex, emissive: 0x000000, roughness: 0.8 });
const plate = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.004, PD), [
  new THREE.MeshStandardMaterial({ color: 0x1e2022 }), new THREE.MeshStandardMaterial({ color: 0x1e2022 }),
  plateMat, new THREE.MeshStandardMaterial({ color: 0x1e2022 }),
  new THREE.MeshStandardMaterial({ color: 0x1e2022 }), new THREE.MeshStandardMaterial({ color: 0x1e2022 }),
]);
plate.position.y = -0.002;
panel.add(plate);

const labels = []; // [text, x, z, size]
const toPx = (x, z) => [(x + PW / 2) * PX, (z + PD / 2) * PX];
function drawPlate() {
  ctx.fillStyle = '#1f2123';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#4a4e52';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#5c6064';
  for (const [x, z] of [[6, 6], [canvas.width - 6, 6], [6, canvas.height - 6], [canvas.width - 6, canvas.height - 6]]) {
    ctx.beginPath(); ctx.arc(x + (x < 50 ? 14 : -14), z + (z < 50 ? 14 : -14), 10, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#ecebe2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [t, x, z, size] of labels) {
    ctx.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
    const [px, pz] = toPx(x, z);
    ctx.fillText(t, px, pz);
  }
  plateTex.needsUpdate = true;
}

const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.5 }),
  guard: new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.45 }),
  knob: new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.55 }),
  hi: new THREE.MeshBasicMaterial({ color: 0x7dff9c, transparent: true, opacity: 0.35, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
};

const controlsList = [];
const hitMeshes = [];

function addHit(ctrl, w, h, d, y, target = ctrl.group) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.hit);
  m.position.y = y;
  m.userData.ctrl = ctrl;
  target.add(m);
  hitMeshes.push(m);
  return m;
}
function addHighlight(ctrl, r) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.0015, 32), M.hi);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0005;
  ring.visible = false;
  ctrl.group.add(ring);
  ctrl.ring = ring;
}

/** Kippschalter: Stellungen von hinten (zum Piloten) nach vorn; vorn = Hebel nach vorn gekippt. */
function toggle({ name, x, z, positions, start, lock = false, spring = null, guard = null }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  panel.add(g);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 6), M.metal);
  nut.position.y = 0.0015;
  g.add(nut);
  const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.005, 16), M.metal);
  bush.position.y = 0.004;
  g.add(bush);
  const lever = new THREE.Group();
  lever.position.y = 0.006;
  g.add(lever);
  const L = 0.015;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0018, L, 12), M.metal);
  shaft.position.y = L / 2;
  lever.add(shaft);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 12, 8), M.metal);
  tip.position.y = L;
  lever.add(tip);
  if (lock) { // Hebelsperre: Kragen, der vor dem Umlegen gezogen wird
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.004, 12), M.black);
    collar.position.y = 0.004;
    lever.add(collar);
  }
  const n = positions.length;
  const angles = positions.map((_, i) => THREE.MathUtils.degToRad(n === 2 ? (i === 0 ? 24 : -24) : 26 - i * 26));
  const ctrl = { kind: 'toggle', name, group: g, lever, positions, angles, index: start, lock, spring, guard: null, L, cool: 0, held: false };
  lever.rotation.x = angles[start];
  labels.push([name, x, z - 0.024, 40]);
  labels.push([positions[n - 1], x, z - 0.0145, 26]);
  labels.push([positions[0], x, z + 0.0155, 26]);
  if (n === 3) labels.push([positions[1], x + 0.016, z, 24]);
  addHit(ctrl, 0.02, 0.026, 0.026, 0.012);
  addHighlight(ctrl, 0.009);
  controlsList.push(ctrl);
  if (guard) ctrl.guard = makeGuard(ctrl, guard);
  return ctrl;
}

/** Schutzklappe über einem Kippschalter, Scharnier an der Vorderkante; geschlossen erzwingt sie die Ruhestellung. */
function makeGuard(sw, restIndex) {
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.002, -0.017);
  sw.group.add(hinge);
  const W = 0.02, D = 0.032, H = 0.027;
  const cover = new THREE.Group();
  hinge.add(cover);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.0015, D), M.guard);
  top.position.set(0, H, D / 2);
  cover.add(top);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.0015, H, D), M.guard);
    side.position.set((s * W) / 2, H / 2, D / 2);
    cover.add(side);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.0015), M.guard);
  back.position.set(0, H / 2, D);
  cover.add(back);
  const g = { kind: 'guard', name: sw.name + ' Klappe', group: sw.group, hinge, open: false, sw, restIndex, cool: 0, armed: true, W, D, H };
  // Trefferfläche hängt an der Klappe, damit sie mit aufklappt
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, H + 0.006, D + 0.006), M.hit);
  hit.position.set(0, H / 2, D / 2);
  hit.userData.ctrl = g;
  cover.add(hit);
  hitMeshes.push(hit);
  g.hit = hit;
  addHighlight(g, 0.02);
  controlsList.push(g);
  return g;
}

/** Drehschalter mit Rasten. */
function rotary({ name, x, z, steps }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  panel.add(g);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.003, 32), M.knob);
  skirt.position.y = 0.0015;
  g.add(skirt);
  const knob = new THREE.Group();
  g.add(knob);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0072, 0.011, 24), M.knob);
  body.position.y = 0.0085;
  knob.add(body);
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0004, 0.006), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  pointer.position.set(0, 0.0142, -0.0035);
  knob.add(pointer);
  const span = THREE.MathUtils.degToRad(240);
  const angles = steps.map((_, i) => span / 2 - (i * span) / (steps.length - 1));
  steps.forEach((s, i) => {
    const a = angles[i];
    labels.push([s, x - Math.sin(a) * 0.016, z - Math.cos(a) * 0.016, 20]);
  });
  labels.push([name, x + 0.024, z + 0.004, 26]);
  const ctrl = { kind: 'rotary', name, group: g, knob, steps, angles, index: 0, cool: 0, grabRef: null, grabIndex: 0 };
  knob.rotation.y = angles[0];
  addHit(ctrl, 0.026, 0.02, 0.026, 0.008);
  addHighlight(ctrl, 0.012);
  controlsList.push(ctrl);
  return ctrl;
}

/** Leuchttaster mit Beschriftung im Deckel. */
function button({ name, x, z, lines }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  panel.add(g);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.004, 0.019), M.black);
  frame.position.y = 0.002;
  g.add(frame);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const cx = c.getContext('2d');
  cx.fillStyle = '#222';
  cx.fillRect(0, 0, 128, 128);
  cx.fillStyle = '#fff';
  cx.font = 'bold 30px Arial';
  cx.textAlign = 'center';
  lines.forEach((l, i) => cx.fillText(l, 64, 50 + i * 34));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const capMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0x000000, roughness: 0.4 });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.006, 0.015), [M.black, M.black, capMat, M.black, M.black, M.black]);
  cap.position.y = 0.006;
  g.add(cap);
  labels.push([name, x, z + 0.017, 26]);
  const ctrl = { kind: 'button', name, group: g, cap, capMat, pressed: false };
  addHit(ctrl, 0.022, 0.02, 0.022, 0.008);
  addHighlight(ctrl, 0.012);
  controlsList.push(ctrl);
  return ctrl;
}

/** Kontrollleuchte (Anzeige, nicht bedienbar). */
const lamps = {};
function lamp(id, x, z, text) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const cx = c.getContext('2d');
  cx.fillStyle = '#111';
  cx.fillRect(0, 0, 128, 64);
  cx.fillStyle = '#ffb640';
  cx.font = 'bold 26px Arial';
  cx.textAlign = 'center';
  cx.fillText(text, 64, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ color: 0x333333, emissiveMap: t, emissive: 0x000000, roughness: 0.3 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.014), [M.black, M.black, mat, M.black, M.black, M.black]);
  m.position.set(x, 0.0015, z);
  panel.add(m);
  lamps[id] = mat;
}

// Belegung nach #15, Block 52 (#4); Verhalten stark vereinfacht
const mainPwr = toggle({ name: 'MAIN PWR', x: -0.036, z: -0.058, positions: ['OFF', 'BATT', 'MAIN'], start: 0, lock: true });
const lampTest = button({ name: 'MAL & IND LTS', x: 0.036, z: -0.058, lines: ['LAMP', 'TEST'] });
const jfs = toggle({ name: 'JFS', x: -0.036, z: -0.004, positions: ['START 1', 'OFF', 'START 2'], start: 1, spring: 1 });
const buc = toggle({ name: 'BUC', x: 0.036, z: -0.004, positions: ['OFF', 'BUC'], start: 0, guard: 0 });
const epu = toggle({ name: 'EPU', x: -0.036, z: 0.06, positions: ['OFF', 'NORM', 'ON'], start: 1, guard: 1 });
const consoleLt = rotary({ name: 'CONSOLES', x: 0.036, z: 0.058, steps: ['OFF', '1', '2', '3', '4', 'BRT'] });
lamp('main', -0.05, 0.084, 'MAIN GEN');
lamp('stby', -0.017, 0.084, 'STBY GEN');
lamp('epu', 0.017, 0.084, 'EPU');
lamp('jfs', 0.05, 0.084, 'JFS RUN');
drawPlate();

// ---- Vereinfachte Systemlogik, nur damit Schalter sichtbar etwas bewirken ----------------------

const sys = { jfsRun: 0, jfsSpool: 0 };
function stepSystems(dt) {
  const power = mainPwr.index >= 1;
  if (power && jfs.index !== 1) sys.jfsSpool = 2.0;
  if (sys.jfsSpool > 0) { sys.jfsSpool -= dt; if (sys.jfsSpool <= 0 && power) sys.jfsRun = 1; }
  if (!power) sys.jfsRun = 0;
  const test = power && lampTest.pressed;
  const on = {
    main: power && (mainPwr.index < 2 || !sys.jfsRun),
    stby: power && !sys.jfsRun,
    epu: power && epu.index === 2,
    jfs: power && !!sys.jfsRun,
  };
  for (const k in lamps) lamps[k].emissive.setScalar(test || on[k] ? 1 : 0);
  lampTest.capMat.emissive.setRGB(test ? 1 : 0, test ? 0.85 : 0, test ? 0.4 : 0);
  const b = consoleLt.index / (consoleLt.steps.length - 1);
  plateMat.emissive.setRGB(0.55 * b, 0.6 * b, 0.45 * b);
}

// ---- Zustandsänderungen ------------------------------------------------------------------------

function setToggle(sw, i, hand) {
  if (i < 0 || i >= sw.positions.length || i === sw.index) return false;
  if (sw.guard && !sw.guard.open) return false;
  sw.index = i;
  click();
  buzz(hand, 0.6);
  return true;
}
function setGuard(g, open, hand) {
  if (g.open === open) return;
  g.open = open;
  if (!open && g.sw.index !== g.restIndex) { g.sw.index = g.restIndex; } // Klappe drückt den Schalter zurück
  click(0.7);
  buzz(hand, 0.4, 40);
}
function setRotary(r, i, hand) {
  i = THREE.MathUtils.clamp(i, 0, r.steps.length - 1);
  if (i === r.index) return;
  r.index = i;
  click(0.5);
  buzz(hand, 0.35, 15);
}
function setButton(b, down, hand) {
  if (b.pressed === down) return;
  b.pressed = down;
  if (down) { click(0.8); buzz(hand, 0.5); }
}

function animate(dt) {
  for (const c of controlsList) {
    if (c.kind === 'toggle') {
      c.lever.rotation.x = THREE.MathUtils.damp(c.lever.rotation.x, c.angles[c.index], 40, dt);
    } else if (c.kind === 'guard') {
      c.hinge.rotation.x = THREE.MathUtils.damp(c.hinge.rotation.x, c.open ? -1.75 : 0, 18, dt);
    } else if (c.kind === 'rotary') {
      c.knob.rotation.y = THREE.MathUtils.damp(c.knob.rotation.y, c.angles[c.index], 30, dt);
    } else if (c.kind === 'button') {
      c.cap.position.y = THREE.MathUtils.damp(c.cap.position.y, c.pressed ? 0.0042 : 0.006, 50, dt);
    }
  }
}

// ---- Bedienart -----------------------------------------------------------------------------------

let mode = 'finger';
const modeBtn = document.getElementById('mode');
function setMode(m) {
  mode = m;
  modeBtn.textContent = 'Bedienart: ' + (m === 'finger' ? 'Finger' : 'Strahl');
  modeBtn.setAttribute('aria-pressed', m === 'ray');
  for (const h of hands) { h.ray.visible = m === 'ray'; h.tip.visible = m === 'finger'; }
  modeSign.set(m);
}
modeBtn.onclick = () => setMode(mode === 'finger' ? 'ray' : 'finger');

// Schild über dem Glareshield, damit man die Bedienart in VR sieht
const modeSign = (() => {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const cx = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0375), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  m.position.set(-0.3, 0.30, 0.2);
  m.rotation.set(-0.5, 0.35, 0);
  scene.add(m);
  return {
    set(mo) {
      cx.clearRect(0, 0, 512, 96);
      cx.fillStyle = 'rgba(10,12,14,0.8)';
      cx.fillRect(0, 0, 512, 96);
      cx.fillStyle = '#7dff9c';
      cx.font = 'bold 44px Arial';
      cx.textAlign = 'center';
      cx.fillText(mo === 'finger' ? 'FINGER  (A/X: Strahl)' : 'STRAHL  (A/X: Finger)', 256, 64);
      t.needsUpdate = true;
    },
  };
})();

// ---- Controller --------------------------------------------------------------------------------

const hands = [0, 1].map((i) => {
  const ray = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ray, grip);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.09), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 }));
  body.position.z = 0.03;
  grip.add(body);
  // Fingerspitze: kleine Kugel vorn am Controller, das ist der Kontaktpunkt
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dff9c }));
  tip.position.set(0, 0, -0.035);
  ray.add(tip);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x7dff9c }));
  line.scale.z = 0.6;
  line.visible = false;
  ray.add(line);
  const h = { i, ray: line, rayObj: ray, grip, tip, source: null, gamepad: null, prev: [], hover: null, stickY: 0, stickX: 0, contacts: new Map(), rot: null };
  ray.addEventListener('connected', (e) => { h.source = e.data; });
  ray.addEventListener('disconnected', () => { h.source = null; h.gamepad = null; });
  return h;
});
setMode('finger');

renderer.xr.addEventListener('sessionstart', () => { rig.add(camera); camera.position.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => { scene.add(camera); toSeat(); });

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function pressedEdge(h, b) {
  const now = !!h.gamepad?.buttons[b]?.pressed;
  const was = !!h.prev[b];
  return now && !was;
}

/** Fingermodus: Kontaktlogik je Bedienelement in dessen lokalem Raum. */
function fingerHand(h, dt) {
  h.tip.getWorldPosition(tmpV);
  const gripDown = !!h.gamepad?.buttons[1]?.pressed;
  for (const c of controlsList) {
    const p = c.group.worldToLocal(tmpV.clone());
    const was = h.contacts.get(c);
    if (c.kind === 'toggle') {
      if (c.guard && !c.guard.open) continue;
      const a = c.lever.rotation.x;
      const base = new THREE.Vector3(0, 0.006, 0);
      const end = base.clone().add(new THREE.Vector3(0, Math.cos(a), Math.sin(a)).multiplyScalar(c.L + 0.0025));
      const dist = new THREE.Line3(base, end).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
      const touch = dist < 0.007 && p.y > 0.008;
      c.cool -= dt;
      if (touch && c.cool <= 0) {
        // Finger hinter der Hebelspitze (zum Piloten) schiebt nach vorn, davor nach hinten
        const dz = p.z - end.z;
        let target = c.index;
        if (dz > 0.0025) target = c.index + 1; else if (dz < -0.0025) target = c.index - 1;
        if (target !== c.index && (!c.lock || gripDown) && setToggle(c, target, h.gamepad && h)) c.cool = 0.25;
        c.held = true;
      }
      // Federnde Schalter bleiben gehalten, solange der Finger in der Nähe der Spitze bleibt
      const hold = touch || (was && dist < 0.02);
      if (!hold && was && c.spring != null) { c.held = false; if (c.index !== c.spring) setToggle(c, c.spring, h); }
      h.contacts.set(c, hold);
    } else if (c.kind === 'guard') {
      c.hit.updateMatrixWorld();
      const q = c.hit.worldToLocal(tmpV.clone());
      const inside = Math.abs(q.x) < (c.W + 0.008) / 2 && Math.abs(q.y) < (c.H + 0.008) / 2 && Math.abs(q.z) < (c.D + 0.008) / 2;
      if (inside && c.armed) { setGuard(c, !c.open, h); c.armed = false; }
      if (!inside) { const far = Math.abs(q.x) > 0.03 || Math.abs(q.y) > 0.03 || Math.abs(q.z) > 0.035; if (far) c.armed = true; }
    } else if (c.kind === 'button') {
      const inside = Math.abs(p.x) < 0.009 && Math.abs(p.z) < 0.009 && p.y < 0.011 && p.y > -0.01;
      if (inside !== !!was) setButton(c, inside, h);
      h.contacts.set(c, inside);
    } else if (c.kind === 'rotary') {
      const near = Math.hypot(p.x, p.z) < 0.02 && p.y < 0.03 && p.y > -0.005;
      if (near && gripDown) {
        // Handgelenk drehen: Rollwinkel des Controllers relativ zum Greifen
        h.rayObj.getWorldQuaternion(tmpQ);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQ);
        if (!h.rot || h.rot.ctrl !== c) h.rot = { ctrl: c, up0: up.clone(), i0: c.index };
        const ang = Math.atan2(new THREE.Vector3().crossVectors(h.rot.up0, up).dot(fwd), h.rot.up0.dot(up));
        setRotary(c, h.rot.i0 + Math.round(-ang / THREE.MathUtils.degToRad(30)), h);
      } else if (h.rot?.ctrl === c && !gripDown) h.rot = null;
    }
  }
}

/** Strahlmodus: zielen, Stick kippt/dreht, Trigger drückt. */
function rayHand(h) {
  h.rayObj.updateMatrixWorld();
  tmpQ.setFromRotationMatrix(h.rayObj.matrixWorld);
  raycaster.set(h.rayObj.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQ));
  raycaster.far = 1.5;
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  h.ray.scale.z = hit ? hit.distance : 0.6;
  const c = hit?.object.userData.ctrl ?? null;
  if (h.hover && h.hover !== c) release(h.hover, h);
  h.hover = c;
  if (!c) return;
  const gp = h.gamepad;
  const sy = gp?.axes[3] ?? 0, sx = gp?.axes[2] ?? 0;
  const trig = !!gp?.buttons[0]?.pressed;
  const stickUp = sy < -0.6, stickDown = sy > 0.6;
  if (c.kind === 'toggle') {
    if (!c.lock || trig) {
      if (stickUp && h.stickY !== -1) setToggle(c, c.index + 1, h);
      if (stickDown && h.stickY !== 1) setToggle(c, c.index - 1, h);
    }
    if (!stickUp && !stickDown && c.spring != null && c.index !== c.spring) setToggle(c, c.spring, h);
  } else if (c.kind === 'guard') {
    if (pressedEdge(h, 0)) setGuard(c, !c.open, h);
  } else if (c.kind === 'button') {
    setButton(c, trig, h);
  } else if (c.kind === 'rotary') {
    if (sx > 0.6 && h.stickX !== 1) setRotary(c, c.index + 1, h);
    if (sx < -0.6 && h.stickX !== -1) setRotary(c, c.index - 1, h);
  }
  h.stickY = stickUp ? -1 : stickDown ? 1 : 0;
  h.stickX = sx > 0.6 ? 1 : sx < -0.6 ? -1 : 0;
}

function release(c, h) {
  if (c.kind === 'button') setButton(c, false, h);
  if (c.kind === 'toggle' && c.spring != null && c.index !== c.spring) setToggle(c, c.spring, h);
}

function pollHands(dt) {
  const session = renderer.xr.getSession();
  for (const h of hands) {
    h.gamepad = h.source?.gamepad ?? null;
    if (!session || !h.gamepad) continue;
    if (pressedEdge(h, 4)) setMode(mode === 'finger' ? 'ray' : 'finger');
    if (mode === 'finger') fingerHand(h, dt); else rayHand(h);
    h.prev = h.gamepad.buttons.map((b) => b.pressed);
  }
  // Hervorhebung: woran gerade gezielt wird (Strahl) oder was der Finger berührt
  for (const c of controlsList) if (c.ring) c.ring.visible = false;
  for (const h of hands) if (mode === 'ray' && h.hover?.ring) h.hover.ring.visible = true;
  if (mouseHover?.ring) mouseHover.ring.visible = true;
}

// ---- Desktop: Maus wie ein Strahl ----------------------------------------------------------------

let mouseHover = null;
const mouse = new THREE.Vector2();
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  raycaster.far = 5;
  return raycaster.intersectObjects(hitMeshes, false)[0]?.object.userData.ctrl ?? null;
}
let mouseDown = null;
renderer.domElement.addEventListener('pointermove', (e) => { mouseHover = pick(e); renderer.domElement.style.cursor = mouseHover ? 'pointer' : ''; });
renderer.domElement.addEventListener('contextmenu', (e) => { if (pick(e)) e.preventDefault(); });
renderer.domElement.addEventListener('pointerdown', (e) => {
  const c = pick(e);
  if (!c) return;
  controls.enabled = false;
  mouseDown = c;
  const back = e.button === 2;
  if (c.kind === 'toggle') setToggle(c, c.index + (back ? -1 : 1));
  else if (c.kind === 'guard') setGuard(c, !c.open);
  else if (c.kind === 'button') setButton(c, true);
  else if (c.kind === 'rotary') setRotary(c, c.index + (back ? -1 : 1));
});
addEventListener('pointerup', () => {
  if (mouseDown) release(mouseDown);
  mouseDown = null;
  controls.enabled = true;
});
renderer.domElement.addEventListener('wheel', (e) => {
  const c = pick(e);
  if (c?.kind !== 'rotary') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  setRotary(c, c.index + (e.deltaY < 0 ? 1 : -1));
}, { passive: false, capture: true });

// ---- Bedienleiste --------------------------------------------------------------------------------

const canopyBtn = document.getElementById('canopy');
canopyBtn.onclick = () => {
  const on = canopyBtn.getAttribute('aria-pressed') !== 'true';
  canopyBtn.setAttribute('aria-pressed', on);
  for (const o of canopy) o.visible = on;
};
function toSeat() { camera.position.copy(EYE); controls.target.copy(TARGET); controls.update(); }
document.getElementById('seat').onclick = toSeat;
document.getElementById('look').onclick = () => {
  camera.position.set(-0.26, 0.05, 0.34);
  controls.target.set(-0.352, -0.22, 0.17);
  controls.update();
};
window.__lookPanel = document.getElementById('look').onclick;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const stats = document.getElementById('stats');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!renderer.xr.isPresenting) controls.update();
  pollHands(dt);
  stepSystems(dt);
  animate(dt);
  renderer.render(scene, camera);
  stats.textContent = `MAIN PWR ${mainPwr.positions[mainPwr.index]} · JFS ${jfs.positions[jfs.index]} · EPU ${epu.positions[epu.index]} · BUC ${buc.positions[buc.index]} · CONSOLES ${consoleLt.steps[consoleLt.index]}`;
});
window.__ctrl = { mainPwr, jfs, buc, epu, consoleLt, lampTest, setToggle, setGuard, setRotary, setButton };
