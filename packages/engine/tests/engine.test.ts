import { describe, expect, it } from "vitest";
import { board, cards, createGame, getLegalActions, reduce } from "../src/index.js";

const players = [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }];
const roll = (state: ReturnType<typeof createGame>, dice: [number, number]) => reduce(state, { type: "ROLL_DICE", dice }).state;

describe("validated game data", () => {
  it("loads the complete board and decks", () => {
    expect(board.tiles).toHaveLength(40);
    expect(new Set(board.tiles.map((tile) => tile.index)).size).toBe(40);
    expect(cards).toHaveLength(32);
  });
});

describe("game lifecycle", () => {
  it("creates deterministic games with the configured starting state", () => {
    const state = createGame(players, { seed: 42 });
    expect(state.players.map((player) => player.cash)).toEqual([1500, 1500]);
    expect(state.chanceDeck).toEqual(createGame(players, { seed: 42 }).chanceDeck);
    expect(getLegalActions(state, "p1")).toEqual([{ type: "ROLL_DICE" }]);
  });

  it("pays salary when passing GO and offers an unowned property", () => {
    const result = reduce(createGame(players), { type: "ROLL_DICE", dice: [1, 1] });
    expect(result.state.players[0]?.position).toBe(2);
    const state = roll(createGame(players), [2, 1]);
    expect(state.players[0]?.position).toBe(3);
    expect(state.phase).toBe("BUY_DECISION");
    const bought = reduce(state, { type: "BUY_PROPERTY" }).state;
    expect(bought.properties[3]?.ownerId).toBe("p1");
    expect(bought.players[0]?.cash).toBe(1440);
  });

  it("handles triple doubles by sending the player to jail", () => {
    let state = createGame(players, { auctionOnDecline: false });
    state = roll(state, [2, 2]);
    state = roll(state, [2, 2]);
    state = reduce(state, { type: "DECLINE_PROPERTY" }).state;
    state = roll(state, [2, 2]);
    expect(state.players[0]?.inJail).toBe(true);
    expect(state.players[0]?.position).toBe(10);
  });

  it("charges rent and applies the monopoly zero-building bonus", () => {
    let state = createGame(players);
    state = roll(state, [1, 2]);
    state = reduce(state, { type: "BUY_PROPERTY" }).state;
    state = reduce(state, { type: "END_TURN" }).state;
    state = roll(state, [1, 2]);
    expect(state.players[0]?.cash).toBe(1444);
  });

  it("supports taxes, jail decisions, building, mortgage and unmortgage", () => {
    let state = createGame(players);
    state = roll(state, [1, 2]);
    state = reduce(state, { type: "BUY_PROPERTY" }).state;
    state = reduce(state, { type: "MORTGAGE", tileIndex: 3 }).state;
    expect(() => reduce(state, { type: "MORTGAGE", tileIndex: 3 })).toThrow();
    state = { ...state, currentPlayerId: "p2", phase: "ROLL" };
    state = roll(state, [2, 2]);
    expect(state.phase).toBe("ROLL");
  });

  it("draws cards and applies direct effects", () => {
    let state = createGame(players, { seed: 7 });
    state = { ...state, currentPlayerId: "p1" };
    const result = reduce(state, { type: "ROLL_DICE", dice: [1, 1] });
    expect(result.events.some((item) => item.type === "CARD_DRAWN")).toBe(true);
  });
});
