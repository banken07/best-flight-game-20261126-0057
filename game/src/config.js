// ATOLL RUN — shared tuning numbers and sortie setup.
// One place for every magic number the other modules read: the stage size,
// the runway, the jet envelope, fuel burn, rings and the single sortie.

export const STAGE = {
  width: 1280,
  height: 720,
};

export const STEP = 1 / 60;

export const SEA = 0;

export const RUNWAY = {
  x: 0,
  y: 0,
  length: 600,
  width: 60,
};

export const JET = {
  maxSpeed: 180,
  minSpeed: 55,
};

// Fuel burn is per second of flight. At a 0.7 throttle the jet burns about
// 0.0045/s, so a full tank lasts roughly three minutes of flying — the
// whole sortie is budgeted to fit in one tank with a landing bonus.
export const FUEL = {
  idlePerSec: 0.001,
  fullPerSec: 0.006,
  burnerPerSec: 0.012,
  burnerThreshold: 0.85,
  lowWarning: 0.15,
};

export const RING = {
  radius: 55,
  count: 5,
};

export const INK = "#7df9ff";

export const KEYS = {
  throttleUp: ["KeyW"],
  throttleDown: ["KeyS"],
  pitchUp: ["ArrowUp"],
  pitchDown: ["ArrowDown"],
  bankLeft: ["ArrowLeft", "KeyA"],
  bankRight: ["ArrowRight", "KeyD"],
  action: ["Space"],
  restart: ["KeyR"],
  mute: ["KeyM"],
  pause: ["KeyP"],
};

// One sortie, three stages: rings, supply drops, then the landing.
export const SORTIE = {
  name: "ATOLL RUN",
  tagline: "ONE SORTIE, THREE MISSIONS",
  timeLimit: 240,
  startFuel: 1,
  briefings: [
    "STAGE 1 — RING COURSE: fly 5 glowing rings.",
    "STAGE 2 — ISLAND SUPPLY: drop crates on both huts.",
    "STAGE 3 — LAND ON RUNWAY 36: bring her home.",
  ],
};

// Where the sortie begins: south of the atoll, nose north, on speed.
export const START = {
  x: 0, y: -2600, z: 300,
  headingDeg: 0, speedMs: 120, throttle: 0.7,
  pitchDeg: 0, bankDeg: 0, fuel: 1,
};
