// ATOLL RUN — deterministic randomness.
// Every run with the same seed plays the same island, so screenshots and
// tests are reproducible. mulberry32 is small, fast and good enough here.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  const at = Math.floor(rng() * list.length);
  return list[Math.min(at, list.length - 1)];
}

export function range(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}
