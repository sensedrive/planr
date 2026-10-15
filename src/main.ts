import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { Cockpit } from './cockpit/cockpit';
import { stickConfig } from './cockpit/controls3d';
import { makeLayout } from './cockpit/layout';
import { CockpitMouse } from './input/cockpitMouse';
import { type AircraftId, type AircraftType, C172, JET } from './sim/types';
import { FlightAudio } from './core/audio';
import { type Actions, clamp, createControlState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { Missions } from './game/missions';
import { loadBest, loadSettings, OPTIONS, saveSettings, type Settings } from './game/settings';
import { Weather } from './game/weather';
import { GamepadInput } from './input/gamepad';
import { KeyboardInput } from './input/keyboardMouse';
import { XRCockpitInput } from './input/xrCockpit';
import { Aircraft } from './sim/aircraft';
import { Menu, type MenuHandlers } from './ui/menu';
import { VRMenu } from './ui/vrMenu';
import { AircraftModel, type AircraftVisual } from './view/aircraftModel';
import { JetModel } from './view/jetModel';
import { CameraRig } from './view/cameras';
import { Hud } from './view/hud';
import { Vignette } from './view/vignette';
import { createAirfields, createTrees } from './world/runway';
import { Environment } from './world/sky';
import { createWater, surfaceHeight, Terrain } from './world/terrain';

// ---- renderer & scene -------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 9000);
const env = new Environment(scene);
const terrain = new Terrain();
scene.add(terrain.group);
const water = createWater();
scene.add(water);
const airfields = createAirfields(renderer.capabilities.getMaxAnisotropy());
for (const a of airfields) scene.add(a.group);
scene.add(createTrees());

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
const variants: Record<AircraftId, Variant> = {
  c172: { type: C172, model: new AircraftModel(), cockpit: new Cockpit(makeLayout(C172), { ...C172.instruments, flapDegrees: C172.flapDegrees }) },
  jet: { type: JET, model: new JetModel(), cockpit: new Cockpit(makeLayout(JET), { ...JET.instruments, flapDegrees: JET.flapDegrees }) },
};
for (const v of Object.values(variants)) {
  aircraftRoot.add(v.model.root, v.cockpit.group);
  v.model.root.visible = false;
  v.cockpit.group.visible = false;
}
let current = variants.c172;
const model = () => current.model;
const cockpit = () => current.cockpit;

const controls = createControlState();
const weather = new Weather();
const missions = new Missions(aircraft, weather);
scene.add(missions.course.group);
const hud = new Hud();
const audio = new FlightAudio();
const cameraRig = new CameraRig(camera, scene, aircraftRoot, renderer.domElement);
const vignette = new Vignette(camera);
const settings: Settings = loadSettings();

let started = false;
let menuOpen = true;
let paused = false;
let hintShown = false;
let xrStartTime = 0;

function bestText(): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const l = loadBest('landing');
  const r = loadBest('rings');
  const c = loadBest('crosscountry');
  const parts = [l !== null ? `Landung ${'★'.repeat(l) || '–'}` : null, r !== null ? `Ringe ${fmt(r)}` : null, c !== null ? `Bergflug ${fmt(c)}` : null];
  const list = parts.filter(Boolean).join(' · ');
  return list ? `Bestwerte: ${list}` : '';
}

function useAircraft(id: AircraftId): void {
  current.model.root.visible = false;
  current.cockpit.group.visible = false;
  current.cockpit.setMessage('');
  current = variants[id];
  current.model.root.visible = true;
  cameraRig.setEye(current.type.eye);
  xrInput.setVisuals(current.cockpit.controls3d);
  cockpitMouse.visuals = current.cockpit.controls3d;
}

function applyLive(): void {
  vignette.enabled = settings.vignette === 'on';
  cameraRig.seat = settings.seat;
  stickConfig.travel = settings.stick;
  env.setTime(settings.time);
  for (const a of airfields) a.setNight(settings.time !== 'day');
}

function startFlight(override?: Partial<Settings>): void {
  useAircraft(settings.aircraft);
  missions.start({ ...settings, ...override }, controls);
  aircraft.interpolate(1, aircraftRoot);
  terrain.update(aircraft.pos.x, aircraft.pos.z, Infinity);
  started = true;
  paused = false;
  hintShown = false;
  xrStartTime = performance.now();
  closeMenu();
}

const handlers: MenuHandlers = {
  change(key, value) {
    (settings as unknown as Record<string, string | number>)[key] = value;
    saveSettings(settings);
    applyLive();
  },
  fly: () => startFlight(),
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
  reset: (airStart = false) => startFlight(airStart ? { mission: 'airstart' } : undefined),
  toggleCamera: () => cameraRig.toggle(),
  recenter: () => cameraRig.recenter(),
  togglePause: () => (paused = !paused),
  toggleMute: () => audio.toggleMute(),
  toggleHelp: () => hud.toggleHelp(),
  toggleMenu: () => (menuOpen ? started && closeMenu() : openMenu()),
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
const cockpitMouse = new CockpitMouse(camera, renderer.domElement, controls, (label) => {
  hintText = label;
  hintUntil = performance.now() + 1200;
});
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

applyLive();
useAircraft(settings.aircraft);
missions.start(settings, controls);
aircraft.interpolate(1, aircraftRoot);
terrain.update(aircraft.pos.x, aircraft.pos.z, Infinity);
menu.show(false, bestText());

const loop = new FixedStepLoop(1 / 120);
const timer = new THREE.Timer();
const viewer = new THREE.Vector3();
let fps = 60;

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
    xrInput.update(dt, controls, aircraft.stallWarning);
    vrMenu.update();
  } else {
    keyboard.update(dt, controls);
    const pad = gamepad.update(dt, controls);
    controls.pitch = pad?.pitch ?? keyboard.pitch;
    controls.roll = pad?.roll ?? keyboard.roll;
    controls.yaw = pad?.yaw ?? keyboard.yaw;
  }

  if (running) {
    weather.update(dt, aircraft.pos.y - surfaceHeight(aircraft.pos.x, aircraft.pos.z));
    missions.update(dt);
  }
  const alpha = running ? loop.advance(dt, (step) => aircraft.step(step, controls, surfaceHeight, weather.current)) : 1;
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
      missions.status || `Wind ${windStr}`,
      missions.target,
    );
  }

  terrain.update(pos.x, pos.z, xr ? 2 : 4);
  env.update(dt, pos);
  water.position.set(Math.round(pos.x / 100) * 100, 0, Math.round(pos.z / 100) * 100);
  cameraRig.update(dt);
  camera.getWorldPosition(viewer);
  for (const a of airfields) a.update(viewer, weather.current);
  vignette.update(dt, aircraft.omega.length(), inCockpit && running);

  // messages
  let title = '';
  let subtitle = '';
  const notice = missions.notice;
  if (menuOpen) {
    // the menu says it all
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
    hud.update(dt, aircraft, controls, fps, windStr, missions.status);
  }

  audio.update(aircraft.engine.rpm, aircraft.engine.spool, aircraft.aero.airspeed, aircraft.stallWarning, aircraft.crashed || !running, current.type.id === 'jet');
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) Object.assign(window, { sim: { renderer, scene, camera, variants, aircraft, controls, actions, cameraRig, missions, settings, weather, OPTIONS } });
