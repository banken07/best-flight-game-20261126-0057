import { STEP, JET, FUEL, SORTIE, START } from "./config.js";
import { buildCourse, glideslope, runwayHit, ringAhead } from "./course.js";
import { mulberry32 } from "./random.js";
import { heightAt } from "./terrain.js";

const limit = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const wrapHeading = d => ((d % 360) + 360) % 360;
const moveToward = (v, t, s) => v < t ? Math.min(v + s, t) : v > t ? Math.max(v - s, t) : v;
const num = v => (typeof v === "number" && isFinite(v)) ? v : 0;

function freshState(world, seed) {
  world.seed = seed;
  world.rng = mulberry32(seed);
  world.course = buildCourse(seed);
  world.phase = "fly";
  world.stage = 1;
  world.jet = {
    x: START.x, y: START.y, z: START.z,
    headingDeg: START.headingDeg, speedMs: START.speedMs,
    throttle: START.throttle, pitchDeg: START.pitchDeg,
    bankDeg: START.bankDeg, fuel: START.fuel, vspeedMs: 0
  };
  world.score = 0;
  world.timeLeft = SORTIE.timeLimit;
  world.elapsed = 0;
  world.drop = { done: [false, false], errors: [null, null] };
  world.events = [];
  world.glide = null;
  world.runway = null;
  // Seed the first target so the title-screen HUD shows the real ring-1
  // distance instead of "NEXT RING 0 m" before the first step.
  const r0 = world.course.rings[0];
  world.nextTarget = r0 ? { kind: "ring", x: r0.x, y: r0.y, z: r0.z, distM: Math.hypot(r0.x - START.x, r0.y - START.y) } : null;
  world.message = SORTIE.briefings[0];
  world.messageT = 3;
  world.stats = { ringsHit: 0, ringScores: [], dropScores: [], touchdownSpeed: null, fuelBonus: 0, landingScore: 0 };
  world.breakdown = null;
  world.lowFuelPinged = false;
  world._apFinal = false;
  world._apDropTarget = undefined;
  world._apDropDist = undefined;
}

export function createWorld(seed) {
  const world = {};
  freshState(world, seed);
  return world;
}

export function resetWorld(world, seed) {
  freshState(world, seed);
}

export function stepWorld(world, controls, dt) {
  if (world.phase !== "fly") return;
  const ctl = controls || {};
  const throttleIn = num(ctl.throttle);
  const pitchIn = num(ctl.pitch);
  const bankIn = num(ctl.bank);
  const action = ctl.action === true;
  const jet = world.jet;
  const course = world.course;

  jet.throttle = limit(jet.throttle + throttleIn * 0.45 * dt, 0, 1);
  const targetSpeed = jet.fuel <= 0 ? 0 : JET.minSpeed + jet.throttle * (JET.maxSpeed - JET.minSpeed);
  jet.speedMs = Math.max(0, moveToward(jet.speedMs, targetSpeed, 14 * dt));

  jet.bankDeg = moveToward(jet.bankDeg, bankIn * 45, 140 * dt);
  jet.headingDeg = wrapHeading(jet.headingDeg + jet.bankDeg * 0.55 * dt * (120 / Math.max(jet.speedMs, 30)));

  jet.pitchDeg = moveToward(jet.pitchDeg, pitchIn * 12, 70 * dt);
  const pitchRad = jet.pitchDeg * Math.PI / 180;
  let vs = Math.sin(pitchRad) * jet.speedMs;
  if (jet.speedMs < JET.minSpeed) vs -= (JET.minSpeed - jet.speedMs) * 0.3;
  if (!isFinite(vs)) vs = 0;
  if (vs < -25) vs = -25;
  jet.vspeedMs = vs;

  jet.z = limit(jet.z + vs * dt, -5, 600);
  const headingRad = jet.headingDeg * Math.PI / 180;
  jet.x += Math.sin(headingRad) * jet.speedMs * dt;
  jet.y += Math.cos(headingRad) * jet.speedMs * dt;
  if (!isFinite(jet.x)) jet.x = 0;
  if (!isFinite(jet.y)) jet.y = 0;

  const burnerExtra = jet.throttle > FUEL.burnerThreshold ? FUEL.burnerPerSec : 0;
  const burn = FUEL.idlePerSec + jet.throttle * (FUEL.fullPerSec - FUEL.idlePerSec) + burnerExtra;
  jet.fuel = Math.max(0, jet.fuel - burn * dt);
  if (jet.fuel < FUEL.lowWarning && !world.lowFuelPinged) {
    world.lowFuelPinged = true;
    world.events.push({ type: "alarm" });
  }

  world.timeLeft -= dt;
  world.elapsed += dt;
  if (world.timeLeft <= 0 && world.phase === "fly") {
    world.timeLeft = 0;
    world.phase = "lost";
    world.message = "TIME UP";
    world.messageT = 3;
    world.events.push({ type: "timeout" });
  }

  world.glide = glideslope(jet, course.runway);
  world.runway = runwayHit(jet, course.runway);

  if (world.stage === 1) {
    const next = ringAhead(course.rings);
    if (next) {
      const dx = next.x - jet.x, dy = next.y - jet.y;
      world.nextTarget = { kind: "ring", x: next.x, y: next.y, z: next.z, distM: Math.hypot(dx, dy) };
    } else world.nextTarget = null;
  } else if (world.stage === 2) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < course.dropZones.length; i++) {
      if (world.drop.done[i]) continue;
      const dz = course.dropZones[i];
      const d = Math.hypot(dz.x - jet.x, dz.y - jet.y);
      if (d < bestD) { bestD = d; best = { kind: "drop", x: dz.x, y: dz.y, z: 120, distM: d }; }
    }
    world.nextTarget = best;
  } else if (world.stage === 3) {
    const gd = world.glide && isFinite(world.glide.distM) ? world.glide.distM : 0;
    world.nextTarget = { kind: "runway", x: 0, y: -300, z: 2, distM: Math.max(0, gd) };
  } else world.nextTarget = null;

  if (world.phase === "fly" && world.stage === 1) {
    const next = ringAhead(course.rings);
    if (next) {
      const d = Math.hypot(next.x - jet.x, next.y - jet.y, next.z - jet.z);
      // Track the closest approach while near the ring. Scoring from the
      // distance at first entry into the sphere always reads ~0.9r (the
      // entry point), so the score must wait until the plane has passed
      // the closest point and is moving away again.
      if (d < next.radius * 1.5) {
        if (next.bestD === undefined || d < next.bestD) next.bestD = d;
      }
      if (next.bestD !== undefined && next.bestD < next.radius * 0.9 && d > next.bestD + 5) {
        next.passed = true;
        world.stats.ringsHit += 1;
        const ringScore = 150 + Math.round(50 * Math.max(0, 1 - next.bestD / next.radius));
        world.score += ringScore;
        world.stats.ringScores.push(ringScore);
        world.events.push({ type: "ring", index: next.index, score: ringScore });
        world.message = "RING " + (next.index + 1) + " / 5  +" + ringScore;
        world.messageT = 1.2;
      }
    }
    if (course.rings.every(r => r.passed)) {
      world.stage = 2;
      world.score += 100;
      world.message = "RING COURSE CLEAR — STAGE 2: SUPPLY";
      world.messageT = 3;
      world.events.push({ type: "stage", stage: 2 });
    }
  }

  if (world.phase === "fly" && world.stage === 2 && action) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < course.dropZones.length; i++) {
      if (world.drop.done[i]) continue;
      const dz = course.dropZones[i];
      const d = Math.hypot(dz.x - jet.x, dz.y - jet.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD < 150 && jet.z < 500) {
      const dz = course.dropZones[best];
      const horiz = Math.hypot(dz.x - jet.x, dz.y - jet.y);
      world.drop.done[best] = true;
      world.drop.errors[best] = horiz;
      const dropScore = Math.max(0, 200 - Math.round(horiz));
      world.score += dropScore;
      world.stats.dropScores.push(dropScore);
      world.events.push({ type: "drop", index: best, errorM: horiz, score: dropScore });
      world.message = "CRATE AWAY — " + Math.round(horiz) + " m OFF  +" + dropScore;
      world.messageT = 2;
    } else {
      world.message = "DROP MISSED — TOO FAR";
      world.messageT = 1.5;
    }
    if (world.drop.done[0] && world.drop.done[1]) {
      world.stage = 3;
      world.message = "SUPPLIES DELIVERED — STAGE 3: LAND";
      world.messageT = 3;
      world.events.push({ type: "stage", stage: 3 });
    }
  }

  const ground = heightAt(jet.x, jet.y, world.seed);
  if (jet.z <= ground + 2 && world.phase === "fly") {
    const rw = world.runway || {};
    const onRunway = rw.onRunway === true;
    const vsOk = Math.abs(jet.vspeedMs) <= 9;
    const spdOk = jet.speedMs >= 60 && jet.speedMs <= 95;
    if (onRunway && vsOk && spdOk) {
      if (world.stage === 3) {
        world.phase = "won";
        world.stats.touchdownSpeed = jet.speedMs;
        const glideErr = world.glide && isFinite(world.glide.errorM) ? world.glide.errorM : 0;
        world.stats.landingScore = 400 + Math.max(0, Math.round(300 - Math.abs(glideErr) * 4));
        world.stats.fuelBonus = Math.round(jet.fuel * 300);
        const timeBonus = Math.round(world.timeLeft) * 2;
        world.score += world.stats.landingScore + world.stats.fuelBonus + timeBonus;
        const ringTotal = world.stats.ringScores.reduce((a, b) => a + b, 0);
        const dropTotal = world.stats.dropScores.reduce((a, b) => a + b, 0);
        world.breakdown = {
          ringScores: world.stats.ringScores.slice(),
          dropScores: world.stats.dropScores.slice(),
          ringTotal, dropTotal,
          landing: world.stats.landingScore,
          fuelBonus: world.stats.fuelBonus,
          timeBonus,
          total: world.score
        };
        world.message = "TOUCHDOWN — RUNWAY 36";
        world.messageT = 3;
        world.events.push({ type: "trap" });
        world.events.push({ type: "win", score: world.score });
      } else {
        world.phase = "lost";
        world.message = world.stage === 1 ? "LANDED BEFORE THE RINGS" : "LANDED BEFORE THE DROPS";
        world.messageT = 3;
        world.events.push({ type: "nodrop" });
      }
    } else {
      world.phase = "crashed";
      const reason = !onRunway
        ? (ground < 0.5 ? "DITCHED IN THE SEA" : "HIT THE GROUND")
        : !vsOk ? "TOO HARD"
        : jet.speedMs > 95 ? "TOO FAST" : "TOO SLOW";
      world.message = reason;
      world.messageT = 3;
      world.events.push({ type: "crash", reason });
    }
  }

  if (world.messageT > 0) {
    world.messageT -= dt;
    if (world.messageT <= 0) {
      world.messageT = 0;
      world.message = "";
    }
  }
}
