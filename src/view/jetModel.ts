import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { aileron, elevator, rudder } from '../sim/aero';
import type { Aircraft } from '../sim/aircraft';
import type { AircraftVisual } from './aircraftModel';

const body = new THREE.MeshLambertMaterial({ color: 0xdfe3e6, flatShading: true });
/** wing panels are mirrored by negative scale, so render both sides */
const wingMat = new THREE.MeshLambertMaterial({ color: 0xdfe3e6, flatShading: true, side: THREE.DoubleSide });
const accent = new THREE.MeshLambertMaterial({ color: 0x1f4e8c, flatShading: true });
const dark = new THREE.MeshLambertMaterial({ color: 0x2c2d30, flatShading: true });
const glass = new THREE.MeshLambertMaterial({ color: 0x223448, transparent: true, opacity: 0.55, flatShading: true });
const exhaust = new THREE.MeshBasicMaterial({ color: 0x111111 });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Trapezoid wing panel in the XZ plane (leading edge toward -Z), as an extruded shape. */
function wingPanel(span: number, rootChord: number, tipChord: number, sweep: number, thickness: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span, sweep);
  shape.lineTo(span, sweep + tipChord);
  shape.lineTo(0, rootChord);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // shape XY → world XZ, extrusion along +Y
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  return new THREE.Mesh(geo, mat);
}

function surface(w: number, h: number, chord: number, hinge: THREE.Vector3, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(hinge);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, chord), mat);
  m.position.z = chord / 2;
  g.add(m);
  return g;
}

interface GearLeg {
  pivot: THREE.Group;
  axis: 'x' | 'z';
  /** rotation when retracted */
  up: number;
}

/** Low-poly jet trainer (L-39-like) with retractable tricycle gear. */
export class JetModel implements AircraftVisual {
  readonly root = new THREE.Group();
  readonly fuselage = new THREE.Group();
  private readonly elevatorL: THREE.Group;
  private readonly rudderG: THREE.Group;
  private readonly aileronL: THREE.Group;
  private readonly aileronR: THREE.Group;
  private readonly flapL: THREE.Group;
  private readonly flapR: THREE.Group;
  private readonly legs: GearLeg[] = [];
  private readonly glow: THREE.Mesh;

  constructor() {
    this.root.name = 'jet';
    const f = this.fuselage;
    // main fuselage
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 5.5, 12).rotateX(Math.PI / 2), body);
    mid.position.set(0, 0, -0.2);
    f.add(mid);
    const aft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.38, 2.6, 12).rotateX(Math.PI / 2), body);
    aft.position.set(0, 0.05, 3.85);
    f.add(aft);
    const fwd = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.3, 12).rotateX(Math.PI / 2), body);
    fwd.position.set(0, 0, -3.6);
    f.add(fwd);
    // canopy (tandem)
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(0.5, 0.55, 1.9);
    canopy.position.set(0, 0.5, -1.6);
    f.add(canopy);
    // intakes
    for (const s of [-1, 1]) {
      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 10).rotateX(Math.PI / 2), body);
      intake.position.set(s * 0.72, 0.25, -0.1);
      f.add(intake);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.26, 10), exhaust);
      mouth.position.set(s * 0.72, 0.25, -0.91);
      mouth.rotation.y = Math.PI;
      f.add(mouth);
    }
    f.add(box(0.05, 0.12, 6.5, -0.63, -0.05, -0.5, accent), box(0.05, 0.12, 6.5, 0.63, -0.05, -0.5, accent));
    this.root.add(f);

    // nose cone stays visible from the cockpit
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 12).rotateX(-Math.PI / 2), body);
    nose.position.set(0, 0, -4.9);
    this.root.add(nose);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8).rotateX(-Math.PI / 2), accent);
    tip.position.set(0, 0, -5.6);
    this.root.add(tip);

    // exhaust
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12, 1, true).rotateX(Math.PI / 2), dark);
    nozzle.position.set(0, 0.05, 5.2);
    this.root.add(nozzle);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0 }));
    this.glow.position.set(0, 0.05, 5.15);
    this.root.add(this.glow);

    // low wing with tip tanks
    const wingY = -0.4;
    for (const s of [-1, 1]) {
      const w = wingPanel(4.2, 2.6, 1.4, 0.45, 0.16, wingMat);
      w.position.set(s * 0.5, wingY, -0.9);
      if (s < 0) w.scale.x = -1;
      this.root.add(w);
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.6, 4, 10).rotateX(Math.PI / 2), accent);
      tank.position.set(s * 4.75, wingY, -0.15);
      this.root.add(tank);
    }
    this.flapL = surface(2.0, 0.08, 0.5, new THREE.Vector3(-1.7, wingY, 1.15), body);
    this.flapR = surface(2.0, 0.08, 0.5, new THREE.Vector3(1.7, wingY, 1.15), body);
    this.aileronL = surface(1.5, 0.08, 0.4, new THREE.Vector3(-3.6, wingY, 0.92), body);
    this.aileronR = surface(1.5, 0.08, 0.4, new THREE.Vector3(3.6, wingY, 0.92), body);
    this.root.add(this.flapL, this.flapR, this.aileronL, this.aileronR);

    // tail
    for (const s of [-1, 1]) {
      const h = wingPanel(1.9, 1.3, 0.7, 0.45, 0.08, wingMat);
      h.position.set(s * 0.2, 0.55, 3.9);
      if (s < 0) h.scale.x = -1;
      this.root.add(h);
    }
    this.elevatorL = surface(4.2, 0.06, 0.4, new THREE.Vector3(0, 0.55, 5.2), body);
    this.root.add(this.elevatorL);
    const fin = new THREE.Mesh(
      new THREE.ExtrudeGeometry(
        new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 1.5), new THREE.Vector2(1.9, 1.5), new THREE.Vector2(1.7, 0)]),
        { depth: 0.1, bevelEnabled: false },
      ),
      accent,
    );
    // shape X → +Z (aft), Y → up
    fin.geometry.rotateY(-Math.PI / 2);
    fin.position.set(0.05, 0.45, 3.4);
    this.root.add(fin);
    this.rudderG = surface(0.07, 1.2, 0.45, new THREE.Vector3(0, 1.15, 5.1), accent);
    this.root.add(this.rudderG);

    // retractable gear: main legs fold inward (about Z), nose leg folds forward (about X)
    const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12).rotateZ(Math.PI / 2);
    const leg = (x: number, z: number, length: number, axis: 'x' | 'z', up: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, -1.55 + 0.24 + length, z);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, length, 6).translate(0, -length / 2, 0), dark);
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.position.y = -length;
      pivot.add(strut, wheel);
      this.root.add(pivot);
      this.legs.push({ pivot, axis, up });
    };
    leg(0, -3.2, 0.75, 'x', -Math.PI / 2);
    leg(-1.3, 0.35, 0.9, 'z', -Math.PI / 2);
    leg(1.3, 0.35, 0.9, 'z', Math.PI / 2);
  }

  update(_dt: number, c: ControlState, ac: Aircraft): void {
    const p = ac.type.aero;
    this.elevatorL.rotation.x = -elevator(p, c) * 0.35;
    this.aileronR.rotation.x = -aileron(p, c) * 0.3;
    this.aileronL.rotation.x = aileron(p, c) * 0.3;
    this.rudderG.rotation.y = rudder(p, c) * 0.4;
    this.flapL.rotation.x = this.flapR.rotation.x = ac.flaps * 0.7;
    const retract = 1 - ac.gear;
    for (const l of this.legs) {
      l.pivot.rotation.set(0, 0, 0);
      l.pivot.rotation[l.axis] = l.up * retract;
    }
    (this.glow.material as THREE.MeshBasicMaterial).opacity = ac.engine.spool * 0.8;
  }
}
