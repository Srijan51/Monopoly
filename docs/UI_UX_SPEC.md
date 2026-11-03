# UI / UX Specification

## 1. Design Principles
1. **Juicy but clear:** every action has feedback (motion, sound, number pop) yet the state is always readable.
2. **One obvious next action:** a single highlighted primary button per phase.
3. **Mobile first:** thumb-reachable controls, bottom sheets.
4. **Never block needlessly:** bots run fast, animations skippable.

## 2. Visual Style
- Look: illustrated travel-poster board, rounded corners (12px), soft shadows, paper-textured table.
- Fonts: headings "Fredoka" or "Baloo 2" (playful), body "Inter". Fallback system fonts.
- Colors (CSS variables):
  - `--bg: #FFF7E8`, `--ink: #1B1B1F`, `--accent: #FF6B35`, `--accent-2: #2EC4B6`, `--money: #2E9E5B`, `--danger: #D62828`.
  - Property group colors from `data/board.json > colorGroups`.
- Dark theme "Night Mode": `--bg: #14161C`, `--ink: #F2F2F2`, same accents.
- Color-blind support: each color group also has a pattern (stripes, dots, etc.) and a letter badge.

## 3. Layout

### Desktop (>= 1100px)
```
┌────────────┬───────────────────────┬────────────┐
│ Players    │        BOARD          │ Log        │
│ panels     │  (square, centered)   │ Actions    │
│            │  center: dice, decks  │ Trade btn  │
└────────────┴───────────────────────┴────────────┘
         bottom action bar (context buttons)
```
### Mobile (< 700px)
Board on top (pinch zoom, auto-focus on current token). Bottom sheet tabs: **Actions | Players | Log**. Sticky primary action button at bottom.

## 4. Components
| Component | Details |
|---|---|
| `Board` | CSS grid 11x11; corner tiles 2x; edge tiles rotated labels for top/left/right |
| `Tile` | color band, name, price, owner color dot, house/hotel icons, mortgaged overlay (diagonal stripes) |
| `Token` | SVG; hop animation per tile; trail dust |
| `Dice` | 3D tumble ~900ms, shows pips; speed die variant |
| `PlayerPanel` | avatar/token, name, cash (animated count-up/down), property color chips, jail card badge, active glow |
| `PropertyCard` | rent table, house cost, mortgage value, fun fact, owner |
| `ActionBar` | context buttons: Roll, Buy, Auction, Build, Trade, Mortgage, End Turn |
| `CardModal` | flip animation, funny text, OK button |
| `AuctionModal` | live bids list, quick bid buttons |
| `TradeModal` | two-column builder with asset chips, validation hints |
| `BuildManager` | grouped by color, +/- with cost totals |
| `DebtModal` | shortfall display, liquidate options, bankrupt button |
| `EventBanner` | slide-in with icon and affected tiles pulse |
| `Toast` | fun facts, achievements, errors |
| `Confetti` | on win/achievement (respect reduced motion) |
| `SettingsPanel` | audio sliders, theme, animation speed, house rules |

## 5. Animation and Feedback Specs
- Token hop: 180ms per tile (Normal), 80ms (Fast), instant (Instant).
- Money change: floating `+$200` green / `-$150` red above player panel and tile; count animation 600ms.
- Property bought: tile flashes owner color, small stamp "SOLD".
- Build: house pops in with bounce.
- Jail: bars slide down over token.
- Bankruptcy: panel greys out with "eliminated" stamp.
- Reduced motion: replace movement with fades, no confetti, shorter durations.

## 6. Audio
Master, Music, SFX sliders; mute persisted. Autoplay policy: start audio after first user gesture.

## 7. Accessibility
- All buttons reachable via Tab, visible focus ring, ARIA labels (e.g. "Buy Paris for 350 dollars").
- Live region announces game log events to screen readers.
- Minimum touch target 44px; contrast AA.
- Never rely on color alone (patterns + text).

## 8. Copy and Tone
Friendly, witty, short. Examples: "You've landed in Tokyo. Konnichiwa, landlord!", "Out of cash? Time to mortgage something dramatic."

## 9. Responsive Rules
Board keeps 1:1 aspect via `min(100vw - gutters, 100vh - header)`. Text in tiles scales with container query units (`cqw`).
