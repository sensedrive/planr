import { Vector3 } from 'three';
import type { AircraftType } from '../sim/types';

/** Positions of everything the pilot touches, in aircraft coordinates, derived from the eye point. */
export interface CockpitLayout {
  eye: Vector3;
  style: 'cabin' | 'canopy';
  /** z of the instrument panel face */
  front: number;
  /** x centre of the instrument row */
  panelX: number;
  halfWidth: number;
  stickPivot: Vector3;
  stickLength: number;
  throttlePivot: Vector3;
  throttleLength: number;
  throttleMaxAngle: number;
  flapPivot: Vector3;
  flapLength: number;
  flapMaxAngle: number;
  gearLever: Vector3 | null;
  /** elevator trim wheel; aileron and rudder trim knobs sit behind it */
  trimWheel: Vector3;
  trimRollKnob: Vector3;
  trimYawKnob: Vector3;
  pedals: Vector3;
}

export function makeLayout(type: AircraftType): CockpitLayout {
  const e = type.eye;
  const cabin = type.cockpit === 'cabin';
  const v = (x: number, y: number, z: number) => new Vector3(e.x + x, e.y + y, e.z + z);
  return {
    eye: e.clone(),
    style: type.cockpit,
    front: e.z - 0.7,
    panelX: cabin ? e.x + 0.13 : e.x,
    halfWidth: type.cockpitHalfWidth,
    // between the knees, a hand's width closer than a full-length stick
    stickPivot: v(0, -1.05, -0.28),
    stickLength: 0.56,
    throttlePivot: v(-0.2, -0.65, -0.2),
    throttleLength: 0.24,
    throttleMaxAngle: 0.4,
    flapPivot: v(cabin ? -0.27 : -0.3, -0.66, 0.06),
    flapLength: 0.18,
    flapMaxAngle: 0.45,
    gearLever: type.retractableGear ? v(-0.3, -0.48, -0.62) : null,
    trimWheel: v(0.27, -0.72, -0.22),
    trimRollKnob: v(0.27, -0.68, -0.02),
    trimYawKnob: v(0.27, -0.68, 0.14),
    pedals: v(0, -1.05, -0.62),
  };
}
