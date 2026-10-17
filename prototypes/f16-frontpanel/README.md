# PROTOTYP: F-16C-Frontpanel per Blender-Skript (Ticket #10)

Wegwerf-Code. Er beantwortet nur die Frage, ob ein per Python-Skript erzeugtes Blender-Modell „detailgetreu“ wird. Nicht in `src/` übernehmen.

```sh
python3 -m venv .venv && .venv/bin/pip install bpy==5.2.2 pillow   # Blender als Python-Modul (Python 3.13)
.venv/bin/python prototypes/f16-frontpanel/build.py /tmp/f16out      # Texturen, Modell, AO-Bake, GLB (ca. 1,5 min)
```

- `layout.py`: Maße und Positionen (belegte Werte aus `docs/research/f16-cockpit-referenzen.md`)
- `textures.py`: Frontatlas, Leuchtmaske, MFD- und DED-Seiten (Pillow)
- `build.py`: Geometrie, planare Atlas-UV, Lightmap-UV, AO-Bake (Cycles), glTF-Export
- `viewer.html`: three.js-Vorschau (AO an/aus, Tag/Nacht, Sitzposition); im Artefakt lädt sie das GLB als Base64-Text
