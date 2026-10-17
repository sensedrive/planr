# Recherche: Referenzen und Maße für ein F-16C-Block-50/52-Cockpit

Stand 2026-10-17. Frage aus Issue #6: Welche frei zugänglichen Quellen beschreiben das Cockpit gut genug für einen detailgetreuen 3D-Nachbau, welche Maße lassen sich belegen, und wie sind die Panels angeordnet? Baut auf [f16-cockpit.md](f16-cockpit.md) auf.

**Kennzeichnung:** **[belegt]** = steht so in einer genannten Quelle. **[Nachbauer]** = gemessen oder angegeben von einem Cockpit-Nachbauer (gut, aber keine Herstellerangabe). **[Forum]** = Aussage in einem Forum, Einzelperson. **[geschätzt]** = meine Ableitung, vor dem Modellieren an Fotos prüfen.

**Lizenz:** Alle hier genannten Fotos und Zeichnungen nur als Referenz ansehen, nichts davon ins Repo kopieren. Einzige Ausnahme mit klarer Freigabe: Fotos der US Air Force / DoD sind gemeinfrei (siehe unten), aber auch die bleiben besser außerhalb des Repos.

## Kurzfassung

1. **Die beste frei zugängliche Maßquelle ist xflight.de von Martin „Pegasus“ Schmitt**: Panel-für-Panel-Tabellen mit Breite × Höhe in mm für linke Konsole, linke/rechte Aux-Konsole, Frontpanel und rechte Konsole, jeweils markiert ob am Originalteil gemessen oder auf dem DZUS-Raster gerechnet, dazu hochauflösende TIFF-Layouts „F-16C Block 50/52“ (alt und aktuell) mit allen Schrauben.
2. **Belegt sind Einzelteile, nicht die Gesamtgeometrie.** MFD (4 × 4 Zoll Anzeige, 141 mm Gehäuse), DED, Rundinstrumente, Konsolen-Panelbreite (5,75 Zoll DZUS) und Sitzneigung 30° lassen sich belegen. Für Augpunkt, Konsolenhöhe, Panelbreite gesamt und Stick-/Throttle-Position habe ich **keine frei zugängliche Primärquelle** gefunden; das muss aus Fotos und Panel-Rastermaßen geschätzt werden.
3. **Das echte Handbuch T.O. 1F-16C-1 ist nicht öffentlich freigegeben.** Die Falcon-BMS-Fassung (TO 1F-16CM/AM-1 BMS, „Blocks 50, 52“) ist frei, beschreibt aber nur, *auf welcher Konsole* etwas sitzt; die Cockpit-Abbildungen sind Bilder ohne Maße.
4. **HUD:** Block 50/52 der USAF hat laut Forum den Wide-Angle-Conventional-HUD (WAC), ca. 25° Gesamtsichtfeld, ca. 20° × 15° momentan sichtbar. Keine Herstellerquelle für genau dieses Gerät gefunden; das Nachfolgegerät Elbit I-HUD 2 hat 28° rund.

## 1. Quellen im Überblick

| Quelle | Was sie liefert | Brauchbarkeit | Lizenz / Zugang |
|---|---|---|---|
| [xflight.de, „Parts“](https://www.xflight.de/pe_org_par.htm) mit Unterseiten [linke Konsole](https://www.xflight.de/pe_org_par_lfc.htm), [linke Aux](https://www.xflight.de/pe_org_par_lxc.htm), [Center Console / Frontpanel](https://www.xflight.de/pe_org_par_cec.htm), [rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm), [rechte Konsole](https://www.xflight.de/pe_org_par_rgc.htm), Sitz, Armlehne, Stick, Throttle, Pedale | Panelliste je Konsole mit mm-Maßen, „~“ = gerechnet/geschätzt, ohne „~“ = am Original gemessen; Fotos echter Panels | **hoch** für Panelgrößen, keine Gesamtmaße der Wanne | © Martin Schmitt, keine Lizenz genannt → nur Referenz |
| [xflight.de, „Documents“](https://www.xflight.de/pe_org_doc.htm) | TIFF-Layouts „F-16C Block 50/52 used until 1996“ und „current“ (je ca. 5,8 MB), laut Autor „exactly each nuts and screws“, basierend auf Zeichnungen von Prohm Snitwong | **hoch** für Panel-Anordnung (Draufsicht) | wie oben; Rechte an Snitwongs Vorlagen ungeklärt |
| [xflight.de, Sitz-/„pit lite“-Plan](http://www.xflight.de/pe_sim_sml.htm) | Klappsitz mit 30°-Neigung, 2D-Plan mit Maßen im TCW-Format | mittel: nachempfunden, nicht gemessen | wie oben |
| [Falcon BMS: TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf) (Titel „Flight Manual F-16C and F-16D Blocks 50, 52“) | Kapitel 1.5 Cockpit Arrangement (linke Konsole, Aux-Konsolen, Instrument Panel, rechte Konsole) als Abbildungen; Fließtext nennt Lage einzelner Bedienelemente | mittel: Zuordnung zu Konsolen, keine Maße | frei herunterladbar, aber an das echte -1 angelehnt; Abbildungen nicht übernehmen |
| [Falcon BMS: TO 1F-16CM/AM-34-1-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-34-1-1%20BMS.pdf) | Avionik/Waffen, HUD-Einstellung | niedrig für Geometrie | wie oben |
| T.O. 1F-16C-1 (echt) | vollständige Cockpitabbildungen | — | nicht für die Öffentlichkeit freigegeben; laut [f-16.net-Thread](https://www.f-16.net/forum/viewtopic.php?p=5293) „restricted, not classified“ [Forum]. Kursierende Scans (z. B. HAF-Fassung auf Scribd) **nicht verwenden** |
| habu2.net (Galerie „viperpits“) | laut [f-16.net](https://www.f-16.net/forum/viewtopic.php?p=4516) Zeichnungen „ohne Maße“ [Forum] | unklar | Seite sperrt automatisierte Abrufe (robots.txt), von mir nicht geprüft |
| Pläne von Joseph Bosnjak, Todd Ferrante, Chris van Lierop (ACES-II-Anleitung) | Wannen-/Konsolenpläne für Nachbauer | unklar: die Pläne „geben unterschiedliche Maße an“ ([f-16.net](https://www.f-16.net/forum/viewtopic.php?p=4516)) [Forum] | keine aktuelle Bezugsquelle gefunden |
| [Invictus Cockpits](https://invictuscockpits.com/products/f-16-left-console-panels-digital-download) | kommerzielle Panel-Artwork (32 Panels) und Wannenpläne (.dxf/.stp, laut [DCS-Forum](https://forum.dcs.world/topic/338448-the-viper-project/)); Panels laut Verkäufer „von echten Panels gemessen“ | hoch, wenn gekauft | **nur privat, nicht kommerziell, keine Weitergabe** → für planr nur als Referenz zum Abgleich, nichts übernehmen |
| [c-130.net / „barabas“ CAD](https://www.c-130.net/forum/viewtopic.php?p=292040) | Renderings Mittelkonsole, Aux-Panels; Autor: nach Falcon-4-Screenshots, „may be inaccurate“ | niedrig | keine Dateien veröffentlicht |
| USAF-/ANG-Fotos, z. B. [148th FW „Block 50 F-16“](https://www.148fw.ang.af.mil/News/Photos/igphoto/2000896778/) | Fotos Block 50 | gut für Farben, Abnutzung, Beschriftung | laut Seite **„public domain, cleared for release“**, Urheber nennen, DIMOC-Regeln beachten |
| Kommerzielle Sims (DCS F-16C, MSFS-Add-ons) | sehr gutes Bildmaterial | nur Anschauung | Modelle/Texturen nicht verwendbar; DCS-Handbuch-PDFs ließen sich von hier nicht abrufen |

## 2. Maße

### 2.1 Belegt

| Maß | Wert | Status | Quelle |
|---|---|---|---|
| Sitzneigung ACES II | 30° zurückgelehnt (statt üblich 13°) | **[belegt]** | [USAF Fact Sheet](https://www.wads.ang.af.mil/About-Us/Fact-Sheets/Article/633011/f-16-fighting-falcon/): „seat-back angle was expanded from the usual 13 degrees to 30 degrees“; [Wikipedia](https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon); [xflight Sitz](https://www.xflight.de/pe_org_par_ace.htm) |
| Sicht nach unten | 40° über die Seite, 15° über die Nase | **[belegt]** | [Wikipedia](https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon) (zitiert Peacock 1997) |
| MFD-Anzeige | 4 × 4 Zoll (101,6 mm) Farb-MFD, Honeywell, für Block 40/50 (CCIP) | **[belegt]** | [Military & Aerospace Electronics](https://www.militaryaerospace.com/computers/article/16707606/1750a-equivalent-processors-upgrade-f-16-displays) |
| MFD-Gehäuse (Front) | 141,0 × 141,0 mm | **[Nachbauer]** gemessen | [xflight Center Console](https://www.xflight.de/pe_org_par_cec.htm) |
| DED (Panelfeld) | 85,72 × 31,75 mm (= 3,375 × 1,25 Zoll) | **[Nachbauer]** gemessen | [xflight Center Console](https://www.xflight.de/pe_org_par_cec.htm) |
| PFLD (Pilot Fault List Display, rechte Aux) | 85,72 × 31,75 mm | **[Nachbauer]** gemessen | [xflight rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm) |
| ADI, Fahrtmesser, Höhenmesser | je 83,0 × 83,0 mm | **[Nachbauer]** gemessen | [xflight Center Console](https://www.xflight.de/pe_org_par_cec.htm) |
| HSI, AOA, VVI | ca. 83 mm | **[Nachbauer]** geschätzt | ebd. |
| Standby-ADI, Uhr, Kabinendruck | je 60,5 × 60,5 mm | **[Nachbauer]** gemessen | [xflight Center Console](https://www.xflight.de/pe_org_par_cec.htm), [rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm) |
| Hydraulikdruck A/B | 27,2 × 27,2 mm | **[Nachbauer]** gemessen | [xflight rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm) |
| Chaff/Flare-Panel (CMDS, linke Aux) | 141,0 × 95,0 mm | **[Nachbauer]** gemessen | [xflight linke Aux](https://www.xflight.de/pe_org_par_lxc.htm) |
| Konsolen-Panelbreite | 145,5 mm (≈ 5,75 Zoll DZUS-Standard), schmale Panels 75,6 mm | **[Nachbauer]**, deckt sich mit DZUS-Norm | [xflight linke Konsole](https://www.xflight.de/pe_org_par_lfc.htm); DZUS: 5,75 Zoll / 146 mm breit, Höhen in Vielfachen von 3/8 Zoll (9,525 mm) ([Übersicht DZUS-Panels](https://shaddack.mauriceward.com/notes/panels.webt)); Nachbauer berufen sich auf MS25212 ([DCS-Forum](https://forum.dcs.world/topic/338448-the-viper-project/)) |
| Sidestick-Weg | ca. 1/4 Zoll (6 mm) je Achse laut Dash-1 Block 50/52 | **[Forum]** (zitiert Dash-1) | [f-16.net, SSC Deflection](https://www.f-16.net/forum/viewtopic.php?p=505905); xflight: „2 bis 3 mm in jede Richtung“ laut Pilot ([xflight SSC](https://www.xflight.de/pe_org_par_ssc.htm)) |
| Throttle | „mounted above the left console“, Friction-Regler innen am Fuß, RIT-Schalter an der linken Seitenwand direkt hinter dem Throttle | **[belegt]** (BMS-Fassung des -1) | [TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf) |
| Stick | auf der rechten Armlehne/Konsole; Armlehne „an der rechten Innenseite des Cockpits“ | **[belegt]** qualitativ | [Wikipedia](https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon), [xflight Armlehne](https://www.xflight.de/pe_org_par_arm.htm) |

Zu den Konsolenpanels gibt xflight rund 40 weitere Höhenmaße (Abschnitt 3); fast alle sind auf dem 9,54-mm-Raster gerechnet („~“), nicht gemessen.

**Widerspruch Sitzwinkel:** Fact Sheet, Wikipedia und xflight sagen „Sitz 30° geneigt“. Im [DCS-Forum](https://forum.dcs.world/topic/195927-f-16-aces-ii-ejection-seat/) behauptet ein Nutzer, die Sitzfläche sei 15° und die Lehne 30° geneigt [Forum]; [Kennedy 2001](https://www.cimvhr.ca/documents/Kennedy%20-%202001%20-%20Anthropometric%20Accommodation%20in%20Aircraft%20Cockpits%20Anthropometric%20Accommodation%20in%20Aircraft%20Cockpits%20Methodologies%20for.pdf) nennt „seat pan … typically at +30 degrees“. Für das Modell: **Rückenlehne 30° gegen die Senkrechte** ist belegt; die Sitzflächenneigung an Fotos (Seitenansicht ACES II) abmessen. Der DTIC-Bericht zum ACES II ([ADA133628](https://apps.dtic.mil/sti/html/tr/ADA133628/index.html), freigegeben, teils unleserlich) soll laut Forum die Einbauwinkel für A-10/F-15/F-16 enthalten; den Volltext konnte ich nicht abrufen.

### 2.2 HUD

| Gerät | Momentanes Sichtfeld (IFOV) | Gesamtsichtfeld (TFOV) | Status / Quelle |
|---|---|---|---|
| Conventional HUD (F-16A/B) | 13,5 × 9° | 20 × 20° | [Forum], habu2 in [f-16.net](https://www.f-16.net/forum/viewtopic.php?p=119789) |
| **WAC** (Wide Angle Conventional) | **20 × 15°** | **25 × 25°** (12,5° Radius) | [Forum], ebd. und [f-16.net HUD-Thread](https://www.f-16.net/forum/viewtopic.php?p=27160) |
| WAR (Wide Angle Raster, Block 40/42, LANTIRN) | 30 × 17° (anderswo 30 × 18°) | 30° (15° Radius) | [Forum], ebd. |
| Elbit I-HUD 2 (Nachrüstung, Form-Fit-Ersatz) | — | 28° rund | **[belegt]** [Elbit-Datenblatt](https://elbitsystems.com/media/f-16_I-HUD2_2022.pdf) |

Welcher HUD im Block 50/52? Laut [f-16.net](https://www.f-16.net/forum/viewtopic.php?p=182074) haben USAF-Block-5x den WAC, Singapur und Korea den WAR [Forum]. Der Combiner des WAC ist eine Scheibe, der WAR hat drei Gläser ([f-16.net](https://www.f-16.net/forum/viewtopic.php?p=27160)) [Forum]. Der HUD sitzt nah an der Ausschusslinie des Sitzes, „to maximize the FOV“ ([f-16.net Armament](https://www.f-16.net/f-16_armament_article2.html)).

**Für planr [geschätzt]:** WAC modellieren, IFOV 20° breit × 15° hoch vom Augpunkt aus; daraus ergibt sich die Combinergröße aus dem Abstand Auge–Combiner. Eine Combinergröße in mm habe ich nirgends gefunden.

### 2.3 Nicht belegt, geschätzt

Für diese Maße habe ich keine frei zugängliche Quelle gefunden. Die Werte sind Startwerte für das Graumodell, abzugleichen an Fotos mit bekannten Bezugsgrößen (MFD 141 mm, Rundinstrument 83 mm, Konsolenpanel 146 mm breit).

| Maß | Startwert | Herleitung |
|---|---|---|
| Augpunkt über Sitzfläche (Kissen) | ca. 0,70 m senkrecht, ca. 0,40 m hinter dem vorderen Sitzkissenrand | **[geschätzt]**: Sitz-Augenhöhe eines mittleren Piloten ca. 0,79 m aufrecht, Rumpf 30° geneigt → cos 30° ≈ 0,87; f-16-cockpit.md nannte 0,8 m ohne Neigung. Einstellverfahren laut -34: Sitz so hoch/tief fahren, bis die Testmuster-Dreiecke oben und unten im HUD sichtbar sind ([Falcon-BMS-Forum](https://forum.falcon-bms.com/post/203148)) [Forum]. Abstand Helm–Canopy „eine Faust“ (ebd.) [Forum] |
| Abstand Auge–Frontpanel (MFD-Ebene) | ca. 0,70–0,75 m | **[geschätzt]** aus Fotos/Sims; MFDs liegen tief, laut Nutzern „scheinen die Knöchel zu berühren“ ([Falcon-BMS-Forum](https://forum.falcon-bms.com/post/386237)) |
| Breite Frontpanel (Instrumentenbrett) | ca. 0,70–0,75 m | **[geschätzt]**: zwei MFDs (2 × 141 mm) + Mittelsäule mit ADI/HSI (ca. 83 mm + Rahmen) + seitliche Felder; an Foto abmessen |
| Konsolenhöhe | Oberkante etwa auf Höhe Sitzkissen bis ca. 10 cm darüber | **[geschätzt]**; ein Nachbauer: Konsolen „ungefähr auf Sitzhöhe“ ([Falcon-BMS-Forum](https://forum.falcon-bms.com/post/386237)) [Forum] |
| Konsolenbreite (je Seite) | ca. 0,22–0,25 m | **[geschätzt]**: ein Vollbreit-Panel 146 mm + schmale Spalte 76 mm (xflight hat beide Breiten auf der linken und rechten Konsole) |
| Konsolenlänge | ca. 0,9–1,0 m | **[geschätzt]**: Summe der xflight-Panelhöhen je Spalte (linke Konsole: die vollbreiten Panels summieren sich auf ca. 0,92 m, ohne Throttle-Bereich und Rahmen) |
| Stick-Griffposition | rechts neben dem Sitz, Griffmitte ca. 0,35 m rechts der Sitzmitte, auf Höhe Armlehne, ca. 0,3 m vor dem Lehnenfuß | **[geschätzt]** |
| Throttle-Position | linke Konsole, vor der Mitte der Konsole, Griff ca. 0,35 m links der Sitzmitte | **[geschätzt]**; Lage „über der linken Konsole“ ist belegt (oben) |
| Throttle-Weg | ca. 15–20 cm, Schiene längs der Konsole | **[geschätzt]**; xflight zeigt Führungsschiene nur als Bild ([xflight TQS](https://www.xflight.de/pe_org_par_tqs.htm)) |
| ICP-Größe | ca. 0,20 × 0,10 m | **[geschätzt]**; xflight: „ICP ?“ (unbekannt) |
| DED-Text | 5 Zeilen à ca. 24 Zeichen | **[geschätzt]** (Sim-Wissen, keine Quelle gefunden) |

**Weg zu besseren Zahlen:** die xflight-TIFF-Layouts „F-16C Block 50/52 current“ herunterladen (lokal, nicht ins Repo), mit der bekannten Panelbreite 145,5 mm skalieren und Konsolenlänge, Panelbreite und Throttle-Schiene abgreifen. Das ist die verlässlichste frei verfügbare Quelle für die Draufsicht. Für Höhen hilft nur ein Museumsbesuch mit Maßband oder Seitenfotos mit Bezugsmaß.

## 3. Panel-Anordnung

Die **Zuordnung Panel → Konsole** ist durch xflight belegt **[Nachbauer]**. Die **Reihenfolge von vorn nach hinten** gibt xflight nur im Bild an (Tabellen alphabetisch); die Reihenfolge unten ist **[geschätzt]** aus Sim-Kenntnis (DCS/BMS) und an den xflight-Layouts oder Fotos zu prüfen. Maße B × H in mm, „~“ = laut xflight gerechnet/geschätzt.

### 3.1 Linke Konsole

Quelle Liste und Maße: [xflight linke Konsole](https://www.xflight.de/pe_org_par_lfc.htm). BMS-Fassung bestätigt ENG & JET START, ENG CONT und Throttle auf der linken Konsole ([TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf)).

| ungefähre Lage [geschätzt] | Panel | B × H (mm) |
|---|---|---|
| vorn, Seitenwand | Anti G | 75,8 × 145,7 (gemessen) |
| vorn | TEST | ~75,6 × ~145,5 |
| vorn | Flt Control (FLCS) | ~145,5 × ~123,8 |
| vorn | Manual Trim | ~145,5 × ~104,8 |
| vorn | Manual Pitch | ~75,6 × ~66,7 |
| Mitte, vor/unter dem Throttle | Fuel | ~145,5 × ~57,2 |
| Mitte | Throttle (über der Konsole, außen) | — |
| Mitte | Aux Comm | ~145,5 × ~95,3 |
| Mitte | Audio 1 | ~145,5 × ~76,2 |
| Mitte | Audio 2 | ~145,5 × ~38,1 |
| Mitte/hinten | Ext Lighting | 145,7 × 85,8 (gemessen) |
| hinten | EPU | ? × ~123,8 |
| hinten | Elec | 75,6 × 93,6 (gemessen) |
| hinten | Engine Start (ENG & JET START) | ~75,6 × ~200 |
| hinten | UHF (Backup-Radio) | 145,5 × 123,8 (gemessen) |
| hinten | AVTR | ~145,5 × ~57,2 |
| hinten | ECM | 145,5 × 66,7 (gemessen) |
| verteilt | Blank 1 / Blank 2 | ~145,5 × ~38,1 / ~57,2 |
| Seitenwand / Rahmen | Canopy Jettison (Griff), Manual Canopy Control, Defog-Griff, Chaff/Flare-Taster | — |

### 3.2 Linke Aux-Konsole (links am Frontpanel, unterhalb der Glareshield-Kante)

Quelle: [xflight linke Aux](https://www.xflight.de/pe_org_par_lxc.htm). Gear, Alt Gear DN, Chaff/Flare 141 × 95 (gemessen), Threat Warning Aux ~48 × ~89, Speed-Brake-Anzeige ~16 × ~16, HMD-Panel ~145,5 × ~38,1 (laut xflight nur MLU), Blank. Fahrwerkshebel links am Panel: **[geschätzt]** üblich, Zuordnung zur linken Aux ist belegt.

### 3.3 Frontpanel (Instrument Panel) und Glareshield

Quelle: [xflight Center Console](https://www.xflight.de/pe_org_par_cec.htm); dort gegliedert in Glareshield (Eyebrow Lights), „Integrated Control Block“ (ICP und HUD), linkes/rechtes Frontpanel (die MFDs) und Mittelblock.

| Bereich | Inhalt | Status |
|---|---|---|
| Glareshield oben | HUD; links/rechts Eyebrow-Leuchten und -Taster; HYD/OIL PRESS und ENGINE Warnleuchte an der rechten Glareshield-Kante; AR-Statusanzeige rechts vom HUD | Glareshield/Eyebrow: [Nachbauer]; Warnleuchten und AR rechts: **[belegt]** ([TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf)) |
| Mitte oben, unter dem HUD | ICP mit DED (85,7 × 31,8 mm); AOA-Indexer seitlich | Lage [Nachbauer]; Indexer-Seite [geschätzt] |
| links unten | linkes MFD (141 × 141 mm) | [Nachbauer] |
| rechts unten | rechtes MFD (141 × 141 mm) | [Nachbauer] |
| Mittelsäule | ADI oben, HSI darunter; Fahrtmesser links, Höhenmesser rechts vom ADI; AOA links, VVI rechts vom HSI | Instrumente [Nachbauer]; Anordnung **[geschätzt]** |
| links oben | Misc-Panel (Master Arm u. a.), Instr Mode, Marker Beacon, Pedal Adj | Panel vorhanden [Nachbauer]; Lage [geschätzt] |
| rechts | RWR-Anzeige und Threat Warning Prime oben; Triebwerksinstrumente (Oil Press, NOZ Pos, RPM, FTIT) und FFI rechts; Fuel QTY Sel | Triebwerksinstrumente „on the right side of the instrument panel“: **[belegt]** (BMS -1); übrige Lage [geschätzt] |
| unten Mitte | Standby-ADI (60,5 mm) | [Nachbauer]; Lage [geschätzt] |

### 3.4 Rechte Aux-Konsole (rechts am Frontpanel)

Quelle: [xflight rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm). Caution Panel, PFLD (85,7 × 31,8, gemessen; Lage „right auxiliary console instrument panel“ **[belegt]** in BMS -1), EPU Fuel, Fuel Quantity, Hyd Press A/B (27,2 mm), Liquid Oxygen, Cabin Press (60,5 mm), Clock (60,5 mm), Compass (~60,5 mm). Anordnung innerhalb der Aux **[geschätzt]**.

### 3.5 Rechte Konsole

Quelle Liste und Maße: [xflight rechte Konsole](https://www.xflight.de/pe_org_par_rgc.htm); ANTI ICE auf der rechten Konsole ist **[belegt]** (BMS -1). Vorn steht der Sidestick auf der Armlehne über der Konsole.

| ungefähre Lage [geschätzt] | Panel | B × H (mm) |
|---|---|---|
| vorn | SNSR PWR (Sensor Power) | 145,5 × 37,3 (gemessen) |
| vorn | HUD (Remote Control Panel) | ~145,5 × ~66,7 |
| vorn/Mitte | Lighting (Interior) | ~145,5 × ~114,3 |
| Mitte | Air Cond | ~145,5 × ~57,2 |
| Mitte, schmale Spalte | Zeroize/Voice Inhibit | ~75,6 × ~200 |
| Mitte | Oxygen Regulator | ~145,5 × ~76,2 |
| Mitte | Avionics Power | ~145,5 × ~95,3 |
| Mitte | Anti Ice / Antenna Select | ~145,5 × ~38,1 |
| hinten | KY-58 (Sec. Voice) | ~145,5 × ~123,8 |
| hinten | DTU (Data Transfer Unit) | ~145,5 × ~114,3 |
| hinten | Nuclear Consent | ~145,5 × ~38,1 |
| verteilt | Blank 1–5 | ~28,6–95,3 hoch |
| Seitenwand | Floodlight, Map/Data Stowage | — |

**Block-50-Hinweis:** xflight hat zwei Block-50/52-Layouts („bis 1996“ und „aktuell“). Für planr das aktuelle nehmen; CCIP-Jets haben zusätzlich Farb-MFDs und HMCS. Ob das HMD-Panel auf der linken Aux im USAF-Block-50 sitzt, ist offen (xflight: „only MLU“).

## 4. Empfehlung fürs Modellieren

1. **Draufsicht** aus den xflight-TIFFs (Block 50/52 current) auf die DZUS-Panelbreite 145,5 mm skalieren und als Blender-Hintergrundbild nutzen. Panels als Rechtecke mit den Tabellenmaßen oben anlegen.
2. **Frontpanel** über die gemessenen Teile aufbauen: MFD 141 mm, Rundinstrument 83 mm, Standby 60,5 mm, DED 85,7 × 31,8 mm.
3. **Augpunkt, Konsolenhöhen, Stick und Throttle** als Parameter im Graumodell anlegen (Startwerte aus 2.3) und in VR auf der Quest gegen Fotos und Sitzgefühl abstimmen.
4. **HUD** als WAC mit IFOV 20 × 15° vom Augpunkt dimensionieren.
5. Zum Abgleich USAF-Fotos (gemeinfrei) heranziehen; keine Bilder ins Repo.

## Offene Punkte

- Volltext des DTIC-Berichts ADA133628 (ACES II, Einbauwinkel) abrufen.
- habu2.net und die Bosnjak-/Ferrante-Pläne selbst sichten (Abruf von hier gesperrt bzw. keine Quelle gefunden).
- DCS-F-16C-Handbuch (frei auf digitalcombatsimulator.com) für die Reihenfolge der Panels abgleichen; der PDF-Abruf scheiterte von hier aus.
- Museumsflugzeug mit Maßband: Konsolenhöhe, Wannenbreite, Abstand Sitz–Frontpanel.

## Quellen

- xflight.de (Martin Schmitt): [Parts](https://www.xflight.de/pe_org_par.htm), [linke Konsole](https://www.xflight.de/pe_org_par_lfc.htm), [linke Aux](https://www.xflight.de/pe_org_par_lxc.htm), [Center Console](https://www.xflight.de/pe_org_par_cec.htm), [rechte Aux](https://www.xflight.de/pe_org_par_rxc.htm), [rechte Konsole](https://www.xflight.de/pe_org_par_rgc.htm), [ACES II](https://www.xflight.de/pe_org_par_ace.htm), [Armlehne](https://www.xflight.de/pe_org_par_arm.htm), [Sidestick](https://www.xflight.de/pe_org_par_ssc.htm), [Throttle](https://www.xflight.de/pe_org_par_tqs.htm), [Documents](https://www.xflight.de/pe_org_doc.htm), [Sitz-Plan](http://www.xflight.de/pe_sim_sml.htm)
- [Falcon BMS: TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf), [TO 1F-16CM/AM-34-1-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-34-1-1%20BMS.pdf)
- [USAF Fact Sheet F-16](https://www.wads.ang.af.mil/About-Us/Fact-Sheets/Article/633011/f-16-fighting-falcon/)
- [Wikipedia: General Dynamics F-16 Fighting Falcon](https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon)
- [Military & Aerospace Electronics: Honeywell 4×4-Zoll-Farb-MFD](https://www.militaryaerospace.com/computers/article/16707606/1750a-equivalent-processors-upgrade-f-16-displays)
- [Elbit: F-16 I-HUD 2 Datenblatt](https://elbitsystems.com/media/f-16_I-HUD2_2022.pdf)
- [Kennedy 2001: Anthropometric Accommodation in Aircraft Cockpits](https://www.cimvhr.ca/documents/Kennedy%20-%202001%20-%20Anthropometric%20Accommodation%20in%20Aircraft%20Cockpits%20Anthropometric%20Accommodation%20in%20Aircraft%20Cockpits%20Methodologies%20for.pdf)
- [DTIC ADA133628: ACES II Rev. C](https://apps.dtic.mil/sti/html/tr/ADA133628/index.html)
- [DZUS-Panelmaße (Übersicht)](https://shaddack.mauriceward.com/notes/panels.webt)
- [148th FW: Foto „Block 50 F-16“ (public domain)](https://www.148fw.ang.af.mil/News/Photos/igphoto/2000896778/)
- Foren: f-16.net [CAD-Zeichnungen](https://www.f-16.net/forum/viewtopic.php?p=4516), [HUD-Bau](https://www.f-16.net/forum/viewtopic.php?p=27160), [Block 40 WAR HUD](https://www.f-16.net/forum/viewtopic.php?p=119789), [HUD-Nachrüstung](https://www.f-16.net/forum/viewtopic.php?p=182074), [SSC Deflection](https://www.f-16.net/forum/viewtopic.php?p=505905), [Dash-1-Verfügbarkeit](https://www.f-16.net/forum/viewtopic.php?p=5293), [Armament/HUD](https://www.f-16.net/f-16_armament_article2.html); Falcon BMS [Input-Ergonomie](https://forum.falcon-bms.com/post/203148), [VR-Größe](https://forum.falcon-bms.com/post/386237); DCS [ACES II](https://forum.dcs.world/topic/195927-f-16-aces-ii-ejection-seat/), [Viper Project](https://forum.dcs.world/topic/338448-the-viper-project/); [c-130.net CAD](https://www.c-130.net/forum/viewtopic.php?p=292040)
- [Invictus Cockpits (kommerziell, Lizenz nur privat)](https://invictuscockpits.com/products/f-16-left-console-panels-digital-download)
