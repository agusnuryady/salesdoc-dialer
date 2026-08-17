export type Rng = () => number;

/** Deterministic seeded PRNG (mulberry32) — same seed always produces the same sequence. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    if (roll < weight) return key;
    roll -= weight;
  }
  const last = entries[entries.length - 1];
  if (!last) throw new Error('weightedPick requires at least one weight');
  return last[0];
}

export function randomInRange(rng: Rng, [min, max]: [number, number]): number {
  return min + rng() * (max - min);
}
