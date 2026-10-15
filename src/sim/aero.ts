import { MathUtils, Vector3 } from 'three';
import { clamp, type ControlState } from '../core/input';

const DEG = Math.PI / 180;

export type AeroParams = typeof C172_AERO;

/**
 * Aerodynamic model in body axes: +X right wing, +Y up, -Z nose.
 * Coefficients loosely follow a Cessna 172.
 */
export const C172_AERO = {
  S: 16.2, // wing area m²
  b: 11.0, // span m
  c: 1.5, // mean chord m
  CL0: 0.25,
  CLa: 5.0, // per rad
  stallAngle: 15 * DEG,
  CD0: 0.034,
  k: 0.057, // induced drag factor
  CYb: -0.6,
  // pitch (nose up positive); Cm0 trims hands-off flight to ~74 kt (climb speed)
  Cm0: 0.08,
  Cma: -0.9,
  Cmq: -12,
  Cmde: 0.3,
  trimRange: 0.45, // elevator fraction reachable by trim
  // roll (right positive)
  Clda: 0.07,
  Clp: -0.5,
  Clb: -0.1,
  // yaw (right positive)
  Cndr: 0.09,
  Cnr: -0.15,
  Cnb: 0.1,
  Cnda: -0.01,
  // extra dynamic pressure over the tail from prop wash, per unit throttle (Pa)
  propWash: 600,
  // flaps (full deflection) and landing gear
  flapCL: 0.45,
  flapStall: 3 * DEG,
  flapCD: 0.035,
  gearCD: 0,
  // fraction of aileron / rudder reachable by their trim
  rollTrimRange: 0.3,
  yawTrimRange: 0.4,
};

/** Jet trainer, loosely an Aero L-39. */
export const JET_AERO: AeroParams = {
  S: 18.8,
  b: 9.46,
  c: 2.15,
  CL0: 0.15,
  CLa: 4.6,
  stallAngle: 17 * DEG,
  CD0: 0.028,
  k: 0.075,
  CYb: -0.8,
  Cm0: 0.03,
  Cma: -0.8,
  Cmq: -14,
  Cmde: 0.35,
  trimRange: 0.5,
  Clda: 0.06,
  Clp: -0.45,
  Clb: -0.08,
  Cndr: 0.07,
  Cnr: -0.18,
  Cnb: 0.12,
  Cnda: -0.005,
  propWash: 0,
  flapCL: 0.55,
  flapStall: 2 * DEG,
  flapCD: 0.05,
  gearCD: 0.02,
  rollTrimRange: 0.25,
  yawTrimRange: 0.35,
};

export interface AeroOut {
  force: Vector3;
  moment: Vector3;
  alpha: number;
  beta: number;
  airspeed: number;
  stallAngle: number;
  /** 0…1, how far beyond the stall angle the wing is */
  stallDepth: number;
  /** which wing drops in a stall (-1 left, +1 right, 0 none) */
  asym: number;
}

export function createAeroOut(): AeroOut {
  return { force: new Vector3(), moment: new Vector3(), alpha: 0, beta: 0, airspeed: 0, stallAngle: C172_AERO.stallAngle, stallDepth: 0, asym: 0 };
}

export function stallAngleFor(p: AeroParams, flaps: number): number {
  return p.stallAngle - p.flapStall * flaps;
}

export function liftCoefficient(p: AeroParams, alpha: number, flaps: number): number {
  const stall = stallAngleFor(p, flaps);
  const cl0 = p.CL0 + p.flapCL * flaps;
  const a = Math.abs(alpha);
  if (a <= stall) return cl0 + p.CLa * alpha;
  const sgn = Math.sign(alpha);
  const peak = cl0 + p.CLa * sgn * stall;
  const post = peak * Math.max(0.55, 1 - (a - stall) * 3.5);
  const plate = 1.15 * Math.sin(2 * alpha); // flat-plate behaviour far beyond stall
  return MathUtils.lerp(post, plate, MathUtils.smoothstep(a, 0.45, 0.9));
}

const RIGHT = new Vector3(1, 0, 0);
const vHat = new Vector3();
const liftDir = new Vector3();

/**
 * Computes body-axis force (N) and moment (N·m) from body-axis air velocity and angular rate.
 * `realistic` adds an asymmetric wing drop and autorotation (spin) beyond the stall.
 */
export function computeAero(
  p: AeroParams,
  vBody: Vector3,
  omega: Vector3,
  c: ControlState,
  flaps: number,
  gear: number,
  rho: number,
  out: AeroOut,
  realistic = false,
  /** wing height above ground (m), for ground effect */
  heightAboveGround = Infinity,
): AeroOut {
  out.force.set(0, 0, 0);
  out.moment.set(0, 0, 0);
  const V = vBody.length();
  out.airspeed = V;
  out.stallAngle = stallAngleFor(p, flaps);
  const qWash = p.propWash * c.throttle;
  if (V < 0.5) {
    out.alpha = 0;
    out.beta = 0;
    // prop wash still gives some tail authority when standing
    out.moment.set(qWash * p.S * p.c * p.Cmde * elevator(p, c), -qWash * p.S * p.b * p.Cndr * rudder(p, c), 0);
    return out;
  }

  const alpha = Math.atan2(-vBody.y, -vBody.z);
  const beta = Math.asin(clamp(vBody.x / V));
  out.alpha = alpha;
  out.beta = beta;

  const qbar = 0.5 * rho * V * V;
  const qS = qbar * p.S;

  // ground effect: more lift and less induced drag within about a span of the ground
  const ge = 0.25 * Math.exp((-2.5 * Math.max(0, heightAboveGround)) / p.b);
  const CL = liftCoefficient(p, alpha, flaps) * (1 + ge);
  const sa = Math.sin(alpha);
  const stallDrag = 1.2 * sa * sa * MathUtils.smoothstep(Math.abs(alpha), out.stallAngle - 3 * DEG, out.stallAngle + 5 * DEG);
  const sb = Math.sin(beta);
  const CD = p.CD0 + p.flapCD * flaps + p.gearCD * gear + p.k * (1 - 2 * ge) * CL * CL + stallDrag + 0.5 * sb * sb;

  vHat.copy(vBody).divideScalar(V);
  out.force.addScaledVector(vHat, -qS * CD);
  liftDir.crossVectors(RIGHT, vHat);
  if (liftDir.lengthSq() > 1e-6) out.force.addScaledVector(liftDir.normalize(), qS * CL);
  out.force.x += qS * p.CYb * beta;

  // non-dimensional rates (roll right, pitch up, yaw right positive)
  const pHat = (-omega.z * p.b) / (2 * V);
  const qHat = (omega.x * p.c) / (2 * V);
  const rHat = (-omega.y * p.b) / (2 * V);

  const ail = aileron(p, c);
  const rud = rudder(p, c);
  const qTail = qbar + qWash;

  const Cm = p.Cm0 + p.Cma * clamp(alpha, -0.6, 0.6) + p.Cmq * qHat;
  const pitchM = qS * p.c * Cm + qTail * p.S * p.c * p.Cmde * elevator(p, c);

  // stall asymmetry: one wing drops first; beyond the stall roll damping turns into a bounded
  // autorotation (tanh saturates at a spin rate of roughly half a turn per second)
  const sf = realistic ? MathUtils.smoothstep(Math.abs(alpha), out.stallAngle, out.stallAngle + 6 * DEG) : 0;
  out.stallDepth = sf;
  if (sf < 0.02) out.asym = 0;
  else if (out.asym === 0) out.asym = beta > 0.01 ? 1 : beta < -0.01 ? -1 : Math.random() < 0.5 ? -1 : 1;

  const Cl = p.Clda * ail + p.Clp * pHat + p.Clb * beta + sf * (out.asym * 0.04 + 0.3 * Math.tanh(pHat / 0.25));
  const Cn = p.Cnr * rHat + p.Cnb * beta + p.Cnda * ail + sf * out.asym * 0.01;
  const yawRight = qS * p.b * Cn + qTail * p.S * p.b * p.Cndr * rud;

  // body axes: +X pitch-up, +Y yaw-left, +Z roll-left
  out.moment.set(pitchM, -yawRight, -qS * p.b * Cl);
  return out;
}

export function elevator(p: AeroParams, c: ControlState): number {
  return clamp(c.pitch + c.trim * p.trimRange);
}

export function aileron(p: AeroParams, c: ControlState): number {
  return clamp(c.roll + c.trimRoll * p.rollTrimRange);
}

export function rudder(p: AeroParams, c: ControlState): number {
  return clamp(c.yaw + c.trimYaw * p.yawTrimRange);
}
