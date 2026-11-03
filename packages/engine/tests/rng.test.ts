import { describe, expect, it } from "vitest";
import { nextRandom, shuffle } from "../src/index.js";

describe("seeded RNG", () => {
  it("is deterministic and does not use ambient randomness", () => {
    expect(nextRandom(1)).toEqual(nextRandom(1));
    expect(shuffle(["a", "b", "c"], 9)).toEqual(shuffle(["a", "b", "c"], 9));
  });
});
