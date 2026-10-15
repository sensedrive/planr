import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { aileron, elevator, rudder } from '../sim/aero';
import type { Aircraft } from '../sim/aircraft';
import type { JetEngine } from '../sim/engine';
import type { AircraftType, GearSpec, ModelSpec } from '../sim/types';
import { mergeChildMeshes } from './merge';

/** What the main loop needs from an exterior model. */
export interface AircraftVisual {
  readonly root: THREE.Group;
  /** parts hidden while sitting in the cockpit */
  readonly fuselage: THREE.Group;
  update(dt: number, c: ControlState, ac: Aircraft): void;
}

const DEG = Math.PI / 180;
const dark = new THREE.MeshLambertMaterial({ color: 0x2b2c2f });
const glass = new THREE.MeshLambertMaterial({ color: 0x1d2c3a });
const bubble = new THREE.MeshPhongMaterial({ color: 0x2a3c50, transparent: true, opacity: 0.5, shininess: 120, specular: 0xffffff });
const discMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide });
const intakeMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0d });

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Trapezoid panel from x0 to x1 (span direction +X), leading edge sweeps aft; extruded in Y. */
function panel(x0: number, x1: number, le0: number, le1: number, c0: number, c1: number, thick: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(x0, le0);
  s.lineTo(x1, le1);
  s.lineTo(x1, le1 + c1);
  s.lineTo(x0, le0 + c0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y → +Z, extrusion → −Y
  g.translate(0, thick / 2, 0);
  return new THREE.Mesh(g, mat);
}

function hinge(w: number, h: number, chord: number, at: THREE.Vector3, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(at);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, chord), mat);
  m.position.z = chord / 2;
  g.add(m);
  return g;
}

/** Fuselage radius profile (fraction of r) along the body, by nose type. */
const PROFILES: Record<ModelSpec['nose'], [number, number][]> = {
  prop: [[0, 0.5], [0.04, 0.8], [0.12, 0.98], [0.42, 1], [0.7, 0.55], [1, 0.16]],
  jet: [[0, 0.02], [0.08, 0.35], [0.22, 0.78], [0.35, 1], [0.8, 0.85], [1, 0.55]],
  airliner: [[0, 0.05], [0.02, 0.55], [0.06, 0.88], [0.12, 1], [0.75, 1], [0.92, 0.55], [1, 0.12]],
  glider: [[0, 0.08], [0.06, 0.65], [0.18, 1], [0.32, 0.85], [0.6, 0.35], [1, 0.16]],
};

/** soft round glow for light sprites */
let glowTexture: THREE.Texture | null = null;
function glow(color: number, size: number): THREE.Sprite {
  if (!glowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
  );
  s.scale.setScalar(size);
  return s;
}

interface Lights {
  nav: THREE.Sprite[];
  strobe: THREE.Sprite[];
  beacon: THREE.Sprite[];
  landing: THREE.Sprite;
  cone: THREE.Mesh;
  spot: THREE.SpotLight;
}

interface Wing {
  inner: THREE.Group;
  outer: THREE.Group;
  side: number;
}

/** Low-poly exterior built from an AircraftType: flexing wings, moving surfaces, gear, props. */
export class GenericModel implements AircraftVisual {
  readonly root = new THREE.Group();
  readonly fuselage = new THREE.Group();
  private readonly wings: Wing[] = [];
  private readonly props: { group: THREE.Group; blades: THREE.Object3D; disc: THREE.Mesh; dir: number }[] = [];
  private readonly ailerons: { g: THREE.Group; side: number }[] = [];
  private readonly flaps: THREE.Group[] = [];
  private readonly elevators: THREE.Group[] = [];
  private readonly rudders: THREE.Group[] = [];
  private readonly legs: { pivot: THREE.Group; axis: 'x' | 'z'; up: number }[] = [];
  private flame: THREE.Mesh | null = null;
  // wing bending: angle and rate of a damped spring per side
  private flex = 0;
  private flexRate = 0;
  private rumble = 0;
  private propAngle = 0;
  private lights!: Lights;
  private lightTime = 0;

  constructor(private readonly type: AircraftType) {
    const m = type.model;
    const body = new THREE.MeshLambertMaterial({ color: m.body.color });
    const accent = new THREE.MeshLambertMaterial({ color: m.body.accent });
    const wingMat = new THREE.MeshLambertMaterial({ color: m.body.color, side: THREE.DoubleSide });
    const r = m.body.radius;
    const sq = m.body.squash ?? 1;
    const len = m.body.tailZ - m.body.noseZ;
    this.root.name = type.id;

    // ---- fuselage (lathe along Z)
    const pts = PROFILES[m.nose].map(([t, f]) => new THREE.Vector2(Math.max(0.01, f * r), m.body.noseZ + t * len));
    // LatheGeometry revolves around Y; rotating +90° about X maps that axis (our profile z) onto +Z
    const hull = new THREE.LatheGeometry(pts, 14).rotateX(Math.PI / 2);
    const hullMesh = new THREE.Mesh(hull, body);
    hullMesh.scale.y = sq;
    this.fuselage.add(hullMesh);
    // accent stripes along the sides
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, r * 0.18, len * 0.55), accent);
      stripe.position.set(s * r * 0.99, -r * 0.1, m.body.noseZ + len * 0.45);
      this.fuselage.add(stripe);
    }
    this.buildCanopy(m, r, sq);
    this.root.add(this.fuselage);

    // ---- wings
    const w = m.wing;
    const half = w.span / 2;
    const rootX = r * 0.85;
    const split = 0.45;
    for (const side of [-1, 1]) {
      const inner = new THREE.Group();
      inner.position.set(side * rootX, w.y, 0);
      inner.rotation.z = side * w.dihedral * DEG;
      const outer = new THREE.Group();
      const xs = (half - rootX) * split;
      const chordAt = (f: number) => w.root + (w.tip - w.root) * f;
      const leAt = (f: number) => w.z + w.sweep * f;
      const fMid = split;
      const p1 = panel(0, xs, leAt(0), leAt(fMid), chordAt(0), chordAt(fMid), w.thick, wingMat);
      const p2 = panel(0, half - rootX - xs, leAt(fMid), leAt(1), chordAt(fMid), chordAt(1), w.thick * 0.8, wingMat);
      if (side < 0) {
        p1.scale.x = -1;
        p2.scale.x = -1;
      }
      inner.add(p1);
      outer.position.set(side * xs, 0, 0);
      outer.add(p2);
      inner.add(outer);
      // flaps on the inner panel, ailerons on the outer one
      if (type.flapDegrees > 0 || type.glider) {
        const fl = hinge(xs * 0.8, w.thick * 0.6, chordAt(fMid) * 0.25, new THREE.Vector3((side * xs) / 2, 0, leAt(fMid * 0.5) + chordAt(fMid * 0.5) * 0.75), wingMat);
        inner.add(fl);
        this.flaps.push(fl);
      }
      const outerSpan = half - rootX - xs;
      const ai = hinge(outerSpan * 0.55, w.thick * 0.5, chordAt(0.8) * 0.25, new THREE.Vector3(side * outerSpan * 0.6, 0, leAt(0.8) + chordAt(0.8) * 0.75), wingMat);
      outer.add(ai);
      this.ailerons.push({ g: ai, side });
      if (w.tipTanks) {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.6, 4, 10).rotateX(Math.PI / 2), accent);
        tank.position.set(side * outerSpan, 0, leAt(1) + chordAt(1) / 2);
        outer.add(tank);
      }
      // wing-tip nav light housings (red left, green right)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a1a : 0x2aff4a }));
      tip.position.set(side * outerSpan, 0, leAt(1) + 0.1);
      tip.name = 'navlight';
      outer.add(tip);
      this.root.add(inner);
      this.wings.push({ inner, outer, side });
      if (m.struts) this.root.add(rod(new THREE.Vector3(side * r * 0.9, -r * sq * 0.6, w.z + w.root * 0.4), new THREE.Vector3(side * (rootX + xs * 1.4), w.y - 0.05, w.z + w.root * 0.4), 0.035, body));
    }

    // ---- tail
    const t = m.tail;
    const hY = t.type === 'T' ? t.vHeight + r * 0.3 - 0.04 : r * 0.25;
    // a T-tail sits on the swept-back top of the fin
    const hZ = t.type === 'T' ? t.z + t.vChord * 0.45 - t.hChord * 0.35 : t.z;
    for (const side of [-1, 1]) {
      const h = panel(0, t.hSpan / 2, 0, t.hChord * 0.35, t.hChord * 0.7, t.hChord * 0.45, 0.08, wingMat);
      if (side < 0) h.scale.x = -1;
      h.position.set(0, hY, hZ);
      this.root.add(h);
    }
    const el = hinge(t.hSpan * 0.95, 0.06, t.hChord * 0.3, new THREE.Vector3(0, hY, hZ + t.hChord * 0.7), wingMat);
    this.root.add(el);
    this.elevators.push(el);
    const finShape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(t.vChord * 0.55, t.vHeight),
      new THREE.Vector2(t.vChord * 0.95, t.vHeight),
      new THREE.Vector2(t.vChord * 0.75, 0),
    ]);
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false }).rotateY(-Math.PI / 2), accent);
    fin.position.set(0.05, r * 0.3, t.z - t.vChord * 0.2);
    this.root.add(fin);
    const rd = hinge(0.07, t.vHeight * 0.8, t.vChord * 0.3, new THREE.Vector3(0, r * 0.3 + t.vHeight * 0.45, t.z + t.vChord * 0.55), accent);
    this.root.add(rd);
    this.rudders.push(rd);

    this.buildEngines(m, body, accent, r);
    this.buildGear(type.gear, body, r, sq);

    mergeChildMeshes(this.fuselage);
    mergeChildMeshes(this.root);
    this.buildLights(m, r, sq);
  }

  /** Nav lights and strobes on the wing tips, beacon on the fin, landing light in the left wing. */
  private buildLights(m: ModelSpec, r: number, sq: number): void {
    const nav: THREE.Sprite[] = [];
    const strobe: THREE.Sprite[] = [];
    this.root.traverse((o) => {
      if (o.name !== 'navlight' || !o.parent) return;
      const left = o.position.x < 0;
      const n = glow(left ? 0xff3020 : 0x30ff60, 0.9);
      n.position.copy(o.position);
      const s = glow(0xffffff, 3.2);
      s.position.copy(o.position);
      o.parent.add(n, s);
      nav.push(n);
      strobe.push(s);
    });
    const finTop = new THREE.Vector3(0, r * 0.3 + m.tail.vHeight * 0.98, m.tail.z + m.tail.vChord * 0.6);
    const top = glow(0xff2a10, 1.4);
    top.position.copy(finTop);
    const belly = glow(0xff2a10, 1.2);
    belly.position.set(0, -r * sq - 0.05, (m.body.noseZ + m.body.tailZ) * 0.15);
    // landing light in the left wing leading edge, outboard so it doesn't light the nose
    const w = m.wing;
    const at = new THREE.Vector3(-Math.max(w.span * 0.3, r + 1.2), w.y, w.z + w.sweep * 0.6 - 0.1);
    const landing = glow(0xfff4dc, 1.6);
    landing.position.copy(at);
    const coneLen = 45;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6, coneLen, 16, 1, true).translate(0, -coneLen / 2, 0).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    // ConeGeometry tip is at +Y; after translate/rotate the tip sits at the origin and the cone opens toward -Z
    cone.position.copy(at);
    cone.userData.noShadow = true;
    cone.rotation.x = -0.06;
    const spot = new THREE.SpotLight(0xfff1d6, 0, 500, 0.24, 0.5, 2);
    spot.position.copy(at);
    spot.target.position.set(at.x * 0.6, at.y - 12, at.z - 120);
    this.root.add(top, belly, landing, cone, spot, spot.target);
    this.lights = { nav, strobe, beacon: [top, belly], landing, cone, spot };
  }

  private updateLights(dt: number, ac: Aircraft): void {
    const s = ac.systems;
    const power = s.battery;
    this.lightTime += dt;
    const t = this.lightTime;
    for (const n of this.lights.nav) n.visible = power && s.nav;
    // double flash every 1.2 s
    const p = t % 1.2;
    const flash = p < 0.05 || (p > 0.14 && p < 0.19);
    for (const st of this.lights.strobe) st.visible = power && s.strobe && flash;
    // rotating beacon: about one pulse per second
    const b = Math.max(0, Math.sin(t * 6.5));
    for (const bc of this.lights.beacon) {
      bc.visible = power && s.beacon && b > 0.05;
      bc.material.opacity = b;
    }
    const land = power && s.landing;
    this.lights.landing.visible = land;
    this.lights.cone.visible = land;
    this.lights.spot.intensity = land ? 15000 : 0;
  }

  private buildCanopy(m: ModelSpec, r: number, sq: number): void {
    const e = this.type.eye;
    if (m.canopy === 'bubble') {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bubble);
      c.scale.set(r * 0.85, Math.max(0.45, e.y - r * sq * 0.7 + 0.35), Math.max(1.2, r * 2.8));
      c.position.set(0, r * sq * 0.7, e.z + 0.25);
      this.fuselage.add(c);
    } else if (m.canopy === 'cabin') {
      for (const s of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 1.7), glass);
        win.position.set(s * r * 1.0, e.y - 0.05, e.z + 0.35);
        this.fuselage.add(win);
      }
      const ws = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, 0.45, 0.05), glass);
      ws.position.set(0, e.y - 0.02, e.z - 0.62);
      ws.rotation.x = -0.75;
      this.fuselage.add(ws);
    } else {
      // airliner: cockpit windows and a row of cabin windows
      const ws = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, 0.5, 0.8), glass);
      ws.position.set(0, e.y, e.z - 0.9);
      ws.rotation.x = -0.6;
      this.fuselage.add(ws);
      for (const s of [-1, 1]) {
        const row = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, (m.body.tailZ - m.body.noseZ) * 0.62), glass);
        row.position.set(s * r * 0.985, r * 0.32, (m.body.noseZ + m.body.tailZ) / 2 - 1.5);
        this.fuselage.add(row);
      }
    }
  }

  private propeller(at: THREE.Vector3, radius: number, blades: number, dir: number, spinnerMat: THREE.Material): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const set = new THREE.Group();
    for (let i = 0; i < blades; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, radius, 0.03).translate(0, radius / 2, 0), dark);
      b.rotation.z = (i / blades) * Math.PI * 2;
      set.add(b);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), discMat);
    g.add(set, disc);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.18, radius * 0.4, 10).rotateX(-Math.PI / 2), spinnerMat);
    spinner.position.set(at.x, at.y, at.z - radius * 0.12);
    this.root.add(g, spinner);
    this.props.push({ group: g, blades: set, disc, dir });
  }

  private buildEngines(m: ModelSpec, body: THREE.Material, accent: THREE.Material, r: number): void {
    const e = m.engines;
    if (e.kind === 'nose-prop') {
      this.propeller(new THREE.Vector3(0, e.y, e.z), e.radius, e.blades, 1, accent);
    } else if (e.kind === 'twin-prop') {
      for (const s of [-1, 1]) {
        const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.2, 4, 10).rotateX(Math.PI / 2), body);
        nac.position.set(s * e.x, e.y, e.z + 1.2);
        this.root.add(nac);
        this.propeller(new THREE.Vector3(s * e.x, e.y, e.z), e.radius, e.blades, s, accent);
      }
    } else if (e.kind === 'pods') {
      for (const s of [-1, 1]) {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(e.radius, e.radius * 0.8, e.length, 14, 1, true).rotateX(Math.PI / 2), body);
        pod.position.set(s * e.x, e.y, e.z);
        const inlet = new THREE.Mesh(new THREE.CircleGeometry(e.radius * 0.92, 14), intakeMat);
        inlet.position.set(s * e.x, e.y, e.z - e.length / 2 + 0.05);
        inlet.rotation.y = Math.PI;
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.2, e.radius * 1.3, e.length * 0.6), body);
        pylon.position.set(s * e.x, e.y + e.radius * 0.9, e.z + 0.3);
        this.root.add(pod, inlet, pylon);
      }
    } else if (e.kind === 'internal') {
      const tz = m.body.tailZ;
      for (const s of [-1, 1]) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 1.4), body);
        intake.position.set(s * r * 1.05, -r * 0.2, m.body.noseZ + (tz - m.body.noseZ) * 0.42);
        this.root.add(intake);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.6, 12, 1, true).rotateX(Math.PI / 2), dark);
      nozzle.position.set(0, 0, tz + 0.1);
      this.root.add(nozzle);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.5, 4, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2),
        new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      flame.position.set(0, 0, tz + 0.3);
      flame.userData.keep = true;
      this.root.add(flame);
      this.flame = flame;
    }
  }

  private buildGear(g: GearSpec, body: THREE.Material, r: number, sq: number): void {
    const retract = this.type.retractableGear;
    const wheel = (rad: number) => new THREE.CylinderGeometry(rad, rad, rad * 0.6, 12).rotateZ(Math.PI / 2);
    const leg = (x: number, z: number, bottom: number, rad: number, axis: 'x' | 'z', up: number) => {
      const top = -r * sq * 0.55;
      const length = top - (bottom + rad);
      const pivot = new THREE.Group();
      pivot.position.set(x, top, z);
      pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length, 6).translate(0, -length / 2, 0), dark));
      const w = new THREE.Mesh(wheel(rad), dark);
      w.position.y = -length;
      pivot.add(w);
      this.root.add(pivot);
      if (retract) this.legs.push({ pivot, axis, up });
    };
    switch (g.type) {
      case 'tricycle': {
        const rad = Math.min(0.45, Math.abs(g.main[2]) * 0.18);
        leg(0, g.nose[0], g.nose[1], rad * 0.85, 'x', -Math.PI / 2);
        leg(-g.main[1] / 2, g.main[0], g.main[2], rad, 'z', -Math.PI / 2);
        leg(g.main[1] / 2, g.main[0], g.main[2], rad, 'z', Math.PI / 2);
        break;
      }
      case 'taildragger': {
        const rad = Math.min(0.35, Math.abs(g.main[2]) * 0.2);
        for (const s of [-1, 1]) {
          const a = new THREE.Vector3(s * r * 0.6, -r * sq * 0.6, g.main[0] - 0.3);
          const b = new THREE.Vector3((s * g.main[1]) / 2, g.main[2] + rad, g.main[0]);
          this.root.add(rod(a, b, 0.045, dark));
          const w = new THREE.Mesh(wheel(rad), dark);
          w.position.copy(b);
          this.root.add(w);
        }
        const tw = new THREE.Mesh(wheel(0.09), dark);
        tw.position.set(0, g.tail[1] + 0.09, g.tail[0]);
        this.root.add(tw);
        break;
      }
      case 'floats': {
        const flen = g.back - g.front + 1.6;
        for (const s of [-1, 1]) {
          const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, flen - 0.76, 4, 10).rotateX(Math.PI / 2), body);
          fl.scale.y = 0.75;
          fl.position.set((s * g.track) / 2, g.bottom + 0.3, (g.front + g.back) / 2);
          this.root.add(fl);
          for (const z of [g.front + 0.8, g.back - 1.4]) this.root.add(rod(new THREE.Vector3(s * r * 0.7, -r * sq * 0.6, z), new THREE.Vector3((s * g.track) / 2, g.bottom + 0.55, z), 0.04, dark));
        }
        break;
      }
      case 'glider': {
        const w = new THREE.Mesh(wheel(0.18), dark);
        w.position.set(0, g.main[1] + 0.18, g.main[0]);
        this.root.add(w);
        break;
      }
    }
  }

  update(dt: number, c: ControlState, ac: Aircraft): void {
    const p = ac.type.aero;
    // propellers: blades at low rpm, a faint disc when fast
    this.propAngle = (this.propAngle + (ac.engine.rpm / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    const fast = ac.engine.rpm > 900 || (ac.type.sound === 'turboprop' && ac.engine.rpm > 20);
    for (const pr of this.props) {
      pr.group.rotation.z = this.propAngle * pr.dir;
      pr.blades.visible = !fast;
      pr.disc.visible = fast;
    }
    const el = elevator(p, c);
    for (const e of this.elevators) e.rotation.x = -el * 0.4;
    for (const r of this.rudders) r.rotation.y = rudder(p, c) * 0.4;
    for (const a of this.ailerons) a.g.rotation.x = -a.side * aileron(p, c) * 0.3;
    // flaps go down; a glider's "flaps" are air brakes that rise
    for (const f of this.flaps) f.rotation.x = (ac.type.glider ? -0.9 : 0.7) * ac.flaps;
    const retract = 1 - ac.gear;
    for (const l of this.legs) {
      l.pivot.rotation.set(0, 0, 0);
      l.pivot.rotation[l.axis] = l.up * retract;
    }
    if (this.flame) {
      const reheat = (ac.engine as JetEngine).reheat;
      const mat = this.flame.material as THREE.MeshBasicMaterial;
      mat.opacity = reheat ? 0.75 : ac.engine.spool * 0.25;
      this.flame.scale.set(1, 1, reheat ? 1.6 : 0.4 + ac.engine.spool * 0.4);
    }
    this.updateFlex(dt, ac);
    this.updateLights(dt, ac);
  }

  /** Wings bend with the load factor like a damped spring and ring on bumps and gusts. */
  private updateFlex(dt: number, ac: Aircraft): void {
    const { perG, hz } = this.type.wingFlex;
    const weight = ac.type.mass * 9.81;
    const n = ac.aero.force.y / weight;
    // runway roughness shakes the wings while rolling
    if (ac.onGround) {
      const v = Math.hypot(ac.vel.x, ac.vel.z);
      this.rumble = (Math.random() - 0.5) * Math.min(1, v / 25) * 0.6;
    } else this.rumble = 0;
    const target = perG * (n - 1 + this.rumble);
    const w = Math.PI * 2 * hz;
    const zeta = 0.12;
    const steps = Math.max(1, Math.ceil(dt * 400));
    const h = Math.min(dt, 0.05) / steps;
    for (let i = 0; i < steps; i++) {
      this.flexRate += (-w * w * (this.flex - target) - 2 * zeta * w * this.flexRate) * h;
      this.flex += this.flexRate * h;
    }
    const f = THREE.MathUtils.clamp(this.flex, -0.25, 0.35);
    const dih = this.type.model.wing.dihedral * DEG;
    for (const wg of this.wings) {
      wg.inner.rotation.z = wg.side * (dih + f * 0.35);
      wg.outer.rotation.z = wg.side * f * 0.65;
    }
  }

  /** Current tip bend (rad), for camera/cockpit effects. */
  get bend(): number {
    return this.flex;
  }
}
