import { board, cards, getCard, getTile } from "./data.js";
import { randomInt, shuffle } from "./rng.js";
const jail = 10;
const go = 0;
const defaultSettings = {
    startingCash: board.startingCash, goSalary: board.goSalary, auctionOnDecline: true, freeParkingJackpot: false,
    doubleGoBonus: false, speedDie: false, characterMode: false, worldEvents: false, mode: "classic",
    quickTargetNetWorth: 5000, maxRounds: null, seed: 1
};
const copy = (state) => structuredClone(state);
const activePlayer = (state) => {
    const player = state.players.find((item) => item.id === state.currentPlayerId);
    if (!player)
        throw new Error(`Unknown current player: ${state.currentPlayerId}`);
    return player;
};
const event = (type, values = {}) => ({ type, ...values });
const money = (player, amount) => { player.cash += amount; };
const propertyTiles = () => board.tiles.filter((tile) => tile.type === "property" || tile.type === "railroad" || tile.type === "utility").map((tile) => tile.index);
const nextOfType = (position, kind) => {
    const matches = board.tiles.filter((tile) => tile.type === kind).map((tile) => tile.index);
    return matches.find((index) => index > position) ?? matches[0];
};
function passGo(player, state, events, exactGo) {
    if (exactGo && state.settings.doubleGoBonus) {
        money(player, state.settings.goSalary * 2);
        events.push(event("PASSED_GO", { playerId: player.id, amount: state.settings.goSalary * 2 }));
    }
    else {
        money(player, state.settings.goSalary);
        events.push(event("PASSED_GO", { playerId: player.id, amount: state.settings.goSalary }));
    }
}
function nextAuctionPlayer(state, auction) {
    const index = state.players.findIndex((item) => item.id === state.currentPlayerId);
    for (let offset = 1; offset <= state.players.length; offset += 1) {
        const candidate = state.players[(index + offset) % state.players.length];
        if (candidate && !candidate.bankrupt && !auction.passed.includes(candidate.id)) {
            state.currentPlayerId = candidate.id;
            return;
        }
    }
}
function movePlayer(state, player, steps, events) {
    const from = player.position;
    const target = ((from + steps) % 40 + 40) % 40;
    if (steps > 0 && from + steps >= 40)
        passGo(player, state, events, target === go);
    player.position = target;
    events.push(event("TOKEN_MOVED", { playerId: player.id, path: [target] }));
}
function propertyRent(state, tileIndex, diceTotal, multiplier = 1) {
    const tile = getTile(tileIndex);
    const property = state.properties[tileIndex];
    if (!property || property.mortgaged || !property.ownerId)
        return 0;
    if (tile.type === "property") {
        const sameGroup = board.tiles.filter((item) => item.colorGroup === tile.colorGroup && item.type === "property");
        const ownsGroup = sameGroup.every((item) => {
            const groupProperty = state.properties[item.index];
            return groupProperty?.ownerId === property.ownerId && !groupProperty.mortgaged;
        });
        return (tile.rent?.[property.houses] ?? 0) * (property.houses === 0 && ownsGroup ? 2 : 1) * multiplier;
    }
    if (tile.type === "railroad") {
        const owned = board.tiles.filter((item) => item.type === "railroad").filter((item) => state.properties[item.index]?.ownerId === property.ownerId).length;
        return ([0, 25, 50, 100, 200][owned] ?? 0) * multiplier;
    }
    const utilities = board.tiles.filter((item) => item.type === "utility").filter((item) => state.properties[item.index]?.ownerId === property.ownerId).length;
    return diceTotal * (utilities === 2 ? 10 : 4) * multiplier;
}
function charge(state, payer, amount, creditor, events = []) {
    if (amount <= 0)
        return;
    payer.cash -= amount;
    if (creditor)
        creditor.cash += amount;
    else if (state.settings.freeParkingJackpot)
        state.freeParkingPot += amount;
    events.push(event("PAYMENT_DUE", { playerId: payer.id, amount, creditorId: creditor?.id }));
    if (payer.cash < 0)
        state.phase = "DEBT";
}
function resolveLanding(state, player, events, rentMultiplier = 1) {
    const tile = getTile(player.position);
    state.lastLandedTile = tile.index;
    if (tile.type === "property" || tile.type === "railroad" || tile.type === "utility") {
        const property = state.properties[tile.index];
        if (!property.ownerId) {
            state.phase = "BUY_DECISION";
            return;
        }
        if (property.ownerId !== player.id) {
            const owner = state.players.find((item) => item.id === property.ownerId);
            if (owner)
                charge(state, player, propertyRent(state, tile.index, state.dice?.[0] + state.dice?.[1], rentMultiplier), owner, events);
            events.push(event("RENT_PAID", { tileIndex: tile.index }));
        }
    }
    else if (tile.type === "tax") {
        charge(state, player, tile.amount ?? 0, undefined, events);
    }
    else if (tile.type === "go_to_jail") {
        player.position = jail;
        player.inJail = true;
        player.jailTurns = 0;
        player.consecutiveDoubles = 0;
        state.phase = "POST_ROLL";
        events.push(event("SENT_TO_JAIL", { playerId: player.id }));
    }
    else if (tile.type === "free_parking" && state.settings.freeParkingJackpot) {
        money(player, state.freeParkingPot);
        events.push(event("JACKPOT_COLLECTED", { amount: state.freeParkingPot }));
        state.freeParkingPot = 0;
    }
    else if (tile.type === "chance" || tile.type === "community_chest") {
        const key = tile.type === "chance" ? "chance" : "chest";
        const deck = state[key === "chance" ? "chanceDeck" : "chestDeck"];
        const id = deck.shift() ?? (() => {
            const reshuffled = shuffle(state.discard[key], state.rngState);
            state.rngState = reshuffled.state;
            state.discard[key] = [];
            deck.push(...reshuffled.values);
            return deck.shift();
        })();
        if (!id)
            throw new Error(`Empty ${key} deck`);
        state.discard[key].push(id);
        const card = getCard(id);
        events.push(event("CARD_DRAWN", { cardId: id }));
        if (card.effect === "collect")
            money(player, card.amount ?? 0);
        else if (card.effect === "pay")
            charge(state, player, card.amount ?? 0, undefined, events);
        else if (card.effect === "getOutOfJailFree")
            player.getOutOfJailCards += 1;
        else if (card.effect === "goToJail") {
            player.position = jail;
            player.inJail = true;
            player.jailTurns = 0;
        }
        else if (card.effect === "moveRelative") {
            movePlayer(state, player, card.steps ?? 0, events);
            resolveLanding(state, player, events);
        }
        else if (card.effect === "moveTo") {
            const target = card.target ?? 0;
            const steps = (target - player.position + 40) % 40;
            movePlayer(state, player, steps, events);
            resolveLanding(state, player, events);
        }
        else if (card.effect === "moveToNearest") {
            const target = nextOfType(player.position, card.kind === "utility" ? "utility" : "railroad");
            const steps = (target - player.position + 40) % 40;
            movePlayer(state, player, steps, events);
            resolveLanding(state, player, events, card.rentMultiplier ?? 1);
        }
        else if (card.effect === "repairs") {
            const amount = Object.values(state.properties).filter((item) => item.ownerId === player.id).reduce((sum, item) => sum + (item.houses === 5 ? (card.hotel ?? 0) : item.houses * (card.house ?? 0)), 0);
            charge(state, player, amount, undefined, events);
        }
        else if (card.effect === "payEachPlayer" || card.effect === "collectFromEachPlayer") {
            for (const other of state.players.filter((item) => item.id !== player.id && !item.bankrupt)) {
                const amount = card.amount ?? 0;
                if (card.effect === "payEachPlayer")
                    charge(state, player, amount, other, events);
                else
                    charge(state, other, amount, player, events);
            }
        }
    }
    if (state.phase !== "DEBT" && state.phase !== "BUY_DECISION")
        state.phase = "POST_ROLL";
}
function endTurn(state) {
    const index = state.players.findIndex((player) => player.id === state.currentPlayerId);
    for (let offset = 1; offset <= state.players.length; offset += 1) {
        const player = state.players[(index + offset) % state.players.length];
        if (!player.bankrupt) {
            state.currentPlayerId = player.id;
            state.phase = player.inJail ? "JAIL_DECISION" : "ROLL";
            state.round += offset > 0 ? 1 : 0;
            return;
        }
    }
    state.phase = "GAME_OVER";
}
function checkWin(state) {
    const alive = state.players.filter((player) => !player.bankrupt);
    const quickWinner = state.settings.mode === "quick" ? alive.find((candidate) => candidate.cash + Object.values(state.properties).filter((property) => property.ownerId === candidate.id).reduce((sum, property) => sum + (getTile(property.tileIndex).price ?? 0), 0) >= state.settings.quickTargetNetWorth) : undefined;
    if (alive.length === 1 || quickWinner || (state.settings.maxRounds !== null && state.round >= state.settings.maxRounds)) {
        state.winnerId = quickWinner?.id ?? alive[0]?.id ?? alive.sort((a, b) => b.cash - a.cash)[0]?.id ?? null;
        state.phase = "GAME_OVER";
    }
}
export function createGame(players, settings = {}) {
    if (players.length < 2 || players.length > 6)
        throw new Error("A game requires 2 to 6 players");
    if (new Set(players.map((player) => player.id)).size !== players.length)
        throw new Error("Player IDs must be unique");
    const merged = { ...defaultSettings, ...settings };
    const decks = shuffle(cards.filter((card) => card.deck === "chance").map((card) => card.id), merged.seed);
    const chest = shuffle(cards.filter((card) => card.deck === "community_chest").map((card) => card.id), decks.state);
    const playerState = players.map((player) => ({ ...player, cash: merged.startingCash, position: 0, inJail: false, jailTurns: 0, getOutOfJailCards: 0, bankrupt: false, consecutiveDoubles: 0 }));
    const properties = {};
    for (const index of propertyTiles())
        properties[index] = { tileIndex: index, ownerId: null, houses: 0, mortgaged: false };
    return { players: playerState, properties, currentPlayerId: playerState[0].id, phase: "ROLL", dice: null, chanceDeck: decks.values, chestDeck: chest.values, discard: { chance: [], chest: [] }, houseSupply: board.totalHouses, hotelSupply: board.totalHotels, freeParkingPot: 0, pendingAuction: null, pendingTrade: null, round: 1, log: [], settings: merged, rngState: chest.state, winnerId: null, lastLandedTile: null };
}
export function reduce(input, action) {
    const state = copy(input);
    const player = activePlayer(state);
    const events = [];
    if (player.bankrupt)
        throw new Error("Bankrupt player cannot act");
    switch (action.type) {
        case "ROLL_DICE": {
            if (state.phase !== "ROLL" && state.phase !== "JAIL_DECISION")
                throw new Error("Cannot roll now");
            let dice;
            if (action.dice) {
                dice = action.dice;
            }
            else {
                const first = randomInt(state.rngState, 6);
                const second = randomInt(first.state, 6);
                dice = [first.value + 1, second.value + 1];
                state.rngState = second.state;
            }
            state.dice = dice;
            events.push(event("DICE_ROLLED", { dice }));
            if (state.phase === "JAIL_DECISION") {
                if (dice[0] === dice[1]) {
                    player.inJail = false;
                    player.jailTurns = 0;
                    movePlayer(state, player, dice[0] + dice[1], events);
                    resolveLanding(state, player, events);
                }
                else {
                    player.jailTurns += 1;
                    if (player.jailTurns >= 3) {
                        charge(state, player, 50, undefined, events);
                        player.inJail = false;
                        player.jailTurns = 0;
                        state.phase = "ROLL";
                    }
                    else
                        state.phase = "JAIL_DECISION";
                }
                break;
            }
            if (dice[0] === dice[1])
                player.consecutiveDoubles += 1;
            else
                player.consecutiveDoubles = 0;
            if (player.consecutiveDoubles >= 3) {
                player.position = jail;
                player.inJail = true;
                player.consecutiveDoubles = 0;
                state.phase = "POST_ROLL";
                events.push(event("SENT_TO_JAIL", { playerId: player.id }));
                break;
            }
            movePlayer(state, player, dice[0] + dice[1], events);
            resolveLanding(state, player, events);
            if (dice[0] === dice[1] && state.phase === "POST_ROLL")
                state.phase = "ROLL";
            break;
        }
        case "BUY_PROPERTY": {
            if (state.phase !== "BUY_DECISION")
                throw new Error("No property is available to buy");
            const property = state.properties[player.position];
            const price = getTile(player.position).price ?? 0;
            if (player.cash < price)
                throw new Error("Insufficient cash");
            player.cash -= price;
            property.ownerId = player.id;
            state.phase = player.consecutiveDoubles > 0 ? "ROLL" : "POST_ROLL";
            events.push(event("PROPERTY_BOUGHT", { playerId: player.id, tileIndex: player.position }));
            break;
        }
        case "DECLINE_PROPERTY": {
            if (state.phase !== "BUY_DECISION")
                throw new Error("No property is available to decline");
            if (state.settings.auctionOnDecline) {
                state.pendingAuction = { tileIndex: player.position, highestBid: 0, highestBidderId: null, passed: [] };
                state.phase = "AUCTION";
                events.push(event("AUCTION_STARTED"));
            }
            else
                state.phase = player.consecutiveDoubles > 0 ? "ROLL" : "POST_ROLL";
            break;
        }
        case "PAY_JAIL_FINE":
            if (state.phase !== "JAIL_DECISION" || player.cash < 50)
                throw new Error("Cannot pay jail fine");
            charge(state, player, 50, undefined, events);
            player.inJail = false;
            player.jailTurns = 0;
            state.phase = "ROLL";
            break;
        case "USE_JAIL_CARD":
            if (state.phase !== "JAIL_DECISION" || player.getOutOfJailCards < 1)
                throw new Error("No jail card available");
            player.getOutOfJailCards -= 1;
            player.inJail = false;
            player.jailTurns = 0;
            state.phase = "ROLL";
            break;
        case "BUILD": {
            const property = state.properties[action.tileIndex];
            const tile = getTile(action.tileIndex);
            if (!property || tile.type !== "property" || property.ownerId !== player.id || property.mortgaged)
                throw new Error("Cannot build here");
            const group = board.tiles.filter((item) => item.colorGroup === tile.colorGroup && item.type === "property");
            if (!group.every((item) => state.properties[item.index]?.ownerId === player.id) || property.houses >= 5 || player.cash < (tile.houseCost ?? 0))
                throw new Error("Building requirements not met");
            if (group.some((item) => property.houses > (state.properties[item.index]?.houses ?? 0) + 1))
                throw new Error("Buildings must be even");
            if (property.houses === 4 && state.hotelSupply < 1)
                throw new Error("No hotels available");
            if (property.houses < 4 && state.houseSupply < 1)
                throw new Error("No houses available");
            player.cash -= tile.houseCost ?? 0;
            if (property.houses === 4) {
                state.hotelSupply -= 1;
                state.houseSupply += 4;
            }
            else
                state.houseSupply -= 1;
            property.houses += 1;
            events.push(event("BUILT", { tileIndex: action.tileIndex }));
            break;
        }
        case "SELL_BUILDING": {
            const property = state.properties[action.tileIndex];
            const tile = getTile(action.tileIndex);
            if (!property || tile.type !== "property" || property.ownerId !== player.id || property.houses < 1)
                throw new Error("Cannot sell building");
            const group = board.tiles.filter((item) => item.colorGroup === tile.colorGroup && item.type === "property");
            if (group.some((item) => property.houses < (state.properties[item.index]?.houses ?? 0)))
                throw new Error("Buildings must be sold evenly");
            property.houses -= 1;
            if (property.houses === 4) {
                state.hotelSupply += 1;
                state.houseSupply -= 4;
            }
            else
                state.houseSupply += 1;
            player.cash += Math.floor((tile.houseCost ?? 0) / 2);
            events.push(event("BUILDING_SOLD", { tileIndex: action.tileIndex }));
            break;
        }
        case "MORTGAGE": {
            const property = state.properties[action.tileIndex];
            const tile = getTile(action.tileIndex);
            if (!property || property.ownerId !== player.id || property.mortgaged || property.houses > 0)
                throw new Error("Cannot mortgage property");
            property.mortgaged = true;
            player.cash += tile.mortgage ?? 0;
            events.push(event("MORTGAGED", { tileIndex: action.tileIndex }));
            break;
        }
        case "UNMORTGAGE": {
            const property = state.properties[action.tileIndex];
            const tile = getTile(action.tileIndex);
            const cost = Math.ceil((tile.mortgage ?? 0) * 1.1);
            if (!property || property.ownerId !== player.id || !property.mortgaged || player.cash < cost)
                throw new Error("Cannot unmortgage property");
            property.mortgaged = false;
            player.cash -= cost;
            events.push(event("UNMORTGAGED", { tileIndex: action.tileIndex }));
            break;
        }
        case "AUCTION_BID": {
            const auction = state.pendingAuction;
            if (state.phase !== "AUCTION" || !auction || action.amount <= auction.highestBid || action.amount > player.cash)
                throw new Error("Invalid auction bid");
            auction.highestBid = action.amount;
            auction.highestBidderId = player.id;
            nextAuctionPlayer(state, auction);
            break;
        }
        case "AUCTION_PASS": {
            const auction = state.pendingAuction;
            if (state.phase !== "AUCTION" || !auction)
                throw new Error("No auction");
            if (!auction.passed.includes(player.id))
                auction.passed.push(player.id);
            if (auction.passed.length >= state.players.filter((item) => !item.bankrupt).length - 1 && auction.highestBidderId) {
                const winner = state.players.find((item) => item.id === auction.highestBidderId);
                winner.cash -= auction.highestBid;
                state.properties[auction.tileIndex].ownerId = winner.id;
                state.pendingAuction = null;
                state.phase = "POST_ROLL";
                events.push(event("PROPERTY_BOUGHT", { playerId: winner.id, tileIndex: auction.tileIndex }));
            }
            else if (auction.passed.length >= state.players.filter((item) => !item.bankrupt).length) {
                state.pendingAuction = null;
                state.phase = "POST_ROLL";
            }
            else {
                nextAuctionPlayer(state, auction);
            }
            break;
        }
        case "DECLARE_BANKRUPTCY": {
            if (state.phase !== "DEBT" || player.cash >= 0)
                throw new Error("Bankruptcy is not available");
            player.bankrupt = true;
            for (const property of Object.values(state.properties))
                if (property.ownerId === player.id)
                    property.ownerId = null;
            events.push(event("PLAYER_BANKRUPT", { playerId: player.id }));
            checkWin(state);
            if (state.phase !== "GAME_OVER")
                endTurn(state);
            break;
        }
        case "PROPOSE_TRADE": {
            if (state.phase !== "POST_ROLL" || action.toPlayerId === player.id || action.cash < 0 || !Number.isInteger(action.cash))
                throw new Error("Invalid trade offer");
            const recipient = state.players.find((item) => item.id === action.toPlayerId);
            if (!recipient || recipient.bankrupt || player.cash < action.cash)
                throw new Error("Invalid trade recipient or cash");
            for (const tileIndex of action.propertyTileIndices) {
                const property = state.properties[tileIndex];
                if (!property || property.ownerId !== player.id || property.houses > 0)
                    throw new Error("Only owned undeveloped properties can be traded");
            }
            state.pendingTrade = { fromPlayerId: player.id, toPlayerId: recipient.id, cash: action.cash, propertyTileIndices: [...action.propertyTileIndices] };
            state.currentPlayerId = recipient.id;
            events.push(event("TRADE_PROPOSED", { fromPlayerId: player.id, toPlayerId: recipient.id }));
            break;
        }
        case "ACCEPT_TRADE": {
            const offer = state.pendingTrade;
            if (!offer || offer.toPlayerId !== player.id)
                throw new Error("No trade offer for this player");
            const from = state.players.find((item) => item.id === offer.fromPlayerId);
            if (!from || from.cash < offer.cash || player.bankrupt)
                throw new Error("Trade offer is no longer valid");
            from.cash -= offer.cash;
            player.cash += offer.cash;
            for (const tileIndex of offer.propertyTileIndices)
                state.properties[tileIndex].ownerId = player.id;
            state.pendingTrade = null;
            state.currentPlayerId = from.id;
            events.push(event("TRADE_COMPLETED", { fromPlayerId: from.id, toPlayerId: player.id }));
            break;
        }
        case "DECLINE_TRADE": {
            if (!state.pendingTrade || state.pendingTrade.toPlayerId !== player.id)
                throw new Error("No trade offer for this player");
            const offer = state.pendingTrade;
            state.pendingTrade = null;
            state.currentPlayerId = offer.fromPlayerId;
            events.push(event("TRADE_DECLINED", { playerId: player.id }));
            break;
        }
        case "END_TURN":
            if (state.phase !== "POST_ROLL" && !(state.phase === "DEBT" && player.cash >= 0))
                throw new Error("Cannot end turn now");
            player.consecutiveDoubles = 0;
            endTurn(state);
            break;
    }
    checkWin(state);
    return { state, events };
}
export function getLegalActions(state, playerId) {
    if (state.currentPlayerId !== playerId || state.phase === "GAME_OVER")
        return [];
    if (state.phase === "ROLL")
        return [{ type: "ROLL_DICE" }];
    if (state.phase === "JAIL_DECISION")
        return [{ type: "ROLL_DICE" }, ...(activePlayer(state).cash >= 50 ? [{ type: "PAY_JAIL_FINE" }] : []), ...(activePlayer(state).getOutOfJailCards > 0 ? [{ type: "USE_JAIL_CARD" }] : [])];
    if (state.phase === "BUY_DECISION")
        return [{ type: "BUY_PROPERTY" }, { type: "DECLINE_PROPERTY" }];
    if (state.phase === "POST_ROLL")
        return [{ type: "END_TURN" }];
    if (state.phase === "DEBT")
        return [{ type: "DECLARE_BANKRUPTCY" }];
    return [];
}
