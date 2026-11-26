import { STEP } from "./config.js";
import { resetWorld, stepWorld } from "./world.js";
import { ringAhead, glideslope, distTo } from "./course.js";
import { heightAt } from "./terrain.js";

const clamp = (v, lo, hi) => { v = num(v, lo); return v < lo ? lo : v > hi ? hi : v; };
const num = (v, f) => (typeof v === "number" && isFinite(v)) ? v : f;
const wrap180 = (d) => { d = num(d, 0); d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; };

export function autopilot(world) {
  const zero = { throttle: 0, pitch: 0, bank: 0, action: false };
  if (!world || !world.jet || world.phase !== "fly") return zero;
  const jet = world.jet, course = world.course || {};
  const controls = { throttle: 0, pitch: 0, bank: 0, action: false };
  let target = null, targetIsRing = false, targetIsDrop = false, targetIsApproach = false, targetIsPosition = false, dz = null;

  if (world.stage === 1) {
    const ring = ringAhead(course.rings);
    if (ring) { target = { x: ring.x, y: ring.y, z: ring.z }; targetIsRing = true; }
    else { target = { x: 0, y: 0, z: 120 }; targetIsApproach = true; }
  } else if (world.stage === 2) {
    let best = null, bd = Infinity;
    for (const z of (course.dropZones || [])) {
      // The done state lives on world.drop.done (set by stepWorld), NOT on
      // the course zone object — checking z.done here never sees a drop as
      // done and the plane orbits the supplied hut forever.
      if (world.drop && world.drop.done && world.drop.done[z.index]) continue;
      const d = distTo(jet, z.x, z.y);
      if (d < bd) { bd = d; best = z; }
    }
    if (best) { target = { x: best.x, y: best.y, z: 150 }; targetIsDrop = true; dz = best; }
    else { target = { x: 0, y: -60, z: 2 }; targetIsApproach = true; }
  } else if (world.stage === 3) {
    // Two-phase final: first position to the fix south of the threshold
    // (0,-1200), THEN fly the slope in. Flying straight at the runway
    // from the north makes the glideslope read 0 (past the threshold) and
    // the plane dives into the hillside before the runway.
    if (!world._apFinal && distTo(jet, 0, -1200) > 150) {
      target = { x: 0, y: -1200, z: 150 }; targetIsPosition = true;
    } else {
      world._apFinal = true;
      target = { x: 0, y: -60, z: 2 }; targetIsApproach = true;
    }
  }
  if (!target) return zero;

  const dx = num(target.x, 0) - num(jet.x, 0);
  const dy = num(target.y, 0) - num(jet.y, 0);
  const headingTo = Math.atan2(dx, dy) * 180 / Math.PI;
  const headingErr = wrap180(headingTo - num(jet.headingDeg, 0));
  // Strong bank gain: a weak gain lets the plane weave across the line to
  // the target and thread each ring at its edge (or miss and circle back).
  controls.bank = clamp(headingErr / 12, -1, 1);

  const horizDist = Math.sqrt(dx * dx + dy * dy);
  let desiredAlt = num(jet.z, 0);
  let distToCarrier = Infinity;
  if (targetIsRing) desiredAlt = num(target.z, desiredAlt);
  else if (targetIsDrop || targetIsPosition) desiredAlt = num(target.z, 150);
  else if (targetIsApproach) {
    const gs = glideslope(jet, { x: 0, y: 0, thresholdY: -300 });
    desiredAlt = clamp(gs && gs.idealAltM, 0, 400);
    distToCarrier = distTo(jet, 0, 0);
    if (distToCarrier > 400 && desiredAlt < 12) desiredAlt = 12;
    if (distToCarrier < 400) desiredAlt = 0;
  }
  const ground = num(heightAt(jet.x, jet.y, num(world.seed, 1)), 0);
  if (!(targetIsApproach && distToCarrier < 800)) desiredAlt = Math.max(desiredAlt, ground + 60);
  controls.pitch = clamp((desiredAlt - num(jet.z, 0)) / 15, -1, 1);

  let desiredSpeed;
  if (targetIsApproach && distToCarrier < 1500) desiredSpeed = 78;
  else if (horizDist > 1500) desiredSpeed = 120;
  else if (horizDist < 600) desiredSpeed = 60;
  else if (targetIsRing) desiredSpeed = 100;
  else desiredSpeed = 95;
  // Slow down to tighten the turn while the heading error is large — a
  // fast plane overshoots the ring and spends the sortie circling back.
  const absErr = Math.abs(headingErr);
  if (absErr > 45) desiredSpeed = Math.min(desiredSpeed, 60);
  else if (absErr > 25) desiredSpeed = Math.min(desiredSpeed, 72);
  controls.throttle = clamp((desiredSpeed - num(jet.speedMs, 0)) / 10, -1, 1);

  if (world.stage === 2 && targetIsDrop && dz) {
    // Drop at the closest approach, not on entry into the window: fire when
    // very close, or when the distance starts growing again after a close
    // pass (the crate then lands near the hut instead of at the edge).
    const dd = distTo(jet, dz.x, dz.y);
    if (world._apDropTarget !== dz.index) { world._apDropTarget = dz.index; world._apDropDist = dd; }
    const prev = world._apDropDist;
    // Fire only at the closest approach (distance starting to grow again
    // after a close pass) — firing on entry into the window always drops
    // at the window edge and scores ~80.
    if (prev !== undefined && dd > prev && prev < 120 && num(jet.z, 0) < 480) controls.action = true;
    world._apDropDist = dd;
  }
  return controls;
}

export function stageShot(name, world) {
  try {
    const stepsFor = (s) => Math.max(0, Math.round(s / STEP));
    const runSteps = (w, maxSteps, stopEarly) => {
      for (let i = 0; i < maxSteps; i++) {
        stepWorld(w, autopilot(w), STEP);
        if (stopEarly && w.phase !== "fly") break;
      }
    };
    const seed = num(world.seed, 1);
    if (name === "cover") { resetWorld(world, seed); return { screen: "title", best: 0 }; }
    if (name === "rings") {
      resetWorld(world, seed);
      runSteps(world, stepsFor(14), false);
      return { screen: "play", best: world.score };
    }
    if (name === "approach") {
      resetWorld(world, seed);
      const max = stepsFor(200);
      for (let i = 0; i < max; i++) {
        stepWorld(world, autopilot(world), STEP);
        if (world.stage === 3 || world.phase !== "fly") break;
      }
      // Fly the final and freeze at photo distance: 400-600 m from the
      // threshold, wings level, heading north, so the whole runway strip
      // is visible ahead in the lower frame. The old staging flew 8 s
      // past "established", ending 134 m from the threshold with the
      // plane over the runway — the strip sat at the bottom edge of the
      // frame, hidden behind the fuselage (old shot 3).
      const maxFinal = stepsFor(60);
      for (let i = 0; i < maxFinal; i++) {
        stepWorld(world, autopilot(world), STEP);
        if (world.phase !== "fly") break;
        const h = world.jet.headingDeg;
        const herr = Math.abs(((h + 180) % 360 + 360) % 360 - 180);
        const bank = Math.abs(num(world.jet.bankDeg, 0));
        const distM = -300 - num(world.jet.y, 0);
        if (herr < 15 && bank < 10 && distM <= 600 && distM >= 400) break;
        // Safety: never fly on past the threshold — freeze rather than
        // overshoot the runway entirely.
        if (distM < 350 && herr < 20) break;
      }
      return { screen: world.phase !== "fly" ? world.phase : "play", best: world.score };
    }
    if (name === "score") {
      resetWorld(world, seed);
      const max = stepsFor(240);
      for (let i = 0; i < max; i++) {
        stepWorld(world, autopilot(world), STEP);
        if (world.phase !== "fly") break;
      }
      return { screen: world.phase === "won" ? "won" : "play", best: world.score };
    }
    resetWorld(world, seed);
    return { screen: "title", best: 0 };
  } catch (e) {
    return { screen: "play", best: 0 };
  }
}
