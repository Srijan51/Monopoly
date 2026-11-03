import { io, type Socket } from "socket.io-client";
import type { Action, GameEvent, GameSettings, GameState } from "@mwt/engine";
import type { RoomInfo, ChatMessage, EmoteEvent } from "./types.js";

// Vite injects import.meta.env at build time; fall back to localhost for tests
const SERVER_URL: string = (() => {
  try {
    // @ts-expect-error vite env
    const env = import.meta?.env as Record<string, string> | undefined;
    return env?.["VITE_SERVER_URL"] ?? "http://localhost:3001";
  } catch {
    return "http://localhost:3001";
  }
})();

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
  }
  return socket;
}

export interface JoinedPayload {
  room: RoomInfo;
  playerId: string;
  token: string;
}

export interface GameStatePayload {
  state: GameState;
  events: GameEvent[];
}

export interface MultiplayerCallbacks {
  onJoined: (payload: JoinedPayload) => void;
  onRoomUpdated: (room: RoomInfo) => void;
  onRoomError: (message: string) => void;
  onGameState: (payload: GameStatePayload) => void;
  onGameError: (message: string) => void;
  onChatMessage: (msg: ChatMessage) => void;
  onEmote: (e: EmoteEvent) => void;
  onDisconnect: () => void;
  onConnect: () => void;
}

export const multiplayerClient = {
  connect(callbacks: MultiplayerCallbacks) {
    const s = getSocket();
    s.off(); // Remove old listeners
    s.on("connect", callbacks.onConnect);
    s.on("disconnect", callbacks.onDisconnect);
    s.on("room:joined", callbacks.onJoined);
    s.on("room:updated", ({ room }: { room: RoomInfo }) => callbacks.onRoomUpdated(room));
    s.on("room:error", ({ message }: { message: string }) => callbacks.onRoomError(message));
    s.on("game:state", callbacks.onGameState);
    s.on("game:error", ({ message }: { message: string }) => callbacks.onGameError(message));
    s.on("chat:message", callbacks.onChatMessage);
    s.on("emote:received", callbacks.onEmote);
    if (!s.connected) s.connect();
  },
  disconnect() {
    socket?.disconnect();
    socket = null;
  },
  joinRoom(code: string, playerName: string, token?: string) {
    getSocket().emit("room:join", { code, playerName, token });
  },
  toggleReady(code: string) {
    getSocket().emit("room:ready", { code });
  },
  startGame(code: string, settings?: Partial<GameSettings>) {
    getSocket().emit("room:start", { code, settings });
  },
  sendAction(code: string, action: Action) {
    getSocket().emit("game:action", { code, action });
  },
  sendChat(code: string, text: string) {
    getSocket().emit("chat:message", { code, text });
  },
  sendEmote(code: string, emote: string) {
    getSocket().emit("emote:send", { code, emote });
  },
  isConnected(): boolean {
    return socket?.connected ?? false;
  },
};

export async function createRoom(): Promise<{ roomCode: string; token: string }> {
  const res = await fetch(`${SERVER_URL}/rooms`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create room");
  return res.json() as Promise<{ roomCode: string; token: string }>;
}
