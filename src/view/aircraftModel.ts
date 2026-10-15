import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { aileron, C172_AERO, elevator, rudder } from '../sim/aero';
import type { Aircraft } from '../sim/aircraft';

const white = new THREE.MeshLambertMaterial({ color: 0xf2f1ec, flatShading: true });
const red = new THREE.MeshLambertMaterial({ color: 0xb8322a, flatShading: true });
const dark = new THREE.MeshLambertMaterial({ color: 0x2c2d30, flatShading: true });
const glass = new THREE.MeshLambertMaterial({ color: 0x20303f, flatShading: true });
const discMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** A control surface hinged at its leading edge; the mesh extends toward +Z. */
function surface(w: number, h: number, chord: number, hinge: THREE.Vector3, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(hinge);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, chord), mat);
  m.position.z = chord / 2;
  g.add(m);
  return g;
}

/** What the main loop needs from an exterior model. */
export interface AircraftVisual {
  readonly root: THREE.Group;
  /** parts hidden while sitting in the cockpit */
  readonly fuselage: THREE.Group;
  update(dt: number, c: ControlState, ac: Aircraft): void;
}

/** Low-poly high-wing single, matching the physics contact points. */
export class AircraftModel implements AircraftVisual {
  readonly root = new THREE.Group();
  /** fuselage parts that would block the view from the cockpit */
  readonly fuselage = new THREE.Group();
  private readonly prop = new THREE.Group();
  private readonly blades: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly elevator: THREE.Group;
  private readonly rudder: THREE.Group;
  private readonly aileronL: THREE.Group;
  private readonly aileronR: THREE.Group;
  private readonly flapL: THREE.Group;
  private readonly flapR: THREE.Group;
  private propAngle = 0;

  constructor() {
    const f = this.fuselage;
    this.root.name = 'aircraft';
    // cabin
    f.add(box(1.24, 1.65, 2.7, 0, 0.12, -0.25, white));
    f.add(box(1.26, 0.12, 2.72, 0, -0.1, -0.25, red));
    f.add(box(1.27, 0.5, 1.0, 0, 0.62, -0.55, glass));
    f.add(box(1.27, 0.5, 0.75, 0, 0.62, 0.6, glass));
    const windshield = box(1.1, 0.55, 0.05, 0, 0.72, -1.15, glass);
    windshield.rotation.x = -0.7;
    f.add(windshield);
    // cowling
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.4, 0.75, 10).rotateX(Math.PI / 2), white);
    cowl.position.set(0, -0.15, -1.97);
    this.root.add(cowl);
    // tail cone
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.62, 3.9, 8).rotateX(Math.PI / 2), white);
    cone.position.set(0, 0.25, 3.0);
    cone.scale.set(1, 1.3, 1);
    f.add(cone);
    this.root.add(f);

    // spinner + propeller
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.35, 10).rotateX(-Math.PI / 2), red);
    spinner.position.set(0, -0.15, -2.5);
    this.root.add(spinner);
    this.prop.position.set(0, -0.15, -2.4);
    this.blades = box(0.12, 1.7, 0.03, 0, 0, 0, dark);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), discMat);
    this.prop.add(this.blades, this.disc);
    this.root.add(this.prop);

    // wing
    const wingY = 1.05;
    const le = -1.05;
    const chord = 1.5;
    const hingeZ = le + chord - 0.35;
    this.root.add(box(C172_AERO.b, 0.14, chord - 0.35, 0, wingY, le + (chord - 0.35) / 2, white));
    this.root.add(box(0.06, 0.15, chord - 0.3, -C172_AERO.b / 2, wingY, le + chord / 2, red));
    this.root.add(box(0.06, 0.15, chord - 0.3, C172_AERO.b / 2, wingY, le + chord / 2, red));
    this.flapL = surface(2.5, 0.1, 0.35, new THREE.Vector3(-1.95, wingY, hingeZ), white);
    this.flapR = surface(2.5, 0.1, 0.35, new THREE.Vector3(1.95, wingY, hingeZ), white);
    this.aileronL = surface(2.2, 0.1, 0.35, new THREE.Vector3(-4.35, wingY, hingeZ), white);
    this.aileronR = surface(2.2, 0.1, 0.35, new THREE.Vector3(4.35, wingY, hingeZ), white);
    this.root.add(this.flapL, this.flapR, this.aileronL, this.aileronR);
    for (const s of [-1, 1]) {
      this.root.add(rod(new THREE.Vector3(s * 0.6, -0.45, -0.3), new THREE.Vector3(s * 2.6, wingY - 0.07, -0.4), 0.035, white));
    }

    // tail
    this.root.add(box(3.4, 0.08, 0.6, 0, 0.42, 4.3, white));
    this.elevator = surface(3.4, 0.07, 0.45, new THREE.Vector3(0, 0.42, 4.6), white);
    this.root.add(this.elevator);
    const fin = box(0.08, 1.3, 0.75, 0, 1.05, 4.45, white);
    this.root.add(fin);
    this.rudder = surface(0.07, 1.3, 0.4, new THREE.Vector3(0, 1.05, 4.82), red);
    this.root.add(this.rudder);

    // gear (wheel bottoms at y = -1.2 like the physics contacts)
    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).rotateZ(Math.PI / 2);
    const wheels: [number, number][] = [
      [0, -1.55],
      [-1.25, 0.25],
      [1.25, 0.25],
    ];
    for (const [x, z] of wheels) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(x, -1.0, z);
      this.root.add(w);
    }
    this.root.add(rod(new THREE.Vector3(0, -0.4, -1.55), new THREE.Vector3(0, -1.0, -1.55), 0.04, dark));
    for (const s of [-1, 1]) this.root.add(rod(new THREE.Vector3(s * 0.5, -0.6, 0.25), new THREE.Vector3(s * 1.25, -1.0, 0.25), 0.04, dark));
  }

  update(dt: number, c: ControlState, ac: Aircraft): void {
    const rpm = ac.engine.rpm;
    const flaps = ac.flaps;
    const p = ac.type.aero;
    this.propAngle = (this.propAngle + (rpm / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    this.prop.rotation.z = this.propAngle;
    const fast = rpm > 900;
    this.blades.visible = !fast;
    this.disc.visible = fast;

    this.elevator.rotation.x = -elevator(p, c) * 0.4;
    this.aileronR.rotation.x = -aileron(p, c) * 0.3;
    this.aileronL.rotation.x = aileron(p, c) * 0.3;
    this.rudder.rotation.y = rudder(p, c) * 0.4;
    this.flapL.rotation.x = this.flapR.rotation.x = flaps * 0.55;
  }
}
