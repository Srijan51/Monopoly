export declare function nextRandom(state: number): {
    value: number;
    state: number;
};
export declare function randomInt(state: number, max: number): {
    value: number;
    state: number;
};
export declare function shuffle<T>(values: readonly T[], seed: number): {
    values: T[];
    state: number;
};
