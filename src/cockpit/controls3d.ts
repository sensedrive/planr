import * as THREE from 'three';
import { clamp, type ControlState, FLAP_STEPS, stepFlaps } from '../core/input';
import type { CockpitLayout } from './layout';

export type HandleId = 'stick' | 'throttle' | 'flaps' | 'gear' | 'trimPitch' | 'trimRoll' | 'trimYaw';

/** Something in the cockpit the pilot can grab (VR) or click (desktop). */
export interface Handle {
  id: HandleId;
  label: string;
  /** current grip point in aircraft coordinates */
  grip(c: ControlState, out: THREE.Vector3): THREE.Vector3;
  /** meshes for mouse picking */
  hit: THREE.Object3D;
  glow: THREE.Mesh;
  /** VR: hand target (aircraft coords), its movement since the grab and the controls at grab time */
  drag(c: ControlState, target: THREE.Vector3, delta: THREE.Vector3, start: ControlState): void;
  /** desktop click: +1 = left button, -1 = right button */
  click?(c: ControlState, dir: 1 | -1): void;
}

/** Push buttons for VR without controllers (tapped with the index finger) and for desktop clicks. */
export interface CockpitButton {
  id: 'menu' | 'recenter';
  mesh: THREE.Mesh;
  /** aircraft coordinates */
  centre: THREE.Vector3;
}

function buttonTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1d2024';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#6a7380';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 60);
  ctx.fillStyle = '#e8eef4';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** hand travel (m) for full stick deflection; adjustable in the menu */
export const stickConfig = { travel: 0.13 };

const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d1d1f });
const gripMat = new THREE.MeshLambertMaterial({ color: 0x2a2724 });
const redMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
const knobMat = new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x111111 });
const flapKnobMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8, emissive: 0x333333 });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const highlightMat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35, depthWrite: false });

function glowSphere(r = 0.06): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), highlightMat);
  m.visible = false;
  return m;
}

/** Stick, throttle, flap and gear levers, trim wheels and rudder pedals for one cockpit layout. */
export class Controls3D {
  readonly group = new THREE.Group();
  readonly handles: Handle[] = [];
  readonly buttons: CockpitButton[] = [];
  private readonly stick = new THREE.Group();
  private readonly lever = new THREE.Group();
  private readonly flapLever = new THREE.Group();
  private readonly gearKnob = new THREE.Group();
  private readonly gearLampMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  private readonly trimWheel = new THREE.Group();
  private readonly trimRollKnob = new THREE.Group();
  private readonly trimYawKnob = new THREE.Group();
  private readonly pedalL: THREE.Mesh;
  private readonly pedalR: THREE.Mesh;
  private readonly stickAngle: number;
  private readonly neutralHead: THREE.Vector3;

  constructor(private readonly L: CockpitLayout) {
    const g = this.group;
    this.stickAngle = Math.atan(0.13 / L.stickLength);

    // --- stick
    this.stick.position.copy(L.stickPivot);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, L.stickLength, 8).translate(0, L.stickLength / 2, 0), darkMat);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.12, 10).translate(0, L.stickLength + 0.02, 0), gripMat);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).translate(0, L.stickLength + 0.085, -0.008), redMat);
    const stickGlow = glowSphere();
    stickGlow.position.y = L.stickLength + 0.03;
    this.stick.add(shaft, grip, button, stickGlow);
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10).translate(0, 0.06, 0), darkMat);
    boot.position.copy(L.stickPivot);
    g.add(this.stick, boot);
    this.neutralHead = this.stickHead(0, 0, new THREE.Vector3());
    this.handles.push({
      id: 'stick',
      label: 'Steuerknüppel',
      hit: grip,
      glow: stickGlow,
      grip: (c, out) => this.stickHead(c.pitch, c.roll, out),
      drag: (c, target) => {
        c.pitch = clamp((target.z - this.neutralHead.z) / stickConfig.travel);
        c.roll = clamp((target.x - this.neutralHead.x) / stickConfig.travel);
      },
    });

    // --- throttle on the left console
    this.lever.position.copy(L.throttlePivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, L.throttleLength, 0.02).translate(0, L.throttleLength / 2, 0), darkMat);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.07).translate(0, L.throttleLength + 0.01, 0), knobMat);
    const thrGlow = glowSphere();
    thrGlow.position.y = L.throttleLength + 0.01;
    this.lever.add(arm, knob, thrGlow);
    const quadrant = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.32), darkMat);
    quadrant.position.copy(L.throttlePivot).add(new THREE.Vector3(0, -0.03, 0));
    g.add(this.lever, quadrant);
    this.handles.push({
      id: 'throttle',
      label: 'Gashebel',
      hit: knob,
      glow: thrGlow,
      grip: (c, out) => this.leverHead(L.throttlePivot, L.throttleLength, this.throttleAngle(c.throttle), out),
      drag: (c, target) => {
        c.throttle = this.leverFraction(L.throttlePivot, L.throttleLength, L.throttleMaxAngle, target.z);
      },
      click: (c, dir) => {
        c.throttle = clamp(c.throttle + dir * 0.1, 0, 1);
      },
    });

    // --- flap lever (detents), behind the throttle
    this.flapLever.position.copy(L.flapPivot);
    const farm = new THREE.Mesh(new THREE.BoxGeometry(0.015, L.flapLength, 0.015).translate(0, L.flapLength / 2, 0), darkMat);
    const fknob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04).translate(0, L.flapLength, 0), flapKnobMat);
    const flapGlow = glowSphere(0.05);
    flapGlow.position.y = L.flapLength;
    this.flapLever.add(farm, fknob, flapGlow);
    const fslot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.2), darkMat);
    fslot.position.copy(L.flapPivot).add(new THREE.Vector3(0, -0.02, 0));
    g.add(this.flapLever, fslot);
    this.handles.push({
      id: 'flaps',
      label: 'Klappenhebel',
      hit: fknob,
      glow: flapGlow,
      grip: (c, out) => this.leverHead(L.flapPivot, L.flapLength, this.flapAngle(c.flaps), out),
      drag: (c, target) => {
        // forward = flaps up, back = flaps down (like pulling the lever)
        const f = 1 - this.leverFraction(L.flapPivot, L.flapLength, L.flapMaxAngle, target.z);
        c.flaps = Math.round(f * FLAP_STEPS) / FLAP_STEPS;
      },
      click: (c, dir) => stepFlaps(c, dir),
    });

    // --- gear lever with wheel-shaped knob and indicator lamp
    if (L.gearLever) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.03), darkMat);
      base.position.copy(L.gearLever);
      this.gearKnob.position.copy(L.gearLever).add(new THREE.Vector3(0, 0, 0.05));
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14).rotateZ(Math.PI / 2), flapKnobMat);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.05).translate(0, 0, -0.025), darkMat);
      const gearGlow = glowSphere(0.05);
      this.gearKnob.add(wheel, stem, gearGlow);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), this.gearLampMat);
      lamp.position.copy(L.gearLever).add(new THREE.Vector3(0.05, 0.06, 0.017));
      g.add(base, this.gearKnob, lamp);
      const top = L.gearLever.y + 0.05;
      const bottom = L.gearLever.y - 0.05;
      this.handles.push({
        id: 'gear',
        label: 'Fahrwerkshebel',
        hit: wheel,
        glow: gearGlow,
        grip: (c, out) => out.set(L.gearLever!.x, c.gear >= 0.5 ? bottom : top, L.gearLever!.z + 0.05),
        drag: (c, target) => {
          if (target.y > top - 0.02) c.gear = 0;
          else if (target.y < bottom + 0.02) c.gear = 1;
        },
        click: (c) => {
          c.gear = c.gear >= 0.5 ? 0 : 1;
        },
      });
    }

    // --- trim: elevator wheel and aileron/rudder knobs on the right console
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.5), darkMat);
    console.position.copy(L.trimWheel).add(new THREE.Vector3(0, -0.05, 0.15));
    g.add(console);
    this.trimWheel.position.copy(L.trimWheel);
    const wheelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 20).rotateZ(Math.PI / 2), trimMat);
    const wheelMark = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.012, 0.03).translate(0, 0.055, 0), markMat);
    this.trimWheel.add(wheelMesh, wheelMark);
    const wheelGlow = glowSphere(0.07);
    wheelGlow.position.copy(L.trimWheel);
    g.add(this.trimWheel, wheelGlow);
    this.handles.push({
      id: 'trimPitch',
      label: 'Höhenrudertrimmung',
      hit: wheelMesh,
      glow: wheelGlow,
      grip: (_c, out) => out.copy(L.trimWheel),
      drag: (c, _t, delta, start) => {
        c.trim = clamp(start.trim + delta.z * 6);
      },
      click: (c, dir) => {
        c.trim = clamp(c.trim + dir * 0.1);
      },
    });

    const knob3 = (group: THREE.Group, pos: THREE.Vector3, id: 'trimRoll' | 'trimYaw', label: string, key: 'trimRoll' | 'trimYaw') => {
      group.position.copy(pos);
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.03, 16), trimMat);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.032, 0.022).translate(0, 0, -0.012), markMat);
      group.add(k, mark);
      const glow = glowSphere(0.045);
      glow.position.copy(pos);
      g.add(group, glow);
      this.handles.push({
        id,
        label,
        hit: k,
        glow,
        grip: (_c, out) => out.copy(pos),
        drag: (c, _t, delta, start) => {
          c[key] = clamp(start[key] + delta.x * 6);
        },
        click: (c, dir) => {
          c[key] = clamp(c[key] + dir * 0.1);
        },
      });
    };
    knob3(this.trimRollKnob, L.trimRollKnob, 'trimRoll', 'Querrudertrimmung', 'trimRoll');
    knob3(this.trimYawKnob, L.trimYawKnob, 'trimYaw', 'Seitenrudertrimmung', 'trimYaw');

    // --- push buttons above the six-pack: menu and recenter (for hand tracking)
    (['menu', 'recenter'] as const).forEach((id, i) => {
      const centre = new THREE.Vector3(L.eye.x - 0.26 + i * 0.09, L.eye.y - 0.272, L.front + 0.012);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.035, 0.02),
        [darkMat, darkMat, darkMat, darkMat, new THREE.MeshBasicMaterial({ map: buttonTexture(id === 'menu' ? 'MENÜ' : 'ZENTR.'), toneMapped: false }), darkMat],
      );
      mesh.position.copy(centre);
      g.add(mesh);
      this.buttons.push({ id, mesh, centre });
    });

    // --- rudder pedals
    const pedalGeo = new THREE.BoxGeometry(0.09, 0.14, 0.03);
    this.pedalL = new THREE.Mesh(pedalGeo, darkMat);
    this.pedalR = new THREE.Mesh(pedalGeo, darkMat);
    for (const [p, s] of [
      [this.pedalL, -1],
      [this.pedalR, 1],
    ] as const) {
      p.position.copy(L.pedals).add(new THREE.Vector3(s * 0.13, 0, 0));
      p.rotation.x = -0.4;
      g.add(p);
    }
  }

  stickHead(pitch: number, roll: number, out: THREE.Vector3): THREE.Vector3 {
    return out
      .set(0, this.L.stickLength + 0.03, 0)
      .applyEuler(new THREE.Euler(clamp(pitch) * this.stickAngle, 0, -clamp(roll) * this.stickAngle))
      .add(this.L.stickPivot);
  }

  private throttleAngle(throttle: number): number {
    return this.L.throttleMaxAngle - clamp(throttle, 0, 1) * 2 * this.L.throttleMaxAngle;
  }

  private flapAngle(flaps: number): number {
    return -this.L.flapMaxAngle + clamp(flaps, 0, 1) * 2 * this.L.flapMaxAngle;
  }

  private leverHead(pivot: THREE.Vector3, length: number, angle: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, Math.cos(angle) * length, Math.sin(angle) * length).add(pivot);
  }

  /** Lever position 0 (back) … 1 (forward) from a hand z coordinate. */
  private leverFraction(pivot: THREE.Vector3, length: number, maxAngle: number, z: number): number {
    const a = Math.asin(clamp((z - pivot.z) / length));
    return clamp((maxAngle - a) / (2 * maxAngle), 0, 1);
  }

  update(c: ControlState, gearPosition: number): void {
    const L = this.L;
    this.stick.rotation.set(clamp(c.pitch) * this.stickAngle, 0, -clamp(c.roll) * this.stickAngle);
    this.lever.rotation.x = this.throttleAngle(c.throttle);
    this.flapLever.rotation.x = this.flapAngle(c.flaps);
    if (L.gearLever) {
      this.gearKnob.position.y = L.gearLever.y + (c.gear >= 0.5 ? -0.05 : 0.05);
      this.gearLampMat.color.set(gearPosition > 0.98 ? 0x29d14a : gearPosition > 0.02 ? 0xff3322 : 0x222222);
    }
    this.trimWheel.rotation.x = c.trim * 3;
    this.trimRollKnob.rotation.y = -c.trimRoll * 2;
    this.trimYawKnob.rotation.y = -c.trimYaw * 2;
    this.pedalL.position.z = L.pedals.z + clamp(c.yaw) * 0.06;
    this.pedalR.position.z = L.pedals.z - clamp(c.yaw) * 0.06;
  }
}
