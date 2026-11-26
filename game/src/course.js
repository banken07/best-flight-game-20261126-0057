import { HUT_SPOTS } from "./terrain.js";

const TAN_55 = Math.tan(5.5 * Math.PI / 180);

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(v, min, max) { const a = num(min, 0), b = num(max, 1); return Math.max(a, Math.min(b, num(v, a))); }
function mulberry32(seed) { let a = (Number(seed) || 0) >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function wobble(rng, amp) { const r = typeof rng === "function" ? num(rng(), 0.5) : 0.5; return (r * 2 - 1) * num(amp, 0); }

export function buildCourse(seed) {
  const rng = mulberry32(seed);
  const runway = { x: 0, y: 0, headingDeg: 0, length: 600, width: 60, thresholdY: -300 };
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = -1400 + 2600 * t;
    const x = -300 + 600 * t + Math.sin(t * Math.PI * 2) * 220 + wobble(rng, 25);
    const z = clamp(200 + 100 * t + wobble(rng, 25), 180, 320);
    rings.push({ x, y, z, radius: 55, passed: false, index: i });
  }
  const spots = Array.isArray(HUT_SPOTS) ? HUT_SPOTS : [];
  const dropZones = spots.map((h, i) => ({ x: num(h?.x), y: num(h?.y), radius: 90, done: false, index: i }));
  return { rings, dropZones, runway };
}

export function glideslope(jet, runway) {
  const thresholdY = num(runway?.thresholdY, -300);
  const distM = thresholdY - num(jet?.y);
  const lateralM = num(jet?.x) - num(runway?.x);
  const idealAltM = distM > 0 ? Math.max(0, distM * TAN_55) : 0;
  const errorM = num(jet?.z) - idealAltM;
  const onSlope = Math.abs(errorM) < 25 && Math.abs(lateralM) < 40;
  return { distM, idealAltM, errorM, lateralM, onSlope };
}

export function runwayHit(jet, runway) {
  const alongM = num(jet?.y) - num(runway?.y);
  const acrossM = num(jet?.x) - num(runway?.x);
  const w = num(runway?.width, 60);
  const l = num(runway?.length, 600);
  const onRunway = Math.abs(acrossM) <= w / 2 && alongM >= -l / 2 && alongM <= l / 2;
  return { onRunway, alongM, acrossM };
}

export function ringAhead(rings) {
  if (!Array.isArray(rings)) return null;
  for (const r of rings) if (r && r.passed === false) return r;
  return null;
}

export function distTo(jet, x, y) {
  return Math.hypot(num(jet?.x) - num(x), num(jet?.y) - num(y));
}
