# PROTOTYP: Schalterbedienung in VR (Ticket #19)

Wegwerf-Code. Er beantwortet nur die Frage, wie sich kleine Cockpit-Schalter mit Quest-Controllern bedienen lassen. Nicht in `src/` übernehmen.

- `viewer.html` + `schalter.js`: Graumodell (#17) und Frontpanel (#10/#14) mit einem Testpanel in echter Größe vorn auf der linken Konsole: MAIN PWR (Hebelsperre), JFS (federt zurück), BUC und EPU (Schutzklappe), Drehschalter CONSOLES, Leuchttaster, vier Kontrollleuchten.
- Zwei Bedienarten, mit A/X umschaltbar: **Finger** (Controller-Spitze berührt und schiebt, Grip für Hebelsperre und Drehen per Handgelenk) und **Strahl** (zielen, Stick kippt/dreht, Trigger drückt und öffnet Klappen).
- Braucht `f16_frontpanel.glb.txt` und `f16_graumodell.glb.txt` daneben (Base64 der GLBs aus den beiden anderen Prototypen).
