import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { Controls3D, Handle } from '../cockpit/controls3d';
import { type Actions, clamp, type ControlState, createControlState, deadzone, stepFlaps } from '../core/input';

interface Hand {
  grip: THREE.Group;
  source: XRInputSource | null;
  handle: Handle | null;
  /** grabbed handle position minus hand position at grab time (aircraft coords) */
  offset: THREE.Vector3;
  /** hand target at grab time */
  startTarget: THREE.Vector3;
  /** controls at grab time */
  start: ControlState;
  prev: boolean[];
}

const GRAB_RADIUS = 0.11;
const tmpHand = new THREE.Vector3();
const tmpGrip = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

/**
 * VR cockpit controls: squeeze near a handle (stick, throttle, flap/gear lever, trim wheels) to grab it,
 * then move the hand. Left thumbstick X = rudder, Y = seat height; left trigger = brakes; X = recenter;
 * Y = flaps up; B = flaps down; right thumbstick Y = elevator trim; A = restart; thumbstick click = menu.
 */
export class XRCockpitInput {
  /** false while the menu is open: no grabbing, controller buttons only toggle the menu */
  enabled = true;
  private readonly hands: Hand[] = [];
  private stallPulse = 0;
  private controls: ControlState = createControlState();

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly rig: THREE.Group,
    private visuals: Controls3D,
    private readonly actions: Actions,
  ) {
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      rig.add(grip);
      const hand: Hand = {
        grip,
        source: null,
        handle: null,
        offset: new THREE.Vector3(),
        startTarget: new THREE.Vector3(),
        start: createControlState(),
        prev: [],
      };
      grip.addEventListener('connected', (e) => {
        hand.source = (e as unknown as { data: XRInputSource }).data;
      });
      grip.addEventListener('disconnected', () => {
        hand.source = null;
        hand.handle = null;
      });
      grip.addEventListener('squeezestart', () => this.tryGrab(hand));
      grip.addEventListener('squeezeend', () => {
        hand.handle = null;
      });
      this.hands.push(hand);
    }
  }

  /** Switches to another cockpit (aircraft type). */
  setVisuals(visuals: Controls3D): void {
    this.release();
    this.visuals = visuals;
  }

  private handPosition(hand: Hand, out: THREE.Vector3): THREE.Vector3 {
    this.rig.updateMatrix();
    return out.copy(hand.grip.position).applyMatrix4(this.rig.matrix);
  }

  private nearest(p: THREE.Vector3, exclude: Hand | null): Handle | null {
    let best: Handle | null = null;
    let bestD = GRAB_RADIUS;
    for (const h of this.visuals.handles) {
      if (this.hands.some((o) => o !== exclude && o.handle === h)) continue;
      const d = p.distanceTo(h.grip(this.controls, tmpGrip));
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  private tryGrab(hand: Hand): void {
    if (!this.enabled) return;
    const p = this.handPosition(hand, tmpHand);
    const handle = this.nearest(p, hand);
    if (!handle) return;
    hand.handle = handle;
    hand.offset.copy(handle.grip(this.controls, tmpGrip)).sub(p);
    hand.startTarget.copy(p).add(hand.offset);
    Object.assign(hand.start, this.controls);
    this.pulse(hand, 0.5, 40);
  }

  private pulse(hand: Hand, intensity: number, ms: number): void {
    const act = hand.source?.gamepad?.hapticActuators?.[0] as { pulse?: (i: number, d: number) => Promise<boolean> } | undefined;
    act?.pulse?.(intensity, ms);
  }

  get anyGrab(): boolean {
    return this.hands.some((h) => h.handle !== null);
  }

  update(dt: number, c: ControlState, stall: boolean): void {
    this.controls = c;
    let stickHeld = false;
    for (const hand of this.hands) {
      if (!hand.handle) continue;
      const target = this.handPosition(hand, tmpHand).add(hand.offset);
      tmpDelta.copy(target).sub(hand.startTarget);
      const before = c.flaps + c.gear;
      hand.handle.drag(c, target, tmpDelta, hand.start);
      if (c.flaps + c.gear !== before) this.pulse(hand, 0.6, 30); // detent click
      if (hand.handle.id === 'stick') stickHeld = true;
    }
    if (!stickHeld) {
      // the stick springs back to centre
      const k = Math.min(1, dt * 8);
      c.pitch -= c.pitch * k;
      c.roll -= c.roll * k;
    }
    c.yaw = 0;

    for (const hand of this.hands) {
      const gp = hand.source?.gamepad;
      if (!gp) continue;
      const pressed = gp.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] && !hand.prev[i];
      const sx = deadzone(gp.axes[2] ?? 0, 0.15);
      const sy = deadzone(gp.axes[3] ?? 0, 0.15);
      if (edge(3)) this.actions.toggleMenu();
      if (!this.enabled) {
        hand.prev = pressed;
        continue;
      }
      if (hand.source?.handedness === 'left') {
        c.yaw = sx;
        if (Math.abs(sy) > 0.5) this.actions.adjustSeat(-Math.sign(sy) * 0.08 * dt);
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
      for (const hand of this.hands) if (hand.handle?.id === 'stick') this.pulse(hand, 0.35, 60);
    }

    // highlight what a free hand could grab
    for (const h of this.visuals.handles) h.glow.visible = false;
    if (!this.enabled) return;
    for (const hand of this.hands) {
      if (!hand.source || hand.handle) continue;
      const near = this.nearest(this.handPosition(hand, tmpHand), hand);
      if (near) near.glow.visible = true;
    }
  }

  release(): void {
    for (const h of this.hands) h.handle = null;
    for (const h of this.visuals.handles) h.glow.visible = false;
  }
}
