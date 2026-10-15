import { choiceAvailable, OPTIONS, type Settings } from '../game/settings';

export interface MenuHandlers {
  change(key: keyof Settings, value: string | number): void;
  fly(): void;
  resume(): void;
}

/** Desktop start/pause menu (HTML overlay). */
export class Menu {
  readonly el: HTMLElement;
  private readonly rows = new Map<keyof Settings, HTMLButtonElement[]>();
  private readonly resumeBtn: HTMLButtonElement;
  private readonly bestEl: HTMLElement;

  constructor(
    private readonly settings: Settings,
    private readonly handlers: MenuHandlers,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h1>planr</h1><p class="sub">VR-Flugsimulator · Cessna-artiges Kleinflugzeug</p>';
    for (const opt of OPTIONS) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = opt.label;
      const group = document.createElement('div');
      group.className = 'choices';
      const buttons = opt.choices.map((ch) => {
        const b = document.createElement('button');
        b.textContent = ch.label;
        b.addEventListener('click', () => {
          this.handlers.change(opt.key, ch.value);
          this.refresh();
        });
        group.appendChild(b);
        return b;
      });
      this.rows.set(opt.key, buttons);
      row.append(label, group);
      card.appendChild(row);
    }
    this.bestEl = document.createElement('p');
    this.bestEl.className = 'best';
    card.appendChild(this.bestEl);

    const footer = document.createElement('div');
    footer.className = 'footer';
    this.resumeBtn = document.createElement('button');
    this.resumeBtn.textContent = 'Weiter';
    this.resumeBtn.addEventListener('click', () => this.handlers.resume());
    const fly = document.createElement('button');
    fly.className = 'primary';
    fly.textContent = 'Fliegen';
    fly.addEventListener('click', () => this.handlers.fly());
    footer.append(this.resumeBtn, fly);
    card.appendChild(footer);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc öffnet das Menü · Quest 2: „Enter VR“ unten, Menü dort per Stick-Klick';
    card.appendChild(hint);

    this.el.appendChild(card);
    document.body.appendChild(this.el);
    this.refresh();
  }

  get open(): boolean {
    return this.el.style.display !== 'none';
  }

  show(canResume: boolean, best: string): void {
    this.resumeBtn.style.display = canResume ? '' : 'none';
    this.bestEl.textContent = best;
    this.refresh();
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  refresh(): void {
    for (const opt of OPTIONS) {
      const buttons = this.rows.get(opt.key)!;
      opt.choices.forEach((ch, i) => {
        buttons[i].classList.toggle('active', this.settings[opt.key] === ch.value);
        buttons[i].disabled = !choiceAvailable(ch, this.settings);
      });
    }
  }
}
