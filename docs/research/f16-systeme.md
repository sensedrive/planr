# Recherche: Bedienelemente und Systeme eines F-16C Block 52

Stand 2026-10-17, überarbeitet für Issue #20 (Umstellung auf Block 52, Nachrecherche zu S1 Kapitel 6 ff.). Ursprüngliche Frage aus Issue #15: Was braucht ein voll funktionsfähiges F-16C-Cockpit, in dem jeder Schalter ein simuliertes System steuert? Teil 1 ist ein Inventar der Bedienelemente, Panel für Panel. Teil 2 beschreibt je System, was ein Sim nachbilden muss und wovon es abhängt. Teil 3 schätzt den Umfang. Baut auf [f16-cockpit-referenzen.md](f16-cockpit-referenzen.md) auf (Lage und Maße der Panels).

**Projektentscheidung:** planr bildet den **Block 52** mit Triebwerk **P&W F100-PW-229** nach. Wo der Block 50 (GE F110-GE-129) abweicht, steht das als Vermerk „Block 50:“ dabei.

## Änderungen durch #20

- **Block 52 statt Block 50:** Triebwerksabschnitt (2.5), Triebwerkspanel (1.1), Caution-Feld EEC/BUC statt SEC (2.13) und Kaltstart (2.15) auf F100-PW-229 umgestellt; Block-50-Angaben (ENG CONT, AB RESET, SEC-Check, GE129-Leerlaufwerte) ersetzt bzw. als Unterschied vermerkt.
- **Korrektur zu S1:** Das Triebwerkskapitel von S1 beschreibt nicht das GE129, sondern das **F100-PW-220/220E** mit DEEC/SEC; die Caution-Leuchten EEC und BUC sind dort als „deaktiviert“ geführt. Die bisherige Zuordnung „Block 50 = DEEC/SEC laut S1“ war darum falsch zugeordnet. Siehe 2.5.
- **S1 Kapitel 6 ff.:** weiter nicht als Volltext lesbar (Download per curl vom Proxy abgewiesen, Abrufwerkzeug endet in Kapitel 5). Ausgewertet wurde das **Inhaltsverzeichnis** dieser Kapitel; es belegt Aufbau, Bedienelemente und Leuchten (z. B. Down-Permission-Taste, Spin-Down-Bremsung, vier FLCS-Limiter, Low-Speed-Warnton), aber keine Funktionsbeschreibungen oder Buszuordnungen.
- **Neue Quellen:** S9 (QuebecAirForce, BMS-Kaltstart Block 52/PW-229), S10 (BMS-Avionikhandbuch Dash-34, Inhaltsverzeichnis). Einige [Sim-Wissen]-Stellen sind dadurch belegt (MFD-Formate, Ruderpedale mit Fußbremsen, Leerlaufwerte PW-229), die übrigen bleiben gekennzeichnet.
- Was nicht ging und warum: Abschnitt „Offene Punkte“.

## Kennzeichnung und Quellen

**[belegt Sx]** = steht so in Quelle Sx (Liste unten). **[Sim-Wissen]** = Verhalten, wie es Falcon BMS/DCS üblicherweise nachbilden, ohne dass ich es hier in einer Quelle nachgelesen habe, oder meine Ableitung. Vor dem Bauen gegen S1 prüfen, wenn es auf Zahlen ankommt.

Alle Texte sind zusammengefasst, nichts wörtlich übernommen.

| Id | Quelle | Was sie liefert | Vertrauen |
|---|---|---|---|
| S1 | [Falcon BMS: TO 1F-16CM/AM-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf) (Version 4.37.4, „Blocks 50, 52, 52+ and MLU“) | Triebwerk (beschrieben für **F100-PW-220/220E**), JFS, Kraftstoff, Luftbetankung, Anfang ECS (Kapitel 1–5); dazu das Inhaltsverzeichnis aller Kapitel | hoch (an das echte -1 angelehnt). **Einschränkung:** Das Abrufwerkzeug liefert nur die ersten ca. 115 000 Zeichen (bis Seite 62, Anfang Kapitel 5); Kapitel 6 ff. (Elektrik, Hydraulik, Fahrwerk, FLCS, Licht, Sauerstoff, Normal Procedures) sind nur über das Inhaltsverzeichnis greifbar. Download per curl: der Proxy weist `cdn.falcon-bms.com` per Richtlinie ab (403, Stand #20 erneut geprüft). |
| S2 | xflight.de (Martin Schmitt), Panel-Unterseiten, z. B. [Elec](https://www.xflight.de/pe_org_par_lfc_elec.htm), [Engine Start](https://www.xflight.de/pe_org_par_lfc_engstart.htm), [Flt Control](https://www.xflight.de/pe_org_par_lfc_fltctrl.htm), [Caution Panel](https://www.xflight.de/pe_org_par_rxc_wpanel.htm); vollständige Liste unter „Quellen“ | je Panel: Schalter, Stellungen, Funktion, Leuchten; teils nach Block getrennt | hoch für Schalterstellungen; einzelne Funktionstexte sind offenkundig falsch oder mit „?“ markiert (vermerke ich) |
| S3 | [DCS-BIOS, Modul F-16C_50.lua](https://raw.githubusercontent.com/DCS-Skunkworks/dcs-bios/main/Scripts/DCS-BIOS/lib/modules/aircraft_modules/F-16C_50.lua) | maschinenlesbare Liste aller klickbaren Elemente und Leuchten des DCS-F-16C-Block-50 mit Stellungen | hoch als **Inventar** (so viel Klickbares hat ein ausgereifter Sim); bildet DCS ab, nicht das echte Flugzeug |
| S4 | Brainscape-Lernkarten „F-16“ (Nutzer-Deck): [Electrical](https://brainscape.com/flashcards/electrical-system-7636120/packs/12578530), [Hydraulic](https://www.brainscape.com/flashcards/hydraulic-system-7632457/packs/12578530), [EPU](https://www.brainscape.com/flashcards/epu-7634205/packs/12578530), [Fuel](https://www.brainscape.com/flashcards/fuel-system-7632801/packs/12578530), [FLCS](https://www.brainscape.com/flashcards/flcs-7642762/packs/12578530), [ECS](https://www.brainscape.com/flashcards/ecs-7642667/packs/12578530), [Engine](https://www.brainscape.com/flashcards/engine-7638700/packs/12578530) | Zahlen und Logik, offensichtlich aus einer echten Ausbildung abgeschrieben | **mittel/niedrig**: inoffiziell, und das Deck beschreibt ein **älteres** Muster (Triebwerk PW220, FLCS-Leuchten PRY/SERVO/DUAL FC = Block 25–42). Nur übernehmen, wo es zum Block 50 passt |
| S5 | [47th Fighter Squadron: BMS-Checkliste kurz V7](https://47df.com/downloads/Taktik_Page/47th_BMS_Checklist_short_V7.pdf) (BMS 4.33, GE129) | Kaltstart Schritt für Schritt mit erwarteten Leuchten und Grenzwerten | mittel: Sim-Checkliste, auf dem BMS-Dash-1 aufgebaut |
| S6 | [Falcon-BMS-Forum: Master Caution/Elect systm/EPU](https://forum.falcon-bms.com/topic/16854/master-caution-elect-systm-epu) | ELEC SYS, EPU-Anlauflogik am Boden | mittel (Forum, zitiert -1) |
| S7 | [BMS-Wiki (biligame), Kapitel 9 „Störungen im Flug“](https://wiki.biligame.com/falconbms/9_%E9%A3%9E%E8%A1%8C%E4%B8%AD%E6%95%85%E9%9A%9C) | Ablauf eines Generatorausfalls in BMS, was ausfällt | mittel (Sim-Training) |
| S8 | f-16.net-Foren: [Generators in the F-16](https://www.f-16.net/forum/viewtopic.php?p=8223), [Main PWR on the F-16](https://www.f-16.net/forum/viewtopic.php?p=186657) (auch [p=186672](https://www.f-16.net/forum/viewtopic.php?p=186672)) | Generatorleistung, Stromübergabe beim Start | niedrig/mittel (Forum) |
| S9 | [QuebecAirForce: QAF Ramp Start BMS 4.37, Kurzfassung](https://www.quebecairforce.com/img/Sim_BMS/Ref/Procedures/Ramp_Start/BMS437/QAF_Ramp_Start_437_Sommaire.pdf) (v4.37.5.0, 2024-12-17, F-16CM-52 mit PW-229) | Kaltstart Block 52 in BMS mit Leerlaufwerten und Aufwärmzeit der MFDs | mittel: Sim-Checkliste einer virtuellen Staffel; Textauszug aus dem PDF war teils durcheinander |
| S10 | [Falcon BMS: TO 1F-16CM/AM-34-1-1 BMS](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-34-1-1%20BMS.pdf) (Avionik, 4.37) | nur **Inhaltsverzeichnis** lesbar: MFD-Formate, EGI-Ausrichtungsarten, IFF-Caution als eigener Abschnitt | hoch für die Gliederung, ohne Inhalt |

Nicht genutzt: [flightchecklist.app](https://flightchecklist.app/bms/f-16c-block52-bms) (enthält offensichtliche Fehler, z. B. Schwenkflügel). **Bewusst nicht genutzt:** im Netz kursierende Kopien echter Flughandbücher (z. B. ein griechisches T.O. GR1F-16CJ-1 für Block 50/52+ auf publicintelligence.net, Kopien auf studylib/Scribd); sie tragen Verbreitungsbeschränkungen (nur militärische Nutzung, Weitergabe nur mit Genehmigung) und gehören nicht in ein öffentliches Repo. Nicht abrufbar (Abruffehler oder Download gesperrt): DCS-F-16C-Handbuch, Chuck's DCS-F-16C-Guide, BMS-Training-Manual 4.37 und 4.38, BMS-Forum (robots-Sperre), Scribd (JavaScript-Sperre). Die Kapitel 6 ff. von S1 bleiben der wichtigste offene Punkt (siehe Ende).

## Kurzfassung

1. **Umfang:** Ein vollständiges Cockpit hat rund **290–320 Bedienelemente** (davon 40 MFD-Tasten, ca. 33 am ICP, ca. 17 an Stick und Throttle mit ca. 45 Einzelfunktionen) und **rund 150 Leuchten/Anzeigen** (32 Felder Caution Panel, 11 Eyebrow-Leuchten, 9 Elec-Leuchten, RWR/ECM/CMDS-Leuchten). DCS-BIOS (S3) listet allein ca. 280 klickbare Elemente.
2. **Block 52 (entschieden):** Die Blöcke unterscheiden sich im Cockpit fast nur am Triebwerkspanel (Block 52 P&W F100-PW-229: EEC/BUC, STARTING FUEL, MAX POWER wirksam; Block 50 GE F110-GE-129: ENG CONT PRI/SEC, AB RESET/ENG DATA) und an den Caution-Feldern EEC/BUC bzw. SEC [belegt S2]. Das Projekt hat sich für **Block 52** entschieden. Achtung: DCS (S3) bildet Block 50 ab, und BMS (S1) beschreibt die Triebwerksregelung nach dem Muster des PW-220 (DEEC/SEC) und führt EEC/BUC als deaktiviert. Für das PW-229-Verhalten gibt es darum nur wenige belastbare Angaben (siehe 2.5).
3. **Das Herz ist die Energieversorgung:** Fast jedes System hängt an einem Bus. Ein Sim braucht ein Busmodell mit vier Stufen (Batterie, Standby-Generator, Hauptgenerator, EPU) und je Verbraucher einen Bus. Danach kommen Hydraulik A/B (beide FLCS, B zusätzlich Fahrwerk, Bremsen, NWS, JFS-Speicher) und der Kraftstoff (zwei Systeme vorn/hinten, Reservoirs) [belegt S1, S4].
4. **Kaltstart** in Kurzform: Triebwerkspanel prüfen (EEC/BUC auf EEC, STARTING FUEL, MAX POWER OFF) → MAIN PWR BATT → FLCS-Power-Test → MAIN PWR → JFS START 2 → Throttle IDLE → JFS aus bei ca. 50 % → Leerlauf 60–76 % → Avionik ein → INS ausrichten → FLCS BIT → EPU-Check → OBOGS-BIT. Mit erwarteten Leuchten in Abschnitt 2.15 [belegt S5, S9, teils S1, S2].
5. **Größter Aufwand:** Avionik (MFD-Formate, DED-Seiten, INS, Radar) und Waffen/SMS sind je für sich größer als alle mechanischen Systeme zusammen. Für planr sinnvoll: zuerst Elektrik, Kraftstoff, Triebwerk/JFS/EPU, Hydraulik, Fahrwerk, Licht und Caution/Warning vollständig; Avionik nur mit Grundformaten; Waffen und ECM als Attrappen mit Stellungslogik.

---

# Teil 1: Inventar der Bedienelemente

**Spalten:** *Typ* — K2 = Kippschalter 2 Stellungen, K3 = Kippschalter 3 Stellungen, „(F)“ = federt in die Mitte bzw. Ruhestellung zurück, G = mit Schutzbügel/Klappe (Guard), „Hebelsperre“ = muss vor dem Umlegen gezogen werden; T = Taster; D*n* = Drehschalter mit *n* Rasten; Poti = stufenloser Drehknopf; H = Hebel/Griff. *System* verweist auf Teil 2. Quelle: Stellungen aus S3 und S2, wenn nicht anders vermerkt; Lage der Panels siehe [f16-cockpit-referenzen.md §3](f16-cockpit-referenzen.md).

## 1.1 Linke Konsole

| Panel | Element | Typ | Stellungen | System | Quelle |
|---|---|---|---|---|---|
| TEST | FIRE & OHEAT DETECT | T | – | Warnsystem (Feuer-/Überhitzungstest) | S2, S3 |
| TEST | OXY QTY | K2 (F) | OXY QTY / OFF | Sauerstoff (Mengenanzeigetest) | S2; fehlt in S3 |
| TEST | MAL & IND LTS | T | – | Licht/Warnsystem (Lampentest, VMS-Ansagen) | S2, S3, S5 |
| TEST | PROBE HEAT | K3 (TEST federt) | PROBE HEAT / OFF / TEST | Umwelt (Sondenheizung) | S2, S3 |
| TEST | EPU/GEN TEST | K2 (F) | EPU/GEN / OFF | EPU/Elektrik | S2, S3 |
| TEST | FLCS PWR TEST | K3 (F) | MAINT / NORM / TEST | Elektrik/FLCS | S2, S3 |
| TEST | Leuchten FLCS PWR A, B, C, D | Leuchte grün | – | FLCS | S2, S3 |
| FLT CONTROL | DIGITAL BACKUP | K2, Hebelsperre | OFF / BACKUP | FLCS | S2, S3 |
| FLT CONTROL | ALT FLAPS | K2, Hebelsperre | NORM / EXTEND | FLCS | S2, S3 |
| FLT CONTROL | MANUAL TF FLYUP | K2, Hebelsperre | ENABLE / DISABLE | FLCS/TFR | S2, S3 |
| FLT CONTROL | LE FLAPS | K2, Hebelsperre | AUTO / LOCK | FLCS | S2, S3 |
| FLT CONTROL | FLCS RESET | K2 (F), G | OFF / RESET | FLCS/Warnsystem | S2, S3 |
| FLT CONTROL | BIT | K2 (magnetisch gehalten, fällt nach Test ab) | OFF / BIT | FLCS | S2, S3, S5 |
| FLT CONTROL | Leuchten RUN (grün), FAIL (rot) | Leuchte | – | FLCS | S2 |
| MANUAL TRIM | ROLL TRIM | Rändelrad | L WING DN … R WING DN | FLCS (Trimmung) | S2, S3 |
| MANUAL TRIM | PITCH TRIM | Rändelrad | NOSE DN … NOSE UP | FLCS | S2, S3 |
| MANUAL TRIM | YAW TRIM | Poti mit Rahmen | L … R | FLCS | S2, S3 |
| MANUAL TRIM | TRIM/AP DISC | K2 | NORM / DISC | FLCS/Autopilot | S2, S3 |
| MANUAL PITCH | MANUAL PITCH OVRD | K2 (F aus OVRD), Rahmen | NORM / OVRD | FLCS | S2, S3 |
| FUEL | FUEL MASTER | K2, G | MASTER / OFF | Kraftstoff | S2, S3 |
| FUEL | TANK INERTING | K2 | TANK INERTING / OFF | Kraftstoff | S2, S3 |
| FUEL | ENG FEED | D4 | OFF / NORM / AFT / FWD | Kraftstoff | S2, S3 |
| FUEL | AIR REFUEL | K2 | OPEN / CLOSE | Kraftstoff, FLCS, Licht | S2, S3 |
| ENG & JET START | JFS | K3 (F, hält in START per Magnet bis Abschaltung) | START 1 / OFF / START 2 | Triebwerk/JFS | S1, S2, S3 |
| ENG & JET START | JFS RUN | Leuchte grün | – | JFS | S1, S2 |
| ENG & JET START | EEC/BUC | K3, Bügel-Guard | EEC (normal) / OFF / BUC | Triebwerk (Regelung) | S2 |
| ENG & JET START | STARTING FUEL | K3 | AUTO LEAN / RICH / LEAN | Triebwerk (Startkraftstoff) | S2 |
| ENG & JET START | MAX POWER | K2, Rahmen | MAX POWER / OFF (normal) | Triebwerk (Schubreserve ab Mach 1,1) | S2 (S3 kennt den Schalter nur ohne Wirkung, Block 50) |
| ENG & JET START | *Block 50 statt EEC/BUC:* ENG CONT | K2, G | PRI / SEC | Triebwerk | S2, S3; bei Block 52 nicht vorhanden laut Panel-Tabelle in S2 |
| ENG & JET START | *Block 50:* AB RESET | K3 (F) | AB RESET / NORM / ENG DATA | Triebwerk | S2, S3; F100-Panel ohne diesen Schalter laut S2 |
| ELEC | MAIN PWR | K3, Hebelsperre | MAIN PWR / BATT / OFF | Elektrik | S2, S3 |
| ELEC | ELEC CAUTION RESET | T | – | Elektrik/Warnsystem | S2, S3 |
| ELEC | Leuchten FLCS PMG, MAIN GEN, STBY GEN, EPU GEN, EPU PMG, ACFT BATT TO FLCS, FLCS RLY, ACFT BATT FAIL | Leuchte gelb (8) | – | Elektrik | S2, S3 |
| EPU | EPU | K3, zwei Guards (über ON und über OFF) | ON / NORM / OFF | EPU | S2, S3 |
| EPU | Leuchten EPU RUN (grün), HYDRAZN, AIR (gelb) | Leuchte | – | EPU | S2, S3 |
| AUX COMM (CNI-Backup) | CNI | D2 | BACKUP / UFC | Funk/IFF/TACAN | S2, S3 |
| AUX COMM | IFF MASTER | D5 | OFF / STBY / LOW / NORM / EMER | IFF | S2, S3 |
| AUX COMM | M-4 CODE | K3 | ZERO / A/B / HOLD | IFF | S2, S3 |
| AUX COMM | M-4 REPLY | K3 | A / B / OUT | IFF | S2, S3 |
| AUX COMM | M-4 MONITOR | K2 | AUDIO / OUT | IFF | S2, S3 |
| AUX COMM | ENABLE | K3 | M1/M3 / OFF / M3/MS | IFF | S3 |
| AUX COMM | MODE 1 / MODE 3 Ziffernwähler (4) | K3 (F) je Ziffer | ± | IFF | S3 |
| AUX COMM | TACAN-Kanalwähler (Hunderter 0/1, Zehner 0–9, Einer 0–9, Band X/Y) | Rad (4) | – | Navigation | S2 |
| AUX COMM | TACAN-Betriebsart | K2/D | T/R / A/A TR | Navigation | S2 |
| AUDIO 1 | COMM 1 (UHF) Lautstärke/Ein | Poti | OFF … INC | Funk | S2, S3 |
| AUDIO 1 | COMM 2 (VHF) Lautstärke/Ein | Poti | OFF … INC | Funk | S2, S3 |
| AUDIO 1 | COMM 1 MODE, COMM 2 MODE | D3 + Druck | OFF / SQL / GD; Drücken = Ton | Funk | S2, S3 |
| AUDIO 1 | SECURE VOICE, MSL, TF, THREAT | Poti (4) | 0 … INC | Funk/Audio | S2, S3 |
| AUDIO 2 | INTERCOM | Poti | 0 … INC | Audio | S2, S3 |
| AUDIO 2 | TACAN | Poti | OFF … INC (OFF = TACAN aus) | Navigation | S2, S3 |
| AUDIO 2 | ILS | Poti | OFF … INC (OFF = ILS aus) | Navigation | S2, S3 |
| AUDIO 2 | HOT MIC | K3 (CIPHER federt) | HOT MIC / OFF / CIPHER | Audio | S2, S3 |
| EXT LIGHTING | ANTI-COLL | D8 | OFF / 1 / 2 / 3 / 4 / A / B / C | Licht | S3 (xflight zeigt eine ältere Kippschalter-Fassung) |
| EXT LIGHTING | POSITION | K2 | FLASH / STEADY | Licht | S2, S3 |
| EXT LIGHTING | WING/TAIL | K3 | BRT / OFF / DIM | Licht | S2, S3 |
| EXT LIGHTING | FUSELAGE | K3 | BRT / OFF / DIM | Licht | S2, S3 |
| EXT LIGHTING | FORM | Poti | OFF … BRT | Licht | S2, S3 |
| EXT LIGHTING | MASTER | D5 | OFF / ALL / A-C / FORM / NORM | Licht | S3 |
| EXT LIGHTING | AERIAL REFUELING | Poti | OFF … BRT | Licht | S2, S3 |
| UHF (Backup-Radio, Have Quick) | Kanalwähler | D20 | 1–20 | Funk | S2, S3 |
| UHF | Frequenzwähler (100/10/1/0,1/0,025 MHz) | D (5) | – | Funk | S3 |
| UHF | Funktion | D4 | OFF / MAIN / BOTH / ADF | Funk | S2, S3 |
| UHF | Mode | D3 | MNL / PRESET / GRD | Funk | S2, S3 |
| UHF | TONE, TEST, STATUS | T (3) | – | Funk | S2, S3 |
| UHF | SQUELCH | K2 | ON / OFF | Funk | S2, S3 |
| UHF | VOL | Poti | (im F-16 ohne Wirkung, Lautstärke über COMM 1) | Funk | S2 |
| UHF | Abdeckklappe | Klappe | auf / zu | – | S3 |
| ECM | OPR | K3 | OPR / STBY / OFF | ECM | S2, S3 |
| ECM | XMIT | K3 | 1 / 2 / 3 | ECM | S2, S3 |
| ECM | DIM | Poti | – | ECM/Licht | S2, S3 |
| ECM | RESET, BIT | T (2) | – | ECM | S2, S3 |
| ECM | Programmtasten 1–6, FRM, SPL mit je 4 Statusfeldern | T (8) | – | ECM (Inhalt klassifiziert, laut S2) | S2, S3 |
| AVTR | AVTR | K3 | ON / AUTO / OFF | Avionik (Aufzeichnung) | S2 (Fassung je Block unklar); fehlt in S3 |
| AVTR | DISPLAY SELECT, TEST | D4, T | AFT / LEFT / HUD / RIGHT | Avionik | S2 |
| ANTI-G | TEST | T | – | Umwelt (G-Anzug) | S2; fehlt in S3 |
| Seitenwand | Kabinenhaube Notabwurf (CANOPY JETT) | H (T-Griff) | STOW / PULL | Kabinenhaube | S2, S3 |
| Seitenwand | Handkurbel Haube (Manual Canopy) | H | – | Kabinenhaube | S2 |
| Seitenwand | DEFOG | H stufenlos | 0 … MAX | Umwelt | S2, S3 |
| Seitenwand | Chaff/Flare-Slap-Switch | T | – (startet Programm 6) | Gegenmaßnahmen | S2 |
| Seitenwand | RIT | K | laut S1 ohne Funktion | – | S1 |
| am Throttle-Fuß | Friction | Poti | – | Throttle | S1 |

## 1.2 Linke Aux-Konsole

| Panel | Element | Typ | Stellungen | System | Quelle |
|---|---|---|---|---|---|
| GEAR | Fahrwerkshebel LG | H (Radform, mit roter Warnleuchte im Griff) | UP / DN | Fahrwerk | S2, S3 |
| GEAR | DN LOCK REL | T | – (Notentriegelung der Hebelsperre am Boden) | Fahrwerk | S2, S3 |
| GEAR | LG Handle Down Permission Button | T | – (Funktion nicht gelesen) | Fahrwerk | S1 (nur Inhaltsverzeichnis, 9.4); fehlt in S2/S3 |
| GEAR | HORN SILENCER | T | – | Warnsystem | S2, S3 |
| GEAR | Leuchten NOSE, LEFT, RIGHT (grün) | Leuchte (3) | – | Fahrwerk | S2, S3 |
| GEAR | HOOK | K2 | UP / DN | Fahrwerk (Fanghaken) | S2, S3 |
| GEAR | BRAKES | K2 | CHAN 1 / CHAN 2 | Bremsen | S2, S3 |
| GEAR | PARKING BRAKE / ANTI-SKID | K3 | PARKING BRAKE / ANTI-SKID / OFF | Bremsen | S2, S3 |
| GEAR | STORES CONFIG | K2 | CAT I / CAT III | FLCS/Stores | S2, S3 |
| GEAR | LANDING/TAXI LIGHTS | K3 | LANDING / OFF / TAXI | Licht | S2, S3 |
| GEAR | EMER STORES JETTISON | T, G | – | Stores | S2, S3 |
| GEAR | GND JETT ENABLE | K2 | ENABLE / OFF | Stores | S2, S3 |
| ALT GEAR | Alternate-Gear-Griff | H (ziehen) | STOW / PULL | Fahrwerk | S2, S3 |
| ALT GEAR | ALT GEAR RESET | T | – | Fahrwerk | S3 |
| SPEED BRAKE | Stellungsanzeige | Anzeige | zu / Zwischenstellung / offen | Hydraulik A | S3 |
| CMDS | RWR, JMR, MWS (Quellen) | K2 (3) | ON / OFF | Gegenmaßnahmen | S2, S3 |
| CMDS | O1, O2, CH, FL (Ausstoßkategorien) | K2 (4) | ON / OFF | Gegenmaßnahmen | S2, S3 |
| CMDS | JETT | K2 | JETT / OFF | Gegenmaßnahmen | S2, S3 |
| CMDS | PRGM | D5 | BIT / 1 / 2 / 3 / 4 | Gegenmaßnahmen | S2, S3 |
| CMDS | MODE | D6 | OFF / STBY / MAN / SEMI / AUTO / BYP | Gegenmaßnahmen | S2, S3 |
| CMDS | Leuchten NO GO, GO, DISPENSE RDY, Zählerfelder | Leuchte/Anzeige | – | Gegenmaßnahmen | S3 |
| THREAT WARNING AUX | SEARCH, ALT (LOW ALT), SYSTEM POWER | T mit Leuchte (3) | – | RWR | S2, S3 |
| THREAT WARNING AUX | ACTIVITY/POWER | Leuchte | – | RWR | S2, S3 |
| THREAT WARNING AUX | DIM | Poti | – | RWR/Licht | S2, S3 |
| HMD/HMCS | Helligkeit HMCS | Poti | OFF … INC | Avionik | S3; laut S2 nur MLU, für den USAF-Block-50/52 offen |

## 1.3 Frontpanel und Glareshield

### Glareshield/Eyebrows

| Element | Typ | Funktion | System | Quelle |
|---|---|---|---|---|
| MASTER CAUTION | T mit Leuchte | quittiert Sammelwarnung | Warnsystem | S2, S3 |
| F-ACK | T | blättert/quittiert Fehlerliste (PFL) | Warnsystem | S2, S3 |
| IFF IDENT | T | IFF-Ident (I/P) für 15–30 s | IFF | S2, S3 |
| Leuchten links: TF FAIL, (OVRD nur F-16D), MASTER CAUTION | Leuchte | – | Warnsystem | S2, S3 |
| Leuchten rechts: ENG FIRE, ENGINE, HYD/OIL PRESS, FLCS, DBU ON, TO/LDG CONFIG, CANOPY, OXY LOW | Leuchte rot/gelb | – | Warnsystem | S1 (ENGINE, HYD/OIL), S2, S3 |
| AR-Statusanzeige RDY / AR/NWS / DISC | Leuchte | Luftbetankung, Bugradlenkung | S1, S3 |
| AOA-Indexer (3 Symbole) | Leuchte | Anstellwinkel zu hoch/richtig/zu niedrig | Avionik | S3 |

### ICP (Integrated Control Panel) und DED

| Element | Typ | Stellungen/Funktion | Quelle |
|---|---|---|---|
| COM 1, COM 2, IFF, LIST | T (4) | Override-Seiten im DED | S2, S3 |
| A-A, A-G | T (2) | Mastermode Luft-Luft/Luft-Boden | S2, S3 |
| Ziffern 0–9 mit Doppelbelegung (T-ILS 1, ALOW 2/N, 3, STPT 4/W, CRUS 5, TIME 6/E, MARK 7, FIX 8/S, A-CAL 9, M-SEL 0) | T (10) | Seitenwahl bzw. Zifferneingabe | S2, S3 |
| RCL, ENTR | T (2) | Löschen, Eingabe | S2, S3 |
| Wipptaste ▲▼ (Inc/Dec) | K3 (F) | Werte blättern | S2, S3 |
| DCS (Data Control Switch) | 4-Wege (F) | RTN / SEQ / UP / DN | S2, S3 |
| DRIFT C/O / NORM / WARN RESET | K3 (WARN RESET federt) | HUD-Driftausgleich, Warnungs-Reset | S2, S3 |
| WX | T | TFR-Wettermodus | S2, S3 |
| FLIR-Wippe ▲▼ und GAIN / LVL / AUTO | K3 (F), K3 | FLIR im HUD | S2, S3 |
| SYM (HUD-Symbolhelligkeit, OFF = HUD aus), BRT, RET DEPR, CONT | Poti (4) | HUD/FLIR | S2, S3 |
| DED | Anzeige 5 Zeilen × 24 Zeichen | – | S2 (PFLD gleiche Größe) |

### MFDs (zwei Stück, links und rechts)

| Element | Typ | Anzahl | Quelle |
|---|---|---|---|
| OSB 1–20 | T | 20 je MFD = 40 | S2, S3 |
| GAIN, SYM, BRT, CON | Wippe (F) | 4 je MFD = 8 | S2, S3 |

### Instrumente und übrige Frontpanel-Elemente

| Panel | Element | Typ | Stellungen | System | Quelle |
|---|---|---|---|---|---|
| MISC | MASTER ARM | K3 | MASTER ARM / OFF / SIMULATE | Waffen | S2, S3 |
| MISC | LASER ARM | K2 | ARM / OFF | Waffen | S2, S3 |
| MISC | RF | K3 | NORM / QUIET / SILENT | Avionik (Emissionen) | S2, S3 |
| MISC | ALT REL | T | – | Waffen | S2, S3 |
| MISC | AP PITCH | K3 (magnetisch gehalten) | ALT HOLD / A/P OFF / ATT HOLD | Autopilot | S2, S3 |
| MISC | AP ROLL | K3 | HDG SEL / ATT HOLD / STRG SEL | Autopilot | S2, S3 |
| MISC | ADV MODE | T mit Leuchte ACTIVE/STBY | – | TFR/Autopilot | S2, S3 |
| MISC | Leuchte ECM | Leuchte | – | ECM | S2 |
| INSTR MODE | MODE | D4 | ILS/TCN / TCN / NAV / ILS/NAV | Navigation | S2 |
| EHSI | CRS-, HDG-Knopf (drehen und drücken), M-Taste | Drehknopf (2), T | – | Navigation | S3 |
| Höhenmesser | Baro-Knopf, Modushebel | Drehknopf, K3 (F) | ELEC / OFF / PNEU | Avionik (CADC) | S3 |
| Fahrtmesser | Index-Knopf | Drehknopf | – | Avionik | S3 |
| ADI | Pitch-Trim | Drehknopf | – | Avionik | S3 |
| Standby-ADI (SAI) | Cage-Knopf (ziehen), Pitch-Trim | Knopf, Drehknopf | – | Avionik | S3 |
| FUEL QTY SEL | Wahlschalter | D6 | TEST / NORM / RSVR / INT WING / EXT WING / EXT CTR | Kraftstoff | S2, S3 |
| FUEL QTY SEL | EXT FUEL TRANS | K2 | NORM / WING FIRST | Kraftstoff | S2, S3 |
| THREAT WARNING PRIME | HANDOFF, MSL LAUNCH (Leuchte), MODE (PRIORITY), UNKNOWN SHIP, SYS TEST, T (TGT SEP) | T mit Leuchte (6) | – | RWR | S2, S3 |
| RWR-Anzeige | INTENSITY | Poti | – | RWR | S2, S3 |
| Triebwerksinstrumente | Öldruck, NOZ POS, RPM, FTIT, Fuel Flow | Anzeige (5) | – | Triebwerk | S1 |
| Uhr | Aufzug/Stellen, Stoppuhr | Drehknopf, T | – | – | S3 |
| Marker Beacon | Leuchte | – | Navigation | S2, S3 |
| unten Mitte | Pedalverstellung (PEDAL ADJ) | H (ziehen) | – | Mechanik | S2 |

## 1.4 Rechte Aux-Konsole

| Element | Typ | Funktion | System | Quelle |
|---|---|---|---|---|
| Caution Panel | 32 Leuchtfelder (davon 8 unbelegt) | Liste in 2.13 | Warnsystem | S2, S3 |
| PFLD | Anzeige 5 × 24 Zeichen | Pilot Fault List | Warnsystem | S1, S2 |
| Kraftstoffmenge (AL/FR-Zeiger + Totalizer) | Anzeige | – | Kraftstoff | S2, S4 |
| EPU FUEL | Anzeige % Hydrazin | – | EPU | S2, S5 |
| HYD PRESS A, B | Anzeige (2) | 0–4000 psi | Hydraulik | S2, S3 |
| Flüssigsauerstoff / Sauerstoffdruck | Anzeige | – | Sauerstoff | S2 |
| Kabinendruck (Kabinenhöhe) | Anzeige | – | Umwelt | S2 |
| Uhr, Standby-Kompass | Anzeige | – | – | S2, S3 |

## 1.5 Rechte Konsole

| Panel | Element | Typ | Stellungen | System | Quelle |
|---|---|---|---|---|---|
| SNSR PWR | LEFT HDPT, RIGHT HDPT | K2 (2) | ON / OFF | Avionik (Pods) | S2, S3 |
| SNSR PWR | FCR | K2 | FCR / OFF | Avionik (Radar) | S2, S3 |
| SNSR PWR | RDR ALT | K3 | RDR ALT / STBY / OFF | Avionik | S2, S3 |
| HUD | VV/VAH | K3 | VV/VAH / VAH / OFF | Avionik (HUD) | S2, S3 |
| HUD | ATT/FPM | K3 | ATT/FPM / FPM / OFF | HUD | S2, S3 |
| HUD | DED DATA | K3 | DED / PFL / OFF | HUD | S2, S3 |
| HUD | DEPR RET | K3 | STBY / PRI / OFF | HUD | S2, S3 |
| HUD | Geschwindigkeit | K3 | CAS / TAS / GND SPD | HUD | S2, S3 |
| HUD | Höhe | K3 | RADAR / BARO / AUTO | HUD | S2, S3 |
| HUD | Helligkeit | K3 | DAY / AUTO BRT / NIGHT | HUD | S2, S3 |
| HUD | TEST | K3 (STEP federt) | STEP / ON / OFF | HUD | S2, S3 |
| INTERIOR LIGHTING | PRIMARY CONSOLES, PRIMARY INST PNL, DATA ENTRY DISPLAY | Poti (3) | OFF … BRT | Licht | S2, S3 |
| INTERIOR LIGHTING | FLOOD CONSOLES, FLOOD INST PNL | Poti (2) | OFF … BRT | Licht | S2, S3 |
| INTERIOR LIGHTING | MAL & IND LTS | K3 (F) | BRT / Mitte / DIM | Licht | S2, S3 |
| AIR COND | TEMP | Poti mit Bereichen | MAN (COOL…WARM) / OFF / AUTO (COOL…WARM) | Umwelt | S2, S3 |
| AIR COND | AIR SOURCE | D4 | OFF / NORM / DUMP / RAM | Umwelt | S2, S3 |
| ZEROIZE/VOICE | ZEROIZE | K3, G | OFP / OFF / DATA | Avionik | S2, S3 |
| ZEROIZE/VOICE | VOICE MESSAGE | K2 | VOICE MESSAGE / INHIBIT | Warnsystem (VMS) | S2, S3 |
| OXYGEN REGULATOR | SUPPLY | Hebel 3 Stellungen | PBG / ON / OFF | Sauerstoff | S2, S3 |
| OXYGEN REGULATOR | DILUTER | Hebel 2 Stellungen | NORM / 100 % | Sauerstoff | S2, S3 |
| OXYGEN REGULATOR | EMERGENCY | Hebel 3 (TEST MASK federt) | EMERGENCY / NORMAL / TEST MASK | Sauerstoff | S2, S3 |
| OXYGEN REGULATOR | OBOGS BIT | K2 | BIT / OFF | Sauerstoff | S3, S5 |
| OXYGEN REGULATOR | FLOW-Blinker, Druckanzeige | Anzeige | – | Sauerstoff | S2, S3 |
| AVIONICS POWER | MMC, ST STA, MFD, UFC, GPS, DL, MAP | K2 (7) | ON / OFF | Avionik | S2, S3 |
| AVIONICS POWER | MIDS LVT | D3 | ZERO / OFF / ON | Avionik (Datalink) | S3 |
| AVIONICS POWER | INS | D7 | OFF / STOR HDG / NORM / NAV / CAL / INFLT ALIGN / ATT | Navigation | S2, S3 |
| ANTI ICE / ANT SEL | ENGINE ANTI ICE | K3 | ON / AUTO / OFF | Umwelt/Triebwerk | S1, S2, S3 |
| ANTI ICE / ANT SEL | IFF ANT, UHF ANT | K3 (2) | UPPER / NORM / LOWER | IFF/Funk | S2, S3 |
| KY-58 | MODE | D4 | P / C / LD / RV | Funk (Verschlüsselung) | S2, S3 |
| KY-58 | FILL | D8 | Z 1-5 / 1 … 6 / Z ALL | Funk | S2, S3 |
| KY-58 | POWER | D3 | OFF / ON / TD | Funk | S2, S3 |
| KY-58 | VOLUME | Poti | – | Funk | S2, S3 |
| KY-58/Nuclear | PLAIN/CIPHER | K3 | CRAD 1 / PLAIN / CRAD 2 | Funk | S2, S3 |
| NUCLEAR CONSENT | NUCLEAR CONSENT | K3, G | ARM REL / OFF / REL ONLY | Waffen | S2 (Funktion laut Autor unsicher) |
| DTU | Schacht für Data Transfer Cartridge | Mechanik | – | Avionik (DTC-Laden über MFD) | S2 |
| Seitenwand | Floodlight (Spot) | Poti/Lampe | – | Licht | S2 |

## 1.6 Stick (Sidestick, rechte Armlehne)

| Element | Typ | Stellungen | Funktion (Kurz) | Quelle |
|---|---|---|---|---|
| Kraftsensor Nick/Roll | Kraftsteuerung, kaum Weg | – | FLCS-Kommando | f16-cockpit-referenzen.md |
| TRIM | Hut 4-Wege (F) | vor / zurück / links / rechts | Nick- und Rolltrimmung | S2 |
| NWS / A/R DISC / MSL STEP | T | – | Boden: Bugradlenkung ein/aus; Luft: Betankung trennen, Raketenwahl, A-G-Modus | S1, S2 |
| Weapon Release (Pickle) | T mit Klappe | – | Waffenauslösung | S2 |
| Trigger | zweistufig | 1. Stufe / 2. Stufe | Kamera/Laser bzw. Kanone | S2 |
| TMS (Target Management) | Hut 4-Wege (F) | vor/zurück/links/rechts, kurz/lang | Radar-Lock, Sensor-Bedienung | S2 |
| DMS (Display Management) | Hut 4-Wege (F) | vor/zurück/links/rechts | SOI wechseln, MFD-Seiten blättern | S2 |
| CMS (Countermeasures) | Hut 4-Wege (F) | vor/zurück/links/rechts | CMDS-Programme, Freigabe | S2 |
| Expand/FOV (Pinky) | T | – | Sichtfeld/Zoom | S2 |
| Paddle | Hebel (F) | – | Autopilot unterbrechen, solange gedrückt | S2 |

## 1.7 Throttle (TQS, über der linken Konsole)

| Element | Typ | Stellungen | Funktion | Quelle |
|---|---|---|---|---|
| Schubhebel | H mit Rasten | OFF / IDLE / MIL / MAX AB (Nachbrenner in 5 Segmenten) | Triebwerk | S1 |
| Leerlaufraste / Cutoff Release | Raste + Fingerhebel | aus OFF nach IDLE nur durch Verdrehen/Anheben; zurück nach OFF nur mit Release | Triebwerk | S1 (IDLE für alle Starts), S5 (Prüfung, dass OFF ohne Release nicht geht) |
| Friction | Rändel am Fuß | – | Schwergängigkeit | S1 |
| Transmit (COMM) | Hut 4-Wege, halten | UHF / VHF / IFF OUT / IFF IN | Funk senden, Datalink | S2 |
| MAN RNG / UNCAGE | Drehknopf + Druck | – | manuelle Entfernung, Raketen-Uncage | S2 |
| ANT ELEV | Drehknopf mit Mittenraste | ±60° | Radarantenne | S2 |
| Cursor/Enable | Mini-Stick X/Y + Druck | – | Cursor auf MFD/HUD | S2 |
| DOGFIGHT / MSL OVERRIDE | Schiebeschalter 3 Stellungen | DOGFIGHT / Mitte / MSL OVRD | Mastermode-Override | S2 |
| SPEED BRAKE | Daumenschieber 3 Stellungen (aus federt) | ausfahren / halten / einfahren | Bremsklappen (Hydraulik A) | S2 nennt nur „vorn = zu, hinten = offen“; Federung [Sim-Wissen] |
| Chaff/Flare-Taster bzw. Slap-Switch | T | – | Programm 6 | S2 |

## 1.8 Griffe, Sitz, Haube

| Element | Typ | Stellungen | System | Quelle |
|---|---|---|---|---|
| Kabinenhaubenschalter | K3 (F) | OPEN / HOLD / CLOSE | Kabinenhaube (elektrisch, auch mit MAIN PWR OFF am Boden) | S3; Haube bei MAIN PWR OFF: S2, S4 |
| Kabinenhaubengriff (Verriegelung) | H | UP / DOWN | Kabinenhaube | S3 |
| Haube Notabwurf | T-Griff | STOW / PULL | Kabinenhaube | S2, S3 |
| Schleudersitz Sicherungshebel | H | ARMED / LOCKED (SAFE) | Sitz; Caution SEAT NOT ARMED | S2, S3 |
| Schleudergriff | H | STOW / PULL | Sitz | S3 |
| Sitzhöhe | K3 (F) | UP / OFF / DOWN | Sitz (elektrisch) | S3 |
| Pedalverstellung | H | – | Mechanik | S2 |
| Ruderpedale mit Fußbremsen | Pedal (2 Achsen + 2 Bremsen) | – | FLCS (Seitenruder), Bremsen, NWS | S1 (Inhaltsverzeichnis: 17.2 Rudder Pedals, 12 Toe Brake System, 10 NWS); Achsenzahl [Sim-Wissen] |
| Fahrwerkshebel, Alternate-Gear-Griff | siehe 1.2 | | | |

---

# Teil 2: Systeme, Verhalten und Abhängigkeiten

## 2.1 Abhängigkeiten auf einen Blick

```
Triebwerk ──(PTO-Welle)──> Accessory Drive Gearbox (ADG)
   ADG treibt: Hauptgenerator (über CSD), Standby-Generator + FLCS-PMG (gemeinsame Welle),
               Hydraulikpumpe A, Hydraulikpumpe B                          [belegt S1, S4, S8]
   Engine Alternator (am Triebwerk) versorgt: Triebwerksregler, Zündung, RPM-Anzeige [belegt S1 für den DEEC des PW-220;
               dass er beim PW-229 die EEC speist, ist Ableitung; S2 deutet die EEC-Caution als Alternator-Ausfall]
JFS ──(Kupplung)──> ADG  (Anlassen; Energie aus den beiden Brake/JFS-Speichern, Hydraulik B lädt nach) [belegt S1]
EPU (Hydrazin und/oder Zapfluft) ──> EPU-Generator (Notbusse) + EPU-PMG (FLCS) + Pumpe Hydraulik A [belegt S4]
Batterie ──> Batteriebusse 1/2 (Notversorgung FLCS, JFS-Zündung/Steuerung, Warnleuchten)  [belegt S1, S4]
Hydraulik A ──> FLCS, LEF, Speedbrake, Fuel Flow Proportioner                [belegt S1 (FFP), S4]
Hydraulik B ──> FLCS, LEF, Fahrwerk, NWS, Radbremsen, Kanone, AR-Klappe, JFS-Speicher [belegt S1 (AR, JFS), S4]
Kraftstoff ──> Triebwerk (über Reservoirs, FFP), JFS (immer, auch bei FUEL MASTER OFF) [belegt S1]
            kühlt Hydrauliköl A/B, CSD und ADG                                [belegt S1]
Zapfluft ──> ECS: Kabine, Druck, Avionikkühlung, Tankdruck, G-Anzug, Haubendichtung, OBOGS [belegt S1]
```

Für den Sim heißt das: **ein Simulationsschritt in fester Reihenfolge** [Sim-Wissen]: (1) Triebwerk/JFS/EPU-Drehzahlen → (2) Generatoren und Busse → (3) Hydraulikdrücke → (4) Verbraucher (Pumpen, Avionik, FLCS) → (5) Warnlogik. Jeder Verbraucher fragt nur „ist mein Bus/mein Druck da?“.

## 2.2 Elektrik

**Quellen** [belegt S4, S8, Leistungsangaben aus Lernkarten/Forum]: Hauptgenerator 60 kVA (über Constant Speed Drive an der ADG), Standby-Generator 10 kVA (ADG, gemeinsame Welle mit FLCS-PMG), EPU-Generator 5 kVA, Batterie 26 V. Dazu für das FLCS: FLCS-PMG (vier Ausgänge, ab ca. 40 % RPM ausreichend [S4]) und EPU-PMG. Außenbordstrom am Boden.

**Busse** [Struktur belegt S2, S4, S7, Namen aus S1]: Nonessential AC 1/2, Nacelle AC, Essential AC, Emergency AC 1/2, Nonessential DC, Essential DC, Emergency DC 1/2, Battery Bus 1/2, vier FLCS-Zweige A–D. Die DC-Busse werden über zwei AC/DC-Wandler aus den Emergency-AC-Bussen gespeist [S4].

**Gliederung in S1 Kapitel 6** (nur Inhaltsverzeichnis gelesen): Busdiagramm, Main Power AC, Overcurrent Sensing Contactors, STBY AC, Emergency AC, DC-System, FLCS-Stromversorgung, Außenbordstrom, Normalbetrieb, Bedienelemente und Anzeigen. Das bestätigt die vier Versorgungsebenen (Haupt-AC, Standby-AC, Notfall-AC, DC) und die eigenen Überstromschalter, nicht aber die Zuordnung einzelner Geräte.

**Was bei welcher Quelle noch Strom hat** (Lastabwurf):

| Zustand | Busse mit Strom | Quelle |
|---|---|---|
| nur Batterie (MAIN PWR BATT, Triebwerk aus) | Battery Bus 1/2; FLCS-Zweige über Batterie | belegt S2 (MAIN PWR-Beschreibung), S4 |
| Standby-Generator allein (Hauptgenerator aus) | alles außer Nonessential AC 1/2 und Nonessential DC | belegt S4 |
| EPU-Generator allein | nur Emergency AC/DC und Batteriebusse; Essential und Nonessential AC/DC fallen weg | belegt S4 |
| Hauptgenerator | alle | belegt S2 |

**Zuordnung Verbraucher → Bus** (soweit gefunden):

| Verbraucher | Bus | Quelle |
|---|---|---|
| RPM- und FTIT-Anzeige, Warnleuchten HYD/OIL PRESS und ENGINE | Battery Bus 1 | belegt S1 |
| Fuel-Flow-Anzeige | Emergency AC 1 | belegt S1 |
| NOZ-POS- und Öldruckanzeige | Emergency AC 2 | belegt S1 |
| FWD/AFT FUEL LOW | Emergency DC 1 | belegt S1 |
| automatisches Vorwärts-Umpumpen (Trimmventil); Triebwerks-Anti-Ice (öffnet bei Stromausfall) | Emergency DC 2 | belegt S1 |
| ECS-Steuerung | Emergency DC | belegt S4 |
| Triebwerksregler (S1: DEEC des PW-220), Zündung, RPM-Signal | Engine Alternator (eigenständig) | belegt S1 |
| Radar (FCR), MMC, VHF, Radarhöhenmesser, PFLD | fallen bei Hauptgenerator-Ausfall aus → Nonessential | belegt S7 |
| Kraftstoff-Boost- und Transferpumpen | fallen bei Ausfall von Haupt- **und** Standby-Generator aus | belegt S4 |
| Kabinenhaube (am Boden) | auch bei MAIN PWR OFF | belegt S2, S4 |
| ICP/DED, MFDs, HUD, INS, UHF, IFF, TACAN, Licht | Essential bzw. Nonessential | **[Sim-Wissen]**; in #20 keine frei zugängliche Quelle gefunden, S1 Kap. 6.1 (Busdiagramm) bleibt nachzuprüfen |
| Fahrwerks-Grünleuchten (ohne Außenbordstrom) | erst an, wenn der Hauptgenerator auf Drehzahl ist | belegt S8 (Forum) |

**Schalterlogik MAIN PWR** [belegt S2]: OFF am Boden trennt alles (nur Haube und Ladeerhaltung FLCS-Batterien bleiben); BATT legt die Batterie auf die Batteriebusse, trennt Generator/Außenbordstrom und setzt den Hauptgenerator zurück; MAIN PWR verbindet Außenbordstrom oder Hauptgenerator, gibt den Standby-Generator frei und hält die Batterie an den Batteriebussen, solange kein AC da ist. Beim Anlassen übernimmt der Generator automatisch, sobald Spannung und Frequenz stimmen [S8].

**Leuchten am ELEC-Panel (Block 50/52 aktuell)** [belegt S2]:

| Leuchte | leuchtet, wenn |
|---|---|
| FLCS PMG | PMG versorgt keinen (Flug) bzw. nicht alle (Boden) FLCS-Zweige; 60 s Verzögerung nach Bugrad-WOW |
| MAIN GEN | Hauptgenerator/Außenbordstrom nicht an einem oder beiden Nonessential-AC-Bussen |
| STBY GEN | Standby-Generator nicht verfügbar |
| EPU GEN | EPU kommandiert, aber EPU-Generator speist nicht beide Notbusse |
| EPU PMG | EPU kommandiert, EPU-PMG speist nicht alle FLCS-Zweige |
| ACFT BATT TO FLCS | Batterie speist mindestens einen FLCS-Zweig (Flug: bei ≤ 25 V) |
| FLCS RLY | Spannung an einem FLCS-Zweig < 20 V oder Zweig von der Batterie getrennt |
| ACFT BATT FAIL | Batterie ≤ 20 V oder defekt (Boden: auch Ladegerät); 60 s Verzögerung nach WOW |

**ELEC SYS** (Caution) = mindestens eine ELEC-Leuchte an [belegt S6]. **ELEC CAUTION RESET** setzt ELEC SYS und MASTER CAUTION zurück, versucht Haupt- und Standby-Generator wieder aufzuschalten und setzt die Überlastschalter für Nonessential AC und Nacelle AC zurück [belegt S2, S4, S7].

**Sim muss nachbilden:** Busse als Zustandsgraph, Generatoren mit Drehzahlschwelle (Hauptgenerator schaltet sich selbst zu, sobald Spannung und Frequenz stimmen [S8]; Schwelle ca. 55–60 % RPM [Sim-Wissen]; der JFS kuppelt laut S1 bei 50 % aus, ab dann treibt das Triebwerk die ADG), Batterieladung (Batterie-Betrieb am Boden laut S5 höchstens 5 min ohne laufendes Triebwerk), Lastabwurf, Reset-Taste, Fehlerinjektion (Generator fällt aus).

## 2.3 Hydraulik A/B

[belegt S4, teils S1] Zwei unabhängige Systeme, je ca. 3000 psi (normal 2850–3250), Pumpen an der ADG.

- **A:** FLCS, LEF, Speedbrakes, Fuel Flow Proportioner [S1 für FFP].
- **B:** FLCS, LEF, Fahrwerk, Bugradlenkung, Radbremsen, Kanone, Luftbetankungsklappe [S1], Nachladen der Brake/JFS-Speicher (40–60 s, beginnt ab ca. 12 % RPM; beides laut S1 und S4).
- **FLCS-Servos (ISA):** werden aus beiden Systemen gespeist; fällt eines aus, arbeiten die Flugsteuerungen weiter [S4].
- **EPU** treibt eine Pumpe für **System A**, wenn beide Systeme unter 1000 psi fallen [S4].
- **Speicher:** FLCS-Speicher (je System), Brake/JFS-Speicher (JFS-Start und Notbremse), pneumatische Flasche für Alternate Gear und Haken (im Flug nicht nachfüllbar) [S4].
- **Warnung:** HYD/OIL PRESS, wenn A oder B < 1000 psi [S1].
- **S1 Kapitel 7** besteht laut Inhaltsverzeichnis nur aus Druckanzeigen und der HYD/OIL-PRESS-Leuchte; eine Verbraucherliste je System ließ sich dort nicht lesen. Die Liste oben stützt sich darum weiter auf S4 (älteres Muster, für Block 52 nicht geprüft) und die Einzelangaben aus S1 Kapitel 2–4.
- **EPU** (S1 Kapitel 8, nur Gliederung): zusätzlich zu den bekannten Leuchten ein Bodensicherungsschalter (EPU Ground Safety Switch), ein Hydrazin-Leckdetektor und eine „EPU Fired“-Anzeige.

**Sim muss nachbilden:** Druck als Funktion von RPM (Pumpe), Verbrauch durch Bewegungen, Leck/Ausfall je System, Speicherfüllstände (JFS-Startfähigkeit hängt davon ab).

## 2.4 Kraftstoff

[belegt S1, Zahlen S4]

- **Tanks:** sieben interne: Flügel L/R, F-1, F-2, A-1 und zwei Reservoirs (vorn/hinten), dazu drei Außentanks (2 × Flügel, Centerline).
- **Zwei Systeme**, gleichzeitig entleert, damit der Schwerpunkt bleibt: **vorn** = rechter Außentank → rechter Flügel → F-1 → F-2 → vorderes Reservoir; **hinten** = linker Außentank → linker Flügel → A-1 → hinteres Reservoir. Centerline gehört zu beiden.
- **Förderung:** primär Siphon/Druckunterschied (Tankbelüftung über ECS-Luft), sekundär elektrische Pumpen; das Triebwerk zieht nur aus den Reservoirs über den Fuel Flow Proportioner (Hydraulik A), der vorn/hinten ausgleicht.
- **Mengen** [S4, Block-C-Werte]: vorn 3800 lb, hinten 3360 lb (davon je Flügel 550 lb, Reservoirs je 480 lb), Außentanks 2 × 2420 lb, Centerline 1890 lb. Passt zu den 3200 kg intern in `src/sim/systems.ts`.
- **EXT FUEL TRANS:** NORM = erst Centerline, dann Flügel-Außentanks; WING FIRST = umgekehrt [S1, S2].
- **ENG FEED** [S2]: OFF = alle Elektropumpen aus (nur FFP); NORM = alle Pumpen, Schwerpunkt automatisch; AFT/FWD = Pumpen nur des einen Systems und Querspeiseventil offen, um Ungleichgewicht zu beheben.
- **FUEL MASTER:** schließt das Hauptabsperrventil (2–4 s Laufzeit); der JFS bekommt trotzdem Kraftstoff [S1].
- **Automatisches Vorwärts-Umpumpen** [S4], **TANK INERTING** (Halon 20 s, dann dosiert, Tankdruck reduziert) [S1, S2].
- **AIR REFUEL OPEN:** öffnet Klappe (Hydraulik B), schaltet FLCS auf TO/LDG-Gains, Licht ein, Außentanks drucklos (kein Transfer) [S1, S2].
- **Anzeige:** FUEL QTY SEL wählt, was die beiden Zeiger zeigen; TEST: Zeiger 2000 lb, Totalizer 6000 lb, beide FUEL-LOW-Leuchten an [S2, S4].
- **Warnungen:** FWD FUEL LOW < 400 lb, AFT FUEL LOW < 250 lb im jeweiligen Reservoir, unabhängig von der Mengenanzeige [S1]; HUD-Bingo/„TRP FUEL“ [S1, S4]; FUEL/OIL HOT bei zu heißem Kraftstoff (oder Öl) [S1].

**Sim muss nachbilden:** ca. 10 Tanks als Knoten mit Flussregeln, Schwerpunktverschiebung (an die Flugdynamik melden), Pumpen am Bus, Ventile. Mittel komplex, gut testbar.

## 2.5 Triebwerk, JFS, EPU

### Triebwerk (Block 52: P&W F100-PW-229)

**Quellenlage:** S1 beschreibt in Kapitel 2 ausdrücklich das **F100-PW-220/220E** (ca. 25 000 lb Schub, Regelung DEEC mit hydromechanischer Rückfallebene SEC, Schalter ENG CONT) und führt die Caution-Leuchten EEC und BUC als deaktiviert; das PW-229 und das GE129 kommen nur in der Gewichtstabelle (1.4) und in Überschriften der Notverfahren vor [belegt S1]. BMS bildet also für alle Blöcke ein PW-220-artiges Triebwerk nach. Die bisherige Fassung dieses Dokuments hatte diese S1-Angaben dem GE129 (Block 50) zugeordnet; das war falsch. PW-229-eigene Angaben gibt es hier nur aus S2 (Schalter) und S9 (Leerlaufwerte in BMS).

- **Regelung PW-229** [belegt S2]: Normalbetrieb mit **EEC** (Schalter EEC). In **OFF** ist die EEC abgeschaltet, das Triebwerk läuft über die hydromechanische Grundregelung (S2 nennt sie „UFC“, gemeint ist die Unified Fuel Control, nicht das Bedienteil). **BUC** schaltet auf die Backup-Regelung; ob umgeschaltet wird, hängt laut S2 von RPM und Throttle ab (über 52 % RPM nur mit Throttle mindestens auf BUC IDLE, darunter immer). S2 unterscheidet dabei zwei nicht erklärte Varianten „80“ und „LESS 80“.
- **Caution BUC:** Backup-Regelung gewählt und aktiv oder Druck der Hauptkraftstoffpumpe zu niedrig [S2]. **Caution EEC:** laut S2 „Engine Alternator ausgefallen“; die Deutung ist dort nicht weiter erklärt und passt nur teilweise (im S1-Modell meldet ENGINE den Alternatorausfall).
- **Was BUC einschränkt** (kein Nachbrenner, Düse, Schubanteil): in den gelesenen Quellen **nicht belegt**. Vorschlag für planr [Sim-Wissen/Annahme]: BUC wie den SEC-Betrieb in S1 behandeln, also Düse geschlossen, kein Nachbrenner, 80–100 % des MIL-Schubs, im Leerlauf etwa doppelter Schub wegen geschlossener Düse [Verhalten belegt S1 für SEC beim PW-220].
- **STARTING FUEL** [belegt S2]: AUTO LEAN = magerer Startkraftstoff bis 30 s nach Zuschalten des Hauptgenerators, danach 100 pph mehr; in BUC automatisch fett. RICH = immer fett, LEAN = immer mager. Folgen für Heißstart oder Fehlstart: nicht belegt [Sim-Wissen: fett = höhere FTIT beim Start, mager = Gefahr eines Hängestarts].
- **MAX POWER** [belegt S2]: gibt bei Throttle MAX AB ab Mach 1,1 den höchsten Schub frei; OFF ist Normalstellung. Beim Block 50 ohne Funktion.
- **Throttle-Rasten** OFF / IDLE / MIL / MAX AB, Nachbrenner in 5 Segmenten; IDLE für alle Starts, Cutoff Release nötig für IDLE → OFF; Hochlauf IDLE → MAX AB ca. 4 s in Bodennähe, ca. 11 s in großer Höhe; bis zu drei automatische Wiederzündungen des Nachbrenners; ab Mach 1,4 mindestens MIL-Schub [S1, PW-220].
- **Zündung:** dauernd, solange Throttle mindestens IDLE und RPM ≥ 12 % [S1, PW-220].
- **Instrumente** [S1]: RPM 0–100 % und FTIT 200–1200 °C (beide Battery Bus 1), NOZ POS 0–100 % und Öl 0–100 psi (Emergency AC 2), Fuel Flow 0–80 000 pph (Emergency AC 1). Für das PW-229 gleich angenommen [Ableitung, die Anzeigen sitzen im selben Cockpit].
- **Leerlaufwerte nach Start (PW-229, BMS)** [S9]: Fuel Flow 700–1700 pph, Öl ≥ 15 psi, NOZ > 94 %, **RPM 60–76 %**, FTIT < 650 °C, Hydraulik A/B 2850–3250 psi. *Block 50 (GE129, S5):* RPM 65–80 %, sonst gleiche Werte.
- **Nach MIL-Start** [S1, PW-220]: FTIT meist 890–960 °C bei 89–94 % RPM (über 2 °C Außentemperatur), Düse bei MIL höchstens 30 %.
- **Öl** [S1]: Druck ungeregelt, steigt von IDLE nach MIL um ca. 15 psi (in 50 000 ft nur ca. 5 psi). Die Ölübertemperatur-Funktion von FUEL/OIL HOT ist in BMS ohne Funktion [S1].
- **Anti-Ice** ENGINE ON/AUTO/OFF; ON = Heizung und Triebwerks-Anti-Ice für ca. 70 s, wiederholt bei anhaltender Vereisung; AUTO nur bei erkanntem Eis (nicht zuverlässig am Boden und über 7° AOA); OFF schaltet Eisdetektor und Heizung ab; über 30 000 ft und bei hohen Temperaturen sperrt der Regler; bei Ausfall von Emergency DC 2 öffnet das Ventil [S1, S2].
- **Warnungen:** ENGINE bei RPM < 55 %, Stagnation, FTIT > 1000 °C für ca. 2 s, Ausfall Engine Alternator [S1]; HYD/OIL PRESS bei Öl < ca. 10 psi für 30 s (aus über ca. 20 psi) [S1]; ENGINE FAULT bei Verlust gültiger Machdaten u. a. [S2]; ENG FIRE/OVERHEAT [S2].
- *Block 50 (GE129) zum Vergleich:* ENG CONT PRI/SEC statt EEC/BUC, Caution SEC (beim Start bis ca. 20 % RPM an, SEC-Check am Boden) [S2, S5].

### JFS (Jet Fuel Starter)

[belegt S1, S2] Kleine Gasturbine, die über eine Kupplung die ADG und damit das Triebwerk antreibt. START 1 entlädt einen, START 2 beide Brake/JFS-Speicher in den Startermotor (START 2 bei Kälte, nach START-1-Fehlschlag, für Luftstart). JFS RUN leuchtet innerhalb 30 s. Am Boden schaltet der JFS bei ca. 50 % RPM selbst ab, der Schalter springt auf OFF (S5 nennt 55 %). Speicher lädt Hydraulik B in 40–60 s nach, sonst Handpumpe. Strom für die Steuerung aus der Batterie [S4]. [S4, älteres Muster:] nach Abschalten 17 s Auslauf, Luftstart-Grenze 3 min Laufzeit.

### EPU (Emergency Power Unit)

[belegt S4, S6, S2]

- **Start automatisch**, wenn beide Hydraulikdrücke < 1000 psi, Haupt- und Standby-Generator ausgefallen sind, das Triebwerk ausfällt oder die PTO-Welle bricht [S4]. Mit Schalter ON auch manuell.
- **Bodensperre:** mit Weight-on-Wheels läuft die EPU nur bei entferntem Sicherungsstift **und** Throttle mindestens IDLE; darum springt sie bei normalem Abstellen (Throttle zuerst auf OFF) nicht an [S6].
- **Antrieb:** Zapfluft; reicht sie nicht (unter ca. 75–80 % RPM), wird Hydrazin zugeführt [S4, S6]. Nur Hydrazin: < 10 min, ca. 15 %/min [S4]; S2 nennt ca. 10 min.
- **Leistung:** EPU-Generator → Emergency AC/DC und Batteriebusse; EPU-PMG → FLCS; Pumpe → Hydraulik A [S4].
- **Leuchten:** EPU RUN (Drehzahl im Bereich und Pumpendruck > 2000 psi; Blinken = Tertiärregelung), HYDRAZN (Hydrazin wird kommandiert), AIR (EPU kommandiert, Stift gezogen) [S4, S2].
- **Bodentest** [S5]: EPU OFF → NORM, Throttle 80 %, EPU/GEN TEST halten: AIR an, EPU GEN/PMG aus, FLCS PWR an, RUN innerhalb 5 s; Anzeige EPU FUEL 95–102 %.

**Sim muss nachbilden:** drei Drehzahlmodelle (Triebwerk N2, JFS, EPU), Speicherfüllung, Zündung abhängig von RPM und Kraftstoff, FTIT-Kurve beim Start (Heißstart möglich, abhängig von STARTING FUEL), EEC/BUC-Umschaltung, MAX-POWER-Freigabe, Hydrazinvorrat. Hoch komplex, aber zentral für einen glaubwürdigen Kaltstart.

## 2.6 FLCS (Fly-by-Wire)

[belegt S2, S4; S4-Leuchtennamen gelten für ältere Blöcke]

- Vierkanalig, digital (Block 50/52: DFLCC mit Digital Backup). Steuerflächen über vier ISAs mit Hydraulik A und B.
- **Gain-Sätze** [S4]: Ground (WOW), TO/LDG (Fahrwerk unten, ALT FLAPS EXTEND oder AIR REFUEL OPEN), Cruise, Standby (bei doppeltem Luftdatenfehler).
- **LEF** automatisch nach Mach, Höhe, AOA; am Boden bei IDLE fest 2° nach oben; LOCK hält Stellung und löst FLCS-Warnung aus [S2, S4]. **TEF** folgen dem Fahrwerkshebel oder ALT FLAPS [S2]; mit Fahrwerk unten 20° bis 240 kt [S4].
- **CAT I / CAT III** setzt die Grenzen für G und Rollrate passend zur Außenlast [S4]; falsche Stellung → STORES CONFIG [S2].
- **AOA/G-Limiter**, MANUAL PITCH OVRD hebt ihn zur Erholung aus Tiefsackzuständen auf [S2, S4].
- **BIT** nur mit WOW und < 28 kt; dauert ca. 45 s, RUN leuchtet, bei Erfolg fällt der Schalter auf OFF [S2, S5].
- **FLCS RESET** setzt Servo-/Elektronikfehler, FLCS-Warnung, CADC, FLCS FAULT, MASTER CAUTION zurück [S2].
- **DIGITAL BACKUP** schaltet auf die Backup-Software, Leuchte DBU ON [S2, S5].
- **Trimmung:** Hut am Stick und Räder am MANUAL TRIM; TRIM/AP DISC trennt Stick-Trimmung und Autopilot [S2, S5].
- **Stromversorgung:** sieben Quellen (FLCS-PMG, Hauptgenerator über Emergency DC, Standby-Generator, EPU-Generator, EPU-PMG, Flugzeugbatterie, FLCS-Batterien) [S4, Block 50/52 aktuell ohne eigene FLCS-Batterieleuchten laut S2].
- **Gliederung in S1 Kapitel 15–17** (nur Inhaltsverzeichnis): Limiter für AOA/G, Rollrate, Seitenruderausschlag und Gierrate; Gain-Sätze Cruise, Takeoff/Landing, Standby; FLCS-Datenschreiber, Schiebewinkel-Rückführung (AOS feedback), Kanonenkompensation; ein Low-Speed-Warnton; als Leuchten FLCS (Warning), DBU ON (Warning), FLCS FAULT (Caution) und die PFL-Meldung „FLCS LEF LOCK“. Das bestätigt die Leuchtenliste in 2.13; BIT-Ablauf und Ausfallverhalten je Kanal ließen sich dort nicht lesen und bleiben bei S2/S4/S5.

**Sim muss nachbilden:** planr hat heute eine direkte Steuerung; ein Regler mit G/AOA-Begrenzung, Gain-Umschaltung und Trimmung gehört eigentlich in die Flugdynamik (siehe [f16-flugmodell.md](f16-flugmodell.md)). Für die Schalter reicht: Gain-Satz-Auswahl, Limiter-Parameter je CAT, LEF/TEF-Logik, BIT-Zustandsautomat, Fehlerzustände je Kanal.

## 2.7 Avionik und Navigation

- **Einschalten** über AVIONICS POWER (MMC, ST STA, MFD, UFC, GPS, DL, MAP, MIDS) und SNSR PWR (FCR, RDR ALT, HDPT) [S2, S3]. Ohne Nonessential-Bus fallen FCR, MMC, Radarhöhenmesser, PFLD aus [S7].
- **INS** [S2]: OFF / STOR HDG (Ausrichtung mit gespeichertem Kurs) / NORM (volle Ausrichtung) / NAV / CAL / INFLT ALIGN / ATT. Dauer: NORM ca. 8 min, STOR HDG ca. 90 s [Sim-Wissen]; mit GPS ist die Position laut S5 nach ca. 90 s brauchbar (AUX-Flag am ADI aus). Das BMS-Avionikhandbuch kennt für das EGI nur „Normal Gyrocompass Alignment“ und „In-Flight Alignment“ als eigene Abschnitte [S10, Inhaltsverzeichnis]; S9 wartet am Boden auf „ALIGN OK“/RDY und schaltet dann auf NAV.
- **ICP/DED:** ca. 15 Hauptseiten (CNI, COM1/2, IFF, LIST mit Unterseiten, T-ILS, ALOW, STPT, CRUS, TIME, MARK, FIX, A-CAL, M-SEL), Eingabe über Ziffern, DCS und ENTR/RCL [S2]. DTC-Laden über MFD-Seite [S2].
- **MFD-Formate** [belegt S10, Inhaltsverzeichnis]: Menu, OFF, SWAP, BLANK, RCCE, RESET, DTE, TEST, FLCS, TCN, HSD, FCR, SMS, HAD, FLIR, TFR, TGP, dazu IDM und Link 16. Je MFD drei vorwählbare Seiten [Sim-Wissen]. MFDs brauchen nach dem Einschalten ca. 24 s zum Aufwärmen [S9].
- **HUD-Panel** steuert, was im HUD steht (Skalen, FPM/Leiter, DED/PFL, CAS/TAS/GS, Radar-/Baro-Höhe mit AUTO unter 1500 ft) [S2].
- **Navigation:** TACAN (AUX COMM, Lautstärke = Ein/Aus am Audio-2-Panel), ILS (ILS-Poti = Ein/Aus), INSTR MODE wählt Quelle fürs EHSI [S2].
- **Autopilot** [S2]: PITCH ALT HOLD / OFF / ATT HOLD, ROLL HDG SEL / ATT HOLD / STRG SEL; Paddle unterbricht. Dazu Stick Steering als eigener Abschnitt in S1 (17.13.2, nur Inhaltsverzeichnis). Abfall bei Grenzen [Sim-Wissen].
- **CADC:** liefert Luftdaten an FLCS, Triebwerk und Instrumente; Fehler → CADC-Caution [S2, S4].

**Sim muss nachbilden:** Stromabhängigkeit je Gerät, Aufwärmzeiten, INS-Ausrichtung als Zustandsautomat, DED-Seitenlogik, MFD-Formate. **Größter Einzelposten** des ganzen Cockpits.

## 2.8 Funk und IFF

- **UHF** (COMM 1) und **VHF** (COMM 2); Ein/Aus und Lautstärke über die Potis am Audio-1-Panel, Squelch/Guard über die Modusknöpfe; Bedienung normal über ICP/DED, das UHF-Backup-Panel nur bei CNI = BACKUP [S2]. Senden über Transmit-Hut am Throttle [S2].
- **IFF:** MASTER OFF/STBY/LOW/NORM/EMER, Mode 4 (Code, Reply, Monitor), Modi 1/3 über Ziffernwähler oder DED, IDENT am Eyebrow (15–30 s) [S2, S3]; Caution IFF bei Mode-4-Problem [S2; S10 hat dafür einen eigenen Abschnitt 2.1.1.29, Inhalt nicht lesbar; genaue Bedingung Sim-Wissen].
- **KY-58** Verschlüsselung (Modus, Schlüsselregister, Power), PLAIN/CIPHER [S2].
- **Antennenwahl** UHF/IFF UPPER/NORM/LOWER [S2].
- **Sim muss nachbilden:** Frequenzspeicher, Stromabhängigkeit, Audio-Mischung (Lautstärken für MSL-Ton, Threat, TACAN-Kennung, ILS-Kennung). Für planr ohne Mehrspieler: geringe Tiefe, viele Elemente.

## 2.9 Licht

- **Außen** [S2, S3]: Anti-Collision (Blinkmuster 1–4, A–C), Positionslichter (Flash/Steady), Wing/Tail und Fuselage je BRT/OFF/DIM, Formationslichter (Poti), MASTER (OFF/ALL/A-C/FORM/NORM), Luftbetankungslicht, Lande-/Rolllicht am Gear-Panel. AIR REFUEL OPEN schaltet AR-Floodlight und Seitenleitwerkslicht ein [S2].
- **Innen** [S2]: Primärbeleuchtung Konsolen/Instrumente/DED, Flutlicht Konsolen/Instrumente, MAL & IND LTS BRT/DIM, Spot-Lampe, Indexer- und AR-Helligkeit [S3].
- **Gliederung in S1 Kapitel 20** (nur Inhaltsverzeichnis): außen Anti-Collision-Strobe, Positions-/Formationslichter, Luftbetankungslichter, Seitenleitwerks-Flutlicht, Lande- und Rolllicht; innen PRIMARY INST PNL, DATA ENTRY DISPLAY, FLOOD INST PNL und Cockpit-Spotlights. Deckt sich mit S2/S3; Helligkeitsstufen und Stromversorgung der Lichter sind dort nicht lesbar.
- **Sim muss nachbilden:** Lichtquellen in der Szene (planr hat Nav/Beacon/Strobe/Landing bereits), Panelhintergrundbeleuchtung als Emissionsfaktor, Stromabhängigkeit. Gering komplex, sichtbar wirkungsvoll in VR.

## 2.10 Umwelt (ECS) und Sauerstoff

- **ECS** [S1, S2, S4]: Zapfluft → Wärmetauscher → Kühlturbine → Kabine und Avionikbucht; versorgt auch Tankdruck, G-Anzug, Haubendichtung, OBOGS. AIR SOURCE OFF = alles aus (auch G-Anzug, Tankdruck), NORM, DUMP (Kabinendruck ablassen), RAM (Stauluft nur für Avionik und Belüftung).
- **Kabinendruck** [S4]: bis 8000 ft ungeregelt, 8000 ft Kabinenhöhe bis 23 000 ft, darüber 5 psi Differenz; CABIN PRESS über 27 000 ft Kabinenhöhe.
- **EQUIP HOT** bei zu wenig Kühlluft, Radar wird abgeschaltet [S2, S4].
- **TEMP** AUTO/MAN, DEFOG-Hebel [S2]; Sondenheizung PROBE HEAT (Caution PROBE HEAT) [S2, S5].
- **Sauerstoff** (Block 50/52 mit OBOGS; S1 Kapitel 22 hat keine Unterabschnitte und war nicht lesbar) [S2, S3, S5]: SUPPLY PBG/ON/OFF, DILUTER NORM/100 %, EMERGENCY/NORMAL/TEST MASK, OBOGS BIT (OXY LOW ca. 10 s an, frühestens 2 min nach Start), FLOW-Blinker; OXY LOW bei zu niedrigem Druck bzw. Vorrat [S4].
- **Sim muss nachbilden:** Kabinenhöhe aus Flughöhe und ECS-Zustand, Hypoxie-Effekt (optional, z. B. Sicht trüben), Warnungen. Mittel/gering komplex.

## 2.11 Fahrwerk und Bremsen

[belegt S4 außer markiert]

- **Fahrwerk** hydraulisch (System B); Hauptfahrwerk fährt per Schwerkraft und Luftkraft aus, Bugfahrwerk hydraulisch mit 90°-Drehung; Weight-on-Wheels-Schalter an allen Beinen. Hebelsperre am Boden (Linkes-Hauptfahrwerk-WOW), DN LOCK REL hebt sie auf [S2].
- **Alternate Gear:** pneumatische Flasche, Hebel vorher auf DN, danach keine NWS [S2, S4].
- **Leuchten/Horn:** drei grüne Leuchten; rote Leuchte im Hebel bei Abweichung Hebel/Fahrwerk oder bei < 190 kt, < 10 000 ft, Sinken > 250 ft/min ohne ausgefahrenes Fahrwerk; Horn unter denselben Bedingungen (HORN SILENCER); TO/LDG CONFIG zusätzlich bei nicht voll ausgefahrenen TEF.
- **NWS:** elektrisch gesteuert, Hydraulik B, max. 32°, über Stick-Taste ein/aus, Anzeige AR/NWS; NWS FAIL Caution.
- **Bremsen:** Hydraulik B (Notbremse aus Brake/JFS-Speicher), Kanal 1 (nur mit Fahrwerk unten) / Kanal 2; Anti-Skid ab 12 kt beim Beschleunigen, bis 5 kt beim Abbremsen; ANTI SKID-Caution; Parkbremse nur bei IDLE und WOW, löst automatisch beim Gas geben.
- **Haken** pneumatisch, Caution HOOK, wenn nicht oben verriegelt.
- **Gliederung in S1 Kapitel 9–14** (nur Inhaltsverzeichnis): Fahrwerk mit Down-Permission-Taste, DN LOCK REL, ALT GEAR, Horn und HORN SILENCER, TO/LDG CONFIG, Grünleuchten, WOW-Schaltern; NWS mit Stick-Taste, NWS-Leuchte, NWS FAIL; Radbremsen mit **Spin-Down-Bremsung** (Deutung: Räder nach dem Abheben/Einfahren abbremsen), Kanalschalter, Parkbremse, Anti-Skid mit Schalter und Caution; Speedbrake mit SPD-BRK-Schalter und Stellungsanzeige; Fanghaken (Arrestment). Bestätigt die Elemente oben; Zahlen (NWS-Winkel, Anti-Skid-Geschwindigkeiten) bleiben bei S4.
- **Sim muss nachbilden:** planr hat Fahrwerk und Parkbremse schon (`gearCanMove`, `parkBrake`); dazu kommen Hydraulikabhängigkeit, WOW-Logik, Hebelsperre, Warnbedingungen, NWS-Zustand, Bremskanäle. Mittel komplex.

## 2.12 Waffen/Stores und Gegenmaßnahmen

- **Stores** [S2, S3]: MASTER ARM (ARM/OFF/SIM), LASER ARM, ALT REL, EMER JETT (Notabwurf, am Boden nur mit GND JETT ENABLE), SMS-Seite auf dem MFD, STORES CONFIG CAT I/III mit Prüfung gegen die Beladung; Kanone über Trigger 2. Stufe (Hydraulik B).
- **RWR/TWS** [S2]: Anzeige plus Threat-Warning-Panels (HANDOFF, LAUNCH, PRIORITY, UNKNOWN, TGT SEP, SEARCH, LOW ALT, POWER).
- **CMDS** [S2, S3]: Quellen RWR/JMR/MWS, Kategorien O1/O2/CH/FL, Programme 1–4 (+5/6 per Taster), Modi OFF/STBY/MAN/SEMI/AUTO/BYP; Auslösung über CMS-Hut; Zähler.
- **ECM-Pod** [S2]: Funktionen laut S2 klassifiziert; nur Ein/Standby/Test belastbar.
- **Sim muss nachbilden:** Für planr (zivil ausgerichtet, ohne Gegner) als **Attrappen mit Zustand**: Schalter rasten, SMS zeigt Beladung, CMDS zählt Chaff/Flare herunter, Lampen reagieren. Volle Waffensimulation wäre ein eigenes Projekt.

## 2.13 Warnsystem: Caution und Warning

**Prinzip** [belegt S6, S2]: Jede Caution-Leuchte schaltet MASTER CAUTION (Ausnahme laut S6: IFF). MASTER CAUTION-Taste quittiert, die Einzelleuchte bleibt, bis die Ursache weg ist. Warnungen (rote Eyebrow-Leuchten) kommen mit Sprachansage („Warning, Warning“), Cautions mit „Caution“ [belegt S7]; das VMS lässt sich mit VOICE MESSAGE INHIBIT stummschalten [S2]. Fehlertexte erscheinen im PFLD und über F-ACK [S2].

**Caution Panel Block 52** (Reihenfolge laut S2, dort eine gemeinsame Tafel für Block 40/42 und 50/52 mit den Feldern SEC, EEC und BUC; Auslöser zusammengeführt). Beim Block 52 arbeiten EEC und BUC, das SEC-Feld bleibt dunkel [Ableitung aus dem Triebwerk; nicht ausdrücklich belegt]. In BMS (S1) ist es umgekehrt: EEC und BUC deaktiviert, SEC aktiv.

| Feld | löst aus, wenn | Quelle |
|---|---|---|
| FLCS FAULT | Fehler im FLCS (Kanal, Sensor) | S2 |
| ENGINE FAULT | Triebwerksfehler, u. a. keine gültigen Machdaten ans Triebwerk | S1, S2 |
| AVIONICS FAULT | Avionikfehler (Eintrag in der MFL) | S2 |
| SEAT NOT ARMED | Sitz-Sicherungshebel nicht ARMED | S2 |
| ELEC SYS | eine ELEC-Panel-Leuchte an | S6 |
| SEC | beim Block 52 ohne Funktion. *Block 50:* Triebwerk in SEC (manuell oder automatisch) oder Druck der Hauptkraftstoffpumpe zu niedrig | S1 (für das PW-220), S2 deutet die Abkürzung falsch |
| EQUIP HOT | zu wenig/zu warme Avionikkühlluft | S2, S4 |
| NWS FAIL | Bugradlenkung defekt | S2, S4 |
| PROBE HEAT | Sondenheizung aus/defekt im Flug; blinkt im Test | S2, S5 |
| FUEL/OIL HOT | Kraftstoff- oder Öltemperatur zu hoch | S1 |
| RADAR ALT | Radarhöhenmesser defekt | S2 |
| ANTI SKID | Anti-Skid-Fehler oder Schalter OFF mit Fahrwerk unten | S4 |
| CADC | Luftdatenrechner defekt | S2, S4 |
| INLET ICING | Vereisung erkannt | S1, S2 |
| IFF | Mode-4-Problem | S2 |
| HOOK | Haken nicht oben verriegelt | S2, S4 |
| STORES CONFIG | CAT-Schalter passt nicht zur Beladung | S2 |
| OVERHEAT | Überhitzung im Triebwerksraum; auch im FIRE&OHEAT-Test | S2, S5 |
| NUCLEAR | Fehler im Nuklear-Steuerkreis | S2 |
| OBOGS | Sauerstofferzeuger defekt (S2 führt an dieser Stelle OXY LOW) | S3, S2 |
| ATF NOT ENGAGED | AUTO TF gewählt, aber nicht aktiv | S2, S3 |
| EEC | laut S2 Ausfall des Engine Alternators; plausibler wäre ein EEC-Fehler oder EEC aus [Sim-Wissen]. In BMS deaktiviert | S2; S1 (deaktiviert) |
| CABIN PRESS | Kabinenhöhe > 27 000 ft | S4 |
| FWD FUEL LOW | vorderes Reservoir < 400 lb | S1 |
| BUC | Backup-Regelung gewählt und aktiv oder Druck der Hauptkraftstoffpumpe zu niedrig. In BMS deaktiviert | S2; S1 (deaktiviert) |
| AFT FUEL LOW | hinteres Reservoir < 250 lb | S1 |
| 6–8 Felder | frei | S2, S3 |

**Warnleuchten (Eyebrows)**:

| Leuchte | löst aus, wenn | Quelle |
|---|---|---|
| ENG FIRE | Feuer im Triebwerksraum (bzw. Test) | S2, S5 |
| ENGINE | RPM < 55 %, Stagnation, FTIT > 1000 °C ca. 2 s, Alternator-Ausfall | S1 |
| HYD/OIL PRESS | Hydraulik A oder B < 1000 psi, oder Öl < ca. 10 psi für 30 s | S1 |
| FLCS | schwerer FLCS-Fehler, auch LE FLAPS LOCK | S2 |
| DBU ON | Digital Backup aktiv | S5 |
| TO/LDG CONFIG | < 190 kt, < 10 000 ft, Sinken > 250 ft/min und Fahrwerk nicht unten oder TEF nicht ausgefahren | S4 |
| CANOPY | Haube nicht verriegelt | S2 |
| OXY LOW | Sauerstoff zu wenig/Druck zu niedrig; auch OBOGS-BIT | S4, S5 |
| TF FAIL | Terrain-Following-Fehler (auch bei RF SILENT) | S2 |
| MASTER CAUTION | irgendeine Caution | S6 |

**Sim muss nachbilden:** eine Regelliste „Bedingung → Leuchte, Verzögerung, Ansage, PFL-Text“, Lampentest (MAL & IND LTS) und Helligkeit. Mittel komplex, aber **es berührt jedes andere System** und sollte darum früh als Rahmen stehen.

## 2.14 Kabinenhaube und Sitz

Haube elektrisch (Schalter OPEN/HOLD/CLOSE), Verriegelungsgriff, CANOPY-Warnung; funktioniert am Boden auch bei MAIN PWR OFF [S2, S4]. Sitz elektrisch höhenverstellbar, Sicherungshebel → SEAT NOT ARMED [S2, S3]. Gering komplex.

## 2.15 Kaltstart Schritt für Schritt (Block 52, F100-PW-229)

Grundlage: BMS-Checkliste [S5, geschrieben für GE129] und die Block-52-Checkliste [S9]; ergänzt aus S1/S2. Wo S5 Block-50-Eigenheiten enthält (ENG CONT, SEC-Leuchte, SEC-Check), sind sie ersetzt oder als Unterschied vermerkt. Zeitangaben und Leuchtenstände so, wie ein Sim sie prüfen sollte.

| # | Schritt | Erwartung | Quelle |
|---|---|---|---|
| 1 | Prüfen: FUEL MASTER MASTER (Guard zu), ENG FEED NORM, EPU NORM, **EEC/BUC auf EEC (Guard zu)**, **MAX POWER OFF**, **STARTING FUEL** (Grundstellung vermutlich AUTO LEAN), Throttle OFF, Fahrwerkshebel DN, HOOK UP, MASTER ARM OFF, AIR SOURCE NORM | – | S5; Triebwerkspanel S2 (EEC und MAX POWER OFF als Normalstellung); STARTING FUEL AUTO LEAN [Sim-Wissen]. *Block 50:* ENG CONT PRI |
| 2 | MAIN PWR → BATT | FLCS RLY an | S5 |
| 3 | FLCS PWR TEST → TEST halten | ACFT BATT TO FLCS, FLCS PMG, FLCS PWR A–D an; FLCS RLY aus; loslassen | S5 |
| 4 | MAIN PWR → MAIN PWR | ELEC SYS, HYD/OIL PRESS, FLCS RLY, ENGINE an; EPU GEN/PMG aus. Höchstens 5 min ohne Triebwerk. Ob EEC/BUC am Boden vor dem Start leuchten: nicht belegt. *Block 50:* zusätzlich SEC an | S5 |
| 5 | Haube schließen, Funk einstellen | CANOPY aus | S5, S9 |
| 6 | JFS → START 2 | JFS RUN innerhalb 30 s | S1, S5, S9 |
| 7 | Throttle → IDLE (S5: bei ≥ 20 % RPM) | Zündung ab 12 % RPM bei Throttle IDLE möglich; Zündung innerhalb 10 s: RPM steigt, dann FTIT | S1 (IDLE für Starts, Zündschwelle), S5, S9 |
| 8 | Hochlauf beobachten | HYD/OIL PRESS aus zwischen 15 und 70 %; JFS kuppelt bei ca. 50 % aus, Schalter springt auf OFF (S5: 50–55 %); ENGINE aus bei ca. 60 %; S9 wartet bis ca. 70 %. Ohne Außenbordstrom zeigen bis zum Generator nur RPM und FTIT, die Fahrwerks-Grünleuchten kommen mit dem Hauptgenerator. STARTING FUEL AUTO LEAN: Startkraftstoff wird 30 s nach Zuschalten des Generators um 100 pph angehoben. *Block 50:* SEC aus bei ca. 20 % | S1, S5, S8, S9, S2 |
| 9 | Leerlauf prüfen | FF 700–1700 pph, Öl ≥ 15 psi, NOZ > 94 %, **RPM 60–76 %**, FTIT < 650 °C, HYD A/B 2850–3250 psi; Throttle darf ohne Release nicht nach OFF. *Block 50:* RPM 65–80 % | S9 (PW-229), S5 |
| 10 | TEST-Panel: PROBE HEAT (TEST blinkt), FIRE & OHEAT (ENG FIRE, OVERHEAT, MASTER CAUTION), MAL & IND LTS (alle Lampen, VMS-Ansagen) | wie angegeben | S5 |
| 11 | AVIONICS POWER: MMC, ST STA, MFD, UFC, MAP/DL, GPS ein; INS → NORM (ALIGN) | DED/MFDs starten, MFDs nach ca. 24 s | S5, S9 |
| 12 | SNSR PWR: FCR ein, RDR ALT STBY, HDPT nach Bedarf; HUD ein (SYM-Knopf); CNI UFC; DTC laden; MFL zurücksetzen | – | S5 |
| 13 | *entfällt beim Block 52.* Ein BUC-Bodencheck ist in den gelesenen Quellen nicht beschrieben (S9 kennt keinen). *Block 50:* SEC-Check: ENG CONT SEC → SEC an, Düse < 5 %; Throttle kurz MIL/IDLE; zurück PRI → SEC aus, Düse > 94 % | – | S5, S9 |
| 14 | FLCS BIT → BIT | RUN an, ca. 45 s; Erfolg: RUN aus, Schalter fällt auf OFF, keine FAIL/FLCS-Leuchte | S2, S5 |
| 15 | Steuerflächen durchbewegen; Speedbrake zyklisch; drei grüne Leuchten | – | S5 |
| 16 | FUEL QTY SEL TEST | FUEL LOW beide an, Zeiger 2000, Totalizer 6000; zurück NORM; EPU FUEL 95–102 % | S2, S5 |
| 17 | RWR/CMDS/ECM ein, Audio einstellen, DED-Seiten prüfen | – | S5 |
| 18 | DBU-Check: DIGITAL BACKUP → DBU ON an; zurück OFF | – | S5 |
| 19 | Trimmung: TRIM/AP DISC → DISC (Stick-Trimmung ohne Wirkung), NORM (wirkt), Yaw-Trim prüfen und zentrieren | – | S5 |
| 20 | AIR REFUEL OPEN → RDY an; A/R DISC → DISC an, nach ca. 3 s wieder RDY; CLOSE | – | S5 |
| 21 | EPU-Check: Sauerstoff 100 %, Fußbremse, EPU OFF → NORM, Throttle 80 %, EPU/GEN TEST halten | AIR an, EPU GEN/PMG aus, FLCS PWR an, EPU RUN innerhalb 5 s | S5 |
| 22 | OBOGS BIT (≥ 2 min nach Start) | OXY LOW ca. 10 s an, Druck 25–40 psi; Regler einstellen | S5 |
| 23 | Vor dem Rollen: Landelicht, DRIFT C/O NORM, INS-Ausrichtung abwarten (ALIGN im HUD blinkt), INS → NAV, Außenlicht, QNH, Radarhöhenmesser ein | AUX-Flag am ADI aus | S5 |

Für planr reicht als „vereinfachter Kaltstart“ (Spielmodus) die Kette 2 → 4 → 6 → 7 → 8 → 11 → 14 → 23. Die übrigen Schritte sind Prüfungen, die der Sim akzeptieren, aber nicht erzwingen muss [Sim-Wissen].

---

# Teil 3: Umfang

## 3.1 Anzahl der Bedienelemente

Gezählt aus Teil 1 (Elemente, die der Pilot bewegt; Leuchten separat). Schätzungen, da Block-Fassungen variieren.

| Bereich | Bedienelemente | Leuchten/Anzeigen |
|---|---|---|
| Linke Konsole | ca. 95 (davon UHF-Backup 14, ECM 12, AUX COMM 14, Audio 12) | ca. 20 (ELEC 8, EPU 3, FLCS 6, JFS 1, ECM-Felder ca. 32 einzeln) |
| Linke Aux | ca. 30 | ca. 12 |
| Frontpanel: Eyebrows + ICP | ca. 36 | ca. 18 + DED |
| Frontpanel: MFDs | 48 | 2 Anzeigen |
| Frontpanel: übrige (MISC, Instrumente, Fuel, TWP, Instr Mode) | ca. 30 | ca. 15 Instrumente/Leuchten |
| Rechte Aux | ca. 2 | 32 Caution-Felder + PFLD + 7 Instrumente |
| Rechte Konsole | ca. 55 | ca. 3 |
| Stick | 9 (ca. 25 Einzelfunktionen) | – |
| Throttle | 9 (ca. 20 Einzelfunktionen) | – |
| Griffe, Sitz, Haube, Pedale | ca. 10 | – |
| **Summe** | **ca. 320** | **ca. 150** |

Zum Abgleich: DCS-BIOS (S3) definiert für den DCS-Block-50 ca. 280 klickbare Elemente ohne HOTAS; die Zahl passt.

Nach Typ (grob): ca. 130 Taster (inkl. 40 OSBs, 20 ICP), ca. 85 Kippschalter (davon ca. 45 dreistufig, ca. 12 mit Guard oder Hebelsperre), ca. 40 Potis, ca. 30 Drehschalter mit Rasten, ca. 15 Hebel/Griffe, ca. 10 Hüte/4-Wege-Schalter, ca. 10 Wippen.

## 3.2 Komplexität je System

S = einfacher Zustand je Schalter; M = Zustandsautomat mit Abhängigkeiten; L = kontinuierliches Modell (Drücke, Mengen, Drehzahlen); XL = eigenes Teilprojekt.

| System | Elemente | Komplexität | Was den Aufwand treibt | Vorschlag für planr |
|---|---|---|---|---|
| Elektrik mit Bussen | ca. 12 | **L** | Busgraph, Lastabwurf, Generatorschwellen, FLCS-Zweige | früh, als Grundlage für alles |
| Hydraulik A/B | ca. 3 (+ Anzeigen) | M | Druck aus RPM, Speicher, Verbraucherzuordnung | früh |
| Kraftstoff | ca. 10 | L | 10 Tanks, Transferreihenfolge, Schwerpunkt | früh, gut testbar |
| Triebwerk + JFS + EPU | ca. 15 | **L/XL** | Startdynamik, FTIT, EEC/BUC, STARTING FUEL, Hydrazin, Bodensperren | Kern des Kaltstarts |
| FLCS | ca. 15 | L (Regler) / M (Schalter) | Gains, Limiter, BIT, Fehlerkanäle | Schalterlogik jetzt, Regler mit dem Flugmodell |
| Avionik/Navigation | ca. 120 (inkl. MFD, ICP) | **XL** | MFD-Formate, DED-Seiten, INS, HUD-Varianten, Radar | in Stufen: Strom/Bootzeit → HUD/EHSI → DED Grundseiten → MFD Grundformate |
| Funk/IFF/KY-58 | ca. 45 | M | viele Elemente, wenig Wirkung ohne Gegenstelle | Stellungslogik, Audiopegel |
| Licht | ca. 20 | S/M | Szenenlichter, Panelbeleuchtung | früh, wirkt in VR |
| Umwelt/Sauerstoff | ca. 15 | M | Kabinendruck, Warnungen | mittel |
| Fahrwerk/Bremsen | ca. 12 | M | WOW, Hydraulik, Warnbedingungen | auf Bestehendem aufbauen |
| Waffen/Stores | ca. 10 | M (Attrappe) / XL (echt) | Ballistik, SMS | Attrappe |
| Gegenmaßnahmen/RWR/ECM | ca. 35 | M (Attrappe) | Programme, Zähler | Attrappe |
| Warnsystem | ca. 5 (+ ca. 45 Leuchten) | M | Regelliste über alle Systeme, VMS | früh als Rahmen |
| Haube/Sitz/Mechanik | ca. 10 | S | – | früh |

## 3.3 Bezug zu planr heute

`src/sim/systems.ts` kennt heute für alle Flugzeuge dieselben 17 Schalter (Batterie, Kraftstoffpumpe, Zündung, Anlasser, vier Lichter, Panellicht, Parkbremse, Autopilot mit Kurs/Höhe) und ein Kraftstoffmodell mit einem Tank. Ein F-16-Cockpit nach diesem Inventar braucht darum ein **eigenes, flugzeugspezifisches Systemmodul** statt einer Erweiterung der gemeinsamen `SwitchId`-Liste [Sim-Wissen/Ableitung]:

- Schalter als Daten (Id, Typ, Stellungen, Guard, Feder) statt als feste Union, damit 320 Elemente beherrschbar bleiben und das 3D-Cockpit sie generisch anfassen kann.
- Systeme als einzelne, testbare Module mit klaren Eingängen (Schalterstellungen, RPM, Luftdaten) und Ausgängen (Busspannung, Drücke, Leuchten), in fester Reihenfolge nach 2.1.
- Die vorhandenen Grundbausteine (Kraftstoffverbrauch, Anlassen über `engine.crank`, Parkbremse, Autopilot) lassen sich als Startpunkt übernehmen.

## Offene Punkte

- **S1 Kapitel 6 ff. lesen** (Elektrik mit Busdiagramm 6.1, Hydraulik, Fahrwerk, FLCS mit BIT 17.12, Licht, Sauerstoff, Normal Procedures Kapitel 32 mit dem offiziellen BMS-Kaltstart, Notverfahren 38.4.6/38.5.10 zum PW-229). Stand #20: Download per `curl` aus dem Container vom Proxy per Richtlinie abgewiesen (403 auf `cdn.falcon-bms.com`, laut Proxy-Status „connect_rejected“); das Abrufwerkzeug endet weiter bei ca. 115 000 Zeichen (Seite 62). Ebenfalls per curl gesperrt: web.archive.org, archive.org, falcon-bms.com, digitalcombatsimulator.com, chucksguides.com. **Lösung:** PDF auf einem Rechner ohne diese Sperre laden und mit `pdftotext -layout` auswerten (im Container ist `pdftotext` installiert), oder den Host für die Sitzung freigeben lassen. Das ersetzt die meisten S4-Angaben und die [Sim-Wissen]-Stellen bei der Buszuordnung.
- **PW-229-Verhalten:** BMS (S1) modelliert das Triebwerk als PW-220 mit DEEC/SEC; für BUC-Einschränkungen, STARTING-FUEL-Folgen und Startgrenzwerte (FTIT-Grenze beim Start, Startzeit) des PW-229 fehlt eine frei zugängliche, unbeschränkte Quelle. Das Projekt muss entscheiden, ob es BUC nach dem Muster SEC (S1) nachbildet (Vorschlag in 2.5).
- BMS-Training-Manual 4.37/4.38 (Mission „Ramp Start“) und das DCS-F-16C-Handbuch ließen sich auch in #20 nicht abrufen (Abruffehler).
- Block-52-spezifisch klären: HMCS-Panel ja/nein, Außenlicht-Panel (Drehschalter laut S3 gegenüber Kippschaltern laut S2), AVTR-Fassung, OXY-QTY-Test (in S3 nicht vorhanden), Bedeutung der EEC-Caution (S2: Alternatorausfall) und der Varianten „80“/„LESS 80“ am EEC/BUC-Schalter, Funktion der Down-Permission-Taste (S1 9.4).
- Ein Busdiagramm als Tabelle Verbraucher → Bus für alle Avionikgeräte ist weiter nur teilweise belegt.

## Quellen

- S1 [Falcon BMS: TO 1F-16CM/AM-1 BMS, Flight Manual F-16C/D Blocks 50, 52, 52+ and MLU (4.37.4)](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf)
- S2 xflight.de, Panel-Unterseiten: linke Konsole [Übersicht](https://www.xflight.de/pe_org_par_lfc.htm), [Elec](https://www.xflight.de/pe_org_par_lfc_elec.htm), [Engine Start](https://www.xflight.de/pe_org_par_lfc_engstart.htm), [EPU](https://www.xflight.de/pe_org_par_lfc_epu.htm), [Fuel](https://www.xflight.de/pe_org_par_lfc_fuel.htm), [Flt Control](https://www.xflight.de/pe_org_par_lfc_fltctrl.htm), [Test](https://www.xflight.de/pe_org_par_lfc_test.htm), [Ext Lighting](https://www.xflight.de/pe_org_par_lfc_extlight.htm), [Aux Comm](https://www.xflight.de/pe_org_par_lfc_auxcomm.htm), [Audio 1](https://www.xflight.de/pe_org_par_lfc_audio1.htm), [Audio 2](https://www.xflight.de/pe_org_par_lfc_audio2.htm), [Manual Trim](https://www.xflight.de/pe_org_par_lfc_mantrim.htm), [Manual Pitch](https://www.xflight.de/pe_org_par_lfc_manpitch.htm), [ECM](https://www.xflight.de/pe_org_par_lfc_ecm.htm), [UHF](https://www.xflight.de/pe_org_par_lfc_uhf.htm), [AVTR](https://www.xflight.de/pe_org_par_lfc_avtr.htm), [Anti G](https://www.xflight.de/pe_org_par_lfc_antig.htm), [Manual Canopy](https://www.xflight.de/pe_org_par_lfc_mancanopy.htm), [Canopy Jettison](https://www.xflight.de/pe_org_par_lfc_cjettison.htm), [Defog](https://www.xflight.de/pe_org_par_lfc_defog.htm), [Chaff/Flare Button](https://www.xflight.de/pe_org_par_lfc_cfbutton.htm); linke Aux [Gear](https://www.xflight.de/pe_org_par_lxc_gear.htm), [Alt Gear](https://www.xflight.de/pe_org_par_lxc_altgeardn.htm), [Chaff/Flare](https://www.xflight.de/pe_org_par_lxc_chaffflare.htm), [Threat Warning Aux](https://www.xflight.de/pe_org_par_lxc_twaux.htm), [HMD](https://www.xflight.de/pe_org_par_lxc_hmd.htm); Frontpanel [Misc](https://www.xflight.de/pe_org_par_cec_misc.htm), [Eyebrow Lights](https://www.xflight.de/pe_org_par_cec_eyelights.htm), [Eyebrow Buttons](https://www.xflight.de/pe_org_par_cec_eyebuttons.htm), [ICP](https://www.xflight.de/pe_org_par_cec_icp.htm), [Instr Mode](https://www.xflight.de/pe_org_par_cec_instr.htm), [Fuel QTY Sel](https://www.xflight.de/pe_org_par_cec_fuelsel.htm), [MFD](https://www.xflight.de/pe_org_par_cec_mfd.htm), [Threat Warning Prime](https://www.xflight.de/pe_org_par_cec_twprime.htm), [RWR](https://www.xflight.de/pe_org_par_cec_rwr.htm), [Pedal Adj](https://www.xflight.de/pe_org_par_cec_pedaladj.htm); rechte Aux [Caution Panel](https://www.xflight.de/pe_org_par_rxc_wpanel.htm), [PFD](https://www.xflight.de/pe_org_par_rxc_pfd.htm), [EPU Fuel](https://www.xflight.de/pe_org_par_rxc_epufuel.htm); rechte Konsole [Avionics Power](https://www.xflight.de/pe_org_par_rgc_avpower.htm), [SNSR PWR](https://www.xflight.de/pe_org_par_rgc_snsrpwr.htm), [Lighting](https://www.xflight.de/pe_org_par_rgc_lighting.htm), [Air Cond](https://www.xflight.de/pe_org_par_rgc_aircond.htm), [Oxygen Reg.](https://www.xflight.de/pe_org_par_rgc_oxyreg.htm), [Anti Ice](https://www.xflight.de/pe_org_par_rgc_antiice.htm), [HUD](https://www.xflight.de/pe_org_par_rgc_hud.htm), [Zeroize](https://www.xflight.de/pe_org_par_rgc_zeroize.htm), [Nuclear](https://www.xflight.de/pe_org_par_rgc_nuclear.htm), [DTU](https://www.xflight.de/pe_org_par_rgc_dtu.htm), [KY58](https://www.xflight.de/pe_org_par_rgc_ky58.htm), [Floodlight](https://www.xflight.de/pe_org_par_rgc_floodlight.htm); [Sidestick](https://www.xflight.de/pe_org_par_ssc.htm), [Throttle](https://www.xflight.de/pe_org_par_tqs.htm)
- S3 [DCS-BIOS, F-16C_50.lua](https://raw.githubusercontent.com/DCS-Skunkworks/dcs-bios/main/Scripts/DCS-BIOS/lib/modules/aircraft_modules/F-16C_50.lua) (Community-Projekt; Datei ohne eigenen Lizenzkopf, nur als Referenz gelesen)
- S4 Brainscape, Nutzer-Deck „F-16“: [Übersicht](https://brainscape.com/packs/12578530), [Electrical System](https://brainscape.com/flashcards/electrical-system-7636120/packs/12578530), [Hydraulic System](https://www.brainscape.com/flashcards/hydraulic-system-7632457/packs/12578530), [EPU](https://www.brainscape.com/flashcards/epu-7634205/packs/12578530), [Fuel System](https://www.brainscape.com/flashcards/fuel-system-7632801/packs/12578530), [FLCS](https://www.brainscape.com/flashcards/flcs-7642762/packs/12578530), [ECS](https://www.brainscape.com/flashcards/ecs-7642667/packs/12578530), [Engine](https://www.brainscape.com/flashcards/engine-7638700/packs/12578530)
- S5 [47th FS: BMS Checklist short V7](https://47df.com/downloads/Taktik_Page/47th_BMS_Checklist_short_V7.pdf)
- S6 [Falcon-BMS-Forum: Master Caution/Elect systm/EPU](https://forum.falcon-bms.com/topic/16854/master-caution-elect-systm-epu)
- S7 [BMS-Wiki (biligame): 9 飞行中故障](https://wiki.biligame.com/falconbms/9_%E9%A3%9E%E8%A1%8C%E4%B8%AD%E6%95%85%E9%9A%9C)
- S8 f-16.net: [Generators in the F-16](https://www.f-16.net/forum/viewtopic.php?p=8223), [Main PWR on the F-16](https://www.f-16.net/forum/viewtopic.php?p=186657), [dieselbe Diskussion, p=186672](https://www.f-16.net/forum/viewtopic.php?p=186672)
- S9 [QuebecAirForce: QAF Ramp Start BMS 4.37, Kurzfassung (F-16CM-52, PW-229)](https://www.quebecairforce.com/img/Sim_BMS/Ref/Procedures/Ramp_Start/BMS437/QAF_Ramp_Start_437_Sommaire.pdf)
- S10 [Falcon BMS: TO 1F-16CM/AM-34-1-1 BMS (Avionik), 4.37](https://cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-34-1-1%20BMS.pdf) (nur Inhaltsverzeichnis gelesen)
