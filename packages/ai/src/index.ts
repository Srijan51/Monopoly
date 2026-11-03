import { board, getTile, type Action, type GameState, type PlayerId } from "@mwt/engine";

export type BotPersonality = "shark" | "banker" | "gambler" | "diplomat";
export type Difficulty = "easy" | "normal" | "hard";
export interface BotProfile { personality: BotPersonality; difficulty: Difficulty; }
export interface IncomingTrade { fromPlayerId: PlayerId; toPlayerId: PlayerId; cash: number; propertyTileIndices: number[]; }

const reserveByDifficulty: Record<Difficulty, number> = { easy: 100, normal: 180, hard: 250 };
const personalityMultiplier: Record<BotPersonality, number> = { shark: 1.15, banker: 0.8, gambler: 1.05, diplomat: 0.9 };

function playerFor(state: GameState, playerId: PlayerId) {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error(`Unknown bot player: ${playerId}`);
  return player;
}

function ownedProperties(state: GameState, playerId: PlayerId) {
  return Object.values(state.properties).filter((property) => property.ownerId === playerId);
}

export function evaluateTrade(state: GameState, playerId: PlayerId, offer: IncomingTrade): number {
  if (offer.toPlayerId !== playerId) return Number.NEGATIVE_INFINITY;
  const propertyValue = offer.propertyTileIndices.reduce((total, tileIndex) => total + (getTile(tileIndex).price ?? 0), 0);
  const completesGroup = offer.propertyTileIndices.some((tileIndex) => {
    const tile = getTile(tileIndex);
    return tile.type === "property" && board.tiles.filter((candidate) => candidate.type === "property" && candidate.colorGroup === tile.colorGroup)
      .every((candidate) => candidate.index === tileIndex || state.properties[candidate.index]?.ownerId === playerId);
  });
  return offer.cash + propertyValue + (completesGroup ? 100 : 0);
}

function chooseBuild(state: GameState, playerId: PlayerId, profile: BotProfile): Action | null {
  const player = playerFor(state, playerId);
  if (profile.personality === "banker" && player.cash < reserveByDifficulty[profile.difficulty] * 2) return null;
  const candidates = ownedProperties(state, playerId)
    .map((property) => ({ property, tile: getTile(property.tileIndex) }))
    .filter(({ property, tile }) => (
      tile.type === "property"
      && property.houses < 5
      && !property.mortgaged
      && (tile.houseCost ?? 0) <= player.cash - reserveByDifficulty[profile.difficulty]
    ))
    .sort((a, b) => (b.tile.rent?.[a.property.houses + 1] ?? 0) - (a.tile.rent?.[b.property.houses + 1] ?? 0));
  const candidate = candidates[0];
  if (!candidate) return null;
  const group = board.tiles.filter((tile) => tile.type === "property" && tile.colorGroup === candidate.tile.colorGroup);
  if (!group.every((tile) => state.properties[tile.index]?.ownerId === playerId)) return null;
  const lowestHouses = Math.min(...group.map((tile) => state.properties[tile.index]?.houses ?? 0));
  if (candidate.property.houses > lowestHouses) return null;
  return { type: "BUILD", tileIndex: candidate.property.tileIndex };
}

function buyAction(state: GameState, profile: BotProfile): Action {
  const player = playerFor(state, state.currentPlayerId);
  const tile = getTile(player.position);
  const price = tile.price ?? 0;
  const reserve = reserveByDifficulty[profile.difficulty];
  const willingness = Math.floor(player.cash * personalityMultiplier[profile.personality]);
  return willingness >= price + reserve ? { type: "BUY_PROPERTY" } : { type: "DECLINE_PROPERTY" };
}

function auctionAction(state: GameState, profile: BotProfile): Action {
  const auction = state.pendingAuction;
  if (!auction) throw new Error("Auction phase without an auction");
  const player = playerFor(state, state.currentPlayerId);
  const tile = getTile(auction.tileIndex);
  const reserve = reserveByDifficulty[profile.difficulty];
  const valuation = Math.floor((tile.price ?? 0) * personalityMultiplier[profile.personality]);
  const increment = profile.difficulty === "easy" ? 10 : profile.difficulty === "normal" ? 25 : 50;
  const nextBid = Math.max(10, auction.highestBid + increment);
  return nextBid <= Math.min(valuation, player.cash - reserve) ? { type: "AUCTION_BID", amount: nextBid } : { type: "AUCTION_PASS" };
}

export function decide(state: GameState, playerId: PlayerId, profile: BotProfile): Action {
  if (state.currentPlayerId !== playerId) throw new Error("Bot cannot act outside its turn");
  const player = playerFor(state, playerId);
  if (state.pendingTrade?.toPlayerId === playerId) {
    return evaluateTrade(state, playerId, state.pendingTrade) >= 0 ? { type: "ACCEPT_TRADE" } : { type: "DECLINE_TRADE" };
  }
  if (state.phase === "ROLL") return { type: "ROLL_DICE" };
  if (state.phase === "JAIL_DECISION") {
    if (profile.personality === "banker" && player.getOutOfJailCards > 0) return { type: "USE_JAIL_CARD" };
    if (player.cash >= 50 && (player.jailTurns >= 2 || profile.personality !== "banker")) return { type: "PAY_JAIL_FINE" };
    return { type: "ROLL_DICE" };
  }
  if (state.phase === "BUY_DECISION") return buyAction(state, profile);
  if (state.phase === "AUCTION") return auctionAction(state, profile);
  if (state.phase === "DEBT") {
    if (player.cash >= 0) return { type: "END_TURN" };
    const building = ownedProperties(state, playerId).find((property) => property.houses > 0);
    if (building) return { type: "SELL_BUILDING", tileIndex: building.tileIndex };
    const mortgage = ownedProperties(state, playerId).find((property) => !property.mortgaged && property.houses === 0);
    if (mortgage) return { type: "MORTGAGE", tileIndex: mortgage.tileIndex };
    return { type: "DECLARE_BANKRUPTCY" };
  }
  if (state.phase === "POST_ROLL") return chooseBuild(state, playerId, profile) ?? { type: "END_TURN" };
  throw new Error(`No bot action for phase ${state.phase}`);
}

export function profiles(): BotProfile[] {
  return [
    { personality: "shark", difficulty: "hard" },
    { personality: "banker", difficulty: "normal" },
    { personality: "gambler", difficulty: "easy" },
    { personality: "diplomat", difficulty: "normal" }
  ];
}
