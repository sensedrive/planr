/** Synthesised engine drone, wind noise and stall horn (no audio files). */
export class FlightAudio {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private hornGain!: GainNode;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc.connect(this.engineFilter);
    const sub = ctx.createGain();
    sub.gain.value = 0.35;
    this.engineOsc2.connect(sub).connect(this.engineFilter);
    this.engineOsc.start();
    this.engineOsc2.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    const horn = ctx.createOscillator();
    horn.type = 'square';
    horn.frequency.value = 1450;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    horn.connect(this.hornGain).connect(this.master);
    horn.start();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  update(rpm: number, throttle: number, airspeed: number, stall: boolean, silent: boolean, jet = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (jet) {
      // turbine whine follows N1 (rpm = percent)
      const whine = 300 + rpm * 9;
      this.engineOsc.frequency.setTargetAtTime(whine, t, 0.1);
      this.engineOsc2.frequency.setTargetAtTime(whine * 0.25, t, 0.1);
      this.engineFilter.frequency.setTargetAtTime(700 + throttle * 2600, t, 0.2);
      this.engineGain.gain.setTargetAtTime(silent || rpm < 20 ? 0 : 0.05 + throttle * 0.12, t, 0.2);
    } else {
      const firing = (rpm / 60) * 2; // two-blade prop pulses
      this.engineOsc.frequency.setTargetAtTime(firing, t, 0.05);
      this.engineOsc2.frequency.setTargetAtTime(firing * 0.5, t, 0.05);
      this.engineFilter.frequency.setTargetAtTime(250 + throttle * 900, t, 0.1);
      this.engineGain.gain.setTargetAtTime(silent ? 0 : 0.12 + throttle * 0.22, t, 0.1);
    }
    const w = Math.min(1, airspeed / (jet ? 160 : 70));
    this.windFilter.frequency.setTargetAtTime(300 + w * 1400, t, 0.2);
    this.windGain.gain.setTargetAtTime(silent ? 0 : w * w * 0.35, t, 0.2);
    this.hornGain.gain.setTargetAtTime(stall && !silent ? 0.05 : 0, t, 0.03);
  }
}
