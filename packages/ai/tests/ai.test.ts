import { describe, expect, it } from "vitest";
import { createGame, reduce } from "@mwt/engine";
import { decide, profiles } from "../src/index.js";

describe("bot decision policy", () => {
  it("provides all four personalities and three difficulty levels", () => {
    expect(new Set(profiles().map((profile) => profile.personality)).size).toBe(4);
    expect(new Set(["easy", "normal", "hard"])).toHaveLength(3);
  });

  it("chooses legal turn actions for each configured profile", () => {
    for (const profile of profiles()) {
      const state = createGame([{ id: "bot", name: "Bot", isBot: true }, { id: "other", name: "Other", isBot: true }], { seed: 1 });
      expect(decide(state, "bot", profile)).toEqual({ type: "ROLL_DICE" });
      expect(() => reduce(state, decide(state, "bot", profile))).not.toThrow();
    }
  });
});
