import { useCallback, useEffect, useRef, useState } from "react";
import {
  board, createGame, getTile, reduce,
  type Action, type GameEvent, type GameSettings, type GameState, type Player,
} from "@mwt/engine";
import { decide, profiles, type BotProfile } from "@mwt/ai";
import type { Modal, Screen, Theme, RoomInfo, ChatMessage, EmoteEvent } from "./types.js";
import { multiplayerClient, createRoom, type GameStatePayload, type JoinedPayload } from "./multiplayer.js";
// ─── Constants ────────────────────────────────────────────
const SAVE_KEY = "mwt.save.v1";
const colors: Record<string, string> = board.colorGroups;
const TOKENS = ["🚀", "🐪", "🦙", "🌐", "📷", "🧳"];
const botProfiles: BotProfile[] = profiles();

function fmt(v: number): string { return `$${Math.max(0, v).toLocaleString()}`; }
function tileName(i: number): string { return getTile(i).name; }

// ─── Die pip layouts ──────────────────────────────────────
const PIP_LAYOUTS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, true, false, true, false, true, false, true, true],
};

// ─── Die component ────────────────────────────────────────
function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const pips = value ? PIP_LAYOUTS[value] ?? [] : [];
  return (
    <div className="die-wrap">
      <div className={`die ${rolling ? "rolling" : ""}`} aria-label={value ? `Die showing ${value}` : "Die"}>
        {value ? (
          <div className="die-pip-grid">
            {pips.map((active, i) => (
              <div key={i} className={`die-pip ${active ? "" : "hidden"}`} />
            ))}
          </div>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: "120%" }}>?</span>
        )}
      </div>
    </div>
  );
}

// ─── Toast system ─────────────────────────────────────────
interface ToastItem { id: number; text: string; kind: "info" | "success" | "error"; }
let toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const add = useCallback((text: string, kind: ToastItem["kind"] = "info") => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

// ─── Money float ──────────────────────────────────────────
interface MoneyFloat { id: number; text: string; gain: boolean; x: number; y: number; }
let floatId = 0;
function MoneyFloats({ floats }: { floats: MoneyFloat[] }) {
  return (
    <>
      {floats.map(f => (
        <div key={f.id} className={`money-float ${f.gain ? "gain" : "loss"}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
    </>
  );
}

// ─── App root ─────────────────────────────────────────────
function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("menu");
  const [state, setState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("mwt.theme") ?? "day") as Theme);
  const [muted, setMuted] = useState(() => localStorage.getItem("mwt.muted") === "true");
  const [animSpeed, setAnimSpeed] = useState<"normal" | "fast" | "instant">(() => (localStorage.getItem("mwt.speed") ?? "normal") as "normal" | "fast" | "instant");
  const [diceRolling, setDiceRolling] = useState(false);
  const [floats, setFloats] = useState<MoneyFloat[]>([]);
  const { toasts, add: addToast } = useToasts();

  // Multiplayer state
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [emoteEvents, setEmoteEvents] = useState<EmoteEvent[]>([]);

  const audioCtx = useRef<AudioContext | null>(null);
  const prevCash = useRef<Record<string, number>>({});

  // ─── Audio ─────────────────────────────────────────────
  const playTone = useCallback((freq: number, duration = 0.1, type: OscillatorType = "sine") => {
    if (muted) return;
    try {
      audioCtx.current ??= new AudioContext();
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, audioCtx.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.current.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.current.destination);
      osc.start();
      osc.stop(audioCtx.current.currentTime + duration);
    } catch { /* AudioContext may not be available */ }
  }, [muted]);

  const playDice = useCallback(() => {
    if (muted) return;
    [280, 350, 420].forEach((f, i) => setTimeout(() => playTone(f, 0.12, "sawtooth"), i * 80));
  }, [muted, playTone]);

  const playCash = useCallback(() => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.15), i * 60));
  }, [playTone]);

  // ─── Money float trigger ───────────────────────────────
  const spawnFloat = useCallback((text: string, gain: boolean) => {
    const x = window.innerWidth * 0.15 + Math.random() * 80;
    const y = 150 + Math.random() * 200;
    const id = ++floatId;
    setFloats(prev => [...prev.slice(-6), { id, text, gain, x, y }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500);
  }, []);

  // ─── Apply action ──────────────────────────────────────
  const apply = useCallback((action: Action): void => {
    if (!state) return;
    if (isMultiplayer && roomCode) {
      multiplayerClient.sendAction(roomCode, action);
      if (action.type === "ROLL_DICE") {
        setDiceRolling(true);
        playDice();
        setTimeout(() => setDiceRolling(false), animSpeed === "instant" ? 0 : 900);
      }
      return;
    }
    try {
      if (action.type === "ROLL_DICE") {
        setDiceRolling(true);
        playDice();
        setTimeout(() => {
          setDiceRolling(false);
          const result = reduce(state, action);
          applyResult(result.state, result.events);
        }, animSpeed === "instant" ? 0 : animSpeed === "fast" ? 400 : 900);
        return;
      }
      const result = reduce(state, action);
      applyResult(result.state, result.events);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "That action is not available.", "error");
    }
  }, [state, isMultiplayer, roomCode, playDice, animSpeed, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyResult = useCallback((newState: GameState, newEvents: GameEvent[]) => {
    // Detect cash changes for floats
    for (const player of newState.players) {
      const prev = prevCash.current[player.id] ?? player.cash;
      const diff = player.cash - prev;
      if (diff !== 0) spawnFloat(`${diff > 0 ? "+" : ""}${fmt(diff)}`, diff > 0);
      if (diff > 0) playCash();
    }
    prevCash.current = Object.fromEntries(newState.players.map(p => [p.id, p.cash]));

    setState(newState);
    setEvents(newEvents);

    const card = newEvents.find(e => e.type === "CARD_DRAWN");
    if (card) setModal("card");
    else if (newState.phase === "BUY_DECISION") setModal("property");
    else if (newState.phase === "AUCTION") setModal("auction");
    else if (newState.phase === "DEBT") setModal("debt");
    else setModal(null);

    if (!isMultiplayer) localStorage.setItem(SAVE_KEY, JSON.stringify(newState));
  }, [spawnFloat, playCash, isMultiplayer]);

  // ─── Start local game ──────────────────────────────────
  const startLocalGame = useCallback((settings: Partial<GameSettings>): void => {
    const players = [
      { id: "player-1", name: "You", token: TOKENS[0]!, isBot: false },
      { id: "bot-0", name: "Shark", token: TOKENS[1]!, isBot: true },
      { id: "bot-1", name: "Banker", token: TOKENS[2]!, isBot: true },
      { id: "bot-2", name: "Gambler", token: TOKENS[3]!, isBot: true },
    ];
    const newState = createGame(players, {
      startingCash: 1500, auctionOnDecline: true, freeParkingJackpot: false,
      doubleGoBonus: false, speedDie: false, characterMode: false, worldEvents: false,
      mode: "classic", ...settings,
      maxRounds: settings.mode === "quick" ? 120 : null,
      seed: Date.now(),
    });
    prevCash.current = Object.fromEntries(newState.players.map(p => [p.id, p.cash]));
    setState(newState); setScreen("game"); setModal(null); setEvents([]); setIsMultiplayer(false);
  }, []);

  // ─── Bot driver (local game only) ─────────────────────
  useEffect(() => {
    if (!state || screen !== "game" || state.phase === "GAME_OVER" || isMultiplayer || diceRolling) return;
    const current = state.players.find(p => p.id === state.currentPlayerId);
    if (!current?.isBot) return;
    const delay = animSpeed === "instant" ? 50 : animSpeed === "fast" ? 200 : 500;
    const timer = window.setTimeout(() => {
      try {
        const idx = Number(current.id.split("-")[1]) % botProfiles.length;
        const profile = botProfiles[idx]!;
        const action = decide(state, current.id, profile);
        if (action.type === "ROLL_DICE") {
          setDiceRolling(true);
          playDice();
          setTimeout(() => {
            setDiceRolling(false);
            try {
              const result = reduce(state, action);
              applyResult(result.state, result.events);
            } catch { /* skip bad bot action */ }
          }, animSpeed === "instant" ? 0 : animSpeed === "fast" ? 350 : 800);
        } else {
          try {
            const result = reduce(state, action);
            applyResult(result.state, result.events);
          } catch { /* skip bad bot action */ }
        }
      } catch { /* bot decide error */ }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, screen, isMultiplayer, diceRolling, animSpeed, applyResult, playDice]);

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "game" || !state) return;
      const humanId = isMultiplayer ? myPlayerId : "player-1";
      if (state.currentPlayerId !== humanId) return;
      if (e.key === "Escape") { setModal(null); return; }
      if (e.key === " " && state.phase === "ROLL") { e.preventDefault(); apply({ type: "ROLL_DICE" }); }
      if (e.key.toLowerCase() === "b" && state.phase === "BUY_DECISION") apply({ type: "BUY_PROPERTY" });
      if (e.key.toLowerCase() === "a" && state.phase === "BUY_DECISION") apply({ type: "DECLINE_PROPERTY" });
      if (e.key.toLowerCase() === "e" && state.phase === "POST_ROLL") apply({ type: "END_TURN" });
      if (e.key.toLowerCase() === "m" && state.phase === "POST_ROLL") setModal("build");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, screen, state, isMultiplayer, myPlayerId]);

  // ─── Multiplayer socket setup ──────────────────────────
  useEffect(() => {
    if (!isMultiplayer) return;
    multiplayerClient.connect({
      onConnect: () => addToast("Connected to server", "success"),
      onDisconnect: () => addToast("Disconnected from server", "error"),
      onJoined: (payload: JoinedPayload) => {
        setMyPlayerId(payload.playerId);
        setReconnectToken(payload.token);
        localStorage.setItem(`mwt.token.${payload.room.code}`, payload.token);
        setRoomInfo(payload.room);
        if (!payload.room.started) setScreen("lobby");
      },
      onRoomUpdated: (room: RoomInfo) => setRoomInfo(room),
      onRoomError: (msg: string) => addToast(msg, "error"),
      onGameState: (payload: GameStatePayload) => {
        prevCash.current = Object.fromEntries(payload.state.players.map(p => [p.id, p.cash]));
        applyResult(payload.state, payload.events);
        if (screen !== "game") setScreen("game");
      },
      onGameError: (msg: string) => addToast(msg, "error"),
      onChatMessage: (msg: ChatMessage) => setChatMessages(prev => [...prev.slice(-49), msg]),
      onEmote: (e: EmoteEvent) => { setEmoteEvents(prev => [...prev, e]); setTimeout(() => setEmoteEvents(prev => prev.filter(x => x !== e)), 2200); },
    });
    return () => { /* keep socket alive */ };
  }, [isMultiplayer, addToast, applyResult, screen]);

  const continueGame = () => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) throw new Error("No saved game yet.");
      const loaded = JSON.parse(saved) as GameState;
      prevCash.current = Object.fromEntries(loaded.players.map(p => [p.id, p.cash]));
      setState(loaded);
      setScreen("game");
      setIsMultiplayer(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Save could not be loaded.", "error");
    }
  };

  const handleCreateRoom = async () => {
    try {
      setIsMultiplayer(true);
      const { roomCode: code, token } = await createRoom();
      setRoomCode(code);
      setReconnectToken(token);
      localStorage.setItem(`mwt.token.${code}`, token);
      setScreen("lobby");
    } catch {
      setIsMultiplayer(false);
      addToast("Could not connect to server. Play locally?", "error");
    }
  };

  const handleJoinRoom = (code: string, playerName: string) => {
    setIsMultiplayer(true);
    setRoomCode(code.toUpperCase());
    const savedToken = localStorage.getItem(`mwt.token.${code.toUpperCase()}`);
    multiplayerClient.connect({
      onConnect: () => {
        multiplayerClient.joinRoom(code.toUpperCase(), playerName, savedToken ?? undefined);
      },
      onJoined: (payload: JoinedPayload) => {
        setMyPlayerId(payload.playerId);
        setRoomInfo(payload.room);
        setScreen("lobby");
      },
      onRoomUpdated: (room: RoomInfo) => setRoomInfo(room),
      onRoomError: (msg: string) => { addToast(msg, "error"); setIsMultiplayer(false); },
      onGameState: (payload: GameStatePayload) => {
        applyResult(payload.state, payload.events);
        if (screen !== "game") setScreen("game");
      },
      onGameError: (msg: string) => addToast(msg, "error"),
      onChatMessage: (msg: ChatMessage) => setChatMessages(prev => [...prev.slice(-49), msg]),
      onEmote: (e: EmoteEvent) => { setEmoteEvents(prev => [...prev, e]); setTimeout(() => setEmoteEvents(prev => prev.filter(x => x !== e)), 2200); },
      onDisconnect: () => addToast("Disconnected", "error"),
    });
  };

  // ─── Routing ────────────────────────────────────────────
  const appClass = `app${theme === "night" ? " night" : ""}`;

  if (screen === "menu") return (
    <div className={appClass}>
      <MainMenu
        onPlay={() => setScreen("setup")}
        onContinue={continueGame}
        onMultiplayer={handleCreateRoom}
        onJoin={() => setScreen("lobby")}
        hasSave={Boolean(localStorage.getItem(SAVE_KEY))}
        onHelp={() => setScreen("help")}
        onStats={() => setScreen("stats")}
        onSettings={() => setScreen("settings")}
      />
      <ToastStack toasts={toasts} />
    </div>
  );

  if (screen === "setup") return (
    <div className={appClass}>
      <Setup onStart={startLocalGame} onBack={() => setScreen("menu")} />
    </div>
  );

  if (screen === "lobby") return (
    <div className={appClass}>
      <Lobby
        room={roomInfo}
        myId={myPlayerId}
        code={roomCode}
        onReady={() => roomCode && multiplayerClient.toggleReady(roomCode)}
        onStart={(settings) => roomCode && multiplayerClient.startGame(roomCode, settings)}
        onJoin={handleJoinRoom}
        onBack={() => { setScreen("menu"); setIsMultiplayer(false); multiplayerClient.disconnect(); }}
      />
      <ToastStack toasts={toasts} />
    </div>
  );

  if (screen === "help") return (
    <div className={appClass}>
      <InfoScreen title="How to play" eyebrow="Guide" onBack={() => setScreen("menu")}>
        <p>Roll the dice, travel the world, and build a property empire! Land on a city to buy it, then charge rent when opponents visit. Collect complete color sets to double your rent.</p>
        <p><strong>Keyboard shortcuts:</strong> Space = Roll • B = Buy • A = Auction • E = End Turn • M = Manage buildings • Escape = Close modal</p>
        <p><strong>Multiplayer:</strong> Create a room and share the 6-letter code with friends. Up to 6 players; empty slots are filled by smart bots.</p>
      </InfoScreen>
    </div>
  );

  if (screen === "stats") return (
    <div className={appClass}>
      <InfoScreen title="Achievements & Stats" eyebrow="Records" onBack={() => setScreen("menu")}>
        <p>🏆 Jet Setter · 🏠 Landlord · 🎲 Escape Artist · 💰 Comeback Kid · 🏨 Hotel Mogul</p>
        <p>Your local games are saved on this device. Full achievement tracking arrives with the quality phase.</p>
      </InfoScreen>
    </div>
  );

  if (screen === "settings") return (
    <div className={appClass}>
      <InfoScreen title="Settings" eyebrow="Preferences" onBack={() => setScreen("menu")}>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="section-label">Display</div>
          <label className="toggle-row" style={{ cursor: "pointer" }}>
            <span>Dark mode</span>
            <input type="checkbox" className="toggle-input" checked={theme === "night"} onChange={e => {
              const t = e.target.checked ? "night" : "day";
              setTheme(t as Theme);
              localStorage.setItem("mwt.theme", t);
            }} />
            <span className="toggle-thumb" />
          </label>
          <div className="section-label">Audio</div>
          <label className="toggle-row" style={{ cursor: "pointer" }}>
            <span>Mute all sounds</span>
            <input type="checkbox" className="toggle-input" checked={muted} onChange={e => {
              setMuted(e.target.checked);
              localStorage.setItem("mwt.muted", String(e.target.checked));
            }} />
            <span className="toggle-thumb" />
          </label>
          <div className="section-label">Animation speed</div>
          <div className="segmented">
            {(["normal", "fast", "instant"] as const).map(s => (
              <button key={s} className={animSpeed === s ? "active" : ""} onClick={() => {
                setAnimSpeed(s);
                localStorage.setItem("mwt.speed", s);
              }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </InfoScreen>
    </div>
  );

  if (!state) return (
    <div className={appClass}>
      <MainMenu
        onPlay={() => setScreen("setup")}
        onContinue={continueGame}
        onMultiplayer={handleCreateRoom}
        onJoin={() => setScreen("lobby")}
        hasSave={false}
        onHelp={() => setScreen("help")}
        onStats={() => setScreen("stats")}
        onSettings={() => setScreen("settings")}
      />
    </div>
  );

  const humanId = isMultiplayer ? myPlayerId : "player-1";

  return (
    <div className={appClass}>
      <GameView
        state={state}
        events={events}
        modal={modal}
        setModal={setModal}
        apply={apply}
        onMenu={() => setScreen("menu")}
        onRematch={() => startLocalGame(state.settings)}
        diceRolling={diceRolling}
        humanId={humanId}
        isMultiplayer={isMultiplayer}
        roomCode={roomCode}
        chatMessages={chatMessages}
        emoteEvents={emoteEvents}
        reconnectToken={reconnectToken}
      />
      <MoneyFloats floats={floats} />
      <ToastStack toasts={toasts} />
    </div>
  );
}

// ─── Toast stack ──────────────────────────────────────────
function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind} anim-slide-up`}>{t.text}</div>
      ))}
    </div>
  );
}

// ─── Main Menu ────────────────────────────────────────────
function MainMenu(props: {
  onPlay: () => void;
  onContinue: () => void;
  onMultiplayer: () => void;
  onJoin: () => void;
  hasSave: boolean;
  onHelp: () => void;
  onStats: () => void;
  onSettings: () => void;
}) {
  return (
    <main className="menu page">
      <div className="menu-blob-1" />
      <div className="menu-blob-2" />
      <div className="menu-globe" aria-hidden="true">🌐</div>
      <div className="menu-multiplayer-badge">🌍 Now with Online Multiplayer</div>
      <p className="eyebrow menu-eyebrow">World Tour Tycoon</p>
      <h1 className="menu-heading">Build your<br /><span>global empire.</span></h1>
      <p className="menu-lead">A playful world-city property adventure for curious landlords. Play locally or online with friends.</p>
      <div className="menu-actions">
        <button className="btn btn-primary btn-lg" onClick={props.onPlay}>
          Play vs Bots <span>→</span>
        </button>
        <button className="btn btn-teal btn-lg" onClick={props.onMultiplayer}>
          🌐 Create Online Room
        </button>
        <button className="btn btn-secondary" onClick={props.onJoin}>
          🔗 Join Room with Code
        </button>
        {props.hasSave && (
          <button className="btn btn-secondary" onClick={props.onContinue}>
            ↩ Continue saved game
          </button>
        )}
        <button className="btn btn-ghost" onClick={props.onHelp}>How to play</button>
      </div>
      <div className="menu-links">
        <button onClick={props.onStats}>Achievements</button>
        <button onClick={props.onSettings}>Settings</button>
      </div>
      <footer className="menu-footer">Original travel game · No sign-up · Keyboard friendly</footer>
    </main>
  );
}

// ─── Setup ────────────────────────────────────────────────
function Setup({ onStart, onBack }: { onStart: (s: Partial<GameSettings>) => void; onBack: () => void }) {
  const [mode, setMode] = useState<GameSettings["mode"]>("classic");
  const [cash, setCash] = useState(1500);
  const [auction, setAuction] = useState(true);
  const [jackpot, setJackpot] = useState(false);
  const [doubleGo, setDoubleGo] = useState(false);

  const travelerInfo = [
    { token: TOKENS[0]!, name: "You", role: "Human", badgeClass: "badge-human" },
    { token: TOKENS[1]!, name: "Shark", role: "Hard Bot", badgeClass: "badge-hard" },
    { token: TOKENS[2]!, name: "Banker", role: "Normal Bot", badgeClass: "badge-normal" },
    { token: TOKENS[3]!, name: "Gambler", role: "Easy Bot", badgeClass: "badge-easy" },
  ];

  return (
    <main className="page">
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 24 }}>← Main menu</button>
      <div className="setup-header">
        <p className="eyebrow">Trip Planner</p>
        <h2>Set up your tour</h2>
        <p>Four travelers, one world, zero boring turns.</p>
      </div>
      <div className="setup-layout">
        <div className="panel">
          <div className="section-label">Game mode</div>
          <div className="segmented">
            {(["classic", "quick"] as const).map(m => (
              <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "classic" ? "🎩 Classic" : "⚡ Quick game"}
              </button>
            ))}
          </div>
          <div className="section-label">Starting cash</div>
          <div className="segmented">
            {[1000, 1500, 2500].map(c => (
              <button key={c} className={cash === c ? "active" : ""} onClick={() => setCash(c)}>
                {fmt(c)}
              </button>
            ))}
          </div>
          <div className="section-label">House rules</div>
          <ToggleRow label="Auction on decline" value={auction} onChange={setAuction} />
          <ToggleRow label="Free Parking jackpot" value={jackpot} onChange={setJackpot} />
          <ToggleRow label="Double GO bonus" value={doubleGo} onChange={setDoubleGo} />
        </div>
        <div className="panel">
          <div className="section-label">Your table</div>
          {travelerInfo.map(t => (
            <div className="traveler-row" key={t.name}>
              <span className="traveler-token">{t.token}</span>
              <div className="traveler-name">
                {t.name}
                <div className="traveler-sub">{t.role}</div>
              </div>
              <span className={`traveler-badge ${t.badgeClass}`}>{t.badgeClass === "badge-human" ? "HUMAN" : "BOT"}</span>
            </div>
          ))}
          <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 24 }}
            onClick={() => onStart({ mode, startingCash: cash, auctionOnDecline: auction, freeParkingJackpot: jackpot, doubleGoBonus: doubleGo })}>
            Start game →
          </button>
        </div>
      </div>
    </main>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row" style={{ cursor: "pointer" }}>
      <span>{label}</span>
      <input type="checkbox" className="toggle-input" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-thumb" />
    </label>
  );
}

// ─── Lobby (Online Multiplayer) ───────────────────────────
function Lobby(props: {
  room: RoomInfo | null;
  myId: string | null;
  code: string;
  onReady: () => void;
  onStart: (settings?: Partial<GameSettings>) => void;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}) {
  const [joinCode, setJoinCode] = useState(props.code || "");
  const [joinName, setJoinName] = useState(() => localStorage.getItem("mwt.name") ?? "");
  const [joined, setJoined] = useState(Boolean(props.room));

  if (!joined) {
    return (
      <main className="page">
        <button className="btn btn-ghost" onClick={props.onBack} style={{ marginBottom: 24 }}>← Back</button>
        <div className="setup-header">
          <p className="eyebrow">Online Play</p>
          <h2>Join a Room</h2>
        </div>
        <div className="panel" style={{ maxWidth: 400, margin: "0 auto" }}>
          <div className="section-label">Your name</div>
          <input className="chat-input" style={{ marginBottom: 12, width: "100%" }}
            value={joinName} onChange={e => { setJoinName(e.target.value); localStorage.setItem("mwt.name", e.target.value); }}
            placeholder="Enter your name" maxLength={20} />
          <div className="section-label">Room code</div>
          <input className="chat-input" style={{ marginBottom: 16, width: "100%", letterSpacing: "0.2em", textTransform: "uppercase" }}
            value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123" maxLength={6} />
          <button className="btn btn-primary" style={{ width: "100%" }}
            disabled={joinCode.length < 6 || !joinName.trim()}
            onClick={() => { props.onJoin(joinCode, joinName.trim()); setJoined(true); }}>
            Join Game
          </button>
        </div>
      </main>
    );
  }

  const room = props.room;
  const isHost = room?.hostId === props.myId;
  const myPlayer = room?.players.find(p => p.id === props.myId);
  const allReady = room?.players.every(p => p.ready || p.isBot);

  return (
    <main className="page">
      <button className="btn btn-ghost" onClick={props.onBack} style={{ marginBottom: 24 }}>← Leave room</button>
      <div className="setup-header">
        <p className="eyebrow">Online Room</p>
        <div className="lobby-code">{props.code || room?.code}</div>
        <p className="lobby-hint">Share this code with friends · Up to 6 players</p>
      </div>
      <div className="panel" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="section-label">Players ({room?.players.length ?? 0}/6)</div>
        <div className="lobby-players">
          {room?.players.map(p => (
            <div key={p.id} className={`lobby-player ${p.ready ? "ready" : ""} ${!p.online ? "offline" : ""}`}>
              <div className={`lobby-status-dot ${p.ready ? "dot-ready" : p.online ? "dot-online" : "dot-offline"}`} />
              <span style={{ flex: 1, fontWeight: 600 }}>
                {p.name}
                {p.id === props.myId && <span style={{ color: "var(--accent)", marginLeft: 6 }}>(You)</span>}
                {p.isBot && <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 12 }}>BOT</span>}
              </span>
              {p.ready && <span style={{ color: "var(--money)", fontSize: 12, fontWeight: 700 }}>READY ✓</span>}
              {!p.ready && p.online && <span style={{ color: "var(--muted)", fontSize: 12 }}>Waiting…</span>}
              {!p.online && <span style={{ color: "var(--muted)", fontSize: 12 }}>Offline</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!isHost && (
            <button className={`btn ${myPlayer?.ready ? "btn-secondary" : "btn-teal"}`} style={{ flex: 1 }} onClick={props.onReady}>
              {myPlayer?.ready ? "Cancel ready" : "✓ Ready"}
            </button>
          )}
          {isHost && (
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!allReady && (room?.players.filter(p => p.online).length ?? 0) < 1}
              onClick={() => props.onStart()}>
              {allReady ? "Start Game →" : "Start (fill with bots)"}
            </button>
          )}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          {isHost ? "You are the host. Empty slots will be filled with bots." : "Waiting for host to start…"}
        </p>
      </div>
    </main>
  );
}

// ─── Game View ────────────────────────────────────────────
function GameView(props: {
  state: GameState;
  events: GameEvent[];
  modal: Modal;
  setModal: (m: Modal) => void;
  apply: (a: Action) => void;
  onMenu: () => void;
  onRematch: () => void;
  diceRolling: boolean;
  humanId: string | null;
  isMultiplayer: boolean;
  roomCode: string;
  chatMessages: ChatMessage[];
  emoteEvents: EmoteEvent[];
  reconnectToken: string | null;
}) {
  const { state, events } = props;
  const current = state.players.find(p => p.id === state.currentPlayerId)!;
  const lastCard = events.find(e => e.type === "CARD_DRAWN");
  const isMyTurn = state.currentPlayerId === props.humanId;

  return (
    <div className="game-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <p className="eyebrow" style={{ marginBottom: 0 }}>World Tour Tycoon</p>
          <span className="topbar-round">Round {state.round}</span>
        </div>
        <div className="topbar-center">
          <div className="turn-pill">
            <span className="turn-pill-token">{current.token}</span>
            <span className="turn-pill-name">{current.name}'s turn</span>
            {isMyTurn && <span className="turn-pill-dot" />}
          </div>
        </div>
        <div className="topbar-actions">
          {props.isMultiplayer && props.reconnectToken && (
            <button className="btn btn-sm btn-secondary" onClick={() => {
              navigator.clipboard.writeText(props.roomCode).catch(() => null);
            }} title="Copy room code">
              📋 {props.roomCode}
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={props.onMenu} aria-label="Save and exit">
            💾 Exit
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="game-layout">
        {/* Left: Players */}
        <aside className="game-left">
          <div className="panel-header">Travelers</div>
          <div id="players-grid">
            {state.players.map(p => (
              <PlayerCard key={p.id} player={p} active={p.id === state.currentPlayerId} state={state} />
            ))}
          </div>
          <div className="jackpot-bar">
            <span>🅿️ Free Parking</span>
            <strong>{fmt(state.freeParkingPot)}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => props.setModal("build")} disabled={state.phase !== "POST_ROLL" || !isMyTurn}>
              🏗️ Build
            </button>
            <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => props.setModal("trade")} disabled={state.phase !== "POST_ROLL" || !isMyTurn}>
              🤝 Trade
            </button>
          </div>
          {props.isMultiplayer && (
            <div className="panel-header" style={{ marginTop: 12 }}>Emotes</div>
          )}
          {props.isMultiplayer && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["👋", "🎉", "😤", "💰", "😂", "🤝"].map(e => (
                <button key={e} className="btn-icon" style={{ fontSize: 18 }}
                  onClick={() => props.roomCode && multiplayerClient.sendEmote(props.roomCode, e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Center: Board */}
        <main className="game-center">
          <Board state={state} diceRolling={props.diceRolling} apply={props.apply}
            humanId={props.humanId} isMyTurn={isMyTurn} />
        </main>

        {/* Right: Log + Chat */}
        <aside className="game-right">
          <div className="panel-header">Game Log</div>
          <div className="log-scroll" aria-live="polite" style={{ maxHeight: 300 }}>
            {events.map((e, i) => (
              <div key={`ev-${i}`} className={`log-entry event-entry ${e.type === "PAYMENT_DUE" || e.type === "PASSED_GO" ? "money-event" : ""}`}>
                {e.type.replace(/_/g, " ").toLowerCase()}
              </div>
            ))}
            {state.log.slice(-20).reverse().map((entry, i) => (
              <div key={`log-${i}`} className="log-entry">{entry.message}</div>
            ))}
          </div>
          <div className="side-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => props.setModal("settings")}>⚙️ Settings</button>
          </div>
          {props.isMultiplayer && (
            <>
              <div className="panel-header" style={{ marginTop: 12 }}>Chat</div>
              <Chat messages={props.chatMessages} onSend={text => props.roomCode && multiplayerClient.sendChat(props.roomCode, text)} />
            </>
          )}
        </aside>
      </div>

      {/* Action bar */}
      <ActionBar state={state} apply={props.apply} humanId={props.humanId} />

      {/* Emote popups */}
      {props.emoteEvents.map((e, i) => {
        const p = state.players.find(p => p.id === e.playerId);
        return p ? (
          <div key={i} className="emote-popup" style={{ bottom: 100 + i * 60, right: 20 }}>
            {e.emote} <span style={{ fontSize: 14, color: "var(--muted)" }}>{p.name}</span>
          </div>
        ) : null;
      })}

      {/* Modals */}
      {props.modal && (
        <ModalView modal={props.modal} state={state} events={events} card={lastCard}
          setModal={props.setModal} apply={props.apply} />
      )}

      {/* Game over */}
      {state.phase === "GAME_OVER" && (
        <GameOver state={state} onRematch={props.onRematch} onMenu={props.onMenu} />
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="assertive">
        {state.phase === "ROLL" && isMyTurn ? "Your turn. Press Space to roll the dice." : `Phase: ${state.phase}`}
      </div>
    </div>
  );
}

// ─── Player Card ──────────────────────────────────────────
function PlayerCard({ player, active, state }: { player: Player; active: boolean; state: GameState }) {
  const ownedProps = Object.values(state.properties).filter(p => p.ownerId === player.id);
  return (
    <div className={`player-card ${active ? "active" : ""} ${player.bankrupt ? "bankrupt" : ""}`}
      aria-current={active ? "true" : undefined}>
      {active && <div className="active-indicator" />}
      <div className="player-card-top">
        <div className="player-avatar">{player.token ?? "🎮"}</div>
        <div className="player-info">
          <div className="player-name">{player.name}</div>
          <div className="player-sub">
            {player.isBot ? "🤖 Bot" : "👤 Human"}
            {player.inJail && " · 🔒 In Jail"}
          </div>
        </div>
        {player.bankrupt && <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700 }}>BANKRUPT</span>}
      </div>
      <div className="player-cash">{fmt(player.cash)}</div>
      <div className="player-chips">
        {ownedProps.slice(0, 10).map(p => (
          <div key={p.tileIndex} className="player-chip"
            style={{ background: colors[getTile(p.tileIndex).colorGroup ?? ""] ?? "#aaa" }}
            title={tileName(p.tileIndex)} />
        ))}
      </div>
      {player.getOutOfJailCards > 0 && (
        <div style={{ fontSize: 11, color: "var(--accent-2)", marginTop: 4 }}>
          🎫 ×{player.getOutOfJailCards} Get Out of Jail
        </div>
      )}
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────
function Board({ state, diceRolling, apply, humanId, isMyTurn }: {
  state: GameState;
  diceRolling: boolean;
  apply: (a: Action) => void;
  humanId: string | null;
  isMyTurn: boolean;
}) {
  // Map player positions to tiles (multiple per tile)
  const posMap = new Map<number, Player[]>();
  for (const p of state.players.filter(p => !p.bankrupt)) {
    const arr = posMap.get(p.position) ?? [];
    arr.push(p);
    posMap.set(p.position, arr);
  }

  return (
    <div className="board-wrap" role="grid" aria-label="Monopoly board">
      <div className="board-grid">
        {board.tiles.map(tile => {
          const players = posMap.get(tile.index) ?? [];
          const propState = state.properties[tile.index];

          // Determine tile side for CSS class
          const pos = tile.index;
          let sideClass = "";
          if (pos >= 1 && pos <= 9) sideClass = "tile-bottom";
          else if (pos >= 11 && pos <= 19) sideClass = "tile-left";
          else if (pos >= 21 && pos <= 29) sideClass = "tile-top";
          else if (pos >= 31 && pos <= 39) sideClass = "tile-right";
          else sideClass = "tile-corner-tile";

          const isCorner = [0, 10, 20, 30].includes(pos);

          return (
            <div
              key={tile.index}
              role="gridcell"
              aria-label={`${tile.name}${propState?.ownerId ? `, owned` : ""}${players.length > 0 ? `, ${players.map(p => p.name).join(", ")} here` : ""}`}
              className={`tile tile-pos-${tile.index} ${sideClass} ${isCorner ? "tile-corner-wrapper" : ""} ${propState?.mortgaged ? "mortgaged-tile" : ""}`}
              style={{ cursor: "default" }}
            >
              {/* Color band */}
              {tile.colorGroup && (
                <div className="tile-band" style={{ background: colors[tile.colorGroup] }} />
              )}

              {/* Corner tiles */}
              {isCorner ? (
                <div className="tile-corner">
                  {pos === 0 && <><span>⬅️</span><span className="tile-corner-label"><b>GO</b><br/><small style={{ fontSize: "70%", color: "var(--money)" }}>+$200</small></span></>}
                  {pos === 10 && <><span>🏛️</span><span className="tile-corner-label">JAIL<br/><small style={{ fontSize: "70%", color: "var(--muted)" }}>Visiting</small></span></>}
                  {pos === 20 && <><span>🅿️</span><span className="tile-corner-label">FREE<br/>PARK</span></>}
                  {pos === 30 && <><span>👮</span><span className="tile-corner-label">GO TO<br/>JAIL</span></>}
                </div>
              ) : (
                <div className="tile-body">
                  <div className="tile-type">{tile.type === "property" ? tile.country : tile.type.replace(/_/g, " ")}</div>
                  <div className="tile-name">{tile.name}</div>
                  {tile.price && <div className="tile-price">{fmt(tile.price)}</div>}
                  {/* Houses/hotel indicator */}
                  {propState && propState.houses > 0 && (
                    <div className="tile-houses">
                      {propState.houses === 5
                        ? <div className="tile-hotel" />
                        : Array.from({ length: propState.houses }).map((_, i) => <div key={i} className="tile-house" />)
                      }
                    </div>
                  )}
                  {/* Owner dot */}
                  {propState?.ownerId && (() => {
                    const owner = state.players.find(p => p.id === propState.ownerId);
                    const ownerTokenColors = ["#ff6b35", "#2ec4b6", "#9b5de5", "#f9d423"] as const;
                    const ownerIdx = state.players.findIndex(p => p.id === propState.ownerId);
                    return (
                      <div className="tile-owner-dot" style={{ background: ownerTokenColors[ownerIdx % 4] ?? "#aaa" }}
                        title={owner?.name ?? ""} />
                    );
                  })()}
                </div>
              )}

              {/* Player tokens */}
              {players.map((p, i) => (
                <div key={p.id} className="board-token anim-hop"
                  style={{
                    bottom: 2 + Math.floor(i / 2) * 18,
                    left: `${10 + (i % 2) * 45}%`,
                    transform: "translateX(-50%)",
                  }}
                  aria-label={`${p.name}'s token`}>
                  {p.token ?? "🎮"}
                </div>
              ))}
            </div>
          );
        })}

        {/* Board center */}
        <div className="board-center">
          <div className="board-logo">
            WORLD <span>TOUR</span>
            <br />
            <span style={{ fontSize: "0.7em", color: "var(--muted)" }}>TYCOON</span>
          </div>
          <div className="board-deck-row">
            <div className="board-deck board-deck-chance" title="Chance cards">? Chance</div>
            <div className="board-deck board-deck-chest" title="Community Chest cards">✦ Chest</div>
          </div>

          {/* Dice display */}
          <div className="dice-area">
            <Die value={state.dice?.[0] ?? null} rolling={diceRolling} />
            <Die value={state.dice?.[1] ?? null} rolling={diceRolling} />
          </div>

          {/* Roll button in center */}
          {state.phase === "ROLL" && isMyTurn && (
            <button className="dice-roll-btn" onClick={() => apply({ type: "ROLL_DICE" })} aria-label="Roll the dice">
              <span className="dice-emoji">🎲</span>
              <span className="dice-label">ROLL</span>
            </button>
          )}

          {/* Supply display */}
          <div className="board-supply">
            <span>🏠 {state.houseSupply}</span>
            <span>🏨 {state.hotelSupply}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Action Bar ───────────────────────────────────────────
function ActionBar({ state, apply, humanId }: { state: GameState; apply: (a: Action) => void; humanId: string | null }) {
  const isHuman = state.currentPlayerId === humanId;
  const disabled = !isHuman;
  const humanPlayer = state.players.find(p => p.id === humanId);
  const landedTile = getTile(state.lastLandedTile ?? 0);
  const landedPrice = landedTile.price ?? 0;

  return (
    <nav className="action-bar" aria-label="Game actions">
      <span className="action-phase">{state.phase.replace(/_/g, " ")}</span>

      {state.phase === "ROLL" && (
        <button className="btn btn-primary" disabled={disabled} onClick={() => apply({ type: "ROLL_DICE" })} aria-label="Roll dice">
          🎲 Roll dice
        </button>
      )}

      {state.phase === "JAIL_DECISION" && (
        <>
          <button className="btn btn-primary" disabled={disabled} onClick={() => apply({ type: "ROLL_DICE" })}>
            🎲 Roll for doubles
          </button>
          <button className="btn btn-secondary" disabled={disabled || (humanPlayer?.cash ?? 0) < 50}
            onClick={() => apply({ type: "PAY_JAIL_FINE" })}>
            💰 Pay $50
          </button>
          {(humanPlayer?.getOutOfJailCards ?? 0) > 0 && (
            <button className="btn btn-teal" disabled={disabled} onClick={() => apply({ type: "USE_JAIL_CARD" })}>
              🎫 Use card
            </button>
          )}
        </>
      )}

      {state.phase === "BUY_DECISION" && (
        <>
          <button className="btn btn-primary" disabled={disabled || (humanPlayer?.cash ?? 0) < landedPrice}
            onClick={() => apply({ type: "BUY_PROPERTY" })} aria-label={`Buy ${landedTile.name} for ${fmt(landedPrice)}`}>
            🏠 Buy {fmt(landedPrice)}
          </button>
          <button className="btn btn-secondary" disabled={disabled} onClick={() => apply({ type: "DECLINE_PROPERTY" })}>
            🔨 Auction
          </button>
        </>
      )}

      {state.phase === "POST_ROLL" && (
        <button className="btn btn-primary" disabled={disabled} onClick={() => apply({ type: "END_TURN" })}
          aria-label="End your turn">
          End turn →
        </button>
      )}

      {state.phase === "DEBT" && (
        <button className="btn btn-danger" disabled={disabled} onClick={() => apply({ type: "DECLARE_BANKRUPTCY" })}>
          🏳️ Declare bankruptcy
        </button>
      )}

      {state.phase === "AUCTION" && (
        <>
          <button className="btn btn-primary" disabled={disabled}
            onClick={() => apply({ type: "AUCTION_BID", amount: (state.pendingAuction?.highestBid ?? 0) + 10 })}>
            🔨 Bid +$10
          </button>
          <button className="btn btn-secondary" disabled={disabled} onClick={() => apply({ type: "AUCTION_PASS" })}>
            Pass
          </button>
        </>
      )}
    </nav>
  );
}

// ─── Modal wrapper ────────────────────────────────────────
function Modal({ title, eyebrow = "Travel Desk", close, children }: {
  title: string;
  eyebrow?: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal anim-bounce">
        <button className="modal-close" aria-label="Close dialog" onClick={close}>×</button>
        <p className="modal-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ─── Modal router ─────────────────────────────────────────
function ModalView(props: {
  modal: Modal;
  state: GameState;
  events: GameEvent[];
  card: GameEvent | undefined;
  setModal: (m: Modal) => void;
  apply: (a: Action) => void;
}) {
  if (!props.modal) return null;
  const close = () => props.setModal(null);

  if (props.modal === "property") {
    const tile = getTile(props.state.lastLandedTile ?? 0);
    const player = props.state.players.find(p => p.id === props.state.currentPlayerId);
    const canAfford = (player?.cash ?? 0) >= (tile.price ?? 0);
    return (
      <Modal title={tile.name} eyebrow={tile.country ?? tile.type} close={close}>
        {tile.colorGroup && (
          <div style={{ height: 8, background: colors[tile.colorGroup], borderRadius: 4, marginBottom: 12 }} />
        )}
        <div className="property-price">{fmt(tile.price ?? 0)}</div>
        {tile.funFact && <p>💡 {tile.funFact}</p>}
        {tile.rent && (
          <div className="rent-table">
            {tile.rent.map((r, i) => (
              <div key={i} className="rent-row">
                <span>{i === 0 ? "Base" : i === 5 ? "🏨 Hotel" : `🏠×${i}`}</span>
                <b>{fmt(r)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={!canAfford} onClick={() => props.apply({ type: "BUY_PROPERTY" })}>
            🏠 Buy property
          </button>
          <button className="btn btn-secondary" onClick={() => props.apply({ type: "DECLINE_PROPERTY" })}>
            🔨 Pass to auction
          </button>
        </div>
      </Modal>
    );
  }

  if (props.modal === "card") {
    const isChance = props.card?.cardId?.toString().startsWith("chance") ?? false;
    return (
      <Modal title="Travel Surprise" eyebrow={isChance ? "Chance Card" : "Community Chest"} close={close}>
        <div className={`card-flip ${isChance ? "card-flip-chance" : "card-flip-chest"} anim-bounce`}>
          {isChance ? "?" : "✦"}
        </div>
        <p>{props.card?.cardId ? "Your card has been applied! Keep traveling." : "The deck is ready."}</p>
        <button className="btn btn-primary" onClick={close}>Continue ✓</button>
      </Modal>
    );
  }

  if (props.modal === "auction") {
    const auction = props.state.pendingAuction!;
    const tile = getTile(auction.tileIndex);
    const player = props.state.players.find(p => p.id === props.state.currentPlayerId);
    const nextBid = (auction.highestBid ?? 0) + 10;
    const canBid = (player?.cash ?? 0) >= nextBid;
    return (
      <Modal title={tile.name} eyebrow="Open Auction" close={close}>
        <div className="auction-current">
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Current highest bid</div>
          <div className="auction-bid-amount">{fmt(auction.highestBid)}</div>
          {auction.highestBidderId && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              by {props.state.players.find(p => p.id === auction.highestBidderId)?.name}
            </div>
          )}
        </div>
        <div className="auction-bids-row">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!canBid}
            onClick={() => props.apply({ type: "AUCTION_BID", amount: nextBid })}>
            🔨 Bid {fmt(nextBid)}
          </button>
          <button className="btn btn-secondary" onClick={() => props.apply({ type: "AUCTION_PASS" })}>Pass</button>
        </div>
      </Modal>
    );
  }

  if (props.modal === "debt") {
    const player = props.state.players.find(p => p.id === props.state.currentPlayerId);
    const debt = Math.abs(Math.min(0, player?.cash ?? 0));
    return (
      <Modal title="Debt Checkpoint" eyebrow="💸 Financial Crisis" close={close}>
        <p>You owe {fmt(debt)} more than you have. Sell buildings or mortgage properties to raise cash.</p>
        <div className="debt-amount">{fmt(player?.cash ?? 0)}</div>
        <DebtAssets state={props.state} apply={props.apply} />
        <div className="modal-actions">
          <button className="btn btn-danger" style={{ width: "100%" }} onClick={() => props.apply({ type: "DECLARE_BANKRUPTCY" })}>
            🏳️ Declare Bankruptcy
          </button>
        </div>
      </Modal>
    );
  }

  if (props.modal === "build") return <BuildModal state={props.state} close={close} apply={props.apply} />;
  if (props.modal === "trade") return <TradeModal state={props.state} close={close} apply={props.apply} />;

  return (
    <Modal title="Settings" close={close}>
      <p>Settings are available from the main menu.</p>
      <button className="btn btn-secondary" onClick={close}>Done</button>
    </Modal>
  );
}

// ─── Debt assets ──────────────────────────────────────────
function DebtAssets({ state, apply }: { state: GameState; apply: (a: Action) => void }) {
  const player = state.players.find(p => p.id === state.currentPlayerId)!;
  const owned = Object.values(state.properties).filter(p => p.ownerId === player.id);
  return (
    <div className="debt-assets">
      {owned.map(prop => {
        const tile = getTile(prop.tileIndex);
        return (
          <div className="debt-asset-row" key={prop.tileIndex}>
            <span>{tile.name}</span>
            {prop.houses > 0 && (
              <button className="btn btn-sm btn-secondary" onClick={() => apply({ type: "SELL_BUILDING", tileIndex: prop.tileIndex })}>
                Sell house {fmt(Math.floor((tile.houseCost ?? 0) / 2))}
              </button>
            )}
            {!prop.mortgaged && prop.houses === 0 && (
              <button className="btn btn-sm btn-secondary" onClick={() => apply({ type: "MORTGAGE", tileIndex: prop.tileIndex })}>
                Mortgage {fmt(tile.mortgage ?? 0)}
              </button>
            )}
            {prop.mortgaged && <span style={{ color: "var(--muted)", fontSize: 12 }}>Mortgaged</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Build modal ──────────────────────────────────────────
function BuildModal({ state, close, apply }: { state: GameState; close: () => void; apply: (a: Action) => void }) {
  const player = state.players.find(p => p.id === state.currentPlayerId)!;
  const owned = Object.values(state.properties).filter(p => p.ownerId === player.id && getTile(p.tileIndex).type === "property");

  return (
    <Modal title="Manage Empire" eyebrow="Building Manager" close={close}>
      <p>Build evenly across complete color groups.</p>
      <div className="build-list">
        {owned.length === 0 && <p style={{ color: "var(--muted)" }}>No buildable properties yet.</p>}
        {owned.map(prop => {
          const tile = getTile(prop.tileIndex);
          return (
            <div className="build-row" key={prop.tileIndex}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[tile.colorGroup ?? ""] ?? "#aaa", flexShrink: 0 }} />
              <div className="build-row-info">
                <div className="build-row-name">{tile.name}</div>
                <div className="build-row-sub">
                  {prop.mortgaged ? "Mortgaged" : prop.houses === 5 ? "🏨 Hotel" : prop.houses === 0 ? "No buildings" : `🏠 × ${prop.houses}`}
                </div>
              </div>
              <div className="build-controls">
                <button className="icon-btn" disabled={state.phase !== "POST_ROLL" || prop.mortgaged || prop.houses >= 5}
                  onClick={() => apply({ type: "BUILD", tileIndex: prop.tileIndex })} title={`Build (${fmt(tile.houseCost ?? 0)})`}>+</button>
                <button className="icon-btn" disabled={prop.houses === 0}
                  onClick={() => apply({ type: "SELL_BUILDING", tileIndex: prop.tileIndex })} title="Sell">−</button>
                {!prop.mortgaged && prop.houses === 0 && (
                  <button className="icon-btn" onClick={() => apply({ type: "MORTGAGE", tileIndex: prop.tileIndex })} title={`Mortgage ${fmt(tile.mortgage ?? 0)}`}>M</button>
                )}
                {prop.mortgaged && (
                  <button className="icon-btn" onClick={() => apply({ type: "UNMORTGAGE", tileIndex: prop.tileIndex })} title="Unmortgage">U</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>🏠 {state.houseSupply} left · 🏨 {state.hotelSupply} left</span>
        <button className="btn btn-secondary btn-sm" onClick={close}>Done</button>
      </div>
    </Modal>
  );
}

// ─── Trade modal ──────────────────────────────────────────
function TradeModal({ state, close, apply }: { state: GameState; close: () => void; apply: (a: Action) => void }) {
  const player = state.players.find(p => p.id === "player-1") ?? state.players[0]!;
  const others = state.players.filter(p => p.id !== player.id && !p.bankrupt);
  const [partner, setPartner] = useState(others[0]?.id ?? "");
  const [cash, setCash] = useState(0);
  const myProps = Object.values(state.properties).filter(p => p.ownerId === player.id && p.houses === 0);
  const [propIdx, setPropIdx] = useState<number | null>(myProps[0]?.tileIndex ?? null);

  return (
    <Modal title="Make a Deal" eyebrow="Trade Desk" close={close}>
      <p>Offer a property and/or cash to another traveler.</p>
      <div className="section-label">Trade with</div>
      <select value={partner} onChange={e => setPartner(e.target.value)}
        style={{ display: "block", width: "100%", padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--bg2)", marginBottom: 12 }}>
        {others.map(p => <option key={p.id} value={p.id}>{p.token} {p.name}</option>)}
      </select>
      <div className="section-label">Your property (optional)</div>
      <select value={propIdx ?? ""} onChange={e => setPropIdx(e.target.value ? Number(e.target.value) : null)}
        style={{ display: "block", width: "100%", padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--bg2)", marginBottom: 12 }}>
        <option value="">— No property —</option>
        {myProps.map(p => <option key={p.tileIndex} value={p.tileIndex}>{tileName(p.tileIndex)}</option>)}
      </select>
      <div className="section-label">Cash offer</div>
      <input type="number" min={0} value={cash} onChange={e => setCash(Math.max(0, Number(e.target.value)))}
        aria-label="Cash offer"
        style={{ display: "block", width: "100%", padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--bg2)", marginBottom: 16 }} />
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={state.phase !== "POST_ROLL"}
        onClick={() => apply({ type: "PROPOSE_TRADE", toPlayerId: partner, cash, propertyTileIndices: propIdx !== null ? [propIdx] : [] })}>
        Send offer 🤝
      </button>
    </Modal>
  );
}

// ─── Chat ─────────────────────────────────────────────────
function Chat({ messages, onSend }: { messages: ChatMessage[]; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className="chat-msg">
            <span className="chat-msg-name">{m.playerName}: </span>
            <span className="chat-msg-text">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input-row">
        <input className="chat-input" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()} placeholder="Type a message…" maxLength={200} aria-label="Chat message" />
        <button className="btn btn-sm btn-secondary" onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ─── Game Over ────────────────────────────────────────────
function GameOver({ state, onRematch, onMenu }: { state: GameState; onRematch: () => void; onMenu: () => void }) {
  const winner = state.players.find(p => p.id === state.winnerId);
  return (
    <div className="gameover-backdrop">
      <div className="gameover-panel anim-bounce">
        <div className="gameover-confetti">✦ ✧ ✦ ✧ ✦</div>
        <div className="gameover-winner-token">{winner?.token ?? "🏆"}</div>
        <p className="eyebrow">Tour Complete</p>
        <h1 style={{ margin: "8px 0 12px" }}>{winner?.name ?? "The table"} wins!</h1>
        <p style={{ color: "var(--muted)" }}>The world is yours, one clever deal at a time.</p>
        <div className="gameover-actions">
          <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={onRematch}>🔄 Rematch</button>
          <button className="btn btn-secondary btn-lg" style={{ flex: 1 }} onClick={onMenu}>🏠 Menu</button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Screen ──────────────────────────────────────────
function InfoScreen({ title, eyebrow, onBack, children }: {
  title: string;
  eyebrow: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="page info-page">
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 24 }}>← Back</button>
      <p className="eyebrow">{eyebrow}</p>
      <h2 style={{ marginBottom: 20 }}>{title}</h2>
      <div className="panel prose">{children}</div>
    </main>
  );
}

export default App;
