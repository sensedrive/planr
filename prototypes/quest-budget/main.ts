/**
 * PROTOTYP (Wegwerf-Code, Ticket #28): Lasttest für das Quest-Budget.
 *
 * Läuft auf der eigenen Engine mit der Alpenwelt und legt stufenweise die Last der späteren F-16 drauf:
 * Cockpit (Graumodell + Frontpanel-GLB und Ersatzteile bis zum Zielbudget), vier Vektor-Displays,
 * KI-Jets mit vier LOD-Stufen, Partikel und CPU-Last für Sim und KI im 50-Hz-Takt.
 * Ein Messlauf geht alle Stufen durch und zeigt die Tabelle im Headset und danach auf der Seite.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fovFromVertical } from '../../src/engine/math';
import { Renderer, type ViewInput } from '../../src/engine/render/renderer';
import { rigViews, XRSystem } from '../../src/engine/xr/xr';
import { Sky } from '../../src/next/sky';
import { scenarioTerrain } from '../../src/next/world';
import { Forest } from '../../src/world/forest';
import { createAirfields } from '../../src/world/runway';
import { setScenario } from '../../src/world/scenario';
import { createAlps } from '../../src/world/scenarios/alps';
import { terrainHeight } from '../../src/world/terrain';

// ---- Welt -----------------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const xr = new XRSystem(renderer.dev);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 150000);
const sky = new Sky(scene);
const forest = new Forest();
scene.add(forest.group);
const alps = createAlps();
setScenario(alps);
renderer.terrain.reset(scenarioTerrain);
sky.setWater(alps.waterColor);
sky.setCloudBase(alps.cloudBase);
sky.setWeather({ coverage: 0.55, base: null, overcast: false, rain: 0, visibility: 16000 });
sky.setTime('day');
const airfields = createAirfields(alps.airports, renderer.dev.caps.anisotropy);
for (const a of airfields) scene.add(a.group);
const wind = new THREE.Vector3();

/** Flugbahn: Kreis um den Heimatplatz, 600 m über Grund, 150 m/s */
const home = alps.airports[0].center;
const ORBIT_R = 4000;
const SPEED = 150;
const jet = new THREE.Group();
scene.add(jet);
let orbit = 0;
function placeJet(o: THREE.Object3D, angle: number, radius: number, alt: number, bank = 0.35): void {
  const x = home.x + Math.cos(angle) * radius;
  const z = home.z + Math.sin(angle) * radius;
  o.position.set(x, Math.max(terrainHeight(x, z), home.y) + alt, z);
  // Flugrichtung tangential (gegen den Uhrzeigersinn von oben)
  o.rotation.set(0, Math.PI - angle, 0, 'YXZ');
  o.rotateZ(bank);
}

// ---- Cockpit --------------------------------------------------------------------------------

/** Augpunkt im glTF-Rahmen der Cockpit-Prototypen (Blender 0, -0.72, 0.44) */
const EYE = new THREE.Vector3(0, 0.44, 0.72);
const cockpit = new THREE.Group();
cockpit.userData.interior = true;
jet.add(cockpit);
const glbParts = new THREE.Group();
cockpit.add(glbParts);
const glbs = (window as unknown as { GLB?: Record<string, string> }).GLB ?? {};
const loader = new GLTFLoader();
for (const b64 of Object.values(glbs)) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  loader.parse(bin.buffer, '', (g) => glbParts.add(g.scene), (e) => console.warn('GLB', e));
}

/** Ersatzteile bis zum Zielbudget: je Teil ein eigenes Material, also ein Draw Call */
const extraParts = new THREE.Group();
cockpit.add(extraParts);
function buildExtraParts(draws: number, tris: number): void {
  for (const c of [...extraParts.children]) {
    extraParts.remove(c);
    (c as THREE.Mesh).geometry.dispose();
  }
  if (draws === 0) return;
  const perPart = Math.max(12, Math.floor(tris / draws));
  // Kugel mit w*h Segmenten hat etwa 2*w*(h-1) Dreiecke
  const seg = Math.max(3, Math.round(Math.sqrt(perPart / 2)));
  const geo = new THREE.SphereGeometry(0.012, seg, seg);
  const rand = mulberry(7);
  for (let i = 0; i < draws; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.6, 0.05, 0.12 + rand() * 0.2), roughness: 0.6 }));
    // Konsolen links/rechts und Frontpanel
    const side = i % 3;
    if (side === 2) m.position.set((rand() - 0.5) * 0.6, 0.15 + rand() * 0.35, 0.05);
    else m.position.set((side ? 1 : -1) * (0.28 + rand() * 0.2), -0.2, 0.1 + rand() * 0.9);
    extraParts.add(m);
  }
}

// ---- Displays (Vektorgrafik, jedes Bild neu erzeugt) ---------------------------------------

interface Display {
  lines: THREE.LineSegments;
  segs: number;
}
const displays: Display[] = [];
const displayRoot = new THREE.Group();
cockpit.add(displayRoot);
// MFD links, MFD rechts, DED, HUD (Lage grob nach Frontpanel)
const DISPLAY_SPOTS: [number, number, number, number][] = [
  [-0.16, 0.03, 0.01, 0.07],
  [0.16, 0.03, 0.01, 0.07],
  [0.0, 0.17, 0.02, 0.04],
  [0.0, 0.42, 0.2, 0.06],
];
function buildDisplays(segs: number): void {
  for (const d of displays) {
    displayRoot.remove(d.lines);
    d.lines.geometry.dispose();
  }
  displays.length = 0;
  if (segs === 0) return;
  DISPLAY_SPOTS.forEach(([x, y, z, size], i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(segs * 6), 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: i === 3 ? 0x60ff80 : 0x80ff90 }));
    lines.position.set(x, y, z);
    lines.scale.setScalar(size);
    lines.frustumCulled = false;
    displayRoot.add(lines);
    displays.push({ lines, segs });
  });
}
function updateDisplays(t: number): void {
  for (const [k, d] of displays.entries()) {
    const attr = d.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    // Kreise, Skalen und „Schrift“-Striche, die sich bewegen
    for (let i = 0; i < d.segs; i++) {
      const p = (i / d.segs) * Math.PI * 2 * 7 + t * (0.3 + k * 0.1);
      const r = 0.2 + 0.3 * ((i * 7919) % 97) / 97;
      const o = i * 6;
      a[o] = Math.cos(p) * r;
      a[o + 1] = Math.sin(p) * r;
      a[o + 2] = 0;
      a[o + 3] = Math.cos(p + 0.05) * (r + 0.02);
      a[o + 4] = Math.sin(p + 0.05) * (r + 0.02);
      a[o + 5] = 0;
    }
    attr.needsUpdate = true;
  }
}

// ---- KI-Jets mit LOD ------------------------------------------------------------------------

const LOD_TRIS = [80000, 30000, 10000, 2000];
const LOD_DIST = [300, 1500, 5000];
/** ein Jet aus fünf Teilen (Rumpf, Flächen, Leitwerk, Haube, Düse) wie später fünf Materialien */
function jetLod(tris: number): THREE.Group {
  const g = new THREE.Group();
  const per = tris / 5;
  const seg = Math.max(3, Math.round(Math.sqrt(per / 2)));
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5 });
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [new THREE.SphereGeometry(1, seg, seg).scale(0.7, 0.7, 7.5), grey],
    [new THREE.SphereGeometry(1, seg, seg).scale(4.7, 0.12, 1.8), grey.clone()],
    [new THREE.SphereGeometry(1, seg, seg).scale(0.1, 1.6, 1.2).translate(0, 1.4, 5), grey.clone()],
    [new THREE.SphereGeometry(1, seg, seg).scale(0.45, 0.4, 1.4).translate(0, 0.7, -3.5), new THREE.MeshStandardMaterial({ color: 0x302810, roughness: 0.1 })],
    [new THREE.SphereGeometry(1, seg, seg).scale(0.55, 0.55, 0.6).translate(0, 0, 7.4), new THREE.MeshStandardMaterial({ color: 0x40403c, roughness: 0.4 })],
  ];
  for (const [geo, mat] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
const lodTemplates = LOD_TRIS.map(jetLod);
interface Bandit {
  root: THREE.Group;
  lods: THREE.Group[];
  angle: number;
  radius: number;
  alt: number;
}
const bandits: Bandit[] = [];
function buildBandits(n: number): void {
  for (const b of bandits) scene.remove(b.root);
  bandits.length = 0;
  for (let i = 0; i < n; i++) {
    const root = new THREE.Group();
    const lods = lodTemplates.map((t) => t.clone());
    root.add(...lods);
    scene.add(root);
    // der erste fliegt als Rottenflieger dicht daneben (LOD0), die anderen verteilt
    bandits.push({ root, lods, angle: i === 0 ? 0.012 : (i / n) * 0.9 - 0.2, radius: i === 0 ? ORBIT_R + 40 : ORBIT_R + (i % 3) * 900 - 900, alt: i === 0 ? 5 : 100 + i * 60 });
  }
}
let visibleTris = 0;
function updateBandits(viewer: THREE.Vector3): void {
  for (const b of bandits) {
    placeJet(b.root, orbit + b.angle, b.radius, 600 + b.alt);
    const d = b.root.position.distanceTo(viewer);
    const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
    b.lods.forEach((l, i) => (l.visible = i === lod));
    visibleTris += LOD_TRIS[lod];
  }
}

// ---- Effekte --------------------------------------------------------------------------------

let particles: THREE.Points | null = null;
let particleVel: Float32Array = new Float32Array(0);
function buildParticles(n: number): void {
  if (particles) {
    scene.remove(particles);
    particles.geometry.dispose();
    particles = null;
  }
  if (n === 0) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  particleVel = new Float32Array(n * 3);
  particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd0d0d0, size: 3, transparent: true, opacity: 0.35, depthWrite: false }));
  particles.frustumCulled = false;
  scene.add(particles);
}
let emit = 0;
function updateParticles(dt: number): void {
  if (!particles) return;
  const attr = particles.geometry.getAttribute('position') as THREE.BufferAttribute;
  const a = attr.array as Float32Array;
  const n = attr.count;
  // Rauchspuren hinter den Jets: pro Bild ein paar neue Teilchen, alle anderen treiben
  const sources = bandits.length ? bandits.map((b) => b.root.position) : [jet.position];
  for (let k = 0; k < 40; k++) {
    const i = emit++ % n;
    const s = sources[k % sources.length];
    a[i * 3] = s.x + (Math.random() - 0.5) * 4;
    a[i * 3 + 1] = s.y + (Math.random() - 0.5) * 4;
    a[i * 3 + 2] = s.z + (Math.random() - 0.5) * 4;
    particleVel[i * 3 + 1] = 1 + Math.random();
  }
  for (let i = 0; i < n * 3; i++) a[i] += particleVel[i] * dt;
  attr.needsUpdate = true;
}

// ---- CPU-Last -------------------------------------------------------------------------------

let simMs = 0;
let simAcc = 0;
/** Sim, Systeme und KI im festen 50-Hz-Takt; die Last ist Rechenarbeit, kein Warten */
let sink = 0;
function burn(ms: number): void {
  const end = performance.now() + ms;
  let x = sink;
  while (performance.now() < end) for (let i = 0; i < 2000; i++) x = Math.sin(x + i) * 1.0001;
  sink = x;
}
function runSim(dt: number): void {
  simAcc += dt;
  let steps = 0;
  while (simAcc >= 0.02 && steps < 3) {
    simAcc -= 0.02;
    steps++;
    if (simMs > 0) burn(simMs);
  }
  if (steps === 3) simAcc = 0;
}

// ---- Stufen ---------------------------------------------------------------------------------

interface Stage {
  name: string;
  glb: boolean;
  extraDraws: number;
  extraTris: number;
  displaySegs: number;
  bandits: number;
  particles: number;
  simMs: number;
}
const BASE: Stage = { name: '', glb: false, extraDraws: 0, extraTris: 0, displaySegs: 0, bandits: 0, particles: 0, simMs: 0 };
const STAGES: Stage[] = [];
function stage(name: string, change: Partial<Stage>): void {
  const prev = STAGES[STAGES.length - 1] ?? BASE;
  STAGES.push({ ...prev, ...change, name });
}
stage('Welt allein', {});
stage('+ Cockpit-GLBs', { glb: true });
stage('+ Cockpit 100 DC/150k', { extraDraws: 70, extraTris: 110000 });
stage('+ 4 Displays', { displaySegs: 3000 });
stage('+ 1 Rottenflieger', { bandits: 1 });
stage('+ 4 Jets', { bandits: 4 });
stage('+ 8 Jets', { bandits: 8 });
stage('+ 20k Partikel', { particles: 20000 });
stage('+ Sim/KI 3 ms', { simMs: 3 });
stage('+ Sim/KI 6 ms', { simMs: 6 });
stage('+ Sim/KI 10 ms', { simMs: 10 });

let current = 0;
function applyStage(i: number): void {
  current = (i + STAGES.length) % STAGES.length;
  const s = STAGES[current];
  glbParts.visible = s.glb;
  buildExtraParts(s.extraDraws, s.extraTris);
  buildDisplays(s.displaySegs);
  buildBandits(s.bandits);
  buildParticles(s.particles);
  simMs = s.simMs;
  resetWindow();
}

// ---- Messung --------------------------------------------------------------------------------

interface Result {
  stage: string;
  hz: number;
  fps: number;
  dropped: number;
  frameMs: number;
  p95: number;
  cpuMs: number;
  draws: number;
  tris: number;
}
const results: Result[] = [];
let window_: number[] = [];
let cpuWindow: number[] = [];
let drawsNow = 0;
let trisNow = 0;
function resetWindow(): void {
  window_ = [];
  cpuWindow = [];
}
function summary(): Result {
  const dts = [...window_].sort((a, b) => a - b);
  const n = Math.max(1, dts.length);
  const mean = dts.reduce((s, v) => s + v, 0) / n;
  const target = 1000 / targetHz();
  return {
    stage: STAGES[current].name,
    hz: targetHz(),
    fps: 1000 / Math.max(mean, 1e-3),
    dropped: dts.filter((d) => d > target * 1.5).length / n,
    frameMs: mean,
    p95: dts[Math.floor(n * 0.95)] ?? 0,
    cpuMs: cpuWindow.reduce((s, v) => s + v, 0) / Math.max(1, cpuWindow.length),
    draws: drawsNow,
    tris: trisNow,
  };
}
function targetHz(): number {
  return (xr.session as (XRSession & { frameRate?: number }) | null)?.frameRate ?? 60;
}

/** automatischer Messlauf: je Stufe 3 s einschwingen, 7 s messen */
let sweep: { stage: number; t: number } | null = null;
const SETTLE = 3;
const MEASURE = 7;
function startSweep(): void {
  results.length = 0;
  sweep = { stage: 0, t: 0 };
  applyStage(0);
}
function updateSweep(dt: number): void {
  if (!sweep) return;
  sweep.t += dt;
  if (sweep.t < SETTLE) resetWindow();
  if (sweep.t >= SETTLE + MEASURE) {
    results.push(summary());
    saveResults();
    sweep.stage++;
    sweep.t = 0;
    if (sweep.stage >= STAGES.length) {
      sweep = null;
      applyStage(0);
    } else applyStage(sweep.stage);
  }
}

function resultTable(): string {
  const rows = results.map((r) =>
    [r.stage.padEnd(22), `${r.hz}`.padStart(3), r.fps.toFixed(1).padStart(5), `${(r.dropped * 100).toFixed(0)}%`.padStart(4), r.p95.toFixed(1).padStart(5), r.cpuMs.toFixed(1).padStart(5), `${r.draws}`.padStart(4), `${Math.round(r.tris / 1000)}k`.padStart(5)].join(' '),
  );
  return ['Stufe                   Hz   fps drop   p95   cpu   DC  Tris', ...rows].join('\n');
}
function saveResults(): void {
  try {
    localStorage.setItem('quest-budget', JSON.stringify({ when: new Date().toISOString(), ua: navigator.userAgent, results }));
  } catch {
    // privates Fenster: Tabelle steht trotzdem im Headset
  }
}

// ---- Anzeige im Headset ---------------------------------------------------------------------

const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024;
panelCanvas.height = 640;
const panelCtx = panelCanvas.getContext('2d')!;
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.225), new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }));
// links neben dem Frontpanel, zum Piloten gedreht
panel.position.set(-0.46, 0.3, 0.3);
panel.rotation.y = 0.9;
cockpit.add(panel);
let panelTimer = 0;
function drawPanel(): void {
  const c = panelCtx;
  c.fillStyle = '#0b1118';
  c.fillRect(0, 0, 1024, 640);
  c.fillStyle = '#e8f0f8';
  c.font = '26px monospace';
  const s = summary();
  const head = sweep ? `Messlauf ${sweep.stage + 1}/${STAGES.length}: ${STAGES[current].name} (${sweep.t < SETTLE ? 'einschwingen' : 'messen'})` : `Stufe ${current + 1}/${STAGES.length}: ${STAGES[current].name}`;
  c.fillText(head, 24, 40);
  c.fillText(`${s.hz} Hz  ${s.fps.toFixed(1)} fps  drop ${(s.dropped * 100).toFixed(0)}%  p95 ${s.p95.toFixed(1)} ms  cpu ${s.cpuMs.toFixed(1)} ms`, 24, 78);
  c.fillText(`Draw Calls ${s.draws}  Dreiecke ${Math.round(s.tris / 1000)}k`, 24, 114);
  c.fillStyle = '#9fb3c8';
  c.font = '22px monospace';
  c.fillText('A: Messlauf  B: nächste Stufe  X: 72/90 Hz  Y: Kopf zentrieren', 24, 150);
  c.fillStyle = '#e8f0f8';
  c.font = '20px monospace';
  resultTable()
    .split('\n')
    .forEach((line, i) => c.fillText(line, 24, 196 + i * 30));
  panelTex.needsUpdate = true;
}

// ---- Rahmen ---------------------------------------------------------------------------------

const rig = new THREE.Group();
jet.add(rig);
const viewer = new THREE.Vector3();

function step(dt: number, inXR: boolean): void {
  renderer.time += dt;
  renderer.frameDt = dt;
  orbit += (SPEED / ORBIT_R) * dt;
  placeJet(jet, orbit, ORBIT_R, 600);
  jet.updateMatrixWorld(true);
  runSim(dt);
  updateSweep(dt);
  camera.getWorldPosition(viewer);
  visibleTris = 0;
  updateBandits(viewer);
  updateDisplays(renderer.time);
  updateParticles(dt);
  forest.density = inXR ? 0.3 : 1;
  forest.update(jet.position.x, jet.position.z, inXR ? 2 : 3);
  for (const a of airfields) a.update(viewer, wind);
  panelTimer -= dt;
  if (panelTimer <= 0) {
    panelTimer = 0.5;
    drawPanel();
  }
}

function countCockpitTris(): number {
  let t = 0;
  cockpit.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) t += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
  });
  return t;
}
let cockpitTris = 0;
let cockpitTrisAt = -1;

function measure(dt: number, cpu: number): void {
  if (dt > 0 && dt < 200) window_.push(dt);
  cpuWindow.push(cpu);
  if (window_.length > 600) window_.shift();
  if (cpuWindow.length > 600) cpuWindow.shift();
  // stats.draws zählt die Engine (noch) nicht: Mesh-Draws aus den Listen, Gelände, Himmel, Wolken, Post grob dazu
  drawsNow = renderer.meshes.opaque.length + renderer.meshes.transparent.length + renderer.meshes.casters.length + 12;
  if (cockpitTrisAt !== current) {
    cockpitTrisAt = current;
    cockpitTris = countCockpitTris();
  }
  trisNow = cockpitTris + visibleTris;
}

let last = performance.now();
function desktopFrame(time: number): void {
  if (xr.isPresenting) return;
  requestAnimationFrame(desktopFrame);
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  const t0 = performance.now();
  camera.position.copy(EYE);
  camera.rotation.set(-0.12, 0, 0);
  jet.add(camera);
  step(dt, false);
  const dpr = Math.min(devicePixelRatio, 2);
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  camera.aspect = w / h;
  camera.updateMatrixWorld();
  const view: ViewInput = { matrix: camera.matrixWorld.elements, fov: fovFromVertical((camera.fov * Math.PI) / 180, w / h) };
  renderer.render([view], sky.env, [scene], { kind: 'canvas', width: w, height: h });
  measure(dt * 1000, performance.now() - t0);
}

/** Tasten der Controller direkt aus der Session (Flanken) */
const pressed = new Set<string>();
function buttons(): void {
  for (const src of xr.session?.inputSources ?? []) {
    const gp = src.gamepad;
    if (!gp) continue;
    // xr-standard: 4 = A/X, 5 = B/Y
    for (const [idx, name] of [
      [4, src.handedness === 'right' ? 'A' : 'X'],
      [5, src.handedness === 'right' ? 'B' : 'Y'],
    ] as const) {
      const down = !!gp.buttons[idx]?.pressed;
      const was = pressed.has(name);
      if (down && !was) onButton(name);
      if (down) pressed.add(name);
      else pressed.delete(name);
    }
  }
}
function onButton(name: 'A' | 'B' | 'X' | 'Y'): void {
  if (name === 'A') startSweep();
  if (name === 'B') {
    sweep = null;
    applyStage(current + 1);
  }
  if (name === 'X') void toggleRate();
  if (name === 'Y') recenter = true;
}
async function toggleRate(): Promise<void> {
  const s = xr.session as (XRSession & { supportedFrameRates?: Float32Array; updateTargetFrameRate?(r: number): Promise<void> }) | null;
  if (!s?.updateTargetFrameRate || !s.supportedFrameRates) return;
  const rates = [...s.supportedFrameRates];
  const want = targetHz() < 80 ? 90 : 72;
  if (rates.includes(want)) await s.updateTargetFrameRate(want).catch(() => undefined);
  resetWindow();
}

let recenter = true;
const headPos = new THREE.Vector3();
xr.onFrame = (time) => {
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  const t0 = performance.now();
  buttons();
  const frame = xr.views();
  if (frame) {
    const p = frame.head.position;
    headPos.set(p.x, p.y, p.z);
    // Kopf auf den Augpunkt setzen (Blickrichtung bleibt, wie sie ist)
    if (recenter) {
      rig.position.copy(EYE).sub(headPos);
      recenter = false;
    }
    camera.position.copy(headPos);
    const q = frame.head.orientation;
    camera.quaternion.set(q.x, q.y, q.z, q.w);
    rig.add(camera);
  }
  step(Math.max(dt, 0), true);
  if (!frame) return;
  renderer.render(rigViews(rig, frame.views), sky.env, [scene], frame.output);
  measure(dt * 1000, performance.now() - t0);
};

// ---- Bedienung auf der Seite ----------------------------------------------------------------

const vrButton = document.getElementById('vr') as HTMLButtonElement;
const out = document.getElementById('out') as HTMLPreElement;
void XRSystem.supported().then((ok) => {
  vrButton.disabled = !ok;
  vrButton.textContent = ok ? 'VR starten' : 'VR nicht verfügbar';
});
vrButton.addEventListener('click', () => {
  xr.start().catch((e) => {
    console.error(e);
    vrButton.textContent = `VR-Start fehlgeschlagen: ${(e as Error).message}`;
  });
});
xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr');
  renderer.terrainBudget = 2500;
  recenter = true;
  resetWindow();
});
xr.addEventListener('sessionend', () => {
  document.body.classList.remove('xr');
  renderer.releaseXR();
  renderer.terrainBudget = 6000;
  showResults();
  requestAnimationFrame(desktopFrame);
});
document.getElementById('sweep')!.addEventListener('click', startSweep);
document.getElementById('copy')!.addEventListener('click', () => void navigator.clipboard?.writeText(out.textContent ?? ''));
function showResults(): void {
  let text = results.length ? resultTable() : '';
  if (!text) {
    try {
      const saved = JSON.parse(localStorage.getItem('quest-budget') ?? 'null') as { when: string; results: Result[] } | null;
      if (saved?.results.length) {
        results.push(...saved.results);
        text = `Letzter Messlauf ${saved.when}\n${resultTable()}`;
        results.length = 0;
      }
    } catch {
      // nichts gespeichert
    }
  }
  out.textContent = text ? `${text}\n\n${navigator.userAgent}` : 'Noch kein Messlauf.';
}
setInterval(() => {
  if (!xr.isPresenting && results.length) out.textContent = resultTable();
}, 1000);

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Startzustand
placeJet(jet, orbit, ORBIT_R, 600);
renderer.terrain.update(jet.position.x, jet.position.z, Infinity);
forest.update(jet.position.x, jet.position.z, Infinity);
applyStage(0);
showResults();
requestAnimationFrame(desktopFrame);
Object.assign(window, { budget: { startSweep, applyStage, results, summary, STAGES, gl: renderer.gl } });
