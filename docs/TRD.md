# Technical Requirements Document (TRD)

## 1. Tech Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | Type-safe rules engine |
| Build | Vite | Fast dev and build |
| UI | React 18 | Component model |
| Styling | Tailwind CSS + CSS variables for themes | Fast, themeable |
| Animation | Framer Motion (UI) + CSS transforms for tokens | Smooth, reduced-motion aware |
| State | Zustand (UI state) + pure reducer engine | Clean separation |
| Audio | Howler.js | Simple cross-browser audio |
| Tests | Vitest + React Testing Library + Playwright (e2e) | Full coverage |
| Persistence | localStorage (MVP), IndexedDB optional | Save/resume |
| Multiplayer (Phase 2) | Node.js + Fastify + Socket.IO, authoritative server | Prevent cheating |
| Lint/format | ESLint + Prettier | Consistency |
| Package manager | pnpm | Speed |

## 2. Architecture Overview
```
┌────────────────────────────┐
│ UI (React components)      │  dumb, renders state, dispatches actions
├────────────────────────────┤
│ Store (Zustand)            │  holds GameState, UI flags, settings
├────────────────────────────┤
│ Game Engine (pure TS)      │  reduce(state, action) -> {state, events}
├────────────────────────────┤
│ AI (pure TS)               │  decide(state, playerId) -> Action
├────────────────────────────┤
│ Data (JSON)                │  board.json, cards.json
└────────────────────────────┘
(Phase 2) Server runs the SAME engine package; clients send actions only.
```

**Golden rule:** the engine has ZERO dependency on React, DOM, or randomness other than a seeded RNG passed in. This makes it testable, replayable and server-reusable.

## 3. Repository Structure
```
monopoly-world-tour/
├─ AGENTS.md
├─ docs/                 (these spec files)
├─ data/                 (board.json, cards.json)
├─ packages/
│  ├─ engine/            (pure TS rules engine)
│  │  ├─ src/{types.ts, rng.ts, board.ts, reducer.ts, rules/*.ts, cards.ts, events.ts, selectors.ts}
│  │  └─ tests/
│  ├─ ai/                (bot logic)
│  └─ server/            (Phase 2)
└─ apps/
   └─ web/
      ├─ src/{components, screens, store, hooks, audio, themes, assets}
      └─ tests/
```
Use pnpm workspaces. Data files are imported by the engine and validated with Zod on load.

## 4. Core Data Models (TypeScript)
```ts
type PlayerId = string;
type TileType = 'go'|'property'|'railroad'|'utility'|'tax'|'chance'|'community_chest'|'jail'|'free_parking'|'go_to_jail';

interface Player {
  id: PlayerId; name: string; token: TokenId; isBot: boolean; botPersonality?: BotPersonality;
  cash: number; position: number; inJail: boolean; jailTurns: number;
  getOutOfJailCards: number; bankrupt: boolean; consecutiveDoubles: number;
}
interface PropertyState { tileIndex: number; ownerId: PlayerId|null; houses: 0|1|2|3|4|5; /*5=hotel*/ mortgaged: boolean; }
interface GameSettings {
  startingCash: number; goSalary: number; auctionOnDecline: boolean; freeParkingJackpot: boolean;
  doubleGoBonus: boolean; speedDie: boolean; characterMode: boolean; worldEvents: boolean;
  mode: 'classic'|'quick'; quickTargetNetWorth: number; maxRounds: number|null; seed: number;
}
interface GameState {
  players: Player[]; properties: Record<number, PropertyState>;
  currentPlayerId: PlayerId; phase: Phase; dice: [number,number,number?]|null;
  chanceDeck: string[]; chestDeck: string[]; discard: {chance:string[]; chest:string[]};
  houseSupply: number; hotelSupply: number; freeParkingPot: number;
  pendingAuction: Auction|null; pendingTrade: TradeOffer|null; pendingDebt: Debt|null;
  activeEvents: WorldEvent[]; round: number; log: LogEntry[]; settings: GameSettings; rngState: number; winnerId: PlayerId|null;
}
type Phase = 'ROLL'|'MOVING'|'RESOLVE_TILE'|'BUY_DECISION'|'AUCTION'|'DEBT'|'POST_ROLL'|'JAIL_DECISION'|'GAME_OVER';
```

## 5. Engine API
```ts
function createGame(players: NewPlayer[], settings: GameSettings): GameState;
function reduce(state: GameState, action: Action): { state: GameState; events: GameEvent[] };
function getLegalActions(state: GameState, playerId: PlayerId): Action[];
```
**Actions:** `ROLL_DICE, END_TURN, BUY_PROPERTY, DECLINE_PROPERTY, AUCTION_BID, AUCTION_PASS, BUILD, SELL_BUILDING, MORTGAGE, UNMORTGAGE, PAY_JAIL_FINE, USE_JAIL_CARD, PROPOSE_TRADE, ACCEPT_TRADE, DECLINE_TRADE, COUNTER_TRADE, DECLARE_BANKRUPTCY, RESOLVE_DEBT, USE_CHARACTER_PERK`.

**Events** (for animation/sound/log; engine emits, UI consumes): `DICE_ROLLED, TOKEN_MOVED(path[]), PASSED_GO, CARD_DRAWN, RENT_PAID, PROPERTY_BOUGHT, BUILT, MORTGAGED, SENT_TO_JAIL, AUCTION_STARTED, WORLD_EVENT, PLAYER_BANKRUPT, GAME_WON`, etc. UI plays animation queue sequentially.

## 6. Rules Implementation Notes
- Rent calc in `rules/rent.ts` with unit tests for every property row. Color-set with zero houses: base rent x2 (if none mortgaged in the group).
- Even-building: `canBuild(state, tile)` checks full set owned, no mortgages in set, difference <= 1 after build, supply available.
- Debt handling: if player can't pay, enter `DEBT` phase: they may sell buildings, mortgage, trade; if still short after liquidation => bankrupt.
- Auction: ascending bids, each bot/human may bid or pass, highest bidder wins; starts at $10.
- Triple doubles to jail, jail turn logic exactly per FR-7.
- Speed die (optional): faces 1,2,3,Mr.Tycoon,Mr.Tycoon,Bus. Mr.Tycoon: after move, advance to next unowned property (or pay rent to next owned). Bus: move to nearest of Railroad, or extra roll (simplified: advance to nearest railroad). Document chosen simplification in code.
- RNG: Mulberry32 seeded; state stored in `rngState` for deterministic replays.
- Houses shortage: when supply runs out, buildings are auctioned only if shortage rule is on (default simple: cannot build).

## 7. AI Design (`packages/ai`)
Heuristic scoring bot, each decision returns an Action.
- **Buy decision:** score = propertyValue(group completion potential, rent ROI, opponent blocking) vs cash reserve threshold per personality.
- **Build:** prioritize sets with highest rent-per-$ (orange/red best), keep reserve.
- **Trade:** evaluate offer by net asset value + set completion; Diplomat proposes trades that complete sets for both sides.
- **Auction:** bid up to computed valuation.
- **Jail:** early game pay fine, late game stay in jail if opponents own many built sets.
- Difficulty: Easy = random noise + low reserve; Normal = heuristic; Hard = heuristic + 2-ply lookahead of rent risk.
- Bots act with 400-900ms artificial delay (configurable; "Instant" skips).

## 8. Frontend Technical Details
- Board rendered with CSS Grid (11x11) with corner tiles; tile components receive `Tile` data + `PropertyState`.
- Token movement: UI converts `TOKEN_MOVED.path` to hop animations with Framer Motion; camera zoom/pan on mobile.
- Dice: CSS 3D cubes (or SVG) with physics-flavored tumble; result comes from engine, animation is cosmetic.
- Event queue: `useAnimationQueue` hook processes engine events in order; inputs are locked while animating (unless "Fast").
- Modals: Property card, Buy/Auction, Trade, Build manager, Card draw, Debt, Settings.
- Theming through CSS variables (`--tile-bg`, `--accent`).
- i18n-ready: all strings in `locales/en.json` (Hindi/others later).

## 9. Persistence
Auto-save `GameState` JSON to localStorage after each action (`mwt.save.v1`), version field for migrations. Settings under `mwt.settings.v1`. Stats and achievements under `mwt.stats.v1`.

## 10. Multiplayer (Phase 2)
- Server authoritative: clients send `Action`, server validates with `getLegalActions`, applies `reduce`, broadcasts new state diff + events.
- Rooms: 6-char code, host settings, reconnect token, bot fill-in for disconnected players after 60s.
- Socket events: `room:create, room:join, room:ready, game:action, game:state, game:events, chat:message, emote:send`.
- Hide nothing (full info game), but validate `playerId` from session token.
- Deploy: Docker; frontend on static hosting; server on any Node host.

## 11. Testing Strategy
- **Unit:** every rule (rent tables, building even rule, jail, cards, bankruptcy, auction, trading).
- **Property-based (fast-check):** invariants: total money + bank constant adjustments, no negative houses, one owner per property, supply counts.
- **Simulation:** 100 bot-vs-bot games with random seeds must complete (<= 2,000 turns) with no thrown errors and invariants intact.
- **Component tests:** key modals.
- **E2E (Playwright):** start game, roll, buy, end turn, trade flow, save/resume.
- CI: GitHub Actions running lint, typecheck, test, build.

## 12. Performance, Security, Quality
- Code-split audio and Phase 2 modules; lazy-load images; use SVG/emoji icons to keep bundle small.
- No `eval`, validate JSON with Zod, sanitize chat (Phase 2), rate-limit sockets.
- Strict TS, no `any`, ESLint clean, Prettier formatted.

## 13. Definition of Done (per feature)
Typed, tested, accessible, responsive, documented in code comments where non-obvious, no console errors.
