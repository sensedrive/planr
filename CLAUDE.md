# Planr

Browser-VR-Flugsimulator (TypeScript, Vite, eigene WebGL2-Engine unter `src/engine/`), Ziel Meta Quest. Projektsprache ist Deutsch.

- Checks vor jedem Push: `npm run typecheck`, `npm test`, `npx vite build` (wie in CI).
- `main` deployt automatisch nach Produktion; Änderungen gehen über Pull Requests.

## Agent skills

Die Skills unter `.claude/skills/` stammen aus [mattpocock/skills](https://github.com/mattpocock/skills) (MIT), Stand `49dd158`.

### Issue tracker

Issues und Specs liegen in den GitHub Issues von `sensedrive/planr`. See `docs/agents/issue-tracker.md`.

### Triage labels

Die fünf Standard-Labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: ein `GLOSSARY.md` und `docs/adr/` im Repo-Root, beide entstehen erst bei Bedarf. See `docs/agents/domain.md`.
