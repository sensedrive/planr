import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { Cockpit } from './cockpit/cockpit';
import { stickConfig } from './cockpit/controls3d';
import { makeLayout } from './cockpit/layout';
import { CockpitMouse } from './input/cockpitMouse';
import { AIRCRAFT, type AircraftId, type AircraftType } from './sim/types';
import { switchesFor } from './sim/systems';
import { FlightAudio } from './core/audio';
import { type Actions, clamp, createControlState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { Missions } from './game/missions';
import { bestKey, choiceAvailable, loadBest, loadSettings, OPTIONS, saveSettings, type Settings } from './game/settings';
import { Weather } from './game/weather';
import { GamepadInput } from './input/gamepad';
import { KeyboardInput } from './input/keyboardMouse';
import { XRCockpitInput } from './input/xrCockpit';
import { Aircraft } from './sim/aircraft';
import { Menu, type MenuHandlers } from './ui/menu';
import { VRMenu } from './ui/vrMenu';
import { type AircraftVisual, GenericModel } from './view/genericModel';
import { CameraRig } from './view/cameras';
import { Hud } from './view/hud';
import { Vignette } from './view/vignette';
import { FlightFeel } from './view/feel';
import { TrafficManager } from './game/traffic';
import type { City } from './world/city';
import { Forest } from './world/forest';
import { type Airfield, createAirfields } from './world/runway';
import { type Scenario, type ScenarioId, setScenario } from './world/scenario';
import { createAlps } from './world/scenarios/alps';
import { createFjord } from './world/scenarios/fjord';
import { loadNyc, type NycWorld } from './world/scenarios/nyc';
import { CLEAR_WEATHER, Environment, type WeatherLook } from './world/sky';
import { fetchMetar, type Metar } from './game/metar';
import { createWater, surfaceHeight, Terrain, terrainHeight } from './world/terrain';

// ---- renderer & scene -------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
// filmic response: bright skies and sunlit faces roll off like a camera instead of clipping
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMappingExposure = 1.05;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 9000);
const env = new Environment(scene);
const terrain = new Terrain();
scene.add(terrain.group);
const water = createWater();
scene.add(water);
const forest = new Forest();
scene.add(forest.group);
/** scenario-specific objects: airfields, trees, city, landmarks */
const worldGroup = new THREE.Group();
scene.add(worldGroup);
let airfields: Airfield[] = [];
let city: City | null = null;
let nyc: NycWorld | null = null;
const scenarios: Partial<Record<ScenarioId, Scenario>> = {};
let activeScenario: ScenarioId | null = null;

// ---- aircraft & game --------------------------------------------------------

const aircraft = new Aircraft();
/** interpolated aircraft pose; models, cockpits and the VR rig hang below it */
const aircraftRoot = new THREE.Group();
scene.add(aircraftRoot);

interface Variant {
  type: AircraftType;
  model: AircraftVisual;
  cockpit: Cockpit;
}
/** models and cockpits are built the first time a type is flown */
const variants: Partial<Record<AircraftId, Variant>> = {};
function variant(id: AircraftId): Variant {
  const existing = variants[id];
  if (existing) return existing;
  const type = AIRCRAFT[id];
  const v: Variant = {
    type,
    model: new GenericModel(type),
    cockpit: new Cockpit(makeLayout(type), { ...type.instruments, flapDegrees: type.flapDegrees }, type.hud, switchesFor(type), !type.glider),
  };
  v.model.root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noShadow) o.castShadow = true;
  });
  aircraftRoot.add(v.model.root, v.cockpit.group);
  v.model.root.visible = false;
  v.cockpit.group.visible = false;
  variants[id] = v;
  return v;
}
let current = variant('c172');
const model = () => current.model;
const cockpit = () => current.cockpit;

const controls = createControlState();
const weather = new Weather();
const missions = new Missions(aircraft, weather);
scene.add(missions.course.group);
const traffic = new TrafficManager(surfaceHeight);
scene.add(traffic.group);
const hud = new Hud();
const audio = new FlightAudio();
const cameraRig = new CameraRig(camera, scene, aircraftRoot, renderer.domElement);
const vignette = new Vignette(camera);
const feel = new FlightFeel();
cameraRig.feel = feel;
const settings: Settings = loadSettings();

let started = false;
let menuOpen = true;
let paused = false;
let hintShown = false;
let xrStartTime = 0;

/** Switches the landscape: terrain, airfields, trees, city, water, clouds and ring course. */
async function useScenario(id: ScenarioId): Promise<void> {
  if (id === activeScenario) return;
  let s: Scenario;
  if (id === 'nyc') {
    nyc ??= await loadNyc();
    s = nyc.scenario;
  } else {
    s = scenarios[id] ??= id === 'fjord' ? createFjord() : createAlps();
  }
  setScenario(s);
  activeScenario = id;
  for (const child of [...worldGroup.children]) {
    worldGroup.remove(child);
    if (child !== nyc?.city.group && child !== nyc?.landmarks) child.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
  airfields = createAirfields(s.airports, renderer.capabilities.getMaxAnisotropy());
  for (const a of airfields) worldGroup.add(a.group);
  forest.reset();
  city = id === 'nyc' && nyc ? nyc.city : null;
  if (city && nyc) worldGroup.add(city.group, nyc.landmarks);
  terrain.reset();
  water.material.color.set(s.waterColor);
  env.setCloudBase(s.cloudBase);
  missions.course.load(s.ringCourse(terrainHeight));
  applyLive();
}

function bestText(): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const sel = { scenario: activeScenario ?? settings.scenario, aircraft: settings.aircraft };
  const l = loadBest(bestKey('landing', sel));
  const r = loadBest(bestKey('rings', sel));
  const c = loadBest(bestKey('crosscountry', sel));
  const d = loadBest(bestKey('ditching', sel));
  const parts = [
    l !== null ? `Landung ${'★'.repeat(l) || '–'}` : null,
    r !== null ? `Ringe ${fmt(r)}` : null,
    c !== null ? `Strecke ${fmt(c)}` : null,
    d !== null ? `Wasserung ${fmt(d)}` : null,
  ];
  const list = parts.filter(Boolean).join(' · ');
  const best = list ? `Bestwerte: ${list}` : '';
  return activeScenario === 'nyc' && nyc ? [best, nyc.attribution].filter(Boolean).join(' — ') : best;
}

function useAircraft(id: AircraftId): void {
  current.model.root.visible = false;
  current.cockpit.group.visible = false;
  current.cockpit.setMessage('');
  current = variant(id);
  current.model.root.visible = true;
  cameraRig.setEye(current.type.eye);
  xrInput.setVisuals(current.cockpit.controls3d);
  cockpitMouse.visuals = current.cockpit.controls3d;
}

let metar: Metar | null = null;
let metarPromise: Promise<void> | null = null;

/** Sky look for the selected weather; "live" uses the latest LaGuardia METAR. */
function skyLook(): WeatherLook {
  switch (settings.sky) {
    case 'clear':
      return CLEAR_WEATHER;
    case 'rain':
      return { coverage: 0.85, base: Math.min(650, scenarioCloudBase()), overcast: true, rain: 1, visibility: 3500 };
    case 'live':
      if (metar) return metar.look;
      metarPromise ??= fetchMetar()
        .then((m) => {
          metar = m;
          applyLive();
        })
        .catch((e) => console.warn('METAR unavailable', e))
        .finally(() => (metarPromise = null));
      return { coverage: 0.5, base: null, overcast: false, rain: 0, visibility: 16000 };
    default:
      return { coverage: 0.55, base: null, overcast: false, rain: 0, visibility: 16000 };
  }
}

function scenarioCloudBase(): number {
  return activeScenario === 'nyc' && nyc ? nyc.scenario.cloudBase : (scenarios[activeScenario ?? 'alps']?.cloudBase ?? 1100);
}

function applyLive(): void {
  const look = skyLook();
  env.setWeather(look);
  weather.thermals = settings.time === 'day' && !look.overcast;
  weather.cloudBase = look.base ?? scenarioCloudBase();
  vignette.enabled = settings.vignette === 'on';
  feel.enabled = settings.shake === 'on';
  cameraRig.seat = settings.seat;
  stickConfig.travel = settings.stick;
  env.setTime(settings.time);
  terrain.setSun(env.sunDirection);
  for (const a of airfields) a.setNight(settings.time !== 'day');
  city?.setLights(settings.time === 'night' ? 1 : settings.time === 'evening' ? 0.55 : 0);
}

let loading = false;

async function startFlight(override?: Partial<Settings>): Promise<void> {
  if (loading) return;
  if (settings.scenario !== activeScenario) {
    loading = true;
    const text = settings.scenario === 'nyc' ? 'Lade New York …' : 'Baue Landschaft …';
    hud.setMessage(text);
    cockpit().setMessage(text);
    try {
      await useScenario(settings.scenario);
    } finally {
      loading = false;
      hud.setMessage('');
      cockpit().setMessage('');
    }
  }
  useAircraft(settings.aircraft);
  missions.start({ ...settings, ...override }, controls);
  traffic.start({ off: 0, normal: 1, busy: 2 }[settings.traffic], aircraft.pos);
  if (settings.sky === 'live') {
    if (!metar) await metarPromise;
    if (metar) {
      weather.configureLive(metar.windFrom, metar.windKt, metar.gustKt);
      missions.announce('Live-Wetter LaGuardia', metar.raw.replace(/^METAR\s+/, '').split(' RMK')[0], 9);
    }
  }
  applyLive();
  aircraft.interpolate(1, aircraftRoot);
  terrain.update(aircraft.pos.x, aircraft.pos.z, Infinity);
  city?.update(aircraft.pos.x, aircraft.pos.z, Infinity);
  forest.update(aircraft.pos.x, aircraft.pos.z, Infinity);
  started = true;
  paused = false;
  hintShown = false;
  xrStartTime = performance.now();
  closeMenu();
}

const handlers: MenuHandlers = {
  change(key, value) {
    (settings as unknown as Record<string, string | number>)[key] = value;
    // choices that do not exist in the new landscape fall back to the first available one
    for (const opt of OPTIONS) {
      const chosen = opt.choices.find((c) => c.value === settings[opt.key]);
      if (chosen && !choiceAvailable(chosen, settings)) {
        (settings as unknown as Record<string, string | number>)[opt.key] = opt.choices.find((c) => choiceAvailable(c, settings))!.value;
      }
    }
    saveSettings(settings);
    applyLive();
  },
  fly: () => void startFlight(),
  resume: () => closeMenu(),
};

const menu = new Menu(settings, handlers);

function openMenu(): void {
  menuOpen = true;
  xrInput.release();
  xrInput.enabled = false;
  if (renderer.xr.isPresenting) vrMenu.show(started, bestText(), current.type.eye);
  else menu.show(started, bestText());
}

function closeMenu(): void {
  menuOpen = false;
  menu.hide();
  vrMenu.hide();
  xrInput.enabled = true;
}

const actions: Actions = {
  reset: (airStart = false) => void startFlight(airStart ? { mission: 'airstart' } : undefined),
  toggleCamera: () => cameraRig.toggle(),
  recenter: () => cameraRig.recenter(),
  togglePause: () => (paused = !paused),
  toggleMute: () => audio.toggleMute(),
  toggleHelp: () => hud.toggleHelp(),
  toggleMenu: () => (menuOpen ? started && closeMenu() : openMenu()),
  cockpitSwitch: (id) => {
    if (!started || menuOpen) return;
    aircraft.systems.toggle(id, aircraft);
    audio.click();
  },
  autoStart: () => {
    const s = aircraft.systems;
    if (!started || menuOpen || aircraft.engine.running || current.type.glider) return;
    for (const id of ['battery', 'fuelPump', 'ignition', 'beacon'] as const) if (!s[id]) s.toggle(id, aircraft);
    s.toggle('starter', aircraft);
    audio.click();
  },
  adjustSeat: (delta) => {
    settings.seat = clamp(settings.seat + delta, -0.2, 0.2);
    cameraRig.seat = settings.seat;
    saveSettings(settings);
  },
};

const keyboard = new KeyboardInput(actions, renderer.domElement);
const gamepad = new GamepadInput(actions);
const xrInput = new XRCockpitInput(renderer, cameraRig.xrRig, current.cockpit.controls3d, actions);
const vrMenu = new VRMenu(renderer, cameraRig.xrRig, aircraftRoot, settings, handlers);
const cockpitMouse = new CockpitMouse(
  camera,
  renderer.domElement,
  controls,
  (label) => {
    hintText = label;
    hintUntil = performance.now() + 1200;
  },
  (id) => (id === 'menu' ? actions.toggleMenu() : id === 'recenter' ? actions.recenter() : actions.cockpitSwitch(id)),
);
let hintText = '';
let hintUntil = 0;

for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.start());

renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr');
  cameraRig.onXRStart();
  audio.start();
  xrStartTime = performance.now();
  hintShown = false;
  if (menuOpen) {
    menu.hide();
    vrMenu.show(started, bestText(), current.type.eye);
  }
});
renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('xr');
  cameraRig.onXREnd();
  xrInput.release();
  cockpit().setMessage('');
  if (menuOpen) {
    vrMenu.hide();
    menu.show(started, bestText());
  }
  onResize();
});

function onResize(): void {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---- main loop --------------------------------------------------------------

await useScenario(settings.scenario === 'nyc' ? 'alps' : settings.scenario);
applyLive();
useAircraft(settings.aircraft);
missions.start({ ...settings, scenario: activeScenario! }, controls);
aircraft.interpolate(1, aircraftRoot);
terrain.update(aircraft.pos.x, aircraft.pos.z, Infinity);
menu.show(false, bestText());

const loop = new FixedStepLoop(1 / 120);
const timer = new THREE.Timer();
const viewer = new THREE.Vector3();
let fps = 60;
let waveTime = 0;
let lastTouchdown: unknown = null;

function windText(): string {
  if (weather.baseKt === 0) return 'ruhig';
  return `${String(Math.round(weather.fromDeg)).padStart(3, '0')}° / ${Math.round(weather.speedKt)} kt`;
}

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const xr = renderer.xr.isPresenting;
  const running = started && !menuOpen && !paused;

  controls.brake = 0;
  if (xr) {
    xrInput.update(dt, controls, aircraft.stallWarning, feel.rumble);
    vrMenu.update();
  } else {
    keyboard.update(dt, controls);
    const pad = gamepad.update(dt, controls);
    controls.pitch = pad?.pitch ?? keyboard.pitch;
    controls.roll = pad?.roll ?? keyboard.roll;
    controls.yaw = pad?.yaw ?? keyboard.yaw;
  }

  if (running) {
    weather.update(dt, aircraft.pos.y - surfaceHeight(aircraft.pos.x, aircraft.pos.z), aircraft.pos, terrainHeight);
    missions.update(dt);
    traffic.update(dt, aircraft);
    if (!aircraft.crashed && traffic.collides(aircraft)) {
      aircraft.crashed = true;
      aircraft.crashReason = 'Zusammenstoß mit einem anderen Flugzeug';
    }
  }
  const status = (running && traffic.advisory?.text) || missions.status;
  const alpha = running ? loop.advance(dt, (step) => aircraft.step(step, controls, surfaceHeight, weather.current)) : 1;
  if (aircraft.systems.notice) {
    hintText = aircraft.systems.notice;
    hintUntil = performance.now() + 2500;
    aircraft.systems.notice = '';
  }
  if (aircraft.touchdown && !lastTouchdown) audio.touchdown(aircraft.touchdown.vsFpm, aircraft.touchdown.airspeedKt / 1.944);
  lastTouchdown = aircraft.touchdown;
  // gear or flaps travelling → electric motor sound
  const motors = Math.abs(aircraft.flaps - controls.flaps) > 0.01 || (aircraft.gear > 0.01 && aircraft.gear < 0.99);
  aircraft.interpolate(alpha, aircraftRoot);
  const pos = aircraftRoot.position;

  model().update(running ? dt : 0, controls, aircraft);
  const inCockpit = cameraRig.inCockpit;
  model().fuselage.visible = !inCockpit;
  cockpit().group.visible = inCockpit;
  cockpitMouse.enabled = inCockpit && !xr && !menuOpen;
  const windStr = windText();
  if (inCockpit) {
    cockpit().update(
      dt,
      controls,
      aircraft.gear,
      {
        airspeedKt: aircraft.airspeedKt,
        altitudeFt: aircraft.altitudeFt,
        vsFpm: aircraft.verticalSpeedFpm,
        pitchDeg: aircraft.pitchDeg,
        rollDeg: aircraft.rollDeg,
        headingDeg: aircraft.headingDeg,
        rpm: aircraft.engine.rpm,
        throttle: controls.throttle,
        flapsTarget: controls.flaps,
        flaps: aircraft.flaps,
        trim: controls.trim,
        brake: controls.brake,
        stall: aircraft.stallWarning,
        onGround: aircraft.onGround,
        fps,
        trimRoll: controls.trimRoll,
        trimYaw: controls.trimYaw,
        gear: current.type.retractableGear ? aircraft.gear : null,
      },
      status || `Wind ${windStr}`,
      missions.target,
      {
        pitchDeg: aircraft.pitchDeg,
        rollDeg: aircraft.rollDeg,
        headingDeg: aircraft.headingDeg,
        airspeedKt: aircraft.airspeedKt,
        altitudeFt: aircraft.altitudeFt,
        vsFpm: aircraft.verticalSpeedFpm,
        alphaDeg: (aircraft.aero.alpha * 180) / Math.PI,
        betaDeg: (aircraft.aero.beta * 180) / Math.PI,
        gear: current.type.retractableGear ? aircraft.gear : 0,
        throttle: controls.throttle,
      },
      aircraft.systems,
    );
  }

  terrain.update(pos.x, pos.z, xr ? 2 : 4);
  // in VR every frame is drawn twice: keep the city's far detail range shorter there
  city?.update(pos.x, pos.z, xr ? 2 : 3, xr ? 3600 : undefined);
  forest.density = xr ? 0.6 : 1;
  forest.update(pos.x, pos.z, xr ? 2 : 3);
  env.updateShadow(pos, pos.y - surfaceHeight(pos.x, pos.z));
  env.update(dt, pos, aircraft.vel);
  water.position.set(Math.round(pos.x / 100) * 100, 0, Math.round(pos.z / 100) * 100);
  // drifting waves (texture offset in tiles; the plane snaps by whole tiles)
  waveTime += dt;
  water.material.normalMap!.offset.set((waveTime * 0.011) % 1, (waveTime * 0.007) % 1);
  cameraRig.update(dt);
  camera.getWorldPosition(viewer);
  for (const a of airfields) a.update(viewer, weather.current);
  feel.update(running ? dt : 0, aircraft, running && !aircraft.crashed);
  vignette.update(dt, aircraft.omega.length(), inCockpit && running, inCockpit ? feel.blackout : 0, inCockpit ? feel.redout : 0);
  if (!xr) gamepad.rumble(dt, running ? feel.rumble : 0);

  // messages
  let title = '';
  let subtitle = '';
  const notice = missions.notice;
  if (menuOpen) {
    // the menu says it all
  } else if (aircraft.crashed && aircraft.ditched) {
    title = '✔ Notwasserung gelungen!';
    subtitle = xr ? 'A: Neustart · Stick-Klick: Menü' : 'R: Neustart · Esc: Menü';
  } else if (aircraft.crashed) {
    title = `Absturz: ${aircraft.crashReason}`;
    subtitle = xr ? 'A: Neustart · Stick-Klick: Menü' : 'R: Neustart · Esc: Menü';
  } else if (paused) {
    title = 'Pause';
    subtitle = 'P zum Fortsetzen';
  } else if (performance.now() < hintUntil) {
    title = hintText;
  } else if (notice) {
    title = notice.title;
    subtitle = notice.subtitle;
  } else if (xr && !hintShown) {
    if (xrInput.anyGrab || performance.now() - xrStartTime > 15000) hintShown = true;
    title = 'Knüppel & Gashebel greifen';
    subtitle = 'Grifftaste · X: zentrieren · Stick-Klick: Menü';
  }
  if (xr) cockpit().setMessage(title, subtitle);
  else {
    hud.setMessage(title, subtitle);
    hud.update(dt, aircraft, controls, fps, windStr, status);
  }

  audio.update({
    rpm: current.type.sound === 'turboprop' ? (aircraft.engine.running ? 58 + aircraft.engine.spool * 40 : 0) : aircraft.engine.rpm,
    power: aircraft.engine.spool,
    airspeed: aircraft.aero.airspeed,
    groundSpeed: Math.hypot(aircraft.vel.x, aircraft.vel.z),
    onGround: aircraft.onGround,
    stall: aircraft.stallWarning,
    silent: aircraft.crashed || !running,
    // turboprops use the turbine recordings, mapped from torque to an N1-like value
    jet: current.type.sound === 'jet' || current.type.sound === 'turboprop',
    inCockpit,
    motors,
    rain: env.rainLevel,
  });
  renderer.render(scene, camera);
});

/** Dev helper: put the aircraft somewhere, finish building the world around it and render one frame. */
async function devView(x: number, y: number, z: number, headingDeg: number, mode: 'chase' | 'cockpit' = 'chase'): Promise<void> {
  const h = (headingDeg * Math.PI) / 180;
  aircraft.pos.set(x, y, z);
  aircraft.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -h);
  aircraft.vel.set(Math.sin(h) * 50, 0, -Math.cos(h) * 50);
  aircraft.omega.set(0, 0, 0);
  aircraft.crashed = false;
  aircraft.interpolate(1, aircraftRoot);
  aircraft.interpolate(1, aircraftRoot);
  cameraRig.mode = mode;
  for (let i = 0; i < 40; i++) cameraRig.update(0.1);
  terrain.update(x, z, Infinity);
  city?.update(x, z, Infinity);
  forest.update(x, z, Infinity);
  env.updateShadow(aircraftRoot.position, y - surfaceHeight(x, z));
  env.update(0.5, aircraftRoot.position, aircraft.vel);
  hud.setMessage('');
  renderer.render(scene, camera);
}

if (import.meta.env.DEV) Object.assign(window, { sim: { devView, useAircraft, renderer, scene, camera, terrain, env, variants, aircraft, controls, actions, cameraRig, missions, settings, weather, OPTIONS } });
