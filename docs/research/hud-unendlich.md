# Recherche: HUD-Symbolik im Unendlichen (Issue #5)

Stand 2026-10-17. Frage: Wie zeichnen wir die HUD-Symbolik so, dass sie in VR optisch im Unendlichen liegt (keine Disparität zwischen den Augen, ruhig auf dem Horizont bei Kopfbewegung) und nur durch die Combiner-Scheibe sichtbar ist? Welche Technik passt zur eigenen WebGL2-Engine mit Multiview?

Ergänzt Abschnitt 4 von [`f16-cockpit.md`](f16-cockpit.md). Dort steht als Vorschlag „ferne Ebene plus Stencil-Maske“. Diese Recherche kommt zu einer anderen Empfehlung.

## Kurzfassung

1. **Empfehlung: Projektion im Fragment-Shader der Scheibe** (Richtungs-Lookup). Die Combiner-Scheibe bleibt das einzige Mesh. Ihr Shader rechnet pro Pixel die Blickrichtung Auge → Pixel aus, dreht sie in das Flugzeug-/HUD-System und liest daraus die Texturkoordinate der HUD-Textur. Die Position auf der Scheibe geht nicht ein, nur die Richtung. Damit liegt die Symbolik exakt im Unendlichen. Jedes Auge bekommt über `gl_ViewID_OVR` seine eigene Augposition, also keine Disparität.
2. **Die Maske gibt es dabei gratis:** Fragmente entstehen nur dort, wo die Scheibe ist. Hände oder Stick vor der Scheibe verdecken sie über den normalen Tiefentest. **Stencil ist nicht nötig.** Die Engine hat heute auch keinen (siehe unten).
3. **Ferne Ebene plus Stencil** ist optisch gleichwertig, braucht aber Depth-Stencil-Formate an drei Stellen, Stencil-State in der Engine und einen zusätzlichen Draw. Lohnt sich hier nicht.
4. **Bestehende Sims:** DCS führt HUDs als eigenen Indikator-Typ `COLLIMATOR`. Falcon BMS hat die Kollimation in VR mit 4.37.1 ausdrücklich nachgerüstet. MSFS konnte es laut Forum 2021 nicht, 2022 war zumindest das F/A-18-HUD kollimiert. FlightGear legt das Canvas-HUD als Textur aufs Glas, „HUD at infinity“ steht in der VR-Entwicklungsliste noch offen.
5. **Aufwand:** ein neuer kleiner Fragment-Shader, eine Verzweigung in `meshes.ts`, eine geänderte Winkelabbildung in `hudDisplay.ts`. Keine Änderung an `device.ts`, `xr.ts` oder an den Render-Targets.

## 1. Was ein echtes HUD optisch macht

- Das Bild wird **kollimiert**: die Strahlen verlassen die Optik parallel, Symbole erscheinen „at optical infinity as does the distant terrain“ (Iavecchia, Iavecchia, Roscoe: *Eye Accommodation to Head-Up Virtual Images*, NADC-87052-20, Naval Air Development Center 1987, Abstract, [DTIC ADA326758](https://apps.dtic.mil/sti/pdfs/ADA326758.pdf)). Dieselbe Studie nennt für das untersuchte HUD **20° Sichtfeld bei 50 cm Augabstand** zur Scheibe (S. 3).
- **Eyebox:** Das Bild ist nur sichtbar, solange das Auge in einem Volumen von etwa 13 × 8 × 15 cm liegt. Bewegt man den Kopf zu weit zur Seite, verschwindet die Anzeige am Rand des Kollimators. Man sieht das ganze Bild, solange ein Auge in der Eyebox ist ([Wikipedia, Head-up display](https://en.wikipedia.org/wiki/Head-up_display), Sekundärquelle).
- Beide Augen sollen dasselbe Bild sehen (binokulares Sichtfeld), ebd.

Für die Simulation heißt das: Die Position eines Symbols hängt nur von der **Richtung** relativ zur Flugzeuglängsachse ab, nicht davon, wo Auge oder Scheibe sind. Sichtbar ist es nur durch die Scheibe.

## 2. Was heute passiert (Code)

**HUD-Einbindung.** `src/cockpit/hudDisplay.ts` malt die Symbolik mit Canvas 2D in eine 512²-Textur (`THREE.CanvasTexture`, Aktualisierung mit 30 Hz, `update()`). Die Textur liegt auf einer `PlaneGeometry` von 0,22 m Kantenlänge mit `MeshBasicMaterial` (`transparent`, `AdditiveBlending`, `depthWrite: false`). Davor sitzt eine fast durchsichtige Combiner-Platte (`MeshPhongMaterial`, Opazität 0,08). `src/cockpit/cockpit.ts:91` setzt die Gruppe 0,16 m hinter die Panel-Front und 7 cm unter das Auge und kippt sie um −0,12 rad. Mit `front = eye.z − 0,7` (`src/cockpit/layout.ts:36`) liegt die Scheibe also **0,54 m vor dem Auge**. Die Winkellogik (`ppd`, Boresight-Zeile `boreY`) stimmt nur für das Design-Auge.

Folgen (eigene Rechnung, Augenabstand 63 mm angenommen):

- Die Augen müssen auf 0,54 m um ca. 6,7° konvergieren, auf den Horizont um 0°. Wer auf den Horizont schaut, sieht das HUD doppelt.
- 5 cm Kopfbewegung zur Seite verschieben die Symbole gegenüber der Landschaft um ca. 5,3°. Das Flight Path Marker zeigt dann woanders hin.

**Wie die Engine das zeichnet.** `src/engine/render/meshes.ts` übersetzt three.js-Szenengraphen in eigene Draws. `MeshBasicMaterial` wird zu `u_unlit = 1`, `AdditiveBlending` zu `blendFunc(SRC_ALPHA, ONE)` und einem Helligkeitsfaktor 3 (`draw()`, `glow`). Transparente Draws laufen nach Opaque, Wasser und Himmel, sortiert nach `renderOrder`, dann von hinten nach vorn (`collect()`, `renderer.ts:451`). Für das HUD gibt es keinen Sonderweg.

**Augposition pro View ist im Shader schon da.** Der Frame-UBO hat `u_eye[2]`, und `eyePos()` liefert `u_eye[VIEW_ID]` (`src/engine/shaders/common.ts`). `VIEW_ID` ist im Multiview-Fall `gl_ViewID_OVR`, sonst 0 (`src/engine/gl/device.ts`, `program()`). Der Mesh-Fragment-Shader nutzt `eyePos()` bereits (`src/engine/shaders/mesh.ts:120`). Im Pfad `xr-views` (ohne Multiview) überschreibt `renderer.ts:366–369` vor jedem Auge View 0 samt `eye`. In allen drei Ausgabepfaden (`canvas`, `xr-multiview`, `xr-views`) kennt der Fragment-Shader also die richtige Augposition.

**Stencil gibt es nicht:**

| Stelle | Format | Beleg |
|---|---|---|
| WebGL-Kontext | `stencil: false` | `src/engine/gl/device.ts:61` |
| Desktop-HDR-Target (MSAA) | `DEPTH_COMPONENT32F`-Renderbuffer | `renderer.ts:573` (`ensureHdr`) |
| XR-Multiview-Target | eigenes Depth-Array `DEPTH_COMPONENT32F`, 2 Layer | `renderer.ts:651` (`xrFramebuffer`) |
| XR-Projection-Layer | `depthFormat: 0` (Layer liefert kein Depth/Stencil) | `src/engine/xr/xr.ts:77` |
| XR-Fallback `XRWebGLLayer` | `depth: true`, kein `stencil` | `xr.ts:89` |

`grep -i stencil src` findet nur die Zeile in `device.ts`. Für eine Stencil-Maske müsste man alle drei Depth-Ziele auf ein kombiniertes Format umstellen und Stencil-State in `MeshRenderer.draw` einbauen.

## 3. Wie es andere Sims machen

- **DCS World:** HUD-Indikatoren haben in den mitgelieferten Lua-Dateien den Typ `indicator_type = indicator_types.COLLIMATOR`, normale Displays `COMMON`. Wer im F/A-18-HUD auf `COMMON` umstellt, ändert die Darstellung im Cockpit ([DCS-Forum, F/A-18 HUD font](https://forum.dcs.world/topic/221503-modded-files-how-to-adjust-the-f18-hud-font-size-and-range); [DCS-Forum, A-10C `HUD_init.lua`](https://forum.dcs.world/topic/334863-external-nose-view-without-hud-solved/)). Nutzer beschreiben die Symbolik als „projected at infinity“ ([DCS-Forum 2020](https://forum.dcs.world/topic/224385-cannot-reproduce-hud-too-close-in-vr)). Wie der Kollimator-Typ intern gerendert wird, dokumentiert ED nicht.
- **Falcon BMS:** Im Changelog 4.37.1 steht „Fix VR HUD not collimated to infinity“ ([Falcon BMS 4.37.1 Changelog](https://www.falcon-bms.com/changelogs/falcon-bms-4-37-1/)). Vorher meldeten Nutzer Schielen am HUD. Ein Tester schätzte, die Reverb G2 zeige das HUD „about 10 meters in front of the aircraft“, und schlug den Parallaxe-Test vor: FPM auf ein fernes Objekt, abwechselnd ein Auge schließen; wandert die Symbolik, ist sie nicht kollimiert ([BMS-Forum](https://forum.falcon-bms.com/post/360991)). Den Test übernehmen wir als Abnahmekriterium.
- **MSFS:** 2021 schrieb ein Forenteilnehmer, HUD-Kollimation sei „NOT currently modeled in MSFS and therefore not possible to be modeled by third party developers“. Das Symbolbild hänge auf dem Combiner, und DCS, X-Plane, Aerofly FS2 machten es richtig ([MSFS-Forum](https://forums.flightsimulator.com/t/make-hud-collimated-please-the-hud-in-the-aircraft-not-the-hud-of-ui/384579)). Eine offizielle Antwort steht dort nicht. Im Oktober 2022 meldete ein Nutzer, das HMD der F/A-18E/F liege in VR etwa 1 m vor dem Auge „instead of at infinity like the HUD“. Das HUD dieser F/A-18 war also inzwischen kollimiert, das HMD nicht ([MSFS-Forum](https://forums.flightsimulator.com/t/f-a-18e-f-hmd-symbology-not-focused-aligned-at-infinity-in-vr/547033)).
- **FlightGear:** Das Canvas-HUD ersetzt zur Laufzeit die Textur eines UV-gemappten Glas-Objekts im 3D-Modell ([FlightGear-Wiki, Canvas HUD](https://wiki.flightgear.org/Canvas_HUD)). Das ist im Prinzip unser heutiger Stand. Der ALS-HUD-Effekt blurrt und entsättigt nur, von Kollimation steht dort nichts ([ALS technical notes](https://wiki.flightgear.org/Special:MobileDiff/107372)). Auf der VR-Entwicklungsseite steht für die F-15 als offener Punkt „HUD should be at infinity“ ([FlightGear-Wiki, Virtual reality/Development](https://wiki.flightgear.org/Virtual_reality/Development)).
- **Spiele mit Reflexvisieren** haben dasselbe Problem im Kleinen. Ein „VR compatible“-Reflexvisier-Shader für Godot rechnet die Absehen-UV nur aus der Blickrichtung im lokalen System des Visiers: `uv = 0.5 + view_local.xy / tex_rad_width`. Die Fragmentposition auf dem Glas geht nicht ein ([Godot Shaders, Reflex/Red Dot/Holographic Sight Shader](https://godotshaders.com/shader/reflex-red-dot-holographic-sight-shader-vr-compatible/)). Das ist genau die hier empfohlene Technik. Ein anderer Godot-Shader verschiebt die UV nur um einen Tiefenfaktor, simuliert also eine endliche Entfernung ([Reflector Sight](https://godotshaders.com/shader/reflector-sight-red-dot)).

## 4. Die Techniken im Vergleich

### A. Ferne Ebene plus Stencil-Maske

Ablauf: Scheibe schreibt Stencil = 1. Danach eine HUD-Ebene z. B. 2 km voraus (oder als Richtungen mit w = 0, wie `renderer.ts:255` die Sonne projiziert) nur dort zeichnen, wo Stencil = 1 ist.

- Optik: bei 2 km Abstand ist die Restdisparität ≈ 0,002° (eigene Rechnung), mit w = 0 exakt null.
- Engine-Aufwand: `DEPTH32F_STENCIL8` statt `DEPTH_COMPONENT32F` in `ensureHdr` und `xrFramebuffer`, `stencil: true` im `XRWebGLLayer`-Fallback, Stencil-Clear in `drawScene`, Stencil-State pro Material in `MeshRenderer.draw`, Reihenfolge Scheibe → HUD erzwingen. Ein Depth-Stencil-Array am Multiview-Framebuffer ist erlaubt; das Beispiel der Extension hängt genau `DEPTH32F_STENCIL8` an `DEPTH_STENCIL_ATTACHMENT` ([Khronos, OVR_multiview2](https://registry.khronos.org/webgl/extensions/OVR_multiview2/)). Ob `OCULUS_multiview` mit MSAA auf der Quest dabei schneller oder langsamer wird, habe ich nicht gefunden.
- Die ferne Ebene braucht trotzdem eine eigene Geometrie und eine Projektionsrechnung. Sie liegt außerhalb des Glases, also braucht es Culling-Ausnahmen (`frustumCulled`), weil sie im Szenengraph weit weg hängt.

### B. Projektion im Shader der Scheibe (Empfehlung)

Pro Fragment der Scheibe, in Weltkoordinaten relativ zum Floating Origin:

```glsl
vec3 d = normalize(v_rel - eyePos());     // Blickrichtung dieses Auges durch diesen Pixel
vec3 h = u_hudBasis * d;                   // in HUD-Achsen: x rechts, y oben, z nach hinten (three.js)
if (h.z > -1e-3) discard;                  // nach hinten gerichtet
vec2 t = h.xy / -h.z;                      // Gnomonische (Tangens-)Projektion
vec2 uv = 0.5 + t * u_hudScale;            // u_hudScale = 0.5 / tan(halbes HUD-FOV)
if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
vec4 s = texture(u_map, uv);
```

- **Unendlich, ohne Disparität:** Nur die Richtung `d` geht ein. Beide Augen schauen parallel auf denselben Punkt der Landschaft und lesen dieselbe UV. Bei Kopfbewegung ändert sich `d` am selben Scheibenpunkt, das Symbol bleibt auf der Landschaft stehen.
- **Maske gratis:** Nur Scheiben-Pixel laufen durch den Shader. Der Tiefentest (Scheibe gegen schon gezeichnete Hand/Stick) gilt wie gewohnt.
- **Multiview:** `eyePos()` ist schon pro `VIEW_ID`. Die Extension gibt `gl_ViewID_OVR` als eingebauten Input frei ([Khronos, OVR_multiview2](https://registry.khronos.org/webgl/extensions/OVR_multiview2/)). Unsere Mesh-Shader nutzen das im Fragment-Shader bereits ohne Probleme.
- **Tangens statt Grad:** Die gnomonische Projektion bildet Großkreise auf Geraden ab. Der Horizont ist ein Großkreis und bleibt im Canvas eine gerade Linie, auch beim Rollen. Das Canvas muss dafür Winkel als `f · tan(α)` zeichnen statt heute `ppd · α`. Bei 11,5° Halbwinkel ist der Unterschied ≈ 1,4 %, er wächst aber zum Rand hin (eigene Rechnung).
- **Kosten:** ein mat3-Produkt, eine Division und ein Texture-Lookup auf der Scheibenfläche (etwa 23° × 23°). Kein zusätzlicher Pass, kein Stencil, keine neuen Formate.
- **Eyebox (optional, Stufe 2):** realistisch wäre, das Bild abzuschneiden, wenn das Auge die Eyebox verlässt. Im selben Shader billig: den Strahl Auge → Pixel mit einer virtuellen Apertur-Scheibe hinter dem Combiner schneiden und außerhalb mit `discard` oder weich ausblenden. Maße aus Abschnitt 1. Kein Muss für den ersten Schritt.

### C. WebXR-Quad-Layer

Ein Quad-Layer hat eine feste Pose und Größe im Raum ([MDN, createQuadLayer](https://developer.mozilla.org/docs/Web/API/XRWebGLBinding/createQuadLayer)). Er liegt also nicht im Unendlichen, wird nicht von der Scheibe maskiert und vom Kompositor ohne Tiefentest gegen das Cockpit gelegt. Ungeeignet.

### D. Heutiger Stand verbessern (Textur auf dem Glas, Winkel nachführen)

Man könnte die Canvas-Zeichnung pro Frame an die Kopfposition anpassen. Das geht aber nur für **ein** Auge pro Textur. Für zwei Augen bräuchte man zwei Texturen und doppeltes Zeichnen. B erledigt das im Shader.

## 5. Empfehlung und Umsetzungsskizze

**Technik B umsetzen.** Sie passt zur Engine, weil die nötige Information (`eyePos()` pro View, `v_rel`, ein Textur-Sampler) im Mesh-Pfad schon vorhanden ist. Sie läuft in allen drei Ausgabepfaden gleich und braucht keine Änderung an Render-Targets, Kontext oder XR-Setup.

| Datei | Änderung |
|---|---|
| `src/engine/shaders/hud.ts` (neu) | `hudFS`: Richtungs-Lookup wie oben, additiv, Farbe über `displayScale` wie im Unlit-Zweig von `meshFS`, `writeColor`. Vertex-Shader: `meshVS` wiederverwenden (liefert `v_rel`). |
| `src/engine/render/meshes.ts` | `programs()` um `collimated` erweitern (`d.program('hud', meshVS, hudFS, defines)`). In `draw()`: hat das Material `userData.collimated`, dieses Programm nehmen und `u_hudBasis` (Inverse der Welt-Rotation des HUD-Bezugssystems, mat3), `u_hudScale` setzen. Blending additiv, `depthWrite` aus wie heute. |
| `src/engine/render/renderer.ts` | `ScenePrograms.mesh` um das HUD-Programm ergänzen, damit `warmUp()` es mitkompiliert. Sonst nichts. |
| `src/cockpit/hudDisplay.ts` | Symbol-Material bekommt `userData.collimated = { frame, tanHalf }`. Zeichnen im Canvas um die Mitte als Boresight, Winkel als `f · tan(α)` mit `f = (S/2) / tanHalf`. `boreY` und die Abhängigkeit von Scheibengröße/-abstand fallen weg. HUD-FOV fest, z. B. 25° (Quelle: 20° im NADC-HUD; die Scheibe muss dafür groß genug sein). Optional Canvas auf 1024² für schärfere Schrift. |
| `src/cockpit/cockpit.ts` | Bezugssystem übergeben: die ungekippte Cockpit-Gruppe (Flugzeugachsen), nicht die um −0,12 rad gekippte HUD-Gruppe. Die Scheibe kann dann frei geneigt und skaliert werden, ohne dass sich die Symbolik verschiebt. |
| Test, z. B. `src/cockpit/hudProjection.test.ts` | Die UV-Formel als reine TS-Funktion spiegeln und prüfen: zwei Augpositionen mit 63 mm Abstand und parallelem Blick ergeben dieselbe UV; Richtung = Boresight ergibt (0,5; 0,5). |

Nicht ändern: `src/engine/gl/device.ts`, `src/engine/xr/xr.ts`, `xrFramebuffer`/`ensureHdr`.

**Zu beachten:**

- **Update-Rate:** Das Canvas läuft mit 30 Hz. Die Kopfbewegung ist mit B pro Frame richtig, aber Lage und Kurs des Flugzeugs kommen nur mit 30 Hz. Beim schnellen Rollen springt der Horizontbalken dann gegen den echten Horizont. Pitch-Leiter auf Bildrate aktualisieren oder das Canvas jedes Frame neu zeichnen (512² Upload) und messen.
- **Alter Pfad:** `index.html` startet noch `src/main.ts` mit `THREE.WebGLRenderer`. Der ignoriert `userData.collimated` und zeigt die Textur weiter auf dem Glas, mit der neuen Abbildung um die Mitte statt um `boreY`. Das ist für den Übergang hinnehmbar. Wer es dort auch richtig haben will, braucht ein `onBeforeCompile` mit der Kamera-Position; nicht geprüft.
- **Abnahme:** Parallaxe-Test aus dem BMS-Forum (FPM auf ein fernes Objekt, abwechselnd ein Auge schließen, Kopf seitlich bewegen). Die Symbolik darf sich gegen die Landschaft nicht bewegen.

## Offene Punkte

- Wie DCS und BMS intern rendern (Shader-Lookup oder ferne Ebene), ist nicht öffentlich dokumentiert. Die Aussagen oben belegen nur, dass beide kollimieren.
- Eyebox-Maße (13 × 8 × 15 cm) stammen aus Wikipedia, nicht aus einer Herstellerangabe. Für die F-16 und L-39 habe ich keine Primärquelle gefunden.
