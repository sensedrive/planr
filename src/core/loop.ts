/** Fixed-rate simulation stepping, decoupled from the (variable) render rate. */
export class FixedStepLoop {
  private acc = 0;

  constructor(
    readonly dt: number,
    private readonly maxSteps = 10,
  ) {}

  /** Runs as many fixed steps as fit into `frameDt`; returns the interpolation factor 0…1. */
  advance(frameDt: number, step: (dt: number) => void): number {
    this.acc += Math.min(frameDt, 0.25);
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) {
      step(this.dt);
      this.acc -= this.dt;
      n++;
    }
    if (n === this.maxSteps) this.acc = 0;
    return this.acc / this.dt;
  }
}
