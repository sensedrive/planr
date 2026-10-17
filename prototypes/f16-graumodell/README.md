# PROTOTYP: Graumodell der F-16-Kabine (Ticket #17)

Wegwerf-Code. Er beantwortet nur die Frage, ob Augpunkt, Konsolenhöhe, Stick- und Throttle-Lage in VR stimmen, bevor die Konsolen im Detail gebaut werden. Nicht in `src/` übernehmen.

```sh
.venv/bin/python prototypes/f16-graumodell/build.py /tmp/grauout   # Beschriftungen, Modell, GLB (wenige Sekunden)
```

- `masse.py`: alle Maße an einer Stelle (fast alles geschätzt, siehe `docs/research/f16-cockpit-referenzen.md`)
- `build.py`: Wanne, Konsolen mit beschrifteten DZUS-Panels, Aux-Konsolen, Sitz, Stick, Throttle, Pedale, Canopy
- `viewer.html`: lädt Graumodell und Frontpanel (`prototypes/f16-frontpanel`), Augenhöhe und Sitzlänge verstellbar, in VR über den rechten Stick
