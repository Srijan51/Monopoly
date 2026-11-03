# Product Requirements Document (PRD): Monopoly World Tour

**Version:** 1.0  **Status:** Ready for implementation

## 1. Vision
A fun, polished, browser-based property-trading board game inspired by classic Monopoly, set on a **World Tour** board of real cities and landmarks. It should feel like a premium digital board game: juicy animations, humor, surprises, smart AI opponents, and optional online play with friends.

> Note: "Monopoly" is a trademark of Hasbro. This project uses original names, art and card text. Do not use official Hasbro artwork, logos or exact board names. Suggested working title: **World Tour Tycoon** (or "Monopoly World Tour" for private/personal use only).

## 2. Goals
1. Faithful core rules (buy, rent, build, mortgage, trade, auction, jail, bankruptcy).
2. Extra fun: world cities with fun facts, funny cards, world events, character perks, speed die, achievements.
3. Playable in under 5 seconds from opening (no sign-up required for local play).
4. Works on desktop and mobile browsers.
5. Smart, fun AI bots so solo play is satisfying.

## 3. Target Users
- Casual players / families (hot-seat on one device).
- Friends playing online in rooms (Phase 2).
- Solo players vs AI bots.

## 4. Game Modes
| Mode | Description | Phase |
|---|---|---|
| Local Hot-seat | 2-6 humans share a device | MVP |
| Vs AI | 1 human + 1-5 bots (Easy/Normal/Hard, personalities) | MVP |
| Online Rooms | Room code, 2-6 players, reconnect | Phase 2 |
| Quick Game | Ends when a player reaches $5,000 net worth or after N rounds (winner = richest) | MVP |
| Classic Game | Last player standing wins | MVP |

## 5. Functional Requirements

### 5.1 Core Rules (MUST)
- FR-1: 2-6 players, start cash $1,500, GO salary $200.
- FR-2: Roll 2 dice, move token, doubles grant another roll; 3 consecutive doubles sends player to Jail.
- FR-3: Buying: landing on unowned property offers Buy at list price; declining triggers an **auction** (toggleable).
- FR-4: Rent per `data/board.json` (base, color-set double rent when monopoly with no houses, 1-4 houses, hotel). Railroads: 25/50/100/200 by count owned. Utilities: 4x dice (10x if both owned).
- FR-5: Building: need full color group, build evenly, house/hotel limits (32 houses, 12 hotels, shortage rule). Selling buildings at half price, evenly.
- FR-6: Mortgage (receive half price), unmortgage (price + 10% interest). Mortgaged properties collect no rent.
- FR-7: Jail: enter via Go To Jail tile, card, or triple doubles. Exit by paying $50, using Get Out of Jail Free, or rolling doubles; forced to pay after 3 failed turns.
- FR-8: Taxes (Travel Tax $200, Luxury Tax $100), Chance and Community Chest decks (`data/cards.json`), shuffled, reshuffled when exhausted.
- FR-9: Trading: offer properties, cash and jail cards both ways; counter-offers; accept/decline.
- FR-10: Bankruptcy: if debt exceeds assets player is eliminated; assets go to creditor (or bank and auctioned).
- FR-11: Win condition per mode.

### 5.2 Fun Features (SHOULD)
- FR-20: **City Fun Facts** popup/ticker when landing on a property (one line, dismissible, can disable).
- FR-21: **Character Mode** (optional toggle): each token has a small perk (see GAME_DESIGN.md).
- FR-22: **World Events** (optional toggle): every 8 rounds a random event fires (Festival, Storm, Tourism Boom, etc.).
- FR-23: **Speed Die** (optional): third die with Mr. Tycoon / Bus icons.
- FR-24: **Free Parking Jackpot** (optional): taxes and fees accumulate; collect on landing.
- FR-25: **Double GO** (optional): landing exactly on GO pays $400.
- FR-26: **Achievements & Stats**: e.g. "Jet Setter", "Landlord", "Escape Artist" (local storage; synced in Phase 2).
- FR-27: **Emotes and Chat** (online): quick emotes (clap, cry, money, fire).
- FR-28: **Bot personalities**: Shark (aggressive), Banker (hoards cash), Gambler (buys everything), Diplomat (loves trades).
- FR-29: **Themes**: World Tour (default), Classic Neon, Night Mode.
- FR-30: **Game Log** with funny commentary lines.

### 5.3 Meta (SHOULD/COULD)
- Save and resume local games automatically.
- Undo is NOT supported (except confirming dialogs).
- Game speed setting (Normal / Fast / Instant for bots).
- Sound effects, music, haptics on mobile, mute toggles.
- Settings: house rules toggles, theme, animation speed, colorblind patterns.
- Tutorial: 60-second interactive onboarding overlay (COULD).

## 6. Non-Functional Requirements
- Performance: 60 fps animations on mid-range phones; initial load < 3s on 4G (target bundle < 1.5 MB gzip excluding audio).
- Responsive: 360px to 4K widths. Touch and mouse.
- Accessibility: keyboard operable, ARIA labels, color-blind friendly (patterns/icons on color groups), respects `prefers-reduced-motion`.
- Reliability: deterministic game engine (seeded RNG) with unit tests for every rule.
- Privacy: no accounts needed; no personal data collected for local play.
- Browser support: latest Chrome, Edge, Safari, Firefox.

## 7. Success Metrics
- A full 4-player vs bots game completes without rule bugs in 100 automated simulations.
- Engine test coverage >= 90%.
- Average first-time player can start a game in < 3 clicks.

## 8. Out of Scope (v1)
Real-money purchases, user-generated boards, voice chat, native mobile apps.

## 9. Release Plan
- **MVP:** local + AI, full rules, UI, sounds, save/resume.
- **v1.1:** fun features (events, character mode, speed die, achievements).
- **v2:** online multiplayer, chat, emotes, accounts (optional).

## 10. Risks
| Risk | Mitigation |
|---|---|
| Rules complexity bugs | Pure TS engine + exhaustive tests + bot simulation |
| Trademark issues | Original names/art, disclaimer |
| Bot feels dumb/slow | Heuristic scoring AI, instant bot mode |
| Mobile board too small | Zoomable/pannable board, current tile focus camera |
