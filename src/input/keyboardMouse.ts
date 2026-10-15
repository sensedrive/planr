import { type Actions, approachAxis, clamp, type ControlState, stepFlaps } from '../core/input';

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Keyboard flight controls plus mouse wheel throttle. */
export class KeyboardInput {
  pitch = 0;
  roll = 0;
  yaw = 0;
  private readonly keys = new Set<string>();
  private wheel = 0;
  private flapSteps = 0;

  constructor(
    private readonly actions: Actions,
    canvas: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code) && !e.repeat) this.oneShot(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private oneShot(code: string): void {
    switch (code) {
      case 'KeyF':
        this.flapSteps++;
        break;
      case 'KeyV':
        this.flapSteps--;
        break;
      case 'KeyC':
        this.actions.toggleCamera();
        break;
      case 'KeyR':
        this.actions.reset(false);
        break;
      case 'KeyL':
        this.actions.reset(true);
        break;
      case 'KeyP':
        this.actions.togglePause();
        break;
      case 'KeyM':
        this.actions.toggleMute();
        break;
      case 'KeyH':
        this.actions.toggleHelp();
        break;
    }
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private axis(pos: string[], neg: string[]): number {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }

  update(dt: number, c: ControlState): void {
    this.pitch = approachAxis(this.pitch, this.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']), dt);
    this.roll = approachAxis(this.roll, this.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), dt);
    this.yaw = approachAxis(this.yaw, this.axis(['KeyE'], ['KeyQ']), dt);

    let thr = this.axis(['ShiftLeft', 'ShiftRight'], ['KeyX']) * 0.5 * dt;
    thr -= this.wheel * 0.0007;
    this.wheel = 0;
    c.throttle = clamp(c.throttle + thr, 0, 1);
    c.trim = clamp(c.trim + this.axis(['KeyT'], ['KeyG']) * 0.35 * dt);
    if (this.down('KeyB', 'Space')) c.brake = 1;
    while (this.flapSteps !== 0) {
      const dir = Math.sign(this.flapSteps);
      stepFlaps(c, dir);
      this.flapSteps -= dir;
    }
  }
}
