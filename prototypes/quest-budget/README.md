# Prototyp: Quest-Budget (#28)

Wegwerf-Code. Lasttest auf der eigenen Engine mit der Alpenwelt: Ein Messlauf legt Stufe für Stufe die Last der späteren F-16 drauf und misst Bildrate, verlorene Frames, p95-Frametime und CPU-Zeit pro Bild.

| Stufe | Was dazukommt |
| --- | --- |
| Welt allein | Gelände, Wald, Flugplätze, Wolken, Schatten, 150 m/s Kreisflug in 600 m |
| + Cockpit-GLBs | Graumodell (#17) und Frontpanel (#14), falls beim Bündeln mitgegeben |
| + Cockpit 100 DC/150k | Ersatzteile bis etwa zum Zielbudget aus #16 |
| + 4 Displays | 2 MFD, DED, HUD als Linien, jedes Bild neu erzeugt (#21) |
| + 1 Rottenflieger / 4 / 8 Jets | Jets aus 5 Teilen mit 4 LOD-Stufen 80k/30k/10k/2k (#25), einer dicht daneben |
| + 20k Partikel | Rauchspuren |
| + Sim/KI 3/6/10 ms | Rechenlast im 50-Hz-Takt (#18, #22) |

Im Headset: **A** Messlauf (knapp 2 Minuten), **B** nächste Stufe, **X** 72/90 Hz, **Y** Kopf zentrieren. Die Tabelle steht auf einer Tafel links neben dem Frontpanel und nach dem Verlassen von VR auf der Seite.

Die Draw-Call-Zahl ist geschätzt (Mesh-Listen plus Schatten-Caster plus etwa 12 für Gelände, Himmel, Wolken und Post), weil `renderer.stats.draws` in der Engine noch nicht hochgezählt wird.

## Bauen

```sh
npx vite build --config prototypes/quest-budget/vite.config.ts
node prototypes/quest-budget/bundle.mjs /tmp/claude-0/budgetout ziel.html grau=f16_graumodell.glb front=f16_frontpanel.glb
```

Die GLBs entstehen mit den Blender-Skripten in `prototypes/f16-graumodell/` und `prototypes/f16-frontpanel/`.
