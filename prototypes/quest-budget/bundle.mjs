// Baut eine einzelne HTML-Datei: Skript inline, Cockpit-GLBs als base64 (window.GLB).
// Aufruf: node prototypes/quest-budget/bundle.mjs <vite-out> <ziel.html> [name=datei.glb ...]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, target, ...glbs] = process.argv.slice(2);
let html = readFileSync(join(outDir, 'index.html'), 'utf8');
const js = readdirSync(join(outDir, 'assets')).find((f) => f.endsWith('.js'));
const code = readFileSync(join(outDir, 'assets', js), 'utf8').replace(/<\/script/g, '<\\/script');
const map = Object.fromEntries(glbs.map((g) => g.split('=')).map(([k, f]) => [k, readFileSync(f).toString('base64')]));
html = html.replace(/<script type="module"[^>]*><\/script>/, () => `<script>window.GLB=${JSON.stringify(map)}</script><script type="module">${code}</script>`);
writeFileSync(target, html);
console.log(`${target}: ${(html.length / 1e6).toFixed(1)} MB`);
