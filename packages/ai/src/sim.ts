import { createGame, reduce, type GameState } from "@mwt/engine";
import { decide, profiles } from "./index.js";

const games = Number(process.argv[2] ?? 100);
const maxActions = 20000;
let totalActions = 0;
function assertInvariants(state: GameState): void {
  const playerIds = new Set(state.players.map((player) => player.id));
  for (const property of Object.values(state.properties)) {
    if (property.ownerId !== null && !playerIds.has(property.ownerId)) throw new Error("Property owner does not exist");
    if (property.houses < 0 || property.houses > 5) throw new Error("Property building count is out of range");
  }
  if (state.houseSupply < 0 || state.hotelSupply < 0) throw new Error("Building supply is negative");
  if (!playerIds.has(state.currentPlayerId)) throw new Error("Current player does not exist");
}
for (let gameNumber = 0; gameNumber < games; gameNumber += 1) {
  const botProfiles = profiles();
  let state: GameState = createGame(botProfiles.map((_, index) => ({ id: `bot-${index}`, name: `Bot ${index + 1}`, isBot: true })), {
    seed: 1000 + gameNumber, mode: "quick", maxRounds: 120
  });
  let actions = 0;
  while (state.phase !== "GAME_OVER" && actions < maxActions) {
    const profileIndex = Number(state.currentPlayerId.replace("bot-", ""));
    state = reduce(state, decide(state, state.currentPlayerId, botProfiles[profileIndex]!)).state;
    assertInvariants(state);
    actions += 1;
  }
  if (state.phase !== "GAME_OVER") throw new Error(`Simulation ${gameNumber + 1} exceeded ${maxActions} actions`);
  totalActions += actions;
}
console.log(`Simulated ${games} seeded bot-only games successfully (${totalActions} actions; average ${(totalActions / games).toFixed(1)}).`);
