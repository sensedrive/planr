# planr – VR-Flugsimulator im Browser

Semi-realistischer Flugsimulator mit Three.js + WebXR. Läuft am Desktop (Tastatur, Maus, Gamepad)
und auf der Meta Quest 2 im Browser – mit greifbarem Steuerknüppel, Gashebel, Klappen- und Fahrwerkshebel.

**Spielen:** https://planr.46-224-167-199.nip.io

## Startmenü

| Option | Auswahl |
|---|---|
| Landschaft | Alpental · Fjordküste (Schären, steile Fjorde, Insel- und Fjordflugplatz) · New York (echtes Manhattan) |
| Flugzeug | 10 Typen, siehe unten |
| Mission | Freiflug · Luftstart · Landung (mit Wertung) · Ringparcours (Zeit) · Streckenflug zum zweiten Platz · Notwasserung im Hudson (New York) |
| Wind | Ruhig · Leicht · Stark · Böig |
| Wetter | Klar · Bewölkt · Regen (geschlossene Wolkendecke, Regen, schlechte Sicht) · Live (echte METAR von LaGuardia, nur New York) |
| Tageszeit | Tag · Abend · Nacht (mit Pistenbefeuerung) |
| Flugverhalten | Einfach · Realistisch (Propeller-Effekte, asymmetrischer Strömungsabriss, Trudeln) |
| Motorausfall | Aus · Zufällig · Nach dem Start |
| Flugverkehr | Aus · Normal · Viel – Platzrunden mit Touch-and-Go, Überlandflüge, in New York Airliner im Anflug auf LaGuardia |
| Start am Boden | Motor läuft · Kalt & dunkel (Batterie, Pumpe, Zündung, Anlasser selbst schalten) |
| Komfort | Vignette, Wackeln & Vibration, Sitzhöhe, Knüppelweg (VR) |

Jede Landung wird bewertet (Sinkrate, Mittellinie, Aufsetzpunkt, Querlage, 0–3 Sterne).
Neben jeder Schwelle zeigt ein **PAPI** den Gleitpfad: 2 weiß + 2 rot = richtig.

### Flugzeuge

| Typ | Besonderheit |
|---|---|
| Cessna (C172-artig) | Schulflugzeug, gutmütig |
| Piper Cub | Spornrad (Seitenruder beim Rollen nötig!), Abheben bei ~40 kn |
| Extra 300 | Kunstflug, > 250 °/s Rollrate, Spornrad |
| Beech Baron | zweimotorig, Einziehfahrwerk |
| DHC-2 Beaver | Wasserflugzeug auf Schwimmern – startet und landet auf dem Wasser |
| Pilatus PC-12 | Turboprop mit Drehmomentanzeige, T-Leitwerk |
| Segelflugzeug (ASK 21) | kein Motor, Bremsklappen auf dem Klappenhebel, Thermik und Hangaufwind, Variometer |
| Jet-Trainer (L-39-artig) | Einziehfahrwerk, Startklappen |
| A320 | Verkehrsflugzeug, braucht lange Pisten (LaGuardia) |
| F-16 | Nachbrenner, HUD, G-Anzug (verträgt mehr G) |

Die Tragflächen biegen sich mit der Last und schwingen bei Böen und auf der Piste nach. Unter hoher G-Last
wird die Sicht grau bis schwarz (bei negativer G rot); Piste, Turbulenz und Buffeting vor dem Strömungsabriss
rütteln Kopf, Knüppel (VR-Haptik) und Gamepad.

### Cockpit

Unter den Instrumenten liegt ein Schalterfeld: **BATT**, **PUMPE**, **ZÜND**, **START** (Anlasser),
**NAV**-, **BCN**-, **STROBE**- und **LANDE**-Licht (mit echtem Lichtkegel bei Nacht), **PANEL**-Beleuchtung,
**P-BREMS** (Parkbremse) sowie ein **Autopilot** mit Kurs- (HDG) und Höhenhaltung (ALT) und Wahlschaltern ±10° /
±500 ft. Treibstoff wird verbraucht – ist der Tank leer, steht der Motor. Alle Schalter lassen sich am Desktop
anklicken und in VR mit dem Finger drücken.

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
`R` Neustart · `L` Luftstart · `P` Pause · `M` Ton · `H` Hilfe · `Esc` Menü ·
`K` Motor anlassen · `O` Autopilot · `N` Landelicht

**Cockpit (Desktop):** Gashebel, Klappenhebel, Fahrwerkshebel und die Trimmräder für Höhen-, Quer- und
Seitenruder anklicken – links = mehr/runter/rechts, rechts = zurück.

**Gamepad:** linker Stick Höhe/Quer · rechter Stick Seitenruder · RT/LT Gas · A Bremse · B Fahrwerk ·
LB/RB Klappen · Steuerkreuz Trimmung · Y Kamera · Start Neustart · Back Menü

**Quest 2 (VR):** „Enter VR“ → mit der **Grifftaste** greifen: Knüppel (vor dir), Gashebel und Klappenhebel
(links), Fahrwerkshebel (Panel links, Jet), Trimmräder (Konsole rechts; Hand vor/zurück bzw. links/rechts bewegen).
Linker Stick: Seitenruder (links/rechts), Sitzhöhe (vor/zurück) · linker Trigger Bremse · X Ansicht zentrieren ·
Y/B Klappen · rechter Stick vor/zurück Trimmung · A Neustart · Stick-Klick Menü (Laser + Trigger)

**Handtracking (ohne Controller):** Faust schließen greift Knüppel und Hebel, Hand öffnen lässt los.
Die Taster „MENÜ“ und „ZENTR.“ über den Instrumenten mit dem Zeigefinger antippen; im Menü wählt Daumen-Zeigefinger-Pinch.

Tipps: Cessna – Vollgas, bei ~55 kn sanft ziehen, Steigflug ~70–75 kn, Landung mit Klappen bei ~60 kn.
Jet – Startklappen sind gesetzt, bei ~105 kn rotieren, nach dem Abheben `G` (Fahrwerk) und Klappen hoch,
Anflug mit Fahrwerk und vollen Klappen bei ~120–125 kn.

## Sound

Motorgeräusche aus echten CC0-Aufnahmen (freesound.org), nahtlos geschleift und nach Drehzahl überblendet:
Cessna 152 im Flug und beim Rollen von *keng-wai-chane-chick-te* ([444940](https://freesound.org/s/444940/),
[443290](https://freesound.org/s/443290/)), Turbinen von *qubodup* ([205581](https://freesound.org/s/205581/)) und
*szegvari* ([547050](https://freesound.org/s/547050/)). Wind, Rollgeräusch, Aufsetzen, Motoren, Regen und
Überziehwarnung sind synthetisiert. Neu schneiden: `node scripts/data/build-sounds.mjs <mp3-ordner> public/sounds`.

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

- `src/sim` – 6-DOF-Flugphysik je Flugzeugtyp (`types.ts`, 10 Typen): Aerodynamik mit Strömungsabriss, Trudeln,
  Bodeneffekt und Mach-Widerstand, Kolbenmotor/Turboprop/Jet mit Nachbrenner, Fahrwerk (Bugrad, Spornrad,
  Schwimmer, einziehbar), Bordsysteme und Autopilot (`systems.ts`), ISA-Atmosphäre; fester 120-Hz-Takt
- `src/world` – Szenarien (`scenarios/`: Alpental, Fjordküste, New York), Gelände mit LOD-Chunks (Kollision exakt
  auf dem sichtbaren Mesh, inkl. Gebäude), Stadt, Flugplätze, PAPI, Befeuerung, Himmel/Tageszeiten, Wolken
- `src/game` – Einstellungen, Wetter, Missionen, Landewertung, Ringparcours, KI-Flugverkehr (`traffic.ts`)
- `src/cockpit` – Cockpit-Layouts, Instrumente, alle greif-/klickbaren Bedienelemente
- `src/input` – Tastatur, Gamepad, VR-Controller, Maus-Klicks im Cockpit
- `src/view`, `src/ui` – Flugzeugmodelle aus dem Baukasten (`genericModel.ts`, mit Flügelbiegung und Lichtern),
  Kameras, Flug-Gefühl (`feel.ts`: Rütteln, G-Effekte), HUD, Vignette, Menüs

## Deployment

Jeder Push auf `main` läuft durch die CI (Typecheck, Tests, Build) und wird danach automatisch auf den
Docker-Host ausgerollt. Der CI-Schlüssel darf dort nur `/opt/planr/deploy.sh` ausführen
(Quelle: `scripts/remote-deploy.sh`). Manuell: `scripts/deploy.sh`.
