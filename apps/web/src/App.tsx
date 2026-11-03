import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { board, createGame, getTile, reduce, type Action, type GameEvent, type GameSettings, type GameState, type Player } from "@mwt/engine";
import { decide, profiles, type BotProfile } from "@mwt/ai";

type Screen = "menu" | "setup" | "game" | "help" | "stats" | "settings";
type Modal = "property" | "card" | "auction" | "build" | "trade" | "debt" | "jail" | "settings" | null;
const SAVE_KEY = "mwt.save.v1";
const colors: Record<string, string> = board.colorGroups;
const tokens = ["🚀", "🐪", "🦙", "🌐", "📷", "🧳"];
const botProfiles: BotProfile[] = profiles();

function freshSettings(): Partial<GameSettings> {
  return { mode: "classic", startingCash: 1500, auctionOnDecline: true, freeParkingJackpot: false, doubleGoBonus: false, speedDie: false, characterMode: false, worldEvents: false, seed: Date.now() };
}

function formatMoney(value: number): string { return `$${Math.max(0, value).toLocaleString()}`; }
function tileName(index: number): string { return getTile(index).name; }

function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("menu");
  const [state, setState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [muted, setMuted] = useState(() => localStorage.getItem("mwt.muted") === "true");
  const audioContext = useRef<AudioContext | null>(null);

  const playSound = useCallback((frequency: number): void => {
    if (muted) return;
    audioContext.current ??= new AudioContext();
    const oscillator = audioContext.current.createOscillator();
    const gain = audioContext.current.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.035;
    oscillator.connect(gain); gain.connect(audioContext.current.destination);
    oscillator.start(); oscillator.stop(audioContext.current.currentTime + 0.08);
  }, [muted]);

  const apply = useCallback((action: Action): void => {
    if (!state) return;
    try {
      const result = reduce(state, action);
      setState(result.state);
      setEvents(result.events);
      playSound(action.type === "ROLL_DICE" ? 280 : 520);
      const card = result.events.find((event) => event.type === "CARD_DRAWN");
      if (card) setModal("card");
      else if (result.state.phase === "BUY_DECISION") setModal("property");
      else if (result.state.phase === "AUCTION") setModal("auction");
      else if (result.state.phase === "DEBT") setModal("debt");
      else setModal(null);
      localStorage.setItem(SAVE_KEY, JSON.stringify(result.state));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action is not available.");
    }
  }, [playSound, state]);

  const startGame = useCallback((settings: Partial<GameSettings>): void => {
    const players = [
      { id: "player-1", name: "You", token: tokens[0], isBot: false },
      { id: "bot-0", name: "Shark", token: tokens[1], isBot: true },
      { id: "bot-1", name: "Banker", token: tokens[2], isBot: true },
      { id: "bot-2", name: "Gambler", token: tokens[3], isBot: true }
    ];
    setState(createGame(players, { ...freshSettings(), ...settings }));
    setScreen("game"); setModal(null); setEvents([]); setToast("");
  }, []);

  useEffect(() => {
    if (!state || screen !== "game" || state.phase === "GAME_OVER") return;
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    if (!current?.isBot) return;
    const timer = window.setTimeout(() => {
      const profile = botProfiles[Number(current.id.split("-")[1]) % botProfiles.length]!;
      apply(decide(state, current.id, profile));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [apply, screen, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (screen !== "game" || !state || state.currentPlayerId !== "player-1") return;
      if (event.key === "Escape") setModal(null);
      if (event.key === " " && state.phase === "ROLL") { event.preventDefault(); apply({ type: "ROLL_DICE" }); }
      if (event.key.toLowerCase() === "b" && state.phase === "BUY_DECISION") apply({ type: "BUY_PROPERTY" });
      if (event.key.toLowerCase() === "a" && state.phase === "BUY_DECISION") apply({ type: "DECLINE_PROPERTY" });
      if (event.key.toLowerCase() === "m" && state.phase === "POST_ROLL") setModal("build");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, screen, state]);

  const continueGame = (): void => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) throw new Error("No saved game yet.");
      setState(JSON.parse(saved) as GameState);
      setScreen("game");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Save could not be loaded.");
    }
  };
  if (screen === "menu") return <MainMenu onPlay={() => setScreen("setup")} onContinue={continueGame} hasSave={Boolean(localStorage.getItem(SAVE_KEY))} onHelp={() => setScreen("help")} onStats={() => setScreen("stats")} onSettings={() => setScreen("settings")} toast={toast} />;
  if (screen === "setup") return <Setup onStart={startGame} onBack={() => setScreen("menu")} />;
  if (screen === "help") return <InfoScreen title="How to play" onBack={() => setScreen("menu")}><p>Roll, travel, buy cities, and build complete color groups. Doubles earn another roll. Land on an opponent to pay rent, and use the action bar to manage your empire.</p><p>Keyboard: Space to roll, B to buy, A to auction, M to manage, Esc to close.</p></InfoScreen>;
  if (screen === "stats") return <InfoScreen title="Achievements & stats" onBack={() => setScreen("menu")}><p>Jet Setter · First Purchase · Landlord · Escape Artist</p><p>Your local games are saved on this device. More stats arrive with the full quality phase.</p></InfoScreen>;
  if (screen === "settings") return <InfoScreen title="Settings" onBack={() => setScreen("menu")}><button className="button" onClick={() => { const next = theme === "day" ? "night" : "day"; setTheme(next); }}>Switch to {theme === "day" ? "night" : "day"} mode</button><button className="button secondary" onClick={() => { setMuted(!muted); localStorage.setItem("mwt.muted", String(!muted)); }}>{muted ? "Enable" : "Mute"} sounds</button></InfoScreen>;
  if (!state) return <MainMenu onPlay={() => setScreen("setup")} onContinue={() => setScreen("menu")} hasSave={false} onHelp={() => setScreen("help")} onStats={() => setScreen("stats")} onSettings={() => setScreen("settings")} toast="" />;
  return <div className={`app ${theme}`}><GameView state={state} events={events} modal={modal} setModal={setModal} apply={apply} toast={toast} onMenu={() => setScreen("menu")} onRematch={() => startGame(state.settings)} /></div>;
}

function MainMenu(props: { onPlay: () => void; onContinue: () => void; hasSave: boolean; onHelp: () => void; onStats: () => void; onSettings: () => void; toast: string }): JSX.Element {
  return <main className="menu page"><div className="globe">🌐</div><p className="eyebrow">WORLD TOUR TYCOON</p><h1>Build your<br /><span>global empire.</span></h1><p className="lead">A playful world-city property adventure for curious landlords.</p><div className="menu-actions"><button className="button primary" onClick={props.onPlay}>Play a new tour</button>{props.hasSave && <button className="button" onClick={props.onContinue}>Continue tour</button>}<button className="button ghost" onClick={props.onHelp}>How to play</button><div className="link-row"><button onClick={props.onStats}>Achievements</button><button onClick={props.onSettings}>Settings</button></div></div><footer>Original travel game · No sign-up · Keyboard friendly</footer>{props.toast && <div className="toast">{props.toast}</div>}</main>;
}

function Setup(props: { onStart: (settings: Partial<GameSettings>) => void; onBack: () => void }): JSX.Element {
  const [mode, setMode] = useState<GameSettings["mode"]>("classic");
  const [cash, setCash] = useState(1500);
  const [auction, setAuction] = useState(true);
  const [jackpot, setJackpot] = useState(false);
  const [doubleGo, setDoubleGo] = useState(false);
  return <main className="setup page"><button className="back" onClick={props.onBack}>← Main menu</button><div className="setup-header"><p className="eyebrow">TRIP PLANNER</p><h2>Set up your tour</h2><p>Four travelers, one world, zero boring turns.</p></div><section className="setup-grid"><div className="panel"><h3>Game mode</h3><div className="segmented"><button className={mode === "classic" ? "selected" : ""} onClick={() => setMode("classic")}>Classic</button><button className={mode === "quick" ? "selected" : ""} onClick={() => setMode("quick")}>Quick game</button></div><h3>Starting cash</h3><div className="segmented"><button className={cash === 1000 ? "selected" : ""} onClick={() => setCash(1000)}>$1,000</button><button className={cash === 1500 ? "selected" : ""} onClick={() => setCash(1500)}>$1,500</button><button className={cash === 2500 ? "selected" : ""} onClick={() => setCash(2500)}>$2,500</button></div><h3>House rules</h3><Toggle label="Auction on decline" value={auction} setValue={setAuction} /><Toggle label="Free Parking jackpot" value={jackpot} setValue={setJackpot} /><Toggle label="Double GO" value={doubleGo} setValue={setDoubleGo} /></div><div className="panel travelers"><h3>Your table</h3>{["You · Human", "Shark · Hard", "Banker · Normal", "Gambler · Easy"].map((name, index) => <div className="traveler" key={name}><span className="token">{tokens[index]}</span><span>{name}</span><span className="ready">READY</span></div>)}<button className="button primary start" onClick={() => props.onStart({ mode, startingCash: cash, auctionOnDecline: auction, freeParkingJackpot: jackpot, doubleGoBonus: doubleGo })}>Start game <span>→</span></button></div></section></main>;
}

function Toggle(props: { label: string; value: boolean; setValue: (value: boolean) => void }): JSX.Element { return <label className="toggle"><span>{props.label}</span><input type="checkbox" checked={props.value} onChange={(event) => props.setValue(event.target.checked)} /><i /></label>; }

function GameView(props: { state: GameState; events: GameEvent[]; modal: Modal; setModal: (modal: Modal) => void; apply: (action: Action) => void; toast: string; onMenu: () => void; onRematch: () => void }): JSX.Element {
  const { state } = props;
  const current = state.players.find((player) => player.id === state.currentPlayerId)!;
  const lastCard = props.events.find((event) => event.type === "CARD_DRAWN");
  return <main className="game-shell"><header className="topbar"><div><p className="eyebrow">WORLD TOUR TYCOON</p><strong>Round {state.round}</strong></div><div className="top-actions"><span className="turn-pill">{current.token} {current.name}'s turn</span><button aria-label="Save and exit" onClick={props.onMenu}>Save & exit</button></div></header><div className="game-layout"><aside className="players-panel"><h3>Travelers</h3>{state.players.map((player) => <PlayerPanel key={player.id} player={player} active={player.id === state.currentPlayerId} state={state} />)}<div className="jackpot">Free Parking <strong>{formatMoney(state.freeParkingPot)}</strong></div></aside><Board state={state} /><aside className="log-panel"><h3>Game log</h3><div className="log" aria-live="polite">{state.log.slice(-12).reverse().map((entry, index) => <p key={`${entry.round}-${index}`}>{entry.message}</p>)}{props.events.map((event, index) => <p key={`event-${index}`} className="event">{event.type.replaceAll("_", " ").toLowerCase()}</p>)}</div><div className="side-actions"><button className="button secondary" onClick={() => props.setModal("build")} disabled={state.phase !== "POST_ROLL"}>Manage empire</button><button className="button secondary" onClick={() => props.setModal("trade")} disabled={state.phase !== "POST_ROLL"}>Trade</button></div></aside></div><ActionBar state={state} apply={props.apply} /><div className="sr-only" aria-live="assertive">{state.phase === "ROLL" ? "Your turn. Roll the dice." : `${state.phase} phase.`}</div>{props.modal && <ModalView modal={props.modal} state={state} events={props.events} card={lastCard} setModal={props.setModal} apply={props.apply} />}{state.phase === "GAME_OVER" && <GameOver state={state} onRematch={props.onRematch} onMenu={props.onMenu} />}{props.toast && <div className="toast">{props.toast}</div>}</main>;
}

function PlayerPanel(props: { player: Player; active: boolean; state: GameState }): JSX.Element {
  const properties = Object.values(props.state.properties).filter((property) => property.ownerId === props.player.id);
  return <div className={`player-card ${props.active ? "active" : ""} ${props.player.bankrupt ? "bankrupt" : ""}`}><div className="player-line"><span className="token">{props.player.token}</span><strong>{props.player.name}</strong>{props.active && <span className="active-dot" />}</div><div className="cash">{formatMoney(props.player.cash)}</div><div className="property-chips">{properties.slice(0, 7).map((property) => <span key={property.tileIndex} style={{ background: colors[getTile(property.tileIndex).colorGroup ?? ""] ?? "#aaa" }} title={tileName(property.tileIndex)} />)}</div>{props.player.inJail && <small>🔒 In jail · {props.player.jailTurns}/3</small>}</div>;
}

function Board(props: { state: GameState }): JSX.Element {
  const positions = new Map(props.state.players.filter((player) => !player.bankrupt).map((player) => [player.position, player]));
  return <section className="board-wrap"><div className="board-center"><span className="board-logo">WORLD<br /><b>TOUR</b></span><span className="deck chance">?</span><span className="deck chest">✦</span><div className="dice-display">{props.state.dice ? `${props.state.dice[0]} + ${props.state.dice[1]}` : "ROLL"}</div></div><div className="board-grid">{board.tiles.map((tile) => { const player = positions.get(tile.index); return <button className={`tile tile-${tile.index} ${tile.type}`} key={tile.index} aria-label={`${tile.name}, tile ${tile.index}`}><span className="tile-band" style={{ background: tile.colorGroup ? colors[tile.colorGroup] : undefined }} /><small>{tile.type === "property" ? tile.country : tile.type.replace("_", " ")}</small><strong>{tile.name}</strong>{tile.price && <em>{formatMoney(tile.price)}</em>}{player && <span className="board-token">{player.token}</span>}</button>; })}</div></section>;
}

function ActionBar(props: { state: GameState; apply: (action: Action) => void }): JSX.Element {
  const human = props.state.currentPlayerId === "player-1";
  const disabled = !human;
  return <nav className="action-bar"><div className="phase-label">{props.state.phase.replaceAll("_", " ")}</div>{props.state.phase === "ROLL" && <button className="button primary action-primary" disabled={disabled} onClick={() => props.apply({ type: "ROLL_DICE" })}>🎲 Roll dice</button>}{props.state.phase === "BUY_DECISION" && <><button className="button primary" disabled={disabled} onClick={() => props.apply({ type: "BUY_PROPERTY" })}>Buy {formatMoney(getTile(props.state.lastLandedTile ?? 0).price ?? 0)}</button><button className="button" disabled={disabled} onClick={() => props.apply({ type: "DECLINE_PROPERTY" })}>Auction</button></>}{props.state.phase === "POST_ROLL" && <button className="button primary action-primary" disabled={disabled} onClick={() => props.apply({ type: "END_TURN" })}>End turn →</button>}{props.state.phase === "JAIL_DECISION" && <><button className="button primary" disabled={disabled} onClick={() => props.apply({ type: "ROLL_DICE" })}>Roll for doubles</button><button className="button" disabled={disabled} onClick={() => props.apply({ type: "PAY_JAIL_FINE" })}>Pay $50</button></>}{props.state.phase === "DEBT" && <button className="button danger" disabled={disabled} onClick={() => props.apply({ type: "DECLARE_BANKRUPTCY" })}>Declare bankruptcy</button>}</nav>;
}

function ModalView(props: { modal: Modal; state: GameState; events: GameEvent[]; card?: GameEvent; setModal: (modal: Modal) => void; apply: (action: Action) => void }): JSX.Element | null {
  if (!props.modal) return null;
  const close = () => props.setModal(null);
  if (props.modal === "property") { const tile = getTile(props.state.lastLandedTile ?? 0); return <Modal title={tile.name} close={close}><p className="modal-kicker">{tile.country ?? tile.type}</p><h2>{formatMoney(tile.price ?? 0)} to join the journey</h2><p>{tile.funFact ?? tile.flavor}</p>{tile.rent && <div className="rent-table">{tile.rent.map((rent, index) => <span key={index}>{index === 0 ? "Base" : index === 5 ? "Hotel" : `${index} house${index > 1 ? "s" : ""}`} <b>{formatMoney(rent)}</b></span>)}</div>}<div className="modal-actions"><button className="button primary" onClick={() => props.apply({ type: "BUY_PROPERTY" })}>Buy property</button><button className="button" onClick={() => props.apply({ type: "DECLINE_PROPERTY" })}>Pass to auction</button></div></Modal>; }
  if (props.modal === "card") return <Modal title="A travel surprise" close={close}><div className="card-art">✦</div><p>{props.card?.cardId ? "Your card effect has been applied. Keep traveling!" : "The deck is ready."}</p><button className="button primary" onClick={close}>Continue</button></Modal>;
  if (props.modal === "auction") return <Modal title="Open auction" close={close}><p>Bid on {tileName(props.state.pendingAuction?.tileIndex ?? 0)}.</p><h2>Current bid: {formatMoney(props.state.pendingAuction?.highestBid ?? 0)}</h2><div className="modal-actions"><button className="button primary" onClick={() => props.apply({ type: "AUCTION_BID", amount: (props.state.pendingAuction?.highestBid ?? 0) + 10 })}>Bid $10</button><button className="button" onClick={() => props.apply({ type: "AUCTION_PASS" })}>Pass</button></div></Modal>;
  if (props.modal === "jail") return <Modal title="Customs hold" close={close}><p>Roll doubles, pay $50, or use a Get Out of Jail Free card.</p><button className="button primary" onClick={() => props.apply({ type: "ROLL_DICE" })}>Roll</button></Modal>;
  if (props.modal === "debt") return <Modal title="Debt checkpoint" close={close}><p>You need to raise cash before the bank accepts your next move.</p><button className="button danger" onClick={() => props.apply({ type: "DECLARE_BANKRUPTCY" })}>Declare bankruptcy</button></Modal>;
  if (props.modal === "build") return <BuildModal state={props.state} close={close} apply={props.apply} />;
  if (props.modal === "trade") return <TradeModal state={props.state} close={close} apply={props.apply} />;
  return <Modal title="Settings" close={close}><p>Sound and theme settings are available from the menu.</p><button className="button" onClick={close}>Done</button></Modal>;
}

function BuildModal(props: { state: GameState; close: () => void; apply: (action: Action) => void }): JSX.Element {
  const player = props.state.players.find((item) => item.id === props.state.currentPlayerId)!;
  const owned = Object.values(props.state.properties).filter((property) => property.ownerId === player.id && getTile(property.tileIndex).type === "property");
  return <Modal title="Manage your empire" close={props.close}><p>Build evenly across complete color groups. Houses cost the tile's listed house cost.</p><div className="build-list">{owned.map((property) => { const tile = getTile(property.tileIndex); return <div className="build-row" key={property.tileIndex}><span><b>{tile.name}</b><small>{property.houses === 5 ? "Hotel" : `${property.houses} houses`}</small></span><button className="icon-button" disabled={props.state.phase !== "POST_ROLL"} onClick={() => props.apply({ type: "BUILD", tileIndex: property.tileIndex })}>＋</button><button className="icon-button" onClick={() => props.apply({ type: "SELL_BUILDING", tileIndex: property.tileIndex })}>−</button></div>; })}</div><button className="button secondary" onClick={props.close}>Done</button></Modal>;
}

function TradeModal(props: { state: GameState; close: () => void; apply: (action: Action) => void }): JSX.Element {
  const [partner, setPartner] = useState("bot-0");
  const [cash, setCash] = useState(0);
  const player = props.state.players.find((item) => item.id === "player-1")!;
  const properties = Object.values(props.state.properties).filter((property) => property.ownerId === player.id && property.houses === 0);
  const [tileIndex, setTileIndex] = useState<number | null>(properties[0]?.tileIndex ?? null);
  return <Modal title="Make a deal" close={props.close}><p>Offer a property and cash to another traveler.</p><select value={partner} onChange={(event) => setPartner(event.target.value)}>{props.state.players.filter((item) => item.id !== player.id && !item.bankrupt).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={tileIndex ?? ""} onChange={(event) => setTileIndex(event.target.value ? Number(event.target.value) : null)}><option value="">No property</option>{properties.map((property) => <option value={property.tileIndex} key={property.tileIndex}>{tileName(property.tileIndex)}</option>)}</select><input aria-label="Cash offer" type="number" min="0" value={cash} onChange={(event) => setCash(Number(event.target.value))} /><button className="button primary" disabled={props.state.phase !== "POST_ROLL"} onClick={() => props.apply({ type: "PROPOSE_TRADE", toPlayerId: partner, cash, propertyTileIndices: tileIndex === null ? [] : [tileIndex] })}>Send offer</button></Modal>;
}

function Modal(props: { title: string; close: () => void; children: React.ReactNode }): JSX.Element { return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" aria-label="Close dialog" onClick={props.close}>×</button><p className="eyebrow">TRAVEL DESK</p><h2>{props.title}</h2>{props.children}</div></div>; }

function GameOver(props: { state: GameState; onRematch: () => void; onMenu: () => void }): JSX.Element { const winner = props.state.players.find((player) => player.id === props.state.winnerId); return <div className="modal-backdrop"><div className="modal game-over"><div className="confetti">✦ ✧ ✦</div><p className="eyebrow">TOUR COMPLETE</p><h1>{winner?.name ?? "The table"} wins!</h1><p>The world is yours, one clever deal at a time.</p><button className="button primary" onClick={props.onRematch}>Rematch</button><button className="button" onClick={props.onMenu}>Main menu</button></div></div>; }

function InfoScreen(props: { title: string; onBack: () => void; children: React.ReactNode }): JSX.Element { return <main className="info page"><button className="back" onClick={props.onBack}>← Back</button><p className="eyebrow">WORLD TOUR TYCOON</p><h2>{props.title}</h2><section className="panel prose">{props.children}</section></main>; }

export default App;
