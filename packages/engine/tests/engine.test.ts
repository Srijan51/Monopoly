import { describe, expect, it } from "vitest";
import { board, cards, createGame, getLegalActions, reduce } from "@mwt/engine";

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
    expect(() => createGame([{ id: "p1", name: "One" }])).toThrow();
    expect(() => createGame([{ id: "p1", name: "One" }, { id: "p1", name: "Two" }])).toThrow();
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

  it("handles double GO bonus if enabled", () => {
    let state = createGame(players, { doubleGoBonus: true });
    state.players[0]!.position = 38;
    state = roll(state, [1, 1]);
    expect(state.players[0]!.position).toBe(0);
    expect(state.players[0]!.cash).toBe(1900);
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

  it("charges rent on railroads and utilities", () => {
    let state = createGame(players);
    // Give p1 Trans-Siberian Railway (tile 5)
    state.properties[5]!.ownerId = "p1";
    state.currentPlayerId = "p2";
    state.phase = "ROLL";
    state = roll(state, [2, 3]); // lands on 5
    expect(state.players[1]!.cash).toBe(1475);
    expect(state.players[0]!.cash).toBe(1525);

    // Give p1 Solar Farm (utility tile 12)
    state.properties[12]!.ownerId = "p1";
    state.currentPlayerId = "p2";
    state.phase = "ROLL";
    state.players[1]!.position = 5;
    state = roll(state, [3, 4]); // lands on 12 with diceTotal 7 -> 7 * 4 = 28
    expect(state.players[1]!.cash).toBe(1475 - 28);
  });

  it("handles taxes and free parking jackpot", () => {
    let state = createGame(players, { freeParkingJackpot: true });
    state.players[0]!.position = 2;
    state = roll(state, [1, 1]); // lands on 4 (Travel Tax $200)
    expect(state.players[0]!.cash).toBe(1300);
    expect(state.freeParkingPot).toBe(200);

    // Land on Free Parking (tile 20)
    state.players[0]!.position = 18;
    state = roll(state, [1, 1]); // lands on 20
    expect(state.players[0]!.cash).toBe(1500);
    expect(state.freeParkingPot).toBe(0);
  });

  it("handles landing on go to jail tile", () => {
    let state = createGame(players);
    state.players[0]!.position = 28;
    state = roll(state, [1, 1]); // lands on tile 30 (go_to_jail)
    expect(state.players[0]!.inJail).toBe(true);
    expect(state.players[0]!.position).toBe(10);
  });

  it("supports mortgage and unmortgage", () => {
    let state = createGame(players);
    state = roll(state, [1, 2]);
    state = reduce(state, { type: "BUY_PROPERTY" }).state;
    state = reduce(state, { type: "MORTGAGE", tileIndex: 3 }).state;
    expect(() => reduce(state, { type: "MORTGAGE", tileIndex: 3 })).toThrow();
    state = reduce(state, { type: "UNMORTGAGE", tileIndex: 3 }).state;
    expect(state.properties[3]?.mortgaged).toBe(false);

    state = { ...state, currentPlayerId: "p2", phase: "ROLL" };
    state = roll(state, [2, 2]);
    expect(state.phase).toBe("ROLL");
  });

  it("handles jail payment, cards, and turns", () => {
    let state = createGame(players);
    state.players[0]!.inJail = true;
    state.phase = "JAIL_DECISION";

    expect(getLegalActions(state, "p1")).toEqual([
      { type: "ROLL_DICE" },
      { type: "PAY_JAIL_FINE" }
    ]);

    const paid = reduce(state, { type: "PAY_JAIL_FINE" }).state;
    expect(paid.players[0]!.inJail).toBe(false);
    expect(paid.players[0]!.cash).toBe(1450);

    state.players[0]!.getOutOfJailCards = 1;
    const usedCard = reduce(state, { type: "USE_JAIL_CARD" }).state;
    expect(usedCard.players[0]!.inJail).toBe(false);
    expect(usedCard.players[0]!.getOutOfJailCards).toBe(0);

    // Roll for doubles in jail - failure increments jailTurns
    let jailRoll = reduce(state, { type: "ROLL_DICE", dice: [1, 2] }).state;
    expect(jailRoll.players[0]!.jailTurns).toBe(1);
    expect(jailRoll.players[0]!.inJail).toBe(true);

    // Roll doubles in jail - releases player
    jailRoll = reduce(state, { type: "ROLL_DICE", dice: [3, 3] }).state;
    expect(jailRoll.players[0]!.inJail).toBe(false);
  });

  it("handles auctions with winning bid and all-pass", () => {
    let state = createGame(players, { auctionOnDecline: true });
    state = roll(state, [1, 2]); // lands on tile 3
    state = reduce(state, { type: "DECLINE_PROPERTY" }).state;
    expect(state.phase).toBe("AUCTION");
    expect(state.pendingAuction?.tileIndex).toBe(3);

    state = reduce(state, { type: "AUCTION_BID", amount: 50 }).state;
    expect(state.pendingAuction?.highestBid).toBe(50);
    expect(state.pendingAuction?.highestBidderId).toBe("p1");

    state = reduce(state, { type: "AUCTION_PASS" }).state;
    expect(state.phase).toBe("POST_ROLL");
    expect(state.properties[3]?.ownerId).toBe("p1");
    expect(state.players[0]?.cash).toBe(1450);

    // Test auction where everyone passes
    let state2 = createGame(players, { auctionOnDecline: true });
    state2 = roll(state2, [1, 2]);
    state2 = reduce(state2, { type: "DECLINE_PROPERTY" }).state;
    state2 = reduce(state2, { type: "AUCTION_PASS" }).state;
    state2 = reduce(state2, { type: "AUCTION_PASS" }).state;
    expect(state2.pendingAuction).toBeNull();
    expect(state2.properties[3]?.ownerId).toBeNull();
  });

  it("handles trading and declining trade", () => {
    let state = createGame(players);
    state.properties[1]!.ownerId = "p1";
    state.phase = "POST_ROLL";

    state = reduce(state, {
      type: "PROPOSE_TRADE",
      toPlayerId: "p2",
      cash: 100,
      propertyTileIndices: [1]
    }).state;
    expect(state.pendingTrade).not.toBeNull();
    expect(state.currentPlayerId).toBe("p2");

    // Decline trade
    const declined = reduce(state, { type: "DECLINE_TRADE" }).state;
    expect(declined.pendingTrade).toBeNull();
    expect(declined.currentPlayerId).toBe("p1");

    // Propose and accept
    state = reduce(declined, {
      type: "PROPOSE_TRADE",
      toPlayerId: "p2",
      cash: 100,
      propertyTileIndices: [1]
    }).state;
    state = reduce(state, { type: "ACCEPT_TRADE" }).state;
    expect(state.pendingTrade).toBeNull();
    expect(state.properties[1]!.ownerId).toBe("p2");
    expect(state.players[0]!.cash).toBe(1400);
    expect(state.players[1]!.cash).toBe(1600);
  });

  it("handles building houses and hotels evenly", () => {
    let state = createGame(players);
    state.properties[1]!.ownerId = "p1";
    state.properties[3]!.ownerId = "p1";
    state.phase = "POST_ROLL";

    state = reduce(state, { type: "BUILD", tileIndex: 1 }).state;
    expect(state.properties[1]?.houses).toBe(1);

    // Uneven build should fail
    expect(() => reduce(state, { type: "BUILD", tileIndex: 1 })).toThrow();

    // Build on Marrakech to even it out
    state = reduce(state, { type: "BUILD", tileIndex: 3 }).state;
    expect(state.properties[3]?.houses).toBe(1);

    // Selling building
    state = reduce(state, { type: "SELL_BUILDING", tileIndex: 3 }).state;
    expect(state.properties[3]?.houses).toBe(0);
  });

  it("handles hotels up to 5 and selling hotels", () => {
    let state = createGame(players);
    state.properties[1]!.ownerId = "p1";
    state.properties[3]!.ownerId = "p1";
    state.properties[1]!.houses = 4;
    state.properties[3]!.houses = 4;
    state.phase = "POST_ROLL";

    // Build hotel on tile 1 (5th house)
    state = reduce(state, { type: "BUILD", tileIndex: 1 }).state;
    expect(state.properties[1]?.houses).toBe(5);
    expect(state.hotelSupply).toBe(board.totalHotels - 1);

    // Sell hotel from tile 1
    state = reduce(state, { type: "SELL_BUILDING", tileIndex: 1 }).state;
    expect(state.properties[1]?.houses).toBe(4);
  });

  it("handles bankruptcy and debt", () => {
    let state = createGame(players);
    state.players[0]!.cash = -50;
    state.phase = "DEBT";
    expect(getLegalActions(state, "p1")).toEqual([{ type: "DECLARE_BANKRUPTCY" }]);
    expect(getLegalActions(state, "p2")).toEqual([]);

    state = reduce(state, { type: "DECLARE_BANKRUPTCY" }).state;
    expect(state.players[0]!.bankrupt).toBe(true);
    expect(state.winnerId).toBe("p2");
    expect(state.phase).toBe("GAME_OVER");
  });

  it("handles quick mode win condition and max rounds", () => {
    let state = createGame(players, { mode: "quick", quickTargetNetWorth: 2000 });
    state.players[0]!.cash = 2100;
    state.phase = "POST_ROLL";
    state = reduce(state, { type: "END_TURN" }).state;
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerId).toBe("p1");

    let state2 = createGame(players, { maxRounds: 5 });
    state2.round = 5;
    state2.phase = "POST_ROLL";
    state2 = reduce(state2, { type: "END_TURN" }).state;
    expect(state2.phase).toBe("GAME_OVER");
  });

  it("draws cards and applies direct effects", () => {
    let state = createGame(players, { seed: 7 });
    state = { ...state, currentPlayerId: "p1" };
    const result = reduce(state, { type: "ROLL_DICE", dice: [1, 1] });
    expect(result.events.some((item) => item.type === "CARD_DRAWN")).toBe(true);

    // Test BUY_DECISION legal actions
    let buyState = createGame(players);
    buyState.phase = "BUY_DECISION";
    expect(getLegalActions(buyState, "p1")).toEqual([
      { type: "BUY_PROPERTY" },
      { type: "DECLINE_PROPERTY" }
    ]);

    buyState.phase = "POST_ROLL";
    expect(getLegalActions(buyState, "p1")).toEqual([{ type: "END_TURN" }]);
  });
});
