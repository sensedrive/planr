import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { type Actions, clamp, type ControlState, deadzone, stepFlaps } from '../core/input';
import { STICK, stickHead, throttleFromZ, throttleHead } from '../cockpit/stick';
import type { Controls3D } from '../cockpit/stick';

type Grab = 'stick' | 'throttle' | null;

interface Hand {
  grip: THREE.Group;
  source: XRInputSource | null;
  grab: Grab;
  /** grabbed handle position minus hand position at grab time (aircraft coords) */
  offset: THREE.Vector3;
  prev: boolean[];
}

const GRAB_RADIUS = 0.13;
const tmpHand = new THREE.Vector3();
const tmpHead = new THREE.Vector3();
const neutralHead = stickHead(0, 0, new THREE.Vector3());

/**
 * VR cockpit controls: squeeze near the stick or throttle to grab it, then move the hand.
 * Left thumbstick X = rudder, left trigger = brakes, X = recenter, Y = flaps up,
 * B = flaps down, right thumbstick Y = trim, A = restart.
 */
export class XRCockpitInput {
  private readonly hands: Hand[] = [];
  private pitch = 0;
  private roll = 0;
  private stallPulse = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly rig: THREE.Group,
    private readonly visuals: Controls3D,
    private readonly actions: Actions,
  ) {
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      rig.add(grip);
      const hand: Hand = { grip, source: null, grab: null, offset: new THREE.Vector3(), prev: [] };
      grip.addEventListener('connected', (e) => {
        hand.source = (e as unknown as { data: XRInputSource }).data;
      });
      grip.addEventListener('disconnected', () => {
        hand.source = null;
        hand.grab = null;
      });
      grip.addEventListener('squeezestart', () => this.tryGrab(hand));
      grip.addEventListener('squeezeend', () => {
        hand.grab = null;
      });
      this.hands.push(hand);
    }
  }

  /** Current throttle is needed to locate its knob when grabbing. */
  private throttle = 0;

  private handPosition(hand: Hand, out: THREE.Vector3): THREE.Vector3 {
    this.rig.updateMatrix();
    return out.copy(hand.grip.position).applyMatrix4(this.rig.matrix);
  }

  private tryGrab(hand: Hand): void {
    const p = this.handPosition(hand, tmpHand);
    const stick = stickHead(this.pitch, this.roll, new THREE.Vector3());
    const thr = throttleHead(this.throttle, new THREE.Vector3());
    const ds = this.hands.some((h) => h !== hand && h.grab === 'stick') ? Infinity : p.distanceTo(stick);
    const dt = this.hands.some((h) => h !== hand && h.grab === 'throttle') ? Infinity : p.distanceTo(thr);
    if (Math.min(ds, dt) > GRAB_RADIUS) return;
    hand.grab = ds <= dt ? 'stick' : 'throttle';
    hand.offset.copy(hand.grab === 'stick' ? stick : thr).sub(p);
    this.pulse(hand, 0.5, 40);
  }

  private pulse(hand: Hand, intensity: number, ms: number): void {
    const act = hand.source?.gamepad?.hapticActuators?.[0] as { pulse?: (i: number, d: number) => Promise<boolean> } | undefined;
    act?.pulse?.(intensity, ms);
  }

  get anyGrab(): boolean {
    return this.hands.some((h) => h.grab !== null);
  }

  update(dt: number, c: ControlState, stall: boolean): void {
    this.throttle = c.throttle;
    let stickHeld = false;
    for (const hand of this.hands) {
      if (!hand.grab) continue;
      const target = this.handPosition(hand, tmpHand).add(hand.offset);
      if (hand.grab === 'stick') {
        stickHeld = true;
        tmpHead.copy(target).sub(neutralHead);
        this.pitch = clamp(deadzone(tmpHead.z / STICK.travel, 0.04));
        this.roll = clamp(deadzone(tmpHead.x / STICK.travel, 0.04));
      } else {
        c.throttle = throttleFromZ(target.z);
      }
    }
    if (!stickHeld) {
      // spring back to centre
      const k = Math.min(1, dt * 8);
      this.pitch -= this.pitch * k;
      this.roll -= this.roll * k;
    }
    c.pitch = this.pitch;
    c.roll = this.roll;
    c.yaw = 0;

    for (const hand of this.hands) {
      const gp = hand.source?.gamepad;
      if (!gp) continue;
      const pressed = gp.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] && !hand.prev[i];
      const sx = deadzone(gp.axes[2] ?? 0, 0.15);
      const sy = deadzone(gp.axes[3] ?? 0, 0.15);
      if (hand.source?.handedness === 'left') {
        c.yaw = sx;
        c.brake = Math.max(c.brake, gp.buttons[0]?.value ?? 0);
        if (edge(4)) this.actions.recenter();
        if (edge(5)) stepFlaps(c, -1);
      } else {
        c.trim = clamp(c.trim + sy * 0.35 * dt);
        if (edge(4)) this.actions.reset(false);
        if (edge(5)) stepFlaps(c, 1);
      }
      hand.prev = pressed;
    }

    // stall buffet on the stick hand
    this.stallPulse -= dt;
    if (stall && this.stallPulse <= 0) {
      this.stallPulse = 0.12;
      for (const hand of this.hands) if (hand.grab === 'stick') this.pulse(hand, 0.35, 60);
    }

    // highlight handles a free hand could grab
    let nearStick = false;
    let nearThr = false;
    const stick = stickHead(this.pitch, this.roll, new THREE.Vector3());
    const thr = throttleHead(c.throttle, new THREE.Vector3());
    for (const hand of this.hands) {
      if (!hand.source || hand.grab) continue;
      const p = this.handPosition(hand, tmpHand);
      if (p.distanceTo(stick) < GRAB_RADIUS) nearStick = true;
      if (p.distanceTo(thr) < GRAB_RADIUS) nearThr = true;
    }
    this.visuals.stickGlow.visible = nearStick;
    this.visuals.throttleGlow.visible = nearThr;
  }

  release(): void {
    for (const h of this.hands) h.grab = null;
    this.visuals.stickGlow.visible = false;
    this.visuals.throttleGlow.visible = false;
  }
}
