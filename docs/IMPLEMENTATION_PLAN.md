# Implementation Plan

Work in order. Do not start a phase until the previous phase's checks pass. After each task: run `pnpm lint && pnpm typecheck && pnpm test`.

## Phase 0: Setup
- [x] Init pnpm workspace: `packages/engine`, `packages/ai`, `apps/web`.
- [x] Configure TypeScript strict, ESLint, Prettier, Vitest, Tailwind, Vite.
- [x] Copy `data/board.json` and `data/cards.json`; add Zod schemas and a loader that validates them (40 tiles, unique indices, 32 cards).
- [ ] CI workflow (lint, typecheck, test, build).

## Phase 1: Engine (no UI)
- [x] Types, seeded RNG (Mulberry32), `createGame`.
- [x] Dice, movement, passing GO, doubles and triple-doubles jail.
- [x] Buy/decline, ownership, rent (properties, color-set bonus, railroads, utilities).
- [x] Taxes, Chance and Community Chest effects (all effect types in `cards.json`).
- [x] Jail logic (pay, card, doubles, forced pay).
- [x] Building/selling with even-build and supply limits.
- [x] Mortgage/unmortgage.
- [x] Auction.
- [x] Trading.
- [x] Debt and bankruptcy; win conditions (classic and quick).
- [ ] Optional rules: Free Parking jackpot, Double GO, speed die, character perks, world events.
- [x] `getLegalActions`, event emission, log generation.
- **Exit check:** pending until dependencies are available and remaining Phase 1 items are implemented.

## Phase 2: AI
- [x] Bot interface `decide(state, playerId): Action`.
- [x] Buy/auction valuation, build priority, jail choice, trade evaluation.
- [x] Personalities and difficulty levels.
- [x] Simulation script: 100 seeded bot-only games complete without errors or invariant breaks.
- **Exit check:** pending local execution because Node.js/pnpm are unavailable in this environment.

## Phase 3: Web UI MVP
- [ ] Theme tokens, layout shell, Main Menu, Game Setup.
- [ ] Board and Tile components from `board.json`; tokens.
- [ ] Zustand store wrapping engine; animation event queue.
- [ ] Dice, movement animation, player panels, log.
- [ ] Modals: property/buy, auction, card, build manager, trade, debt, jail, settings.
- [ ] Bot turn driver with speed settings.
- [ ] Save/resume via localStorage; Game Over screen with rematch.
- [ ] Sound effects (placeholder tones OK) and mute.
- **Exit check:** a full human-vs-3-bots game is playable on desktop and mobile widths.

## Phase 4: Fun Layer
- [ ] Fun facts toasts, commentary variants.
- [ ] Character mode, world events, speed die, presets (Classic / Party / Quick Party).
- [ ] Achievements and stats screen.
- [ ] Themes (World Tour, Classic Neon, Night), color-blind patterns.
- [ ] Confetti, polish, tutorial overlay.

## Phase 5: Quality
- [ ] Playwright e2e flows (start game, buy, build, trade, save/resume).
- [ ] Accessibility audit (keyboard, ARIA, reduced motion).
- [ ] Performance pass (bundle size, lazy audio).
- [ ] README with run instructions and trademark disclaimer.

## Phase 6 (Later): Online Multiplayer
See `docs/MULTIPLAYER_SPEC.md` for the full spec; it replaces the short list below.
- [ ] Fastify + Socket.IO server reusing `packages/engine`.
- [ ] Rooms, reconnect, bot backfill, chat and emotes.
- [ ] Server-side validation and rate limiting.

## Task Template for the Agent
For each task: (1) read relevant docs, (2) write tests first where logic is involved, (3) implement, (4) run checks, (5) summarize what changed and any assumptions.
