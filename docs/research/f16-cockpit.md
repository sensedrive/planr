# Recherche: Ein realistisches F-16-Cockpit für planr

Stand 2026-10-17. Ziel: ein F-16-Cockpit, das auf der Meta Quest im Browser glaubwürdig wirkt und bei 72–90 Hz läuft.

## Kurzfassung

1. **Geometrie nicht mehr im Code bauen.** Das bisherige Cockpit (`src/cockpit/`) entsteht aus Boxen und Canvas-Texturen und ist für alle Typen gleich aufgebaut. Für eine F-16 reicht das nicht. Das Cockpit sollte als **glTF aus Blender** kommen: Wanne, Konsolen, Sitz, Glareshield und Canopy-Rahmen als statisches Mesh, bewegliche Teile (Stick, Throttle, Schalter) als eigene Nodes.
2. **Licht backen.** Ambient Occlusion und Lightmap in Blender backen; das macht den größten Sprung in der Wirkung und kostet zur Laufzeit fast nichts.
3. **Das HUD muss nach Unendlich kollimiert werden.** Heute wird das HUD auf die Combiner-Scheibe gemalt (`src/cockpit/hudDisplay.ts`). In VR sieht man die Symbole dann scharf auf ~0,7 m, während der Horizont unendlich weit weg ist: Doppelbilder, und die Symbole wandern bei Kopfbewegung über den Horizont. Echte HUDs projizieren auf Unendlich.
4. **F-16-Ergonomie stimmt mit dem Standard-Layout nicht überein:** Side-Stick rechts auf der Konsole statt zwischen den Knien, 30° zurückgelehnter Sitz, Bubble-Canopy ohne vorderen Rahmen.
5. **Displays als Canvas-Texturen behalten** (MFDs, DED), aber gedrosselt aktualisieren und gestochen scharf machen.

## 1. Was das echte Cockpit ausmacht

Belegt (Wikipedia, General Dynamics F-16):

- **Sitz:** ACES II, um **30° zurückgelehnt** (andere Jäger 13–15°). Das bestimmt Augpunkt, Blickwinkel auf Panel und Konsolen.
- **Canopy:** einteilige Polycarbonat-Blase **ohne vorderen Rahmen**, Sicht nach unten **40° über die Seite und 15° über die Nase**. Das gibt die typische „man sitzt auf der Spitze“-Wirkung, die in VR enorm zählt.
- **Side-Stick** auf der rechten Armlehne, Fly-by-Wire, kraftgesteuert mit nur wenig Spiel. Throttle links, HOTAS-Schalter an beiden.
- **MFDs:** links Primäranzeige (Radar, Karte), rechts Systeme; ab Block 50/52 Farb-LCDs statt monochromer CRTs.
- **HUD** oberhalb des Glareshields, Upfront Controls (ICP + DED) direkt darunter.

Allgemeines Sim-Wissen, nicht primär belegt, vor dem Modellieren an Fotos prüfen:

- DED: grüne Textanzeige, 5 Zeilen à ca. 24 Zeichen, unter dem HUD.
- MFDs etwa 4 × 4 Zoll, Schalterleisten (OSBs) rundherum.
- Rechte Konsole: Licht, Klima, Avionik-Power; linke Konsole: Funk, Fuel, Flight Control; Fahrwerkshebel links am Panel.

**Welcher Block?** Empfehlung **F-16C Block 50/52**: die bekannteste Variante (DCS, Falcon BMS), viel Fotomaterial, zwei Farb-MFDs. Block 70/72 hat einen großen Center Pedestal Display, dazu habe ich keine belastbaren Quellen gefunden.

**Referenzmaterial:** Es gibt keine offiziellen Maßzeichnungen. Cockpit-Nachbauer nutzen die Pläne von Joseph Bosnjak und Todd Ferrante (die sich laut Forum widersprechen) und die Galerie auf habu2.net/viperpits ([f-16.net-Thread](https://www.f-16.net/forum/viewtopic.php?p=4516)). Für Proportionen reichen Fotos plus die bekannten Größen (MFD, Sitz, Augpunkt ca. 0,8 m über Sitzfläche).

## 2. Woher das 3D-Modell kommt

| Weg | Qualität | Lizenzrisiko | Aufwand |
|---|---|---|---|
| Selbst in Blender modellieren, nach Fotos | hoch, voll auf Quest zugeschnitten | keins | hoch (Tage bis Wochen) |
| Kaufmodell anpassen, z. B. [RenderHub F-16D Block 60 mit Cockpit](https://www.renderhub.com/sirios-3d/f-16d-block60-with-cockpit-rigged-changabel-textures-decals), [CGTrader](https://www.cgtrader.com/3d-models/aircraft/military-aircraft/f-16d-egyptian-airforce) | hoch | **mittel bis hoch**: Web-Spiele liefern das Modell auslesbar aus; viele Lizenzen verbieten das | mittel (Retopo + Bake nötig) |
| [free3d „F-16 cockpit“](https://free3d.com/3d-model/f-16-cockpit-3163.html) | 263k Polygone, 92 Texturen, nicht game-ready | als „Editorial Only“ markiert, für ein Spiel ungeeignet | — |
| [NPS Savage F16.x3d](https://savage.nps.edu/Savage/AircraftFixedWing/F16FightingFalconTurkey/F16.html) | sehr einfach (2003) | Studentenprojekt, Freigabe nur nicht-kommerziell | — |
| DCS / Falcon BMS / MSFS-Add-ons | sehr hoch | **nicht erlaubt** | — |

**Empfehlung:** selbst modellieren (oder modellieren lassen) und die Kaufmodelle höchstens als Referenz ansehen. Bei einem Kaufmodell vorher klären, ob die Lizenz die Auslieferung in einer Web-App erlaubt.

## 3. Rendering auf der Quest

Budgets (Needle Engine, [VR Performance](https://engine.needle.tools/docs/how-to-guides/xr/vr-performance); Meta, [WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/)):

- **< 100 Draw Calls**, **200–300k sichtbare Dreiecke** insgesamt, Quest 2: 72–90 Hz (11–14 ms), Quest 3: bis 120 Hz.
- Statik mergen, wenige Materialien, **KTX2/Basis-Texturen** (4–8× weniger GPU-Speicher), **gebackene Lightmaps statt Echtzeit-Schatten**, höchstens ein Schatten werfendes Licht, wenig Transparenz.

Daraus für das Cockpit (meine Ableitung):

- **Budget Cockpit:** 60–100k Dreiecke, 3–6 Draw Calls für die Statik (ein Atlas für Konsolen/Panel, einer für Sitz/Wanne, Glas separat), bewegliche Teile extra.
- **Texturen:** ein 2048er Atlas Albedo + ein 2048er Atlas für gebackene AO/Licht, Normal-Map nur für Sitzpolster und Wannenstruktur. Beschriftungen (Schalterlabels, Warnschilder) in den Albedo-Atlas, da sie das „echt“-Gefühl tragen.
- **Engine-Lücken** (aus `src/engine/shaders/mesh.ts`): der Mesh-Shader kennt `map`, `emissiveMap`, Roughness/Metalness, aber **keine Normal-Map und keine zweite UV für Lightmap/AO**. Beides müsste dazukommen. Ein glTF-Loader fehlt auch; da die Engine three.js-Szenengraphen zeichnet, geht `GLTFLoader` (mit `KTX2Loader` und Meshopt-Decoder) direkt.
- **Sonne im Cockpit:** Die vorhandene Schattenkarte für bewegte Sonnenschatten des Canopy-Rahmens und Kopfstütze nutzen, Rest gebacken. Leicht spiegelnde Canopy (Fresnel) mit Kratzer-/Staubtextur verkauft das Glas.
- **Nacht:** Panel-Hinterleuchtung über `emissiveMap` (grüne/weiße Beschriftung), Flutlicht als einzelnes Spotlicht.

## 4. HUD richtig machen

Ein HUD-Combiner ist auf Unendlich fokussiert; die Symbole liegen optisch so weit weg wie die Landschaft, und der Horizontstrich deckt sich mit dem echten Horizont ([FlightGlobal, How HUD works](https://www.flightglobal.com/how-hud-works/6706.article)). Genau das Problem beschreiben VR-Piloten in MSFS, wenn Symbole nicht auf Unendlich liegen ([MSFS-Forum](https://forums.flightsimulator.com/t/f-a-18e-f-hmd-symbology-not-focused-aligned-at-infinity-in-vr/547033)).

Umsetzung in planr:

1. Symbole nicht auf die Glasfläche, sondern auf eine **Ebene sehr weit vor dem Flugzeug** (z. B. 2 km in Flugzeugachse, ohne Tiefentest, immer obenauf) zeichnen. Beide Augen sehen dann praktisch keine Disparität, und die Symbole bleiben bei Kopfbewegung ruhig auf dem Horizont.
2. **Nur durch das Glas sichtbar:** die Combiner-Scheibe zuerst in den Stencil-Buffer schreiben, dann die HUD-Ebene nur dort zeichnen. Schaut der Pilot am Glas vorbei, verschwindet das HUD wie in echt.
3. Grün additiv blenden, leicht überhellt (HDR-Emissive) für etwas Bloom.
4. Die vorhandene Winkel-Logik in `hudDisplay.ts` (Pixel pro Grad, Boresight) passt schon, sie muss nur auf die ferne Ebene umgerechnet werden. Das HUD hat ca. 20–25° Sichtfeld (nicht primär belegt).

Das ist die eine Änderung, die auch das bestehende L-39-HUD sofort besser macht.

## 5. Displays und Text

- MFDs und DED wie bisher als Canvas-Texturen, aber mit **10–20 Hz** statt jedes Frame aktualisieren und auf mehrere Frames verteilen (Meta empfiehlt, Updates zu staffeln).
- Für **scharfe Schrift** in VR: Texturen mit Mipmaps und anisotroper Filterung, Glyphen nicht kleiner als ca. 3 px. Bei Bedarf später **WebXR Quad Layers** ([MDN createQuadLayer](https://developer.mozilla.org/docs/Web/API/XRWebGLBinding/createQuadLayer)) für ein MFD: der Kompositor zeichnet sie direkt, ohne doppelte Abtastung; der Quest Browser unterstützt WebXR Layers, Aufwand und Tiefensortierung mit dem Cockpit sind aber knifflig.
- Inhalte pro MFD nur ein, zwei glaubwürdige Seiten (z. B. HSD-Karte und Triebwerk/Fuel), keine vollständige Avionik.

## 6. Bedienung in VR

- `src/cockpit/layout.ts` setzt den Stick zwischen die Knie. Für die F-16 braucht `CockpitLayout` einen Side-Stick-Modus: Pivot rechts neben dem Sitz auf Armlehnenhöhe, **sehr kurzer Weg** (Kraft-Stick), Throttle links.
- Quest-Controller: Griff am Stick halten, kleine Handbewegung = volle Kraft; das passt zum echten Kraft-Stick sogar besser als ein Mittelknüppel.
- Augpunkt und Kamera-Rig an den 30°-Sitz anpassen, Kopfstütze und Rahmen hinter dem Kopf sichtbar machen.
- Klickbare Schalter auf wenige wichtige beschränken (Master Arm, Gear, Lichter, Jet Fuel Starter), Rest nur gebacken.

## 7. Was außerhalb des Cockpits dazugehört

Ohne passendes Flugverhalten wirkt auch das schönste Cockpit falsch: F-16-Typ in `src/sim/types.ts` mit FBW-Steuergesetz (Stick = g-Vorgabe, AoA-Limit), 9-g-Grenze, Nachbrenner-Sound. `src/view/feel.ts` (Blackout/Redout) ist schon da.

## Vorgeschlagene Reihenfolge

1. HUD auf Unendlich (klein, verbessert sofort das L-39).
2. glTF-Laden + Normal-Map + Lightmap-UV in der Engine.
3. Blender-Cockpit F-16C Block 50, erst Graumodell mit Bake testen, dann Texturen.
4. Side-Stick-Layout + F-16-Flugmodell.
5. MFD/DED-Inhalte, Nachtbeleuchtung.

## Quellen

- [Wikipedia: General Dynamics F-16 Fighting Falcon](https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon) (Sitz, Canopy, Side-Stick, MFDs)
- [Meta: WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/)
- [Needle Engine: VR Performance](https://engine.needle.tools/docs/how-to-guides/xr/vr-performance)
- [FlightGlobal: How HUD works](https://www.flightglobal.com/how-hud-works/6706.article)
- [MSFS-Forum: HMD-Symbole nicht auf Unendlich in VR](https://forums.flightsimulator.com/t/f-a-18e-f-hmd-symbology-not-focused-aligned-at-infinity-in-vr/547033)
- [MDN: XRWebGLBinding.createQuadLayer()](https://developer.mozilla.org/docs/Web/API/XRWebGLBinding/createQuadLayer)
- [f-16.net: CAD-Zeichnungen des F-16-Cockpits](https://www.f-16.net/forum/viewtopic.php?p=4516)
- Modelle: [RenderHub](https://www.renderhub.com/sirios-3d/f-16d-block60-with-cockpit-rigged-changabel-textures-decals), [CGTrader](https://www.cgtrader.com/3d-models/aircraft/military-aircraft/f-16d-egyptian-airforce), [free3d](https://free3d.com/3d-model/f-16-cockpit-3163.html), [NPS Savage](https://savage.nps.edu/Savage/AircraftFixedWing/F16FightingFalconTurkey/F16.html)
