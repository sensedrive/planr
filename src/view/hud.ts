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

  update(dt: number, ac: Aircraft, c: ControlState, fps: number, wind: string, status: string): void {
    this.timer += dt;
    if (this.timer < 0.1) return;
    this.timer = 0;
    const pad = (v: number, n = 5) => String(Math.round(v)).padStart(n, ' ');
    const lines = [
      `Fahrt   ${pad(ac.airspeedKt)} kn`,
      `Höhe    ${pad(ac.altitudeFt)} ft`,
      `Steigen ${pad(ac.verticalSpeedFpm)} ft/min`,
      `Kurs    ${pad(ac.headingDeg)} °`,
      ac.type.sound === 'jet'
        ? `Gas     ${pad(c.throttle * 100)} %   N1 ${pad(ac.engine.rpm, 3)} %${(ac.engine as { reheat?: boolean }).reheat ? '  NACHBRENNER' : ''}`
        : ac.type.sound === 'turboprop'
          ? `Gas     ${pad(c.throttle * 100)} %   TQ ${pad(ac.engine.rpm, 3)} %`
          : ac.type.sound === 'glider'
            ? `Segelflug – kein Motor`
            : `Gas     ${pad(c.throttle * 100)} %   ${pad(ac.engine.rpm, 4)} rpm`,
      `Klappen ${pad(ac.flaps * ac.type.flapDegrees)} °${ac.type.retractableGear ? `   Fahrwerk ${ac.gear > 0.98 ? 'unten' : ac.gear < 0.02 ? 'oben' : '…'}` : ''}`,
      `Trimm   ${pad(c.trim * 100)} %`,
      `AoA     ${pad((ac.aero.alpha * 180) / Math.PI)} °`,
      `Wind    ${wind}`,
      ...(ac.systems.capacity > 0 ? [`Tank    ${pad(ac.systems.fuelFraction * 100)} %`] : []),
      ...(ac.systems.ap.on
        ? [`AP      ${ac.systems.ap.hdg ? `HDG ${String(ac.systems.ap.heading).padStart(3, '0')}` : 'ROLL'} ${ac.systems.ap.alt ? `ALT ${ac.systems.ap.altitudeFt}` : ''}`]
        : []),
      `${pad(fps, 3)} fps`,
    ];
    if (status) lines.push('', status);
    let html = lines.join('\n');
    if (ac.stallWarning) html += '\n<span class="warn">STALL</span>';
    if (c.brake > 0) html += '\n<span class="warn">BREMSE</span>';
    if (ac.engine.failed) html += '\n<span class="warn">MOTOR AUS</span>';
    else if (!ac.engine.running && ac.type.sound !== 'glider')
      html += `\n<span class="warn">${ac.systems.starting ? 'ANLASSEN …' : 'MOTOR STEHT – K: anlassen'}</span>`;
    if (ac.systems.parkBrake) html += '\n<span class="warn">PARKBREMSE</span>';
    this.hud.innerHTML = html;
  }
}
