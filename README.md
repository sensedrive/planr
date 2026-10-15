# planr – VR-Flugsimulator im Browser

Semi-realistischer Flugsimulator mit Three.js + WebXR. Läuft am Desktop (Tastatur, Maus, Gamepad)
und auf der Meta Quest 2 im Browser – mit greifbarem Steuerknüppel, Gashebel, Klappen- und Fahrwerkshebel.

**Spielen:** https://planr.46-224-167-199.nip.io

## Startmenü

| Option | Auswahl |
|---|---|
| Landschaft | Alpental · Fjordküste (Schären, steile Fjorde, Insel- und Fjordflugplatz) · New York (echtes Manhattan) |
| Flugzeug | Cessna-artig (Kolbenmotor, festes Fahrwerk) · Jet-Trainer (L-39-artig, Einziehfahrwerk) |
| Mission | Freiflug · Luftstart · Landung (mit Wertung) · Ringparcours (Zeit) · Streckenflug zum zweiten Platz · Notwasserung im Hudson (New York) |
| Wind | Ruhig · Leicht · Stark · Böig |
| Tageszeit | Tag · Abend · Nacht (mit Pistenbefeuerung) |
| Flugverhalten | Einfach · Realistisch (Propeller-Effekte, asymmetrischer Strömungsabriss, Trudeln) |
| Motorausfall | Aus · Zufällig · Nach dem Start |
| Komfort | Vignette, Sitzhöhe, Knüppelweg (VR) |

Jede Landung wird bewertet (Sinkrate, Mittellinie, Aufsetzpunkt, Querlage, 0–3 Sterne).
Neben jeder Schwelle zeigt ein **PAPI** den Gleitpfad: 2 weiß + 2 rot = richtig.

### New York

73 859 Gebäude aus echten Grundrissen und Dachhöhen (ganz Manhattan, in Brooklyn/Queens ab ~12 m), Hudson,
East River, Central Park, LaGuardia (Pisten 04/22 und 13/31), Brooklyn-, Manhattan-, Williamsburg- und
Queensboro Bridge, Freiheitsstatue, Spitzen von Empire State Building, One World Trade Center und Chrysler Building.
Bei Nacht leuchten die Fenster. Gebäude sind fest – wer hineinfliegt, stürzt ab.

Missionen: Sightseeing-Ringparcours (Hudson → Freiheitsstatue → East River → Central Park) und
**Notwasserung**: Motorausfall über Upper Manhattan, Gleitflug zum Hudson – langsam, Flächen waagerecht,
Nase leicht hoch aufsetzen.

Datenquellen: Gebäude & Parks © [NYC Open Data](https://opendata.cityofnewyork.us/) (Building Footprints,
Parks Properties) · Wasserflächen: US Census Bureau TIGER/Line (gemeinfrei) · Gelände: Mapzen/Tilezen Terrain
Tiles (AWS Open Data). Neu erzeugen: `node scripts/data/build-nyc.mjs <rohdaten-ordner> public/data/nyc`.

## Steuerung

**Desktop:** `W`/`S` drücken/ziehen · `A`/`D` rollen · `Q`/`E` Seitenruder · `Shift`/`X` oder Mausrad Gas ·
`B` Bremse · `F`/`V` Klappen · `G` Fahrwerk · `,`/`.` Trimmung · `C` Kamera · Maus ziehen umsehen ·
`R` Neustart · `L` Luftstart · `P` Pause · `M` Ton · `H` Hilfe · `Esc` Menü

**Cockpit (Desktop):** Gashebel, Klappenhebel, Fahrwerkshebel und die Trimmräder für Höhen-, Quer- und
Seitenruder anklicken – links = mehr/runter/rechts, rechts = zurück.

**Gamepad:** linker Stick Höhe/Quer · rechter Stick Seitenruder · RT/LT Gas · A Bremse · B Fahrwerk ·
LB/RB Klappen · Steuerkreuz Trimmung · Y Kamera · Start Neustart · Back Menü

**Quest 2 (VR):** „Enter VR“ → mit der **Grifftaste** greifen: Knüppel (vor dir), Gashebel und Klappenhebel
(links), Fahrwerkshebel (Panel links, Jet), Trimmräder (Konsole rechts; Hand vor/zurück bzw. links/rechts bewegen).
Linker Stick: Seitenruder (links/rechts), Sitzhöhe (vor/zurück) · linker Trigger Bremse · X Ansicht zentrieren ·
Y/B Klappen · rechter Stick vor/zurück Trimmung · A Neustart · Stick-Klick Menü (Laser + Trigger)

Tipps: Cessna – Vollgas, bei ~55 kn sanft ziehen, Steigflug ~70–75 kn, Landung mit Klappen bei ~60 kn.
Jet – Startklappen sind gesetzt, bei ~105 kn rotieren, nach dem Abheben `G` (Fahrwerk) und Klappen hoch,
Anflug mit Fahrwerk und vollen Klappen bei ~120–125 kn.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:quest    # HTTPS im LAN für die Quest (Zertifikat einmal bestätigen)
npm test             # Flugphysik-Regressionstests (Vitest)
npm run build
```

Ohne WLAN-HTTPS geht es auf der Quest auch per USB: `adb reverse tcp:5173 tcp:5173`, dann `http://localhost:5173`.

## Aufbau

- `src/sim` – 6-DOF-Flugphysik je Flugzeugtyp (`types.ts`): Aerodynamik mit Strömungsabriss, Trudeln und
  Bodeneffekt, Kolbenmotor/Jet-Triebwerk, Fahrwerk (auch einziehbar), ISA-Atmosphäre; fester 120-Hz-Takt
- `src/world` – Szenarien (`scenarios/`: Alpental, Fjordküste, New York), Gelände mit LOD-Chunks (Kollision exakt
  auf dem sichtbaren Mesh, inkl. Gebäude), Stadt, Flugplätze, PAPI, Befeuerung, Himmel/Tageszeiten, Wolken
- `src/game` – Einstellungen, Wetter, Missionen, Landewertung, Ringparcours
- `src/cockpit` – Cockpit-Layouts, Instrumente, alle greif-/klickbaren Bedienelemente
- `src/input` – Tastatur, Gamepad, VR-Controller, Maus-Klicks im Cockpit
- `src/view`, `src/ui` – Flugzeugmodelle, Kameras, HUD, Vignette, Menüs

## Deployment

Jeder Push auf `main` läuft durch die CI (Typecheck, Tests, Build) und wird danach automatisch auf den
Docker-Host ausgerollt. Der CI-Schlüssel darf dort nur `/opt/planr/deploy.sh` ausführen
(Quelle: `scripts/remote-deploy.sh`). Manuell: `scripts/deploy.sh`.
