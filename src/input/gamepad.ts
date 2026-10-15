import { type Actions, clamp, type ControlState, deadzone, stepFlaps } from '../core/input';

export interface StickAxes {
  pitch: number;
  roll: number;
  yaw: number;
}

/**
 * Standard-mapping gamepad (Xbox/PlayStation layout):
 * left stick pitch/roll, right stick X rudder, RT/LT throttle, A brake,
 * LB/RB flaps, d-pad up/down trim, Y camera, Start reset.
 */
export class GamepadInput {
  private prev: boolean[] = [];
  private readonly axes: StickAxes = { pitch: 0, roll: 0, yaw: 0 };
  private pad: Gamepad | null = null;
  private rumbleWait = 0;

  constructor(private readonly actions: Actions) {}

  /** Returns stick axes while a pad is being used, otherwise null. */
  update(dt: number, c: ControlState): StickAxes | null {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find((p): p is Gamepad => !!p && p.connected && p.mapping === 'standard');
    this.pad = gp ?? null;
    if (!gp) return null;

    const pressed = gp.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.prev[i];
    const val = (i: number) => gp.buttons[i]?.value ?? 0;

    c.throttle = clamp(c.throttle + (val(7) - val(6)) * 0.5 * dt, 0, 1);
    if (pressed[0]) c.brake = 1;
    if (edge(4)) stepFlaps(c, -1);
    if (edge(5)) stepFlaps(c, 1);
    if (pressed[12]) c.trim = clamp(c.trim - 0.35 * dt);
    if (pressed[13]) c.trim = clamp(c.trim + 0.35 * dt);
    if (edge(3)) this.actions.toggleCamera();
    if (edge(9)) this.actions.reset(false);
    if (edge(8)) this.actions.toggleMenu();
    if (edge(1)) c.gear = c.gear >= 0.5 ? 0 : 1;
    this.prev = pressed;

    this.axes.roll = deadzone(gp.axes[0] ?? 0, 0.08);
    this.axes.pitch = deadzone(gp.axes[1] ?? 0, 0.08);
    this.axes.yaw = deadzone(gp.axes[2] ?? 0, 0.12);
    const active = this.axes.roll !== 0 || this.axes.pitch !== 0 || this.axes.yaw !== 0;
    return active ? this.axes : null;
  }

  /** Vibrates the pad (runway, buffet, turbulence), strength 0…1. */
  rumble(dt: number, strength: number): void {
    this.rumbleWait -= dt;
    if (!this.pad || this.rumbleWait > 0 || strength < 0.06) return;
    this.rumbleWait = 0.1;
    const act = (this.pad as Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }).vibrationActuator;
    act?.playEffect?.('dual-rumble', { duration: 120, strongMagnitude: strength * 0.6, weakMagnitude: strength }).catch(() => {});
  }
}
