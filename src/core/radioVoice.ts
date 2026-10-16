import { type RadioContext, RadioScript, type Transmission } from '../game/radio';
import type { FlightAudio } from './audio';

/** pause between two calls (s) */
const GAP = 0.9;
/** caption stays a moment after the voice ends (s) */
const LINGER = 2.5;
/** speech that has not started by then counts as unsupported (s) */
const START_TIMEOUT = 1.6;

const synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * The COM radio: reads the tower/traffic script out with the browser's German speech synthesis,
 * framed by squelch clicks and hiss from the flight audio. Where no speech synthesis works
 * (some VR browsers) it falls back to radio babble; the caption is always shown.
 */
export class RadioOperator {
  readonly script = new RadioScript();
  /** "TWR: D-EPLR, Piste 24, Start frei" while a call is on air (and shortly after) */
  caption = '';
  private current: Transmission | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private started = false;
  private elapsed = 0;
  /** expected length of the current call (s) */
  private expected = 0;
  private gap = 0;
  private linger = 0;
  /** speech failed once: babble from then on */
  private noSpeech = synth === null;
  private voice: SpeechSynthesisVoice | null = null;
  private primed = false;

  constructor(private readonly audio: FlightAudio) {
    const pick = () => {
      const voices = synth?.getVoices() ?? [];
      const de = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
      this.voice = de.find((v) => /google|anna|petra|markus|helena|katja/i.test(v.name)) ?? de[0] ?? null;
    };
    pick();
    synth?.addEventListener?.('voiceschanged', pick);
  }

  /** Speech must be unlocked by a user gesture in some browsers: call from one. */
  prime(): void {
    if (!synth || this.primed) return;
    this.primed = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }

  /** Cuts the current call (COM off, pause, menu, replay). The queue is kept. */
  silence(): void {
    if (this.current) {
      this.audio.radioKey(false);
      this.current = null;
    }
    if (this.utterance) synth?.cancel();
    this.utterance = null;
    this.caption = '';
    this.linger = 0;
  }

  /** Clears everything for a new flight. */
  reset(...args: Parameters<RadioScript['reset']>): void {
    this.silence();
    this.script.reset(...args);
    this.gap = 1.5;
  }

  /** `powered`: COM switch and battery on. */
  update(dt: number, ctx: RadioContext, powered: boolean): void {
    this.script.update(dt, ctx);
    if (!powered) {
      this.silence();
      this.script.queue.length = 0;
      return;
    }
    if (this.current) {
      this.elapsed += dt;
      if (!this.started && !this.noSpeech && this.utterance && this.elapsed > START_TIMEOUT) {
        // speech never started: this browser cannot speak, babble instead
        this.noSpeech = true;
        this.utterance = null;
        synth?.cancel();
        this.babble();
      }
      // onend can go missing (Chrome): never hang on a call
      if (this.elapsed > this.expected * 1.8 + 3 || (this.noSpeech && this.elapsed > this.expected + 0.3)) this.finish();
      return;
    }
    if (this.linger > 0) {
      this.linger -= dt;
      if (this.linger <= 0) this.caption = '';
    }
    this.gap -= dt;
    if (this.gap > 0) return;
    const next = this.script.next();
    if (next) this.begin(next);
  }

  private begin(t: Transmission): void {
    this.current = t;
    this.started = false;
    this.elapsed = 0;
    this.expected = 0.6 + t.speech.length * 0.068;
    this.caption = `${t.from}: ${t.text}`;
    this.audio.radioKey(true);
    if (this.noSpeech || this.audio.muted) {
      this.started = true;
      if (!this.audio.muted) this.babble();
      return;
    }
    const u = new SpeechSynthesisUtterance(t.speech);
    u.lang = 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.pitch = t.pitch;
    u.rate = t.station === 'tower' ? 1.15 : 1.08;
    u.onstart = () => (this.started = true);
    u.onend = () => this.utterance === u && this.finish();
    u.onerror = () => {
      if (this.utterance !== u) return;
      this.noSpeech = !this.started;
      this.finish();
    };
    this.utterance = u;
    synth!.speak(u);
  }

  private babble(): void {
    const t = this.current;
    if (t) this.audio.radioBabble(this.expected, t.pitch);
  }

  private finish(): void {
    if (!this.current) return;
    this.current = null;
    this.utterance = null;
    this.audio.radioKey(false);
    this.gap = GAP;
    this.linger = LINGER;
  }
}
