import type { Action, GameSettings, GameState, NewPlayer, ReduceResult } from "./types.js";
export declare function createGame(players: NewPlayer[], settings?: Partial<GameSettings>): GameState;
export declare function reduce(input: GameState, action: Action): ReduceResult;
export declare function getLegalActions(state: GameState, playerId: string): Action[];
