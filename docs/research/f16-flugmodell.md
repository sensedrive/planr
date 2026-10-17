# Recherche: Ein F-16-Flugmodell für planr

Stand 2026-10-17, zu Issue #8. Fragen: Welche offenen Aerodynamik- und Triebwerksdaten gibt es, welche Steuergesetze braucht eine F-16, wie ist `src/sim/` aufgebaut, und passt ein Tabellenmodell hinein?

Zeilenangaben zu planr beziehen sich auf Commit `bc7874e`. JSBSim- und AeroBenchVV-Dateien habe ich am 2026-10-17 vom jeweiligen `master` gelesen; die Zeilennummern können später abweichen.

## Kurzfassung

1. **Datenbasis: NASA TP-1538 (1979), in Form der Polynome von Morelli (NASA, 1997).** Beide sind US-Regierungswerke mit dem NTRS-Vermerk „Public Use Permitted“, wir dürfen sie also frei verwenden. Die Polynome decken α −10…45°, β ±30° und die volle Ruderausschläge ab, sind glatt und kompakt (rund 80 Zahlen statt Dutzender Tabellen). Sie gelten aber nur für Mach < 0,6, also braucht es für schnellen Flug einen eigenen Mach-Zuschlag.
2. **JSBSim nicht kopieren.** `f16.xml` steht unter der **GPL** (Dateikopf), nicht unter der LGPL der JSBSim-Bibliothek. Auch AeroBenchVV (Python/MATLAB) ist GPL-3.0. Beides taugt als Referenz zum Gegenprüfen, aber nicht zum Abschreiben in unseren Web-Bundle.
3. **Ein eigener Pfad, kein weiterer `makeAero()`-Eintrag.** Das heutige Modell ist ein einzelner Satz linearer Beiwerte mit fest eingebauter Formel (`src/sim/aero.ts:6`, `src/sim/aero.ts:130-207`). Die F-16 braucht nichtlineare Beiwerte in α und β, Ruderstellungen als eigene Zustände, Mach und eine Atmosphäre über 11 km. Vorschlag: eine Schnittstelle `AeroModel` mit zwei Implementierungen, dazu ein optionales `fcs` (Fly-by-Wire) am Flugzeugtyp.
4. **Steuergesetze (Fly-by-Wire) selbst entwerfen.** Die Struktur ist gut belegt: g-Vorgabe im Nickkanal mit α-Begrenzer bei rund 25°, Rollratenvorgabe bis etwa 300°/s, die bei hohem α, niedrigem Staudruck und Höhenruder nach unten zurückgenommen wird, sowie Gierdämpfer, Querruder-Seitenruder-Kopplung (ARI) und Trudelschutz ab 29° α. Konkrete Verstärkungen veröffentlicht keine der freien Quellen. Die stimmen wir per Test auf die Zielwerte ab.
5. **Triebwerk:** F110-GE-129 mit 76 kN trocken und 131 kN mit Nachbrenner, F100-PW-229 mit 79 kN und 130 kN. Die heutigen planr-Werte (76/127 kN) liegen schon nah dran. Falsch ist aber der Verlauf über die Geschwindigkeit: der Schub sinkt in planr mit der Fahrt, beim echten Nachbrenner steigt er bis Mach 1 deutlich an. Belastbare Spool-Zeiten aus Primärquellen habe ich nicht gefunden.

## 1. Das bestehende Flugmodell in `src/sim/`

### Aufbau

- **Starrkörper, 6 Freiheitsgrade**, semi-implizites Euler-Verfahren in `Aircraft.step` (`src/sim/aircraft.ts:120-214`). Körperachsen: +X rechts, +Y oben, −Z Nase (`src/sim/aircraft.ts:41`). Die Physik läuft mit festem Schritt von 1/120 s (`src/main.ts:389`).
- **Reihenfolge pro Schritt:** Autopilot und Systeme schreiben in die Steuereingaben (`src/sim/aircraft.ts:126-127`), dann folgen Aerodynamik (`src/sim/aircraft.ts:140`), Schub (`src/sim/aircraft.ts:141`), Fahrwerk und Boden (`src/sim/aircraft.ts:150`) und zum Schluss die Integration (`src/sim/aircraft.ts:185-213`).
- **Trägheit nur auf der Diagonalen.** `I·ω' = M − ω×(I·ω)` mit drei Komponenten (`src/sim/aircraft.ts:189-196`), ohne Ixz. Die Werte schätzt `inertia()` aus Masse, Spannweite und Länge (`src/sim/types.ts:77-81`).
- **Lastvielfaches** `gLoad` aus der spezifischen Kraft (`src/sim/aircraft.ts:170-175`). Die g-Regelung kann darauf zurückkoppeln, sieht den Wert aber erst einen Schritt später.

### Kraftmodell und Beiwerte (`src/sim/aero.ts`)

- `AeroParams` ist als `typeof C172_AERO` definiert (`src/sim/aero.ts:6`). Es ist ein flaches Objekt mit linearen Ableitungen: CL0, CLa, CD0, k, CYb, Cm0/Cma/Cmq/Cmde, Clda/Clp/Clb, Cndr/Cnr/Cnb/Cnda, dazu Klappen, Fahrwerk und `mcrit` (`src/sim/aero.ts:12-49`).
- **Auftrieb:** linear bis zum Abrisswinkel, danach ein Übergang zur ebenen Platte `1,15·sin 2α` (`src/sim/aero.ts:110-120`). **Widerstand:** Polare plus Abrisszuschlag, Schiebewinkel und Wellenwiderstand über `mcrit` (`src/sim/aero.ts:168-173`).
- **Mach** wird mit fester Schallgeschwindigkeit 340 m/s gerechnet (`src/sim/aero.ts:171`). Die **Atmosphäre** kennt nur die Troposphäre ohne Tropopause (`src/sim/atmosphere.ts:4-7`).
- **Momente** sind linear in den Ruderausschlägen. Das Höhenruder wirkt mit dem Staudruck am Leitwerk, inklusive Propellerstrahl (`src/sim/aero.ts:186-191`). Im Modus „Realistisch“ kommen ein Abrissflügel und begrenzte Autorotation hinzu (`src/sim/aero.ts:193-200`).
- **Der Steuerknüppel ist direkt der Ruderausschlag**, nämlich `elevator() = clamp(pitch + trim·trimRange)` (`src/sim/aero.ts:209-219`). Es gibt weder Stellglied-Dynamik noch Ruderzustand. Das Außenmodell liest dieselbe Funktion für die Ruderanimation (`src/view/genericModel.ts:452-455`).

### Wie Typen definiert werden (`src/sim/types.ts`)

- `AircraftType` (`src/sim/types.ts:32-73`) enthält Masse, Trägheit, `aero: AeroParams`, `createEngine()`, Fahrwerk, Cockpit, Modellgeometrie und Instrumente. `make()` ergänzt Trägheit, Bodenkontakte und Ruhelage (`src/sim/types.ts:165-183`).
- Neue Typen übernehmen mit `makeAero({...})` die C172-Werte und überschreiben einzelne Beiwerte (`src/sim/aero.ts:52-54`). Die Typen werden in `AIRCRAFT` eingetragen (`src/sim/types.ts:547-558`), die IDs stehen in `AircraftId` (`src/sim/types.ts:6`).
- **Die F-16 gibt es schon** als lineares Modell: 12 t, S = 27,9 m², b = 9,96 m, c = 3,45 m, Abriss bei 25°, `JetEngine(76_000, 127_000)` (`src/sim/types.ts:509-545`). Der Flottentest erwartet für sie Abheben bei 135–195 kn, Höchstfahrt 600–900 kn und Abriss bei 105–155 kn (`src/sim/fleet.test.ts:92`).
- Typabhängige Sonderfälle stehen verstreut im Code, z. B. `t.id === 'f16'` für die Querlage im Verkehr (`src/game/traffic.ts:87`) und die g-Toleranz (`src/view/feel.ts:18`).

### Triebwerk (`src/sim/engine.ts`)

- `PowerPlant` liefert über `update(dt, throttle, airspeed, rho)` den Schub in N (`src/sim/engine.ts:5-18`).
- `JetEngine`: N1 läuft mit festen Raten von 0,35/s unter 75 % und 0,7/s darüber (`src/sim/engine.ts:174-177`). Der Nachbrenner ist ein Schalter, der oberhalb von 95 % Hebel greift (`src/sim/engine.ts:180`). Der Schub fällt mit der Fahrt um bis zu 25 % und skaliert mit σ^0,7 (`src/sim/engine.ts:182-184`). Mach und Temperatur gehen nicht ein.

### Passt ein Tabellenmodell hinein?

Ohne Umbau nicht, aus vier Gründen:

1. `computeAero` ist eine einzige Formel über `AeroParams` und wird in `Aircraft.step` fest aufgerufen (`src/sim/aircraft.ts:140`). Tabellen oder Polynome lassen sich nicht als „weitere Beiwerte“ in `makeAero` unterbringen.
2. Die F-16-Daten liegen in **Körperachsen-Beiwerten CX, CY, CZ, Cl, Cm, Cn** vor, mit x nach vorn und z nach unten (siehe die Gleichungen in `subf16_model.py:126-131` von AeroBenchVVPython). planr rechnet dagegen mit CL und CD im Windsystem. Die Achsen setzen sich so um: x_NASA = −z_planr, y_NASA = +x_planr, z_NASA = −y_planr.
3. Ein Fly-by-Wire-Flugzeug braucht **Ruderstellungen als Zustand** mit Begrenzung von Ausschlag und Stellrate. Heute ist der Ausschlag gleich der Knüppelstellung (`src/sim/aero.ts:209-219`).
4. Die Polynome und Tabellen gelten nur bis Mach 0,6. Für die F-16 braucht es Mach-Zuschläge und eine Atmosphäre mit Tropopause und Schallgeschwindigkeit (`src/sim/atmosphere.ts:4-7`, `src/sim/aero.ts:171`).

## 2. Aerodynamische Daten

| Quelle | Inhalt | Lizenz | Eignung |
|---|---|---|---|
| **NASA TP-1538**, Nguyen, Ogburn, Gilbert, Kibler, Brown, Deal, Dez. 1979 ([NTRS 19800005879](https://ntrs.nasa.gov/citations/19800005879)) | Windkanaldaten eines 16-%-Modells, Simulatorstudie zu Abriss und Post-Stall, Beschreibung des Steuersystems | „Work of the US Gov. Public Use Permitted.“ (NTRS) | Primärquelle; die Tabellen selbst stecken in Anhängen, die ich über das Abruf-Werkzeug nicht vollständig lesen konnte |
| **Morelli, „Global Nonlinear Parametric Modeling with Application to F-16 Aerodynamics“**, NASA Langley, NTRS-Datum 1997 ([NTRS 20040110310](https://ntrs.nasa.gov/citations/20040110310), [PDF](https://ntrs.nasa.gov/api/citations/20040110310/downloads/20040110310.pdf)) | Polynome für CX, CY, CZ, Cl, Cm, Cn aus den TP-1538-Daten (Tab. 2: Struktur, Tab. 3: Koeffizienten). Gültig für α −10…45°, β ±30°, δe ±25°, δa ±21,5°, δr ±30° (Tab. 1), Mach < 0,6, ohne Bodeneffekt, Fahrwerk eingefahren, ohne Außenlasten | „Work of the US Gov. Public Use Permitted.“ | **Empfohlen.** Glatt (keine Knicke durch Interpolation), klein und frei nutzbar |
| **Stevens, Lewis, Johnson: „Aircraft Control and Simulation“**, 3. Aufl., Wiley 2016 ([MathWorks-Buchseite](https://www.mathworks.com/academia/books/aircraft-control-and-simulation-lewis.html)) | Anhang A: F-16-Modell mit Tabellen über α −10…45° in 5°-Schritten, Dämpfungsableitungen, Triebwerk; Referenz für viele Nachbauten (`subf16_model.py:50`) | Buch und Code © Wiley | Die Zahlen gehen auf NASA-Daten zurück ([UMN-Seite](https://dept.aem.umn.edu/~balas/darpa_sec/SEC.Software.html): „low fidelity“ nach Stevens & Lewis, „high fidelity“ nach TP-1538). Als Referenz verwenden, den Code nicht abschreiben |
| **JSBSim `aircraft/f16/f16.xml`**, Erik Hofman, seit 2001 ([Raw-Datei](https://raw.githubusercontent.com/JSBSim-Team/jsbsim/master/aircraft/f16/f16.xml)) | F-16A Block 32, komplette Aero-Tabellen inkl. Mach-, Vorflügel- und Bremsklappenterme, eigenes Steuersystem | **GPL** (`f16.xml:9-11`). Die Bibliothek selbst steht unter LGPL 2.1 ([README](https://github.com/JSBSim-Team/jsbsim)) | Gegenprüfen ja, kopieren nein. Nennt TP-1538 und Murray (Caltech) als Quellen (`f16.xml:30-31`) |
| **AeroBenchVVPython** (Stanley Bak) / **AeroBenchVV** (MATLAB) ([GitHub](https://github.com/pheidlauf/aerobenchvv)) | Python-Port von Stevens & Lewis (Tabellen) und Morelli (Polynome) (`subf16_model.py:104-116`), dazu ein LQR-Regler | **GPL-3.0** (`LICENSE`) | Sehr gut zum Gegenprüfen unserer Umsetzung, nicht zum Kopieren |
| **UMN „Non-linear F-16 Simulation“** (`nlplant.c`, Simulink) ([UMN](https://dept.aem.umn.edu/~balas/darpa_sec/SEC.Software.html)) | Modelle mit niedriger und hoher Genauigkeit, Vorflügel aus TP-1538 | keine Lizenz angegeben | Nicht übernehmen |
| **NASA LAR-17463-1** „A Collection of Nonlinear Aircraft Simulations in MATLAB“ ([NASA Software](https://software.nasa.gov/software/LAR-17463-1)) | Enthält u. a. eine F-16 | „U.S. Release Only“, mit Nutzungsvertrag | Für uns ungeeignet |

**Masse und Trägheit nach Stevens & Lewis** (gleiche Werte wie in JSBSim, `f16.xml:62-66`; Geometrie in `subf16_model.py:61-63`): Gewicht 20 500 lb (rund 9 300 kg), S = 300 ft² (27,9 m²), b = 30 ft (9,14 m), c̄ = 11,32 ft (3,45 m). Trägheitsmomente in slug·ft², in Klammern kg·m²: Ixx 9 496 (12 875), Iyy 55 814 (75 674), Izz 63 100 (85 552), Ixz 982 (1 331). Bezugsschwerpunkt bei 0,35 c̄. Zum Vergleich: Die Schätzung in `src/sim/types.ts:77-81` ergibt für die 12-t-F-16 etwa 14 300 / 72 900 / 79 900 kg·m². Das ist erstaunlich nah, hängt aber an der höheren Masse.

**Abgleich mit TP-1538:** Bei der nominellen Schwerpunktlage von 0,35 c̄ ist das Flugzeug bei niedriger Fahrt leicht instabil, mit einem statischen Maß von etwa −4 %. Ein stabiler Deep-Stall-Trimmpunkt liegt um α ≈ 60°, und oberhalb von α ≈ 25° verliert das Höhenleitwerk an Wirkung nach unten ([TP-1538](https://ntrs.nasa.gov/citations/19800005879), Abschnitt „Longitudinal Characteristics“, Abb. 10). **Ohne Steuersystem ist das Modell also nicht fliegbar.** Das passt zur echten F-16 und bedeutet: Daten und Steuersystem müssen zusammen kommen.

**Was fehlt:** Transsonik und Überschall (Mach > 0,6), Bodeneffekt, Fahrwerk und Klappen, Außenlasten. JSBSim ergänzt das mit eigenen Termen, z. B. CDmach mit 0 bis Mach 0,81, 0,023 bei Mach 1,1 und 0,015 bei Mach 1,8 (`f16.xml:1036-1051`), Herkunft nicht belegt. Für planr schlage ich vor, diese Zuschläge selbst und bewusst einfach zu modellieren: Wellenwiderstand über Mach, Rückgang von CLα und mehr Längsstabilität im Überschall. Bodeneffekt und Fahrwerkswiderstand übernehmen wir aus dem bestehenden Modell (`src/sim/aero.ts:166-173`).

## 3. Steuergesetze (Fly-by-Wire)

Belegte Struktur und Grenzwerte:

| Kanal | Verhalten | Quelle |
|---|---|---|
| Nicken | Vorgabe der Normalbeschleunigung (g). Künstliche Stabilität durch α-Rückführung, Begrenzung von Lastvielfachem und α. α-Grenze 25° | [TP-1538](https://ntrs.nasa.gov/citations/19800005879), „Description of Airplane“, „Longitudinal Characteristics“ |
| Nicken | α-Begrenzer abhängig von g und α bis 9 g; im 1-g-Flug bei 25,2°, bei höherer Last Übergang auf 25,5° | Vortrag „The Safety Value of Protected Flight Controls“, [FTSW 2022](https://www.flighttestsafety.org/images/FTSW_2022_-_The_Safety_Value_of_Protected_Flight_Controls.pdf) (Transkript, Sekundärquelle) |
| Nicken | Grenzen +9 g / −4 g (Kommentar), umgesetzt als Begrenzung des Knüppelsignals und α-Ausblendung des Knüppels bis 30° | JSBSim `f16.xml:516-547` |
| Rollen | Rollratenvorgabe proportional zur Knüppelkraft, max. 308°/s. „Control System B“ nimmt das bis auf 80°/s zurück: −4°/s je Grad α über 15°, −4°/s je Grad Höhenruder nach unten über 5° und eine Staudruckabsenkung unter 10 500 N/m² (≈ 250 kn IAS) | [TP-1538](https://ntrs.nasa.gov/citations/19800005879), Abb. 26–27 |
| Rollen | Normal 300°/s in Reiseflugkonfiguration, weniger bei α > 15°, niedriger Fahrt und Höhenleitwerk > 5° nach unten | FTSW 2022 |
| Gieren | Gierdämpfer in Stabilitätsachsen; Querruder-Seitenruder-Kopplung (ARI), die Pedaleingaben ausblendet; automatischer Trudelschutz ab α > 29° | [TP-1538](https://ntrs.nasa.gov/citations/19800005879), „Lateral-Directional Characteristics“, Abb. 19 |
| Gieren | Seitenruderweg geht bei 26° α auf null; Cnβ wird bei etwa 29° α null | FTSW 2022 |
| Ausschläge | Höhenleitwerk ±25°, Querruder ±21,5°, Seitenruder ±30° | TP-1538; Morelli Tab. 1; AeroBenchVV `low_level_controller.py:15-20` |
| Stellraten | **nicht belegt.** In keiner gelesenen Quelle gefunden; in Nachbauten verbreitet sind etwa 60°/s (Höhe), 80°/s (Quer), 120°/s (Seite), aber unbestätigt | — |

Offene Implementierungen als Muster:

- **JSBSim** (GPL): Rollkanal als PID auf der Rollrate mit kp = 3 (`f16.xml:353-410`). Nickkanal als PID auf einer Mischung aus Nickrate und g (`f16.xml:557-612`) plus α-Begrenzer (`f16.xml:553-556`). Gierkanal mischt Gierrate und Seitenbeschleunigung, mit Verstärkung nach Geschwindigkeit (`f16.xml:673-700`). Das ist eher pragmatisch als nachgebaut.
- **AeroBenchVV** (GPL-3.0): ein LQR-Regler auf Nz, Stabilitätsachsen-Rollrate und Ny+r, mit Integratoren (`low_level_controller.py:62-111`). Er ist um *einen* Trimmpunkt herum ausgelegt (502 ft/s, 1000 ft, `low_level_controller.py:35-37`) und begrenzt auf Nz −1…+6 (`low_level_controller.py:22-23`). Taugt nicht für die ganze Hüllkurve.

**Entwurfsvorschlag für planr** (eigene Ableitung, nicht aus einer Quelle):

- **Nicken:** Knüppel auf g-Vorgabe abbilden, +9 g voll gezogen, −3 bis −4 g voll gedrückt, neutral 1 g mit Lagekorrektur cos θ·cos φ (wie in JSBSim, `f16.xml:501-513`). Bei niedrigem Staudruck auf eine Nickratenvorgabe überblenden (C*-artig). PI-Regler mit q-Dämpfung; die Verstärkung wird mit 1/q̄ angepasst, sonst wird er im Schnellflug zu scharf. Der α-Begrenzer schneidet die Vorgabe ab etwa 20° weich und bei 25° hart ab.
- **Rollen:** Ratenvorgabe bis 300°/s mit den Absenkungen nach TP-1538. Gedreht wird um die Stabilitätsachse (Geschwindigkeitsvektor), damit das Rollen bei hohem α nicht in Schiebewinkel umschlägt.
- **Gieren:** Gierdämpfer (Rückführung von r − p·sin α), ARI mit Verstärkung nach α, Pedalwirkung ab 26° α ausblenden, Trudelschutz ab 29° α.
- **Stellglieder:** Verzögerung 1. Ordnung (etwa 0,05 s) plus Begrenzung von Stellrate und Ausschlag; die Ruderstellungen sind Zustand am `Aircraft`.
- **Bezug zu planr:** Der Autopilot schreibt heute direkt in `ControlState` (`src/sim/systems.ts:216-244`), und `Aircraft.step` ruft ihn vor der Aerodynamik auf (`src/sim/aircraft.ts:126`). Das FCS gehört in dieselbe Lücke, schreibt aber keine Knüppelwerte, sondern Ruderstellungen. Der Autopilot sollte dann für die F-16 g und Rollrate vorgeben statt Knüppelwerte. Der Modus „Einfach“ kann denselben Regler mit engeren Grenzen nutzen.

## 4. Triebwerk

| Triebwerk | Trocken (Intermediate/MIL) | Mit Nachbrenner | Quelle |
|---|---|---|---|
| F110-GE-129 | 17 155 lbf (76,3 kN) | 29 500 lbf (131,2 kN) | [Wikipedia F110](https://en.wikipedia.org/wiki/General_Electric_F110), stützt sich auf GE, ASME und MTU (Sekundärquelle) |
| F110-GE-129 | — | „Thrust class 29,000 lb / 129 kN“, Luftdurchsatz 122 kg/s, Bypass 0,76 | [GE-Datenblatt](https://www.geaerospace.com/sites/default/files/datasheet-F110-GE-129.pdf) (primär; nennt keinen Trockenschub) |
| F110-GE-129 | — | 29 000 lbf, Gesamtdruckverhältnis 30,7, Bypass 0,76 | [MTU](https://mtu.de/engines/military-aircraft-engines/fighter-aircraft/f110) |
| F100-PW-229 | 17 800 lbf (79,2 kN) | 29 160 lbf (129,7 kN) | [Wikipedia F100](https://en.wikipedia.org/wiki/F100_engine), stützt sich auf die P&W-Produktkarte; die [P&W-Seite](https://www.rtx.com/en/prattwhitney/products/military-engines/f100) zeigt im Abruf keine Zahlen |
| F100-PW-229 (JSBSim) | 17 800 lbf | 29 000 lbf, Tabellen über Mach und Dichtehöhe | `F100-PW-229.xml:15-16`, mit Aero-Matic erzeugt (`F100-PW-229.xml:4`); LGPL 2.1 (JSBSim-Repo) |
| Stevens & Lewis (Buchmodell) | 12 680 lbf Standschub am Boden | 20 000 lbf am Boden, 28 886 lbf bei Mach 1 | AeroBenchVVPython `thrust.py:14-33` (Idle-, MIL- und Max-Tabellen über 0…50 000 ft und Mach 0…1); entspricht einem älteren, schwächeren Triebwerk |

**Schubverlauf:** In den Tabellen von Stevens & Lewis steigt der Nachbrennerschub am Boden von 20 000 lbf (Stand) auf 28 886 lbf bei Mach 1 (`thrust.py:28-33`). In JSBSim steigt er auf das 1,05-Fache bei Mach 1 und das 1,57-Fache bei Mach 2 (`F100-PW-229.xml:68-78`). planr senkt den Schub dagegen mit der Fahrt um bis zu 25 % (`src/sim/engine.ts:182`). Das unterschätzt die Beschleunigung im Schnellflug deutlich.

**Spool-Zeiten:** Herstellerangaben oder NASA-Messungen für Leerlauf → MIL bei F110/F100 habe ich nicht gefunden. Das NASA-Memo TM-86031 (F100 EMD in der F-15, [NTRS 19840020723](https://ntrs.nasa.gov/api/citations/19840020723/downloads/19840020723.pdf)) nennt nur Herunterlauf- und Wiederanlasszeiten: 8–17 s Herunterlaufen auf 40 % N2 bei 200 kn, 53–170 s für einen Wiederstart in der Luft. Verfügbare Modellansätze:

- **Stevens & Lewis:** Die Hebel-Leistungs-Kennlinie `tgear` legt 0…77 % Hebel auf 0…50 % Leistung (trocken) und den Rest auf 50…100 % (Nachbrenner) (`tgear.py:6-14`). Die Leistung folgt erster Ordnung mit 1/τ = 1/s bei kleinen Sprüngen (≤ 25 %), fallend bis 0,1/s bei großen Sprüngen (≥ 50 %); im Nachbrennerbereich gilt 1/τ = 5/s (`pdot.py:9-29`, `rtau.py:8-18`). Große Hebelsprünge brauchen also mehrere Sekunden.
- **JSBSim:** generische Spool-Rate `90/(BPR+3)` %/s, verringert bei niedriger Drehzahl und dünner Luft (`FGTurbine.h:329-336`). Ein Schätzansatz, nicht auf das F100 abgestimmt.
- Für planr reicht `JetEngine` mit neuer Kennlinie: Schub = f(Mach, Höhe, Leistung) aus eigenen, glatten Näherungen, die wir an die Eckwerte oben anpassen. Dazu Spool-Verhalten nach Stevens & Lewis und ein gestufter statt geschalteter Nachbrenner (heute `src/sim/engine.ts:180`).

## 5. Lizenzen auf einen Blick

| Material | Lizenz | Folge für planr |
|---|---|---|
| NASA TP-1538, Morelli 1997, TM-86031 | US-Regierungswerk, „Public Use Permitted“ (NTRS) | frei verwendbar; Quelle im Code nennen |
| Stevens/Lewis/Johnson (Buch, Fortran/MATLAB-Code) | © Wiley | nur als Referenz; Zahlen auf die NASA-Quelle zurückführen |
| JSBSim `f16.xml` | GPL (Dateikopf `f16.xml:9-11`) | nicht übernehmen; planr hat keine Lizenzdatei und ist `"private": true` (`package.json:3`) |
| JSBSim-Bibliothek, `engine/F100-PW-229.xml` | LGPL 2.1 | Daten zu übernehmen würde LGPL-Pflichten für unser Bundle auslösen; besser nur vergleichen |
| AeroBenchVV / AeroBenchVVPython | GPL-3.0 | nur zum Gegenprüfen (z. B. Morelli-Werte vergleichen) |
| UMN `nlplant.c` | keine Angabe | nicht übernehmen |
| NASA LAR-17463-1 | „U.S. Release Only“, mit Nutzungsvertrag | ungeeignet |

Das ist keine Rechtsberatung. Ob reine Messwerte aus GPL-Dateien schutzfähig sind, lasse ich offen. Der Weg über die NASA-Primärquellen erspart uns die Frage.

## 6. Empfehlung

1. **`AeroModel`-Schnittstelle einführen.** `AircraftType.aero` wird zu `{ kind: 'linear', params: AeroParams } | { kind: 'f16', ... }` oder zu einem Objekt mit `compute(...)`. Das heutige `computeAero` bleibt die lineare Implementierung, und die neun anderen Typen bleiben unverändert.
2. **F-16-Aerodynamik nach Morelli 1997** in TypeScript aus dem NTRS-PDF (Tab. 2/3) abtippen; nicht aus AeroBenchVV kopieren, nur damit gegenprüfen (gleiche Ausgaben für ein Raster von α, β und Ruderstellungen). Dämpfungsterme sind dort enthalten. Achsen wie in Abschnitt 1 umrechnen.
3. **Eigene Mach- und Konfigurationszuschläge** (Wellenwiderstand, Klappen, Fahrwerk, Bodeneffekt), klein und testbar. Die **Atmosphäre** um Tropopause und Schallgeschwindigkeit erweitern (`src/sim/atmosphere.ts`), mit Mach aus dem lokalen a statt 340 m/s.
4. **FCS als eigenes Modul** `src/sim/fcs.ts` mit g-/Nickraten-Vorgabe, α-Begrenzer, Rollratenvorgabe und Absenkungen, Gierdämpfer, ARI und Trudelschutz. Dazu Ruderstellungen mit Stellgliedmodell am `Aircraft`, die auch das Außenmodell zeigt (`src/view/genericModel.ts:452-455`). Ixz in die Rotationsgleichung aufnehmen (`src/sim/aircraft.ts:189-196`); für die anderen Typen bleibt der Wert 0.
5. **Triebwerk** mit Mach- und Höhenkennlinie und Spool-Verhalten nach Stevens & Lewis; Eckwerte F110-GE-129 mit 76 kN trocken und 129–131 kN Nachbrenner am Stand.
6. **Tests als Abnahme:** Die Werte in `src/sim/fleet.test.ts:92` behalten. Neu dazu: α nie über 26° bei vollem Ziehen, g nie über 9,5, Rollrate 280–320°/s bei 350 kn, stabiler Geradeausflug ohne Trimmen, kein Abflug bei vollem Knüppel quer und voll gezogen.

Offen: Stellraten der Stellglieder, Spool-Zeiten und Vorflügelplan aus Primärquellen. Die Anhänge von TP-1538 (Tabelle I, Appendix A) sollte man einmal direkt im PDF lesen; mein Abrufwerkzeug lieferte nur den Fließtext.
