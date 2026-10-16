export interface ReplayBarHandlers {
  start(): void;
  stop(): void;
  camera(): void;
  pause(): void;
  seek(seconds: number): void;
  speed(dir: number): void;
}

/** Desktop replay controls: an offer button after a crash/landing and a transport bar while playing. */
export class ReplayBar {
  private readonly offer: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private lastCaption = '';

  constructor(handlers: ReplayBarHandlers) {
    this.offer = document.createElement('button');
    this.offer.id = 'replay-offer';
    this.offer.textContent = '▶ Wiederholung (J)';
    this.offer.addEventListener('click', () => handlers.start());
    this.offer.style.display = 'none';

    this.bar = document.createElement('div');
    this.bar.id = 'replay-bar';
    this.bar.style.display = 'none';
    this.caption = document.createElement('span');
    this.caption.className = 'caption';
    const button = (text: string, title: string, action: () => void) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', action);
      return b;
    };
    this.pauseBtn = button('Pause', 'Leertaste', () => handlers.pause());
    this.bar.append(
      this.caption,
      button('Kamera', 'C', () => handlers.camera()),
      button('−5 s', '←', () => handlers.seek(-5)),
      this.pauseBtn,
      button('+5 s', '→', () => handlers.seek(5)),
      button('Tempo −', '↓', () => handlers.speed(-1)),
      button('Tempo +', '↑', () => handlers.speed(1)),
      button('Ende', 'J / Esc', () => handlers.stop()),
    );
    // presses must not reach the canvas (camera drag, cockpit clicks)
    for (const el of [this.offer, this.bar]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      document.body.appendChild(el);
    }
  }

  update(offered: boolean, playing: boolean, caption: string, paused: boolean): void {
    this.offer.style.display = offered && !playing ? '' : 'none';
    this.bar.style.display = playing ? '' : 'none';
    if (!playing) return;
    if (caption !== this.lastCaption) {
      this.lastCaption = caption;
      this.caption.textContent = `▶ ${caption}`;
    }
    this.pauseBtn.textContent = paused ? 'Weiter' : 'Pause';
  }
}
