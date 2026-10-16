import * as THREE from 'three';
import { createControlState } from '../core/input';
import { createFrame, type FlightRecorder, LIGHT, type ReplayFrame } from '../game/replay';
import { Aircraft } from '../sim/aircraft';
import type { AircraftType } from '../sim/types';
import type { Airport } from '../world/airports';
import type { CameraRig } from './cameras';

export type ReplayCamera = 'chase' | 'free' | 'tower' | 'cockpit';

export const CAMERA_LABEL: Record<ReplayCamera, string> = {
  chase: 'Verfolger',
  free: 'Frei',
  tower: 'Turm',
  cockpit: 'Cockpit',
};

/** free orbit needs a mouse; VR gets the other three */
const DESKTOP_CAMERAS: ReplayCamera[] = ['chase', 'free', 'tower', 'cockpit'];
const XR_CAMERAS: ReplayCamera[] = ['chase', 'tower', 'cockpit'];
const SPEEDS = [0.25, 0.5, 1, 2, 4];
/** how far back a replay starts (s) */
const LOOK_BACK = 45;
const G = 9.81;
const Y = new THREE.Vector3(0, 1, 0);

type Height = (x: number, z: number) => number;

/**
 * Plays the recorded flight back: drives the aircraft model through a ghost `Aircraft`
 * (no physics) and moves the camera around it. On the desktop the camera is placed directly;
 * in VR the head rig is lifted out of the cockpit and parked at the observer point instead.
 */
export class ReplayView {
  active = false;
  paused = false;
  time = 0;
  speed = 1;
  camera: ReplayCamera = 'chase';
  /** state the model is drawn from (the pilot's aircraft is left alone) */
  readonly ghost = new Aircraft();
  /** stick and pedals as recorded, for the control surfaces */
  readonly controls = createControlState();
  private readonly frame: ReplayFrame = createFrame();
  private from = 0;
  private to = 0;
  private hold = 0;
  private xr = false;
  private airports: Airport[] = [];
  // desktop chase / free orbit
  private readonly smoothQuat = new THREE.Quaternion();
  private orbitYaw = 0.6;
  private orbitPitch = 0.25;
  private orbitDist = 18;
  private dragging = false;
  private savedFov = 70;
  private savedRigMode: CameraRig['mode'] = 'cockpit';
  // observer point (tower or a spot beside the flight path)
  private readonly spot = new THREE.Vector3();
  private spotName = '';
  // VR: where the head rig lived before
  private rigParent: THREE.Object3D | null = null;
  private readonly rigPos = new THREE.Vector3();
  private readonly rigQuat = new THREE.Quaternion();
  private readonly chaseYaw = new THREE.Quaternion();
  private readonly board: THREE.Mesh;
  private readonly boardCtx: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private boardText = '';
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(
    private readonly recorder: FlightRecorder,
    private readonly cam: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    /** pose the model and cockpit hang below */
    private readonly root: THREE.Object3D,
    private readonly rig: CameraRig,
    private readonly height: Height,
    dom: HTMLElement,
  ) {
    dom.addEventListener('pointerdown', () => (this.dragging = true));
    window.addEventListener('pointerup', () => (this.dragging = false));
    dom.addEventListener('pointermove', (e) => {
      if (!this.active || !this.dragging || this.camera !== 'free') return;
      this.orbitYaw -= e.movementX * 0.005;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.005, -0.3, 1.4);
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.active && this.camera === 'free') this.orbitDist = THREE.MathUtils.clamp(this.orbitDist * Math.exp(e.deltaY * 0.001), 6, 400);
      },
      { passive: true },
    );

    // VR caption: one small canvas quad carried with the head rig
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 160;
    this.boardCtx = canvas.getContext('2d')!;
    this.boardTex = new THREE.CanvasTexture(canvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.1),
      new THREE.MeshBasicMaterial({ map: this.boardTex, transparent: true, depthTest: false, toneMapped: false }),
    );
    this.board.renderOrder = 15;
    this.board.visible = false;
  }

  /** Anything worth playing back? */
  get available(): boolean {
    return this.recorder.duration > 2;
  }

  /** holding on the last frame (after a crash nothing moves any more) */
  get atEnd(): boolean {
    return this.time >= this.to;
  }

  get inCockpit(): boolean {
    return this.camera === 'cockpit';
  }

  get cameras(): ReplayCamera[] {
    return this.xr ? XR_CAMERAS : DESKTOP_CAMERAS;
  }

  start(type: AircraftType, airports: Airport[], xr: boolean): boolean {
    if (this.active || !this.available) return false;
    this.active = true;
    this.paused = false;
    this.speed = 1;
    this.xr = xr;
    this.airports = airports;
    this.ghost.setType(type);
    this.ghost.systems.reset(type, true);
    this.to = this.recorder.endTime;
    this.from = Math.max(this.recorder.startTime, this.to - LOOK_BACK);
    this.time = this.from;
    this.hold = 0;
    this.orbitDist = 14 * this.scale;
    if (!this.cameras.includes(this.camera)) this.camera = 'chase';
    this.savedFov = this.cam.fov;
    this.savedRigMode = this.rig.mode;
    this.rigParent = null;
    this.apply();
    this.smoothQuat.copy(this.root.quaternion);
    this.chaseYaw.copy(this.yawOnly(this.root.quaternion));
    this.placeSpot(true);
    this.useCamera();
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.restoreRig();
    this.board.removeFromParent();
    this.board.visible = false;
    this.rig.mode = this.savedRigMode;
    this.cam.fov = this.savedFov;
    this.cam.updateProjectionMatrix();
  }

  cycleCamera(): void {
    const list = this.cameras;
    this.camera = list[(list.indexOf(this.camera) + 1) % list.length];
    this.useCamera();
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  seek(seconds: number): void {
    this.time = THREE.MathUtils.clamp(this.time + seconds, this.recorder.startTime, this.to);
    this.hold = 0;
    if (seconds < 0) this.from = Math.min(this.from, this.time);
  }

  changeSpeed(dir: number): void {
    const i = SPEEDS.indexOf(this.speed);
    this.speed = SPEEDS[THREE.MathUtils.clamp(i + dir, 0, SPEEDS.length - 1)];
  }

  /** Display line: time, camera, speed. */
  get caption(): string {
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const t = Math.max(0, this.time - this.from);
    const speed = this.speed === 1 ? '' : ` · ${String(this.speed).replace('.', ',')}×`;
    const cam = this.camera === 'tower' ? this.spotName : CAMERA_LABEL[this.camera];
    return `Wiederholung ${fmt(t)} / ${fmt(this.to - this.from)} · ${cam}${speed}${this.paused ? ' · Pause' : ''}`;
  }

  /** size factor for camera distances (an A320 needs more room than a Cub) */
  private get scale(): number {
    return Math.max(1, this.ghost.type.model.wing.span / 11);
  }

  private yawOnly(q: THREE.Quaternion): THREE.Quaternion {
    const fwd = this.v.set(0, 0, -1).applyQuaternion(q);
    return new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-fwd.x, -fwd.z));
  }

  /** Writes the recorded state at the current time into the model pose and the ghost aircraft. */
  private apply(): void {
    const f = this.recorder.sample(this.time, this.frame);
    this.root.position.copy(f.pos);
    this.root.quaternion.copy(f.quat);
    const c = this.controls;
    c.pitch = f.pitch;
    c.roll = f.roll;
    c.yaw = f.yaw;
    c.throttle = f.throttle;
    c.flaps = f.flaps;
    c.gear = f.gear > 0.5 ? 1 : 0;
    const g = this.ghost;
    g.pos.copy(f.pos);
    g.quat.copy(f.quat);
    g.vel.set(0, 0, -f.airspeed).applyQuaternion(f.quat);
    g.flaps = f.flaps;
    g.gear = f.gear;
    g.onGround = f.onGround;
    g.aero.airspeed = f.airspeed;
    g.aero.force.y = f.gLoad * g.type.mass * G;
    const e = g.engine;
    e.rpm = f.rpm;
    e.spool = f.spool;
    e.running = f.engineRunning;
    if ('reheat' in e) (e as { reheat: boolean }).reheat = f.reheat;
    const s = g.systems;
    s.battery = (f.lights & LIGHT.power) !== 0;
    s.nav = (f.lights & LIGHT.nav) !== 0;
    s.strobe = (f.lights & LIGHT.strobe) !== 0;
    s.beacon = (f.lights & LIGHT.beacon) !== 0;
    s.landing = (f.lights & LIGHT.landing) !== 0;
  }

  /**
   * Observer point: the tower of an airport close to the aircraft, otherwise a spot on the
   * ground beside the flight path a few hundred metres ahead. Re-chosen when the aircraft is far.
   */
  private placeSpot(force: boolean): void {
    const p = this.root.position;
    if (!force && this.spot.distanceTo(p) < 2500 * this.scale) return;
    let best: Airport | null = null;
    for (const a of this.airports) {
      const d = Math.hypot(a.center.x - p.x, a.center.z - p.z);
      if (d < 3000 && (!best || d < Math.hypot(best.center.x - p.x, best.center.z - p.z))) best = a;
    }
    if (best && force) {
      // beside the runway centre, towards the side the aircraft is on
      const side = (p.x - best.center.x) * best.r.x + (p.z - best.center.z) * best.r.z >= 0 ? 1 : -1;
      this.spot.copy(best.center).addScaledVector(best.r, side * (best.width * 2 + 90));
      this.spot.y = Math.max(best.center.y, this.height(this.spot.x, this.spot.z)) + 18;
      this.spotName = `Turm ${best.name}`;
    } else {
      // ahead along the track, off to one side
      const fwd = this.v.set(0, 0, -1).applyQuaternion(this.root.quaternion).setY(0).normalize();
      const side = this.w.set(-fwd.z, 0, fwd.x);
      this.spot
        .copy(p)
        .addScaledVector(fwd, 500 * this.scale)
        .addScaledVector(side, 160 * this.scale);
      this.spot.y = Math.max(0, this.height(this.spot.x, this.spot.z)) + 6;
      this.spotName = 'Beobachter';
    }
  }

  private useCamera(): void {
    if (this.xr) {
      if (this.camera === 'cockpit') this.restoreRig();
      else this.liftRig();
      this.placeRig();
    } else if (this.camera === 'cockpit') this.rig.mode = 'cockpit';
    if (this.camera !== 'tower') {
      this.cam.fov = this.savedFov;
      this.cam.updateProjectionMatrix();
    }
  }

  // ---- VR rig handling --------------------------------------------------------

  private liftRig(): void {
    const xrRig = this.rig.xrRig;
    if (this.rigParent) return;
    this.rigParent = xrRig.parent;
    this.rigPos.copy(xrRig.position);
    this.rigQuat.copy(xrRig.quaternion);
    this.scene.add(xrRig);
  }

  private restoreRig(): void {
    const xrRig = this.rig.xrRig;
    if (this.rigParent) {
      this.rigParent.add(xrRig);
      xrRig.position.copy(this.rigPos);
      xrRig.quaternion.copy(this.rigQuat);
      this.rigParent = null;
    }
  }

  /** Puts the rig so the head is at the camera point, facing the aircraft. */
  private placeRig(): void {
    const xrRig = this.rig.xrRig;
    if (this.xr) {
      xrRig.add(this.board);
      this.board.visible = true;
      // caption below the line of sight, wherever the head sits in the rig
      this.board.position.copy(this.cam.position).add(this.v.set(0, -0.32, -0.9));
      this.board.rotation.set(-0.3, 0, 0);
    }
    if (this.camera === 'cockpit') return;
    const target = this.root.position;
    const eye = this.camera === 'tower' ? this.spot : this.chasePoint(this.w);
    const yaw = this.camera === 'tower' ? Math.atan2(-(target.x - eye.x), -(target.z - eye.z)) : this.yawAngle(this.chaseYaw);
    xrRig.quaternion.setFromAxisAngle(Y, yaw);
    // head offset inside the rig (yaw only), so the eyes and not the floor land on the point
    const head = this.v.copy(this.cam.position).applyQuaternion(xrRig.quaternion);
    xrRig.position.copy(eye).sub(head);
  }

  private yawAngle(q: THREE.Quaternion): number {
    const fwd = this.v.set(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-fwd.x, -fwd.z);
  }

  private chasePoint(out: THREE.Vector3): THREE.Vector3 {
    const s = this.scale;
    out.set(0, 3 * s, 14 * s).applyQuaternion(this.chaseYaw).add(this.root.position);
    out.y = Math.max(out.y, this.height(out.x, out.z) + 1.5);
    return out;
  }

  // ---- per frame ----------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    if (!this.paused) {
      this.time += dt * this.speed;
      if (this.time >= this.to) {
        this.time = this.to;
        // linger on the end, then start over
        this.hold += dt;
        if (this.hold > 2.5) {
          this.time = this.from;
          this.hold = 0;
          this.placeSpot(true);
        }
      }
    }
    this.apply();
    this.placeSpot(false);
    const target = this.root.position;

    if (this.xr) {
      if (this.camera === 'chase') {
        this.chaseYaw.slerp(this.yawOnly(this.root.quaternion), 1 - Math.exp(-dt * 1.5));
        this.placeRig();
      } else if (this.camera === 'tower' && this.rigParent) {
        // the observer only moves when it had to re-choose its spot
        const head = this.v.copy(this.cam.position).applyQuaternion(this.rig.xrRig.quaternion);
        if (this.w.copy(this.rig.xrRig.position).add(head).distanceTo(this.spot) > 1) this.placeRig();
      }
      this.drawBoard(this.caption);
      return;
    }

    const c = this.cam;
    switch (this.camera) {
      case 'cockpit':
        this.rig.update(dt);
        return;
      case 'chase': {
        this.smoothQuat.slerp(this.root.quaternion, 1 - Math.exp(-dt * 3));
        const s = this.scale;
        c.position.set(0, 2.8 * s, 13 * s).applyQuaternion(this.smoothQuat).add(target);
        c.position.y = Math.max(c.position.y, this.height(c.position.x, c.position.z) + 1.5);
        c.up.set(0, 1, 0).applyQuaternion(this.smoothQuat);
        c.lookAt(this.v.set(0, 1.2 * s, 0).applyQuaternion(this.smoothQuat).add(target));
        return;
      }
      case 'free': {
        const cp = Math.cos(this.orbitPitch);
        c.position.set(Math.sin(this.orbitYaw) * cp, Math.sin(this.orbitPitch), Math.cos(this.orbitYaw) * cp).multiplyScalar(this.orbitDist).add(target);
        c.position.y = Math.max(c.position.y, this.height(c.position.x, c.position.z) + 1.5);
        c.up.set(0, 1, 0);
        c.lookAt(target);
        return;
      }
      case 'tower': {
        c.position.copy(this.spot);
        c.up.set(0, 1, 0);
        c.lookAt(target);
        // zoom so the aircraft stays a sensible size in the picture
        const dist = Math.max(1, this.spot.distanceTo(target));
        const fov = THREE.MathUtils.clamp((2 * Math.atan((this.ghost.type.model.wing.span * 2.5) / dist) * 180) / Math.PI, 8, this.savedFov);
        c.fov += (fov - c.fov) * Math.min(1, dt * 4);
        c.updateProjectionMatrix();
      }
    }
  }

  private drawBoard(text: string): void {
    if (text === this.boardText) return;
    this.boardText = text;
    const ctx = this.boardCtx;
    ctx.clearRect(0, 0, 1024, 160);
    ctx.fillStyle = 'rgba(10,16,24,0.78)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 1012, 148, 24);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`▶ ${text}`, 512, 56);
    ctx.font = '30px sans-serif';
    ctx.fillStyle = '#cfd8e0';
    ctx.fillText('A: Kamera · B: Ende · Stick-Klick: Menü', 512, 116);
    this.boardTex.needsUpdate = true;
  }
}
