import type { BoardTile } from "./data.js";
export type PlayerId = string;
export type SpeedDieFace = 1 | 2 | 3 | "mr_tycoon" | "bus";
export type CharacterPerk = "rocket" | "camel" | "llama" | "globe" | "camera" | "suitcase";
export interface WorldEvent { id: string; name: string; description: string; roundsRemaining: number; colorGroup?: string; }
export type Phase = "ROLL" | "JAIL_DECISION" | "BUY_DECISION" | "POST_ROLL" | "AUCTION" | "DEBT" | "GAME_OVER";
export type Action =
  | { type: "ROLL_DICE"; dice?: [number, number] }
  | { type: "END_TURN" } | { type: "BUY_PROPERTY" } | { type: "DECLINE_PROPERTY" }
  | { type: "PAY_JAIL_FINE" } | { type: "USE_JAIL_CARD" }
  | { type: "BUILD"; tileIndex: number } | { type: "SELL_BUILDING"; tileIndex: number }
  | { type: "MORTGAGE"; tileIndex: number } | { type: "UNMORTGAGE"; tileIndex: number }
  | { type: "AUCTION_BID"; amount: number } | { type: "AUCTION_PASS" }
  | { type: "DECLARE_BANKRUPTCY" }
  | { type: "PROPOSE_TRADE"; toPlayerId: PlayerId; cash: number; propertyTileIndices: number[] }
  | { type: "ACCEPT_TRADE" } | { type: "DECLINE_TRADE" }
  | { type: "USE_CHARACTER_PERK"; targetPlayerId?: PlayerId };
export interface Player { id: PlayerId; name: string; token?: string; isBot?: boolean; characterPerk?: CharacterPerk; cash: number; position: number; inJail: boolean; jailTurns: number; getOutOfJailCards: number; bankrupt: boolean; consecutiveDoubles: number; characterPerkUsed: boolean; perkEffect?: "rent_shield" | "jail_immunity" | "lucky_doubles"; visitedTiles: number[]; }
export interface PropertyState { tileIndex: number; ownerId: PlayerId | null; houses: number; mortgaged: boolean; }
export interface GameSettings { startingCash: number; goSalary: number; auctionOnDecline: boolean; freeParkingJackpot: boolean; doubleGoBonus: boolean; speedDie: boolean; characterMode: boolean; worldEvents: boolean; funFacts: boolean; commentary: boolean; achievements: boolean; colorBlindMode: boolean; preset: "classic" | "party" | "quick_party"; mode: "classic" | "quick"; quickTargetNetWorth: number; maxRounds: number | null; seed: number; }
export interface Auction { tileIndex: number; highestBid: number; highestBidderId: PlayerId | null; passed: PlayerId[]; }
export interface TradeOffer { fromPlayerId: PlayerId; toPlayerId: PlayerId; cash: number; propertyTileIndices: number[]; }
export interface LogEntry { message: string; round: number; }
export interface GameState { players: Player[]; properties: Record<number, PropertyState>; currentPlayerId: PlayerId; phase: Phase; dice: [number, number, SpeedDieFace?] | null; chanceDeck: string[]; chestDeck: string[]; discard: { chance: string[]; chest: string[] }; houseSupply: number; hotelSupply: number; freeParkingPot: number; pendingAuction: Auction | null; pendingTrade: TradeOffer | null; activeEvents: WorldEvent[]; round: number; log: LogEntry[]; settings: GameSettings; rngState: number; winnerId: PlayerId | null; lastLandedTile: number | null; }
export interface GameEvent { type: string; [key: string]: unknown; }
export interface NewPlayer { id: PlayerId; name: string; token?: string; isBot?: boolean; }
export interface ReduceResult { state: GameState; events: GameEvent[]; }
export type TileLookup = (index: number) => BoardTile;
