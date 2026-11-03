export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const next = (t ^ (t >>> 14)) >>> 0;
  return { value: next / 4294967296, state: next };
}
export function randomInt(state: number, max: number): { value: number; state: number } {
  const result = nextRandom(state);
  return { value: Math.floor(result.value * max), state: result.state };
}
export function shuffle<T>(values: readonly T[], seed: number): { values: T[]; state: number } {
  const result = [...values];
  let state = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const picked = randomInt(state, i + 1);
    state = picked.state;
    [result[i], result[picked.value]] = [result[picked.value]!, result[i]!];
  }
  return { values: result, state };
}
