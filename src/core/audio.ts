/**
 * Flight audio: engine from real CC0 recordings (seamless loops, cross-faded and pitched by rpm),
 * plus synthesised wind, tyre rumble, touchdown, gear/flap motors and the stall horn.
 * Falls back to a synthesised engine while the recordings load or if they fail.
 */

export interface AudioState {
  /** propeller rpm, or N1 % for the jet */
  rpm: number;
  /** spooled power 0…1 */
  power: number;
  airspeed: number;
  groundSpeed: number;
  onGround: boolean;
  stall: boolean;
  /** engine, wind etc. muted (menu, pause, crash) */
  silent: boolean;
  jet: boolean;
  inCockpit: boolean;
  motors: boolean;
  /** 0…1 */
  rain: number;
}

interface Loop {
  name: string;
  base: number;
  loopStart: number;
  loopEnd: number;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
}

const PROP_LOOPS = ['c172-ground', 'c172-low', 'c172-cruise'];
const JET_LOOPS = ['jet-low', 'jet-high'];

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class FlightAudio {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private cabin!: BiquadFilterNode;
  private engineBus!: GainNode;
  private loops = new Map<string, Loop>();
  private loaded = false;
  private activeSet = '';
  // synth fallback
  private synthOsc!: OscillatorNode;
  private synthGain!: GainNode;
  private synthFilter!: BiquadFilterNode;
  // effects
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private rainGain!: GainNode;
  private motorGain!: GainNode;
  private hornGain!: GainNode;
  private noise!: AudioBuffer;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // everything except the horn passes the cabin filter (muffled inside the cockpit)
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = 3000;
    this.cabin.connect(this.master);
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0;
    this.engineBus.connect(this.cabin);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // synthesised engine (fallback)
    this.synthFilter = ctx.createBiquadFilter();
    this.synthFilter.type = 'lowpass';
    this.synthFilter.frequency.value = 500;
    this.synthGain = ctx.createGain();
    this.synthGain.gain.value = 0;
    this.synthOsc = ctx.createOscillator();
    this.synthOsc.type = 'sawtooth';
    this.synthOsc.connect(this.synthFilter).connect(this.synthGain).connect(this.cabin);
    this.synthOsc.start();

    const noiseSource = (filterType: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.cabin);
      src.start();
      return { f, g };
    };
    const wind = noiseSource('bandpass', 600, 0.5);
    this.windFilter = wind.f;
    this.windGain = wind.g;
    this.rumbleGain = noiseSource('lowpass', 180, 0.7).g;
    this.rainGain = noiseSource('highpass', 2500, 0.5).g;

    // electric motor whine for gear and flaps
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 210;
    const mf = ctx.createBiquadFilter();
    mf.type = 'bandpass';
    mf.frequency.value = 420;
    mf.Q.value = 2;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    motor.connect(mf).connect(this.motorGain).connect(this.cabin);
    motor.start();

    // stall horn: reed-like tone, not muffled (it is inside the cabin)
    const horn = ctx.createOscillator();
    horn.type = 'square';
    horn.frequency.value = 1580;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 1600;
    hf.Q.value = 4;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    horn.connect(hf).connect(this.hornGain).connect(this.master);
    horn.start();

    void this.loadSamples(ctx);
  }

  private async loadSamples(ctx: AudioContext): Promise<void> {
    try {
      const base = `${import.meta.env.BASE_URL}sounds/`;
      const meta = (await (await fetch(base + 'sounds.json')).json()) as { name: string; base: number; loopStart: number; loopEnd: number }[];
      await Promise.all(
        meta.map(async (m) => {
          const data = await (await fetch(`${base}${m.name}.wav`)).arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          const gain = ctx.createGain();
          gain.gain.value = 0;
          gain.connect(this.engineBus);
          this.loops.set(m.name, { name: m.name, base: m.base, loopStart: m.loopStart, loopEnd: m.loopEnd, buffer, source: null, gain });
        }),
      );
      this.loaded = true;
    } catch (e) {
      console.warn('engine recordings unavailable, using synthesised engine', e);
    }
  }

  /** Starts the loops of one aircraft and stops the others. */
  private activate(names: string[]): void {
    const key = names.join();
    if (key === this.activeSet || !this.ctx) return;
    this.activeSet = key;
    for (const l of this.loops.values()) {
      if (names.includes(l.name)) {
        if (!l.source) {
          const src = this.ctx.createBufferSource();
          src.buffer = l.buffer;
          src.loop = true;
          src.loopStart = l.loopStart;
          src.loopEnd = l.loopEnd;
          src.connect(l.gain);
          // random start offset so layers do not phase
          src.start(0, l.loopStart + Math.random() * (l.loopEnd - l.loopStart));
          l.source = src;
        }
      } else if (l.source) {
        l.source.stop();
        l.source.disconnect();
        l.source = null;
        l.gain.gain.value = 0;
      }
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** A short thump (and tyre chirp when fast); `fpm` = sink rate at touchdown. */
  /** Switch click in the cockpit. */
  click(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(f).connect(g).connect(this.cabin);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }

  touchdown(fpm: number, speed: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const strength = Math.min(1, Math.abs(fpm) / 600);
    const burst = (freq: number, type: BiquadFilterType, dur: number, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.cabin);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    };
    burst(120, 'lowpass', 0.25, 0.3 + strength * 0.9);
    if (speed > 15) burst(2200, 'bandpass', 0.18, 0.12 + strength * 0.2);
  }

  update(s: AudioState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const silent = s.silent;
    this.cabin.frequency.setTargetAtTime(s.inCockpit ? 2600 : 11000, t, 0.2);

    if (this.loaded) {
      this.synthGain.gain.setTargetAtTime(0, t, 0.1);
      const names = s.jet ? JET_LOOPS : PROP_LOOPS;
      this.activate(names);
      const weights = new Map<string, number>();
      if (s.jet) {
        const x = smooth(s.rpm, 60, 96);
        weights.set('jet-low', Math.cos((x * Math.PI) / 2));
        weights.set('jet-high', Math.sin((x * Math.PI) / 2));
      } else {
        const x = smooth(s.rpm, 1050, 2300);
        // on the ground (no airflow) the low layer is the taxi recording, in flight the gliding one
        const lowName = s.onGround && s.airspeed < 20 ? 'c172-ground' : 'c172-low';
        const other = lowName === 'c172-ground' ? 'c172-low' : 'c172-ground';
        weights.set(lowName, Math.cos((x * Math.PI) / 2));
        weights.set(other, 0);
        weights.set('c172-cruise', Math.sin((x * Math.PI) / 2));
      }
      for (const name of names) {
        const l = this.loops.get(name);
        if (!l?.source) continue;
        const rate = Math.min(1.45, Math.max(0.55, s.rpm / l.base));
        l.source.playbackRate.setTargetAtTime(rate, t, 0.08);
        l.gain.gain.setTargetAtTime(weights.get(name) ?? 0, t, 0.15);
      }
      const level = s.jet ? 0.35 + 0.65 * s.power : 0.45 + 0.55 * s.power;
      const engineOn = s.rpm > (s.jet ? 15 : 300);
      this.engineBus.gain.setTargetAtTime(silent || !engineOn ? 0 : level * (s.inCockpit ? 1 : 1.3), t, 0.15);
    } else {
      // synthesised fallback
      const f = s.jet ? 300 + s.rpm * 9 : (s.rpm / 60) * 2;
      this.synthOsc.frequency.setTargetAtTime(f, t, 0.05);
      this.synthFilter.frequency.setTargetAtTime(s.jet ? 700 + s.power * 2600 : 250 + s.power * 900, t, 0.1);
      this.synthGain.gain.setTargetAtTime(silent ? 0 : 0.08 + s.power * 0.15, t, 0.1);
    }

    // wind: the prop recordings already carry flight noise, so it is lighter there
    const w = Math.min(1, s.airspeed / (s.jet ? 160 : 75));
    this.windFilter.frequency.setTargetAtTime(350 + w * 1600, t, 0.2);
    this.windGain.gain.setTargetAtTime(silent ? 0 : w * w * (s.jet ? 0.5 : 0.18), t, 0.2);
    const roll = s.onGround ? Math.min(1, s.groundSpeed / 30) : 0;
    this.rumbleGain.gain.setTargetAtTime(silent ? 0 : roll * 0.5, t, 0.08);
    this.motorGain.gain.setTargetAtTime(s.motors && !silent ? 0.05 : 0, t, 0.08);
    // rain drumming on the windscreen, louder with speed
    this.rainGain.gain.setTargetAtTime(silent ? 0 : s.rain * (0.08 + Math.min(1, s.airspeed / 60) * 0.12), t, 0.3);
    // the horn pulses slightly like a reed
    this.hornGain.gain.setTargetAtTime(s.stall && !silent ? 0.05 + 0.02 * Math.sin(t * 40) : 0, t, 0.02);
  }
}
