// Re-export types needed across components
export type Screen = "menu" | "setup" | "lobby" | "game" | "help" | "stats" | "settings";
export type Modal = "property" | "card" | "auction" | "build" | "trade" | "debt" | "jail" | "settings" | null;
export type Theme = "day" | "night" | "neon";
export type AnimSpeed = "normal" | "fast" | "instant";

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  isBot: boolean;
  online: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  started: boolean;
  settings: Record<string, unknown>;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  ts: number;
}

export interface EmoteEvent {
  playerId: string;
  emote: string;
}
