export const RHO0 = 1.225;

/** ISA troposphere air density (kg/m³) at altitude in metres. */
export function airDensity(altitude: number): number {
  const T0 = 288.15;
  const T = T0 - 0.0065 * Math.max(0, altitude);
  return RHO0 * Math.pow(T / T0, 4.2559);
}
