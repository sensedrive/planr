import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { Cockpit } from './cockpit/cockpit';
import { FlightAudio } from './core/audio';
import { type Actions, createControlState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { GamepadInput } from './input/gamepad';
import { KeyboardInput } from './input/keyboardMouse';
import { XRCockpitInput } from './input/xrCockpit';
import { Aircraft } from './sim/aircraft';
import { createAirfield, runwayStart } from './world/runway';
import { Clouds, createLights, createSky, HORIZON } from './world/sky';
import { createWater, Terrain, terrainHeight } from './world/terrain';
import { AircraftModel } from './view/aircraftModel';
import { CameraRig } from './view/cameras';
import { Hud } from './view/hud';

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
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 1500, 5200);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 9000);

const sky = createSky();
scene.add(sky);
createLights(scene);
const terrain = new Terrain();
scene.add(terrain.group);
const water = createWater();
scene.add(water);
scene.add(createAirfield(renderer.capabilities.getMaxAnisotropy()));
const clouds = new Clouds();
scene.add(clouds.mesh);

// ---- aircraft ---------------------------------------------------------------

const aircraft = new Aircraft();
const model = new AircraftModel();
scene.add(model.root);
const cockpit = new Cockpit();
model.root.add(cockpit.group);

const controls = createControlState();
const hud = new Hud();
const audio = new FlightAudio();
const cameraRig = new CameraRig(camera, scene, model.root, renderer.domElement);
let paused = false;

function reset(airStart = false): void {
  aircraft.reset(runwayStart(), airStart);
  Object.assign(controls, createControlState());
  if (airStart) {
    controls.throttle = 0.65;
  }
  aircraft.interpolate(1, model.root);
}

const actions: Actions = {
  reset,
  toggleCamera: () => cameraRig.toggle(),
  recenter: () => cameraRig.recenter(),
  togglePause: () => (paused = !paused),
  toggleMute: () => audio.toggleMute(),
  toggleHelp: () => hud.toggleHelp(),
};

const keyboard = new KeyboardInput(actions, renderer.domElement);
const gamepad = new GamepadInput(actions);
const xrInput = new XRCockpitInput(renderer, cameraRig.xrRig, cockpit.controls3d, actions);

for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.start());

let xrStartTime = 0;
renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr');
  cameraRig.onXRStart();
  audio.start();
  xrStartTime = performance.now();
});
renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('xr');
  cameraRig.onXREnd();
  xrInput.release();
  cockpit.setMessage('');
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

reset();
terrain.update(model.root.position.x, model.root.position.z, Infinity);

const loop = new FixedStepLoop(1 / 120);
const clock = new THREE.Clock();
let fps = 60;
let cloudTimer = 0;
let hintShown = false;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const xr = renderer.xr.isPresenting;

  controls.brake = 0;
  if (xr) {
    xrInput.update(dt, controls, aircraft.stallWarning);
  } else {
    keyboard.update(dt, controls);
    const pad = gamepad.update(dt, controls);
    controls.pitch = pad?.pitch ?? keyboard.pitch;
    controls.roll = pad?.roll ?? keyboard.roll;
    controls.yaw = pad?.yaw ?? keyboard.yaw;
  }

  const alpha = paused ? 1 : loop.advance(dt, (step) => aircraft.step(step, controls, terrainHeight));
  aircraft.interpolate(alpha, model.root);
  const pos = model.root.position;

  model.update(paused ? 0 : dt, controls, aircraft.engine.rpm, aircraft.flaps, controls.trim);
  const inCockpit = cameraRig.inCockpit;
  model.fuselage.visible = !inCockpit;
  cockpit.group.visible = inCockpit;
  if (inCockpit) {
    cockpit.update(dt, controls, {
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
    });
  }

  terrain.update(pos.x, pos.z, xr ? 2 : 4);
  sky.position.copy(pos);
  water.position.set(Math.round(pos.x / 100) * 100, 0, Math.round(pos.z / 100) * 100);
  cloudTimer -= dt;
  if (cloudTimer <= 0) {
    cloudTimer = 0.5;
    clouds.update(pos.x, pos.z);
  }
  cameraRig.update(dt);

  // messages
  let title = '';
  let subtitle = '';
  if (aircraft.crashed) {
    title = `Absturz: ${aircraft.crashReason}`;
    subtitle = xr ? 'A-Taste für Neustart' : 'R für Neustart · L für Luftstart';
  } else if (paused) {
    title = 'Pause';
    subtitle = 'P zum Fortsetzen';
  } else if (xr && !hintShown) {
    if (xrInput.anyGrab || performance.now() - xrStartTime > 15000) hintShown = true;
    title = 'Knüppel & Gashebel greifen';
    subtitle = 'Grifftaste halten · X: zentrieren · A: Neustart';
  }
  if (xr) cockpit.setMessage(title, subtitle);
  else hud.setMessage(title, subtitle);
  if (!xr) hud.update(dt, aircraft, controls, fps);

  audio.update(aircraft.engine.rpm, aircraft.engine.spool, aircraft.aero.airspeed, aircraft.stallWarning, aircraft.crashed || paused);
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) Object.assign(window, { sim: { aircraft, controls, actions, cameraRig } });
