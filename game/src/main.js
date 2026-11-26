// ATOLL RUN — boot, game loop, screens, test hooks.
// Loads as a module script from game/index.html. Reads ?shot=, ?seed=
// and ?auto= from the URL. The ?shot= scenes stage the world with the
// autopilot so screenshots show real flown frames.

import { STAGE, STEP, KEYS, SORTIE } from "./config.js";
import { createInput } from "./input.js";
import { createAudio } from "./audio.js";
import { createWorld, resetWorld, stepWorld } from "./world.js";
import { drawScene } from "./render.js";
import { drawHud } from "./hud.js";
import { stageShot, autopilot } from "./shots.js";

const canvas = document.getElementById("game");
if (canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = STAGE.width;
  canvas.height = STAGE.height;
  const statusEl = document.getElementById("status");
  const params = new URLSearchParams(location.search);
  const shotParam = params.get("shot");
  const seedParam = Number(params.get("seed") || 1) || 1;
  const autoParam = params.get("auto") === "1";
  const input = createInput();
  input.attach();
  const audio = createAudio();
  let seed = seedParam;
  let world = createWorld(seed);
  let screen = "title";
  let paused = false;
  let lastPhase = world.phase;
  let clicked = false;
  canvas.addEventListener("click", () => { clicked = true; });
  if (shotParam) {
    const staged = stageShot(shotParam, world);
    if (staged && staged.screen) screen = staged.screen;
    lastPhase = world.phase;
  }
  // Staged ?shot= pages are frozen frames for screenshots: the render loop
  // draws them but never advances the world, so an uncontrolled plane
  // cannot fly into a hill during the screenshot wait.
  const frozen = !!shotParam;
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function startGame() { audio.ensure(); screen = "play"; setStatus("Sortie started"); }
  function restartMission() { resetWorld(world, seed); lastPhase = world.phase; screen = "play"; setStatus("Sortie restarted"); }
  function result() {
    return { phase: world.phase, score: world.score, stage: world.stage, ringsHit: world.stats.ringsHit, ringScores: world.stats.ringScores.slice(), dropScores: world.stats.dropScores.slice(), breakdown: world.breakdown, timeLeft: world.timeLeft, elapsed: world.elapsed };
  }
  window.__atollRun = {
    get world() { return world; },
    get screen() { return screen; },
    version: "atoll-run-1",
    result,
    step(n, controls) {
      const count = Math.max(0, Math.floor(n) || 0);
      for (let i = 0; i < count; i += 1) stepWorld(world, controls || autopilot(world), STEP);
      return result();
    }
  };
  function drawTitleOverlay() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(4,12,20,0.72)";
    ctx.fillRect(0, 0, 1280, 260);
    ctx.fillStyle = "rgba(4,12,20,0.45)";
    ctx.fillRect(0, 260, 1280, 460);
    ctx.shadowBlur = 24;
    ctx.shadowColor = "#7df9ff";
    ctx.fillStyle = "#eaf7ff";
    ctx.font = "bold 64px monospace";
    ctx.fillText("ATOLL RUN", 640, 170);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#7df9ff";
    ctx.font = "20px monospace";
    ctx.fillText("ONE SORTIE, THREE MISSIONS", 640, 215);
    ctx.fillStyle = "#c8d4e8";
    ctx.font = "18px monospace";
    for (let i = 0; i < SORTIE.briefings.length; i += 1) ctx.fillText(SORTIE.briefings[i], 640, 300 + i * 40);
    ctx.fillStyle = "rgba(200,220,230,0.8)";
    ctx.font = "16px monospace";
    ctx.fillText("W/S THROTTLE   ARROWS FLY   SPACE DROP   R RESTART   M MUTE", 640, 470);
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = "#7df9ff";
      ctx.font = "20px monospace";
      ctx.fillText("PRESS ENTER OR CLICK TO FLY", 640, 540);
    }
    ctx.restore();
  }
  function anyDown(codes) { for (let i = 0; i < codes.length; i += 1) if (input.isDown(codes[i])) return true; return false; }
  function anyPressed(codes) { for (let i = 0; i < codes.length; i += 1) if (input.pressed(codes[i])) return true; return false; }
  function buildControls() {
    if (autoParam) return autopilot(world);
    const throttle = (anyDown(KEYS.throttleUp) ? 1 : 0) + (anyDown(KEYS.throttleDown) ? -1 : 0);
    const pitch = (anyDown(KEYS.pitchUp) ? 1 : 0) + (anyDown(KEYS.pitchDown) ? -1 : 0);
    const bank = (anyDown(KEYS.bankRight) ? 1 : 0) + (anyDown(KEYS.bankLeft) ? -1 : 0);
    const action = anyPressed(KEYS.action);
    return { throttle, pitch, bank, action };
  }
  function drainEvents() {
    for (let i = 0; i < world.events.length; i += 1) {
      const type = world.events[i].type;
      if (type === "ring") audio.chime();
      else if (type === "trap") audio.clunk();
      else if (type === "crash") { audio.clunk(); audio.beep(180, 0.4); }
      else if (type === "alarm") audio.alarm();
      else if (type === "drop") audio.beep(660, 0.12);
      else if (type === "win") audio.chime();
    }
    world.events.length = 0;
  }
  function handlePhaseChange() {
    if (world.phase !== lastPhase) {
      if (world.phase === "won") { screen = "won"; setStatus("Sortie complete, score " + world.score); }
      else if (world.phase === "lost") { screen = "lost"; setStatus("Sortie failed"); }
      else if (world.phase === "crashed") { screen = "crashed"; setStatus("Crashed"); }
      if (autoParam) window.__result = result();
      lastPhase = world.phase;
    }
  }
  function handleGlobalKeys() {
    if (anyPressed(KEYS.restart)) restartMission();
    if (anyPressed(KEYS.mute)) audio.setMuted(!audio.muted);
    if (anyPressed(KEYS.pause)) paused = !paused;
  }
  let lastTime = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
    lastTime = now;
    if (screen === "title") {
      if (anyPressed(["Enter", "NumpadEnter"]) || clicked) { startGame(); clicked = false; }
    } else if (screen === "play") {
      handleGlobalKeys();
      if (!paused && !frozen) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          stepWorld(world, buildControls(), STEP);
          drainEvents();
          acc -= STEP;
          steps += 1;
        }
        if (steps === 5) acc = 0;
        handlePhaseChange();
        audio.engine(world.jet.throttle, world.jet.speedMs / 180);
      }
    } else {
      handleGlobalKeys();
    }
    ctx.clearRect(0, 0, STAGE.width, STAGE.height);
    drawScene(ctx, world, { time: world.elapsed });
    const hudScreen = screen === "title" ? "title" : (world.phase === "fly" ? "play" : world.phase);
    drawHud(ctx, world, hudScreen);
    if (screen === "title") drawTitleOverlay();
    if (paused && screen === "play") {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#7df9ff";
      ctx.fillStyle = "#eaf7ff";
      ctx.font = "bold 30px monospace";
      ctx.fillText("PAUSED", 640, 360);
      ctx.restore();
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
