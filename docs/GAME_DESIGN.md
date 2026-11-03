# Game Design Document: Rules, Board and Fun Features

Data lives in `data/board.json` (40 tiles) and `data/cards.json` (16 Chance, 16 Community Chest). This doc explains the design intent.

## 1. The World Tour Board
Players travel the world buying cities. Layout follows the classic 40-tile ring.

| # | Tile | # | Tile |
|---|---|---|---|
| 0 | GO | 20 | Free Parking |
| 1 | Hanoi Old Quarter (Brown) | 21 | Rome (Red) |
| 2 | Community Chest | 22 | Chance |
| 3 | Marrakech Souk (Brown) | 23 | Athens (Red) |
| 4 | Travel Tax $200 | 24 | Cairo (Red) |
| 5 | Trans-Siberian Railway | 25 | Shinkansen Bullet Train |
| 6 | Lisbon (Light Blue) | 26 | London (Yellow) |
| 7 | Chance | 27 | Barcelona (Yellow) |
| 8 | Prague (Light Blue) | 28 | Aqua Plant (Utility) |
| 9 | Istanbul Bazaar (Light Blue) | 29 | Sydney (Yellow) |
| 10 | Jail / Just Visiting | 30 | Go To Jail |
| 11 | Rio de Janeiro (Pink) | 31 | Singapore (Green) |
| 12 | Solar Farm (Utility) | 32 | Dubai (Green) |
| 13 | Cape Town (Pink) | 33 | Community Chest |
| 14 | Buenos Aires (Pink) | 34 | Tokyo (Green) |
| 15 | Orient Express | 35 | Darjeeling Himalayan Railway |
| 16 | Bangkok (Orange) | 36 | Chance |
| 17 | Community Chest | 37 | Paris (Dark Blue) |
| 18 | Jaipur (Orange) | 38 | Luxury Tax $100 |
| 19 | Kyoto (Orange) | 39 | New York City (Dark Blue) |

Each city tile shows: color band, name, flag emoji, price, and a landmark icon. Tapping a tile opens a card with rent table, fun fact, and owner.

## 2. Core Rules Summary
Standard property-trading rules apply: $1,500 start, $200 GO salary, buy or auction, even building, mortgage at 50%, unmortgage at 110%, three-doubles jail, jail exit by $50 / card / doubles (forced after 3 turns), 32 houses and 12 hotels, bankruptcy to creditor. Full numeric rent tables are in `board.json`.

## 3. Fun Features (what makes it special)

### 3.1 City Fun Facts
Every city has a short fact shown in a small toast on landing. Toggle in settings.

### 3.2 Character Mode (optional)
Each token has a once-per-game or limited perk. Intentionally small to keep balance.
| Token | Perk |
|---|---|
| Rocket | Once per game, re-roll the dice |
| Camel | Pay 50% less rent once per game |
| Llama | Immune to Go To Jail once per game |
| Globe | Collect $50 each time you land on an airport-like rail tile |
| Camera | See fun fact bonus: first landing on each new city pays $10 "travel blog" bonus |
| Suitcase | Once per game, swap places with any player |
Perks are triggered via `USE_CHARACTER_PERK`; UI shows a glowing perk button when available.

### 3.3 World Events (optional, every 8 rounds, lasts 2-3 rounds)
| Event | Effect |
|---|---|
| Carnival in Rio | Rent on Pink set is doubled |
| Monsoon Season | Tiles in one random color group collect no rent |
| Tourism Boom | Everyone passing GO gets +$100 |
| Tech Expo | Utilities rent x2 |
| Train Strike | Railway rent halved |
| Global Sale | Unowned properties cost 20% less |
| Market Crash | Everyone pays 5% of cash (rounded) into Free Parking pot |
| Lucky Day | Next doubles roll grants extra $100 |
Event is chosen with seeded RNG; UI shows banner and highlights affected tiles.

### 3.4 Speed Die (optional)
Third die: 1, 2, 3, Mr. Tycoon (x2 faces), Bus (x1 face). Adds pace and surprise.

### 3.5 Free Parking Jackpot (optional)
Taxes, event penalties and card fees go to the pot, shown on the board center. Landing on Free Parking collects it.

### 3.6 Double GO (optional)
Landing exactly on GO pays $400 instead of $200.

### 3.7 Quick Game
Ends after N rounds (default 30) or when someone hits the target net worth. Winner = highest net worth (cash + property price + buildings at cost).

### 3.8 Bots with Personality
| Bot | Style | Voice lines (log commentary) |
|---|---|---|
| Shark | Buys aggressively, builds fast | "Nothing personal, just rent." |
| Banker | Keeps big cash reserve, avoids risk | "Compound interest, my friend." |
| Gambler | Buys everything, loves doubles | "Feeling lucky today!" |
| Diplomat | Proposes trades often | "I have a proposal for us both." |

### 3.9 Achievements (local)
First Purchase, Jet Setter (own all 4 railways), Landlord (own 3 full sets), Escape Artist (leave jail via doubles 3 times), Comeback Kid (win after dropping below $50), Hotel Mogul (build 5 hotels), Bankrupt Them All (bankrupt 3 opponents), Globetrotter (land on all 40 tiles in one game).

### 3.10 Commentary and Humor
Game log uses playful lines: e.g. "Priya paid $120 rent to Sam. Ouch, that stings!" Provide 3-5 variants per event type and pick randomly (seeded for replays).

## 4. Balance Notes
- Perks and events are optional and off by default in "Classic" preset; "Party" preset turns on everything.
- Presets: **Classic**, **Party** (all fun toggles on), **Quick Party** (Party + Quick mode).
- Simulation tests should confirm no single color group yields > 25% win rate advantage beyond known classic bias.

## 5. Art and Sound Direction
- Style: bright, flat illustrated "travel poster" look; each city gets a small SVG/emoji landmark. No Hasbro assets.
- Tokens: rocket, camel, llama, globe, camera, suitcase (SVG).
- Palette: warm paper background, vivid property colors from `board.json`.
- Sounds: dice rattle, token hop tick, cash register, card flip, jail door clang, auction gavel, fanfare, subtle ambient world-music loop (royalty-free, loopable). Placeholder generated tones allowed in MVP.
