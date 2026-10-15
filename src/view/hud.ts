import type { Aircraft } from '../sim/aircraft';
import type { ControlState } from '../core/input';

/** Desktop overlay: flight data, help and centred messages. */
export class Hud {
  private readonly hud = document.getElementById('hud')!;
  private readonly help = document.getElementById('help')!;
  private readonly message = document.getElementById('message')!;
  private timer = 0;
  private lastMessage = '';

  toggleHelp(): void {
    this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
  }

  setMessage(title: string, subtitle = ''): void {
    const html = title ? `${title}${subtitle ? `<small>${subtitle}</small>` : ''}` : '';
    if (html === this.lastMessage) return;
    this.lastMessage = html;
    this.message.innerHTML = html;
    this.message.style.display = html ? 'block' : 'none';
  }

  update(dt: number, ac: Aircraft, c: ControlState, fps: number): void {
    this.timer += dt;
    if (this.timer < 0.1) return;
    this.timer = 0;
    const pad = (v: number, n = 5) => String(Math.round(v)).padStart(n, ' ');
    const lines = [
      `Fahrt   ${pad(ac.airspeedKt)} kn`,
      `Höhe    ${pad(ac.altitudeFt)} ft`,
      `Steigen ${pad(ac.verticalSpeedFpm)} ft/min`,
      `Kurs    ${pad(ac.headingDeg)} °`,
      `Gas     ${pad(c.throttle * 100)} %   ${pad(ac.engine.rpm, 4)} rpm`,
      `Klappen ${pad(ac.flaps * 30)} °`,
      `Trimm   ${pad(c.trim * 100)} %`,
      `AoA     ${pad((ac.aero.alpha * 180) / Math.PI)} °`,
      `${pad(fps, 3)} fps`,
    ];
    let html = lines.join('\n');
    if (ac.stallWarning) html += '\n<span class="warn">STALL</span>';
    if (c.brake > 0) html += '\n<span class="warn">BREMSE</span>';
    this.hud.innerHTML = html;
  }
}
