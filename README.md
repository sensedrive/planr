# planr – VR-Flugsimulator im Browser

Semi-realistischer Kleinflugzeug-Simulator (an eine Cessna 172 angelehnt) mit Three.js + WebXR.
Läuft am Desktop (Tastatur, Maus, Gamepad) und auf der Meta Quest 2 im Browser mit greifbarem Steuerknüppel.

**Spielen:** https://planr.46-224-167-199.nip.io

## Steuerung

**Desktop:** `W`/`S` drücken/ziehen · `A`/`D` rollen · `Q`/`E` Seitenruder · `Shift`/`X` oder Mausrad Gas ·
`B` Bremse · `F`/`V` Klappen · `T`/`G` Trimmung · `C` Kamera · Maus ziehen umsehen · `R` Neustart · `L` Luftstart ·
`P` Pause · `M` Ton · `H` Hilfe

**Gamepad:** linker Stick Höhe/Quer · rechter Stick Seitenruder · RT/LT Gas · A Bremse · LB/RB Klappen ·
Steuerkreuz Trimmung · Y Kamera · Start Neustart

**Quest 2 (VR):** „Enter VR“ → mit der Grifftaste Knüppel (vor dir) und Gashebel (links) greifen ·
linker Stick Seitenruder · linker Trigger Bremse · X Ansicht zentrieren · Y/B Klappen hoch/runter ·
rechter Stick vor/zurück Trimmung · A Neustart

Tipp: Vollgas, bei ~55 kn sanft ziehen, im Steigflug ~70–80 kn halten. Landen mit Klappen bei ~60 kn.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:quest    # HTTPS im LAN für die Quest (Zertifikat einmal bestätigen)
npm run build
```

Ohne WLAN-HTTPS geht es auf der Quest auch per USB: `adb reverse tcp:5173 tcp:5173`, dann `http://localhost:5173`.

## Aufbau

- `src/sim` – 6-DOF-Flugphysik (Aerodynamik mit Strömungsabriss, Motor/Propeller, Fahrwerk, ISA-Atmosphäre), fester 120-Hz-Takt
- `src/world` – prozedurales Gelände mit LOD-Chunks, Himmel, Wolken, Flugplatz
- `src/cockpit` – Cockpit, Instrumente (Canvas), Knüppel und Gashebel
- `src/input` – Tastatur/Maus, Gamepad, VR-Controller
- `src/view` – Flugzeugmodell, Kameras, HUD

## Deployment

`scripts/deploy.sh` holt `main` von GitHub auf den Docker-Host, baut den nginx-Container (`deploy/compose.yml`)
und hängt `deploy/planr.caddy` in den gemeinsamen Caddy-Proxy ein.
