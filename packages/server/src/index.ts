import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as IOServer } from "socket.io";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { createGame, reduce, getLegalActions } from "@mwt/engine";
import type { Action, GameEvent, GameSettings, GameState } from "@mwt/engine";
import { decide, profiles } from "@mwt/ai";
import type { BotProfile } from "@mwt/ai";

const PORT = Number(process.env["PORT"] ?? 3001);
const ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";
const BOT_FILL_DELAY_MS = 60_000;
const BOT_TURN_DELAY_MS = 600;
const ROOM_EXPIRY_MS = 30 * 60 * 1_000;
const MAX_ACTIONS_PER_SECOND = 20;

interface RoomPlayer {
  id: string;
  name: string;
  reconnectToken: string;
  socketId: string | null;
  ready: boolean;
  isBot: boolean;
  disconnectedAt?: number;
  botProfile?: BotProfile;
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  state: GameState | null;
  settings: Partial<GameSettings>;
  lastActivity: number;
  botTimers: Map<string, NodeJS.Timeout>;
  actionCounts: Map<string, { count: number; resetAt: number }>;
}

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function roomInfo(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      isBot: p.isBot,
      online: p.socketId !== null,
    })),
    started: room.state !== null,
    settings: room.settings,
  };
}

const rooms = new Map<string, Room>();
const botProfileList = profiles();

const app = Fastify({ logger: false });
await app.register(cors, { origin: ORIGIN });

const httpServer = createServer(app.server as never);
const io = new IOServer(httpServer, {
  cors: { origin: ORIGIN, methods: ["GET", "POST"] },
});

// REST: create room
app.post("/rooms", async (_req, reply) => {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();
  const reconnectToken = randomUUID();
  const room: Room = {
    code,
    hostId: "pending",
    players: [],
    state: null,
    settings: {},
    lastActivity: Date.now(),
    botTimers: new Map(),
    actionCounts: new Map(),
  };
  rooms.set(code, room);
  return reply.send({ roomCode: code, token: reconnectToken });
});

// REST: get room info
app.get<{ Params: { code: string } }>("/rooms/:code", async (req, reply) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return reply.status(404).send({ error: "Room not found" });
  return reply.send(roomInfo(room));
});

function checkRateLimit(room: Room, playerId: string): boolean {
  const now = Date.now();
  const entry = room.actionCounts.get(playerId) ?? { count: 0, resetAt: now + 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 1000; }
  entry.count += 1;
  room.actionCounts.set(playerId, entry);
  return entry.count <= MAX_ACTIONS_PER_SECOND;
}

function scheduleBotTurn(room: Room, botId: string, delay = BOT_TURN_DELAY_MS) {
  if (room.botTimers.has(botId)) return;
  const timer = setTimeout(() => {
    room.botTimers.delete(botId);
    if (!room.state || room.state.currentPlayerId !== botId || room.state.phase === "GAME_OVER") return;
    const bot = room.players.find((p) => p.id === botId);
    if (!bot?.isBot) return;
    try {
      const profile = bot.botProfile ?? botProfileList[0]!;
      const action = decide(room.state, botId, profile);
      const result = reduce(room.state, action);
      room.state = result.state;
      room.lastActivity = Date.now();
      io.to(room.code).emit("game:state", { state: room.state, events: result.events });
      // If next player is also a bot, schedule them
      const next = room.state.currentPlayerId;
      const nextPlayer = room.players.find((p) => p.id === next);
      if (nextPlayer?.isBot && room.state.phase !== "GAME_OVER") {
        scheduleBotTurn(room, next, BOT_TURN_DELAY_MS);
      }
    } catch {
      // Bot action failed, skip
    }
  }, delay);
  room.botTimers.set(botId, timer);
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ code, playerName, token }: { code: string; playerName: string; token?: string }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit("room:error", { message: "Room not found" }); return; }
    if (room.state) {
      // Reconnect attempt
      const existing = room.players.find((p) => p.reconnectToken === token);
      if (existing) {
        existing.socketId = socket.id;
        delete existing.disconnectedAt;
        const fillTimer = room.botTimers.get(`fill:${existing.id}`);
        if (fillTimer) { clearTimeout(fillTimer); room.botTimers.delete(`fill:${existing.id}`); existing.isBot = false; }
        socket.join(room.code);
        socket.emit("room:joined", { room: roomInfo(room), playerId: existing.id, token: existing.reconnectToken });
        if (room.state) socket.emit("game:state", { state: room.state, events: [] });
        io.to(room.code).emit("room:updated", { room: roomInfo(room) });
        return;
      }
      socket.emit("room:error", { message: "Game already started" }); return;
    }
    if (room.players.length >= 6) { socket.emit("room:error", { message: "Room is full" }); return; }
    const playerId = `player-${room.players.length}`;
    const reconnectToken = randomUUID();
    const player: RoomPlayer = { id: playerId, name: playerName || `Player ${room.players.length + 1}`, reconnectToken, socketId: socket.id, ready: false, isBot: false };
    if (room.players.length === 0) room.hostId = playerId;
    room.players.push(player);
    socket.join(room.code);
    room.lastActivity = Date.now();
    socket.emit("room:joined", { room: roomInfo(room), playerId, token: reconnectToken });
    io.to(room.code).emit("room:updated", { room: roomInfo(room) });
  });

  socket.on("room:ready", ({ code }: { code: string }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.ready = !player.ready;
    io.to(room.code).emit("room:updated", { room: roomInfo(room) });
  });

  socket.on("room:start", ({ code, settings }: { code: string; settings?: Partial<GameSettings> }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || host.id !== room.hostId) { socket.emit("room:error", { message: "Only the host can start" }); return; }
    if (room.players.length < 1) { socket.emit("room:error", { message: "Need at least 1 player" }); return; }
    // Fill remaining slots with bots
    const botNames = ["Shark", "Banker", "Gambler", "Diplomat"];
    const tokens = ["🚀", "🐪", "🦙", "🌐", "📷", "🧳"];
    while (room.players.length < 4) {
      const idx = room.players.length;
      const botProfile = botProfileList[idx % botProfileList.length]!;
      room.players.push({
        id: `bot-${idx}`,
        name: botNames[idx % botNames.length]!,
        reconnectToken: randomUUID(),
        socketId: null,
        ready: true,
        isBot: true,
        botProfile,
      });
    }
    room.settings = settings ?? {};
    const newPlayers = room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      token: tokens[i % tokens.length] as string,
      isBot: p.isBot,
    }));
    try {
      room.state = createGame(newPlayers, { startingCash: 1500, auctionOnDecline: true, freeParkingJackpot: false, doubleGoBonus: false, speedDie: false, characterMode: false, worldEvents: false, mode: "classic", ...room.settings, seed: Date.now() });
      room.lastActivity = Date.now();
      io.to(room.code).emit("game:state", { state: room.state, events: [] });
      // Schedule bot turn if first player is bot
      const first = room.players.find((p) => p.id === room.state!.currentPlayerId);
      if (first?.isBot) scheduleBotTurn(room, first.id, BOT_TURN_DELAY_MS);
    } catch (err) {
      socket.emit("room:error", { message: err instanceof Error ? err.message : "Failed to start game" });
    }
  });

  socket.on("game:action", ({ code, action }: { code: string; action: Action }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || !room.state) { socket.emit("game:error", { message: "No active game" }); return; }
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) { socket.emit("game:error", { message: "Not in room" }); return; }
    if (!checkRateLimit(room, player.id)) { socket.emit("game:error", { message: "Too many actions" }); return; }
    if (room.state.currentPlayerId !== player.id) { socket.emit("game:error", { message: "Not your turn" }); return; }
    const legal = getLegalActions(room.state, player.id);
    if (!legal.some((a) => a.type === action.type)) { socket.emit("game:error", { message: "Action not legal" }); return; }
    try {
      const result = reduce(room.state, action);
      room.state = result.state;
      room.lastActivity = Date.now();
      io.to(room.code).emit("game:state", { state: room.state, events: result.events });
      // Schedule bot turn if needed
      const next = room.state.currentPlayerId;
      const nextPlayer = room.players.find((p) => p.id === next);
      if (nextPlayer?.isBot && room.state.phase !== "GAME_OVER") {
        scheduleBotTurn(room, next, BOT_TURN_DELAY_MS);
      }
    } catch (err) {
      socket.emit("game:error", { message: err instanceof Error ? err.message : "Invalid action" });
    }
  });

  socket.on("chat:message", ({ code, text }: { code: string; text: string }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const sanitized = String(text).slice(0, 200);
    io.to(room.code).emit("chat:message", { playerId: player.id, playerName: player.name, text: sanitized, ts: Date.now() });
  });

  socket.on("emote:send", ({ code, emote }: { code: string; emote: string }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const safe = ["👋", "🎉", "😤", "💰", "😂", "🤝"].includes(emote) ? emote : "👋";
    io.to(room.code).emit("emote:received", { playerId: player.id, emote: safe });
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) continue;
      player.socketId = null;
      player.disconnectedAt = Date.now();
      io.to(room.code).emit("room:updated", { room: roomInfo(room) });
      // Schedule bot fill after 60s
      const timer = setTimeout(() => {
        room.botTimers.delete(`fill:${player.id}`);
        if (player.socketId !== null) return; // reconnected
        player.isBot = true;
        const profile = botProfileList[Math.floor(Math.random() * botProfileList.length)]!;
        player.botProfile = profile;
        io.to(room.code).emit("room:updated", { room: roomInfo(room) });
        if (room.state && room.state.currentPlayerId === player.id) {
          scheduleBotTurn(room, player.id, 1000);
        }
      }, BOT_FILL_DELAY_MS);
      room.botTimers.set(`fill:${player.id}`, timer);
      break;
    }
  });
});

// Cleanup expired rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      for (const timer of room.botTimers.values()) clearTimeout(timer);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1_000);

const address = await new Promise<string>((resolve, reject) => {
  httpServer.listen(PORT, () => resolve(`http://localhost:${PORT}`));
  httpServer.on("error", reject);
});

console.log(`🌐 MWT server running at ${address}`);

