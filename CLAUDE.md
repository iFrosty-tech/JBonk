# JBonk

Survivor-like 2.5D browser game (Three.js + TypeScript + Vite) themed on office life and IT consulting.
`README.md` is the source of truth for gameplay loop, architecture, map pipeline and extension guides: read it before working.

## Commands

```bash
npm run dev         # http://localhost:5173 (append #debug for test shortcuts: L level-up, B boss, G god mode, K kill all, T +1h, O +100€, N new weapon, V Vim passive, Y Call di Gruppo)
npm run typecheck   # tsc --noEmit — must pass before any task is reported done
npm run build       # typecheck + production bundle in dist/
node scripts/readme-media/capture.mjs <scene>   # deterministic screenshots/GIFs via Playwright (needs dev server running)
```

## Conventions

- Data lives in `src/config/`: customize content there, touch the engine (`src/game/`, `src/render/`) only when a new behavior is needed.
- Identifiers in English; code comments, in-game text, docs and commit messages in Italian (match the surrounding code).
- No external assets: sprites are drawn on canvas (`src/render/atlas.ts`, `src/render/logos/`), sounds are synthesized (`src/game/audio.ts`).
- Performance budget: game logic ~0.7 ms/frame with 280 enemies; all sprites in a single draw call. Do not regress it.
- Desktop and mobile (touch) are both first-class: every UI or input change must work on both.

## Agent team

Role definitions live in `.claude/agents/`. Spawn teammates by agent type, e.g.
"Spawn a teammate using the level-designer agent type to ...". Start with 3–5 teammates per task.

| Agent | Owns (writes) | Use it for |
|---|---|---|
| `project-manager` | `docs/design/backlog.md` | breaking a goal into tasks, priorities, scope, status |
| `game-designer` | `docs/design/gdd.md`, `src/config/{characters,weapons,passives,enemies}.ts` | mechanics, new weapons/enemies/bosses/characters, specs |
| `balance-designer` | `src/config/tuning.ts`, `docs/design/balance.md` | difficulty curve, DPS/HP math, spawn rates, rarity, XP |
| `level-designer` | `src/config/biomes.ts`, `src/maps/`, `scripts/map/`, `docs/design/levels.md` | projects/biomes, POIs, map layout, spawn placement, pacing per area |
| `gameplay-programmer` | `src/game/` (except `audio.ts`), `src/app.ts`, `src/main.ts`, `src/config/types.ts` | game loop, weapon behaviors, AI, collisions, input, camera |
| `technical-artist` | `src/render/`, `src/assets/` | sprites, animated logos, city/facades, props, lighting, draw-call perf |
| `ui-ux-designer` | `src/ui/` | HUD, screens, cards UI, touch controls, mobile layout, readability |
| `sound-designer` | `src/game/audio.ts` | synthesized SFX, music, mix, audio feedback |
| `narrative-writer` | `docs/design/writing.md` (text fields in config only via their owner) | names, descriptions, boss quotes, card copy, tone |
| `qa-tester` | nothing (read-only, reports bugs) | playtests, repro steps, regressions, typecheck/build, perf checks |

Team rules:
- One file, one writer at a time. The lead never assigns the same file to two teammates in parallel.
- Need a change in a file you don't own? Message its owner with the exact change; don't edit it yourself.
- Ownership above is the default; the lead may reassign a file for a single task and must say so in the task.
- Designers specify, programmers implement: a design that needs a new behavior goes to `gameplay-programmer` as a spec with acceptance criteria.
