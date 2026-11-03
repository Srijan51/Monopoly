# App Flow

## 1. Screen Map
```
Splash/Loading → Main Menu ─┬─ New Game → Game Setup → Game Board ─→ Game Over → (Rematch | Main Menu)
                            ├─ Continue (if save exists) → Game Board
                            ├─ How to Play (tutorial)
                            ├─ Achievements & Stats
                            ├─ Settings
                            └─ Play Online (Phase 2) → Lobby → Room → Game Board
```

## 2. Screens

### 2.1 Main Menu
Animated globe/board background. Buttons: **Play**, **Continue**, **Play Online** (disabled "Coming soon" in MVP), **How to Play**, **Achievements**, **Settings**. Footer: version + trademark disclaimer.

### 2.2 Game Setup
1. Choose mode: Classic / Quick.
2. Add players (2-6): name, token (picker), type (Human / Bot Easy / Normal / Hard), bot personality.
3. House rules toggles: Auction on decline, Free Parking jackpot, Double GO, Speed die, Character mode, World events, Fun facts.
4. Starting cash selector (Standard $1500 / Rich $2500 / Poor $1000).
5. **Start Game** (validates >= 2 players, unique tokens).

### 2.3 Game Board (main screen)
Layout (desktop): center board; left sidebar: player panels (cash, properties mini-strip, jail card icons, turn indicator); right sidebar: Game Log + Actions panel; bottom: context action bar. Mobile: board fills width, bottom sheet for actions/players/log tabs.

Regions inside board center: Dice area, Chance and Chest deck piles, current event banner, Free Parking jackpot display.

### 2.4 Game Over
Winner celebration (confetti), final standings (net worth), stats (rent collected, properties, best deal, bankruptcies), achievements unlocked, **Rematch / New Setup / Main Menu**.

## 3. Turn Flow (state machine)
```
START_TURN
  ├─ if in jail → JAIL_DECISION (pay $50 / use card / roll for doubles)
  └─ else → ROLL
ROLL → dice animation → MOVING (token hops tile by tile; passing GO pays salary)
  → RESOLVE_TILE:
      Unowned property/rail/utility → BUY_DECISION
            Buy → ownership + cash deducted → POST_ROLL
            Decline → AUCTION (if enabled) → POST_ROLL
      Owned by other (not mortgaged) → auto pay rent (DEBT if can't afford)
      Owned by self / mortgaged → nothing
      Tax → pay (or add to jackpot)
      Chance / Community Chest → card modal → apply effect (may move again → RESOLVE_TILE)
      Go To Jail → jail
      Free Parking → collect jackpot (if enabled)
      GO → salary (double if rule)
  → POST_ROLL:
      if rolled doubles (and not 3rd) → player may manage then ROLL again
      else → player may Build / Mortgage / Trade, then END_TURN
END_TURN → check bankruptcy / win → next player's START_TURN (skip bankrupt)
```
At any time during the player's own turn (except animations): open Build Manager, Mortgage, Trade. Players can also respond to incoming trade offers when it's their turn to decide (offers pause until responded).

## 4. Key Interaction Flows

### 4.1 Buying
Landing on unowned → Property card modal with price, rent table, fun fact → **Buy ($X)** or **Auction**. Bot actions auto-resolve with small delay and log line.

### 4.2 Auction
Modal shows property, current bid, bidders. Human buttons: +$10, +$50, +$100, custom, **Pass**. Bots bid per valuation. Timer optional (15s, default off). Winner pays; log announces.

### 4.3 Building
Open **Build Manager**: list complete color sets; +/- buttons per property with even-build enforcement and cost preview; disabled reasons shown (e.g. "Need full set", "Houses sold out").

### 4.4 Trading
**Trade** button → choose partner → two-column offer builder (properties, cash, jail cards) → send. Partner (human: modal; bot: auto-evaluate) → Accept / Decline / Counter. Mortgaged properties tradable; recipient pays 10% fee note.

### 4.5 Debt and Bankruptcy
If a charge exceeds cash: **Debt modal** lists liquidation options (sell houses, mortgage, trade). If total liquidation insufficient → **Declare Bankruptcy** (assets to creditor/bank), elimination animation.

### 4.6 Jail
Jail modal at start of turn: Pay $50, Use card, Roll. After 3 failed tries, must pay then move.

### 4.7 World Events (optional)
Every 8 rounds banner slides in: effect description + affected tiles highlighted; lasts N rounds then expires.

### 4.8 Save/Resume
Autosave every action. Main Menu "Continue" loads last save. "Abandon game" requires confirmation.

## 5. Empty / Error States
- No save: Continue hidden.
- Corrupt save: toast "Save couldn't be loaded", offer New Game.
- Trade invalid (asset changed): disable Send and show reason.
- Tab hidden during bot turns: pause animations, resume on focus.

## 6. Navigation and Controls
Keyboard: `Space` roll/confirm, `B` buy, `A` auction, `T` trade, `M` manage, `Esc` close modal, `L` toggle log. Mobile: tap tile for card, long-press token for player info, pinch-zoom board.
