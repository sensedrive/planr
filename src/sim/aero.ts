import { MathUtils, Vector3 } from 'three';
import { clamp, type ControlState } from '../core/input';

const DEG = Math.PI / 180;

/**
 * Aerodynamic model in body axes: +X right wing, +Y up, -Z nose.
 * Coefficients loosely follow a Cessna 172.
 */
export const AERO = {
  S: 16.2, // wing area m²
  b: 11.0, // span m
  c: 1.5, // mean chord m
  CL0: 0.25,
  CLa: 5.0, // per rad
  stallAngle: 15 * DEG,
  CD0: 0.034,
  k: 0.057, // induced drag factor
  CYb: -0.6,
  // pitch (nose up positive); Cm0 trims hands-off flight to ~80 kt
  Cm0: 0.05,
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
};

export interface AeroOut {
  force: Vector3;
  moment: Vector3;
  alpha: number;
  beta: number;
  airspeed: number;
  stallAngle: number;
}

export function createAeroOut(): AeroOut {
  return { force: new Vector3(), moment: new Vector3(), alpha: 0, beta: 0, airspeed: 0, stallAngle: AERO.stallAngle };
}

export function stallAngleFor(flaps: number): number {
  return AERO.stallAngle - 3 * DEG * flaps;
}

export function liftCoefficient(alpha: number, flaps: number): number {
  const stall = stallAngleFor(flaps);
  const cl0 = AERO.CL0 + 0.45 * flaps;
  const a = Math.abs(alpha);
  if (a <= stall) return cl0 + AERO.CLa * alpha;
  const sgn = Math.sign(alpha);
  const peak = cl0 + AERO.CLa * sgn * stall;
  const post = peak * Math.max(0.55, 1 - (a - stall) * 3.5);
  const plate = 1.15 * Math.sin(2 * alpha); // flat-plate behaviour far beyond stall
  return MathUtils.lerp(post, plate, MathUtils.smoothstep(a, 0.45, 0.9));
}

const RIGHT = new Vector3(1, 0, 0);
const vHat = new Vector3();
const liftDir = new Vector3();

/** Computes body-axis force (N) and moment (N·m) from body-axis velocity and angular rate. */
export function computeAero(vBody: Vector3, omega: Vector3, c: ControlState, flaps: number, rho: number, out: AeroOut): AeroOut {
  out.force.set(0, 0, 0);
  out.moment.set(0, 0, 0);
  const V = vBody.length();
  out.airspeed = V;
  out.stallAngle = stallAngleFor(flaps);
  const qWash = AERO.propWash * c.throttle;
  if (V < 0.5) {
    out.alpha = 0;
    out.beta = 0;
    // prop wash still gives some tail authority when standing
    out.moment.set(qWash * AERO.S * AERO.c * AERO.Cmde * elevator(c), -qWash * AERO.S * AERO.b * AERO.Cndr * c.yaw, 0);
    return out;
  }

  const alpha = Math.atan2(-vBody.y, -vBody.z);
  const beta = Math.asin(clamp(vBody.x / V));
  out.alpha = alpha;
  out.beta = beta;

  const qbar = 0.5 * rho * V * V;
  const qS = qbar * AERO.S;

  const CL = liftCoefficient(alpha, flaps);
  const sa = Math.sin(alpha);
  const stallDrag = 1.2 * sa * sa * MathUtils.smoothstep(Math.abs(alpha), out.stallAngle - 3 * DEG, out.stallAngle + 5 * DEG);
  const sb = Math.sin(beta);
  const CD = AERO.CD0 + 0.035 * flaps + AERO.k * CL * CL + stallDrag + 0.5 * sb * sb;

  vHat.copy(vBody).divideScalar(V);
  out.force.addScaledVector(vHat, -qS * CD);
  liftDir.crossVectors(RIGHT, vHat);
  if (liftDir.lengthSq() > 1e-6) out.force.addScaledVector(liftDir.normalize(), qS * CL);
  out.force.x += qS * AERO.CYb * beta;

  // non-dimensional rates (roll right, pitch up, yaw right positive)
  const pHat = (-omega.z * AERO.b) / (2 * V);
  const qHat = (omega.x * AERO.c) / (2 * V);
  const rHat = (-omega.y * AERO.b) / (2 * V);

  const ail = clamp(c.roll);
  const rud = clamp(c.yaw);
  const qTail = qbar + qWash;

  const Cm = AERO.Cm0 + AERO.Cma * clamp(alpha, -0.6, 0.6) + AERO.Cmq * qHat;
  const pitchM = qS * AERO.c * Cm + qTail * AERO.S * AERO.c * AERO.Cmde * elevator(c);

  const Cl = AERO.Clda * ail + AERO.Clp * pHat + AERO.Clb * beta;
  const Cn = AERO.Cnr * rHat + AERO.Cnb * beta + AERO.Cnda * ail;
  const yawRight = qS * AERO.b * Cn + qTail * AERO.S * AERO.b * AERO.Cndr * rud;

  // body axes: +X pitch-up, +Y yaw-left, +Z roll-left
  out.moment.set(pitchM, -yawRight, -qS * AERO.b * Cl);
  return out;
}

export function elevator(c: ControlState): number {
  return clamp(c.pitch + c.trim * AERO.trimRange);
}
